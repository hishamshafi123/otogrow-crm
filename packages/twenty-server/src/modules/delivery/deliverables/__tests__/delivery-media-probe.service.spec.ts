import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import {
  DeliveryMediaProbeService,
  normalizeTrimRange,
  resolveEvenCanvasDimensions,
} from 'src/modules/delivery/deliverables/delivery-media-probe.service';

const execFileAsync = promisify(execFile);

describe('DeliveryMediaProbeService', () => {
  let ffmpegAvailable = false;

  beforeAll(async () => {
    try {
      await execFileAsync('ffmpeg', ['-version'], { timeout: 5_000 });
      await execFileAsync('ffprobe', ['-version'], { timeout: 5_000 });
      ffmpegAvailable = true;
    } catch {
      ffmpegAvailable = false;
    }
  });

  it('returns empty metadata gracefully when probing a nonexistent file', async () => {
    const service = new DeliveryMediaProbeService();
    const meta = await service.probeMedia('/nonexistent/otogrow-missing.mp4');
    expect(meta).toEqual({});
  });

  it('normalizes trim ranges and skips trimming when full clip is selected', () => {
    expect(normalizeTrimRange({ originalDurationSec: 10 })).toBeNull();

    expect(
      normalizeTrimRange({
        trimStartSec: 0,
        trimEndSec: 10,
        originalDurationSec: 10,
      }),
    ).toEqual({
      shouldTrim: false,
      startSec: 0,
      endSec: 10,
      durationSec: 10,
    });

    expect(
      normalizeTrimRange({
        trimStartSec: 1.5,
        trimEndSec: 6.25,
        originalDurationSec: 10,
      }),
    ).toEqual({
      shouldTrim: true,
      startSec: 1.5,
      endSec: 6.25,
      durationSec: 4.75,
    });

    // Clamps out-of-range end to originalDurationSec
    expect(
      normalizeTrimRange({
        trimStartSec: 2,
        trimEndSec: 25,
        originalDurationSec: 8,
      }),
    ).toEqual({
      shouldTrim: true,
      startSec: 2,
      endSec: 8,
      durationSec: 6,
    });
  });

  it('resolves even canvas dimensions and caps 4K inputs cleanly', () => {
    expect(resolveEvenCanvasDimensions(undefined, undefined)).toEqual({
      width: 1080,
      height: 1920,
    });
    expect(resolveEvenCanvasDimensions(1081, 1921)).toEqual({
      width: 1080,
      height: 1920,
    });
    expect(resolveEvenCanvasDimensions(2160, 3840)).toEqual({
      width: 1080,
      height: 1920,
    });
  });

  it('probes resolution/fps/duration, trims accurately, and extracts a JPEG thumbnail from a real MP4', async () => {
    if (!ffmpegAvailable) {
      return;
    }

    const tmpDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'otogrow-probe-test-'),
    );
    const videoPath = path.join(tmpDir, 'sample.mp4');
    const trimmedPath = path.join(tmpDir, 'trimmed.mp4');
    const thumbPath = path.join(tmpDir, 'thumb.jpg');
    try {
      await execFileAsync(
        'ffmpeg',
        [
          '-y',
          '-f',
          'lavfi',
          '-i',
          'color=c=0x1e293b:s=360x640:r=30:d=3',
          '-f',
          'lavfi',
          '-i',
          'anullsrc=r=44100:cl=stereo',
          '-t',
          '3',
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          videoPath,
        ],
        { timeout: 20_000 },
      );

      const service = new DeliveryMediaProbeService();
      const meta = await service.probeMedia(videoPath);
      expect(meta.width).toBe(360);
      expect(meta.height).toBe(640);
      expect(meta.fps).toBe(30);
      expect(meta.videoCodec).toBe('h264');
      expect(meta.audioCodec).toBe('aac');
      expect(meta.durationSec).toBeGreaterThanOrEqual(2.8);

      await service.trimVideo(videoPath, trimmedPath, 0.8, 1.2);
      const trimmedMeta = await service.probeMedia(trimmedPath);
      expect(trimmedMeta.width).toBe(360);
      expect(trimmedMeta.height).toBe(640);
      expect(trimmedMeta.videoCodec).toBe('h264');
      expect(trimmedMeta.durationSec).toBeGreaterThanOrEqual(1.0);
      expect(trimmedMeta.durationSec).toBeLessThanOrEqual(1.4);

      const ok = await service.extractVideoThumbnail(
        trimmedPath,
        thumbPath,
        trimmedMeta.durationSec,
      );
      expect(ok).toBe(true);
      const thumbStats = await fs.stat(thumbPath);
      expect(thumbStats.size).toBeGreaterThan(500);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('composes and stitches trimmed heterogeneous clips (vertical audio + horizontal silent) into one MP4', async () => {
    if (!ffmpegAvailable) {
      return;
    }

    const tmpDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'otogrow-compose-test-'),
    );
    const clip1Path = path.join(tmpDir, 'clip1-audio.mp4');
    const clip2Path = path.join(tmpDir, 'clip2-silent.mp4');
    const stitchedPath = path.join(tmpDir, 'stitched.mp4');
    const mutedSinglePath = path.join(tmpDir, 'single-muted.mp4');

    try {
      await execFileAsync(
        'ffmpeg',
        [
          '-y',
          '-f',
          'lavfi',
          '-i',
          'color=c=0x1e293b:s=360x640:r=30:d=3',
          '-f',
          'lavfi',
          '-i',
          'anullsrc=r=44100:cl=stereo',
          '-t',
          '3',
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          clip1Path,
        ],
        { timeout: 20_000 },
      );

      await execFileAsync(
        'ffmpeg',
        [
          '-y',
          '-f',
          'lavfi',
          '-i',
          'color=c=0x0f766e:s=640x360:r=24:d=2',
          '-t',
          '2',
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          '-an',
          clip2Path,
        ],
        { timeout: 20_000 },
      );

      const service = new DeliveryMediaProbeService();

      await service.composeVideos(
        [
          {
            filePath: clip1Path,
            startSec: 0.5,
            durationSec: 1.5,
            hasAudio: true,
            muted: false,
          },
          {
            filePath: clip2Path,
            startSec: 0.3,
            durationSec: 1.0,
            hasAudio: false,
            muted: false,
          },
        ],
        stitchedPath,
        { targetWidth: 360, targetHeight: 640, fps: 30 },
      );

      const stitchedMeta = await service.probeMedia(stitchedPath);
      expect(stitchedMeta.width).toBe(360);
      expect(stitchedMeta.height).toBe(640);
      expect(stitchedMeta.videoCodec).toBe('h264');
      expect(stitchedMeta.audioCodec).toBe('aac');
      expect(stitchedMeta.durationSec).toBeGreaterThanOrEqual(2.2);
      expect(stitchedMeta.durationSec).toBeLessThanOrEqual(2.8);

      await service.composeVideos(
        [
          {
            filePath: clip1Path,
            startSec: 0.5,
            durationSec: 1.0,
            hasAudio: true,
            muted: true,
          },
        ],
        mutedSinglePath,
        { targetWidth: 360, targetHeight: 640, fps: 30 },
      );

      const mutedMeta = await service.probeMedia(mutedSinglePath);
      expect(mutedMeta.audioCodec).toBeNull();
      expect(mutedMeta.durationSec).toBeGreaterThanOrEqual(0.8);
      expect(mutedMeta.durationSec).toBeLessThanOrEqual(1.3);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
