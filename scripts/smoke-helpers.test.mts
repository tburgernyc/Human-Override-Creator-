#!/usr/bin/env -S npx tsx
// Smoke tests for pure helper functions across Phase 2/3 + Phase 14.
// Runs under tsx so the LUT migration tests can import the real production
// helpers (services/lutMigration.ts, types.ts) instead of mirroring them.
//
// Covers: pickMimeType fallback order, computeBitrate scaling, WAV header
// sniffing, data URI stripping, JSON response parsing, normalizeLutPreset
// (real, not mirrored), buildLutArg (logic mirror — extraction is blocked by
// server/tsconfig.json's standalone scope; a drift assertion guards the
// server's local LUT_PRESETS copy), and the verify-mp4.mjs pure parsers.
//
// Run with: npx tsx scripts/smoke-helpers.test.mts
//
// Visual/audio output verification is manual — see scripts/MANUAL_SMOKE.md.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

let passed = 0;
let failed = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); console.log(`  ok  ${name}`); passed++; }
  catch (e: any) { console.log(`  FAIL  ${name}\n    ${e.message}`); failed++; }
};

// ---------- computeBitrate ----------
// Mirrors components/Renderer.tsx: width * height * fps * 0.1, clamped [2_000_000, 20_000_000]
const computeBitrate = (w: number, h: number, fps: number) =>
  Math.max(2_000_000, Math.min(20_000_000, Math.round(w * h * fps * 0.1)));

console.log('\ncomputeBitrate');
test('720p 30fps yields ~2.76 Mbps clamped above floor', () => {
  const b = computeBitrate(1280, 720, 30);
  assert.equal(b, 2_764_800);
});
test('1080p 30fps yields ~6.22 Mbps', () => {
  const b = computeBitrate(1920, 1080, 30);
  assert.equal(b, 6_220_800);
});
test('4K 30fps clamps to 20 Mbps ceiling', () => {
  const b = computeBitrate(3840, 2160, 30);
  assert.equal(b, 20_000_000);
});
test('tiny resolution clamps to 2 Mbps floor', () => {
  const b = computeBitrate(320, 240, 24);
  assert.equal(b, 2_000_000);
});

// ---------- pickMimeType (logic-only fixture) ----------
// We can't call MediaRecorder.isTypeSupported in node, but we can validate the candidate list ordering.
const CANDIDATES = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/mp4;codecs=h264',
  'video/webm',
];

console.log('\npickMimeType fallback order');
test('vp9 first, vp8 second', () => {
  assert.equal(CANDIDATES[0], 'video/webm;codecs=vp9');
  assert.equal(CANDIDATES[1], 'video/webm;codecs=vp8');
});
test('h264 third, plain webm last', () => {
  assert.equal(CANDIDATES[2], 'video/mp4;codecs=h264');
  assert.equal(CANDIDATES[3], 'video/webm');
});

// ---------- sniffWavHeader ----------
// Port of services/gemini.ts implementation, validated against a known WAV header.
const sniffWavHeader = (bytes: Uint8Array) => {
  if (bytes.length < 44) return null;
  const isRiff = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
  const isWave = bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45;
  if (!isRiff || !isWave) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  let sampleRate = 0, numChannels = 0, dataOffset = -1;
  while (offset + 8 <= bytes.length) {
    const chunkId = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
    const chunkSize = view.getUint32(offset + 4, true);
    if (chunkId === 'fmt ') {
      numChannels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
    } else if (chunkId === 'data') {
      dataOffset = offset + 8;
      break;
    }
    offset += 8 + chunkSize;
  }
  if (!sampleRate || !numChannels || dataOffset < 0) return null;
  return { sampleRate, numChannels, dataOffset };
};

// Build a minimal valid PCM WAV header: 24kHz mono 16-bit, 4 bytes of PCM
const makeWav = (sampleRate: number, channels: number) => {
  const buf = new ArrayBuffer(44 + 4);
  const v = new DataView(buf);
  const u = new Uint8Array(buf);
  u.set([0x52, 0x49, 0x46, 0x46], 0);  // "RIFF"
  v.setUint32(4, 36 + 4, true);          // size
  u.set([0x57, 0x41, 0x56, 0x45], 8);   // "WAVE"
  u.set([0x66, 0x6d, 0x74, 0x20], 12);  // "fmt "
  v.setUint32(16, 16, true);             // fmt chunk size
  v.setUint16(20, 1, true);              // PCM
  v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * channels * 2, true);
  v.setUint16(32, channels * 2, true);
  v.setUint16(34, 16, true);
  u.set([0x64, 0x61, 0x74, 0x61], 36);  // "data"
  v.setUint32(40, 4, true);
  return u;
};

console.log('\nsniffWavHeader');
test('detects 24kHz mono WAV', () => {
  const got = sniffWavHeader(makeWav(24000, 1));
  assert.deepEqual(got, { sampleRate: 24000, numChannels: 1, dataOffset: 44 });
});
test('detects 48kHz stereo WAV', () => {
  const got = sniffWavHeader(makeWav(48000, 2));
  assert.deepEqual(got, { sampleRate: 48000, numChannels: 2, dataOffset: 44 });
});
test('returns null for raw (non-RIFF) PCM', () => {
  const raw = new Uint8Array(100);
  for (let i = 0; i < 100; i++) raw[i] = i;
  assert.equal(sniffWavHeader(raw), null);
});
test('returns null for too-short payload', () => {
  assert.equal(sniffWavHeader(new Uint8Array(10)), null);
});

// ---------- stripDataUriPrefix ----------
const stripDataUriPrefix = (s: string) => {
  const idx = s.indexOf(',');
  if (idx < 0) throw new Error('Expected data URI with base64 prefix, got raw string.');
  return s.slice(idx + 1);
};

console.log('\nstripDataUriPrefix');
test('strips image data URI prefix', () => {
  assert.equal(stripDataUriPrefix('data:image/png;base64,AAAA'), 'AAAA');
});
test('strips audio data URI prefix', () => {
  assert.equal(stripDataUriPrefix('data:audio/pcm;base64,bm9pc2U='), 'bm9pc2U=');
});
test('throws on raw base64 without prefix', () => {
  assert.throws(() => stripDataUriPrefix('AAAA'), /Expected data URI/);
});

// ---------- parseJsonResponse ----------
const cleanJsonResponse = (text: string) => {
  let clean = text.trim();
  if (clean.startsWith('```json')) clean = clean.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  else if (clean.startsWith('```')) clean = clean.replace(/^```\s*/, '').replace(/\s*```$/, '');
  return clean;
};
const parseJsonResponse = (text: string, fallback?: unknown): unknown => {
  const raw = text || '';
  const cleaned = cleanJsonResponse(raw);
  if (!cleaned) {
    if (fallback !== undefined) return fallback;
    throw new Error('Gemini returned an empty response (likely safety-filtered).');
  }
  try { return JSON.parse(cleaned); }
  catch (e: any) {
    throw new Error(`Failed to parse JSON response from Gemini: ${e.message}\nFirst 500 chars: ${raw.slice(0, 500)}`);
  }
};

console.log('\nparseJsonResponse');
test('parses plain JSON', () => {
  assert.deepEqual(parseJsonResponse('{"a":1}'), { a: 1 });
});
test('strips ```json fences', () => {
  assert.deepEqual(parseJsonResponse('```json\n{"a":1}\n```'), { a: 1 });
});
test('strips ``` fences', () => {
  assert.deepEqual(parseJsonResponse('```\n[1,2,3]\n```'), [1, 2, 3]);
});
test('uses fallback on empty', () => {
  assert.deepEqual(parseJsonResponse('', []), []);
});
test('throws on empty without fallback', () => {
  assert.throws(() => parseJsonResponse(''), /safety-filtered/);
});
test('throws with raw text on malformed JSON', () => {
  try {
    parseJsonResponse('not json {');
    assert.fail('should have thrown');
  } catch (e: any) {
    assert.match(e.message, /Failed to parse JSON/);
    assert.match(e.message, /not json/);
  }
});

// ---------- normalizeLutPreset (Phase 14) ----------
// Import the real production helpers instead of mirroring them. A renamed
// export or a changed mapping table now fails the test loudly.
import { normalizeLutPreset, LEGACY_LUT_MAP } from '../services/lutMigration';
import { LUT_PRESETS } from '../types';

console.log('\nnormalizeLutPreset');
test('legacy kodak_5219 → kodak_vision3_250d', () => {
  assert.equal(normalizeLutPreset('kodak_5219'), 'kodak_vision3_250d');
});
test('legacy fuji_400h → fuji_eterna_250d', () => {
  assert.equal(normalizeLutPreset('fuji_400h'), 'fuji_eterna_250d');
});
test('legacy noir → bleach_bypass', () => {
  assert.equal(normalizeLutPreset('noir'), 'bleach_bypass');
});
test('legacy technicolor → kodak_2383', () => {
  assert.equal(normalizeLutPreset('technicolor'), 'kodak_2383');
});
test('new enum value passes through', () => {
  assert.equal(normalizeLutPreset('kodak_2383'), 'kodak_2383');
});
test('unknown value falls back to none', () => {
  assert.equal(normalizeLutPreset('made_up_thing'), 'none');
});
test('undefined falls back to none', () => {
  assert.equal(normalizeLutPreset(undefined), 'none');
});
test('LEGACY_LUT_MAP entries all point at canonical presets', () => {
  for (const [legacy, canonical] of Object.entries(LEGACY_LUT_MAP)) {
    assert.ok(
      (LUT_PRESETS as readonly string[]).includes(canonical),
      `LEGACY_LUT_MAP["${legacy}"] = "${canonical}" is not in types.ts LUT_PRESETS`,
    );
  }
});

// ---------- LUT_PRESETS drift (Phase 14) ----------
// The server keeps its own LUT_PRESETS array because server/tsconfig.json's
// include set is scoped to `./**/*.ts` (deliberate — server stays standalone).
// That means a preset added to types.ts + App.tsx but forgotten in
// server/proxy.ts would silently downgrade transcodes to no-LUT. Re-read the
// server file at test time and deep-equal its local array against the source
// of truth in types.ts.
const SMOKE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SMOKE_DIR, '..');
const REPO_LUTS_DIR = path.join(REPO_ROOT, 'public', 'luts');

const extractServerLutPresets = (): string[] => {
  const src = readFileSync(path.join(REPO_ROOT, 'server', 'proxy.ts'), 'utf8');
  // Match `const LUT_PRESETS = [ ... ] as const;` (or without the as const).
  // Captures the array body, then pulls each single-quoted string out of it.
  const arrayMatch = src.match(/const\s+LUT_PRESETS\s*=\s*\[([\s\S]*?)\]\s*(?:as\s+const)?\s*;/);
  if (!arrayMatch) throw new Error('Could not locate LUT_PRESETS array in server/proxy.ts');
  const items = Array.from(arrayMatch[1].matchAll(/'([^']+)'/g)).map(m => m[1]);
  if (items.length === 0) throw new Error('Parsed LUT_PRESETS array from server/proxy.ts but it was empty');
  return items;
};

console.log('\nLUT_PRESETS drift between types.ts and server/proxy.ts');
test('server/proxy.ts LUT_PRESETS deep-equals types.ts LUT_PRESETS', () => {
  const serverPresets = extractServerLutPresets();
  assert.deepEqual(
    serverPresets,
    [...LUT_PRESETS],
    'server/proxy.ts has drifted from types.ts — sync the LUT_PRESETS array',
  );
});

// ---------- buildLutArg (Phase 14) ----------
// Mirrors server/proxy.ts:317. The arg builder downgrades silently when a
// preset is missing, invalid, or the .cube file doesn't exist on disk.
// We exercise the validation+formatting half here against the real LUT_PRESETS
// import; the fs.existsSync half is covered by the manual smoke test
// (renaming a real .cube file).

const buildLutArg = (preset: string | null | undefined, lutsDir: string): { arg: string; preset: string } | null => {
  if (!preset || preset === 'none') return null;
  if (!(LUT_PRESETS as readonly string[]).includes(preset)) return null;
  const filePath = path.join(lutsDir, `${preset}.cube`);
  if (!existsSync(filePath)) return null;
  return { arg: `lut3d='${filePath}'`, preset };
};

console.log('\nbuildLutArg');
test('returns null for "none"', () => {
  assert.equal(buildLutArg('none', REPO_LUTS_DIR), null);
});
test('returns null for unknown preset', () => {
  assert.equal(buildLutArg('not_a_real_lut', REPO_LUTS_DIR), null);
});
test('returns null when .cube file is missing', () => {
  // valid enum value, but pointing at a directory with no .cube files
  assert.equal(buildLutArg('kodak_2383', '/tmp/nonexistent-luts-dir-for-smoke'), null);
});
test('returns lut3d arg with single-quoted path when .cube file exists', () => {
  // Requires the placeholder .cube to be present at public/luts/kodak_2383.cube
  const got = buildLutArg('kodak_2383', REPO_LUTS_DIR);
  assert.ok(got, 'expected a non-null arg when the .cube file exists');
  assert.match(got.arg, /^lut3d='.+kodak_2383\.cube'$/);
  assert.equal(got.preset, 'kodak_2383');
});

// ---------- verify-mp4 parsers (Phase 14 sign-off) ----------
// Cover the pure parsing helpers in verify-mp4.mjs against representative
// fixture strings so regressions in the verify pipeline get caught before
// they confuse a sign-off run.
import {
  parseCodecsFromFfmpegStderr,
  parseImageDimensions,
  parseLoudnormSummary,
  srtTimestampToMs,
  parseSrtCues,
  validateSrtCues,
  validateMetadataText,
} from './verify-mp4.mjs';

// Trimmed sample of `ffmpeg -i master.mp4` stderr output. Two streams:
// h264 video, aac audio. The wrapping `Input #0` block is verbatim.
const FFMPEG_MP4_STDERR = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'master.mp4':
  Metadata:
    major_brand     : isom
    minor_version   : 512
    compatible_brands: isomiso2avc1mp41
    encoder         : Lavf60.16.100
  Duration: 00:00:15.04, start: 0.000000, bitrate: 6125 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(tv, bt709), 1920x1080 [SAR 1:1 DAR 16:9], 5996 kb/s, 30 fps, 30 tbr, 15360 tbn (default)
      Metadata:
        handler_name    : VideoHandler
        vendor_id       : [0][0][0][0]
  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 128 kb/s (default)
      Metadata:
        handler_name    : SoundHandler`;

console.log('\nparseCodecsFromFfmpegStderr');
test('extracts h264 video + aac audio', () => {
  const got = parseCodecsFromFfmpegStderr(FFMPEG_MP4_STDERR);
  assert.equal(got.video, 'h264');
  assert.equal(got.audio, 'aac');
});
test('returns undefined fields when streams are missing', () => {
  const got = parseCodecsFromFfmpegStderr('nothing here');
  assert.equal(got.video, undefined);
  assert.equal(got.audio, undefined);
});
test('handles video-only file (no audio stream)', () => {
  const videoOnly = FFMPEG_MP4_STDERR.split('Stream #0:1')[0];
  const got = parseCodecsFromFfmpegStderr(videoOnly);
  assert.equal(got.video, 'h264');
  assert.equal(got.audio, undefined);
});

console.log('\nparseImageDimensions');
test('extracts 1920x1080 PNG', () => {
  const stderr = `Input #0, png_pipe, from 'thumb.png':
  Stream #0:0: Video: png, rgba(pc, gbr/unknown/unknown), 1920x1080 [SAR 1:1 DAR 16:9], 25 tbr, 25 tbn`;
  const got = parseImageDimensions(stderr);
  assert.deepEqual(got, { codec: 'png', width: 1920, height: 1080 });
});
test('extracts 1920x1080 MJPEG', () => {
  const stderr = `Input #0, image2, from 'thumb.jpg':
  Stream #0:0: Video: mjpeg (Baseline), yuvj420p(pc, bt470bg/unknown/unknown), 1920x1080 [SAR 1:1 DAR 16:9], 25 tbr`;
  const got = parseImageDimensions(stderr);
  assert.deepEqual(got, { codec: 'mjpeg', width: 1920, height: 1080 });
});
test('returns undefined when no video stream present', () => {
  assert.equal(parseImageDimensions('not an image'), undefined);
});

console.log('\nparseLoudnormSummary');
test('extracts integrated LUFS + true peak dBTP', () => {
  const stderr = `[Parsed_loudnorm_0 @ 0x7f8e34004000]
Input Integrated:   -14.08 LUFS
Input True Peak:     -1.45 dBTP
Input LRA:            5.20 LU
Input Threshold:    -24.51 LUFS

Output Integrated:  -14.00 LUFS
Output True Peak:    -1.40 dBTP`;
  const got = parseLoudnormSummary(stderr);
  assert.equal(got.integratedLufs, -14.08);
  assert.equal(got.truePeakDbtp, -1.45);
});
test('handles integer-valued measurements', () => {
  const stderr = `Input Integrated:   -14 LUFS
Input True Peak:     -2 dBTP`;
  const got = parseLoudnormSummary(stderr);
  assert.equal(got.integratedLufs, -14);
  assert.equal(got.truePeakDbtp, -2);
});
test('returns undefined fields when loudnorm did not run', () => {
  const got = parseLoudnormSummary('some unrelated error output');
  assert.equal(got.integratedLufs, undefined);
  assert.equal(got.truePeakDbtp, undefined);
});

console.log('\nsrtTimestampToMs');
test('00:00:00,000 → 0', () => {
  assert.equal(srtTimestampToMs('00:00:00,000'), 0);
});
test('00:00:02,500 → 2500', () => {
  assert.equal(srtTimestampToMs('00:00:02,500'), 2500);
});
test('01:23:45,678 → 5025678', () => {
  assert.equal(srtTimestampToMs('01:23:45,678'), 5025678);
});
test('malformed timestamp returns NaN', () => {
  assert.ok(Number.isNaN(srtTimestampToMs('not a timestamp')));
});

console.log('\nparseSrtCues + validateSrtCues');
const VALID_SRT = `1
00:00:00,000 --> 00:00:02,500
NARRATOR: First line spoken.

2
00:00:02,500 --> 00:00:05,000
NARRATOR: Second line.

3
00:00:05,000 --> 00:00:07,500
DETECTIVE: Question for the witness.
`;

test('parses three monotonic cues from a valid SRT', () => {
  const cues = parseSrtCues(VALID_SRT);
  assert.equal(cues.length, 3);
  assert.equal(cues[0].startMs, 0);
  assert.equal(cues[0].endMs, 2500);
  assert.equal(cues[2].text, 'DETECTIVE: Question for the witness.');
});
test('validateSrtCues accepts a clean track', () => {
  const result = validateSrtCues(parseSrtCues(VALID_SRT));
  assert.equal(result.ok, true);
  assert.deepEqual(result.reasons, []);
});
test('validateSrtCues catches end ≤ start', () => {
  const broken = `1
00:00:05,000 --> 00:00:05,000
zero-duration cue
`;
  const result = validateSrtCues(parseSrtCues(broken));
  assert.equal(result.ok, false);
  assert.match(result.reasons.join(' '), /end .* start/);
});
test('validateSrtCues catches non-monotonic starts', () => {
  const regress = `1
00:00:05,000 --> 00:00:07,000
later cue

2
00:00:02,000 --> 00:00:04,000
earlier cue out of order
`;
  const result = validateSrtCues(parseSrtCues(regress));
  assert.equal(result.ok, false);
  assert.match(result.reasons.join(' '), /regresses/);
});
test('validateSrtCues catches empty file', () => {
  const result = validateSrtCues(parseSrtCues(''));
  assert.equal(result.ok, false);
  assert.match(result.reasons.join(' '), /no cues/);
});
test('parseSrtCues tolerates CRLF line endings', () => {
  const crlf = VALID_SRT.replace(/\n/g, '\r\n');
  const cues = parseSrtCues(crlf);
  assert.equal(cues.length, 3);
});

console.log('\nvalidateMetadataText');
// Mirrors the exact format from components/Renderer.tsx handleDownloadMetadata.
const VALID_METADATA = `# YouTube Upload Metadata — 2026-05-15

TITLE (primary): The Last Detective

ALTERNATE TITLES:
- A Detective's Final Case
- Rain in the Precinct

AUDIENCE: True-crime and noir fans

HOOK SCORE: 8/10

--- DESCRIPTION ---

[Paste your description here. The current schema doesn't generate one yet.]

--- TAGS ---

[Paste comma-separated tags here.]
`;

test('accepts well-formed metadata.txt', () => {
  const result = validateMetadataText(VALID_METADATA);
  assert.equal(result.ok, true);
  assert.deepEqual(result.reasons, []);
});
test('rejects file under 100 bytes', () => {
  const result = validateMetadataText('# YouTube Upload Metadata — 2026-05-15');
  assert.equal(result.ok, false);
  assert.match(result.reasons.join(' '), /bytes/);
});
test('rejects file missing the header line', () => {
  const noHeader = VALID_METADATA.replace('# YouTube Upload Metadata —', '# Some Other Doc');
  const result = validateMetadataText(noHeader);
  assert.equal(result.ok, false);
  assert.match(result.reasons.join(' '), /YouTube Upload Metadata/);
});
test('rejects file missing the TITLE line', () => {
  const noTitle = VALID_METADATA.replace('TITLE (primary):', 'NAME (primary):');
  const result = validateMetadataText(noTitle);
  assert.equal(result.ok, false);
  assert.match(result.reasons.join(' '), /TITLE/);
});
test('rejects empty input', () => {
  const result = validateMetadataText('');
  assert.equal(result.ok, false);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
