
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
    const [fileSize, setFileSize] = useState<string>('');

    // Helper function to download blob programmatically
    const downloadBlob = (url: string, filename: string) => {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
    };

    // Handle download button click
    const handleDownload = () => {
        if (finalUrl) {
            const timestamp = Date.now();
            const filename = `Human_Override_${timestamp}.webm`;
            downloadBlob(finalUrl, filename);
        }
    };

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
        // Subtle Lens Flare
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

        // Vignette
        const vignette = (mastering?.vignetteIntensity || 30) / 100;
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
        const grain = mastering?.filmGrain || 5;
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

        const startRendering = async () => {
            try {
                if (!canvasRef.current) return;
                audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 48000 });
                const canvas = canvasRef.current;
                const ctx = canvas.getContext('2d', { alpha: false })!;
                const stream = canvas.captureStream(30);
                const destNode = audioCtx.createMediaStreamDestination();
                const tracks = [...stream.getVideoTracks(), ...destNode.stream.getAudioTracks()];
                const combinedStream = new MediaStream(tracks);

                const recorder = new MediaRecorder(combinedStream, { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 25000000 });
                recorder.ondataavailable = e => chunks.push(e.data);
                recorder.onstop = () => {
                    if (chunks.length === 0) {
                        setRenderState('error');
                        setStatusMessage('Render produced no output data.');
                        return;
                    }
                    const blob = new Blob(chunks, { type: 'video/webm' });
                    const url = URL.createObjectURL(blob);

                    // Calculate file size for display
                    const sizeInMB = (blob.size / (1024 * 1024)).toFixed(2);
                    setFileSize(`${sizeInMB} MB`);

                    setFinalUrl(url);
                    setRenderState('complete');
                    onComplete(url);
                };
                recorder.start();
                setRenderState('rendering');

                let lastMedia: HTMLVideoElement | HTMLImageElement | null = null;

                for (let i = 0; i < scenes.length; i++) {
                    if (isCancelled) break;
                    const scene = scenes[i];
                    const asset = assets[scene.id];
                    setStatusMessage(`Manifesting Sequence ${i + 1}/${scenes.length}`);
                    setProgress((i / scenes.length) * 100);

                    const duration = (scene.estimatedDuration || 5) * 1000;
                    const startTime = Date.now();

                    // TTS mixing
                    if (asset?.audioUrl) {
                        try {
                            const buffer = await decodeAudio(asset.audioUrl.split(',')[1], audioCtx);
                            const source = audioCtx.createBufferSource();
                            const gain = audioCtx.createGain();
                            gain.gain.value = (mastering?.voiceVolume ?? 100) / 100;
                            source.connect(gain);
                            gain.connect(destNode);
                            source.buffer = buffer;
                            source.start(0);
                        } catch (audioErr) {
                            console.error(`[Renderer] Audio decode failed for scene ${i + 1}:`, audioErr);
                        }
                    }

                    let media: HTMLVideoElement | HTMLImageElement | null = null;
                    if (asset?.videoUrl) {
                        media = document.createElement('video');
                        media.src = asset.videoUrl;
                        media.muted = true;
                        media.loop = true;
                        await media.play().catch(e => console.warn(`[Renderer] Video autoplay blocked for scene ${i + 1}:`, e));
                    } else if (asset?.imageUrl) {
                        media = new Image();
                        media.src = asset.imageUrl;
                        await new Promise(r => media!.onload = r);
                    }

                    while (Date.now() - startTime < duration) {
                        if (isCancelled) break;
                        const elapsed = Date.now() - startTime;
                        const p = elapsed / duration;
                        ctx.fillStyle = '#000';
                        ctx.fillRect(0, 0, width, height);
                        if (media) {
                            drawMediaFrame(ctx, media, width, height, p, scene, lastMedia);
                            applyMasteringEffects(ctx, width, height, elapsed);
                            if (scene.textOverlay) {
                                drawOverlayText(ctx, scene.textOverlay, width, height, p);
                            }
                        }
                        await new Promise(r => requestAnimationFrame(r));
                    }
                    lastMedia = media;
                }
                recorder.stop();
            } catch (err) {
                console.error('[Renderer] Rendering failed:', err);
                setRenderState('error');
                setStatusMessage(`Render pipeline failed: ${(err as any)?.message || 'Unknown error'}`);
            }
        };

        startRendering();
        return () => { isCancelled = true; if (audioCtx) audioCtx.close(); };
    }, [scenes, assets, cinematicProfile]);

    return (
        <div className="fixed inset-0 bg-eclipse-black/98 flex flex-col items-center justify-center z-[500] backdrop-blur-3xl p-6">
            {renderState === 'complete' ? (
                <div className="w-full max-w-2xl text-center p-12 glass-panel rounded-[3rem] border-white/10 animate-in zoom-in-95 duration-700">
                    <div className="w-20 h-20 bg-deep-sage/10 rounded-full flex items-center justify-center mx-auto mb-10 text-deep-sage text-4xl shadow-lg border border-deep-sage/20">
                        <i className="fa-solid fa-check"></i>
                    </div>
                    <h2 className="text-4xl font-bold text-white mb-4 uppercase font-mono italic">Compile Sequence Finalized</h2>
                    <p className="text-mystic-gray mb-12 text-sm uppercase tracking-widest font-bold">Neural tracks merged. Video unit ready for distribution.</p>
                    {fileSize && (
                        <p className="text-mystic-gray/60 mb-6 text-xs font-mono">File Size: {fileSize}</p>
                    )}
                    <div className="flex flex-col gap-4">
                        <button onClick={handleDownload} className="bg-gold-gradient text-white py-6 rounded-2xl font-black uppercase tracking-[0.3em] text-[10px] shadow-xl hover:scale-[1.02] transition-all">Download Master Unit</button>
                        <button onClick={onCancel} className="text-mystic-gray hover:text-white uppercase tracking-widest text-[9px] font-black py-4">Close Synthesis Lab</button>
                    </div>
                </div>
            ) : renderState === 'error' ? (
                <div className="w-full max-w-2xl text-center p-12 glass-panel rounded-[3rem] border-solar-amber/20 animate-in zoom-in-95 duration-700">
                    <div className="w-20 h-20 bg-solar-amber/10 rounded-full flex items-center justify-center mx-auto mb-10 text-solar-amber text-4xl shadow-lg border border-solar-amber/20">
                        <i className="fa-solid fa-triangle-exclamation"></i>
                    </div>
                    <h2 className="text-3xl font-bold text-white mb-4 uppercase font-mono italic">Render Pipeline Failed</h2>
                    <p className="text-mystic-gray mb-8 text-xs">{statusMessage}</p>
                    <button onClick={onCancel} className="nm-button text-white px-10 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest">Close</button>
                </div>
            ) : (
                <div className="w-full max-w-3xl text-center p-16 glass-panel rounded-[4rem] border-white/5 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-white/5">
                        <div className="h-full bg-luna-gold transition-all duration-300" style={{ width: `${progress}%` }}></div>
                    </div>
                    <div className="relative mb-12">
                        <div className="w-40 h-40 border-4 border-luna-gold/10 border-t-luna-gold rounded-full animate-spin mx-auto"></div>
                        <div className="absolute inset-0 flex items-center justify-center font-mono text-xl font-black text-luna-gold">{Math.floor(progress)}%</div>
                    </div>
                    <h2 className="text-5xl font-black text-white mb-6 font-mono uppercase tracking-tighter italic">{statusMessage}</h2>
                    <div className="flex justify-center gap-10">
                        <div className="flex flex-col">
                            <span className="text-[8px] font-black text-mystic-gray uppercase tracking-[0.4em] mb-1">Pass Index</span>
                            <span className="text-xs font-bold text-starlight">{(cinematicProfile || 'natural').toUpperCase()}</span>
                        </div>
                    </div>
                </div>
            )}
            <canvas ref={canvasRef} width={width} height={height} className="hidden" />
        </div>
    );
};
