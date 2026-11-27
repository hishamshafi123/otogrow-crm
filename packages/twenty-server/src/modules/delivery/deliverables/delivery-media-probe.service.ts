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

const resolveBinaryCandidates = (name: 'ffprobe' | 'ffmpeg'): string[] => [
  name,
  `/opt/homebrew/bin/${name}`,
  `/usr/local/bin/${name}`,
  `/usr/bin/${name}`,
];

const execWithBinaryFallback = async (
  binaryName: 'ffprobe' | 'ffmpeg',
  args: string[],
  options: { timeout: number; maxBuffer: number },
) => {
  let lastErr: unknown;
  for (const bin of resolveBinaryCandidates(binaryName)) {
    try {
      return await execFileAsync(bin, args, options);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      lastErr = error;
      if (code === 'ENOENT') {
        continue;
      }
      throw error;
    }
  }
  throw lastErr;
};

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
}
