
import React, { useState } from 'react';
import { Character } from '../types';
import { VOICE_PRESETS } from '../constants';
import { previewVoice } from '../services/gemini';

interface CharacterModalProps {
    character: Character;
    onClose: () => void;
    onSave: (char: Character) => void;
    onRegenerateImage: (id: string) => void;
}

export const CharacterModal: React.FC<CharacterModalProps> = ({ character, onClose, onSave, onRegenerateImage }) => {
    const [name, setName] = useState(character.name);
    const [visualPrompt, setVisualPrompt] = useState(character.visualPrompt);
    const [voiceId, setVoiceId] = useState(character.voiceId);
    const [speed, setSpeed] = useState(character.voiceSettings?.speed || 1.0);
    const [pitch, setPitch] = useState(character.voiceSettings?.pitch || 0);
    const [genderFilter, setGenderFilter] = useState<'All' | 'Male' | 'Female'>('All');
    const [isPreviewing, setIsPreviewing] = useState(false);

    const filteredPresets = genderFilter === 'All' ? VOICE_PRESETS : VOICE_PRESETS.filter(v => v.gender === genderFilter);

    const handlePreview = async () => {
        setIsPreviewing(true);
        try {
            const data = await previewVoice(voiceId, { speed, pitch });
            const audio = new Audio(`data:audio/pcm;base64,${data}`);
            // Note: Since it's raw PCM we might need the decoder, but for preview simple DataURI works if Gemini wraps it
            // For robust preview we'd use the decodeAudio helper
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            const binary = atob(data);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const dataView = new DataView(bytes.buffer);
            const buffer = ctx.createBuffer(1, bytes.length / 2, 24000);
            const channel = buffer.getChannelData(0);
            for (let i = 0; i < bytes.length / 2; i++) channel[i] = dataView.getInt16(i * 2, true) / 32768.0;
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.connect(ctx.destination);
            source.start(0);
        } catch (e) {
            console.error(e);
        } finally {
            setIsPreviewing(false);
        }
    };

    const handleSave = () => {
        onSave({
            ...character,
            name,
            visualPrompt,
            voiceId,
            voiceSettings: { speed, pitch }
        });
    };

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-eclipse-black/80 backdrop-blur-md animate-in fade-in">
            <div className="glass-panel w-full max-w-2xl rounded-3xl overflow-hidden border-luna-gold/20 shadow-2xl flex flex-col md:flex-row">
                {/* Character Preview Column */}
                <div className="w-full md:w-56 bg-eclipse-light p-6 flex flex-col items-center border-b md:border-b-0 md:border-r border-white/5">
                    <div className="w-40 h-40 rounded-2xl overflow-hidden border border-luna-gold/30 mb-6 group relative">
                        {character.referenceImageBase64 ? (
                            <img src={character.referenceImageBase64} className="w-full h-full object-cover" alt={character.name} />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-eclipse-black text-mystic-gray">
                                <i className="fa-solid fa-user-astronaut text-3xl"></i>
                            </div>
                        )}
                        <button
                            onClick={() => onRegenerateImage(character.id)}
                            className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            <i className="fa-solid fa-wand-magic-sparkles text-white text-xl"></i>
                        </button>
                    </div>
                    <p className="text-white font-bold text-center mb-1">{character.name}</p>
                    <p className="text-[10px] text-mystic-gray uppercase tracking-widest font-mono">ID: {character.id}</p>
                </div>

                {/* Form Column */}
                <div className="flex-1 p-8 overflow-y-auto max-h-[80vh]">
                    <h3 className="text-xl font-bold text-white mb-6 font-mono uppercase tracking-tighter">Voice & Persona Synth</h3>

                    <div className="space-y-6">
                        <div>
                            <label className="text-[10px] uppercase tracking-widest text-celestial-stone mb-2 block font-bold">Identity Label</label>
                            <input
                                type="text"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                className="w-full bg-eclipse-black border border-white/10 rounded-lg p-3 text-sm focus:border-luna-gold outline-none transition-colors"
                            />
                        </div>

                        <div>
                            <label className="text-[10px] uppercase tracking-widest text-celestial-stone mb-2 block font-bold">Visual Descriptor</label>
                            <textarea
                                value={visualPrompt}
                                onChange={e => setVisualPrompt(e.target.value)}
                                rows={3}
                                className="w-full bg-eclipse-black border border-white/10 rounded-lg p-3 text-xs focus:border-luna-gold outline-none transition-colors"
                            />
                        </div>

                        <div className="h-px bg-white/5 my-2"></div>

                        <div>
                            <label className="text-[10px] uppercase tracking-widest text-celestial-stone mb-2 block font-bold">Vocal Engine</label>
                            <div className="flex gap-2 mb-4">
                                {(['All', 'Female', 'Male'] as const).map(g => (
                                    <button
                                        key={g}
                                        onClick={() => setGenderFilter(g)}
                                        className={`px-4 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all ${genderFilter === g ? 'bg-luna-gold/20 text-luna-gold border border-luna-gold/50' : 'bg-white/5 text-celestial-stone border border-white/10 hover:text-white'}`}
                                    >
                                        {g} ({g === 'All' ? VOICE_PRESETS.length : VOICE_PRESETS.filter(v => v.gender === g).length})
                                    </button>
                                ))}
                            </div>
                            <div className="grid grid-cols-2 gap-3 mb-6 max-h-60 overflow-y-auto scrollbar-hide pr-1">
                                {filteredPresets.map(v => (
                                    <button
                                        key={v.id}
                                        onClick={() => setVoiceId(v.id)}
                                        className={`p-3 rounded-lg border text-left transition-all ${voiceId === v.id ? 'bg-luna-gold/10 border-luna-gold text-luna-gold' : 'bg-white/5 border-white/10 text-celestial-stone hover:text-white'}`}
                                    >
                                        <p className="text-[10px] font-bold truncate">{v.label}</p>
                                        <p className="text-[8px] uppercase tracking-tighter opacity-50">{v.gender}</p>
                                    </button>
                                ))}
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <div className="flex justify-between mb-2">
                                        <label className="text-[10px] uppercase font-bold text-celestial-stone">Speed</label>
                                        <span className="text-[10px] text-luna-gold font-mono">{speed}x</span>
                                    </div>
                                    <input type="range" min="0.5" max="2.0" step="0.1" value={speed} onChange={e => setSpeed(parseFloat(e.target.value))} className="w-full accent-luna-gold" />
                                </div>
                                <div>
                                    <div className="flex justify-between mb-2">
                                        <label className="text-[10px] uppercase font-bold text-celestial-stone">Pitch</label>
                                        <span className="text-[10px] text-luna-gold font-mono">{pitch}st</span>
                                    </div>
                                    <input type="range" min="-10" max="10" step="1" value={pitch} onChange={e => setPitch(parseInt(e.target.value))} className="w-full accent-luna-gold" />
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-4 pt-6">
                            <button onClick={handlePreview} disabled={isPreviewing} className="flex-1 bg-white/5 text-white border border-white/10 py-3 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-white/10 transition-colors">
                                {isPreviewing ? <i className="fa-solid fa-spinner fa-spin mr-2"></i> : <i className="fa-solid fa-waveform mr-2"></i>}
                                Sample Audio
                            </button>
                            <button onClick={handleSave} className="flex-1 bg-luna-gold text-white py-3 rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-luna-gold/20">
                                Save Profile
                            </button>
                        </div>
                        <button onClick={onClose} className="w-full text-mystic-gray hover:text-white transition-colors text-[9px] font-bold uppercase tracking-[0.2em] mt-2">
                            Dismiss Terminal
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
