import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const FFMPEG: string = require('ffmpeg-static');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VERIFY_SCRIPT = path.join(HERE, '..', 'scripts', 'verify-mp4.mjs');

function generateGoodMp4(outPath: string): void {
  const args = [
    '-y', '-hide_banner', '-nostats', '-v', 'error',
    '-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=30:duration=5',
    '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=5:sample_rate=48000',
    '-af', 'loudnorm=I=-14:TP=-1:LRA=7',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k',
    '-shortest',
    outPath,
  ];
  const r = spawnSync(FFMPEG, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (r.status !== 0) {
    throw new Error(`good fixture generation failed (exit ${r.status}):\n${r.stderr}`);
  }
}

function generateBadCodecMp4(outPath: string): void {
  const args = [
    '-y', '-hide_banner', '-nostats', '-v', 'error',
    '-f', 'lavfi', '-i', 'testsrc=size=640x480:rate=30:duration=3',
    '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=3:sample_rate=48000',
    '-c:v', 'mpeg4', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k',
    '-shortest',
    outPath,
  ];
  const r = spawnSync(FFMPEG, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (r.status !== 0) {
    throw new Error(`bad fixture generation failed (exit ${r.status}):\n${r.stderr}`);
  }
}

function runVerify(mp4: string): { status: number; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [VERIFY_SCRIPT, '--mp4', mp4], { encoding: 'utf8' });
  return { status: r.status ?? -1, stdout: r.stdout || '', stderr: r.stderr || '' };
}

describe('verify-mp4.mjs end-to-end (synthetic fixtures)', () => {
  let tmpDir = '';
  let goodMp4 = '';
  let badMp4 = '';

  beforeAll(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'verify-mp4-fixture-'));
    goodMp4 = path.join(tmpDir, 'good.mp4');
    badMp4 = path.join(tmpDir, 'bad-codec.mp4');
  });

  afterAll(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it('generates a good H.264 + AAC MP4 via ffmpeg-static', () => {
    generateGoodMp4(goodMp4);
    expect(existsSync(goodMp4)).toBe(true);
  });

  it('generates a bad-codec (mpeg4) MP4 via ffmpeg-static', () => {
    generateBadCodecMp4(badMp4);
    expect(existsSync(badMp4)).toBe(true);
  });

  it('verify-mp4 exits 0 on the good fixture with no [FAIL] lines', () => {
    const { status, stdout } = runVerify(goodMp4);
    expect(status, `expected exit 0, got ${status}.\nOutput:\n${stdout}`).toBe(0);
    expect(stdout.includes('[FAIL]'), `unexpected [FAIL] line:\n${stdout}`).toBe(false);
    expect(stdout).toMatch(/\[PASS\] Video codec is H\.264/);
    expect(stdout).toMatch(/\[PASS\] Audio codec is AAC/);
    expect(stdout).toMatch(/\[PASS\] Decodes without errors end-to-end/);
    expect(stdout).toMatch(/\[PASS\] Integrated loudness within ±0\.5 LU of -14 LUFS/);
    expect(stdout).toMatch(/\[PASS\] True peak ≤ -1\.0 dBTP/);
  });

  it('verify-mp4 exits 1 on the bad-codec fixture and reports [FAIL] for H.264', () => {
    const { status, stdout } = runVerify(badMp4);
    expect(status, `expected exit 1, got ${status}.\nOutput:\n${stdout}`).toBe(1);
    expect(stdout).toMatch(/\[FAIL\] Video codec is H\.264/);
  });
});
