
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

// Adaptive bitrate: ~0.1 bits per pixel-second, clamped to a sane range so
// 720p doesn't waste bandwidth and 4K doesn't blow up file size.
const computeBitrate = (w: number, h: number, fps: number): number => {
    const raw = Math.round(w * h * fps * 0.1);
    return Math.max(2_000_000, Math.min(20_000_000, raw));
};

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
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [currentSceneIdx, setCurrentSceneIdx] = useState(0);
    const [etaSec, setEtaSec] = useState<number | null>(null);

    let width = resolution === Resolution.FHD ? 1920 : 1280;
    let height = resolution === Resolution.FHD ? 1080 : 720;

    if (aspectRatio === AspectRatio.PORTRAIT) [width, height] = [height, width];
    else if (aspectRatio === AspectRatio.SQUARE) width = height = resolution === Resolution.FHD ? 1080 : 720;

    const applyGrading = (ctx: CanvasRenderingContext2D, grade?: ColorGrade) => {
        let filters = [];
        if (grade) {
            filters.push(`contrast(${grade.contrast || 100}%)`);
            filters.push(`saturate(${grade.saturation || 100}%)`);
            filters.push(`brightness(${grade.brightness || 100}%)`);
            filters.push(`hue-rotate(${((grade.temperature || 0) / 100) * 15}deg)`);
            filters.push(`brightness(${100 + (grade.exposure || 0)}%)`);
        }

        if (cinematicProfile === 'dreamy') filters.push('sepia(20%) brightness(110%) blur(0.5px)');
        if (cinematicProfile === 'high_contrast') filters.push('contrast(140%) saturate(130%)');
        if (cinematicProfile === 'vintage') filters.push('sepia(35%) contrast(90%) brightness(95%)');
        if (cinematicProfile === 'noir') filters.push('grayscale(100%) contrast(150%)');

        // LUT Preset simulations
        if (mastering?.lutPreset === 'kodak_5219') filters.push('contrast(110%) saturate(105%) sepia(5%)');
        if (mastering?.lutPreset === 'noir') filters.push('grayscale(100%) contrast(120%)');
        if (mastering?.lutPreset === 'technicolor') filters.push('saturate(180%) contrast(110%)');

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

    const applyMasteringEffects = (ctx: CanvasRenderingContext2D, w: number, h: number, elapsed: number) => {
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
        const bloom = (mastering?.bloomIntensity ?? 0) / 100;
        if (bloom > 0) {
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
        const leak = (mastering?.lightLeakIntensity ?? 0) / 100;
        if (leak > 0) {
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
        const burn = (mastering?.filmBurnIntensity ?? 0) / 100;
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
        const vignette = (mastering?.vignetteIntensity ?? 30) / 100;
        if (vignette > 0) {
            ctx.save();
            const gradient = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.75);
            gradient.addColorStop(0, 'transparent');
            gradient.addColorStop(1, `rgba(0,0,0,${vignette})`);
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, w, h);
            ctx.restore();
        }

        // Film Grain
        const grain = mastering?.filmGrain ?? 5;
        if (grain > 0 && Math.random() > 0.5) {
            ctx.save();
            ctx.globalAlpha = grain / 200;
            ctx.fillStyle = `rgba(${Math.random() * 255},${Math.random() * 255},${Math.random() * 255},0.15)`;
            for (let i = 0; i < 5; i++) {
                ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
            }
            ctx.restore();
        }
    };

    const drawMediaFrame = (
        ctx: CanvasRenderingContext2D,
        media: HTMLVideoElement | HTMLImageElement,
        w: number, h: number,
        p: number,
        scene: Scene,
        prevMedia?: HTMLVideoElement | HTMLImageElement | null
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
            let scale = Math.max(w / mediaW, h / mediaH);
            const motion = scene.cameraMotion || 'random_cinematic';

            if (motion === 'zoom_in') scale *= (1 + p * 0.18);
            else if (motion === 'zoom_out') scale *= (1.18 - p * 0.18);
            else if (motion === 'pan_left') ctx.translate(-p * 150, 0);
            else if (motion === 'pan_right') ctx.translate(p * 150, 0);

            const drawW = mediaW * scale;
            const drawH = mediaH * scale;
            ctx.drawImage(media, (w - drawW) / 2, (h - drawH) / 2, drawW, drawH);
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
        let bgMusicSource: AudioBufferSourceNode | null = null;
        let bgMusicGain: GainNode | null = null;
        let currentMusicMood: string | null = null;

        const startRendering = async () => {
            if (!canvasRef.current) return;

            const mimeType = pickMimeType();
            if (!mimeType) {
                setRenderState('error');
                setErrorMsg('Your browser does not support any compatible video codec for recording.');
                return;
            }

            audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d', { alpha: false })!;
            const stream = canvas.captureStream(TARGET_FPS);
            const destNode = audioCtx.createMediaStreamDestination();
            const tracks = [...stream.getVideoTracks(), ...destNode.stream.getAudioTracks()];
            const combinedStream = new MediaStream(tracks);

            bgMusicGain = audioCtx.createGain();
            bgMusicGain.gain.value = (mastering?.musicVolume ?? 15) / 100;
            bgMusicGain.connect(destNode);

            const bitrate = computeBitrate(width, height, TARGET_FPS);
            const recorder = new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: bitrate });
            recorder.ondataavailable = e => chunks.push(e.data);
            recorder.onstop = () => {
                const blob = new Blob(chunks, { type: mimeType });
                const url = URL.createObjectURL(blob);
                setFinalUrl(url);
                setRenderState('complete');
                onComplete(url);
            };
            recorder.start();
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

                const durationSec = scene.estimatedDuration || 5;
                const durationMs = durationSec * 1000;
                const sceneStart = performance.now();

                // Music track (per-scene mood)
                if (scene.musicMood && scene.musicMood !== currentMusicMood) {
                    if (bgMusicSource) {
                        try { bgMusicSource.stop(); } catch (e) { /* already stopped */ }
                    }
                    const url = (MUSIC_TRACKS as any)[scene.musicMood];
                    if (url && audioCtx) {
                        try {
                            const resp = await fetch(url);
                            const ab = await resp.arrayBuffer();
                            const buf = await audioCtx.decodeAudioData(ab);
                            const src = audioCtx.createBufferSource();
                            src.buffer = buf;
                            src.loop = true;
                            src.connect(bgMusicGain!);
                            src.start(0);
                            bgMusicSource = src;
                            currentMusicMood = scene.musicMood;
                        } catch (e) {
                            console.error('Music track failed:', e);
                        }
                    }
                }

                // TTS narration — bounded to scene duration to prevent cross-scene bleed
                if (asset?.audioUrl && audioCtx) {
                    try {
                        const audioBase64 = asset.audioUrl.includes(',') ? asset.audioUrl.split(',')[1] : asset.audioUrl;
                        const buffer = await decodeAudio(audioBase64, audioCtx);
                        const source = audioCtx.createBufferSource();
                        const gain = audioCtx.createGain();
                        gain.gain.value = (mastering?.voiceVolume ?? 100) / 100;
                        source.connect(gain);
                        gain.connect(destNode);
                        source.buffer = buffer;
                        source.start(0, 0, durationSec);
                        activeSources.push(source);
                    } catch (e) {
                        console.error('TTS decode failed:', e);
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

                // Fixed-step frame pacer — true 30 fps regardless of hardware
                let frameIndex = 0;
                let lateFrames = 0;
                while (true) {
                    if (isCancelled) break;
                    const targetTime = sceneStart + frameIndex * FRAME_INTERVAL_MS;
                    const now = performance.now();
                    if (now - sceneStart >= durationMs) break;

                    if (now < targetTime) {
                        await sleep(targetTime - now);
                    } else if (now - targetTime > FRAME_INTERVAL_MS) {
                        lateFrames++;
                    }

                    const elapsed = performance.now() - sceneStart;
                    const p = Math.min(elapsed / durationMs, 1);
                    ctx.fillStyle = '#000';
                    ctx.fillRect(0, 0, width, height);
                    if (media) {
                        drawMediaFrame(ctx, media, width, height, p, scene, lastMedia);
                    }
                    applyMasteringEffects(ctx, width, height, elapsed);
                    if (scene.textOverlay) {
                        drawOverlayText(ctx, scene.textOverlay, width, height, p);
                    }
                    frameIndex++;
                }
                if (lateFrames > frameIndex * 0.05) {
                    console.warn(`Scene ${i}: ${lateFrames}/${frameIndex} frames missed frame budget`);
                }

                // Stop scene-local audio sources so they don't bleed into the next scene
                for (const s of activeSources.splice(0)) {
                    try { s.stop(); } catch (e) { /* already stopped */ }
                }
                lastMedia = media;
                sceneDurations.push(performance.now() - sceneWallStart);
            }
            if (bgMusicSource) {
                try { bgMusicSource.stop(); } catch (e) { /* already stopped */ }
            }
            recorder.stop();
        };

        startRendering().catch(e => {
            console.error('Render failed:', e);
            setRenderState('error');
            setErrorMsg(e?.message || 'Render failed');
        });

        return () => {
            isCancelled = true;
            for (const s of activeSources) { try { s.stop(); } catch (e) { /* already stopped */ } }
            if (bgMusicSource) { try { bgMusicSource.stop(); } catch (e) { /* already stopped */ } }
            if (audioCtx) audioCtx.close();
        };
    }, [scenes, assets, cinematicProfile, mastering]);

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
                        <a href={finalUrl!} download="master_production_unit.webm" className="bg-gold-gradient text-white py-6 rounded-2xl font-black uppercase tracking-[0.3em] text-[10px] shadow-xl hover:scale-[1.02] transition-all text-center">Download Master Unit</a>
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
