import { describe, expect, it, vi } from 'vitest';
import { AspectRatio, ProjectState, Resolution } from '../types';
import { buildRenderManifest, findUnrenderableScenes, ManifestBuildError } from '../services/serverRender';
import {
    AudioInput,
    buildAudioFilterGraph,
    buildConcatList,
    buildVideoFilters,
    composeConcat,
    composeManifest,
    stripBase64Prefix,
    validateManifest,
} from '../server/render';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// G10 6a (audit slice) — pins the manifest contract on both sides of the
// network boundary so the client builder and server validator can't drift
// apart silently.

const makeScene = (id: string, overrides: Partial<ProjectState['scenes'][number]> = {}) => ({
    id,
    description: `scene ${id}`,
    visualPrompt: 'a thing happens',
    charactersInScene: [],
    narratorLines: [],
    estimatedDuration: 5,
    musicMood: 'calm' as const,
    transition: 'fade' as const,
    ...overrides,
});

const makeProject = (sceneIds: string[], opts: { withVideoUri?: boolean } = { withVideoUri: true }): ProjectState => ({
    projectId: 'proj_test',
    script: 'test',
    status: 'ready',
    characters: [],
    scenes: sceneIds.map(id => makeScene(id)),
    assets: Object.fromEntries(sceneIds.map(id => [
        id,
        {
            imageUrl: 'data:image/png;base64,abc',
            videoUrl: 'data:video/webm;base64,def',
            videoUri: opts.withVideoUri ? `https://example.test/${id}` : undefined,
            audioUrl: 'data:audio/wav;base64,ghi',
            status: 'complete' as const,
            variants: [],
        },
    ])),
    tasks: [],
    modules: {},
    productionLog: [],
    currentStepMessage: '',
    productionSeed: 42,
    mastering: {
        // AudioMixer sliders are client-scale 0-150 (100 = unity gain).
        musicVolume: 50,
        voiceVolume: 100,
        ambientVolume: 30,
        filmGrain: 50, // client-scale 0-100
        bloomIntensity: 0,
        vignetteIntensity: 75,
        lightLeakIntensity: 0,
        filmBurnIntensity: 0,
        lutPreset: 'kodak_vision3_250d',
    },
});

describe('buildRenderManifest', () => {
    it('produces a valid manifest from a complete project', () => {
        const project = makeProject(['s1', 's2', 's3']);
        const manifest = buildRenderManifest(project, AspectRatio.LANDSCAPE, Resolution.FHD);

        expect(manifest.schemaVersion).toBe(1);
        expect(manifest.projectId).toBe('proj_test');
        expect(manifest.aspectRatio).toBe('16:9');
        expect(manifest.resolution).toBe('1080p');
        expect(manifest.scenes).toHaveLength(3);
        expect(manifest.scenes[0].videoUri).toBe('https://example.test/s1');
        expect(manifest.scenes[0].audioBase64).toBe('data:audio/wav;base64,ghi');
        // Last scene has no transitionToNext (final clip)
        expect(manifest.scenes[2].transitionToNext).toBeUndefined();
        // First two scenes do
        expect(manifest.scenes[0].transitionToNext).toBe('fade');
    });

    it('normalizes mastering client ranges to server', () => {
        const project = makeProject(['s1']);
        const manifest = buildRenderManifest(project, AspectRatio.LANDSCAPE, Resolution.FHD);

        expect(manifest.mastering.filmGrain).toBeCloseTo(0.5, 5);           // 50/100  → [0, 1]
        expect(manifest.mastering.vignetteIntensity).toBeCloseTo(0.75, 5);  // 75/100  → [0, 1]
        expect(manifest.mastering.musicVolume).toBeCloseTo(0.5, 5);         // 50/100  → [0, 1.5]
        expect(manifest.mastering.voiceVolume).toBeCloseTo(1.0, 5);         // 100/100 → unity gain
    });

    it('maps client AspectRatio enum to server string', () => {
        const project = makeProject(['s1']);
        expect(buildRenderManifest(project, AspectRatio.PORTRAIT, Resolution.HD).aspectRatio).toBe('9:16');
        expect(buildRenderManifest(project, AspectRatio.SQUARE, Resolution.HD).aspectRatio).toBe('1:1');
        expect(buildRenderManifest(project, AspectRatio.WIDE, Resolution.HD).aspectRatio).toBe('16:9'); // collapsed
    });

    it('rejects projects with no scenes', () => {
        const project = makeProject([]);
        expect(() => buildRenderManifest(project, AspectRatio.LANDSCAPE, Resolution.FHD))
            .toThrow(ManifestBuildError);
    });

    it('rejects projects with scenes missing videoUri (caller should regenerate first)', () => {
        const project = makeProject(['s1', 's2'], { withVideoUri: false });
        expect(() => buildRenderManifest(project, AspectRatio.LANDSCAPE, Resolution.FHD))
            .toThrow(/videoUri/);
    });

    it('findUnrenderableScenes lists scenes missing the URI', () => {
        const project = makeProject(['s1', 's2'], { withVideoUri: false });
        const bad = findUnrenderableScenes(project);
        expect(bad).toHaveLength(2);
        expect(bad.map(s => s.id)).toEqual(['s1', 's2']);
    });
});

describe('validateManifest (server)', () => {
    const baseManifest = () => buildRenderManifest(makeProject(['s1', 's2']), AspectRatio.LANDSCAPE, Resolution.FHD);

    it('accepts a manifest produced by buildRenderManifest', () => {
        const v = validateManifest(baseManifest());
        expect(v.ok).toBe(true);
    });

    it('rejects unknown schemaVersion', () => {
        const m = { ...baseManifest(), schemaVersion: 99 };
        const v = validateManifest(m);
        expect(v.ok).toBe(false);
        if (v.ok === false) expect(v.error).toMatch(/schemaVersion/);
    });

    it('rejects empty scenes array', () => {
        const m = { ...baseManifest(), scenes: [] };
        const v = validateManifest(m);
        expect(v.ok).toBe(false);
        if (v.ok === false) expect(v.error).toMatch(/scenes/);
    });

    it('rejects a scene with non-positive duration', () => {
        const m = baseManifest();
        m.scenes[0].estimatedDuration = 0;
        const v = validateManifest(m);
        expect(v.ok).toBe(false);
        if (v.ok === false) expect(v.error).toMatch(/estimatedDuration/);
    });

    it('rejects mastering volume outside [0, 1.5]', () => {
        const m = baseManifest();
        m.mastering.musicVolume = 2;
        const v = validateManifest(m);
        expect(v.ok).toBe(false);
        if (v.ok === false) expect(v.error).toMatch(/musicVolume/);
    });

    it('rejects an unknown aspect ratio string', () => {
        const m = { ...baseManifest(), aspectRatio: '21:9' as any };
        const v = validateManifest(m);
        expect(v.ok).toBe(false);
        if (v.ok === false) expect(v.error).toMatch(/aspectRatio/);
    });

    it('rejects an unknown transitionToNext value', () => {
        const m = baseManifest();
        (m.scenes[0] as any).transitionToNext = 'glitch';
        const v = validateManifest(m);
        expect(v.ok).toBe(false);
        if (v.ok === false) expect(v.error).toMatch(/transitionToNext/);
    });
});

describe('buildConcatList', () => {
    it('emits one quoted file line per input', () => {
        const out = buildConcatList(['/tmp/a.mp4', '/tmp/b.mp4']);
        expect(out).toBe(`file '/tmp/a.mp4'\nfile '/tmp/b.mp4'`);
    });

    it('escapes single quotes inside paths so ffmpeg concat demuxer stays happy', () => {
        // Path with a literal single quote in the filename — ffmpeg's concat
        // demuxer quoting rule is `'\\''` (close, escaped quote, reopen).
        const out = buildConcatList([`/tmp/it's-fine.mp4`]);
        expect(out).toBe(`file '/tmp/it'\\''s-fine.mp4'`);
    });
});

describe('composeConcat', () => {
    it('writes the concat list to disk and invokes ffmpeg with the expected args', async () => {
        const dir = await mkdtemp(path.join(tmpdir(), 'render-test-'));
        try {
            const concatListPath = path.join(dir, 'concat.txt');
            const outputPath = path.join(dir, 'out.mp4');
            const inputFiles = [
                path.join(dir, 'scene_0000.mp4'),
                path.join(dir, 'scene_0001.mp4'),
            ];
            const runner = vi.fn().mockResolvedValue('ok');

            await composeConcat({
                inputFiles,
                outputPath,
                concatListPath,
                ffmpegPath: '/usr/bin/ffmpeg-fake',
                runner,
            });

            // Concat list was written
            const written = await readFile(concatListPath, 'utf8');
            expect(written).toBe(`file '${inputFiles[0]}'\nfile '${inputFiles[1]}'`);

            // Runner was called once with the expected ffmpeg pipeline
            expect(runner).toHaveBeenCalledOnce();
            const [calledPath, args] = runner.mock.calls[0];
            expect(calledPath).toBe('/usr/bin/ffmpeg-fake');
            expect(args).toContain('-f');
            expect(args).toContain('concat');
            expect(args).toContain('-safe');
            expect(args).toContain('-i');
            expect(args).toContain(concatListPath);
            expect(args).toContain('-c:v');
            expect(args).toContain('libx264');
            expect(args).toContain('-movflags');
            expect(args).toContain('+faststart');
            expect(args[args.length - 1]).toBe(outputPath);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    it('surfaces ffmpeg failures verbatim from the runner', async () => {
        const dir = await mkdtemp(path.join(tmpdir(), 'render-test-'));
        try {
            const runner = vi.fn().mockRejectedValue(new Error('ffmpeg exit 1: Invalid data found when processing input'));
            await expect(composeConcat({
                inputFiles: [path.join(dir, 'x.mp4')],
                outputPath: path.join(dir, 'out.mp4'),
                concatListPath: path.join(dir, 'concat.txt'),
                ffmpegPath: '/usr/bin/ffmpeg-fake',
                runner,
            })).rejects.toThrow(/Invalid data found/);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
});

describe('stripBase64Prefix', () => {
    it('strips a data URI prefix when present', () => {
        expect(stripBase64Prefix('data:audio/wav;base64,SGVsbG8=')).toBe('SGVsbG8=');
    });
    it('returns the input untouched when no prefix', () => {
        expect(stripBase64Prefix('SGVsbG8=')).toBe('SGVsbG8=');
    });
    it('does not strip a stray comma that is not a data-URI separator', () => {
        // Real base64 has no commas, but if some malformed value sneaks in we
        // shouldn't lop off the leading section unless it actually starts with `data:`.
        expect(stripBase64Prefix('xx,yy')).toBe('xx,yy');
    });
});

describe('buildAudioFilterGraph', () => {
    it('returns empty string when no audio inputs', () => {
        expect(buildAudioFilterGraph([], 1)).toBe('');
    });

    it('emits adelay + volume + amix for a single scene', () => {
        const filter = buildAudioFilterGraph([{ path: '/tmp/t0.wav', offsetMs: 0 }], 0.8);
        expect(filter).toBe('[1:a]adelay=0|0,volume=0.800[tts0];[tts0]amix=inputs=1:duration=longest:normalize=0[aout]');
    });

    it('chains multiple delays with cumulative offsets and indices', () => {
        const inputs: AudioInput[] = [
            { path: '/tmp/t0.wav', offsetMs: 0 },
            { path: '/tmp/t1.wav', offsetMs: 5000 },
            { path: '/tmp/t2.wav', offsetMs: 12000 },
        ];
        const filter = buildAudioFilterGraph(inputs, 1.0);
        expect(filter).toContain('[1:a]adelay=0|0,volume=1.000[tts0]');
        expect(filter).toContain('[2:a]adelay=5000|5000,volume=1.000[tts1]');
        expect(filter).toContain('[3:a]adelay=12000|12000,volume=1.000[tts2]');
        expect(filter).toContain('amix=inputs=3:duration=longest:normalize=0[aout]');
    });

    it('produces stereo-equivalent delay (left|right) for ffmpeg adelay', () => {
        // adelay with one number applies to channel 1 only — stereo TTS needs
        // both channels delayed identically, hence the `N|N` syntax.
        const filter = buildAudioFilterGraph([{ path: '/tmp/x.wav', offsetMs: 2500 }], 1);
        expect(filter).toMatch(/adelay=2500\|2500/);
    });
});

describe('composeManifest with audio', () => {
    it('adds one `-i` per TTS clip and includes filter_complex when audio is present', async () => {
        const dir = await mkdtemp(path.join(tmpdir(), 'render-test-'));
        try {
            const runner = vi.fn().mockResolvedValue('ok');
            await composeManifest({
                videoFiles: [path.join(dir, 's0.mp4'), path.join(dir, 's1.mp4')],
                audioInputs: [
                    { path: path.join(dir, 't0.wav'), offsetMs: 0 },
                    { path: path.join(dir, 't1.wav'), offsetMs: 5000 },
                ],
                voiceVolume: 1,
                outputPath: path.join(dir, 'out.mp4'),
                concatListPath: path.join(dir, 'concat.txt'),
                ffmpegPath: '/usr/bin/ffmpeg-fake',
                runner,
            });

            const [, args] = runner.mock.calls[0];
            // Two `-i` flags for the TTS plus one for the concat list demuxer
            const inputFlagCount = args.filter((a: string) => a === '-i').length;
            expect(inputFlagCount).toBe(3);
            expect(args).toContain('-filter_complex');
            expect(args).toContain('-map');
            expect(args).toContain('[aout]');
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    it('skips audio entirely (-an) when no scenes have TTS', async () => {
        const dir = await mkdtemp(path.join(tmpdir(), 'render-test-'));
        try {
            const runner = vi.fn().mockResolvedValue('ok');
            await composeManifest({
                videoFiles: [path.join(dir, 's0.mp4')],
                audioInputs: [],
                voiceVolume: 1,
                outputPath: path.join(dir, 'out.mp4'),
                concatListPath: path.join(dir, 'concat.txt'),
                ffmpegPath: '/usr/bin/ffmpeg-fake',
                runner,
            });

            const [, args] = runner.mock.calls[0];
            expect(args).toContain('-an');
            expect(args).not.toContain('-filter_complex');
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    it('chains video filters into a single filter_complex when both audio and video filters present', async () => {
        const dir = await mkdtemp(path.join(tmpdir(), 'render-test-'));
        try {
            const runner = vi.fn().mockResolvedValue('ok');
            await composeManifest({
                videoFiles: [path.join(dir, 's0.mp4')],
                audioInputs: [{ path: path.join(dir, 't0.wav'), offsetMs: 0 }],
                voiceVolume: 1,
                videoFilters: ['vignette=angle=PI/3', 'noise=alls=10:allf=t'],
                outputPath: path.join(dir, 'out.mp4'),
                concatListPath: path.join(dir, 'concat.txt'),
                ffmpegPath: '/usr/bin/ffmpeg-fake',
                runner,
            });

            const [, args] = runner.mock.calls[0];
            const filterArgIdx = args.indexOf('-filter_complex');
            expect(filterArgIdx).toBeGreaterThan(-1);
            const filter = args[filterArgIdx + 1];
            expect(filter).toContain('[0:v]vignette=angle=PI/3,noise=alls=10:allf=t[vout]');
            expect(filter).toContain('amix=');
            // The mapped video stream should be the filtered output, not raw 0:v
            const mapIdx = args.indexOf('-map');
            expect(args[mapIdx + 1]).toBe('[vout]');
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    it('uses raw 0:v when no video filters present', async () => {
        const dir = await mkdtemp(path.join(tmpdir(), 'render-test-'));
        try {
            const runner = vi.fn().mockResolvedValue('ok');
            await composeManifest({
                videoFiles: [path.join(dir, 's0.mp4')],
                audioInputs: [{ path: path.join(dir, 't0.wav'), offsetMs: 0 }],
                voiceVolume: 1,
                outputPath: path.join(dir, 'out.mp4'),
                concatListPath: path.join(dir, 'concat.txt'),
                ffmpegPath: '/usr/bin/ffmpeg-fake',
                runner,
            });

            const [, args] = runner.mock.calls[0];
            const mapIdx = args.indexOf('-map');
            expect(args[mapIdx + 1]).toBe('0:v');
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
});

describe('buildVideoFilters', () => {
    it('returns an empty array when nothing is enabled', () => {
        expect(buildVideoFilters({ vignetteIntensity: 0, filmGrain: 0 })).toEqual([]);
    });

    it('emits a vignette filter when intensity > 0', () => {
        const filters = buildVideoFilters({ vignetteIntensity: 0.5, filmGrain: 0 });
        expect(filters).toHaveLength(1);
        expect(filters[0]).toMatch(/^vignette=angle=PI\/\d+\.\d+$/);
    });

    it('emits a noise filter when filmGrain > 0', () => {
        const filters = buildVideoFilters({ vignetteIntensity: 0, filmGrain: 0.5 });
        expect(filters).toHaveLength(1);
        expect(filters[0]).toMatch(/^noise=alls=\d+:allf=t$/);
    });

    it('clamps grain to at least strength=1 for any positive intensity', () => {
        // 0.01 * 30 = 0.3 → rounds to 0; Math.max(1, …) keeps it visible-ish.
        const filters = buildVideoFilters({ vignetteIntensity: 0, filmGrain: 0.01 });
        expect(filters[0]).toBe('noise=alls=1:allf=t');
    });

    it('omits the LUT filter for unknown / missing presets (silent downgrade)', () => {
        const filters = buildVideoFilters({ vignetteIntensity: 0, filmGrain: 0, lutPreset: 'not_a_real_preset' });
        expect(filters).toEqual([]);
    });
});
