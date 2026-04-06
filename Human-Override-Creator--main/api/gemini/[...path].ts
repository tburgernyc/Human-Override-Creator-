// Vercel Serverless Function — secure Gemini API proxy.
// Catches all /api/gemini/* routes and forwards them to googleapis.com,
// injecting the API key server-side so it never reaches the client.

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
};

export default async function handler(req: any, res: any) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not configured on server.' });
  }

  // req.query.path is the [...path] catch-all — an array of path segments
  const pathParts: string[] = Array.isArray(req.query.path) ? req.query.path : [req.query.path];
  const targetPath = pathParts.join('/');

  const baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
  const url = new URL(`${baseUrl}/${targetPath}`);
  url.searchParams.set('key', GEMINI_API_KEY);

  // Forward all original query params except the internal ones
  for (const [key, value] of Object.entries(req.query)) {
    if (key !== 'key' && key !== 'path') {
      url.searchParams.set(key, value as string);
    }
  }

  const fetchOptions: RequestInit = {
    method: req.method,
    headers: { 'Content-Type': 'application/json' },
  };

  if (['POST', 'PUT', 'PATCH'].includes(req.method || '')) {
    fetchOptions.body = JSON.stringify(req.body);
  }

  try {
    const response = await fetch(url.toString(), fetchOptions);
    const data = await response.text();

    res.status(response.status)
      .setHeader('Content-Type', response.headers.get('Content-Type') || 'application/json')
      .send(data);
  } catch (error: any) {
    console.error('Gemini proxy error:', error.message);
    res.status(500).json({ error: 'Proxy request failed', details: error.message });
  }
}
