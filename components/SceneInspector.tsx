
import React, { useState } from 'react';
import { Scene, Character, TransitionType, CameraMotion, DialogueLine, ColorGrade, TextOverlay } from '../types';
import { optimizeVisualPrompt } from '../services/gemini';

interface SceneInspectorProps {
    scene: Scene;
    characters: Character[];
    assetImage?: string;
    onUpdate: (updatedScene: Scene) => void;
    onClose: () => void;
}

const AMBIENT_PRESETS = [
    { label: 'None', value: 'none', icon: 'fa-volume-mute' },
    { label: 'Rain', value: 'rain', icon: 'fa-cloud-showers-heavy' },
    { label: 'City Hum', value: 'city_hum', icon: 'fa-city' },
    { label: 'Wind', value: 'wind', icon: 'fa-wind' },
    { label: 'Deep Space', value: 'space_drone', icon: 'fa-atom' },
    { label: 'Data Stream', value: 'data_stream', icon: 'fa-microchip' }
];

const EMOTION_PRESETS = [
    { label: 'Neutral', value: 'neutral', icon: 'fa-face-meh' },
    { label: 'Excited', value: 'excited', icon: 'fa-face-grin-stars' },
    { label: 'Whispered', value: 'whispered', icon: 'fa-face-shush' },
    { label: 'Serious', value: 'serious', icon: 'fa-face-expressionless' },
    { label: 'Empathetic', value: 'empathetic', icon: 'fa-face-smile-wink' },
    { label: 'Sarcastic', value: 'sarcastic', icon: 'fa-face-grin-tongue-wink' }
];

const TEXT_ANIMATIONS = [
    { label: 'None / Cut', value: 'fade' },
    { label: 'Slide Up', value: 'slide_up' },
    { label: 'Typewriter', value: 'typewriter' },
    { label: 'Cinematic Zoom', value: 'zoom_in' }
];

export const SceneInspector: React.FC<SceneInspectorProps> = ({ scene, characters, assetImage, onUpdate, onClose }) => {
    const [activeTab, setActiveTab] = useState<'optics' | 'narrative' | 'audio' | 'grading' | 'motion_gfx'>('optics');
    const [isOptimizing, setIsOptimizing] = useState(false);

    const updateField = (field: keyof Scene | string, value: any) => {
        onUpdate({ ...scene, [field]: value });
    };

    const updateGrade = (field: keyof ColorGrade, value: number) => {
        const currentGrade = scene.colorGrading || { contrast: 100, saturation: 100, brightness: 100, temperature: 0, tint: 0, exposure: 0, vibrance: 100 };
        updateField('colorGrading', { ...currentGrade, [field]: value });
    };

    const updateOverlay = (field: keyof TextOverlay, value: any) => {
        const currentOverlay = scene.textOverlay || { text: '', position: 'bottom', style: 'subtitle' };
        updateField('textOverlay', { ...currentOverlay, [field]: value });
    };

    const handleAIPolish = async () => {
        setIsOptimizing(true);
        try {
            const context = scene.narratorLines[0]?.text || scene.description;
            const polished = await optimizeVisualPrompt(context, "High-End Cinematic");
            updateField('visualPrompt', polished);
        } catch (e) {
            console.error('[SceneInspector] AI polish failed:', e);
        } finally {
            setIsOptimizing(false);
        }
    };

    const grade = scene.colorGrading || { contrast: 100, saturation: 100, brightness: 100, temperature: 0, tint: 0, exposure: 0, vibrance: 100 };
    const filterStyle = {
        filter: [
            `contrast(${grade.contrast}%)`,
            `saturate(${grade.saturation}%)`,
            `brightness(${grade.brightness + (grade.exposure || 0)}%)`,
            `hue-rotate(${(grade.temperature / 100) * 15}deg)`,
        ].join(' ')
    };

    return (
        <div className="fixed inset-0 z-[300] bg-eclipse-black/95 backdrop-blur-2xl flex items-center justify-center p-4 md:p-12 animate-in fade-in duration-500">
            <div className="w-full max-w-6xl h-full max-h-[90vh] glass-panel rounded-[2.5rem] border-white/10 flex flex-col overflow-hidden shadow-[0_0_100px_rgba(0,0,0,1)]">

                <div className="p-8 border-b border-white/5 flex justify-between items-center bg-white/5">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-luna-gold/20 border border-luna-gold/40 flex items-center justify-center text-luna-gold">
                            <i className="fa-solid fa-microscope text-xl"></i>
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-white uppercase tracking-tighter font-mono">Deep Scene Inspector</h2>
                            <p className="text-[10px] text-mystic-gray uppercase font-bold tracking-[0.3em]">ID: SEQUENCE_INF_{scene.id}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 rounded-full hover:bg-white/5 flex items-center justify-center text-mystic-gray hover:text-white transition-colors">
                        <i className="fa-solid fa-xmark text-lg"></i>
                    </button>
                </div>

                <div className="flex-1 flex overflow-hidden">
                    <div className="w-20 md:w-64 border-r border-white/5 flex flex-col p-4 gap-2 bg-black/20">
                        {[
                            { id: 'optics', label: 'Cinematic Optics', icon: 'fa-camera-retro' },
                            { id: 'narrative', label: 'Narrative Logic', icon: 'fa-pen-nib' },
                            { id: 'audio', label: 'Vocal Staging', icon: 'fa-waveform-lines' },
                            { id: 'grading', label: 'Color Grading', icon: 'fa-palette' },
                            { id: 'motion_gfx', label: 'Motion Graphics', icon: 'fa-wand-magic-sparkles' }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={`flex items-center gap-4 p-4 rounded-2xl transition-all ${activeTab === tab.id ? 'bg-luna-gold text-white shadow-lg shadow-luna-gold/20' : 'text-celestial-stone hover:bg-white/5'}`}
                            >
                                <i className={`fa-solid ${tab.icon} text-sm`}></i>
                                <span className="hidden md:inline text-[11px] font-bold uppercase tracking-widest">{tab.label}</span>
                            </button>
                        ))}
                    </div>

                    <div className="flex-1 overflow-y-auto p-10 font-sans scrollbar-hide">
                        {activeTab === 'optics' && (
                            <div className="space-y-12 animate-in slide-in-from-right-4 duration-500">
                                <section>
                                    <div className="flex justify-between items-end mb-6">
                                        <h3 className="text-xs font-black text-luna-gold uppercase tracking-[0.2em]">Visual Generation Engine</h3>
                                        <button
                                            onClick={handleAIPolish}
                                            disabled={isOptimizing}
                                            className="px-4 py-1.5 bg-white/5 border border-white/10 rounded-lg text-[9px] font-bold text-starlight hover:border-luna-gold transition-all"
                                        >
                                            {isOptimizing ? <i className="fa-solid fa-sync fa-spin mr-2"></i> : <i className="fa-solid fa-wand-magic-sparkles mr-2"></i>}
                                            AI Prompt Polish
                                        </button>
                                    </div>
                                    <textarea
                                        value={scene.visualPrompt}
                                        onChange={e => updateField('visualPrompt', e.target.value)}
                                        className="w-full nm-inset-input rounded-2xl p-6 text-sm text-celestial-stone focus:text-white outline-none focus:border-luna-gold/50 transition-all font-mono leading-relaxed"
                                        rows={4}
                                    />
                                </section>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                    <section>
                                        <h3 className="text-[10px] font-black text-mystic-gray uppercase tracking-widest mb-6">Virtual Lens & Motion</h3>
                                        <div className="space-y-6">
                                            <div>
                                                <label className="text-[10px] text-celestial-stone uppercase font-bold block mb-2">Camera Motion Profile</label>
                                                <select
                                                    value={scene.cameraMotion}
                                                    onChange={e => updateField('cameraMotion', e.target.value)}
                                                    className="w-full nm-inset-input border-none rounded-xl p-3 text-xs text-white outline-none focus:ring-1 focus:ring-luna-gold/30"
                                                >
                                                    <option value="random_cinematic">AI Directed Choice</option>
                                                    <option value="static">Lock-off (Static)</option>
                                                    <option value="zoom_in">Slow Push-in</option>
                                                    <option value="zoom_out">Slow Pull-out</option>
                                                    <option value="pan_left">Trucking Left</option>
                                                    <option value="pan_right">Trucking Right</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-[10px] text-celestial-stone uppercase font-bold block mb-2">Transition Matrix</label>
                                                <select
                                                    value={scene.transition}
                                                    onChange={e => updateField('transition', e.target.value)}
                                                    className="w-full nm-inset-input border-none rounded-xl p-3 text-xs text-white outline-none focus:ring-1 focus:ring-luna-gold/30"
                                                >
                                                    <option value="fade">Fade to Black</option>
                                                    <option value="crossfade">Cross-Dissolve</option>
                                                    <option value="cut">Hard Cut</option>
                                                    <option value="zoom_in">Optical Zoom In</option>
                                                    <option value="slide_left">Slide Left</option>
                                                    <option value="slide_right">Slide Right</option>
                                                </select>
                                            </div>
                                        </div>
                                    </section>
                                </div>
                            </div>
                        )}

                        {activeTab === 'audio' && (
                            <div className="space-y-12 animate-in slide-in-from-right-4 duration-500">
                                <section>
                                    <h3 className="text-xs font-black text-luna-gold uppercase tracking-[0.2em] mb-8">Ambient Soundscapes</h3>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-10">
                                        {AMBIENT_PRESETS.map(sfx => (
                                            <button
                                                key={sfx.value}
                                                onClick={() => updateField('ambientSfx', sfx.value)}
                                                className={`flex items-center gap-3 p-4 rounded-xl border transition-all ${scene.ambientSfx === sfx.value ? 'bg-luna-gold text-white border-luna-gold' : 'nm-button border-white/5 text-celestial-stone'}`}
                                            >
                                                <i className={`fa-solid ${sfx.icon} text-sm`}></i>
                                                <span className="text-[10px] font-bold uppercase tracking-widest">{sfx.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </section>

                                <section>
                                    <h3 className="text-xs font-black text-luna-gold uppercase tracking-[0.2em] mb-8">Vocal Staging & Emotional Range</h3>
                                    <div className="space-y-8">
                                        {scene.narratorLines.map((line, idx) => (
                                            <div key={idx} className="nm-panel p-6 rounded-3xl border border-white/5 space-y-6">
                                                <div className="flex justify-between items-center">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-8 h-8 rounded-full nm-button flex items-center justify-center text-luna-gold text-[8px] font-black uppercase">
                                                            {line.speaker[0]}
                                                        </div>
                                                        <p className="text-[10px] font-black text-white uppercase tracking-widest">{line.speaker}</p>
                                                    </div>
                                                    <div className="flex gap-2 overflow-x-auto scrollbar-hide max-w-[400px]">
                                                        {EMOTION_PRESETS.map(emotion => (
                                                            <button
                                                                key={emotion.value}
                                                                onClick={() => {
                                                                    const nextLines = [...scene.narratorLines];
                                                                    nextLines[idx] = { ...line, emotion: emotion.value as any };
                                                                    updateField('narratorLines', nextLines);
                                                                }}
                                                                className={`px-3 py-1.5 rounded-lg border text-[8px] font-bold uppercase tracking-tighter transition-all flex items-center gap-2 ${line.emotion === emotion.value ? 'bg-luna-gold border-luna-gold text-white' : 'bg-white/5 border-white/5 text-celestial-stone hover:text-white'}`}
                                                            >
                                                                <i className={`fa-solid ${emotion.icon}`}></i>
                                                                {emotion.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                                <textarea
                                                    value={line.text}
                                                    onChange={e => {
                                                        const nextLines = [...scene.narratorLines];
                                                        nextLines[idx] = { ...line, text: e.target.value };
                                                        updateField('narratorLines', nextLines);
                                                    }}
                                                    className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-xs text-celestial-stone focus:text-white outline-none italic leading-relaxed"
                                                    rows={2}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            </div>
                        )}

                        {activeTab === 'motion_gfx' && (
                            <div className="space-y-10 animate-in slide-in-from-right-4 duration-500">
                                <h3 className="text-xs font-black text-luna-gold uppercase tracking-[0.2em] mb-6">Motion Graphics Override</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                    <div className="space-y-8">
                                        <div>
                                            <label className="text-[10px] text-celestial-stone uppercase font-bold block mb-3 tracking-widest">Overlay Content</label>
                                            <input
                                                type="text"
                                                value={scene.textOverlay?.text || ""}
                                                onChange={e => updateOverlay('text', e.target.value)}
                                                placeholder="Enter display text..."
                                                className="w-full nm-inset-input border-none rounded-xl p-4 text-sm text-white font-medium outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-celestial-stone uppercase font-bold block mb-3 tracking-widest">Entrance Animation</label>
                                            <div className="grid grid-cols-2 gap-3">
                                                {TEXT_ANIMATIONS.map(anim => (
                                                    <button
                                                        key={anim.value}
                                                        onClick={() => updateOverlay('animation', anim.value)}
                                                        className={`p-3 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all ${scene.textOverlay?.animation === anim.value ? 'bg-luna-gold text-white border-luna-gold' : 'nm-button border-white/5 text-celestial-stone'}`}
                                                    >
                                                        {anim.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-celestial-stone uppercase font-bold block mb-3 tracking-widest">Vertical Staging</label>
                                            <div className="flex nm-inset-input p-1 rounded-xl">
                                                {['top', 'center', 'bottom'].map(pos => (
                                                    <button
                                                        key={pos}
                                                        onClick={() => updateOverlay('position', pos as any)}
                                                        className={`flex-1 py-2 rounded-lg text-[9px] font-bold uppercase transition-all ${scene.textOverlay?.position === pos ? 'bg-white/10 text-white shadow-inner' : 'text-mystic-gray hover:text-white'}`}
                                                    >
                                                        {pos}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="nm-panel rounded-[3rem] p-8 border border-white/5 bg-black/40 flex items-center justify-center relative overflow-hidden">
                                        <div className="text-center">
                                            <div className="w-16 h-16 rounded-2xl bg-luna-gold/10 flex items-center justify-center text-luna-gold mx-auto mb-6">
                                                <i className="fa-solid fa-play text-xl"></i>
                                            </div>
                                            <p className="text-[10px] text-mystic-gray uppercase font-bold tracking-widest">Preview Mode</p>
                                            <p className="text-xs text-celestial-stone mt-2 italic">Animation parameters are computed during sequence rendering.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'grading' && (
                            <div className="space-y-10 animate-in slide-in-from-right-4 duration-500">
                                <h3 className="text-xs font-black text-luna-gold uppercase tracking-[0.2em] mb-6">Per-Scene Color Correction</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                    <div className="space-y-6">
                                        {[
                                            { label: 'Contrast', field: 'contrast', min: 0, max: 200, unit: '%' },
                                            { label: 'Saturation', field: 'saturation', min: 0, max: 200, unit: '%' },
                                            { label: 'Exposure', field: 'exposure', min: -100, max: 100, unit: '' },
                                            { label: 'Brightness', field: 'brightness', min: 0, max: 200, unit: '%' },
                                            { label: 'Temperature', field: 'temperature', min: -100, max: 100, unit: '' },
                                            { label: 'Tint', field: 'tint', min: -100, max: 100, unit: '' }
                                        ].map(slider => (
                                            <div key={slider.field} className="space-y-3">
                                                <div className="flex justify-between items-center">
                                                    <label className="text-[10px] text-celestial-stone uppercase font-bold tracking-widest">{slider.label}</label>
                                                    <span className="text-[11px] font-mono text-luna-gold font-bold">{(scene.colorGrading as any)?.[slider.field] ?? (slider.field === 'temperature' || slider.field === 'tint' || slider.field === 'exposure' ? 0 : 100)}{slider.unit}</span>
                                                </div>
                                                <input
                                                    type="range"
                                                    min={slider.min}
                                                    max={slider.max}
                                                    value={(scene.colorGrading as any)?.[slider.field] ?? (slider.field === 'temperature' || slider.field === 'tint' || slider.field === 'exposure' ? 0 : 100)}
                                                    onChange={e => updateGrade(slider.field as any, parseInt(e.target.value))}
                                                    className="w-full accent-luna-gold"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex flex-col gap-6">
                                        <div className="aspect-video nm-inset-input rounded-3xl border border-white/5 relative overflow-hidden bg-black flex items-center justify-center">
                                            {assetImage ? (
                                                <img
                                                    src={assetImage}
                                                    className="w-full h-full object-cover transition-all duration-300"
                                                    style={filterStyle}
                                                    alt="Preview"
                                                />
                                            ) : (
                                                <div className="text-center space-y-4">
                                                    <i className="fa-solid fa-image text-3xl text-mystic-gray/20"></i>
                                                    <p className="text-[9px] uppercase font-black text-mystic-gray/40 tracking-widest">Awaiting Visual Take</p>
                                                </div>
                                            )}
                                            <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full border border-white/10">
                                                <span className="text-[8px] font-black text-white uppercase tracking-widest">Live Grading Preview</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'narrative' && (
                            <div className="space-y-10 animate-in slide-in-from-right-4 duration-500">
                                <section>
                                    <h3 className="text-xs font-black text-luna-gold uppercase tracking-[0.2em] mb-6">Scene Context Registry</h3>
                                    <input
                                        type="text"
                                        value={scene.description}
                                        onChange={e => updateField('description', e.target.value)}
                                        className="w-full nm-inset-input border-none rounded-xl p-4 text-sm text-white font-medium outline-none"
                                    />
                                </section>
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-8 border-t border-white/5 bg-white/5 flex justify-end gap-4">
                    <button onClick={onClose} className="px-8 py-3 text-[10px] font-bold text-celestial-stone uppercase tracking-widest hover:text-white transition-colors">Discard</button>
                    <button onClick={onClose} className="px-10 py-3 bg-gold-gradient text-white rounded-xl text-[10px] font-bold uppercase tracking-widest shadow-xl shadow-luna-gold/20 transition-all hover:scale-105 active:scale-95">Commit Scene Parameters</button>
                </div>
            </div>
        </div>
    );
};
