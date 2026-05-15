#!/usr/bin/env node
// Mechanical checks for the "YouTube-ready" verification checklist at
// docs/superpowers/specs/2026-05-14-youtube-quality-plan.md §6.
//
// Wraps the bundled ffmpeg-static binary to verify codecs, loudness, true
// peak, thumbnail dimensions, and the structural shape of the SRT + metadata
// exports. Items 1 (visual playback), 8 (3-min render stability), and 9
// (YouTube upload preview) remain manual.
//
// Usage:
//   node scripts/verify-mp4.mjs --mp4 <path> [--srt <path>] \
//                               [--thumbnail <path>] [--metadata <path>]
//
// Each invoked check prints PASS/FAIL with the measured value. Exits non-zero
// if any check fails so the runbook can paste-and-stop on a regression.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// ffmpeg-static returns the absolute path to the bundled binary. Same
// resolution path as server/proxy.ts so we share the project's installed
// version rather than depending on a system ffmpeg.
let FFMPEG_BIN = null;
try { FFMPEG_BIN = require('ffmpeg-static'); } catch { /* handled at call time */ }

// ---------------------------------------------------------------------------
// Pure parsers — exported so scripts/smoke-helpers.test.mjs can cover them
// without needing real ffmpeg fixtures.
// ---------------------------------------------------------------------------

// ffmpeg prints `Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x...)`
// and similar for audio. Capture the codec token immediately after
// `Video:`/`Audio:`. Returns {video, audio} with undefined for missing.
export function parseCodecsFromFfmpegStderr(stderr) {
  const videoMatch = stderr.match(/Stream #\d+:\d+[^\n]*?Video:\s*([a-z0-9_]+)/i);
  const audioMatch = stderr.match(/Stream #\d+:\d+[^\n]*?Audio:\s*([a-z0-9_]+)/i);
  return {
    video: videoMatch ? videoMatch[1].toLowerCase() : undefined,
    audio: audioMatch ? audioMatch[1].toLowerCase() : undefined,
  };
}

// ffmpeg's image stream lines look like:
//   `Stream #0:0: Video: png, rgba(pc, gbr/unknown/unknown), 1920x1080 [SAR 1:1 DAR 16:9]`
//   `Stream #0:0: Video: mjpeg (Baseline), yuvj420p(...), 1920x1080`
export function parseImageDimensions(stderr) {
  const m = stderr.match(/Stream #\d+:\d+[^\n]*?Video:\s*([a-z0-9_]+)[^\n]*?\b(\d{2,5})x(\d{2,5})\b/i);
  if (!m) return undefined;
  return { codec: m[1].toLowerCase(), width: Number(m[2]), height: Number(m[3]) };
}

// `loudnorm=print_format=summary` writes a block like:
//   [Parsed_loudnorm_0 @ ...]
//   Input Integrated:   -14.5 LUFS
//   Input True Peak:     -1.8 dBTP
//   Input LRA:            5.0 LU
//   Input Threshold:    -24.7 LUFS
//   ...
// We measure the **input** (the MP4 we're verifying) — output values
// reflect what loudnorm *would* re-normalize to, which isn't useful here.
export function parseLoudnormSummary(stderr) {
  const lufs = stderr.match(/Input Integrated:\s*(-?\d+(?:\.\d+)?)\s*LUFS/);
  const dbtp = stderr.match(/Input True Peak:\s*(-?\d+(?:\.\d+)?)\s*dBTP/);
  return {
    integratedLufs: lufs ? Number(lufs[1]) : undefined,
    truePeakDbtp: dbtp ? Number(dbtp[1]) : undefined,
  };
}

// SRT timestamp `HH:MM:SS,mmm` (comma decimal) → milliseconds. Mirrors
// formatSrtTime in components/Renderer.tsx. Returns NaN on malformed input.
export function srtTimestampToMs(ts) {
  const m = ts.match(/^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/);
  if (!m) return NaN;
  return Number(m[1]) * 3_600_000 + Number(m[2]) * 60_000 + Number(m[3]) * 1000 + Number(m[4]);
}

// Parse SRT into cues. Tolerant of trailing whitespace and CRLF line
// endings. Each cue must have an index line, a `start --> end` timing line,
// and one or more text lines. Cues are separated by blank lines.
export function parseSrtCues(text) {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalized) return [];
  const blocks = normalized.split(/\n{2,}/);
  const cues = [];
  for (const block of blocks) {
    const lines = block.split('\n').filter(l => l.length > 0);
    if (lines.length < 2) continue;
    const idx = Number(lines[0]);
    const timingMatch = lines[1].match(/^(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})$/);
    if (!Number.isFinite(idx) || !timingMatch) continue;
    cues.push({
      index: idx,
      startMs: srtTimestampToMs(timingMatch[1]),
      endMs: srtTimestampToMs(timingMatch[2]),
      text: lines.slice(2).join('\n'),
    });
  }
  return cues;
}

// Returns {ok, reasons[]}. Each cue must have end > start, and start times
// must be monotonically non-decreasing across the file.
export function validateSrtCues(cues) {
  const reasons = [];
  if (cues.length === 0) reasons.push('no cues parsed');
  let prevStart = -1;
  for (const c of cues) {
    if (!Number.isFinite(c.startMs) || !Number.isFinite(c.endMs)) {
      reasons.push(`cue ${c.index}: malformed timestamp`);
      continue;
    }
    if (c.endMs <= c.startMs) reasons.push(`cue ${c.index}: end (${c.endMs}) ≤ start (${c.startMs})`);
    if (c.startMs < prevStart) reasons.push(`cue ${c.index}: start ${c.startMs} regresses from previous ${prevStart}`);
    prevStart = c.startMs;
  }
  return { ok: reasons.length === 0, reasons };
}

// The metadata.txt format is locked by Renderer.tsx handleDownloadMetadata.
// We anchor on the header comment line (line 1) which is the most
// distinctive identifier — it's unlikely to appear by accident.
export function validateMetadataText(text) {
  const reasons = [];
  if (!text || text.length < 100) reasons.push(`only ${text?.length ?? 0} bytes (expected ≥ 100)`);
  if (!/^# YouTube Upload Metadata —/m.test(text)) reasons.push('missing "# YouTube Upload Metadata —" header line');
  if (!/^TITLE \(primary\):/m.test(text)) reasons.push('missing "TITLE (primary):" line');
  return { ok: reasons.length === 0, reasons };
}

// ---------------------------------------------------------------------------
// Check runners — call ffmpeg, parse, push results.
// ---------------------------------------------------------------------------

function record(results, label, pass, detail) {
  results.push({ label, pass, detail });
}

function runFfmpeg(args) {
  if (!FFMPEG_BIN) {
    throw new Error('ffmpeg-static binary not resolvable — is the package installed?');
  }
  const r = spawnSync(FFMPEG_BIN, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  // ffmpeg prints most diagnostic info on stderr regardless of exit code.
  // We tolerate non-zero exits for probe-only invocations because `-i` with
  // no output target legitimately exits 1.
  return { stdout: r.stdout || '', stderr: r.stderr || '', status: r.status };
}

function checkVideo(mp4Path, results) {
  // `ffmpeg -i <file>` with no output forces ffmpeg to print stream info on
  // stderr then exit 1 — the canonical "probe" idiom when ffprobe is absent.
  const { stderr } = runFfmpeg(['-hide_banner', '-i', mp4Path]);
  const { video, audio } = parseCodecsFromFfmpegStderr(stderr);
  record(results, 'Video codec is H.264', video === 'h264', `got ${video ?? '<none>'}`);
  record(results, 'Audio codec is AAC', audio === 'aac', `got ${audio ?? '<none>'}`);
}

function checkLoudnorm(mp4Path, results) {
  const { stderr } = runFfmpeg([
    '-hide_banner', '-nostats',
    '-i', mp4Path,
    '-af', 'loudnorm=print_format=summary',
    '-f', 'null', '-',
  ]);
  const { integratedLufs, truePeakDbtp } = parseLoudnormSummary(stderr);
  if (typeof integratedLufs === 'number') {
    const delta = Math.abs(integratedLufs - (-14));
    record(
      results,
      'Integrated loudness within ±0.5 LU of -14 LUFS',
      delta <= 0.5,
      `${integratedLufs.toFixed(2)} LUFS (Δ ${delta.toFixed(2)})`,
    );
  } else {
    record(results, 'Integrated loudness within ±0.5 LU of -14 LUFS', false, 'could not parse loudnorm output');
  }
  if (typeof truePeakDbtp === 'number') {
    record(
      results,
      'True peak ≤ -1.0 dBTP',
      truePeakDbtp <= -1.0,
      `${truePeakDbtp.toFixed(2)} dBTP`,
    );
  } else {
    record(results, 'True peak ≤ -1.0 dBTP', false, 'could not parse loudnorm output');
  }
}

function checkSrt(srtPath, results) {
  const text = readFileSync(srtPath, 'utf8');
  const cues = parseSrtCues(text);
  const { ok, reasons } = validateSrtCues(cues);
  record(
    results,
    'SRT structurally valid',
    ok,
    ok ? `${cues.length} cues, monotonic, end > start` : reasons.join('; '),
  );
}

function checkThumbnail(thumbPath, results) {
  const { stderr } = runFfmpeg(['-hide_banner', '-i', thumbPath]);
  const dim = parseImageDimensions(stderr);
  if (!dim) {
    record(results, 'Thumbnail is 1920×1080 PNG/JPEG', false, 'could not parse image stream');
    return;
  }
  const isPngOrJpeg = dim.codec === 'png' || dim.codec === 'mjpeg' || dim.codec === 'jpeg';
  const isFullHd = dim.width === 1920 && dim.height === 1080;
  record(
    results,
    'Thumbnail is 1920×1080 PNG/JPEG',
    isPngOrJpeg && isFullHd,
    `${dim.width}×${dim.height} ${dim.codec}`,
  );
}

function checkMetadata(metaPath, results) {
  const text = readFileSync(metaPath, 'utf8');
  const { ok, reasons } = validateMetadataText(text);
  record(
    results,
    'Metadata .txt has expected header + title block',
    ok,
    ok ? `${text.length} bytes, header + TITLE present` : reasons.join('; '),
  );
}

// ---------------------------------------------------------------------------
// CLI plumbing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const out = { mp4: null, srt: null, thumbnail: null, metadata: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') { out.help = true; continue; }
    if (a === '--mp4') { out.mp4 = argv[++i]; continue; }
    if (a === '--srt') { out.srt = argv[++i]; continue; }
    if (a === '--thumbnail') { out.thumbnail = argv[++i]; continue; }
    if (a === '--metadata') { out.metadata = argv[++i]; continue; }
    throw new Error(`Unknown argument: ${a}`);
  }
  return out;
}

function printHelp() {
  const usage = `verify-mp4.mjs — YouTube-ready verification

Usage:
  node scripts/verify-mp4.mjs --mp4 <path> [--srt <path>] \\
                              [--thumbnail <path>] [--metadata <path>]

Runs the mechanical checks (items 2-7) from the YouTube-ready checklist.
Each check prints PASS/FAIL with the measured value. Exits non-zero on
any failure so the runbook can paste-and-stop on a regression.

Items left manual:
  1. .mp4 plays in QuickTime, VLC, and a <video> element
  8. 3-minute project renders without browser crash
  9. YouTube upload — preview plays with voice + music + ambient + captions

The MP4 path is required; the other three are optional — pass each one as
its respective artifact becomes available from the renderer.`;
  console.log(usage);
}

function printSummary(results, dateIso) {
  console.log(`\n=== YouTube-Ready Verification — ${dateIso} ===\n`);
  for (const r of results) {
    const tag = r.pass ? '[PASS]' : '[FAIL]';
    console.log(`  ${tag} ${r.label}${r.detail ? ` — ${r.detail}` : ''}`);
  }
  const passed = results.filter(r => r.pass).length;
  console.log(`\nSummary: ${passed} / ${results.length} checks passed`);
}

function main(argv) {
  let args;
  try { args = parseArgs(argv); }
  catch (e) { console.error(e.message); printHelp(); return 2; }

  if (args.help) { printHelp(); return 0; }

  if (!args.mp4) {
    console.error('error: --mp4 is required');
    printHelp();
    return 2;
  }

  for (const [flag, p] of [['--mp4', args.mp4], ['--srt', args.srt], ['--thumbnail', args.thumbnail], ['--metadata', args.metadata]]) {
    if (p && !existsSync(p)) {
      console.error(`error: ${flag} path does not exist: ${p}`);
      return 2;
    }
  }

  if (!FFMPEG_BIN) {
    console.error('error: ffmpeg-static binary not resolvable. Run `npm install` first.');
    return 2;
  }

  const results = [];
  checkVideo(args.mp4, results);
  checkLoudnorm(args.mp4, results);
  if (args.srt) checkSrt(args.srt, results);
  if (args.thumbnail) checkThumbnail(args.thumbnail, results);
  if (args.metadata) checkMetadata(args.metadata, results);

  printSummary(results, new Date().toISOString().slice(0, 10));
  return results.some(r => !r.pass) ? 1 : 0;
}

// Only run when invoked directly (not when imported by smoke-helpers.test.mjs).
const invokedDirectly = (() => {
  if (!process.argv[1]) return false;
  const argvUrl = new URL(`file://${process.argv[1]}`).href;
  return import.meta.url === argvUrl;
})();
if (invokedDirectly) {
  process.exit(main(process.argv.slice(2)));
}
