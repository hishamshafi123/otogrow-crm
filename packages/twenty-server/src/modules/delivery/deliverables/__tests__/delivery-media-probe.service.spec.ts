import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { DeliveryMediaProbeService } from 'src/modules/delivery/deliverables/delivery-media-probe.service';

const execFileAsync = promisify(execFile);

describe('DeliveryMediaProbeService', () => {
  it('probes resolution/fps/duration and extracts a JPEG thumbnail from a real MP4', async () => {
    const tmpDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'otogrow-probe-test-'),
    );
    const videoPath = path.join(tmpDir, 'sample.mp4');
    const thumbPath = path.join(tmpDir, 'thumb.jpg');
    try {
      await execFileAsync(
        'ffmpeg',
        [
          '-y',
          '-f',
          'lavfi',
          '-i',
          'color=c=0x1e293b:s=360x640:r=30:d=1',
          '-f',
          'lavfi',
          '-i',
          'anullsrc=r=44100:cl=stereo',
          '-t',
          '1',
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
      expect(meta.durationSec).toBeGreaterThanOrEqual(0.9);

      const ok = await service.extractVideoThumbnail(
        videoPath,
        thumbPath,
        meta.durationSec,
      );
      expect(ok).toBe(true);
      const thumbStats = await fs.stat(thumbPath);
      expect(thumbStats.size).toBeGreaterThan(500);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
