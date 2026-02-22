
import React, { useState } from 'react';
import { Character, CharacterPhysical } from '../types';
import { VOICE_PRESETS } from '../constants';
import { previewVoice, generateCharacterReferenceSheet, buildCanonicalPrompt } from '../services/gemini';

interface CharacterModalProps {
    character: Character;
    onClose: () => void;
    onSave: (char: Character) => void;
    onRegenerateImage: (id: string) => void;
    globalStyle?: string;
}

const EMPTY_PHYSICAL: CharacterPhysical = {
    age: '', build: '', height: '', skinTone: '', hairColor: '',
    hairStyle: '', eyeColor: '', facialFeatures: '', distinctiveMarks: '',
    typicalAttire: '', colorPalette: '',
};

export const CharacterModal: React.FC<CharacterModalProps> = ({ character, onClose, onSave, onRegenerateImage, globalStyle }) => {
    const [name, setName] = useState(character.name);
    const [visualPrompt, setVisualPrompt] = useState(character.visualPrompt);
    const [voiceId, setVoiceId] = useState(character.voiceId);
    const [speed, setSpeed] = useState(character.voiceSettings?.speed || 1.0);
    const [pitch, setPitch] = useState(character.voiceSettings?.pitch || 0);
    const [genderFilter, setGenderFilter] = useState<'All' | 'Male' | 'Female'>('All');
    const [isPreviewing, setIsPreviewing] = useState(false);
    const [activeTab, setActiveTab] = useState<'physical' | 'voice'>('physical');

    // Physical attributes state
    const [physical, setPhysical] = useState<CharacterPhysical>(character.physical || EMPTY_PHYSICAL);

    // Reference sheet state
    const [isGeneratingSheet, setIsGeneratingSheet] = useState(false);
    const [referenceSheet, setReferenceSheet] = useState<{ front: string; threeQuarter: string; profile: string; expression: string } | null>(null);
    const [selectedRefImage, setSelectedRefImage] = useState<string | null>(character.referenceImageBase64 || null);
    const [isApproved, setIsApproved] = useState(character.referenceImageApproved || false);

    const filteredPresets = genderFilter === 'All' ? VOICE_PRESETS : VOICE_PRESETS.filter(v => v.gender === genderFilter);

    const updatePhysical = (key: keyof CharacterPhysical, value: string) => {
        setPhysical(prev => {
            const updated = { ...prev, [key]: value };
            // Auto-assemble visualPrompt from physical fields
            const assembled = buildCanonicalPrompt({ ...character, name, physical: updated, visualPrompt: '' });
            if (assembled) setVisualPrompt(assembled);
            return updated;
        });
    };

    const handleGenerateSheet = async () => {
        setIsGeneratingSheet(true);
        try {
            const tempChar: Character = { ...character, name, physical, visualPrompt };
            const sheet = await generateCharacterReferenceSheet(tempChar, globalStyle || 'Cinematic');
            setReferenceSheet(sheet);
            setSelectedRefImage(sheet.front);
        } catch (e) {
            console.error('[CharacterModal] Reference sheet generation failed:', e);
        } finally {
            setIsGeneratingSheet(false);
        }
    };

    const handleApproveAsCanon = () => {
        if (!selectedRefImage) return;
        setIsApproved(true);
    };

    const handlePreview = async () => {
        setIsPreviewing(true);
        let ctx: AudioContext | null = null;
        try {
            const data = await previewVoice(voiceId, { speed, pitch });
            ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
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
            source.onended = () => { ctx?.close(); };
            source.start(0);
        } catch (e) {
            console.error(e);
            ctx?.close();
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
            voiceSettings: { speed, pitch },
            physical,
            referenceImageBase64: selectedRefImage || character.referenceImageBase64,
            referenceImageApproved: isApproved,
            canonicalSeed: isApproved ? (character.canonicalSeed || Math.floor(Math.random() * 2147483647)) : character.canonicalSeed,
        });
    };

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-eclipse-black/80 backdrop-blur-md animate-in fade-in">
            <div className="glass-panel w-full max-w-4xl rounded-3xl overflow-hidden border-luna-gold/20 shadow-2xl flex flex-col md:flex-row max-h-[90vh]">
                {/* Character Preview Column */}
                <div className="w-full md:w-56 bg-eclipse-light p-6 flex flex-col items-center border-b md:border-b-0 md:border-r border-white/5 shrink-0">
                    <div className="w-40 h-40 rounded-2xl overflow-hidden border border-luna-gold/30 mb-4 group relative">
                        {selectedRefImage ? (
                            <img src={selectedRefImage} className="w-full h-full object-cover" alt={character.name} />
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
                    {isApproved && (
                        <span className="text-[8px] font-bold text-deep-sage uppercase tracking-widest px-2 py-1 rounded bg-deep-sage/10 border border-deep-sage/20 mb-3">
                            Canon Approved
                        </span>
                    )}
                    <p className="text-white font-bold text-center mb-1">{name || character.name}</p>
                    <p className="text-[10px] text-mystic-gray uppercase tracking-widest font-mono mb-4">ID: {character.id.slice(-8)}</p>

                    {/* Reference Sheet Thumbnails */}
                    {referenceSheet && (
                        <div className="w-full mt-2">
                            <p className="text-[8px] text-mystic-gray uppercase tracking-widest mb-2 text-center font-bold">Select Reference</p>
                            <div className="grid grid-cols-2 gap-1">
                                {(['front', 'threeQuarter', 'profile', 'expression'] as const).map(key => (
                                    <button
                                        key={key}
                                        onClick={() => { setSelectedRefImage(referenceSheet[key]); setIsApproved(false); }}
                                        className={`rounded-lg overflow-hidden border-2 transition-all ${selectedRefImage === referenceSheet[key] ? 'border-luna-gold' : 'border-transparent opacity-60 hover:opacity-80'}`}
                                    >
                                        <img src={referenceSheet[key]} alt={key} className="w-full aspect-square object-cover" />
                                    </button>
                                ))}
                            </div>
                            <button
                                onClick={handleApproveAsCanon}
                                disabled={!selectedRefImage || isApproved}
                                className="mt-3 w-full py-2 bg-deep-sage/20 border border-deep-sage/40 text-deep-sage text-[8px] font-black uppercase tracking-widest rounded-lg hover:bg-deep-sage/30 disabled:opacity-40 transition-all"
                            >
                                {isApproved ? 'Canon Locked' : 'Approve as Canon'}
                            </button>
                        </div>
                    )}
                </div>

                {/* Form Column */}
                <div className="flex-1 p-8 overflow-y-auto scrollbar-hide">
                    <h3 className="text-xl font-bold text-white mb-1 font-mono uppercase tracking-tighter">Character Studio</h3>
                    <p className="text-[9px] text-mystic-gray uppercase tracking-[0.3em] mb-6">Physical Profile & Voice Synthesis</p>

                    {/* Tab Switcher */}
                    <div className="flex gap-2 mb-6 bg-black/30 p-1 rounded-xl">
                        {(['physical', 'voice'] as const).map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-luna-gold/20 text-luna-gold border border-luna-gold/30' : 'text-mystic-gray hover:text-white'}`}
                            >
                                {tab === 'physical' ? 'Physical Profile' : 'Voice Engine'}
                            </button>
                        ))}
                    </div>

                    {activeTab === 'physical' && (
                        <div className="space-y-6">
                            {/* Identity Label */}
                            <div>
                                <label className="text-[10px] uppercase tracking-widest text-celestial-stone mb-2 block font-bold">Identity Label</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    className="w-full bg-eclipse-black border border-white/10 rounded-lg p-3 text-sm focus:border-luna-gold outline-none transition-colors"
                                />
                            </div>

                            {/* Identity Section */}
                            <div className="p-4 rounded-2xl bg-white/3 border border-white/5">
                                <p className="text-[9px] text-luna-gold font-black uppercase tracking-[0.2em] mb-4">Identity</p>
                                <div className="grid grid-cols-3 gap-3">
                                    {(['age', 'build', 'height'] as const).map(field => (
                                        <div key={field}>
                                            <label className="text-[8px] text-mystic-gray uppercase tracking-widest mb-1 block capitalize">{field}</label>
                                            <input
                                                type="text"
                                                value={physical[field]}
                                                onChange={e => updatePhysical(field, e.target.value)}
                                                placeholder={field === 'age' ? '30s' : field === 'build' ? 'athletic' : '5\'10"'}
                                                className="w-full bg-eclipse-black border border-white/10 rounded-lg p-2 text-xs focus:border-luna-gold outline-none"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Appearance Section */}
                            <div className="p-4 rounded-2xl bg-white/3 border border-white/5">
                                <p className="text-[9px] text-luna-gold font-black uppercase tracking-[0.2em] mb-4">Appearance</p>
                                <div className="grid grid-cols-2 gap-3">
                                    {([['skinTone', 'Skin Tone', 'olive'], ['hairColor', 'Hair Color', 'dark brown'], ['hairStyle', 'Hair Style', 'short, neat'], ['eyeColor', 'Eye Color', 'hazel']] as const).map(([field, label, placeholder]) => (
                                        <div key={field}>
                                            <label className="text-[8px] text-mystic-gray uppercase tracking-widest mb-1 block">{label}</label>
                                            <input
                                                type="text"
                                                value={physical[field]}
                                                onChange={e => updatePhysical(field, e.target.value)}
                                                placeholder={placeholder}
                                                className="w-full bg-eclipse-black border border-white/10 rounded-lg p-2 text-xs focus:border-luna-gold outline-none"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Details Section */}
                            <div className="p-4 rounded-2xl bg-white/3 border border-white/5">
                                <p className="text-[9px] text-luna-gold font-black uppercase tracking-[0.2em] mb-4">Details</p>
                                <div className="space-y-3">
                                    {([['facialFeatures', 'Facial Features', 'strong jaw, high cheekbones'], ['distinctiveMarks', 'Distinctive Marks', 'small scar on left eyebrow']] as const).map(([field, label, placeholder]) => (
                                        <div key={field}>
                                            <label className="text-[8px] text-mystic-gray uppercase tracking-widest mb-1 block">{label}</label>
                                            <input
                                                type="text"
                                                value={physical[field]}
                                                onChange={e => updatePhysical(field, e.target.value)}
                                                placeholder={placeholder}
                                                className="w-full bg-eclipse-black border border-white/10 rounded-lg p-2 text-xs focus:border-luna-gold outline-none"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Style Section */}
                            <div className="p-4 rounded-2xl bg-white/3 border border-white/5">
                                <p className="text-[9px] text-luna-gold font-black uppercase tracking-[0.2em] mb-4">Style</p>
                                <div className="space-y-3">
                                    {([['typicalAttire', 'Typical Attire', 'charcoal suit, white shirt'], ['colorPalette', 'Color Palette', 'dark earth tones, navy, grey']] as const).map(([field, label, placeholder]) => (
                                        <div key={field}>
                                            <label className="text-[8px] text-mystic-gray uppercase tracking-widest mb-1 block">{label}</label>
                                            <input
                                                type="text"
                                                value={physical[field]}
                                                onChange={e => updatePhysical(field, e.target.value)}
                                                placeholder={placeholder}
                                                className="w-full bg-eclipse-black border border-white/10 rounded-lg p-2 text-xs focus:border-luna-gold outline-none"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Assembled Visual Prompt */}
                            <div>
                                <label className="text-[10px] uppercase tracking-widest text-celestial-stone mb-2 block font-bold">Assembled Visual Prompt</label>
                                <textarea
                                    value={visualPrompt}
                                    onChange={e => setVisualPrompt(e.target.value)}
                                    rows={3}
                                    className="w-full bg-eclipse-black border border-white/10 rounded-lg p-3 text-xs focus:border-luna-gold outline-none transition-colors"
                                />
                            </div>

                            {/* Generate Reference Sheet */}
                            <button
                                onClick={handleGenerateSheet}
                                disabled={isGeneratingSheet}
                                className="w-full py-3 bg-solar-amber/10 border border-solar-amber/30 text-solar-amber text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-solar-amber/20 transition-all disabled:opacity-50"
                            >
                                {isGeneratingSheet
                                    ? <><i className="fa-solid fa-spinner fa-spin mr-2"></i>Generating 4-angle reference sheet...</>
                                    : <><i className="fa-solid fa-grid-2 mr-2"></i>Generate Reference Sheet (4 angles)</>
                                }
                            </button>
                        </div>
                    )}

                    {activeTab === 'voice' && (
                        <div className="space-y-6">
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

                            <button onClick={handlePreview} disabled={isPreviewing} className="w-full bg-white/5 text-white border border-white/10 py-3 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-white/10 transition-colors">
                                {isPreviewing ? <i className="fa-solid fa-spinner fa-spin mr-2"></i> : <i className="fa-solid fa-waveform mr-2"></i>}
                                Sample Audio
                            </button>
                        </div>
                    )}

                    <div className="flex gap-4 pt-6 mt-4 border-t border-white/5">
                        <button onClick={handleSave} className="flex-1 bg-luna-gold text-white py-3 rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-luna-gold/20">
                            Save Profile
                        </button>
                        <button onClick={onClose} className="px-6 py-3 text-mystic-gray hover:text-white border border-white/10 rounded-xl transition-colors text-[9px] font-bold uppercase tracking-[0.2em]">
                            Dismiss
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
