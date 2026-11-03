import { BadRequestException, Injectable } from '@nestjs/common';
import { execFile } from 'node:child_process';
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import { videoQaBytesHash } from './delivery-video-qa.policy';
import {
  type VideoQaPreparation,
  type VideoQaTechnicalFinding,
  VIDEO_QA_MAX_DURATION_MS,
  VIDEO_QA_MAX_FRAME_BYTES,
  VIDEO_QA_MAX_PROXY_BYTES,
  VIDEO_QA_MAX_SOURCE_BYTES,
  VIDEO_QA_PIPELINE_VERSION,
} from './delivery-video-qa.types';

const execute = promisify(execFile);
const probeSchema = z.object({
  format: z.object({ duration: z.string() }),
  streams: z
    .array(
      z.object({
        codec_type: z.string(),
        width: z.number().int().optional(),
        height: z.number().int().optional(),
        channels: z.number().int().optional(),
      }),
    )
    .max(10),
});
const inputArguments = [
  '-protocol_whitelist',
  'file,pipe',
  '-format_whitelist',
  'mov,matroska,webm',
];
const commandArguments = [
  '-nostdin',
  '-hide_banner',
  '-y',
  '-threads',
  '2',
  '-filter_threads',
  '1',
  '-xerror',
];
export const videoQaTechnicalFindings = (
  log: string,
  durationMs: number,
  hasAudio: boolean,
): VideoQaTechnicalFinding[] => {
  const findings: VideoQaTechnicalFinding[] = [];
  const milliseconds = (value: string) =>
    Math.min(durationMs, Math.max(0, Math.round(Number(value) * 1000)));
  for (const match of log.matchAll(
    /black_start:([\d.]+) black_end:([\d.]+) black_duration:([\d.]+)/g,
  ))
    findings.push({
      code: 'BLACK_INTERVAL',
      startMs: milliseconds(match[1]),
      endMs: milliseconds(match[2]),
      evidence:
        'FFmpeg detected a dark interval. This may be an intentional transition; inspect the exact video.',
    });
  for (const [startKey, endKey, code] of [
    ['freeze_start', 'freeze_end', 'FROZEN_INTERVAL'],
    ['silence_start', 'silence_end', 'SILENT_INTERVAL'],
  ] as const) {
    let start: number | null = null;
    const pattern = new RegExp(`(?:${startKey}|${endKey}):\\s*([\\d.]+)`, 'g');
    for (const match of log.matchAll(pattern)) {
      if (match[0].startsWith(startKey)) start = milliseconds(match[1]);
      else if (start !== null) {
        findings.push({
          code,
          startMs: start,
          endMs: milliseconds(match[1]),
          evidence:
            code === 'FROZEN_INTERVAL'
              ? 'FFmpeg detected repeated visual content. A deliberate static shot can produce this observation.'
              : 'FFmpeg detected an interval below -45 dB. This is a level observation, not proof that expected speech is missing.',
        });
        start = null;
      }
    }
    if (start !== null)
      findings.push({
        code,
        startMs: start,
        endMs: durationMs,
        evidence:
          'The detected interval continued to the end of the decoded video; inspect whether it is intentional.',
      });
  }
  if (!hasAudio)
    findings.push({
      code: 'NO_AUDIO',
      startMs: 0,
      endMs: durationMs,
      evidence:
        'The source has no audio stream. No speech or sound was inspected.',
    });
  const peaks = [...log.matchAll(/Peak level dB:\s*(-?[\d.]+)/g)].map((match) =>
    Number(match[1]),
  );
  if (peaks.some((peak) => peak >= -0.1))
    findings.push({
      code: 'PEAK_LEVEL',
      startMs: 0,
      endMs: durationMs,
      evidence:
        'Audio peak reached within0.1 dB of full scale. This does not by itself prove clipping or poor sound.',
    });
  return findings;
};

@Injectable()
export class DeliveryVideoQaAdapter {
  async prepare(source: Buffer) {
    if (!source.length || source.length > VIDEO_QA_MAX_SOURCE_BYTES)
      throw new BadRequestException('Choose a video under100 MiB.');
    const directory = await mkdtemp(join(tmpdir(), 'otogrow-video-qa-'));
    try {
      const input = join(directory, 'source');
      const output = join(directory, 'proxy.mp4');
      await writeFile(input, source, { mode: 0o600 });
      const probe = await execute(
        'ffprobe',
        [
          '-v',
          'error',
          ...inputArguments,
          '-show_format',
          '-show_streams',
          '-of',
          'json',
          input,
        ],
        { timeout: 15000, maxBuffer: 1000000 },
      );
      const metadata = probeSchema.parse(JSON.parse(probe.stdout));
      const video = metadata.streams.filter(
        (stream) => stream.codec_type === 'video',
      );
      const audio = metadata.streams.filter(
        (stream) => stream.codec_type === 'audio',
      );
      const durationMs = Math.round(Number(metadata.format.duration) * 1000);
      if (
        video.length !== 1 ||
        audio.length > 1 ||
        !Number.isSafeInteger(durationMs) ||
        durationMs < 1000 ||
        durationMs > VIDEO_QA_MAX_DURATION_MS ||
        !video[0].width ||
        !video[0].height ||
        video[0].width > 7680 ||
        video[0].height > 7680
      )
        throw new BadRequestException(
          'Video QA supports one video stream, at most one audio stream and a complete duration of1–120 seconds. Choose a supported short video; no segment was omitted.',
        );
      const visualFilter =
        'scale=720:720:force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1,blackdetect=d=0.2:pix_th=0.10,freezedetect=n=-60dB:d=0.5';
      const normalized = await execute(
        'ffmpeg',
        [
          ...commandArguments,
          '-loglevel',
          'info',
          ...inputArguments,
          '-err_detect',
          'explode',
          '-i',
          input,
          '-map',
          '0:v:0',
          ...(audio.length
            ? [
                '-map',
                '0:a:0',
                '-af',
                'silencedetect=n=-45dB:d=0.25,astats=metadata=0:reset=0',
                '-c:a',
                'aac',
                '-ac',
                '1',
                '-b:a',
                '64k',
              ]
            : ['-an']),
          '-vf',
          visualFilter,
          '-c:v',
          'libx264',
          '-threads',
          '2',
          '-preset',
          'veryfast',
          '-crf',
          '23',
          '-maxrate',
          '650k',
          '-bufsize',
          '1300k',
          '-pix_fmt',
          'yuv420p',
          '-map_metadata',
          '-1',
          '-movflags',
          '+faststart',
          '-fs',
          String(VIDEO_QA_MAX_PROXY_BYTES),
          output,
        ],
        { timeout: 180000, maxBuffer: 1000000 },
      );
      if ((await stat(output)).size >= VIDEO_QA_MAX_PROXY_BYTES)
        throw new BadRequestException(
          'Video exceeds the bounded QA proxy size. Use a shorter source; no truncated output was analyzed.',
        );
      const proxyProbe = await execute(
        'ffprobe',
        [
          '-v',
          'error',
          ...inputArguments,
          '-show_format',
          '-show_streams',
          '-of',
          'json',
          output,
        ],
        { timeout: 15000, maxBuffer: 1000000 },
      );
      const proxyMetadata = probeSchema.parse(JSON.parse(proxyProbe.stdout));
      if (
        Math.abs(Number(proxyMetadata.format.duration) * 1000 - durationMs) >
        150
      )
        throw new BadRequestException(
          'The complete video could not be prepared without changing its duration.',
        );
      await execute(
        'ffmpeg',
        [
          ...commandArguments,
          '-loglevel',
          'error',
          ...inputArguments,
          '-i',
          output,
          '-map',
          '0:v:0',
          '-vf',
          'fps=1:start_time=0',
          '-q:v',
          '5',
          '-threads',
          '1',
          '-frames:v',
          '120',
          join(directory, 'frame-%03d.jpg'),
        ],
        { timeout: 90000, maxBuffer: 1000000 },
      );
      const frameNames = (await readdir(directory))
        .filter((name) => /^frame-\d{3}\.jpg$/.test(name))
        .sort();
      if (
        !frameNames.length ||
        frameNames.length < Math.floor(durationMs / 1000)
      )
        throw new BadRequestException(
          'Complete sampled-frame coverage could not be prepared.',
        );
      const frames: {
        index: number;
        atMs: number;
        bytes: Buffer;
        sha256: string;
        size: number;
      }[] = [];
      for (const [index, name] of frameNames.entries()) {
        const bytes = await readFile(join(directory, name));
        if (bytes.length > VIDEO_QA_MAX_FRAME_BYTES)
          throw new BadRequestException(
            'An evidence frame exceeds the bounded image size.',
          );
        frames.push({
          index,
          atMs: index * 1000,
          bytes,
          sha256: videoQaBytesHash(bytes),
          size: bytes.length,
        });
      }
      const proxy = await readFile(output);
      const proxyVideo = proxyMetadata.streams.find(
        (stream) => stream.codec_type === 'video',
      )!;
      const preparation: VideoQaPreparation = {
        pipelineVersion: VIDEO_QA_PIPELINE_VERSION,
        durationMs,
        width: proxyVideo.width!,
        height: proxyVideo.height!,
        hasAudio: audio.length === 1,
        audioChannels:
          proxyMetadata.streams.find((stream) => stream.codec_type === 'audio')
            ?.channels ?? null,
        proxySha256: videoQaBytesHash(proxy),
        proxyBytes: proxy.length,
        frames: frames.map(({ bytes: _bytes, ...frame }) => frame),
        technicalFindings: videoQaTechnicalFindings(
          normalized.stderr,
          durationMs,
          audio.length === 1,
        ).slice(0, 100),
        samplingIntervalMs: 1000,
        limitations: [
          'The model inspects a compressed proxy with maximum dimension720 pixels, static visual sampling at about1 FPS and its actual audio stream downmixed to mono. Fast motion, tiny product details, stereo spatial effects and subsecond defects may be missed.',
          'Local technical detectors process the decoded source but report candidates, not creative quality judgments. Human full-motion, product, spelling and final approval remain required.',
          'Generated transcript and visible text are model observations, not verified subtitles or a guaranteed verbatim transcription.',
        ],
      };
      return { proxy, frames, preparation };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        'Local video preparation failed. Verify FFmpeg/FFprobe availability and upload a decodable MP4, WebM or MOV. No paid call was made during preparation.',
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
  async reference(source: Buffer) {
    const directory = await mkdtemp(
      join(tmpdir(), 'otogrow-video-qa-reference-'),
    );
    try {
      const input = join(directory, 'source');
      const output = join(directory, 'reference.jpg');
      await writeFile(input, source, { mode: 0o600 });
      await execute(
        'ffmpeg',
        [
          ...commandArguments,
          '-loglevel',
          'error',
          '-protocol_whitelist',
          'file,pipe',
          '-i',
          input,
          '-frames:v',
          '1',
          '-vf',
          'scale=1024:1024:force_original_aspect_ratio=decrease',
          '-q:v',
          '3',
          '-threads',
          '1',
          output,
        ],
        { timeout: 15000, maxBuffer: 1000000 },
      );
      const bytes = await readFile(output);
      if (bytes.length > 700000)
        throw new BadRequestException(
          'The prepared reference exceeds700 kB. Choose a simpler product image.',
        );
      return bytes;
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}
