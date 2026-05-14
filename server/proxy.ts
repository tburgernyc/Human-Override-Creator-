import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const app = express();

// Railway and most hosts set PORT; fall back to the dev port the Vite proxy expects.
const PORT = parseInt(process.env.PORT || process.env.PROXY_PORT || '3001', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD = NODE_ENV === 'production';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY is not set in environment variables.');
    console.error('   Create a .env file based on .env.example and add your key.');
    process.exit(1);
}

// In dev the Vite dev server on :3000 calls the proxy on :3001, so allow that
// origin. In production the same Express server serves the static bundle and
// the API together, so requests are same-origin and CORS is not strictly needed.
const ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

app.use(cors({ origin: IS_PROD ? true : ALLOWED_ORIGINS }));
app.use(express.json({ limit: '50mb' }));

// Health check — used by Railway's healthchecks and local diagnostics.
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', hasKey: !!GEMINI_API_KEY, env: NODE_ENV });
});

// Proxy all Gemini API requests — the key is injected server-side
app.all('/api/gemini/*', async (req, res) => {
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
app.get('/api/download', async (req, res) => {
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
    console.log(`   Gemini API key is secured server-side.`);
    if (!IS_PROD) {
        console.log(`   Frontend at http://localhost:3000 will proxy through here.`);
    }
});
