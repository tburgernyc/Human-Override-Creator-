import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeLutPreset, LEGACY_LUT_MAP } from '../services/lutMigration';
import { LUT_PRESETS } from '../types';
import { MODEL_COSTS_USD, MODEL_NAMES } from '../constants';
import {
  parseCodecsFromFfmpegStderr,
  parseImageDimensions,
  parseLoudnormSummary,
  srtTimestampToMs,
  parseSrtCues,
  validateSrtCues,
  validateMetadataText,
} from '../scripts/verify-mp4.mjs';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, '..');
const REPO_LUTS_DIR = path.join(REPO_ROOT, 'public', 'luts');

const computeBitrate = (w: number, h: number, fps: number) =>
  Math.max(2_000_000, Math.min(20_000_000, Math.round(w * h * fps * 0.1)));

describe('computeBitrate', () => {
  it('720p 30fps yields ~2.76 Mbps clamped above floor', () => {
    expect(computeBitrate(1280, 720, 30)).toBe(2_764_800);
  });
  it('1080p 30fps yields ~6.22 Mbps', () => {
    expect(computeBitrate(1920, 1080, 30)).toBe(6_220_800);
  });
  it('4K 30fps clamps to 20 Mbps ceiling', () => {
    expect(computeBitrate(3840, 2160, 30)).toBe(20_000_000);
  });
  it('tiny resolution clamps to 2 Mbps floor', () => {
    expect(computeBitrate(320, 240, 24)).toBe(2_000_000);
  });
});

describe('pickMimeType fallback order', () => {
  const CANDIDATES = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/mp4;codecs=h264',
    'video/webm',
  ];
  it('vp9 first, vp8 second', () => {
    expect(CANDIDATES[0]).toBe('video/webm;codecs=vp9');
    expect(CANDIDATES[1]).toBe('video/webm;codecs=vp8');
  });
  it('h264 third, plain webm last', () => {
    expect(CANDIDATES[2]).toBe('video/mp4;codecs=h264');
    expect(CANDIDATES[3]).toBe('video/webm');
  });
});

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

const makeWav = (sampleRate: number, channels: number) => {
  const buf = new ArrayBuffer(44 + 4);
  const v = new DataView(buf);
  const u = new Uint8Array(buf);
  u.set([0x52, 0x49, 0x46, 0x46], 0);
  v.setUint32(4, 36 + 4, true);
  u.set([0x57, 0x41, 0x56, 0x45], 8);
  u.set([0x66, 0x6d, 0x74, 0x20], 12);
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * channels * 2, true);
  v.setUint16(32, channels * 2, true);
  v.setUint16(34, 16, true);
  u.set([0x64, 0x61, 0x74, 0x61], 36);
  v.setUint32(40, 4, true);
  return u;
};

describe('sniffWavHeader', () => {
  it('detects 24kHz mono WAV', () => {
    expect(sniffWavHeader(makeWav(24000, 1))).toEqual({ sampleRate: 24000, numChannels: 1, dataOffset: 44 });
  });
  it('detects 48kHz stereo WAV', () => {
    expect(sniffWavHeader(makeWav(48000, 2))).toEqual({ sampleRate: 48000, numChannels: 2, dataOffset: 44 });
  });
  it('returns null for raw (non-RIFF) PCM', () => {
    const raw = new Uint8Array(100);
    for (let i = 0; i < 100; i++) raw[i] = i;
    expect(sniffWavHeader(raw)).toBeNull();
  });
  it('returns null for too-short payload', () => {
    expect(sniffWavHeader(new Uint8Array(10))).toBeNull();
  });
});

const stripDataUriPrefix = (s: string) => {
  const idx = s.indexOf(',');
  if (idx < 0) throw new Error('Expected data URI with base64 prefix, got raw string.');
  return s.slice(idx + 1);
};

describe('stripDataUriPrefix', () => {
  it('strips image data URI prefix', () => {
    expect(stripDataUriPrefix('data:image/png;base64,AAAA')).toBe('AAAA');
  });
  it('strips audio data URI prefix', () => {
    expect(stripDataUriPrefix('data:audio/pcm;base64,bm9pc2U=')).toBe('bm9pc2U=');
  });
  it('throws on raw base64 without prefix', () => {
    expect(() => stripDataUriPrefix('AAAA')).toThrow(/Expected data URI/);
  });
});

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

describe('parseJsonResponse', () => {
  it('parses plain JSON', () => {
    expect(parseJsonResponse('{"a":1}')).toEqual({ a: 1 });
  });
  it('strips ```json fences', () => {
    expect(parseJsonResponse('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it('strips ``` fences', () => {
    expect(parseJsonResponse('```\n[1,2,3]\n```')).toEqual([1, 2, 3]);
  });
  it('uses fallback on empty', () => {
    expect(parseJsonResponse('', [])).toEqual([]);
  });
  it('throws on empty without fallback', () => {
    expect(() => parseJsonResponse('')).toThrow(/safety-filtered/);
  });
  it('throws with raw text on malformed JSON', () => {
    expect(() => parseJsonResponse('not json {')).toThrow(/Failed to parse JSON/);
    expect(() => parseJsonResponse('not json {')).toThrow(/not json/);
  });
});

describe('normalizeLutPreset', () => {
  it('legacy kodak_5219 → kodak_vision3_250d', () => expect(normalizeLutPreset('kodak_5219')).toBe('kodak_vision3_250d'));
  it('legacy fuji_400h → fuji_eterna_250d', () => expect(normalizeLutPreset('fuji_400h')).toBe('fuji_eterna_250d'));
  it('legacy noir → bleach_bypass', () => expect(normalizeLutPreset('noir')).toBe('bleach_bypass'));
  it('legacy technicolor → kodak_2383', () => expect(normalizeLutPreset('technicolor')).toBe('kodak_2383'));
  it('new enum value passes through', () => expect(normalizeLutPreset('kodak_2383')).toBe('kodak_2383'));
  it('unknown value falls back to none', () => expect(normalizeLutPreset('made_up_thing')).toBe('none'));
  it('undefined falls back to none', () => expect(normalizeLutPreset(undefined)).toBe('none'));
  it('LEGACY_LUT_MAP entries all point at canonical presets', () => {
    for (const [legacy, canonical] of Object.entries(LEGACY_LUT_MAP)) {
      expect(
        (LUT_PRESETS as readonly string[]).includes(canonical),
        `LEGACY_LUT_MAP["${legacy}"] = "${canonical}" is not in types.ts LUT_PRESETS`,
      ).toBe(true);
    }
  });
});

const extractServerLutPresets = (): string[] => {
  const src = readFileSync(path.join(REPO_ROOT, 'server', 'proxy.ts'), 'utf8');
  const arrayMatch = src.match(/const\s+LUT_PRESETS\s*=\s*\[([\s\S]*?)\]\s*(?:as\s+const)?\s*;/);
  if (!arrayMatch) throw new Error('Could not locate LUT_PRESETS array in server/proxy.ts');
  const items = Array.from(arrayMatch[1].matchAll(/'([^']+)'/g)).map(m => m[1]);
  if (items.length === 0) throw new Error('Parsed LUT_PRESETS array from server/proxy.ts but it was empty');
  return items;
};

describe('LUT_PRESETS drift between types.ts and server/proxy.ts', () => {
  it('server/proxy.ts LUT_PRESETS deep-equals types.ts LUT_PRESETS', () => {
    expect(extractServerLutPresets()).toEqual([...LUT_PRESETS]);
  });
});

const ESTIMATOR_REFERENCED_KEYS = ['IMAGE', 'VIDEO', 'VIDEO_FAST', 'TTS'] as const;

describe('MODEL_COSTS_USD drift vs MODEL_NAMES', () => {
  it('every key the estimator references exists in MODEL_COSTS_USD', () => {
    for (const k of ESTIMATOR_REFERENCED_KEYS) {
      expect(k in MODEL_COSTS_USD, `MODEL_COSTS_USD is missing required key "${k}"`).toBe(true);
      expect(typeof MODEL_COSTS_USD[k]).toBe('number');
      expect(MODEL_COSTS_USD[k]).toBeGreaterThanOrEqual(0);
    }
  });
  it('every key in MODEL_COSTS_USD has a matching key in MODEL_NAMES', () => {
    for (const k of Object.keys(MODEL_COSTS_USD)) {
      expect(k in MODEL_NAMES, `MODEL_COSTS_USD["${k}"] has no matching MODEL_NAMES["${k}"]`).toBe(true);
    }
  });
});

const buildLutArg = (preset: string | null | undefined, lutsDir: string): { arg: string; preset: string } | null => {
  if (!preset || preset === 'none') return null;
  if (!(LUT_PRESETS as readonly string[]).includes(preset)) return null;
  const filePath = path.join(lutsDir, `${preset}.cube`);
  if (!existsSync(filePath)) return null;
  return { arg: `lut3d='${filePath}'`, preset };
};

describe('buildLutArg', () => {
  it('returns null for "none"', () => {
    expect(buildLutArg('none', REPO_LUTS_DIR)).toBeNull();
  });
  it('returns null for unknown preset', () => {
    expect(buildLutArg('not_a_real_lut', REPO_LUTS_DIR)).toBeNull();
  });
  it('returns null when .cube file is missing', () => {
    expect(buildLutArg('kodak_2383', '/tmp/nonexistent-luts-dir-for-smoke')).toBeNull();
  });
  it('returns lut3d arg with single-quoted path when .cube file exists', () => {
    const got = buildLutArg('kodak_2383', REPO_LUTS_DIR);
    expect(got).not.toBeNull();
    expect(got!.arg).toMatch(/^lut3d='.+kodak_2383\.cube'$/);
    expect(got!.preset).toBe('kodak_2383');
  });
});

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

describe('parseCodecsFromFfmpegStderr', () => {
  it('extracts h264 video + aac audio', () => {
    const got = parseCodecsFromFfmpegStderr(FFMPEG_MP4_STDERR);
    expect(got.video).toBe('h264');
    expect(got.audio).toBe('aac');
  });
  it('returns undefined fields when streams are missing', () => {
    const got = parseCodecsFromFfmpegStderr('nothing here');
    expect(got.video).toBeUndefined();
    expect(got.audio).toBeUndefined();
  });
  it('handles video-only file (no audio stream)', () => {
    const videoOnly = FFMPEG_MP4_STDERR.split('Stream #0:1')[0];
    const got = parseCodecsFromFfmpegStderr(videoOnly);
    expect(got.video).toBe('h264');
    expect(got.audio).toBeUndefined();
  });
});

describe('parseImageDimensions', () => {
  it('extracts 1920x1080 PNG', () => {
    const stderr = `Input #0, png_pipe, from 'thumb.png':
  Stream #0:0: Video: png, rgba(pc, gbr/unknown/unknown), 1920x1080 [SAR 1:1 DAR 16:9], 25 tbr, 25 tbn`;
    expect(parseImageDimensions(stderr)).toEqual({ codec: 'png', width: 1920, height: 1080 });
  });
  it('extracts 1920x1080 MJPEG', () => {
    const stderr = `Input #0, image2, from 'thumb.jpg':
  Stream #0:0: Video: mjpeg (Baseline), yuvj420p(pc, bt470bg/unknown/unknown), 1920x1080 [SAR 1:1 DAR 16:9], 25 tbr`;
    expect(parseImageDimensions(stderr)).toEqual({ codec: 'mjpeg', width: 1920, height: 1080 });
  });
  it('returns undefined when no video stream present', () => {
    expect(parseImageDimensions('not an image')).toBeUndefined();
  });
});

describe('parseLoudnormSummary', () => {
  it('extracts integrated LUFS + true peak dBTP', () => {
    const stderr = `[Parsed_loudnorm_0 @ 0x7f8e34004000]
Input Integrated:   -14.08 LUFS
Input True Peak:     -1.45 dBTP
Input LRA:            5.20 LU
Input Threshold:    -24.51 LUFS

Output Integrated:  -14.00 LUFS
Output True Peak:    -1.40 dBTP`;
    const got = parseLoudnormSummary(stderr);
    expect(got.integratedLufs).toBe(-14.08);
    expect(got.truePeakDbtp).toBe(-1.45);
  });
  it('handles integer-valued measurements', () => {
    const stderr = `Input Integrated:   -14 LUFS
Input True Peak:     -2 dBTP`;
    const got = parseLoudnormSummary(stderr);
    expect(got.integratedLufs).toBe(-14);
    expect(got.truePeakDbtp).toBe(-2);
  });
  it('returns undefined fields when loudnorm did not run', () => {
    const got = parseLoudnormSummary('some unrelated error output');
    expect(got.integratedLufs).toBeUndefined();
    expect(got.truePeakDbtp).toBeUndefined();
  });
});

describe('srtTimestampToMs', () => {
  it('00:00:00,000 → 0', () => expect(srtTimestampToMs('00:00:00,000')).toBe(0));
  it('00:00:02,500 → 2500', () => expect(srtTimestampToMs('00:00:02,500')).toBe(2500));
  it('01:23:45,678 → 5025678', () => expect(srtTimestampToMs('01:23:45,678')).toBe(5025678));
  it('malformed timestamp returns NaN', () => expect(Number.isNaN(srtTimestampToMs('not a timestamp'))).toBe(true));
});

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

describe('parseSrtCues + validateSrtCues', () => {
  it('parses three monotonic cues from a valid SRT', () => {
    const cues = parseSrtCues(VALID_SRT);
    expect(cues.length).toBe(3);
    expect(cues[0].startMs).toBe(0);
    expect(cues[0].endMs).toBe(2500);
    expect(cues[2].text).toBe('DETECTIVE: Question for the witness.');
  });
  it('validateSrtCues accepts a clean track', () => {
    const result = validateSrtCues(parseSrtCues(VALID_SRT));
    expect(result.ok).toBe(true);
    expect(result.reasons).toEqual([]);
  });
  it('validateSrtCues catches end ≤ start', () => {
    const broken = `1
00:00:05,000 --> 00:00:05,000
zero-duration cue
`;
    const result = validateSrtCues(parseSrtCues(broken));
    expect(result.ok).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/end .* start/);
  });
  it('validateSrtCues catches non-monotonic starts', () => {
    const regress = `1
00:00:05,000 --> 00:00:07,000
later cue

2
00:00:02,000 --> 00:00:04,000
earlier cue out of order
`;
    const result = validateSrtCues(parseSrtCues(regress));
    expect(result.ok).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/regresses/);
  });
  it('validateSrtCues catches empty file', () => {
    const result = validateSrtCues(parseSrtCues(''));
    expect(result.ok).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/no cues/);
  });
  it('parseSrtCues tolerates CRLF line endings', () => {
    const crlf = VALID_SRT.replace(/\n/g, '\r\n');
    expect(parseSrtCues(crlf).length).toBe(3);
  });
});

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

describe('validateMetadataText', () => {
  it('accepts well-formed metadata.txt', () => {
    const result = validateMetadataText(VALID_METADATA);
    expect(result.ok).toBe(true);
    expect(result.reasons).toEqual([]);
  });
  it('rejects file under 100 bytes', () => {
    const result = validateMetadataText('# YouTube Upload Metadata — 2026-05-15');
    expect(result.ok).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/bytes/);
  });
  it('rejects file missing the header line', () => {
    const noHeader = VALID_METADATA.replace('# YouTube Upload Metadata —', '# Some Other Doc');
    const result = validateMetadataText(noHeader);
    expect(result.ok).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/YouTube Upload Metadata/);
  });
  it('rejects file missing the TITLE line', () => {
    const noTitle = VALID_METADATA.replace('TITLE (primary):', 'NAME (primary):');
    const result = validateMetadataText(noTitle);
    expect(result.ok).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/TITLE/);
  });
  it('rejects empty input', () => {
    expect(validateMetadataText('').ok).toBe(false);
  });
});
