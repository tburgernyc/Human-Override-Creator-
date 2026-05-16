import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pipeline } from 'node:stream/promises';
import ffmpegStatic from 'ffmpeg-static';
import { PayloadTooLargeError, makeSizeGuard } from './sizeGuard.js';
import { handleRender } from './render.js';
import { fetchVeo, isAllowedDownloadUri, VeoDownloadError } from './veoDownload.js';

// Resolve `server/` directory once at module load; used for both the prod
// static-bundle path and the Phase-14 LUTs directory lookup.
const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const LUTS_DIR = path.resolve(SERVER_DIR, '..', 'public', 'luts');

const app = express();

// On Railway/Render/Fly the request reaches us through their load balancer, so
// req.ip is the LB IP unless we trust the immediate hop. Without this every
// IP looks identical to express-rate-limit, defeating per-IP limits (R7).
// `1` = trust the single hop in front of us, not arbitrary chains.
app.set('trust proxy', 1);

// Railway and most hosts set PORT; fall back to the dev port the Vite proxy expects.
const PORT = parseInt(process.env.PORT || process.env.PROXY_PORT || '3001', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD = NODE_ENV === 'production';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const IS_CONFIGURED = !!GEMINI_API_KEY;

if (!IS_CONFIGURED) {
    // Don't exit — on Railway/Render/Fly a crashing process becomes a
    // restart loop, and operators can't see logs or update env vars while
    // the container never stays up. Stay alive, surface a clear 503 from
    // the Gemini endpoints, and let the SPA serve a setup banner. (R9)
    console.error('⚠️  GEMINI_API_KEY is not set in environment variables.');
    console.error('   Server will start in degraded mode — /api/gemini/* and');
    console.error('   /api/download will return 503 until the key is configured.');
}

// Guard used by every Gemini-touching endpoint. Returns true if the request
// was handled (i.e. the caller should not proceed).
const blockIfUnconfigured = (res: express.Response): boolean => {
    if (IS_CONFIGURED) return false;
    res.status(503).json({
        error: 'Gemini API not configured',
        message: 'Server is running in degraded mode. Set GEMINI_API_KEY in the host environment and restart.',
    });
    return true;
};

// In dev the Vite dev server on :3000 calls the proxy on :3001, so allow that
// origin. In production the same Express server serves the static bundle and
// the API together, so requests are same-origin and CORS is not strictly needed.
const ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

app.use(cors({ origin: IS_PROD ? true : ALLOWED_ORIGINS }));
app.use(express.json({ limit: '50mb' }));

// Content-Security-Policy (R6). 'unsafe-inline' is required for the Tailwind
// CDN runtime and the inline <style>/<script> blocks in index.html — a future
// hardening would precompile Tailwind and drop unsafe-inline. Even with that
// compromise this constrains where assets can load from and blocks eval().
const CSP_DIRECTIVES = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com",
    "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com data:",
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob: https://upload.wikimedia.org",
    // The browser only talks to this origin; the proxy fans out to Google.
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
].join('; ');
app.use((_req, res, next) => {
    res.setHeader('Content-Security-Policy', CSP_DIRECTIVES);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
});

// Health check — used by Railway's healthchecks and local diagnostics. Always
// returns 200 so the host doesn't restart-loop a degraded container; the
// status field reports whether the API key is configured. (R9)
//
// With ?deep=1 the handler also pings Gemini's models.list to verify upstream
// reachability + that the key isn't revoked/expired. Result is cached for 60s
// so a Railway healthcheck every 30s doesn't burn quota. (R8)
const UPSTREAM_PING_CACHE_MS = 60_000;
const UPSTREAM_PING_TIMEOUT_MS = 8_000;
type UpstreamPing = { ok: boolean; status?: number; checkedAt: number; error?: string };
let upstreamPingCache: UpstreamPing | null = null;

const pingGeminiUpstream = async (): Promise<UpstreamPing> => {
    const now = Date.now();
    if (upstreamPingCache && now - upstreamPingCache.checkedAt < UPSTREAM_PING_CACHE_MS) {
        return upstreamPingCache;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), UPSTREAM_PING_TIMEOUT_MS);
    try {
        const url = new URL('https://generativelanguage.googleapis.com/v1beta/models');
        url.searchParams.set('key', GEMINI_API_KEY!);
        const resp = await fetch(url.toString(), { signal: ctrl.signal });
        upstreamPingCache = { ok: resp.ok, status: resp.status, checkedAt: now };
    } catch (e: any) {
        upstreamPingCache = { ok: false, checkedAt: now, error: e?.message || 'fetch failed' };
    } finally {
        clearTimeout(timer);
    }
    return upstreamPingCache;
};

app.get('/api/health', async (req, res) => {
    const body: any = {
        status: IS_CONFIGURED ? 'ok' : 'degraded',
        hasKey: IS_CONFIGURED,
        env: NODE_ENV,
    };
    if (req.query.deep === '1' && IS_CONFIGURED) {
        const ping = await pingGeminiUpstream();
        body.upstream = {
            reachable: ping.ok,
            httpStatus: ping.status,
            error: ping.error,
            cachedAgeMs: Date.now() - ping.checkedAt,
        };
        if (!ping.ok) body.status = 'upstream_unreachable';
    }
    res.json(body);
});

// Per-IP rate limit on Gemini-touching endpoints (R7). Without this, anyone
// who can reach the server can drain the API key. Sliding 60 req/min/IP is
// generous for the legitimate batch-render case (parallel scene generation)
// while preventing scripted abuse.
const geminiLimiter = rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Rate limit exceeded', message: 'Too many Gemini requests; try again in a minute.' },
});

// Proxy all Gemini API requests — the key is injected server-side. Express 5 +
// path-to-regexp v8 require named splats (the bare `*` from Express 4 is no
// longer valid syntax and crashes server startup).
app.all('/api/gemini/*tail', geminiLimiter, async (req, res) => {
    if (blockIfUnconfigured(res)) return;
    try {
        // Use req.path instead of req.params to be compatible with Express 4 & 5 wildcard semantics.
        const targetPath = req.path.slice('/api/gemini/'.length);
        const baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
        const url = new URL(`${baseUrl}/${targetPath}`);
        url.searchParams.set('key', GEMINI_API_KEY!);

        // Forward all original query params except key
        for (const [key, value] of Object.entries(req.query)) {
            if (key !== 'key') url.searchParams.set(key, value as string);
        }

        const fetchOptions: RequestInit = {
            method: req.method,
            headers: { 'Content-Type': 'application/json' },
        };

        if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
            fetchOptions.body = JSON.stringify(req.body);
        }

        const response = await fetch(url.toString(), fetchOptions);
        const data = await response.text();

        if (!response.ok) {
            // Build a redacted URL (strip the API key) for safe logging. The
            // upstream URL is the most useful debug signal for 4xx/5xx but
            // includes our key in the query string.
            const safeUrl = new URL(url.toString());
            safeUrl.searchParams.delete('key');
            const bodyPreview = fetchOptions.body
                ? `\n  body: ${String(fetchOptions.body).slice(0, 300)}`
                : '';
            console.warn(
                `Gemini upstream error ${response.status} ${response.statusText || ''}\n` +
                `  ${req.method} ${safeUrl.toString()}${bodyPreview}\n` +
                `  resp: ${data.slice(0, 300)}`
            );
        }

        res.status(response.status)
            .set('Content-Type', response.headers.get('Content-Type') || 'application/json')
            .send(data);
    } catch (error: any) {
        console.error('Proxy error:', error.message);
        res.status(500).json({ error: 'Proxy request failed', details: error.message });
    }
});

// Secure video/file download endpoint — injects API key server-side so the
// client never holds it. URI validation + authenticated fetch live in
// `veoDownload.ts` so `/api/render` can reuse them.
// On Railway, request timeouts are generous enough that large Veo downloads
// complete without the per-request limits that constrain serverless deployments.
app.get('/api/download', geminiLimiter, async (req, res) => {
    if (blockIfUnconfigured(res)) return;
    const uri = req.query.uri as string;
    if (!uri || !isAllowedDownloadUri(uri)) {
        return res.status(400).json({ error: 'Invalid or missing URI' });
    }
    try {
        const response = await fetchVeo(uri, GEMINI_API_KEY!);

        res.status(response.status);
        const contentType = response.headers.get('Content-Type');
        if (contentType) res.setHeader('Content-Type', contentType);
        // Stream the body instead of buffering — keeps memory flat for large videos.
        if (response.body) {
            const reader = response.body.getReader();
            const pump = async () => {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    res.write(Buffer.from(value));
                }
                res.end();
            };
            await pump();
        } else {
            const buffer = await response.arrayBuffer();
            res.send(Buffer.from(buffer));
        }
    } catch (error: any) {
        if (error instanceof VeoDownloadError && error.status) {
            console.warn(`Download upstream error ${error.status}: ${error.message}`);
            return res.status(error.status).json({ error: 'Upstream fetch failed', status: error.status, details: error.message });
        }
        console.error('Download proxy error:', error.message);
        res.status(500).json({ error: 'Download proxy failed', details: error.message });
    }
});

// MP4 transcode (G1/G2/G3 — Phase 12). Accepts a WebM blob, returns an MP4
// with H.264 + AAC, +faststart for streaming playback, and a two-pass
// loudnorm filter targeting -14 LUFS integrated / -1 dBTP. The two-pass
// approach (measure → apply) hits the target within ±0.5 LU, vs single-pass
// which can drift by 1-2 LU on dynamic material.
//
// Streaming end-to-end isn't possible because (a) loudnorm pass 2 needs to
// re-read the input and (b) +faststart needs ffmpeg to rewrite the moov atom
// at the file head. We write to a temp dir (Railway has writable /tmp) and
// clean up in a `finally` so failures don't leak.

// Stricter rate limit than the Gemini endpoints — transcode is CPU-heavy and
// a small handful of concurrent calls can pin a shared host.
const transcodeLimiter = rateLimit({
    windowMs: 60_000,
    limit: 6,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Transcode rate limit exceeded', message: 'Too many transcode requests; try again in a minute.' },
});

// D5 (audit slice) — hard upper cap on raw request bodies that hit
// `/api/transcode`. A streaming WebM upload could otherwise run forever and
// fill the tmp disk. 500 MB covers any realistic in-app export (~10 min of
// 1080p WebM at our bitrate) while still cutting off pathological clients.
// The Transform + sentinel error live in `sizeGuard.ts` so vitest can cover
// them without spinning up Express.
const MAX_TRANSCODE_BODY_BYTES = 500 * 1024 * 1024;

// Run an ffmpeg invocation. Resolves with collected stderr (where loudnorm
// prints its JSON measurements) on exit code 0; rejects with the stderr tail
// on non-zero exit so the caller can surface a useful message.
const runFfmpeg = (args: string[]): Promise<string> => new Promise((resolve, reject) => {
    if (!ffmpegStatic) { reject(new Error('ffmpeg binary not available')); return; }
    const proc = spawn(ffmpegStatic, args);
    let stderr = '';
    proc.stderr.on('data', chunk => { stderr += chunk.toString(); });
    proc.on('error', reject);
    proc.on('exit', code => {
        if (code === 0) resolve(stderr);
        else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-500)}`));
    });
});

// Phase 14: real .cube file LUT preset names. Kept in sync with the
// `LUT_PRESETS` constant in `types.ts` — duplicated here so the server stays
// standalone (server/tsconfig.json doesn't include parent files).
const LUT_PRESETS = [
    'none',
    'kodak_vision3_250d',
    'fuji_eterna_250d',
    'kodak_2383',
    'arri_logc_to_rec709',
    'bleach_bypass',
] as const;

// Build the ffmpeg `lut3d='...'` filter argument for a given preset. Returns
// null when no LUT should be applied (preset is 'none', invalid, or the .cube
// file is missing — silent downgrade so a missing asset doesn't abort the
// whole transcode). Single-quoting the path avoids escaping issues with
// colons in Windows / WSL absolute paths.
const buildLutArg = (preset: string, lutsDir: string): { arg: string; preset: string } | null => {
    if (!preset || preset === 'none') return null;
    if (!(LUT_PRESETS as readonly string[]).includes(preset)) return null;
    const filePath = path.join(lutsDir, `${preset}.cube`);
    if (!fs.existsSync(filePath)) return null;
    return { arg: `lut3d='${filePath}'`, preset };
};

// loudnorm prints a JSON block to stderr near the end of pass 1. The block is
// the last JSON object in stderr; pull it out by finding the last balanced
// {...} run rather than relying on line position (ffmpeg's progress lines vary).
const parseLoudnormJson = (stderr: string): Record<string, string> | null => {
    const start = stderr.lastIndexOf('{');
    const end = stderr.lastIndexOf('}');
    if (start < 0 || end < 0 || end < start) return null;
    try { return JSON.parse(stderr.slice(start, end + 1)); } catch { return null; }
};

// G10 (audit slice) — server-side compose pipeline. Currently returns 501
// with a validated manifest echo so the client can post against the stable
// contract while subsequent slices build out the ffmpeg pipeline. Shares
// the transcode limiter because the eventual workload is comparably CPU-
// heavy; tighten further if scale demands.
app.post('/api/render', transcodeLimiter, handleRender);

app.post('/api/transcode', transcodeLimiter, async (req, res) => {
    if (!ffmpegStatic) {
        res.status(503).json({ error: 'Transcoder unavailable', message: 'ffmpeg binary missing from this build.' });
        return;
    }

    // D5: disable Node's per-request socket timeouts for the duration of this
    // handler. Two-pass ffmpeg on a long export can easily exceed Node's
    // defaults (which vary by version but historically default to ~2 min on
    // the response side). Railway / Render / Fly have their own infra-level
    // limits that still bound runaway requests — this just stops the Node
    // layer from killing us mid-encode.
    req.setTimeout(0);
    res.setTimeout(0);

    let tmpDir: string | null = null;
    try {
        tmpDir = await mkdtemp(path.join(tmpdir(), 'transcode-'));
        const inputPath = path.join(tmpDir, 'in.webm');
        const outputPath = path.join(tmpDir, 'out.mp4');

        // Pull the raw request body into a temp file. The client posts
        // application/octet-stream so the express.json middleware passes it
        // through untouched and req is a usable Readable stream.
        // D5: route through a size-cap Transform so absurd uploads abort
        // mid-stream rather than filling /tmp.
        await pipeline(req, makeSizeGuard(MAX_TRANSCODE_BODY_BYTES), fs.createWriteStream(inputPath));

        // Phase 14: resolve the requested LUT (query string, not body — the
        // body is the raw WebM stream). Missing file or unknown preset is a
        // silent downgrade so a stale asset doesn't break the user's render.
        const rawLutPreset = typeof req.query.lutPreset === 'string' ? req.query.lutPreset : '';
        const lut = buildLutArg(rawLutPreset, LUTS_DIR);

        // Pass 1 — measure loudness. -f null pipes the encode to nowhere; we
        // only want loudnorm's JSON report on stderr.
        const pass1Stderr = await runFfmpeg([
            '-hide_banner', '-nostats',
            '-i', inputPath,
            '-af', 'loudnorm=I=-14:TP=-1:LRA=11:print_format=json',
            '-f', 'null', '-',
        ]);
        const m = parseLoudnormJson(pass1Stderr);

        // Pass 2 — transcode with measurements applied. linear=true uses a
        // single linear-scaler gain (preserves dynamics) instead of dynamic
        // range compression; that matches what we want for already-mastered
        // mixed audio. If pass 1 parsing failed for any reason, fall back to
        // single-pass loudnorm rather than failing the whole transcode.
        const loudnormFilter = m
            ? `loudnorm=I=-14:TP=-1:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true:print_format=summary`
            : 'loudnorm=I=-14:TP=-1:LRA=11:print_format=summary';

        const pass2Args: string[] = [
            '-hide_banner', '-nostats', '-y',
            '-i', inputPath,
            '-c:v', 'libx264',
            '-preset', 'medium',
            '-crf', '18',
            '-pix_fmt', 'yuv420p',  // YouTube prefers 4:2:0 chroma subsampling
            '-c:a', 'aac',
            '-b:a', '192k',
            '-af', loudnormFilter,
            '-movflags', '+faststart',  // moov atom at head — instant playback
        ];
        if (lut) {
            // Splice the LUT video filter in before the output path. Pass 2
            // only — pass 1 measures audio and doesn't read video frames.
            pass2Args.splice(pass2Args.length, 0, '-vf', lut.arg);
        }
        pass2Args.push(outputPath);

        await runFfmpeg(pass2Args);

        // Phase 14: surface whether the LUT was actually applied. The body
        // is the streamed MP4, so metadata rides on response headers.
        res.setHeader('X-LUT-Applied', lut ? 'true' : 'false');
        res.setHeader('X-LUT-Preset', lut ? lut.preset : 'none');
        // Allow the browser to read these custom headers from a fetch().
        res.setHeader('Access-Control-Expose-Headers', 'X-LUT-Applied, X-LUT-Preset');

        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Disposition', 'attachment; filename="master.mp4"');
        await pipeline(fs.createReadStream(outputPath), res);
    } catch (error: any) {
        // D5: distinguish the size-cap abort (413) from generic transcode
        // failures (500) so a client uploading a 1 GB blob gets a clear
        // signal rather than a vague "transcode failed".
        if (error instanceof PayloadTooLargeError) {
            console.warn(`Transcode upload aborted: payload exceeded ${error.limitBytes} bytes`);
            if (!res.headersSent) {
                res.status(413).json({
                    error: 'Payload too large',
                    message: `Upload exceeded the ${Math.round(error.limitBytes / (1024 * 1024))} MB transcode cap.`,
                    limitBytes: error.limitBytes,
                });
            }
        } else {
            console.error('Transcode failed:', error.message);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Transcode failed', message: error.message?.slice(0, 500) || 'unknown error' });
            }
        }
    } finally {
        if (tmpDir) await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
});

// In production we also serve the static frontend bundle. Vite outputs to
// `dist/` next to this server file's package root.
if (IS_PROD) {
    const distDir = path.resolve(SERVER_DIR, '..', 'dist');
    if (fs.existsSync(distDir)) {
        app.use(express.static(distDir));
        // SPA fallback — anything that's not an API route returns index.html
        // so the client-side router can take over.
        app.get(/^(?!\/api\/).*/, (_req, res) => {
            res.sendFile(path.join(distDir, 'index.html'));
        });
        console.log(`📦  Serving static bundle from ${distDir}`);
    } else {
        console.warn(`⚠️  Production mode but no dist/ directory found at ${distDir}. Run "npm run build" first.`);
    }
}

app.listen(PORT, () => {
    console.log(`🛡️  Server running on http://localhost:${PORT} (env: ${NODE_ENV})`);
    if (IS_CONFIGURED) console.log(`   Gemini API key is secured server-side.`);
    else console.log(`   ⚠️  Running in degraded mode — set GEMINI_API_KEY to enable Gemini calls.`);
    if (!IS_PROD) {
        console.log(`   Frontend at http://localhost:3000 will proxy through here.`);
    }
});
