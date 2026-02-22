// FFmpeg-based server-side render pipeline
// Accepts base64 PNG frames, writes to temp dir, runs FFmpeg, returns MP4 buffer.

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { promisify } from 'util';

const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);
const readFile = promisify(fs.readFile);
const mkdir = promisify(fs.mkdir);

interface RenderOptions {
  fps: number;
  resolution: '720p' | '1080p';
  format: 'mp4' | 'webm';
}

export async function renderMP4(frames: string[], options: RenderOptions): Promise<Buffer> {
  // Dynamically import fluent-ffmpeg so the server still starts if it's not installed
  let ffmpeg: any;
  try {
    ffmpeg = (await import('fluent-ffmpeg')).default;
    const ffmpegInstaller = await import('@ffmpeg-installer/ffmpeg');
    ffmpeg.setFfmpegPath(ffmpegInstaller.path);
  } catch (e) {
    throw new Error('fluent-ffmpeg is not installed. Run: npm install fluent-ffmpeg @ffmpeg-installer/ffmpeg');
  }

  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'human-override-'));
  const outputPath = path.join(tmpDir, `output.${options.format}`);

  try {
    // Write frames as PNG files
    for (let i = 0; i < frames.length; i++) {
      const framePath = path.join(tmpDir, `frame_${String(i).padStart(6, '0')}.png`);
      await writeFile(framePath, Buffer.from(frames[i], 'base64'));
    }

    // Run FFmpeg
    await new Promise<void>((resolve, reject) => {
      const scale = options.resolution === '1080p' ? 1920 : 1280;
      ffmpeg()
        .input(path.join(tmpDir, 'frame_%06d.png'))
        .inputFPS(options.fps)
        .videoCodec(options.format === 'mp4' ? 'libx264' : 'libvpx-vp9')
        .outputOptions([
          '-crf 18',
          '-pix_fmt yuv420p',
          '-movflags +faststart',
          `-vf scale=${scale}:-2`,
        ])
        .output(outputPath)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });

    const outputBuffer = await readFile(outputPath);
    return outputBuffer;
  } finally {
    // Clean up temp dir async
    fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

export function getRenderJobStatus(jobId: string): { status: string; progress: number } {
  // Synchronous jobs for now — async job tracking can be added later
  return { status: 'complete', progress: 100 };
}
