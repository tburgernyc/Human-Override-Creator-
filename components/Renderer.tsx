
import React, { useEffect, useRef, useState } from 'react';
import { Scene, GeneratedAssets, Resolution, AspectRatio, TextOverlay, ProjectState, TransitionType, CameraMotion, ColorGrade } from '../types';
import { decodeAudio } from '../services/gemini';
import { MUSIC_TRACKS } from '../constants';

// Free ambient SFX from Wikimedia Commons (no auth required)
const AMBIENT_TRACKS: Record<string, string> = {
    rain: "https://upload.wikimedia.org/wikipedia/commons/4/4e/Rain_on_a_tin_roof.ogg",
    city_hum: "https://upload.wikimedia.org/wikipedia/commons/0/0c/GreenMarket_Cape_Town_Ambient.ogg",
    wind: "https://upload.wikimedia.org/wikipedia/commons/a/a4/Wind_sound.ogg",
    space_drone: "https://upload.wikimedia.org/wikipedia/commons/8/87/Drone_in_A.ogg",
    data_stream: "https://upload.wikimedia.org/wikipedia/commons/e/ef/Teletype_Model_33.ogg"
};

const TARGET_FPS = 30;
const FRAME_INTERVAL_MS = 1000 / TARGET_FPS;
const MEDIA_LOAD_TIMEOUT_MS = 15000;

// Probe MediaRecorder support in fallback order. Returns the first supported
// mime type or null when none of the candidates work in this browser.
const pickMimeType = (): string | null => {
    const candidates = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/mp4;codecs=h264',
        'video/webm',
    ];
    for (const c of candidates) {
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c;
    }
    return null;
};

// Adaptive bitrate: ~0.15 bits per pixel-second (B5 — was 0.1, which clocked
// 1080p30 at ~6.2 Mbps, below YouTube's 8 Mbps minimum). Clamped to a sane
// range so 720p doesn't waste bandwidth and 4K doesn't blow up file size.
const computeBitrate = (w: number, h: number, fps: number): number => {
    const raw = Math.round(w * h * fps * 0.15);
    return Math.max(2_000_000, Math.min(20_000_000, raw));
};

// MediaRecorder timeslice for ondataavailable (B4). Without this argument the
// callback only fires on stop, so a tab crash mid-render forfeits everything;
// emitting chunks every second keeps work recoverable.
const RECORDER_CHUNK_MS = 1000;

// Map a recorder mime type to a file extension (R2). pickMimeType chooses the
// first browser-supported codec from a fallback list, so the recorded blob
// might be webm or mp4 depending on the Chromium version; the download
// filename should reflect what was actually written.
const fileExtensionFor = (mime: string | null): string => {
    if (!mime) return 'webm';
    if (mime.includes('mp4')) return 'mp4';
    if (mime.includes('webm')) return 'webm';
    return 'video';
};

// Film grain plate generator (B7). Smaller plates stretched over the output
// frame give grain a natural softness and run cheaper than full-resolution
// noise. Monochrome — color noise reads as dead pixels rather than emulsion.
const GRAIN_PLATE_SIZE = 480;
const GRAIN_PLATE_COUNT = 4;
const createGrainPlate = (): HTMLCanvasElement => {
    const c = document.createElement('canvas');
    c.width = GRAIN_PLATE_SIZE;
    c.height = GRAIN_PLATE_SIZE;
    const cctx = c.getContext('2d');
    if (!cctx) return c;
    const img = cctx.createImageData(GRAIN_PLATE_SIZE, GRAIN_PLATE_SIZE);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
        // Gaussian-ish via averaging — looks more film-like than uniform.
        const n = (Math.random() + Math.random() + Math.random()) / 3;
        const v = Math.floor(n * 255);
        d[i] = v;
        d[i + 1] = v;
        d[i + 2] = v;
        d[i + 3] = 255;
    }
    cctx.putImageData(img, 0, 0);
    return c;
};

// Loudness normalization (Q2). YouTube/Spotify target -14 LUFS; -18 dBFS RMS
// is a reasonable speech-only proxy that leaves the master compressor headroom
// to catch transients without smashing dialog. Real ITU-R BS.1770 K-weighting
// is heavier than this app needs; an integrated RMS over all TTS speech, with
// gain clamping, hits the right ballpark for tone-controlled voiceover.
const TARGET_SPEECH_RMS_DBFS = -18;
const MIN_NORM_GAIN = 0.5; // -6 dB — don't ever cut TTS more than this
const MAX_NORM_GAIN = 3.0; // +9.5 dB — don't boost noise floor on near-silent input

const computeIntegratedRms = (buffers: AudioBuffer[]): number => {
    let sumSq = 0;
    let count = 0;
    for (const buf of buffers) {
        const channel = buf.getChannelData(0);
        for (let i = 0; i < channel.length; i++) {
            sumSq += channel[i] * channel[i];
            count++;
        }
    }
    return count > 0 ? Math.sqrt(sumSq / count) : 0;
};

const computeNormalizationGain = (buffers: AudioBuffer[]): number => {
    const rms = computeIntegratedRms(buffers);
    if (rms <= 1e-6) return 1; // silent — nothing to normalize
    const currentDbfs = 20 * Math.log10(rms);
    const desiredGainDb = TARGET_SPEECH_RMS_DBFS - currentDbfs;
    const linear = Math.pow(10, desiredGainDb / 20);
    return Math.max(MIN_NORM_GAIN, Math.min(MAX_NORM_GAIN, linear));
};

// Procedural small-room impulse response for the voice bus reverb (Q5).
// Bundling a real IR file would be ideal but adds asset weight; this decaying-
// noise approximation is good enough to take the dry edge off TTS.
const createRoomImpulse = (ctx: AudioContext, durationSec = 0.35, decay = 3.5): AudioBuffer => {
    const length = Math.floor(ctx.sampleRate * durationSec);
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
        const data = impulse.getChannelData(c);
        for (let i = 0; i < length; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
        }
    }
    return impulse;
};

// Wet/dry split for the voice convolver. Subtle by design — we want to take
// the cardboard-box edge off dry TTS, not paint everything cavernous.
const VOICE_REVERB_WET = 0.18;
const VOICE_REVERB_DRY = 1 - VOICE_REVERB_WET;

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, Math.max(0, ms)));

// Load an image or video with a hard timeout so a missing asset can't hang
// the entire render. Resolves on success, rejects on error or timeout.
const loadMedia = (el: HTMLImageElement | HTMLVideoElement, src: string, timeoutMs: number): Promise<void> => {
    return new Promise((resolve, reject) => {
        let done = false;
        const finish = (fn: () => void) => { if (!done) { done = true; fn(); } };
        const timer = setTimeout(() => finish(() => reject(new Error(`media load timeout: ${src.slice(0, 60)}`))), timeoutMs);
        const onOk = () => finish(() => { clearTimeout(timer); resolve(); });
        const onErr = () => finish(() => { clearTimeout(timer); reject(new Error(`media load error: ${src.slice(0, 60)}`)); });
        if (el instanceof HTMLImageElement) {
            el.onload = onOk;
            el.onerror = onErr;
        } else {
            el.onloadeddata = onOk;
            el.onerror = onErr;
        }
        el.src = src;
    });
};

interface RendererProps {
    scenes: Scene[];
    assets: GeneratedAssets;
    resolution: Resolution;
    aspectRatio: AspectRatio;
    globalStyle: string;
    mastering?: ProjectState['mastering'];
    cinematicProfile?: ProjectState['cinematicProfile'];
    onComplete: (url: string) => void;
    onCancel: () => void;
}

type RenderState = 'initializing' | 'rendering' | 'validating' | 'complete' | 'error';

export const Renderer: React.FC<RendererProps> = ({ scenes, assets, resolution, aspectRatio, globalStyle, mastering, cinematicProfile = 'natural', onComplete, onCancel }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [renderState, setRenderState] = useState<RenderState>('initializing');
    const [statusMessage, setStatusMessage] = useState("Initializing Pipeline...");
    const [progress, setProgress] = useState(0);
    const [finalUrl, setFinalUrl] = useState<string | null>(null);
    const [finalMimeType, setFinalMimeType] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [currentSceneIdx, setCurrentSceneIdx] = useState(0);
    const [etaSec, setEtaSec] = useState<number | null>(null);

    // Refs let mid-render slider changes update visual effects on the next frame
    // without restarting the whole render. Audio gain nodes are also live-updated
    // via separate refs that the gain plumbing reads on each frame.
    const masteringRef = useRef(mastering);
    const cinematicProfileRef = useRef(cinematicProfile);
    const bgMusicGainRef = useRef<GainNode | null>(null);
    const ambientGainRef = useRef<GainNode | null>(null);
    const voiceGainRefs = useRef<Set<GainNode>>(new Set());
    // Pre-rendered monochromatic noise plates for film grain (B7). The old
    // implementation painted 5 random pixels per frame — that read as digital
    // dropout, not grain. Plates are generated once at the start of the render
    // effect and cycled by frame index to give the grain temporal variation
    // without per-frame allocation.
    const grainPlatesRef = useRef<HTMLCanvasElement[]>([]);
    useEffect(() => { masteringRef.current = mastering; }, [mastering]);
    useEffect(() => { cinematicProfileRef.current = cinematicProfile; }, [cinematicProfile]);
    // Live-apply music volume changes during a render. The bg music gain is the
    // sidechain target — multiplying by the duck factor would require knowing
    // whether TTS is currently active, so we just refresh the base value here.
    useEffect(() => {
        const g = bgMusicGainRef.current;
        if (!g) return;
        try { g.gain.cancelScheduledValues(0); g.gain.setValueAtTime((mastering?.musicVolume ?? 15) / 100, 0); } catch (e) { /* node detached */ }
    }, [mastering?.musicVolume]);
    useEffect(() => {
        const g = ambientGainRef.current;
        if (!g) return;
        try { g.gain.cancelScheduledValues(0); g.gain.setValueAtTime((mastering?.ambientVolume ?? 30) / 100, 0); } catch (e) { /* node detached */ }
    }, [mastering?.ambientVolume]);
    useEffect(() => {
        const v = (mastering?.voiceVolume ?? 100) / 100;
        voiceGainRefs.current.forEach(g => { try { g.gain.setValueAtTime(v, 0); } catch (e) { /* node detached */ } });
    }, [mastering?.voiceVolume]);

    let width = resolution === Resolution.FHD ? 1920 : 1280;
    let height = resolution === Resolution.FHD ? 1080 : 720;

    if (aspectRatio === AspectRatio.PORTRAIT) [width, height] = [height, width];
    else if (aspectRatio === AspectRatio.SQUARE) width = height = resolution === Resolution.FHD ? 1080 : 720;

    const applyGrading = (ctx: CanvasRenderingContext2D, grade?: ColorGrade) => {
        const liveCinematic = cinematicProfileRef.current ?? 'natural';
        const liveMastering = masteringRef.current;
        let filters = [];
        if (grade) {
            filters.push(`contrast(${grade.contrast || 100}%)`);
            filters.push(`saturate(${grade.saturation || 100}%)`);
            filters.push(`brightness(${grade.brightness || 100}%)`);
            filters.push(`hue-rotate(${((grade.temperature || 0) / 100) * 15}deg)`);
            filters.push(`brightness(${100 + (grade.exposure || 0)}%)`);
        }

        if (liveCinematic === 'dreamy') filters.push('sepia(20%) brightness(110%) blur(0.5px)');
        if (liveCinematic === 'high_contrast') filters.push('contrast(140%) saturate(130%)');
        if (liveCinematic === 'vintage') filters.push('sepia(35%) contrast(90%) brightness(95%)');
        if (liveCinematic === 'noir') filters.push('grayscale(100%) contrast(150%)');

        // LUT preset approximations via CSS canvas filters. These are deliberate
        // approximations, not real 3D LUTs — the UI labels them accordingly
        // ("Warm Contrast" etc.) rather than as specific film stocks (B6).
        if (liveMastering?.lutPreset === 'kodak_5219') filters.push('contrast(110%) saturate(105%) sepia(5%)');
        if (liveMastering?.lutPreset === 'fuji_400h') filters.push('saturate(85%) contrast(95%) brightness(102%) hue-rotate(-3deg)');
        if (liveMastering?.lutPreset === 'noir') filters.push('grayscale(100%) contrast(120%)');
        if (liveMastering?.lutPreset === 'technicolor') filters.push('saturate(180%) contrast(110%)');

        ctx.filter = filters.join(' ') || 'none';
    };

    const drawOverlayText = (ctx: CanvasRenderingContext2D, overlay: TextOverlay, w: number, h: number, p: number) => {
        const { text, position, animation } = overlay;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.fillStyle = 'white';
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 15;
        ctx.font = 'bold 50px "Inter", sans-serif';

        let y = position === 'top' ? h * 0.15 : position === 'center' ? h / 2 : h * 0.85;
        let opacity = 1.0;
        let displayText = text;

        if (animation === 'slide_up') {
            const offset = (1 - Math.min(p * 5, 1)) * 60;
            y += offset;
            opacity = Math.min(p * 5, 1);
        } else if (animation === 'typewriter') {
            const charCount = Math.floor(text.length * Math.min(p * 3, 1));
            displayText = text.substring(0, charCount);
        } else if (animation === 'zoom_in') {
            const scale = 0.7 + Math.min(p * 4, 1) * 0.3;
            ctx.translate(w / 2, y);
            ctx.scale(scale, scale);
            ctx.translate(-w / 2, -y);
            opacity = Math.min(p * 4, 1);
        } else if (animation === 'fade') {
            opacity = Math.min(p * 4, 1);
        }

        ctx.globalAlpha = opacity;
        ctx.fillText(displayText.toUpperCase(), w / 2, y);
        ctx.restore();
    };

    // Adaptive quality tier (R1). When the frame pacer detects sustained late
    // frames it bumps this up so applyMasteringEffects can drop optional layers.
    //   tier 0 — full effects (default)
    //   tier 1 — skip the per-frame grain composite (the most allocation-heavy)
    //   tier 2 — also skip bloom + light leak radial gradients
    const qualityTierRef = useRef(0);

    const applyMasteringEffects = (ctx: CanvasRenderingContext2D, w: number, h: number, elapsed: number) => {
        const liveMastering = masteringRef.current;
        const tier = qualityTierRef.current;
        // Subtle Lens Flare (always-on baseline ambient sparkle)
        if (Math.sin(elapsed / 2000) > 0.85) {
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            const flareX = (Math.cos(elapsed / 2500) + 1) / 2 * w;
            const flareY = (Math.sin(elapsed / 4000) + 1) / 2 * h;
            const grad = ctx.createRadialGradient(flareX, flareY, 0, flareX, flareY, w * 0.4);
            grad.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
            grad.addColorStop(0.1, 'rgba(59, 130, 246, 0.04)');
            grad.addColorStop(1, 'transparent');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, w, h);
            ctx.restore();
        }

        // Bloom: bright-pass approximation via additive soft radial highlights
        const bloom = (liveMastering?.bloomIntensity ?? 0) / 100;
        if (bloom > 0 && tier < 2) {
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = bloom * 0.6;
            const cx = w / 2;
            const cy = h / 2;
            const r = Math.max(w, h) * 0.6;
            const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
            g.addColorStop(0, 'rgba(255,240,210,0.35)');
            g.addColorStop(0.4, 'rgba(255,220,180,0.10)');
            g.addColorStop(1, 'transparent');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, w, h);
            ctx.restore();
        }

        // Light leak: warm edge gradient that drifts over time
        const leak = (liveMastering?.lightLeakIntensity ?? 0) / 100;
        if (leak > 0 && tier < 2) {
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            const drift = (Math.sin(elapsed / 5000) + 1) / 2;
            const lx = drift * w;
            const ly = (1 - drift) * h;
            const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, Math.max(w, h) * 0.8);
            g.addColorStop(0, `rgba(255, 150, 80, ${leak * 0.55})`);
            g.addColorStop(0.3, `rgba(255, 100, 50, ${leak * 0.20})`);
            g.addColorStop(1, 'transparent');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, w, h);
            ctx.restore();
        }

        // Film burn: sporadic high-intensity orange flare gated on intensity
        const burn = (liveMastering?.filmBurnIntensity ?? 0) / 100;
        if (burn > 0 && Math.random() < burn * 0.05) {
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            const bx = Math.random() * w;
            const by = Math.random() * h;
            const br = Math.random() * Math.max(w, h) * 0.3 + 80;
            const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
            g.addColorStop(0, `rgba(255, 200, 100, ${0.6 * burn})`);
            g.addColorStop(0.3, `rgba(255, 120, 40, ${0.3 * burn})`);
            g.addColorStop(1, 'transparent');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, w, h);
            ctx.restore();
        }

        // Vignette
        const vignette = (liveMastering?.vignetteIntensity ?? 30) / 100;
        if (vignette > 0) {
            ctx.save();
            const gradient = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.75);
            gradient.addColorStop(0, 'transparent');
            gradient.addColorStop(1, `rgba(0,0,0,${vignette})`);
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, w, h);
            ctx.restore();
        }

        // Film grain (B7) — cycle pre-rendered monochromatic noise plates
        // composited via 'overlay'. Plates are stretched from 480×480 to the
        // output frame, which gives the grain a natural softness vs hard pixels.
        const grain = liveMastering?.filmGrain ?? 5;
        const plates = grainPlatesRef.current;
        if (grain > 0 && plates.length > 0 && tier < 1) {
            const plate = plates[Math.floor(elapsed / FRAME_INTERVAL_MS) % plates.length];
            ctx.save();
            ctx.globalCompositeOperation = 'overlay';
            ctx.globalAlpha = Math.min(0.35, grain / 150);
            ctx.drawImage(plate, 0, 0, w, h);
            ctx.restore();
        }
    };

    // Compute the per-frame camera transform (scale + translate) for a scene's
    // motion at progress p. Extracted so motion blur (B8) can sample two points
    // along the motion curve and composite them, instead of drawing single
    // crisp frames per step (which makes pans visibly judder).
    const computeMotionTransform = (motion: CameraMotion, p: number, w: number, h: number, mediaW: number, mediaH: number) => {
        let scale = Math.max(w / mediaW, h / mediaH);
        let translateX = 0;
        let translateY = 0;
        if (motion === 'zoom_in') scale *= (1 + p * 0.18);
        else if (motion === 'zoom_out') scale *= (1.18 - p * 0.18);
        else if (motion === 'pan_left') translateX = -p * 150;
        else if (motion === 'pan_right') translateX = p * 150;
        return { scale, translateX, translateY };
    };

    const drawMediaFrame = (
        ctx: CanvasRenderingContext2D,
        media: HTMLVideoElement | HTMLImageElement,
        w: number, h: number,
        p: number,
        scene: Scene,
        prevMedia: HTMLVideoElement | HTMLImageElement | null,
        durationMs: number
    ) => {
        ctx.save();
        const transition = scene.transition || 'fade';
        const transThreshold = 0.15; // First 15% is transition

        if (p < transThreshold && prevMedia) {
            const transP = p / transThreshold;
            if (transition === 'fade' || transition === 'crossfade') {
                ctx.globalAlpha = 1 - transP;
                ctx.drawImage(prevMedia, 0, 0, w, h);
                ctx.globalAlpha = transP;
                ctx.drawImage(media, 0, 0, w, h);
            } else if (transition === 'slide_left') {
                const offset = transP * w;
                ctx.drawImage(prevMedia, -offset, 0, w, h);
                ctx.drawImage(media, w - offset, 0, w, h);
            } else if (transition === 'slide_right') {
                const offset = transP * w;
                ctx.drawImage(prevMedia, offset, 0, w, h);
                ctx.drawImage(media, offset - w, 0, w, h);
            } else {
                ctx.drawImage(media, 0, 0, w, h);
            }
        } else {
            applyGrading(ctx, scene.colorGrading);
            const mediaW = media instanceof HTMLVideoElement ? media.videoWidth : media.naturalWidth;
            const mediaH = media instanceof HTMLVideoElement ? media.videoHeight : media.naturalHeight;
            const motion = scene.cameraMotion || 'random_cinematic';
            const hasMotion = motion === 'zoom_in' || motion === 'zoom_out' || motion === 'pan_left' || motion === 'pan_right';

            const drawAt = (t: number, alpha: number) => {
                const { scale, translateX, translateY } = computeMotionTransform(motion, t, w, h, mediaW, mediaH);
                const drawW = mediaW * scale;
                const drawH = mediaH * scale;
                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.translate(translateX, translateY);
                ctx.drawImage(media, (w - drawW) / 2, (h - drawH) / 2, drawW, drawH);
                ctx.restore();
            };

            if (hasMotion && durationMs > 0) {
                // Motion blur (B8): composite the current frame with a half-frame-back
                // sample of the same motion path. Without this, pans on detail-heavy
                // backgrounds visibly judder; with it the camera move feels smoother
                // and reads as real motion blur rather than per-frame jumps.
                const dp = (FRAME_INTERVAL_MS * 0.5) / durationMs;
                const pPrev = Math.max(0, p - dp);
                drawAt(pPrev, 0.4);
                drawAt(p, 0.85);
            } else {
                drawAt(p, 1);
            }
        }
        ctx.restore();
    };

    useEffect(() => {
        let isCancelled = false;
        let audioCtx: AudioContext | null = null;
        const chunks: Blob[] = [];
        // Track audio buffer sources so we can stop them at scene boundaries
        // — otherwise long TTS bleeds into the next scene.
        const activeSources: AudioBufferSourceNode[] = [];
        // Decoded music buffers cached by mood key so a mood that repeats does
        // not re-download and re-decode the same track.
        const musicBufferCache = new Map<string, AudioBuffer>();
        // Ambient SFX cache mirrors music cache. The renderer used to define
        // AMBIENT_TRACKS but never reference it (B1) — wiring the same crossfade
        // bus pattern lets the per-scene ambientSfx field actually do something.
        const ambientBufferCache = new Map<string, AudioBuffer>();
        // Currently-playing music source plus its dedicated crossfade gain node
        // (per-track), letting two tracks overlap during a transition. The shared
        // bgMusicGain handles overall volume + sidechain ducking.
        let activeMusic: { source: AudioBufferSourceNode; crossfadeGain: GainNode } | null = null;
        let activeAmbient: { source: AudioBufferSourceNode; crossfadeGain: GainNode } | null = null;
        let bgMusicGain: GainNode | null = null;
        let ambientGain: GainNode | null = null;
        let currentMusicMood: string | null = null;
        let currentAmbientTrack: string | null = null;
        const MUSIC_CROSSFADE_SEC = 1.0;
        const AMBIENT_CROSSFADE_SEC = 1.5;

        const startRendering = async () => {
            if (!canvasRef.current) return;

            const mimeType = pickMimeType();
            if (!mimeType) {
                setRenderState('error');
                setErrorMsg('Your browser does not support any compatible video codec for recording.');
                return;
            }

            // Pre-generate grain plates once per render (B7). Reused every frame
            // so we don't reallocate noise data 30 times a second.
            if (grainPlatesRef.current.length === 0) {
                for (let i = 0; i < GRAIN_PLATE_COUNT; i++) grainPlatesRef.current.push(createGrainPlate());
            }

            // 48kHz is the video-standard output rate. TTS at 24kHz upsamples
            // cleanly through Web Audio's resampler; 44.1kHz Wikimedia music
            // tracks keep their full bandwidth instead of being downsampled to
            // the TTS native rate as they were under the old 24kHz context (B3).
            audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 48000 });
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d', { alpha: false })!;
            const stream = canvas.captureStream(TARGET_FPS);
            const destNode = audioCtx.createMediaStreamDestination();
            const tracks = [...stream.getVideoTracks(), ...destNode.stream.getAudioTracks()];
            const combinedStream = new MediaStream(tracks);

            // Master compressor sits between all audio sources and the recorded
            // output. Prevents clipping when TTS + music + ambient stack up and
            // keeps overall loudness more consistent across scenes.
            const masterCompressor = audioCtx.createDynamicsCompressor();
            masterCompressor.threshold.value = -8;   // start compressing 8 dB below peak
            masterCompressor.knee.value = 6;
            masterCompressor.ratio.value = 4;
            masterCompressor.attack.value = 0.005;   // 5 ms — fast enough to catch transients
            masterCompressor.release.value = 0.1;    // 100 ms — smooth recovery
            masterCompressor.connect(destNode);

            const normalMusicGainValue = (mastering?.musicVolume ?? 15) / 100;
            // Bg music ducks to 30% of its normal level while TTS plays.
            const duckedMusicGainValue = normalMusicGainValue * 0.3;
            bgMusicGain = audioCtx.createGain();
            bgMusicGain.gain.value = normalMusicGainValue;
            bgMusicGain.connect(masterCompressor);
            bgMusicGainRef.current = bgMusicGain;

            // Ambient SFX bus parallel to music. Per-scene ambientSfx routes
            // through this gain so the mastering panel's ambientVolume slider
            // works as a single hose for all ambient tracks.
            const ambientBusValue = (mastering?.ambientVolume ?? 30) / 100;
            ambientGain = audioCtx.createGain();
            ambientGain.gain.value = ambientBusValue;
            ambientGain.connect(masterCompressor);
            ambientGainRef.current = ambientGain;

            // Voice bus carries the speech normalization gain (Q2). Per-line voice
            // gains chain through this, so the live voiceVolume slider can keep
            // writing to the per-line gain without clobbering the normalization.
            const voiceBusGain = audioCtx.createGain();
            // Default 1.0; replaced after the pre-decode/measurement pass below.
            voiceBusGain.gain.value = 1;

            // Voice bus splits into a dry path and a convolver-reverb wet path,
            // then both re-converge into the master compressor (Q5). Without the
            // reverb, TTS sounds glued-on-top-of-music — dry and unnatural.
            const voiceReverb = audioCtx.createConvolver();
            voiceReverb.buffer = createRoomImpulse(audioCtx);
            const voiceDryGain = audioCtx.createGain();
            voiceDryGain.gain.value = VOICE_REVERB_DRY;
            const voiceWetGain = audioCtx.createGain();
            voiceWetGain.gain.value = VOICE_REVERB_WET;
            voiceBusGain.connect(voiceDryGain).connect(masterCompressor);
            voiceBusGain.connect(voiceReverb).connect(voiceWetGain).connect(masterCompressor);

            const bitrate = computeBitrate(width, height, TARGET_FPS);
            const recorder = new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: bitrate });
            recorder.ondataavailable = e => chunks.push(e.data);
            recorder.onstop = () => {
                const blob = new Blob(chunks, { type: mimeType });
                const url = URL.createObjectURL(blob);
                setFinalUrl(url);
                setFinalMimeType(mimeType);
                setRenderState('complete');
                onComplete(url);
            };
            // Pre-decode every scene's TTS once so we can (a) measure integrated
            // loudness across the whole program, and (b) avoid re-decoding inside
            // the render loop. The normalization gain found here gets multiplied
            // into each voice gain node below.
            setStatusMessage('Measuring loudness…');
            const preDecoded = new Map<string, AudioBuffer>();
            for (const s of scenes) {
                if (isCancelled) return;
                const a = assets[s.id];
                if (!a?.audioUrl || !audioCtx) continue;
                try {
                    const audioBase64 = a.audioUrl.includes(',') ? a.audioUrl.split(',')[1] : a.audioUrl;
                    preDecoded.set(s.id, await decodeAudio(audioBase64, audioCtx));
                } catch (e) {
                    console.warn(`Pre-decode failed for scene ${s.id}:`, e);
                }
            }
            const speechNormalizationGain = computeNormalizationGain([...preDecoded.values()]);
            voiceBusGain.gain.value = speechNormalizationGain;
            console.log(`[Renderer] Speech normalization gain: ${speechNormalizationGain.toFixed(3)} (target ${TARGET_SPEECH_RMS_DBFS} dBFS)`);

            recorder.start(RECORDER_CHUNK_MS);
            setRenderState('rendering');

            let lastMedia: HTMLVideoElement | HTMLImageElement | null = null;
            const sceneDurations: number[] = []; // wall-clock time per scene for ETA

            for (let i = 0; i < scenes.length; i++) {
                if (isCancelled) break;
                const scene = scenes[i];
                const asset = assets[scene.id];
                setCurrentSceneIdx(i);
                setStatusMessage(`Manifesting Sequence ${i + 1}/${scenes.length}`);
                setProgress((i / scenes.length) * 100);

                // ETA: average elapsed-per-completed-scene × scenes remaining
                if (sceneDurations.length > 0) {
                    const avg = sceneDurations.reduce((a, b) => a + b, 0) / sceneDurations.length;
                    setEtaSec(Math.ceil(avg * (scenes.length - i) / 1000));
                }
                const sceneWallStart = performance.now();

                // TTS was pre-decoded above for loudness measurement (Q2). Falling
                // back to a fresh decode keeps the render going if a scene appeared
                // after the pre-decode pass (race-safe, though not currently
                // reachable since scenes are immutable for the render duration).
                let audioBuffer: AudioBuffer | null = preDecoded.get(scene.id) ?? null;
                if (!audioBuffer && asset?.audioUrl && audioCtx) {
                    try {
                        const audioBase64 = asset.audioUrl.includes(',') ? asset.audioUrl.split(',')[1] : asset.audioUrl;
                        audioBuffer = await decodeAudio(audioBase64, audioCtx);
                    } catch (e) {
                        console.error('TTS decode failed:', e);
                    }
                }

                const baseDurationSec = scene.estimatedDuration || 5;
                const AUDIO_TAIL_SEC = 0.4; // small breath after the line finishes
                const audioDurationSec = audioBuffer ? audioBuffer.duration : 0;
                const durationSec = Math.max(baseDurationSec, audioDurationSec + AUDIO_TAIL_SEC);
                const durationMs = durationSec * 1000;
                const sceneStart = performance.now();

                // Ambient SFX (per-scene track) — same crossfade pattern as music.
                // Empty/'none' fades out the active ambient without bringing a new one in.
                const sceneAmbient = scene.ambientSfx && scene.ambientSfx !== 'none' ? scene.ambientSfx : null;
                if (sceneAmbient !== currentAmbientTrack && audioCtx && ambientGain) {
                    const now = audioCtx.currentTime;
                    if (activeAmbient) {
                        const { source: oldSrc, crossfadeGain: oldGain } = activeAmbient;
                        oldGain.gain.cancelScheduledValues(now);
                        oldGain.gain.setValueAtTime(oldGain.gain.value, now);
                        oldGain.gain.linearRampToValueAtTime(0, now + AMBIENT_CROSSFADE_SEC);
                        setTimeout(() => { try { oldSrc.stop(); } catch (e) { /* already stopped */ } }, (AMBIENT_CROSSFADE_SEC + 0.05) * 1000);
                        activeAmbient = null;
                    }
                    if (sceneAmbient) {
                        const url = AMBIENT_TRACKS[sceneAmbient];
                        if (url) {
                            try {
                                let buf = ambientBufferCache.get(sceneAmbient);
                                if (!buf) {
                                    const resp = await fetch(url);
                                    const ab = await resp.arrayBuffer();
                                    buf = await audioCtx.decodeAudioData(ab);
                                    ambientBufferCache.set(sceneAmbient, buf);
                                }
                                const sfxMultiplier = ((scene.sfxVolume ?? 100) / 100);
                                const targetGain = Math.max(0, Math.min(1, sfxMultiplier));
                                const newGain = audioCtx.createGain();
                                newGain.gain.value = 0;
                                newGain.connect(ambientGain);
                                const newSrc = audioCtx.createBufferSource();
                                newSrc.buffer = buf;
                                newSrc.loop = true;
                                newSrc.connect(newGain);
                                newSrc.start(0);
                                newGain.gain.linearRampToValueAtTime(targetGain, now + AMBIENT_CROSSFADE_SEC);
                                activeAmbient = { source: newSrc, crossfadeGain: newGain };
                            } catch (e) {
                                console.error('Ambient SFX failed:', e);
                            }
                        }
                    }
                    currentAmbientTrack = sceneAmbient;
                } else if (sceneAmbient && activeAmbient && audioCtx) {
                    // Same ambient track continues, but a per-scene sfxVolume change should still apply.
                    const sfxMultiplier = Math.max(0, Math.min(1, (scene.sfxVolume ?? 100) / 100));
                    const t = audioCtx.currentTime;
                    activeAmbient.crossfadeGain.gain.cancelScheduledValues(t);
                    activeAmbient.crossfadeGain.gain.linearRampToValueAtTime(sfxMultiplier, t + 0.3);
                }

                // Music track (per-scene mood) — fade between tracks instead of hard-cutting.
                if (scene.musicMood && scene.musicMood !== currentMusicMood && audioCtx && bgMusicGain) {
                    const url = (MUSIC_TRACKS as any)[scene.musicMood];
                    if (url) {
                        try {
                            let buf = musicBufferCache.get(scene.musicMood);
                            if (!buf) {
                                const resp = await fetch(url);
                                const ab = await resp.arrayBuffer();
                                buf = await audioCtx.decodeAudioData(ab);
                                musicBufferCache.set(scene.musicMood, buf);
                            }

                            const now = audioCtx.currentTime;

                            // Fade out the currently-playing track, then stop it after the fade tail.
                            if (activeMusic) {
                                const { source: oldSrc, crossfadeGain: oldGain } = activeMusic;
                                oldGain.gain.cancelScheduledValues(now);
                                oldGain.gain.setValueAtTime(oldGain.gain.value, now);
                                oldGain.gain.linearRampToValueAtTime(0, now + MUSIC_CROSSFADE_SEC);
                                setTimeout(() => { try { oldSrc.stop(); } catch (e) { /* already stopped */ } }, (MUSIC_CROSSFADE_SEC + 0.05) * 1000);
                            }

                            // Fade in the new track from silent up to full crossfade gain.
                            const newGain = audioCtx.createGain();
                            newGain.gain.value = 0;
                            newGain.connect(bgMusicGain);
                            const newSrc = audioCtx.createBufferSource();
                            newSrc.buffer = buf;
                            newSrc.loop = true;
                            newSrc.connect(newGain);
                            newSrc.start(0);
                            newGain.gain.linearRampToValueAtTime(1, now + MUSIC_CROSSFADE_SEC);

                            activeMusic = { source: newSrc, crossfadeGain: newGain };
                            currentMusicMood = scene.musicMood;
                        } catch (e) {
                            console.error('Music track failed:', e);
                        }
                    }
                }

                // Start the pre-decoded TTS buffer at full length — the scene
                // duration was already extended above to accommodate it. Per-line
                // gain holds the user-facing voiceVolume; voiceBusGain (above)
                // holds the Q2 normalization factor so they compose cleanly.
                if (audioBuffer && audioCtx) {
                    const source = audioCtx.createBufferSource();
                    const gain = audioCtx.createGain();
                    gain.gain.value = (masteringRef.current?.voiceVolume ?? 100) / 100;
                    source.connect(gain);
                    gain.connect(voiceBusGain);
                    source.buffer = audioBuffer;
                    source.start(0);
                    activeSources.push(source);
                    voiceGainRefs.current.add(gain);

                    // Sidechain-style ducking: drop bg music while TTS plays, restore on end.
                    if (bgMusicGain) {
                        const now = audioCtx.currentTime;
                        bgMusicGain.gain.cancelScheduledValues(now);
                        bgMusicGain.gain.linearRampToValueAtTime(duckedMusicGainValue, now + 0.15);
                        source.onended = () => {
                            voiceGainRefs.current.delete(gain);
                            if (!audioCtx || !bgMusicGain) return;
                            const t = audioCtx.currentTime;
                            bgMusicGain.gain.cancelScheduledValues(t);
                            bgMusicGain.gain.linearRampToValueAtTime((masteringRef.current?.musicVolume ?? 15) / 100, t + 0.4);
                        };
                    }
                }

                // Media asset load with timeout
                let media: HTMLVideoElement | HTMLImageElement | null = null;
                try {
                    if (asset?.videoUrl) {
                        const v = document.createElement('video');
                        v.muted = true;
                        v.loop = true;
                        v.playsInline = true;
                        await loadMedia(v, asset.videoUrl, MEDIA_LOAD_TIMEOUT_MS);
                        await v.play().catch(() => { /* autoplay may be blocked, still draws frames */ });
                        media = v;
                    } else if (asset?.imageUrl) {
                        const img = new Image();
                        await loadMedia(img, asset.imageUrl, MEDIA_LOAD_TIMEOUT_MS);
                        media = img;
                    }
                } catch (e) {
                    console.warn(`Scene ${i} media load failed, falling back to black frame:`, e);
                    media = null;
                }

                // Fixed-step frame pacer — true 30 fps regardless of hardware.
                // Tracks late frames over a rolling window; if >20% of recent frames
                // miss budget we bump qualityTier so applyMasteringEffects can drop
                // optional layers (grain, then bloom + light leak). Tier drops back
                // down on recovery so the rest of the scene gets full quality (R1).
                let frameIndex = 0;
                let lateFrames = 0;
                const PACER_WINDOW = 30; // ≈1s of recent frames at 30 fps
                const lateWindow: number[] = []; // 1 = late, 0 = on time
                let lateWindowSum = 0;
                while (true) {
                    if (isCancelled) break;
                    const targetTime = sceneStart + frameIndex * FRAME_INTERVAL_MS;
                    const now = performance.now();
                    if (now - sceneStart >= durationMs) break;

                    let wasLate = 0;
                    if (now < targetTime) {
                        await sleep(targetTime - now);
                    } else if (now - targetTime > FRAME_INTERVAL_MS) {
                        lateFrames++;
                        wasLate = 1;
                    }
                    lateWindow.push(wasLate);
                    lateWindowSum += wasLate;
                    if (lateWindow.length > PACER_WINDOW) lateWindowSum -= lateWindow.shift()!;
                    if (lateWindow.length === PACER_WINDOW) {
                        const lateFrac = lateWindowSum / PACER_WINDOW;
                        const tier = qualityTierRef.current;
                        if (lateFrac > 0.4 && tier < 2) qualityTierRef.current = 2;
                        else if (lateFrac > 0.2 && tier < 1) qualityTierRef.current = 1;
                        else if (lateFrac < 0.05 && tier > 0) qualityTierRef.current = Math.max(0, tier - 1);
                    }

                    const elapsed = performance.now() - sceneStart;
                    const p = Math.min(elapsed / durationMs, 1);
                    ctx.fillStyle = '#000';
                    ctx.fillRect(0, 0, width, height);
                    if (media) {
                        drawMediaFrame(ctx, media, width, height, p, scene, lastMedia, durationMs);
                    }
                    applyMasteringEffects(ctx, width, height, elapsed);
                    if (scene.textOverlay) {
                        drawOverlayText(ctx, scene.textOverlay, width, height, p);
                    }
                    frameIndex++;
                }
                if (lateFrames > frameIndex * 0.05) {
                    console.warn(`Scene ${i}: ${lateFrames}/${frameIndex} frames missed frame budget (tier ${qualityTierRef.current})`);
                }

                // Stop scene-local audio sources so they don't bleed into the next scene
                for (const s of activeSources.splice(0)) {
                    try { s.stop(); } catch (e) { /* already stopped */ }
                }

                // Release the prior scene's media element — its transition use is
                // complete and holding it pinned keeps the video element decoding
                // in the background, bloating memory across long renders.
                if (lastMedia && lastMedia !== media) {
                    releaseMedia(lastMedia);
                }
                lastMedia = media;
                sceneDurations.push(performance.now() - sceneWallStart);
            }
            // Final scene's media also needs releasing once the loop exits.
            if (lastMedia) releaseMedia(lastMedia);
            if (activeMusic) {
                try { activeMusic.source.stop(); } catch (e) { /* already stopped */ }
                activeMusic = null;
            }
            if (activeAmbient) {
                try { activeAmbient.source.stop(); } catch (e) { /* already stopped */ }
                activeAmbient = null;
            }
            recorder.stop();
        };

        const releaseMedia = (m: HTMLVideoElement | HTMLImageElement) => {
            if (m instanceof HTMLVideoElement) {
                try { m.pause(); } catch (e) { /* already paused */ }
                try { m.removeAttribute('src'); m.load(); } catch (e) { /* element detached */ }
            }
            // Images don't hold streaming resources; let the GC handle them.
        };

        startRendering().catch(e => {
            console.error('Render failed:', e);
            setRenderState('error');
            setErrorMsg(e?.message || 'Render failed');
        });

        return () => {
            isCancelled = true;
            for (const s of activeSources) { try { s.stop(); } catch (e) { /* already stopped */ } }
            if (activeMusic) { try { activeMusic.source.stop(); } catch (e) { /* already stopped */ } }
            if (activeAmbient) { try { activeAmbient.source.stop(); } catch (e) { /* already stopped */ } }
            if (audioCtx) audioCtx.close();
        };
    // Intentionally excludes mastering and cinematicProfile — those are read
    // via refs so slider changes during a render apply on the next frame
    // instead of cancelling-and-restarting the whole render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scenes, assets]);

    return (
        <div className="fixed inset-0 bg-eclipse-black/98 flex flex-col items-center justify-center z-[500] backdrop-blur-3xl p-6">
            {renderState === 'error' ? (
                <div className="w-full max-w-2xl text-center p-12 glass-panel rounded-[3rem] border-red-500/30 animate-in zoom-in-95 duration-700">
                    <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-10 text-red-400 text-4xl shadow-lg border border-red-500/30">
                        <i className="fa-solid fa-triangle-exclamation"></i>
                    </div>
                    <h2 className="text-4xl font-bold text-white mb-4 uppercase font-mono italic">Render Halted</h2>
                    <p className="text-mystic-gray mb-12 text-sm">{errorMsg}</p>
                    <button onClick={onCancel} className="text-mystic-gray hover:text-white uppercase tracking-widest text-[9px] font-black py-4">Close Synthesis Lab</button>
                </div>
            ) : renderState === 'complete' ? (
                <div className="w-full max-w-2xl text-center p-12 glass-panel rounded-[3rem] border-white/10 animate-in zoom-in-95 duration-700">
                    <div className="w-20 h-20 bg-deep-sage/10 rounded-full flex items-center justify-center mx-auto mb-10 text-deep-sage text-4xl shadow-lg border border-deep-sage/20">
                        <i className="fa-solid fa-check"></i>
                    </div>
                    <h2 className="text-4xl font-bold text-white mb-4 uppercase font-mono italic">Compile Sequence Finalized</h2>
                    <p className="text-mystic-gray mb-12 text-sm uppercase tracking-widest font-bold">Neural tracks merged. Video unit ready for distribution.</p>
                    <div className="flex flex-col gap-4">
                        <a href={finalUrl!} download={`master_production_unit.${fileExtensionFor(finalMimeType)}`} className="bg-gold-gradient text-white py-6 rounded-2xl font-black uppercase tracking-[0.3em] text-[10px] shadow-xl hover:scale-[1.02] transition-all text-center">Download Master Unit</a>
                        <button onClick={onCancel} className="text-mystic-gray hover:text-white uppercase tracking-widest text-[9px] font-black py-4">Close Synthesis Lab</button>
                    </div>
                </div>
            ) : (
                <div className="w-full max-w-4xl text-center p-10 sm:p-14 glass-panel rounded-[3rem] border-white/5 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-white/5">
                        <div className="h-full bg-luna-gold transition-all duration-300" style={{ width: `${progress}%` }}></div>
                    </div>

                    <h2 className="text-3xl sm:text-4xl font-black text-white mb-2 font-mono uppercase tracking-tighter italic">{statusMessage}</h2>
                    <p className="text-[10px] text-mystic-gray uppercase tracking-[0.3em] font-bold mb-8">Live render preview</p>

                    <div className="relative bg-eclipse-black rounded-2xl overflow-hidden border border-white/10 shadow-2xl mb-8 mx-auto" style={{ maxWidth: '720px', aspectRatio: `${width} / ${height}` }}>
                        <canvas ref={canvasRef} width={width} height={height} className="block w-full h-full" />
                        <div className="absolute bottom-3 right-3 px-3 py-1.5 bg-eclipse-black/80 rounded-lg font-mono text-[10px] text-luna-gold font-black backdrop-blur-md">
                            {Math.floor(progress)}%
                        </div>
                    </div>

                    <div className="flex justify-center gap-8 sm:gap-12 flex-wrap">
                        <div className="flex flex-col">
                            <span className="text-[8px] font-black text-mystic-gray uppercase tracking-[0.4em] mb-1">Scene</span>
                            <span className="text-sm font-bold text-starlight font-mono">{currentSceneIdx + 1} / {scenes.length}</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[8px] font-black text-mystic-gray uppercase tracking-[0.4em] mb-1">ETA</span>
                            <span className="text-sm font-bold text-starlight font-mono">
                                {etaSec === null ? '—' : etaSec < 60 ? `${etaSec}s` : `${Math.floor(etaSec / 60)}m ${etaSec % 60}s`}
                            </span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[8px] font-black text-mystic-gray uppercase tracking-[0.4em] mb-1">Pass Index</span>
                            <span className="text-sm font-bold text-starlight">{(cinematicProfile || 'natural').toUpperCase()}</span>
                        </div>
                    </div>

                    <button onClick={onCancel} className="mt-10 text-mystic-gray hover:text-red-300 uppercase tracking-widest text-[9px] font-black py-2 transition-colors">
                        <i className="fa-solid fa-circle-stop mr-2"></i>Abort Render
                    </button>
                </div>
            )}
        </div>
    );
};
