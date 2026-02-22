
import React, { useState } from 'react';
import { ProjectState, LightingBrief } from '../types';
import { lutProcessor } from '../services/lutProcessor';

interface VFXMasterProps {
  mastering: ProjectState['mastering'];
  cinematicProfile: ProjectState['cinematicProfile'];
  lightingBrief?: LightingBrief;
  onUpdateMastering: (updates: Partial<ProjectState['mastering']>) => void;
  onUpdateProfile: (profile: ProjectState['cinematicProfile']) => void;
  onUpdateLightingBrief: (brief: LightingBrief) => void;
  onClose: () => void;
}

const DEFAULT_BRIEF: LightingBrief = {
  keyLightDirection: 'front',
  colorTemperature: 'neutral 5600K',
  shadowIntensity: 'medium',
  timeOfDay: 'midday',
  moodDescriptor: 'professional, clean',
};

export const VFXMaster: React.FC<VFXMasterProps> = ({
  mastering,
  cinematicProfile,
  lightingBrief,
  onUpdateMastering,
  onUpdateProfile,
  onUpdateLightingBrief,
  onClose
}) => {
  const [brief, setBrief] = useState<LightingBrief>(lightingBrief || DEFAULT_BRIEF);

  const updateBrief = <K extends keyof LightingBrief>(key: K, value: LightingBrief[K]) => {
    const updated = { ...brief, [key]: value };
    setBrief(updated);
    onUpdateLightingBrief(updated);
  };

  const profiles = [
    { id: 'natural', label: 'Natural', desc: 'Neutral balance for documentary realism.' },
    { id: 'dreamy', label: 'Dreamy', desc: 'Soft glows and ethereal warmth.' },
    { id: 'high_contrast', label: 'High Contrast', desc: 'Deep blacks and punchy highlights.' },
    { id: 'vintage', label: 'Vintage', desc: '16mm film stock with organic aging.' },
    { id: 'noir', label: 'Noir', desc: 'Dramatic shadows and monochrome textures.' }
  ];

  const lutNames = lutProcessor.getLUTNames();

  const assembledDescriptor = `${brief.keyLightDirection} key, ${brief.colorTemperature}, ${brief.shadowIntensity} shadows, ${brief.timeOfDay}, "${brief.moodDescriptor}"`;

  return (
    <div className="fixed inset-0 z-[400] bg-black/85 backdrop-blur-3xl flex items-center justify-center p-6 animate-in fade-in duration-300">
      <div className="nm-panel p-10 rounded-[3rem] w-full max-w-4xl border border-white/5 bg-eclipse-black shadow-[0_50px_150px_rgba(0,0,0,1)] overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center mb-10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-luna-gold/10 border border-luna-gold/30 flex items-center justify-center text-luna-gold">
              <i className="fa-solid fa-wand-magic-sparkles text-xl"></i>
            </div>
            <div>
              <h3 className="text-2xl font-black text-white uppercase font-mono tracking-tighter italic">VFX Synthesis Lab</h3>
              <p className="text-[10px] text-mystic-gray uppercase font-bold tracking-[0.3em]">Neural post-production mastering</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full nm-button flex items-center justify-center text-mystic-gray hover:text-white transition-all">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pr-6 scrollbar-hide space-y-12">

          {/* ── Lighting Brief ──────────────────────────────────────────── */}
          <section>
            <div className="flex items-center gap-3 mb-6">
              <i className="fa-solid fa-lightbulb text-solar-amber text-sm"></i>
              <h4 className="text-[10px] font-black text-solar-amber uppercase tracking-[0.3em]">Global Lighting Brief</h4>
            </div>
            <div className="p-6 rounded-2xl bg-solar-amber/5 border border-solar-amber/15 space-y-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* Key Light Direction */}
                <div>
                  <label className="text-[8px] text-mystic-gray uppercase tracking-widest mb-2 block font-bold">Key Direction</label>
                  <select
                    value={brief.keyLightDirection}
                    onChange={e => updateBrief('keyLightDirection', e.target.value as LightingBrief['keyLightDirection'])}
                    className="w-full bg-eclipse-black border border-white/10 rounded-lg p-2 text-xs text-white outline-none focus:border-solar-amber"
                  >
                    {(['left', 'right', 'front', 'top', 'rim'] as const).map(v => (
                      <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>
                    ))}
                  </select>
                </div>

                {/* Color Temperature */}
                <div>
                  <label className="text-[8px] text-mystic-gray uppercase tracking-widest mb-2 block font-bold">Color Temp</label>
                  <select
                    value={brief.colorTemperature}
                    onChange={e => updateBrief('colorTemperature', e.target.value as LightingBrief['colorTemperature'])}
                    className="w-full bg-eclipse-black border border-white/10 rounded-lg p-2 text-xs text-white outline-none focus:border-solar-amber"
                  >
                    {(['warm 3200K', 'neutral 5600K', 'cool 7500K', 'mixed'] as const).map(v => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </div>

                {/* Shadow Intensity */}
                <div>
                  <label className="text-[8px] text-mystic-gray uppercase tracking-widest mb-2 block font-bold">Shadows</label>
                  <select
                    value={brief.shadowIntensity}
                    onChange={e => updateBrief('shadowIntensity', e.target.value as LightingBrief['shadowIntensity'])}
                    className="w-full bg-eclipse-black border border-white/10 rounded-lg p-2 text-xs text-white outline-none focus:border-solar-amber"
                  >
                    {(['soft', 'medium', 'hard'] as const).map(v => (
                      <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>
                    ))}
                  </select>
                </div>

                {/* Time of Day */}
                <div>
                  <label className="text-[8px] text-mystic-gray uppercase tracking-widest mb-2 block font-bold">Time of Day</label>
                  <select
                    value={brief.timeOfDay}
                    onChange={e => updateBrief('timeOfDay', e.target.value as LightingBrief['timeOfDay'])}
                    className="w-full bg-eclipse-black border border-white/10 rounded-lg p-2 text-xs text-white outline-none focus:border-solar-amber"
                  >
                    {(['golden hour', 'midday', 'blue hour', 'night', 'interior'] as const).map(v => (
                      <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Mood Descriptor */}
              <div>
                <label className="text-[8px] text-mystic-gray uppercase tracking-widest mb-2 block font-bold">Mood Descriptor</label>
                <input
                  type="text"
                  value={brief.moodDescriptor}
                  onChange={e => updateBrief('moodDescriptor', e.target.value)}
                  placeholder="e.g. tense, lonely, heroic, intimate..."
                  className="w-full bg-eclipse-black border border-white/10 rounded-lg p-2 text-xs text-white outline-none focus:border-solar-amber"
                />
              </div>

              {/* Assembled descriptor preview */}
              <div className="p-3 rounded-xl bg-black/40 border border-solar-amber/10">
                <p className="text-[8px] text-mystic-gray uppercase tracking-widest mb-1 font-bold">Assembled Lighting Descriptor</p>
                <p className="text-[11px] text-solar-amber font-mono italic">{assembledDescriptor}</p>
              </div>
            </div>
          </section>

          {/* ── Cinematic Profile ────────────────────────────────────────── */}
          <section>
            <h4 className="text-[10px] font-black text-luna-gold uppercase tracking-[0.3em] mb-6">Cinematic Profile Selection</h4>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {profiles.map(prof => (
                <button
                  key={prof.id}
                  onClick={() => onUpdateProfile(prof.id as any)}
                  className={`p-4 rounded-2xl border text-left transition-all ${cinematicProfile === prof.id ? 'bg-luna-gold/10 border-luna-gold shadow-nm-gold' : 'nm-button border-white/5 opacity-60 hover:opacity-100'}`}
                >
                  <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${cinematicProfile === prof.id ? 'text-white' : 'text-celestial-stone'}`}>{prof.label}</p>
                  <p className="text-[8px] leading-tight text-mystic-gray">{prof.desc}</p>
                </button>
              ))}
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* ── Film Stock LUT ──────────────────────────────────────────── */}
            <section className="space-y-8">
              <h4 className="text-[10px] font-black text-mystic-gray uppercase tracking-[0.3em]">Film Stock Simulation (LUT)</h4>
              <div className="grid grid-cols-2 gap-3">
                {lutNames.map(lut => (
                  <button
                    key={lut.id}
                    onClick={() => onUpdateMastering({ lutPreset: lut.id as any })}
                    className={`p-4 rounded-xl border text-left transition-all ${mastering?.lutPreset === lut.id ? 'bg-luna-gold text-white border-luna-gold shadow-nm-gold' : 'nm-button border-white/5 text-celestial-stone hover:text-white'}`}
                  >
                    <p className="text-[9px] font-black uppercase tracking-widest">{lut.label}</p>
                    <p className="text-[7px] opacity-60 mt-1 leading-tight">{lut.description}</p>
                  </button>
                ))}
              </div>
            </section>

            {/* ── Texture Parameters ─────────────────────────────────────── */}
            <section className="space-y-6">
              <h4 className="text-[10px] font-black text-mystic-gray uppercase tracking-[0.3em]">Texture Parameters</h4>
              {[
                { label: 'Film Grain Intensity', field: 'filmGrain', icon: 'fa-droplet-slash' },
                { label: 'Optical Vignette', field: 'vignetteIntensity', icon: 'fa-circle-dot' },
                { label: 'Light Leak Probability', field: 'lightLeakIntensity', icon: 'fa-sun' },
                { label: 'Neural Bloom', field: 'bloomIntensity', icon: 'fa-certificate' }
              ].map(slider => (
                <div key={slider.field} className="space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-[9px] text-celestial-stone uppercase font-bold tracking-widest flex items-center gap-2">
                      <i className={`fa-solid ${slider.icon} text-[8px] text-luna-gold`}></i>
                      {slider.label}
                    </label>
                    <span className="text-[10px] text-luna-gold font-mono">{(mastering as any)?.[slider.field]}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={(mastering as any)?.[slider.field] || 0}
                    onChange={e => onUpdateMastering({ [slider.field]: parseInt(e.target.value) })}
                    className="w-full accent-luna-gold"
                  />
                </div>
              ))}
            </section>
          </div>
        </div>

        <div className="mt-12 p-8 border-t border-white/5 bg-white/5 flex justify-between items-center rounded-b-[2rem]">
          <p className="text-[10px] text-mystic-gray italic max-w-sm">Master configurations are applied globally to the synthesis pipeline during final render pass.</p>
          <button
            onClick={onClose}
            className="px-12 py-4 nm-button-gold text-white rounded-2xl font-black uppercase tracking-[0.3em] text-[10px] shadow-nm-gold hover:scale-[1.02] active:scale-95 transition-all"
          >
            Commit Master Grade
          </button>
        </div>
      </div>
    </div>
  );
};
