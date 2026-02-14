
import React from 'react';
import { ProjectState } from '../types';

interface VFXMasterProps {
  mastering: ProjectState['mastering'];
  cinematicProfile: ProjectState['cinematicProfile'];
  onUpdateMastering: (updates: Partial<ProjectState['mastering']>) => void;
  onUpdateProfile: (profile: ProjectState['cinematicProfile']) => void;
  onClose: () => void;
}

export const VFXMaster: React.FC<VFXMasterProps> = ({ 
  mastering, 
  cinematicProfile, 
  onUpdateMastering, 
  onUpdateProfile, 
  onClose 
}) => {
  const profiles = [
    { id: 'natural', label: 'Natural', desc: 'Neutral balance for documentary realism.' },
    { id: 'dreamy', label: 'Dreamy', desc: 'Soft glows and ethereal warmth.' },
    { id: 'high_contrast', label: 'High Contrast', desc: 'Deep blacks and punchy highlights.' },
    { id: 'vintage', label: 'Vintage', desc: '16mm film stock with organic aging.' },
    { id: 'noir', label: 'Noir', desc: 'Dramatic shadows and monochrome textures.' }
  ];

  const luts = [
    { id: 'none', label: 'Bypass (None)' },
    { id: 'kodak_5219', label: 'Kodak Vision3' },
    { id: 'fuji_400h', label: 'Fuji Pro 400H' },
    { id: 'noir', label: 'Panatomic-X' },
    { id: 'technicolor', label: 'Technicolor IV' }
  ];

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
            <section className="space-y-8">
              <h4 className="text-[10px] font-black text-mystic-gray uppercase tracking-[0.3em]">Film Stock Simulation (LUT)</h4>
              <div className="grid grid-cols-2 gap-4">
                {luts.map(lut => (
                  <button 
                    key={lut.id} 
                    onClick={() => onUpdateMastering({ lutPreset: lut.id as any })} 
                    className={`p-4 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all ${mastering?.lutPreset === lut.id ? 'bg-luna-gold text-white border-luna-gold shadow-nm-gold' : 'nm-button border-white/5 text-celestial-stone hover:text-white'}`}
                  >
                    {lut.label}
                  </button>
                ))}
              </div>
            </section>

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
