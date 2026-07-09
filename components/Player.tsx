
import React, { useState, useEffect, useRef } from 'react';
import { Scene, GeneratedAssets, ProjectState } from '../types';
import { decodeAudio } from '../services/gemini';
import { MUSIC_TRACKS } from '../constants';

interface PlayerProps {
    scenes: Scene[];
    assets: GeneratedAssets;
    mastering?: ProjectState['mastering'];
    onClose: () => void;
}

export const Player: React.FC<PlayerProps> = ({ scenes, assets, mastering, onClose }) => {
    const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);

    const isPlayingRef = useRef(isPlaying);
    useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

    const videoRef = useRef<HTMLVideoElement>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
    const bgMusicSourceRef = useRef<AudioBufferSourceNode | null>(null);
    const bgMusicGainRef = useRef<GainNode | null>(null);
    const voiceGainRef = useRef<GainNode | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const startTimeRef = useRef<number>(0);
    const currentMoodRef = useRef<string | null>(null);

    const currentScene = scenes[currentSceneIndex];
    const currentAsset = currentScene ? assets[currentScene.id] : undefined;

    useEffect(() => {
        let isCancelled = false;
        const runPlay = async () => {
            if (isPlaying) {
                await playScene(currentSceneIndex, () => isCancelled);
            }
        };
        runPlay();
        return () => {
            isCancelled = true;
            stopAll();
        };
    }, [isPlaying, currentSceneIndex]);

    // H7: Clean up AudioContext on unmount to prevent memory leak
    useEffect(() => {
        return () => {
            if (bgMusicSourceRef.current) {
                try { bgMusicSourceRef.current.stop(); } catch (e) { }
            }
            if (audioCtxRef.current) {
                audioCtxRef.current.close().catch(() => { });
                audioCtxRef.current = null;
            }
        };
    }, []);

    const stopAll = () => {
        if (audioSourceRef.current) {
            try { audioSourceRef.current.stop(); } catch (e) { }
        }
        if (videoRef.current) {
            videoRef.current.pause();
            videoRef.current.removeAttribute('src');
        }
        if (timerRef.current) {
            clearTimeout(timerRef.current);
        }
        setProgress(0);
    };

    const playScene = async (index: number, checkCancelled: () => boolean) => {
        if (index >= scenes.length) {
            setIsPlaying(false);
            setCurrentSceneIndex(0);
            return;
        }
        if (checkCancelled()) return;

        const scene = scenes[index];
        const asset = assets[scene.id];

        let durationMs = (scene.estimatedDuration || 4) * 1000;
        let audioBuffer: AudioBuffer | null = null;

        if (!audioCtxRef.current) {
            audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            voiceGainRef.current = audioCtxRef.current.createGain();
            voiceGainRef.current.connect(audioCtxRef.current.destination);
            bgMusicGainRef.current = audioCtxRef.current.createGain();
            bgMusicGainRef.current.connect(audioCtxRef.current.destination);
        }

        if (audioCtxRef.current.state === 'suspended') {
            await audioCtxRef.current.resume();
        }

        // M5: Apply mastering volume settings to gain nodes
        if (voiceGainRef.current) {
            voiceGainRef.current.gain.value = (mastering?.voiceVolume ?? 100) / 100;
        }
        if (bgMusicGainRef.current) {
            bgMusicGainRef.current.gain.value = (mastering?.musicVolume ?? 15) / 100;
        }

        if (scene.musicMood !== currentMoodRef.current) {
            if (bgMusicSourceRef.current) {
                try { bgMusicSourceRef.current.stop(); } catch (e) { }
            }
            const url = (MUSIC_TRACKS as any)[scene.musicMood];
            if (url) {
                try {
                    const resp = await fetch(url);
                    const ab = await resp.arrayBuffer();
                    const buffer = await audioCtxRef.current.decodeAudioData(ab);
                    const source = audioCtxRef.current.createBufferSource();
                    source.buffer = buffer;
                    source.loop = true;
                    source.connect(bgMusicGainRef.current!);
                    source.start(0);
                    bgMusicSourceRef.current = source;
                    currentMoodRef.current = scene.musicMood;
                } catch (e) {
                    console.error("BG music failed", e);
                }
            }
        }

        if (asset?.audioUrl) {
            try {
                audioBuffer = await decodeAudio(asset.audioUrl.split(',')[1], audioCtxRef.current);
                durationMs = Math.max(durationMs, audioBuffer.duration * 1000);
            } catch (e) {
                console.error("Audio decoding failed", e);
            }
        }

        if (checkCancelled()) return;

        if (asset?.videoUrl && videoRef.current) {
            videoRef.current.src = asset.videoUrl;
            videoRef.current.loop = true;
            videoRef.current.play().catch(e => console.error("Play failed", e));
        } else if (asset?.imageUrl && videoRef.current) {
            videoRef.current.poster = asset.imageUrl;
        }

        if (audioBuffer && audioCtxRef.current) {
            try {
                if (audioSourceRef.current) try { audioSourceRef.current.stop(); } catch (e) { }
                const source = audioCtxRef.current.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(voiceGainRef.current!);
                source.start(0);
                audioSourceRef.current = source;
            } catch (e) {
                console.error("Audio play failed", e);
            }
        }

        startTimeRef.current = Date.now();
        const updateProgress = () => {
            if (checkCancelled() || !isPlayingRef.current) return;
            const elapsed = Date.now() - startTimeRef.current;
            const p = Math.min(elapsed / durationMs, 1);
            setProgress(p * 100);
            if (elapsed < durationMs) {
                requestAnimationFrame(updateProgress);
            }
        };
        requestAnimationFrame(updateProgress);

        timerRef.current = setTimeout(() => {
            if (!checkCancelled()) {
                stopAll();
                setCurrentSceneIndex(i => i + 1);
            }
        }, durationMs);
    };

    const jumpToScene = (idx: number) => {
        stopAll();
        setCurrentSceneIndex(idx);
        if (!isPlaying) setIsPlaying(true);
    };

    return (
        <div className="fixed inset-0 z-50 bg-eclipse-black flex flex-col items-center justify-center p-4 backdrop-blur-xl">
            <button onClick={onClose} className="absolute top-10 right-10 nm-button w-12 h-12 rounded-full flex items-center justify-center text-mystic-gray hover:text-luna-gold transition-colors z-50">
                <i className="fa-solid fa-xmark"></i>
            </button>

            <div className="w-full max-w-5xl aspect-video bg-eclipse-black rounded-[2.5rem] nm-panel overflow-hidden relative shadow-2xl group/player">
                {currentAsset?.videoUrl ? (
                    <video ref={videoRef} className="w-full h-full object-contain" playsInline muted />
                ) : currentAsset?.imageUrl ? (
                    <img src={currentAsset.imageUrl} className="w-full h-full object-contain" alt="Scene" />
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-starlight/20">
                        <i className="fa-solid fa-circle-notch fa-spin text-4xl mb-4 text-luna-gold/50"></i>
                        {isPlaying ? 'Manifesting Sequence...' : 'Awaiting Production Start'}
                    </div>
                )}

                <div className="absolute inset-0 pointer-events-none opacity-[0.02] z-[25] bg-[url('https://www.transparenttextures.com/patterns/stardust.png')]"></div>

                <div className="absolute bottom-0 left-0 h-1.5 bg-luna-gold transition-all ease-linear z-30" style={{ width: `${progress}%` }}></div>

                {currentScene?.textOverlay && (
                    <div
                        className={`absolute w-full text-center px-8 pointer-events-none z-20 ${currentScene.textOverlay.position === 'top' ? 'top-10' : currentScene.textOverlay.position === 'center' ? 'top-1/2 -translate-y-1/2' : 'bottom-32'}`}
                        style={{
                            fontFamily: currentScene.textOverlay.fontFamily === 'mono' ? '"JetBrains Mono", monospace' : '"Inter", sans-serif',
                            fontSize: `${currentScene.textOverlay.fontSize || 24}px`,
                            color: currentScene.textOverlay.textColor || '#ffffff',
                            fontWeight: currentScene.textOverlay.isBold ? 'bold' : 'normal',
                            textShadow: currentScene.textOverlay.hasShadow ? '2px 2px 4px rgba(0,0,0,0.8)' : 'none',
                            textTransform: 'uppercase'
                        }}
                    >
                        <span className="bg-eclipse-black/40 backdrop-blur-md px-6 py-2 rounded-xl nm-button">
                            {currentScene.textOverlay.text}
                        </span>
                    </div>
                )}

                <div className="absolute bottom-16 left-0 right-0 text-center px-10 z-10">
                    <div className="inline-block bg-eclipse-black/60 backdrop-blur-lg px-8 py-4 rounded-2xl nm-button shadow-xl">
                        <p className="text-starlight text-lg font-light italic font-serif">
                            "{currentScene?.narratorLines?.[0]?.text || "..."}"
                        </p>
                    </div>
                </div>
            </div>

            <div className="mt-12 w-full max-w-5xl overflow-x-auto pb-6 scrollbar-hide px-4">
                <div className="flex gap-4 h-20 items-center">
                    {scenes.map((s, idx) => {
                        const asset = assets[s.id];
                        const isActive = currentSceneIndex === idx;
                        return (
                            <button
                                key={s.id}
                                onClick={() => jumpToScene(idx)}
                                className={`flex-shrink-0 w-32 h-full rounded-xl overflow-hidden nm-button p-[2px] transition-all relative ${isActive ? 'scale-110 shadow-nm-gold ring-2 ring-luna-gold/40' : 'opacity-40 hover:opacity-100'}`}
                            >
                                <div className="w-full h-full rounded-xl overflow-hidden">
                                    {asset?.imageUrl ? <img src={asset.imageUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-eclipse-black"></div>}
                                </div>
                                <div className="absolute inset-0 flex items-center justify-center text-[10px] font-mono font-bold text-white bg-black/20 rounded-xl">#{idx + 1}</div>
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="mt-8 flex items-center space-x-12 z-10">
                <button
                    onClick={() => { if (isPlaying) { setIsPlaying(false); stopAll(); } else { setIsPlaying(true); } }}
                    className="w-20 h-20 rounded-full nm-button-gold text-white flex items-center justify-center text-3xl hover:scale-105 transition-all shadow-nm-gold"
                >
                    <i className={`fa-solid ${isPlaying ? 'fa-pause' : 'fa-play ml-2'}`}></i>
                </button>

                <div className="flex flex-col">
                    <span className="text-luna-gold font-bold text-[10px] tracking-[0.3em] uppercase mb-1">Sequence Track</span>
                    <span className="text-starlight font-mono text-xl uppercase font-black">
                        Scene {currentSceneIndex + 1} <span className="text-celestial-stone/40">/ {scenes.length}</span>
                    </span>
                </div>
            </div>
        </div>
    );
};
