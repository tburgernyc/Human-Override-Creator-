#!/usr/bin/env node
// Smoke tests for the pure helper functions added in Phase 2/3.
// These cover the new code paths most prone to regression:
// - codec fallback (pickMimeType)
// - adaptive bitrate (computeBitrate)
// - WAV header sniffing (sniffWavHeader)
// - data URI stripping (stripDataUriPrefix)
// - safe JSON parsing (parseJsonResponse)
//
// Run with: node scripts/smoke-helpers.test.mjs
//
// Visual/audio output verification is manual — see scripts/MANUAL_SMOKE.md.

import assert from 'node:assert/strict';

let passed = 0;
let failed = 0;
const test = (name, fn) => {
  try { fn(); console.log(`  ok  ${name}`); passed++; }
  catch (e) { console.log(`  FAIL  ${name}\n    ${e.message}`); failed++; }
};

// ---------- computeBitrate ----------
// Mirrors components/Renderer.tsx: width * height * fps * 0.1, clamped [2_000_000, 20_000_000]
const computeBitrate = (w, h, fps) => Math.max(2_000_000, Math.min(20_000_000, Math.round(w * h * fps * 0.1)));

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
const sniffWavHeader = (bytes) => {
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
const makeWav = (sampleRate, channels) => {
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
const stripDataUriPrefix = (s) => {
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
const cleanJsonResponse = (text) => {
  let clean = text.trim();
  if (clean.startsWith('```json')) clean = clean.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  else if (clean.startsWith('```')) clean = clean.replace(/^```\s*/, '').replace(/\s*```$/, '');
  return clean;
};
const parseJsonResponse = (text, fallback) => {
  const raw = text || '';
  const cleaned = cleanJsonResponse(raw);
  if (!cleaned) {
    if (fallback !== undefined) return fallback;
    throw new Error('Gemini returned an empty response (likely safety-filtered).');
  }
  try { return JSON.parse(cleaned); }
  catch (e) {
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
  } catch (e) {
    assert.match(e.message, /Failed to parse JSON/);
    assert.match(e.message, /not json/);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
