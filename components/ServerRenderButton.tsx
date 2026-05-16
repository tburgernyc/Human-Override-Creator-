import React, { useState } from 'react';
import { AspectRatio, ProjectState, Resolution } from '../types';
import { buildRenderManifest, ManifestBuildError, postRenderManifest } from '../services/serverRender';

// G10 6e (audit slice) — entry point for the server-side compose pipeline.
// Sits next to the existing client-side "Initialize Master Export" button.
// Sends the project's RenderManifest to POST /api/render and triggers a
// browser download of the resulting MP4. Server-side compose avoids the
// browser MediaRecorder's single-pass / OOM failure modes on long renders.
//
// No granular progress yet — ffmpeg progress over SSE is a documented
// follow-up. For now the button surfaces idle / rendering / error states
// and the server-side log carries the per-scene download + encode lines.

interface ServerRenderButtonProps {
    project: ProjectState;
    aspectRatio: AspectRatio;
    resolution: Resolution;
    disabled: boolean;
    onLog: (message: string, type: 'system' | 'error' | 'success') => void;
}

type RenderState = 'idle' | 'building' | 'rendering' | 'error';

export const ServerRenderButton: React.FC<ServerRenderButtonProps> = ({ project, aspectRatio, resolution, disabled, onLog }) => {
    const [state, setState] = useState<RenderState>('idle');

    const handleClick = async () => {
        setState('building');
        let manifest;
        try {
            manifest = buildRenderManifest(project, aspectRatio, resolution);
        } catch (err) {
            const msg = err instanceof ManifestBuildError ? err.message : (err instanceof Error ? err.message : 'unknown error');
            onLog(`Server render rejected: ${msg}`, 'error');
            setState('error');
            // Self-clear back to idle after 4s so the button is usable again.
            window.setTimeout(() => setState('idle'), 4000);
            return;
        }

        setState('rendering');
        onLog('Server render initiated — uploading manifest and waiting for ffmpeg compose.', 'system');

        try {
            const response = await postRenderManifest(manifest);
            if (!response.ok) {
                let detail = `HTTP ${response.status}`;
                try {
                    const errJson = await response.json();
                    detail = errJson?.message || errJson?.error || detail;
                } catch { /* response wasn't JSON */ }
                throw new Error(detail);
            }

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${manifest.projectId}.mp4`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            onLog(`Server render complete — ${(blob.size / (1024 * 1024)).toFixed(1)} MB MP4 downloaded.`, 'success');
            setState('idle');
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'server render failed';
            onLog(`Server render failed: ${msg}`, 'error');
            setState('error');
            window.setTimeout(() => setState('idle'), 6000);
        }
    };

    const label = (() => {
        switch (state) {
            case 'building': return 'Validating manifest…';
            case 'rendering': return 'Rendering on server…';
            case 'error': return 'Render failed';
            default: return 'Server Render (MP4)';
        }
    })();

    const isBusy = state === 'building' || state === 'rendering';

    return (
        <button
            onClick={handleClick}
            disabled={disabled || isBusy}
            className="px-12 py-5 nm-button text-luna-gold rounded-2xl font-black uppercase tracking-[0.3em] text-[10px] hover:bg-luna-gold/10 transition-all flex items-center justify-center gap-4 border border-luna-gold/30 disabled:opacity-40 disabled:hover:bg-transparent"
            title="Compose the final MP4 on the server (recommended for long projects). Avoids browser MediaRecorder OOM / single-pass failures."
        >
            <i className={`fa-solid ${isBusy ? 'fa-spinner animate-spin' : state === 'error' ? 'fa-triangle-exclamation' : 'fa-server'}`}></i>
            {label}
        </button>
    );
};
