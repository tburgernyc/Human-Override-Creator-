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
app.all('/api/gemini/*', async (req, res) => {
    try {
        const targetPath = (req.params as any)[0];
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

app.listen(PORT, () => {
    console.log(`🛡️  API Proxy running on http://localhost:${PORT}`);
    console.log(`   Gemini API key is secured server-side.`);
    console.log(`   Frontend at http://localhost:3000 will proxy through here.`);
});
