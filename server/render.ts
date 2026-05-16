import type { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import ffmpegStatic from 'ffmpeg-static';
import { downloadVeoToFile } from './veoDownload.js';

// Resolve the LUTs directory relative to this module so the render handler
// can locate the same `.cube` files /api/transcode uses (G9). Lives in
// `public/luts/` so the Vite dev server can also serve them.
const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const LUTS_DIR = path.resolve(SERVER_DIR, '..', 'public', 'luts');

// Mirrors `LUT_PRESETS` in `types.ts` — duplicated to keep server/ tsconfig
// from pulling parent files. Kept in lockstep manually; the validator
// surfaces drift quickly because unknown LUTs silently downgrade to none.
const KNOWN_LUTS = new Set([
    'kodak_vision3_250d',
    'fuji_eterna_250d',
    'kodak_2383',
    'arri_logc_to_rec709',
    'bleach_bypass',
]);

// G10 (audit slice) — server-side compose pipeline. Replaces the browser's
// MediaRecorder for projects long enough that single-pass canvas recording
// is unreliable. Slice 6b ships: manifest validation + per-scene Veo
// download + ffmpeg concat → single MP4 streamed back to the client. Audio
// mix (6c) and effects pass (6d) land in subsequent slices.

// Mirrors the public schema in `types.ts` (re-declared here to keep
// server/ tsconfig from pulling parent files). Any change to the public
// `RenderManifest` must be reflected here AND a `schemaVersion` bump.
export interface ServerRenderManifest {
    schemaVersion: 1;
    projectId: string;
    aspectRatio: '16:9' | '9:16' | '1:1';
    resolution: '720p' | '1080p';
    globalStyle?: string;
    scenes: Array<{
        id: string;
        videoUri: string;
        audioBase64?: string;
        estimatedDuration: number;
        transitionToNext?: 'fade' | 'cut' | 'dissolve' | 'wipe';
        mood?: string;
    }>;
    mastering: {
        lutPreset?: string;
        musicVolume: number;
        voiceVolume: number;
        ambientVolume: number;
        filmGrain: number;
        vignetteIntensity: number;
    };
}

const ASPECT_RATIOS = new Set(['16:9', '9:16', '1:1']);
const RESOLUTIONS = new Set(['720p', '1080p']);
const TRANSITIONS = new Set(['fade', 'cut', 'dissolve', 'wipe']);

// Pure validator so the route handler can call it before touching ffmpeg.
// Returns the typed manifest on success or a string with the first failure
// (used directly as the 400 response body so callers see WHY the manifest
// was rejected, not just a generic message).
export const validateManifest = (raw: unknown): { ok: true; manifest: ServerRenderManifest } | { ok: false; error: string } => {
    if (!raw || typeof raw !== 'object') return { ok: false, error: 'manifest must be a JSON object' };
    const m = raw as Record<string, unknown>;

    if (m.schemaVersion !== 1) return { ok: false, error: `unsupported schemaVersion (got ${String(m.schemaVersion)}, expected 1)` };
    if (typeof m.projectId !== 'string' || !m.projectId) return { ok: false, error: 'projectId is required' };
    if (typeof m.aspectRatio !== 'string' || !ASPECT_RATIOS.has(m.aspectRatio)) return { ok: false, error: `aspectRatio must be one of ${[...ASPECT_RATIOS].join(', ')}` };
    if (typeof m.resolution !== 'string' || !RESOLUTIONS.has(m.resolution)) return { ok: false, error: `resolution must be one of ${[...RESOLUTIONS].join(', ')}` };

    if (!Array.isArray(m.scenes) || m.scenes.length === 0) return { ok: false, error: 'scenes must be a non-empty array' };
    for (let i = 0; i < m.scenes.length; i++) {
        const s = m.scenes[i] as Record<string, unknown>;
        if (!s || typeof s !== 'object') return { ok: false, error: `scenes[${i}] must be an object` };
        if (typeof s.id !== 'string' || !s.id) return { ok: false, error: `scenes[${i}].id is required` };
        if (typeof s.videoUri !== 'string' || !s.videoUri) return { ok: false, error: `scenes[${i}].videoUri is required` };
        if (typeof s.estimatedDuration !== 'number' || !(s.estimatedDuration > 0)) return { ok: false, error: `scenes[${i}].estimatedDuration must be > 0` };
        if (s.audioBase64 !== undefined && typeof s.audioBase64 !== 'string') return { ok: false, error: `scenes[${i}].audioBase64 must be a string when present` };
        if (s.transitionToNext !== undefined && (typeof s.transitionToNext !== 'string' || !TRANSITIONS.has(s.transitionToNext))) {
            return { ok: false, error: `scenes[${i}].transitionToNext must be one of ${[...TRANSITIONS].join(', ')}` };
        }
        if (s.mood !== undefined && typeof s.mood !== 'string') return { ok: false, error: `scenes[${i}].mood must be a string when present` };
    }

    const mst = m.mastering as Record<string, unknown> | undefined;
    if (!mst || typeof mst !== 'object') return { ok: false, error: 'mastering is required' };
    for (const k of ['musicVolume', 'voiceVolume', 'ambientVolume', 'filmGrain', 'vignetteIntensity'] as const) {
        const v = mst[k];
        if (typeof v !== 'number' || !(v >= 0 && v <= 1)) return { ok: false, error: `mastering.${k} must be a number in [0, 1]` };
    }
    if (mst.lutPreset !== undefined && typeof mst.lutPreset !== 'string') return { ok: false, error: 'mastering.lutPreset must be a string when present' };

    return { ok: true, manifest: raw as ServerRenderManifest };
};

// Run an ffmpeg invocation. Resolves with collected stderr (where loudnorm/
// progress lines live) on exit code 0; rejects with the stderr tail on
// non-zero exit so the caller can surface a useful message. Mirrors the
// helper in proxy.ts — kept local to avoid cross-file coupling for the
// render module.
const runFfmpeg = (ffmpegPath: string, args: string[]): Promise<string> => new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args);
    let stderr = '';
    proc.stderr.on('data', chunk => { stderr += chunk.toString(); });
    proc.on('error', reject);
    proc.on('exit', code => {
        if (code === 0) resolve(stderr);
        else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-500)}`));
    });
});

// Builds the ffmpeg concat-demuxer list file content. Exported for tests so
// the quoting / escaping rules can be verified without invoking ffmpeg.
export const buildConcatList = (inputPaths: string[]): string =>
    inputPaths.map(p => `file '${p.replace(/'/g, `'\\''`)}'`).join('\n');

// Strip a `data:audio/…;base64,` prefix if the client sent one. Either form
// reaches the server depending on whether the asset was a fresh TTS blob or
// loaded from IDB.
export const stripBase64Prefix = (b64OrDataUri: string): string => {
    const commaIdx = b64OrDataUri.indexOf(',');
    return commaIdx >= 0 && b64OrDataUri.startsWith('data:') ? b64OrDataUri.slice(commaIdx + 1) : b64OrDataUri;
};

export interface AudioInput {
    /** Path to the WAV/OGG/etc file on disk. */
    path: string;
    /** Where this clip starts in the timeline (cumulative duration of all prior scenes), in ms. */
    offsetMs: number;
}

// Builds the ffmpeg `filter_complex` argument for the TTS overlay.
// Exported so the (gnarly) string assembly can be exercised without ffmpeg.
// `voiceVolume` in 0..1; applied as a `volume=…` node on each clip before
// the final amix so the user's mastering slider works server-side too.
export const buildAudioFilterGraph = (audioInputs: AudioInput[], voiceVolume: number): string => {
    if (audioInputs.length === 0) return '';
    const chains: string[] = [];
    audioInputs.forEach((a, idx) => {
        const inputIdx = idx + 1; // input 0 is the video concat list
        chains.push(
            `[${inputIdx}:a]adelay=${a.offsetMs}|${a.offsetMs},volume=${voiceVolume.toFixed(3)}[tts${idx}]`,
        );
    });
    const ttsLabels = audioInputs.map((_, idx) => `[tts${idx}]`).join('');
    const mix = `${ttsLabels}amix=inputs=${audioInputs.length}:duration=longest:normalize=0[aout]`;
    return `${chains.join(';')};${mix}`;
};

// Build the video-side filter chain for the mastering pass. Each filter is
// independently gated so a project with everything off renders without any
// extra GPU/CPU work. Exported for tests so the filter syntax can be
// verified without invoking ffmpeg. Returns an empty array when nothing
// needs to be applied (caller skips the `[0:v]…[vout]` chain altogether).
export const buildVideoFilters = (mastering: {
    vignetteIntensity: number;
    filmGrain: number;
    lutPreset?: string;
}): string[] => {
    const filters: string[] = [];

    if (mastering.vignetteIntensity > 0) {
        // ffmpeg vignette: angle in radians (PI/N). Smaller N = larger angle
        // = more vignetting. Map intensity 0..1 → angle PI/5 (subtle) .. PI/2.2 (heavy).
        const denominator = 5 - mastering.vignetteIntensity * 2.8;
        filters.push(`vignette=angle=PI/${denominator.toFixed(2)}`);
    }

    if (mastering.filmGrain > 0) {
        // noise filter alls=N where N is 0..100; 0..30 covers subtle..visible.
        // allf=t enables temporal flicker so grain doesn't look like a static layer.
        const strength = Math.max(1, Math.round(mastering.filmGrain * 30));
        filters.push(`noise=alls=${strength}:allf=t`);
    }

    if (mastering.lutPreset && KNOWN_LUTS.has(mastering.lutPreset)) {
        const lutPath = path.join(LUTS_DIR, `${mastering.lutPreset}.cube`);
        if (fs.existsSync(lutPath)) {
            // Single-quote escape per ffmpeg lut3d syntax — handles spaces/
            // colons in absolute paths on Windows / WSL.
            filters.push(`lut3d='${lutPath.replace(/'/g, `'\\''`)}'`);
        }
    }

    return filters;
};

// Pure compose step: given a list of input video file paths plus per-scene
// TTS audio files (with cumulative offsets) and an output path, run the
// concat + audio-overlay + mastering ffmpeg pipeline. Re-encodes (rather
// than `-c copy`) so mismatched source codecs/levels between Veo clips
// don't surface as concat-demuxer warnings or playback artifacts. When no
// TTS is present the output is video-only (Veo clips are typically silent).
export const composeManifest = async (opts: {
    videoFiles: string[];
    audioInputs: AudioInput[];
    voiceVolume: number;
    /** Optional mastering pass — vignette / film grain / LUT3D filters built from RenderManifestMastering. */
    videoFilters?: string[];
    outputPath: string;
    concatListPath: string;
    ffmpegPath: string;
    runner?: (ffmpegPath: string, args: string[]) => Promise<string>;
}): Promise<string> => {
    const { videoFiles, audioInputs, voiceVolume, outputPath, concatListPath, ffmpegPath } = opts;
    const videoFilters = opts.videoFilters ?? [];
    const runner = opts.runner ?? runFfmpeg;
    await writeFile(concatListPath, buildConcatList(videoFiles), 'utf8');

    const args: string[] = [
        '-hide_banner', '-nostats', '-y',
        '-f', 'concat',
        '-safe', '0',
        '-i', concatListPath,
    ];

    // Append each TTS as an additional input — refers to it as input N in the filter graph.
    for (const a of audioInputs) args.push('-i', a.path);

    const hasAudio = audioInputs.length > 0;
    const hasVideoFilters = videoFilters.length > 0;
    const videoChain = hasVideoFilters ? `[0:v]${videoFilters.join(',')}[vout]` : '';
    const audioChain = hasAudio ? buildAudioFilterGraph(audioInputs, voiceVolume) : '';
    const filterComplex = [videoChain, audioChain].filter(Boolean).join(';');

    if (filterComplex) {
        args.push('-filter_complex', filterComplex);
    }
    args.push('-map', hasVideoFilters ? '[vout]' : '0:v');
    if (hasAudio) {
        args.push('-map', '[aout]');
        args.push('-c:a', 'aac', '-b:a', '192k');
    } else {
        // No TTS — drop audio entirely (source Veo clips are silent in
        // practice and pass-through would force callers to decode a no-op
        // track).
        args.push('-an');
    }

    args.push(
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-crf', '18',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        outputPath,
    );

    return runner(ffmpegPath, args);
};

// Back-compat shim for 6b's video-only callers (and tests). New code should
// use composeManifest directly.
export const composeConcat = (opts: {
    inputFiles: string[];
    outputPath: string;
    concatListPath: string;
    ffmpegPath: string;
    runner?: (ffmpegPath: string, args: string[]) => Promise<string>;
}): Promise<string> => composeManifest({
    videoFiles: opts.inputFiles,
    audioInputs: [],
    voiceVolume: 1,
    outputPath: opts.outputPath,
    concatListPath: opts.concatListPath,
    ffmpegPath: opts.ffmpegPath,
    runner: opts.runner,
});

const RENDER_TMP_DIR_PREFIX = 'render-';

export const handleRender = async (req: Request, res: Response): Promise<void> => {
    if (!ffmpegStatic) {
        res.status(503).json({ error: 'Renderer unavailable', message: 'ffmpeg binary missing from this build.' });
        return;
    }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        res.status(503).json({ error: 'Renderer unavailable', message: 'GEMINI_API_KEY not configured; cannot fetch Veo clips.' });
        return;
    }

    const v = validateManifest(req.body);
    if (!v.ok) {
        res.status(400).json({ error: 'Invalid render manifest', message: v.error });
        return;
    }
    const manifest = v.manifest;

    // Disable Node's per-request socket timeouts for long renders (same
    // reasoning as /api/transcode — see proxy.ts D5 block).
    req.setTimeout(0);
    res.setTimeout(0);

    let tmpDir: string | null = null;
    try {
        tmpDir = await mkdtemp(path.join(tmpdir(), RENDER_TMP_DIR_PREFIX));
        const sceneFiles: string[] = [];
        const audioInputs: AudioInput[] = [];
        let cumulativeMs = 0;

        // Sequential download keeps Veo upstream traffic predictable and
        // bounds peak disk use. Concurrent fetches are an obvious follow-up.
        for (let i = 0; i < manifest.scenes.length; i++) {
            const scene = manifest.scenes[i];
            const dest = path.join(tmpDir, `scene_${String(i).padStart(4, '0')}.mp4`);
            await downloadVeoToFile(scene.videoUri, apiKey, dest);
            sceneFiles.push(dest);

            // Decode the TTS blob to a tmp file if present so ffmpeg can
            // ingest it as an input. The TTS audio is anchored to this
            // scene's start, computed as the cumulative duration of all
            // prior scenes' estimatedDuration values.
            if (scene.audioBase64) {
                const audioPath = path.join(tmpDir, `tts_${String(i).padStart(4, '0')}.wav`);
                await writeFile(audioPath, Buffer.from(stripBase64Prefix(scene.audioBase64), 'base64'));
                audioInputs.push({ path: audioPath, offsetMs: cumulativeMs });
            }
            cumulativeMs += Math.round(scene.estimatedDuration * 1000);
        }

        const outputPath = path.join(tmpDir, 'out.mp4');
        const concatListPath = path.join(tmpDir, 'concat.txt');
        await composeManifest({
            videoFiles: sceneFiles,
            audioInputs,
            voiceVolume: manifest.mastering.voiceVolume,
            videoFilters: buildVideoFilters(manifest.mastering),
            outputPath,
            concatListPath,
            ffmpegPath: ffmpegStatic,
        });

        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Disposition', `attachment; filename="${manifest.projectId}.mp4"`);
        await pipeline(fs.createReadStream(outputPath), res);
    } catch (err: any) {
        console.error('Render failed:', err?.message);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Render failed', message: err?.message?.slice(0, 500) || 'unknown error' });
        }
    } finally {
        if (tmpDir) await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
};
