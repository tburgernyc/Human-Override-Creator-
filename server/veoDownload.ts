import fs from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

// Shared Veo URI handling for `/api/download` (client proxy) and `/api/render`
// (server-side compose pipeline). Both need to inject the API key, validate
// the URI against the Veo file namespace, and stream the body without
// buffering — so the logic lives in one place.

// Strict allowlist: only Veo file URIs are downloadable. Without this the
// helper would forward any request under generativelanguage.googleapis.com
// using our API key.
export const isAllowedDownloadUri = (uri: string): boolean => {
    let parsed: URL;
    try { parsed = new URL(uri); } catch { return false; }
    if (parsed.protocol !== 'https:') return false;
    if (parsed.host !== 'generativelanguage.googleapis.com') return false;
    // Veo's generated video URIs are emitted as `/v1beta/files/<file-id>:download`.
    return parsed.pathname.startsWith('/v1beta/files/');
};

export class VeoDownloadError extends Error {
    constructor(message: string, public readonly status?: number) {
        super(message);
        this.name = 'VeoDownloadError';
    }
}

// Issues the authenticated Veo download and returns the upstream Response.
// Caller decides how to consume the body (proxy: pipe to res; render: pipe
// to a tmp file).
export const fetchVeo = async (uri: string, apiKey: string): Promise<Response> => {
    if (!isAllowedDownloadUri(uri)) {
        throw new VeoDownloadError(`Invalid or disallowed download URI: ${uri.slice(0, 200)}`);
    }
    const url = new URL(uri);
    url.searchParams.set('key', apiKey);
    const response = await fetch(url.toString());
    if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new VeoDownloadError(
            `Upstream Veo download failed (${response.status}): ${errText.slice(0, 200)}`,
            response.status,
        );
    }
    return response;
};

// Convenience wrapper for `/api/render`: fetch the URI and stream the body
// directly into a tmp file on disk. Keeps memory flat regardless of clip
// size — important because a 30-scene render would otherwise buffer
// hundreds of MB of video before ffmpeg ever runs.
export const downloadVeoToFile = async (uri: string, apiKey: string, destPath: string): Promise<void> => {
    const response = await fetchVeo(uri, apiKey);
    if (!response.body) {
        throw new VeoDownloadError('Veo response had no body to stream');
    }
    // Node 18+ fetch returns a web ReadableStream; convert to a Node Readable.
    const nodeStream = Readable.fromWeb(response.body as any);
    await pipeline(nodeStream, fs.createWriteStream(destPath));
};
