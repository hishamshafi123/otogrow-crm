import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { DeliveryHookRenderAdapter } from 'src/modules/delivery/deliverables/delivery-hook-render.adapter';
import { DeliveryMediaProbeService } from 'src/modules/delivery/deliverables/delivery-media-probe.service';
import {
  buildHookOverlaySvg,
  computeSafeFadeTimings,
  DEFAULT_HOOK_STYLE,
  HOOK_STYLE_PRESETS,
  resolveEffectiveHookStyle,
} from 'src/modules/delivery/deliverables/delivery-video-hooks.policy';

const execFileAsync = promisify(execFile);

describe('DeliveryVideoHooks policy & DeliveryHookRenderAdapter', () => {
  describe('policy helpers', () => {
    it('merges default style and variation overrides cleanly', () => {
      const merged = resolveEffectiveHookStyle(
        { ...HOOK_STYLE_PRESETS.AD_BOX, yPct: 26 },
        { textColor: '#FDE047', xPct: 48 },
      );
      expect(merged.preset).toBe('AD_BOX');
      expect(merged.yPct).toBe(26);
      expect(merged.xPct).toBe(48);
      expect(merged.textColor).toBe('#FDE047');
      expect(merged.uppercase).toBe(true);
    });

    it('clamps fade timings safely inside short clips', () => {
      const timing = computeSafeFadeTimings({
        startSec: 0,
        endSec: 5,
        fadeInSec: 1.5,
        fadeOutSec: 1.5,
        videoDurationSec: 2,
      });
      expect(timing.start).toBe(0);
      expect(timing.end).toBe(2);
      expect(timing.fadeIn).toBeLessThanOrEqual(0.8);
      expect(timing.fadeOut).toBeLessThanOrEqual(0.8);
      expect(timing.fadeOutStart).toBeCloseTo(timing.end - timing.fadeOut, 2);
    });

    it('escapes XML special characters in hook text and fontFamily, and keeps default maxWidthPct in TikTok safe zone', () => {
      expect(DEFAULT_HOOK_STYLE.maxWidthPct).toBe(70);
      const svg = buildHookOverlaySvg(
        1080,
        1920,
        `Stop <spending> $100 & "wasting" 'time'`,
        {
          ...DEFAULT_HOOK_STYLE,
          fontFamily: 'Black & Bold, sans-serif',
          xPct: 50,
          yPct: 22,
        },
      );
      expect(svg).toContain('width="1080" height="1920"');
      expect(svg).toContain('&lt;spending&gt;');
      expect(svg).toContain('&amp;');
      expect(svg).toContain('&quot;wasting&quot;');
      expect(svg).toContain('&#39;time&#39;');
      expect(svg).toContain('font-family="Black &amp; Bold, sans-serif"');
    });
  });

  describe('real FFmpeg zero-loss render pipeline', () => {
    let tempDir: string;
    let sourceVideoPath: string;
    let movPcmVideoPath: string;
    let ffmpegAvailable = false;

    beforeAll(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'otogrow-hook-spec-'));
      sourceVideoPath = path.join(tempDir, 'master.mp4');
      movPcmVideoPath = path.join(tempDir, 'master_pcm.mov');
      try {
        await execFileAsync(
          'ffmpeg',
          [
            '-nostdin',
            '-hide_banner',
            '-y',
            '-loglevel',
            'error',
            '-f',
            'lavfi',
            '-i',
            'testsrc2=size=720x1280:rate=30:duration=2.5',
            '-f',
            'lavfi',
            '-i',
            'sine=frequency=440:duration=2.5',
            '-c:v',
            'libx264',
            '-pix_fmt',
            'yuv420p',
            '-c:a',
            'aac',
            '-b:a',
            '128k',
            '-shortest',
            sourceVideoPath,
          ],
          { timeout: 30_000 },
        );
        await execFileAsync(
          'ffmpeg',
          [
            '-nostdin',
            '-hide_banner',
            '-y',
            '-loglevel',
            'error',
            '-f',
            'lavfi',
            '-i',
            'testsrc2=size=720x1280:rate=30:duration=1.5',
            '-f',
            'lavfi',
            '-i',
            'sine=frequency=440:duration=1.5',
            '-c:v',
            'libx264',
            '-pix_fmt',
            'yuv420p',
            '-c:a',
            'pcm_s16le',
            '-shortest',
            movPcmVideoPath,
          ],
          { timeout: 30_000 },
        );
        ffmpegAvailable = true;
      } catch {
        ffmpegAvailable = false;
      }
    }, 45_000);

    afterAll(async () => {
      if (tempDir) {
        await fs
          .rm(tempDir, { recursive: true, force: true })
          .catch(() => undefined);
      }
    });

    it(
      'renders transparent overlay PNG and preserves native resolution, fps, and AAC audio',
      async () => {
        if (!ffmpegAvailable) {
          return;
        }
        const probe = new DeliveryMediaProbeService();
        const adapter = new DeliveryHookRenderAdapter(probe);

        const overlayPngPath = path.join(tempDir, 'overlay.png');
        const outputVideoPath = path.join(tempDir, 'v1.mp4');
        const outputThumbPath = path.join(tempDir, 'v1.thumb.jpg');

        await adapter.renderSvgOverlayToPng({
          width: 720,
          height: 1280,
          hookText: 'Stop scrolling — watch this 3-second trick',
          style: {
            ...DEFAULT_HOOK_STYLE,
            ...HOOK_STYLE_PRESETS.TIKTOK_PILL,
            xPct: 50,
            yPct: 24,
          },
          outputPngPath: overlayPngPath,
        });

        const pngHeader = (await fs.readFile(overlayPngPath)).subarray(0, 4);
        expect(pngHeader.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe(
          true,
        );

        const progressUpdates: number[] = [];
        const rendered = await adapter.renderHookVariationVideo({
          inputVideoPath: sourceVideoPath,
          overlayPngPath,
          outputVideoPath,
          outputThumbnailPath: outputThumbPath,
          startSec: 0,
          endSec: 2.0,
          fadeInSec: 0.15,
          fadeOutSec: 0.2,
          onProgress: (pct) => progressUpdates.push(pct),
        });

        expect(rendered.sizeBytes).toBeGreaterThan(10_000);
        expect(rendered.mediaMeta.width).toBe(720);
        expect(rendered.mediaMeta.height).toBe(1280);
        expect(rendered.mediaMeta.videoCodec).toBe('h264');
        expect(rendered.mediaMeta.audioCodec).toBe('aac');
        expect(rendered.mediaMeta.fps).toBeCloseTo(30, 0);
        expect(rendered.mediaMeta.durationSec).toBeGreaterThan(2.0);
        expect(rendered.thumbnailCreated).toBe(true);

        const thumbStats = await fs.stat(outputThumbPath);
        expect(thumbStats.size).toBeGreaterThan(1000);

        const proxyPath = path.join(tempDir, 'proxy.mp4');
        const proxyBuf = await adapter.prepareLightweightAnalysisProxy(
          sourceVideoPath,
          proxyPath,
        );
        expect(proxyBuf.length).toBeGreaterThan(1000);
        expect(proxyBuf.length).toBeLessThanOrEqual(18 * 1024 * 1024);
        expect(proxyBuf.subarray(4, 8).toString('ascii')).toBe('ftyp');
      },
      45_000,
    );

    it(
      'transcodes non-MP4-copyable PCM audio in .mov master to AAC cleanly',
      async () => {
        if (!ffmpegAvailable) {
          return;
        }
        const probe = new DeliveryMediaProbeService();
        const adapter = new DeliveryHookRenderAdapter(probe);

        const overlayPngPath = path.join(tempDir, 'overlay_pcm.png');
        const outputVideoPath = path.join(tempDir, 'v_pcm.mp4');
        const outputThumbPath = path.join(tempDir, 'v_pcm.thumb.jpg');

        await adapter.renderSvgOverlayToPng({
          width: 720,
          height: 1280,
          hookText: 'MOV PCM Audio Test',
          style: DEFAULT_HOOK_STYLE,
          outputPngPath: overlayPngPath,
        });

        const rendered = await adapter.renderHookVariationVideo({
          inputVideoPath: movPcmVideoPath,
          overlayPngPath,
          outputVideoPath,
          outputThumbnailPath: outputThumbPath,
          startSec: 0,
          endSec: 1.2,
          fadeInSec: 0.1,
          fadeOutSec: 0.1,
        });

        expect(rendered.sizeBytes).toBeGreaterThan(10_000);
        expect(rendered.mediaMeta.videoCodec).toBe('h264');
        expect(rendered.mediaMeta.audioCodec).toBe('aac');
        expect(rendered.mediaMeta.width).toBe(720);
        expect(rendered.mediaMeta.height).toBe(1280);
      },
      45_000,
    );
  });
});
