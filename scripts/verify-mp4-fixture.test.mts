#!/usr/bin/env -S npx tsx
// End-to-end test for scripts/verify-mp4.mjs.
//
// Generates synthetic MP4 fixtures via ffmpeg-static, runs the verify script
// against them, and asserts the right PASS/FAIL outcomes. Without this, the
// verify pipeline could silently break and only the YouTube-Ready sign-off
// run would notice mid-flight.
//
// Fixtures live in a per-run temp dir and are cleaned up in the finally block.
// Wall time on ubuntu-latest: ~10–15s (fixture generation + two verify passes).
//
// Run with: npx tsx scripts/verify-mp4-fixture.test.mts

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
// Resolve the same ffmpeg binary verify-mp4.mjs uses, so a working test
// proves verify-mp4 will also find a binary at runtime.
const FFMPEG: string = require('ffmpeg-static');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VERIFY_SCRIPT = path.join(HERE, 'verify-mp4.mjs');

let passed = 0, failed = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); console.log(`  ok  ${name}`); passed++; }
  catch (e: any) { console.log(`  FAIL  ${name}\n    ${e.message}`); failed++; }
};

// ---------------------------------------------------------------------------
// Fixture generators
// ---------------------------------------------------------------------------

// 5s 1280x720 colour bars + 1kHz sine normalized to -14 LUFS via loudnorm
// (dynamic mode — on a steady sine, dynamic mode lands within ~0.2 LU of
// target, well inside the ±0.5 LU window verify-mp4 checks). H.264 + AAC =
// passes the codec checks. ultrafast preset keeps wall time down.
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

// Same shape but encoded as MPEG-4 Part 2 — produces a valid playable .mp4
// container but flunks verify-mp4's "Video codec is H.264" assertion. mpeg4
// is universally available in every ffmpeg build, unlike libvpx-vp9.
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

// ---------------------------------------------------------------------------
// Test plan
// ---------------------------------------------------------------------------

const tmpDir = mkdtempSync(path.join(tmpdir(), 'verify-mp4-fixture-'));
const goodMp4 = path.join(tmpDir, 'good.mp4');
const badMp4 = path.join(tmpDir, 'bad-codec.mp4');

try {
  console.log('\nverify-mp4.mjs end-to-end (synthetic fixtures)');

  test('generates a good H.264 + AAC MP4 via ffmpeg-static', () => {
    generateGoodMp4(goodMp4);
    assert.ok(existsSync(goodMp4), 'good MP4 was not written');
  });

  test('generates a bad-codec (mpeg4) MP4 via ffmpeg-static', () => {
    generateBadCodecMp4(badMp4);
    assert.ok(existsSync(badMp4), 'bad MP4 was not written');
  });

  test('verify-mp4 exits 0 on the good fixture with no [FAIL] lines', () => {
    const { status, stdout } = runVerify(goodMp4);
    assert.equal(status, 0, `expected exit 0, got ${status}.\nOutput:\n${stdout}`);
    assert.equal(stdout.includes('[FAIL]'), false, `unexpected [FAIL] line:\n${stdout}`);
    // Each automated check should appear as a PASS line.
    assert.match(stdout, /\[PASS\] Video codec is H\.264/);
    assert.match(stdout, /\[PASS\] Audio codec is AAC/);
    assert.match(stdout, /\[PASS\] Decodes without errors end-to-end/);
    assert.match(stdout, /\[PASS\] Integrated loudness within ±0\.5 LU of -14 LUFS/);
    assert.match(stdout, /\[PASS\] True peak ≤ -1\.0 dBTP/);
  });

  test('verify-mp4 exits 1 on the bad-codec fixture and reports [FAIL] for H.264', () => {
    const { status, stdout } = runVerify(badMp4);
    assert.equal(status, 1, `expected exit 1, got ${status}.\nOutput:\n${stdout}`);
    assert.match(stdout, /\[FAIL\] Video codec is H\.264/);
  });

} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
