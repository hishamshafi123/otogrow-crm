import { Injectable, Logger } from '@nestjs/common';
import { execFile, spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import { promisify } from 'node:util';
import { type DeliverableMediaMeta } from 'src/modules/delivery/deliverables/entities/delivery-deliverable.entity';
import { type HookStyleConfig } from 'src/modules/delivery/deliverables/entities/delivery-video-hook-project.entity';
import {
  DeliveryMediaProbeService,
  execMediaBinaryWithFallback,
  resolveFirstAvailableMediaBinary,
} from 'src/modules/delivery/deliverables/delivery-media-probe.service';
import {
  buildHookOverlaySvg,
  computeSafeFadeTimings,
} from 'src/modules/delivery/deliverables/delivery-video-hooks.policy';

const execFileAsync = promisify(execFile);

const MAX_RENDER_TIMEOUT_MS = 9 * 60 * 1000; // 9 minutes (fits inside 10m BullMQ lockDuration)
const MAX_PROXY_BYTES = 18 * 1024 * 1024; // 18 MiB proxy ceiling for Gemini multimodal analysis

type SharpFactory = (input: Buffer) => {
  png: () => { toFile: (outputPath: string) => Promise<unknown> };
};

@Injectable()
export class DeliveryHookRenderAdapter {
  private readonly logger = new Logger(DeliveryHookRenderAdapter.name);

  constructor(private readonly probe: DeliveryMediaProbeService) {}

  async renderSvgOverlayToPng(params: {
    width: number;
    height: number;
    hookText: string;
    style: HookStyleConfig;
    outputPngPath: string;
  }): Promise<void> {
    const svg = buildHookOverlaySvg(
      params.width,
      params.height,
      params.hookText,
      params.style,
    );

    // Tier 1: rsvg-convert (pre-installed in production Alpine container via librsvg + font-noto)
    try {
      const svgPath = `${params.outputPngPath}.svg`;
      await fs.writeFile(svgPath, svg, 'utf8');
      try {
        await execFileAsync(
          'rsvg-convert',
          [
            '-w',
            String(Math.round(params.width)),
            '-h',
            String(Math.round(params.height)),
            '-o',
            params.outputPngPath,
            svgPath,
          ],
          { timeout: 30_000, maxBuffer: 2 * 1024 * 1024 },
        );
        const stats = await fs.stat(params.outputPngPath).catch(() => null);
        if (stats && stats.size > 0) {
          return;
        }
      } finally {
        await fs.rm(svgPath, { force: true }).catch(() => undefined);
      }
    } catch {
      // Fall through to sharp fallback (common on macOS dev environments)
    }

    // Tier 2: sharp (libvips + librsvg in Node workspace)
    try {
      // Dynamic require so production server builds don't fail if sharp isn't hoisted
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const sharp = require('sharp') as SharpFactory;
      await sharp(Buffer.from(svg, 'utf8')).png().toFile(params.outputPngPath);
      const stats = await fs.stat(params.outputPngPath).catch(() => null);
      if (stats && stats.size > 0) {
        return;
      }
    } catch (error) {
      this.logger.warn(
        `SVG->PNG fallback failed (rsvg-convert & sharp unavailable): ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    throw new Error(
      'No SVG-to-PNG renderer available on this host. Upload the canvas overlay PNG from the Text-Hook Studio or install librsvg.',
    );
  }

  async renderHookVariationVideo(params: {
    inputVideoPath: string;
    overlayPngPath: string;
    outputVideoPath: string;
    outputThumbnailPath: string;
    startSec: number;
    endSec: number;
    fadeInSec: number;
    fadeOutSec: number;
    mediaMeta?: DeliverableMediaMeta;
    onProgress?: (percent: number) => void;
  }): Promise<{
    sizeBytes: number;
    mediaMeta: DeliverableMediaMeta;
    thumbnailCreated: boolean;
  }> {
    const sourceMeta =
      params.mediaMeta?.width && params.mediaMeta?.height
        ? params.mediaMeta
        : await this.probe.probeMedia(params.inputVideoPath);

    const width = sourceMeta.width ?? 1080;
    const height = sourceMeta.height ?? 1920;
    const durationSec = sourceMeta.durationSec ?? 0;

    const timing = computeSafeFadeTimings({
      startSec: params.startSec,
      endSec: params.endSec,
      fadeInSec: params.fadeInSec,
      fadeOutSec: params.fadeOutSec,
      videoDurationSec: durationSec > 0 ? durationSec : undefined,
    });

    // Build fade filter chain on the transparent RGBA PNG overlay so it fades smoothly in & out without touching video fidelity
    const overlayFilters: string[] = [
      `scale=${width}:${height}:flags=lanczos`,
      'format=rgba',
    ];
    if (timing.fadeIn > 0.01) {
      overlayFilters.push(
        `fade=t=in:st=${timing.start}:d=${timing.fadeIn}:alpha=1`,
      );
    }
    if (timing.fadeOut > 0.01) {
      overlayFilters.push(
        `fade=t=out:st=${timing.fadeOutStart}:d=${timing.fadeOut}:alpha=1`,
      );
    }

    const filterComplex = `[1:v]${overlayFilters.join(',')}[ov];[0:v][ov]overlay=0:0:enable='between(t,${timing.start},${timing.end})':shortest=1[v]`;

    const colorArgs: string[] = [];
    if (sourceMeta.colorPrimaries === 'bt709') {
      colorArgs.push('-color_primaries', 'bt709');
    }
    if (sourceMeta.colorTransfer === 'bt709') {
      colorArgs.push('-color_trc', 'bt709');
    }
    if (sourceMeta.colorSpace === 'bt709') {
      colorArgs.push('-colorspace', 'bt709');
    }

    const hasAudio = Boolean(sourceMeta.audioCodec);
    const audioCodecLower = (sourceMeta.audioCodec ?? '').toLowerCase();
    const mp4CopyableAudio = new Set(['aac', 'mp3', 'ac3', 'eac3', 'alac']);
    const audioArgs = !hasAudio
      ? ['-an']
      : mp4CopyableAudio.has(audioCodecLower)
        ? ['-map', '0:a:0?', '-c:a', 'copy']
        : ['-map', '0:a:0?', '-c:a', 'aac', '-b:a', '192k'];

    const args: string[] = [
      '-nostdin',
      '-hide_banner',
      '-y',
      '-loglevel',
      'error',
      '-progress',
      'pipe:1',
      '-i',
      params.inputVideoPath,
      '-loop',
      '1',
      '-i',
      params.overlayPngPath,
      '-filter_complex',
      filterComplex,
      '-map',
      '[v]',
      ...audioArgs,
      '-c:v',
      'libx264',
      '-crf',
      '15',
      '-preset',
      'slow',
      '-profile:v',
      'high',
      '-pix_fmt',
      'yuv420p',
      ...colorArgs,
      '-movflags',
      '+faststart',
      params.outputVideoPath,
    ];

    await this.runFfmpegWithProgress(args, durationSec, params.onProgress);

    const outStats = await fs.stat(params.outputVideoPath);
    if (!outStats || outStats.size <= 0) {
      throw new Error('FFmpeg produced an empty rendered video file.');
    }

    const outputMediaMeta = await this.probe.probeMedia(params.outputVideoPath);

    // Extract thumbnail mid-hook so managers & clients immediately see the hook on the video card!
    const thumbSeekSec = Math.min(
      Math.max(timing.start + (timing.end - timing.start) * 0.45, 0.2),
      Math.max(0.2, (outputMediaMeta.durationSec ?? durationSec ?? 1) - 0.1),
    );
    const thumbnailCreated = await this.extractHookFrameThumbnail(
      params.outputVideoPath,
      params.outputThumbnailPath,
      thumbSeekSec,
    );

    return {
      sizeBytes: outStats.size,
      mediaMeta: outputMediaMeta,
      thumbnailCreated,
    };
  }

  private async extractHookFrameThumbnail(
    videoPath: string,
    outputJpegPath: string,
    seekSec: number,
  ): Promise<boolean> {
    try {
      await execMediaBinaryWithFallback(
        'ffmpeg',
        [
          '-nostdin',
          '-hide_banner',
          '-y',
          '-loglevel',
          'error',
          '-ss',
          seekSec.toFixed(2),
          '-i',
          videoPath,
          '-vframes',
          '1',
          '-vf',
          'scale=640:-2',
          '-q:v',
          '3',
          outputJpegPath,
        ],
        { timeout: 30_000, maxBuffer: 1024 * 1024 },
      );
      const stats = await fs.stat(outputJpegPath).catch(() => null);
      return Boolean(stats && stats.size > 0);
    } catch {
      return false;
    }
  }

  async prepareLightweightAnalysisProxy(
    inputVideoPath: string,
    outputProxyPath: string,
  ): Promise<Buffer> {
    // Transcode up to the first 60s into a compact 480p proxy for fast, low-cost Gemini video understanding.
    await execMediaBinaryWithFallback(
      'ffmpeg',
      [
        '-nostdin',
        '-hide_banner',
        '-y',
        '-loglevel',
        'error',
        '-t',
        '60',
        '-i',
        inputVideoPath,
        '-vf',
        'scale=480:480:force_original_aspect_ratio=decrease:force_divisible_by=2,fps=15',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '28',
        '-maxrate',
        '450k',
        '-bufsize',
        '900k',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-ac',
        '1',
        '-b:a',
        '48k',
        '-movflags',
        '+faststart',
        '-fs',
        String(MAX_PROXY_BYTES),
        outputProxyPath,
      ],
      { timeout: 120_000, maxBuffer: 2 * 1024 * 1024 },
    );

    const stats = await fs.stat(outputProxyPath);
    if (!stats || stats.size <= 0 || stats.size > MAX_PROXY_BYTES) {
      throw new Error('Could not build bounded analysis proxy for video.');
    }
    return fs.readFile(outputProxyPath);
  }

  private async runFfmpegWithProgress(
    args: string[],
    durationSec: number,
    onProgress?: (percent: number) => void,
  ): Promise<void> {
    const ffmpegBin = await resolveFirstAvailableMediaBinary('ffmpeg');
    return new Promise((resolve, reject) => {
      const child = spawn(ffmpegBin, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stderr = '';
      let lastReported = 5;
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('FFmpeg render timed out after 9 minutes.'));
      }, MAX_RENDER_TIMEOUT_MS);

      child.stdout.on('data', (chunk: Buffer) => {
        if (!onProgress || durationSec <= 0) return;
        const text = chunk.toString('utf8');
        const match = text.match(/out_time_us=(\d+)/);
        if (!match) return;
        const outSec = Number(match[1]) / 1_000_000;
        if (!Number.isFinite(outSec)) return;
        const pct = Math.min(
          95,
          Math.max(10, Math.round((outSec / durationSec) * 90) + 5),
        );
        if (pct >= lastReported + 10) {
          lastReported = pct;
          onProgress(pct);
        }
      });

      child.stderr.on('data', (chunk: Buffer) => {
        if (stderr.length < 4000) {
          stderr += chunk.toString('utf8');
        }
      });

      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(
              `FFmpeg exited with code ${code ?? 'unknown'}: ${stderr.trim().slice(0, 400)}`,
            ),
          );
        }
      });
    });
  }
}
