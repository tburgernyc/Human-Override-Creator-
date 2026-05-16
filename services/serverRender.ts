import {
    AspectRatio,
    GeneratedAssets,
    ProjectState,
    RenderManifest,
    RenderManifestScene,
    RenderManifestTransition,
    Resolution,
    Scene,
    TransitionType,
} from '../types';

// G10 (audit slice) — client-side builder for the RenderManifest payload
// posted to POST /api/render. Lives here so the App layer can compose the
// manifest without knowing the server contract details, and so the type
// narrowing (Resolution enum → '720p'|'1080p', wider TransitionType union →
// ffmpeg-supported subset) happens in one place.

// Wider client TransitionType → narrower server set. Anything ffmpeg's
// xfade filter can't directly express collapses to 'fade' so the server
// still has a sensible default rather than rejecting the scene.
const TRANSITION_MAP: Record<TransitionType, RenderManifestTransition> = {
    cut: 'cut',
    fade: 'fade',
    crossfade: 'dissolve',
    dissolve: 'dissolve',
    zoom_in: 'fade',
    zoom_out: 'fade',
    slide_left: 'wipe',
    slide_right: 'wipe',
};

const mapAspectRatio = (ar: AspectRatio): RenderManifest['aspectRatio'] => {
    switch (ar) {
        case AspectRatio.PORTRAIT: return '9:16';
        case AspectRatio.SQUARE: return '1:1';
        default: return '16:9'; // LANDSCAPE, WIDE, STANDARD all map to widescreen
    }
};

const mapResolution = (r: Resolution): RenderManifest['resolution'] =>
    r === Resolution.FHD ? '1080p' : '720p';

const mapTransition = (t: TransitionType | undefined): RenderManifestTransition | undefined => {
    if (!t) return undefined;
    return TRANSITION_MAP[t] ?? 'fade';
};

// Pre-flight: returns the list of scenes that can't be server-rendered
// because they're missing a remote Veo URI (e.g. extension-failed scenes,
// or pre-G10 archives generated before videoUri was persisted on the
// asset). The caller surfaces this to the user before kicking off the
// render so they can regenerate the affected scenes first.
export const findUnrenderableScenes = (project: ProjectState): Scene[] =>
    project.scenes.filter(s => {
        const asset = project.assets[s.id];
        return !asset || !asset.videoUri;
    });

// Throws if the project state can't produce a valid manifest. App-level
// callers wrap this in try/catch and surface the message via the toast
// system; the server's 400 validator would also catch most of these but
// failing early gives a clearer message.
export class ManifestBuildError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ManifestBuildError';
    }
}

export const buildRenderManifest = (
    project: ProjectState,
    aspectRatio: AspectRatio,
    resolution: Resolution,
): RenderManifest => {
    if (!project.projectId) throw new ManifestBuildError('project has no stable projectId');
    if (project.scenes.length === 0) throw new ManifestBuildError('no scenes to render');

    const unrenderable = findUnrenderableScenes(project);
    if (unrenderable.length > 0) {
        throw new ManifestBuildError(
            `${unrenderable.length} scene(s) are missing a Veo videoUri — regenerate them before server-rendering: ${unrenderable.map(s => `#${project.scenes.indexOf(s) + 1}`).join(', ')}`,
        );
    }

    const sceneEntries: RenderManifestScene[] = project.scenes.map((scene, idx) => {
        const asset = project.assets[scene.id];
        const isLast = idx === project.scenes.length - 1;
        return {
            id: scene.id,
            videoUri: asset!.videoUri!,
            audioBase64: asset!.audioUrl,
            estimatedDuration: scene.estimatedDuration,
            transitionToNext: isLast ? undefined : mapTransition(scene.transition),
            mood: scene.musicMood,
        };
    });

    const mst = project.mastering;
    return {
        schemaVersion: 1,
        projectId: project.projectId,
        aspectRatio: mapAspectRatio(aspectRatio),
        resolution: mapResolution(resolution),
        globalStyle: project.globalStyle,
        scenes: sceneEntries,
        mastering: {
            lutPreset: mst?.lutPreset,
            musicVolume: clamp01(mst?.musicVolume ?? 0.5),
            voiceVolume: clamp01(mst?.voiceVolume ?? 1.0),
            ambientVolume: clamp01(mst?.ambientVolume ?? 0.3),
            filmGrain: clamp01((mst?.filmGrain ?? 0) / 100),       // mastering uses 0-100 in client; normalize
            vignetteIntensity: clamp01((mst?.vignetteIntensity ?? 0) / 100),
        },
    };
};

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

// Fires the POST. Returns the server's JSON response (currently a 501 echo
// in slice 6a; will return a streaming MP4 / SSE channel in slices 6b–6e).
export const postRenderManifest = async (manifest: RenderManifest): Promise<Response> => {
    return fetch('/api/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(manifest),
    });
};
