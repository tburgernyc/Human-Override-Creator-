import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

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

// Proxy all Gemini API requests — the key is injected server-side
app.all('/api/gemini/*', geminiLimiter, async (req, res) => {
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
            console.warn(`Gemini upstream error ${response.status}: ${data.slice(0, 200)}`);
        }

        res.status(response.status)
            .set('Content-Type', response.headers.get('Content-Type') || 'application/json')
            .send(data);
    } catch (error: any) {
        console.error('Proxy error:', error.message);
        res.status(500).json({ error: 'Proxy request failed', details: error.message });
    }
});

// Strict allowlist: only Veo file URIs are downloadable. Without this the endpoint
// would forward any request under generativelanguage.googleapis.com using our API key.
function isAllowedDownloadUri(uri: string): boolean {
    let parsed: URL;
    try { parsed = new URL(uri); } catch { return false; }
    if (parsed.protocol !== 'https:') return false;
    if (parsed.host !== 'generativelanguage.googleapis.com') return false;
    // Veo's generated video URIs are emitted as `/v1beta/files/<file-id>:download`.
    return parsed.pathname.startsWith('/v1beta/files/');
}

// Secure video/file download endpoint — injects API key server-side so the client never holds it.
// On Railway, request timeouts are generous enough that large Veo downloads complete
// without the per-request limits that constrain serverless deployments.
app.get('/api/download', geminiLimiter, async (req, res) => {
    if (blockIfUnconfigured(res)) return;
    const uri = req.query.uri as string;
    if (!uri || !isAllowedDownloadUri(uri)) {
        return res.status(400).json({ error: 'Invalid or missing URI' });
    }
    try {
        const url = new URL(uri);
        url.searchParams.set('key', GEMINI_API_KEY!);
        const response = await fetch(url.toString());

        if (!response.ok) {
            const errText = await response.text();
            console.warn(`Download upstream error ${response.status}: ${errText.slice(0, 200)}`);
            return res.status(response.status).json({ error: 'Upstream fetch failed', status: response.status, details: errText.slice(0, 500) });
        }

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
        console.error('Download proxy error:', error.message);
        res.status(500).json({ error: 'Download proxy failed', details: error.message });
    }
});

// In production we also serve the static frontend bundle. Vite outputs to
// `dist/` next to this server file's package root.
if (IS_PROD) {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const distDir = path.resolve(__dirname, '..', 'dist');
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
