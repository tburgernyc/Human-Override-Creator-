import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { renderMP4 } from './renderer';
import { projectsRouter } from './projects';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const IS_PROD = process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_ENVIRONMENT;

// Railway sets PORT; fall back to PROXY_PORT for local dev
const PORT = process.env.PORT || process.env.PROXY_PORT || 3001;

// Load API key from environment (NOT exposed to client)

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY is not set in environment variables.');
    console.error('   Create a .env file based on .env.example and add your key.');
    process.exit(1);
}

// In production (Railway) everything is same-origin — CORS is only needed locally
app.use(IS_PROD ? cors() : cors({ origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:3005', 'http://127.0.0.1:3005'] }));
app.use(express.json({ limit: '50mb' }));

// Serve Vite build output as static files (production only)
const distPath = path.join(__dirname, '..', 'dist');
if (IS_PROD && fs.existsSync(distPath)) {
    app.use(express.static(distPath));
}

// Health check
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', hasKey: !!GEMINI_API_KEY });
});

// Proxy all Gemini API requests — the key is injected server-side
app.all('/api/gemini/{*path}', async (req: any, res) => {
    try {
        const targetPath = req.params.path;
        const baseUrl = 'https://generativelanguage.googleapis.com';
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

// Director Chat Endpoint - Streaming
app.post('/api/director/chat', async (req, res) => {
    try {
        const { messages, currentPhase, projectName, lastAction } = req.body;

        if (!GEMINI_API_KEY) {
            return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
        }

        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash",
            systemInstruction: `
You are the Director — an expert creative AI embedded inside a professional 
video creation tool. You are proactive, precise, and authoritative. You guide 
the user through their current creative workflow phase with specific, actionable 
steps.

Current Phase: ${currentPhase || 'Unknown'}
Current Project: ${projectName || 'Untitled'}
User's Last Action: ${lastAction || 'N/A'}

Never be vague. Never ask "how can I help?" — always lead with what the 
user SHOULD do next based on their phase. Keep responses under 120 words 
unless the user asks for more detail. Use plain text — no markdown headers.
      `,
        });

        // Convert message history to Gemini format (user/model)
        // Slice to last 20 messages to save context window
        const history = messages.slice(-20).slice(0, -1).map((msg: any) => ({
            role: msg.role === "assistant" ? "model" : "user",
            parts: [{ text: msg.content }],
        }));

        const chat = model.startChat({ history });
        const lastMessage = messages[messages.length - 1].content;

        const result = await chat.sendMessageStream(lastMessage);

        // Set headers for streaming
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');

        for await (const chunk of result.stream) {
            const text = chunk.text();
            if (text) res.write(text);
        }

        res.end();

    } catch (error: any) {
        console.error('Director API Error:', error);
        // If headers haven't been sent, send JSON error
        if (!res.headersSent) {
            res.status(500).json({ error: 'Director chat failed', details: error.message });
        } else {
            res.end(); // End stream if error occurs mid-stream
        }
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

// ─── Vision-capable Director Chat ───────────────────────────────────────────
app.post('/api/director/chat-vision', async (req, res) => {
    try {
        const { message, chatHistory, sceneImages } = req.body;

        if (!GEMINI_API_KEY) {
            return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
        }

        const { GoogleGenAI } = await import('@google/genai');
        const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

        const parts: any[] = [];
        if (sceneImages && Array.isArray(sceneImages)) {
            sceneImages.forEach((img: string) => {
                parts.push({ inlineData: { mimeType: 'image/png', data: img } });
            });
        }
        parts.push({ text: message });

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [
                ...(chatHistory || []).map((m: any) => ({ role: m.role, parts: [{ text: m.content }] })),
                { role: 'user', parts }
            ]
        });

        res.json({ text: response.text });
    } catch (error: any) {
        console.error('Director vision chat error:', error);
        res.status(500).json({ error: 'Director vision chat failed', details: error.message });
    }
});

// ─── Server-side FFmpeg render ────────────────────────────────────────────────
app.post('/api/render', express.json({ limit: '2gb' }), async (req, res) => {
    try {
        const { frames, fps, resolution, format } = req.body;
        if (!frames || !Array.isArray(frames) || frames.length === 0) {
            return res.status(400).json({ error: 'frames array is required' });
        }

        const videoBuffer = await renderMP4(frames, { fps: fps || 30, resolution: resolution || '720p', format: format || 'mp4' });
        res.set('Content-Type', 'video/mp4');
        res.set('Content-Length', videoBuffer.length.toString());
        res.send(videoBuffer);
    } catch (error: any) {
        console.error('Render error:', error);
        res.status(500).json({ error: 'Render failed', details: error.message });
    }
});

// ─── Project persistence ──────────────────────────────────────────────────────
app.use('/api/projects', projectsRouter);

// SPA catch-all — serve index.html for any non-API route so React Router works
if (IS_PROD) {
    app.get('*', (_req, res) => {
        const indexPath = path.join(distPath, 'index.html');
        if (fs.existsSync(indexPath)) {
            res.sendFile(indexPath);
        } else {
            res.status(503).send('App not built. Run npm run build first.');
        }
    });
}

app.listen(PORT, () => {
    console.log(`🛡️  Human Override server running on port ${PORT}`);
    console.log(`   Gemini API key is secured server-side.`);
    if (IS_PROD) {
        console.log(`   Serving frontend from ${distPath}`);
    } else {
        console.log(`   Frontend dev server at http://localhost:3005`);
    }
});
