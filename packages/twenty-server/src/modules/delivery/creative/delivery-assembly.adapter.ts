import { Injectable } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

@Injectable()
export class DeliveryAssemblyAdapter {
  async render(clips: Buffer[], soundtrack: Buffer | null, portrait: boolean) {
    if (!clips.length || clips.length > 12)
      throw new Error('Choose 1–12 clips.');
    const directory = await mkdtemp(join(tmpdir(), 'otogrow-assembly-'));
    try {
      const inputs: string[] = [];
      for (let index = 0; index < clips.length; index++) {
        const path = join(directory, `clip-${index}`);
        await writeFile(path, clips[index]);
        inputs.push('-protocol_whitelist', 'file,pipe', '-t', '10', '-i', path);
      }
      if (soundtrack) {
        const path = join(directory, 'soundtrack');
        await writeFile(path, soundtrack);
        inputs.push('-protocol_whitelist', 'file,pipe', '-i', path);
      }
      const width = portrait ? 720 : 1280;
      const height = portrait ? 1280 : 720;
      const filters = clips
        .map(
          (_, index) =>
            `[${index}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24,setpts=PTS-STARTPTS[v${index}]`,
        )
        .join(';');
      const concat =
        clips.map((_, index) => `[v${index}]`).join('') +
        `concat=n=${clips.length}:v=1:a=0[out]`;
      const output = join(directory, 'assembly.mp4');
      await promisify(execFile)(
        'ffmpeg',
        [
          '-nostdin',
          '-hide_banner',
          '-loglevel',
          'error',
          '-y',
          ...inputs,
          '-filter_complex',
          `${filters};${concat}`,
          '-map',
          '[out]',
          ...(soundtrack
            ? [
                '-map',
                `${clips.length}:a`,
                '-af',
                'apad',
                '-shortest',
                '-c:a',
                'aac',
              ]
            : ['-an']),
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-threads',
          '2',
          '-pix_fmt',
          'yuv420p',
          '-t',
          '120',
          '-fs',
          '100000000',
          '-movflags',
          '+faststart',
          output,
        ],
        { timeout: 180000, maxBuffer: 1000000 },
      );
      const metadata = await stat(output);
      if (metadata.size >= 100000000)
        throw new Error('Assembly exceeded the output limit.');
      return {
        bytes: await readFile(output),
        mimeType: 'video/mp4',
        extension: 'mp4',
        providerJobId: null,
      };
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}
