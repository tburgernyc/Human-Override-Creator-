import 'dotenv/config';
import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PROXY_PORT || 3001;

// Load API key from environment (NOT exposed to client)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY is not set in environment variables.');
    console.error('   Create a .env file based on .env.example and add your key.');
    process.exit(1);
}

app.use(cors({ origin: ['http://localhost:3000', 'http://127.0.0.1:3000'] }));
app.use(express.json({ limit: '50mb' }));

// Health check
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', hasKey: !!GEMINI_API_KEY });
});

// Proxy all Gemini API requests — the key is injected server-side
app.all(/^\/api\/gemini\/(.*)/, async (req: any, res) => {
    try {
        const targetPath = req.params[0];
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

        res.status(response.status)
            .set('Content-Type', response.headers.get('Content-Type') || 'application/json')
            .send(data);
    } catch (error: any) {
        console.error('Proxy error:', error.message);
        res.status(500).json({ error: 'Proxy request failed', details: error.message });
    }
});

// Secure video download endpoint - prevents API key exposure in client
app.post('/api/download-video', async (req, res) => {
    try {
        const { videoUri } = req.body;

        if (!videoUri) {
            return res.status(400).json({ error: 'videoUri is required' });
        }

        // Validate URI is from Google's video service
        if (!videoUri.includes('generativelanguage.googleapis.com')) {
            return res.status(400).json({ error: 'Invalid video URI' });
        }

        // Append API key server-side (never exposed to client)
        const secureUrl = `${videoUri}&key=${GEMINI_API_KEY}`;

        // Fetch video with timeout
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60000); // 60 second timeout

        const response = await fetch(secureUrl, { signal: controller.signal });
        clearTimeout(timeout);

        if (!response.ok) {
            throw new Error(`Video download failed: ${response.status} ${response.statusText}`);
        }

        // Stream video blob back to client
        const blob = await response.blob();
        const buffer = Buffer.from(await blob.arrayBuffer());

        res.set('Content-Type', blob.type || 'video/mp4');
        res.set('Content-Length', buffer.length.toString());
        res.send(buffer);
    } catch (error: any) {
        console.error('Video download error:', error.message);
        res.status(500).json({ error: 'Video download failed', details: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`🛡️  API Proxy running on http://localhost:${PORT}`);
    console.log(`   Gemini API key is secured server-side.`);
    console.log(`   Frontend at http://localhost:3000 will proxy through here.`);
});
