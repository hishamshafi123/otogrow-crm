import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import { promisify } from 'node:util';
import { type DeliverableMediaMeta } from 'src/modules/delivery/deliverables/entities/delivery-deliverable.entity';

const execFileAsync = promisify(execFile);

const parseFrameRate = (raw: string | undefined): number | undefined => {
  if (!raw || raw === '0/0') return undefined;
  const parts = raw.split('/');
  if (parts.length === 2) {
    const num = Number(parts[0]);
    const den = Number(parts[1]);
    if (Number.isFinite(num) && Number.isFinite(den) && den > 0) {
      return Math.round((num / den) * 100) / 100;
    }
    return undefined;
  }
  const value = Number(raw);
  return Number.isFinite(value) && value > 0
    ? Math.round(value * 100) / 100
    : undefined;
};

type FfprobeStream = {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  avg_frame_rate?: string;
  pix_fmt?: string;
  color_space?: string;
  color_transfer?: string;
  color_primaries?: string;
  bit_rate?: string;
  duration?: string;
  tags?: { rotate?: string };
  side_data_list?: { rotation?: number }[];
};

type FfprobeOutput = {
  streams?: FfprobeStream[];
  format?: {
    duration?: string;
    bit_rate?: string;
  };
};

const resolveBundledBinaryPath = (name: 'ffprobe' | 'ffmpeg'): string | null => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkg =
      name === 'ffmpeg'
        ? (require('@ffmpeg-installer/ffmpeg') as { path?: string })
        : (require('@ffprobe-installer/ffprobe') as { path?: string });
    return typeof pkg?.path === 'string' && pkg.path.trim()
      ? pkg.path.trim()
      : null;
  } catch {
    return null;
  }
};

export const resolveMediaBinaryCandidates = (
  name: 'ffprobe' | 'ffmpeg',
): string[] => {
  const envOverride =
    name === 'ffmpeg'
      ? process.env.FFMPEG_PATH?.trim()
      : process.env.FFPROBE_PATH?.trim();
  const bundled = resolveBundledBinaryPath(name);
  const candidates = [
    envOverride || null,
    name,
    `/opt/homebrew/bin/${name}`,
    `/usr/local/bin/${name}`,
    `/usr/bin/${name}`,
    bundled,
  ].filter((item): item is string => Boolean(item));
  return Array.from(new Set(candidates));
};

export const execMediaBinaryWithFallback = async (
  binaryName: 'ffprobe' | 'ffmpeg',
  args: string[],
  options: { timeout: number; maxBuffer: number },
) => {
  let lastErr: unknown;
  for (const bin of resolveMediaBinaryCandidates(binaryName)) {
    try {
      return await execFileAsync(bin, args, options);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      lastErr = error;
      if (code === 'ENOENT' || code === 'EACCES') {
        continue;
      }
      throw error;
    }
  }
  throw lastErr;
};

export const resolveFirstAvailableMediaBinary = async (
  binaryName: 'ffprobe' | 'ffmpeg',
): Promise<string> => {
  const candidates = resolveMediaBinaryCandidates(binaryName);
  for (const bin of candidates) {
    try {
      await execFileAsync(bin, ['-version'], {
        timeout: 5_000,
        maxBuffer: 256 * 1024,
      });
      return bin;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code === 'ENOENT' || code === 'EACCES') {
        continue;
      }
      return bin;
    }
  }
  return candidates[0] ?? binaryName;
};

const execWithBinaryFallback = execMediaBinaryWithFallback;

/**
 * Pure-JS fallback parser for MP4/MOV container duration via the ISO-BMFF `moov -> mvhd` atom.
 * Works even in minimal containers without `ffprobe`.
 */
export const parseMp4DurationSecFromBuffer = (buf: Buffer): number | undefined => {
  const findBox = (
    start: number,
    end: number,
    targetType: string,
  ): { dataStart: number; boxEnd: number } | null => {
    let offset = start;
    while (offset + 8 <= end) {
      const size32 = buf.readUInt32BE(offset);
      const type = buf.toString('ascii', offset + 4, offset + 8);
      let boxSize = size32;
      let headerSize = 8;
      if (size32 === 1 && offset + 16 <= end) {
        const hi = buf.readUInt32BE(offset + 8);
        const lo = buf.readUInt32BE(offset + 12);
        boxSize = hi * 4294967296 + lo;
        headerSize = 16;
      } else if (size32 === 0) {
        boxSize = end - offset;
      }
      if (!Number.isFinite(boxSize) || boxSize < headerSize) return null;
      const boxEnd = Math.min(end, offset + boxSize);
      if (type === targetType) {
        return { dataStart: offset + headerSize, boxEnd };
      }
      offset = boxEnd;
    }
    return null;
  };

  const moov = findBox(0, buf.length, 'moov');
  if (!moov) return undefined;
  const mvhd = findBox(moov.dataStart, moov.boxEnd, 'mvhd');
  if (!mvhd || mvhd.dataStart + 20 > mvhd.boxEnd) return undefined;

  const version = buf.readUInt8(mvhd.dataStart);
  if (version === 1) {
    if (mvhd.dataStart + 32 > mvhd.boxEnd) return undefined;
    const timescale = buf.readUInt32BE(mvhd.dataStart + 20);
    const durHi = buf.readUInt32BE(mvhd.dataStart + 24);
    const durLo = buf.readUInt32BE(mvhd.dataStart + 28);
    const duration = durHi * 4294967296 + durLo;
    if (timescale > 0 && duration > 0) {
      return Math.round((duration / timescale) * 100) / 100;
    }
    return undefined;
  }

  const timescale = buf.readUInt32BE(mvhd.dataStart + 12);
  const duration = buf.readUInt32BE(mvhd.dataStart + 16);
  if (timescale > 0 && duration > 0) {
    return Math.round((duration / timescale) * 100) / 100;
  }
  return undefined;
};

@Injectable()
export class DeliveryMediaProbeService {
  private readonly logger = new Logger(DeliveryMediaProbeService.name);

  async probeMedia(filePath: string): Promise<DeliverableMediaMeta> {
    try {
      const { stdout } = await execWithBinaryFallback(
        'ffprobe',
        [
          '-v',
          'error',
          '-print_format',
          'json',
          '-show_format',
          '-show_streams',
          filePath,
        ],
        { timeout: 30_000, maxBuffer: 2 * 1024 * 1024 },
      );
      const parsed = JSON.parse(stdout) as FfprobeOutput;
      const streams = parsed.streams ?? [];
      const video = streams.find((stream) => stream.codec_type === 'video');
      const audio = streams.find((stream) => stream.codec_type === 'audio');

      let width = typeof video?.width === 'number' ? video.width : undefined;
      let height = typeof video?.height === 'number' ? video.height : undefined;

      // Respect display rotation metadata (common on vertical iPhone/CapCut MOV/MP4 files)
      const rotationTag = Number(video?.tags?.rotate ?? 0);
      const sideRotation = video?.side_data_list?.find(
        (item) => typeof item.rotation === 'number',
      )?.rotation;
      const rotation = Math.abs(
        Number.isFinite(sideRotation) ? (sideRotation as number) : rotationTag,
      );
      if ((rotation === 90 || rotation === 270) && width && height) {
        [width, height] = [height, width];
      }

      const formatDuration = parsed.format?.duration
        ? Number(parsed.format.duration)
        : NaN;
      const videoDuration = video?.duration ? Number(video.duration) : NaN;
      const durationParsed =
        Number.isFinite(formatDuration) && formatDuration > 0
          ? formatDuration
          : Number.isFinite(videoDuration) && videoDuration > 0
            ? videoDuration
            : NaN;
      const bitrateRaw = parsed.format?.bit_rate ?? video?.bit_rate;
      const bitrateParsed = bitrateRaw ? Number(bitrateRaw) : NaN;

      let durationSec =
        Number.isFinite(durationParsed) && durationParsed > 0
          ? Math.round(durationParsed * 100) / 100
          : undefined;

      if (durationSec === undefined) {
        const bytes = await fs.readFile(filePath).catch(() => null);
        if (bytes) {
          durationSec = parseMp4DurationSecFromBuffer(bytes);
        }
      }

      return {
        width,
        height,
        fps:
          parseFrameRate(video?.avg_frame_rate) ??
          parseFrameRate(video?.r_frame_rate),
        durationSec,
        videoCodec: video?.codec_name,
        audioCodec: audio?.codec_name ?? null,
        bitrate:
          Number.isFinite(bitrateParsed) && bitrateParsed > 0
            ? Math.round(bitrateParsed)
            : undefined,
        colorSpace: video?.color_space ?? null,
        colorTransfer: video?.color_transfer ?? null,
        colorPrimaries: video?.color_primaries ?? null,
        pixFmt: video?.pix_fmt ?? null,
      };
    } catch (error) {
      this.logger.warn(
        `ffprobe failed for ${filePath}: ${(error as Error).message}`,
      );
      const bytes = await fs.readFile(filePath).catch(() => null);
      const fallbackDuration = bytes
        ? parseMp4DurationSecFromBuffer(bytes)
        : undefined;
      return fallbackDuration ? { durationSec: fallbackDuration } : {};
    }
  }

  async extractVideoThumbnail(
    videoFilePath: string,
    outputJpegPath: string,
    durationSec?: number,
  ): Promise<boolean> {
    const seekSec =
      typeof durationSec === 'number' && durationSec > 0
        ? Math.min(0.5, Math.max(0, durationSec / 3))
        : 0.25;
    try {
      await execWithBinaryFallback(
        'ffmpeg',
        [
          '-y',
          '-hide_banner',
          '-loglevel',
          'error',
          '-ss',
          seekSec.toFixed(2),
          '-i',
          videoFilePath,
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
      if (!stats || stats.size <= 0) {
        await fs.rm(outputJpegPath, { force: true }).catch(() => undefined);
        return false;
      }
      return true;
    } catch (error) {
      await fs.rm(outputJpegPath, { force: true }).catch(() => undefined);
      this.logger.warn(
        `ffmpeg thumbnail extraction failed for ${videoFilePath}: ${(error as Error).message}`,
      );
      return false;
    }
  }

  async trimVideo(
    inputFilePath: string,
    outputMp4Path: string,
    startSec: number,
    durationSec: number,
  ): Promise<void> {
    const safeStart = Math.max(0, startSec);
    const safeDuration = Math.max(0.25, durationSec);

    try {
      await execWithBinaryFallback(
        'ffmpeg',
        [
          '-y',
          '-hide_banner',
          '-loglevel',
          'error',
          '-ss',
          safeStart.toFixed(3),
          '-i',
          inputFilePath,
          '-t',
          safeDuration.toFixed(3),
          '-map',
          '0:v:0',
          '-map',
          '0:a?',
          '-vf',
          'scale=trunc(iw/2)*2:trunc(ih/2)*2',
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '18',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-b:a',
          '128k',
          '-movflags',
          '+faststart',
          outputMp4Path,
        ],
        { timeout: 120_000, maxBuffer: 2 * 1024 * 1024 },
      );

      const stats = await fs.stat(outputMp4Path).catch(() => null);
      if (!stats || stats.size <= 0) {
        throw new Error('Trimmed video output file was empty.');
      }
    } catch (error) {
      await fs.rm(outputMp4Path, { force: true }).catch(() => undefined);
      this.logger.warn(
        `ffmpeg trim failed for ${inputFilePath}: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  async composeVideos(
    clips: VideoComposeClipInput[],
    outputMp4Path: string,
    options?: VideoComposeOptions,
  ): Promise<void> {
    if (clips.length === 0) {
      throw new Error('At least one video clip is required to compose.');
    }
    if (clips.length > 8) {
      throw new Error('Maximum of 8 clips can be stitched in a single cut.');
    }

    const { width: targetW, height: targetH } = resolveEvenCanvasDimensions(
      options?.targetWidth,
      options?.targetHeight,
    );
    const fps =
      typeof options?.fps === 'number' &&
      Number.isFinite(options.fps) &&
      options.fps >= 12 &&
      options.fps <= 60
        ? Math.round(options.fps)
        : 30;
    const hasAnyAudio = clips.some((c) => c.hasAudio && !c.muted);

    const args: string[] = ['-y', '-hide_banner', '-loglevel', 'error'];
    const filterParts: string[] = [];
    const concatInputs: string[] = [];

    clips.forEach((clip, idx) => {
      const safeStart =
        typeof clip.startSec === 'number' &&
        Number.isFinite(clip.startSec) &&
        clip.startSec > 0.01
          ? clip.startSec
          : 0;
      const safeDur =
        typeof clip.durationSec === 'number' &&
        Number.isFinite(clip.durationSec) &&
        clip.durationSec >= 0.25
          ? clip.durationSec
          : undefined;

      if (safeStart > 0) {
        args.push('-ss', safeStart.toFixed(3));
      }
      if (safeDur !== undefined) {
        args.push('-t', safeDur.toFixed(3));
      }
      args.push('-i', clip.filePath);

      filterParts.push(
        `[${idx}:v:0]scale=${targetW}:${targetH}:force_original_aspect_ratio=increase,crop=${targetW}:${targetH},fps=${fps},setsar=1,format=yuv420p,setpts=PTS-STARTPTS[v${idx}]`,
      );

      if (hasAnyAudio) {
        if (clip.hasAudio && !clip.muted) {
          filterParts.push(
            `[${idx}:a:0]aformat=sample_rates=48000:channel_layouts=stereo,asetpts=PTS-STARTPTS[a${idx}]`,
          );
        } else {
          const silenceDur = Math.max(0.25, safeDur ?? 1);
          filterParts.push(
            `anullsrc=channel_layout=stereo:sample_rate=48000,atrim=0:${silenceDur.toFixed(3)},asetpts=PTS-STARTPTS[a${idx}]`,
          );
        }
        concatInputs.push(`[v${idx}][a${idx}]`);
      } else {
        concatInputs.push(`[v${idx}]`);
      }
    });

    if (clips.length === 1) {
      args.push('-filter_complex', filterParts.join(';'));
      args.push('-map', '[v0]');
      if (hasAnyAudio) {
        args.push('-map', '[a0]');
      }
    } else {
      filterParts.push(
        `${concatInputs.join('')}concat=n=${clips.length}:v=1:a=${hasAnyAudio ? 1 : 0}[vout]${hasAnyAudio ? '[aout]' : ''}`,
      );
      args.push('-filter_complex', filterParts.join(';'));
      args.push('-map', '[vout]');
      if (hasAnyAudio) {
        args.push('-map', '[aout]');
      }
    }

    args.push(
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '18',
      '-pix_fmt',
      'yuv420p',
    );
    if (hasAnyAudio) {
      args.push('-c:a', 'aac', '-b:a', '128k');
    } else {
      args.push('-an');
    }
    args.push('-movflags', '+faststart', outputMp4Path);

    try {
      await execWithBinaryFallback('ffmpeg', args, {
        timeout: 180_000,
        maxBuffer: 4 * 1024 * 1024,
      });

      const stats = await fs.stat(outputMp4Path).catch(() => null);
      if (!stats || stats.size <= 0) {
        throw new Error('Composed video output file was empty.');
      }
    } catch (error) {
      await fs.rm(outputMp4Path, { force: true }).catch(() => undefined);
      this.logger.warn(
        `ffmpeg compose failed (${clips.length} clip(s)): ${(error as Error).message}`,
      );
      throw error;
    }
  }
}

export type VideoComposeClipInput = {
  filePath: string;
  startSec?: number;
  durationSec?: number;
  hasAudio: boolean;
  muted?: boolean;
};

export type VideoComposeOptions = {
  targetWidth?: number;
  targetHeight?: number;
  fps?: number;
};

export const resolveEvenCanvasDimensions = (
  rawWidth?: number,
  rawHeight?: number,
): { width: number; height: number } => {
  const validW =
    typeof rawWidth === 'number' && Number.isFinite(rawWidth) && rawWidth >= 64
      ? rawWidth
      : undefined;
  const validH =
    typeof rawHeight === 'number' &&
    Number.isFinite(rawHeight) &&
    rawHeight >= 64
      ? rawHeight
      : undefined;

  let width = validW ?? 1080;
  let height = validH ?? 1920;

  // Cap ultra-high-res inputs (e.g. 4K iPhone footage) to 1920px on the long edge
  const maxLongEdge = 1920;
  const longEdge = Math.max(width, height);
  if (longEdge > maxLongEdge) {
    const scale = maxLongEdge / longEdge;
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  return {
    width: Math.max(2, Math.floor(width / 2) * 2),
    height: Math.max(2, Math.floor(height / 2) * 2),
  };
};

export type NormalizedTrimRange = {
  shouldTrim: boolean;
  startSec: number;
  endSec: number;
  durationSec: number;
};

export const normalizeTrimRange = (input: {
  trimStartSec?: number;
  trimEndSec?: number;
  originalDurationSec?: number;
}): NormalizedTrimRange | null => {
  const hasStart =
    typeof input.trimStartSec === 'number' &&
    Number.isFinite(input.trimStartSec);
  const hasEnd =
    typeof input.trimEndSec === 'number' && Number.isFinite(input.trimEndSec);

  if (!hasStart && !hasEnd) {
    return null;
  }

  const origDur =
    typeof input.originalDurationSec === 'number' &&
    Number.isFinite(input.originalDurationSec) &&
    input.originalDurationSec > 0
      ? input.originalDurationSec
      : undefined;

  const rawStart = hasStart ? Math.max(0, input.trimStartSec as number) : 0;
  const rawEnd = hasEnd ? (input.trimEndSec as number) : origDur;

  if (rawEnd === undefined || !Number.isFinite(rawEnd) || rawEnd <= 0) {
    return null;
  }

  const endSec = origDur !== undefined ? Math.min(origDur, rawEnd) : rawEnd;
  const startSec = Math.max(0, Math.min(rawStart, endSec));
  const durationSec = Math.round((endSec - startSec) * 1000) / 1000;

  const coversStart = startSec <= 0.05;
  const coversEnd = origDur !== undefined && endSec >= origDur - 0.05;
  const shouldTrim = !(coversStart && coversEnd);

  return {
    shouldTrim,
    startSec: Math.round(startSec * 1000) / 1000,
    endSec: Math.round(endSec * 1000) / 1000,
    durationSec,
  };
};

