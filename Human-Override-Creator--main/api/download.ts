// Vercel Serverless Function — secure video/file download proxy.
// Injects the API key server-side; the client never holds it.
// URI allowlist prevents this acting as an open proxy.

export const config = {
  api: {
    bodyParser: false,
    responseLimit: '100mb',
  },
};

export default async function handler(req: any, res: any) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not configured on server.' });
  }

  const uri = req.query.uri as string;
  if (!uri || !uri.startsWith('https://generativelanguage.googleapis.com/')) {
    return res.status(400).json({ error: 'Invalid or missing URI' });
  }

  try {
    const url = new URL(uri);
    url.searchParams.set('key', GEMINI_API_KEY);
    const response = await fetch(url.toString());

    res.status(response.status);
    const contentType = response.headers.get('Content-Type');
    if (contentType) res.setHeader('Content-Type', contentType);

    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (error: any) {
    console.error('Download proxy error:', error.message);
    res.status(500).json({ error: 'Download proxy failed', details: error.message });
  }
}
