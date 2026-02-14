
import React from 'react';
import { ProjectState } from '../types';

interface AudioMixerProps {
  mastering: ProjectState['mastering'];
  onUpdate: (updates: Partial<ProjectState['mastering']>) => void;
  onClose: () => void;
}

export const AudioMixer: React.FC<AudioMixerProps> = ({ mastering, onUpdate, onClose }) => {
  const faders = [
    { key: 'voiceVolume', label: 'Narrative Core', icon: 'fa-microphone-lines', color: 'text-luna-gold', value: mastering?.voiceVolume || 100 },
    { key: 'musicVolume', label: 'Cinematic Score', icon: 'fa-music', color: 'text-solar-amber', value: mastering?.musicVolume || 15 },
    { key: 'ambientVolume', label: 'Atmosphere', icon: 'fa-wind', color: 'text-deep-sage', value: mastering?.ambientVolume || 30 },
  ];

  // Calculate master output in dB from combined volumes
  const calculateMasterDB = (): string => {
    const voice = mastering?.voiceVolume || 100;
    const music = mastering?.musicVolume || 15;
    const ambient = mastering?.ambientVolume || 30;
    const combined = voice + music + ambient;
    const amplitude = combined / 100; // Normalize to 100% reference
    const db = 20 * Math.log10(amplitude);
    return db > 0 ? `+${db.toFixed(1)}` : db.toFixed(1);
  };

  return (
    <div className="fixed inset-0 z-[400] bg-black/90 backdrop-blur-3xl flex items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-500">
      <div className="w-full max-w-4xl nm-panel p-10 border border-white/5 bg-eclipse-black shadow-[0_40px_100px_rgba(0,0,0,1)]">
        <div className="flex justify-between items-center mb-12">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 nm-button rounded-2xl flex items-center justify-center text-luna-gold border border-luna-gold/20">
              <i className="fa-solid fa-sliders text-xl"></i>
            </div>
            <div>
              <h2 className="text-2xl font-black text-white uppercase font-mono tracking-tighter">Audio Mixing Console</h2>
              <p className="text-[10px] text-mystic-gray uppercase font-bold tracking-[0.3em]">Precision multi-track signal balancing</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full nm-button flex items-center justify-center text-mystic-gray hover:text-white">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div className="flex justify-around items-end h-96 gap-8 bg-black/20 rounded-[2.5rem] p-12 border border-white/5 shadow-inner">
          {faders.map((f) => (
            <div key={f.key} className="flex flex-col items-center gap-6 group h-full">
              <div className="flex-1 w-12 nm-inset-input rounded-full relative flex flex-col items-center justify-end p-1 overflow-hidden">
                {/* Level Meter Background */}
                <div className="absolute inset-0 opacity-10 flex flex-col justify-between p-2">
                   {[...Array(10)].map((_, i) => <div key={i} className="h-px w-full bg-white/20"></div>)}
                </div>
                
                {/* Fader Track */}
                <div 
                  className={`w-full rounded-full transition-all duration-300 ${f.color.replace('text-', 'bg-')}/20 shadow-[0_0_20px_rgba(0,0,0,0.5)]`}
                  style={{ height: `${f.value}%` }}
                >
                  <div className={`w-full h-1 ${f.color.replace('text-', 'bg-')} shadow-[0_0_15px_currentColor] animate-pulse`}></div>
                </div>

                {/* Actual Fader Knob (Input) */}
                <input 
                  type="range" 
                  min="0" 
                  max="150" 
                  value={f.value}
                  onChange={(e) => onUpdate({ [f.key]: parseInt(e.target.value) })}
                  className="absolute inset-0 opacity-0 cursor-ns-resize appearance-none"
                  style={{ writingMode: 'bt-lr' as any }} 
                />
                
                {/* Handle UI */}
                <div 
                  className="absolute left-1 right-1 h-10 nm-button rounded-lg border border-white/10 pointer-events-none transition-all flex items-center justify-center"
                  style={{ bottom: `calc(${f.value}% - 20px)` }}
                >
                  <div className="w-6 h-[1px] bg-white/20"></div>
                </div>
              </div>

              <div className="text-center">
                <div className={`w-10 h-10 nm-button rounded-xl flex items-center justify-center ${f.color} mb-3 mx-auto`}>
                  <i className={`fa-solid ${f.icon} text-xs`}></i>
                </div>
                <p className="text-[10px] font-black text-white uppercase tracking-widest mb-1">{f.label}</p>
                <p className={`text-[11px] font-mono font-bold ${f.color}`}>{f.value}%</p>
              </div>
            </div>
          ))}

          {/* Master Output Section */}
          <div className="w-px h-full bg-white/5 mx-4"></div>

          <div className="flex flex-col items-center gap-6 h-full">
            <div className="flex-1 w-20 nm-panel rounded-2xl p-2 flex flex-col justify-between border border-white/5">
                {[...Array(15)].map((_, i) => (
                    <div key={i} className={`h-2 w-full rounded-sm ${i < 3 ? 'bg-solar-amber/20' : i < 6 ? 'bg-luna-gold/20' : 'bg-deep-sage/20'} shadow-inner`}></div>
                ))}
            </div>
             <div className="text-center">
                <div className="w-12 h-12 nm-button-gold rounded-2xl flex items-center justify-center text-white mb-3 mx-auto shadow-nm-gold">
                  <i className="fa-solid fa-volume-high text-xs"></i>
                </div>
                <p className="text-[10px] font-black text-white uppercase tracking-widest mb-1">Master</p>
                <p className="text-[11px] font-mono font-bold text-celestial-stone">{calculateMasterDB()} dB</p>
              </div>
          </div>
        </div>

        <div className="mt-12 flex justify-end">
          <button 
            onClick={onClose}
            className="px-12 py-4 nm-button-gold text-white rounded-2xl font-black uppercase tracking-[0.3em] text-[10px] shadow-nm-gold hover:scale-105 active:scale-95 transition-all"
          >
            Commit Master Mix
          </button>
        </div>
      </div>
    </div>
  );
};
