
import React, { useRef } from 'react';
import { blobToBase64 } from '../services/gemini';

interface MoodboardProps {
  referenceImage?: string;
  onUpdate: (base64: string) => void;
  onClear: () => void;
}

export const Moodboard: React.FC<MoodboardProps> = ({ referenceImage, onUpdate, onClear }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const base64 = await blobToBase64(file);
      onUpdate(base64);
    }
  };

  return (
    <div className="nm-panel p-8 mb-10 border border-white/5 group relative overflow-hidden">
      <div className="absolute inset-0 bg-luna-gold/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
      
      <div className="flex flex-col md:flex-row items-center gap-10 relative z-10">
        <div className="w-full md:w-64 aspect-[4/3] rounded-[2rem] nm-inset-input overflow-hidden border border-white/5 relative group/img">
          {referenceImage ? (
            <>
              <img src={referenceImage} className="w-full h-full object-cover transition-transform duration-700 group-hover/img:scale-110" alt="Style Reference" />
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center gap-4">
                 <button onClick={() => fileInputRef.current?.click()} className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center hover:bg-luna-gold hover:text-white transition-all"><i className="fa-solid fa-rotate"></i></button>
                 <button onClick={onClear} className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center hover:bg-solar-amber hover:text-white transition-all"><i className="fa-solid fa-trash-can"></i></button>
              </div>
            </>
          ) : (
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-full flex flex-col items-center justify-center text-mystic-gray hover:text-luna-gold transition-colors"
            >
              <i className="fa-solid fa-cloud-arrow-up text-4xl mb-4 opacity-20"></i>
              <p className="text-[10px] font-black uppercase tracking-widest">Upload Style Reference</p>
              <p className="text-[7px] text-mystic-gray mt-2 font-mono">Master Moodboard Uplink</p>
            </button>
          )}
          <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
        </div>

        <div className="flex-1 space-y-6 text-center md:text-left">
           <div className="inline-block px-4 py-1 rounded-full bg-luna-gold/10 border border-luna-gold/20">
             <span className="text-[9px] font-black text-luna-gold uppercase tracking-[0.3em]">Aesthetic Anchor</span>
           </div>
           <h3 className="text-2xl font-black text-white uppercase font-mono tracking-tighter italic">Neural Style Reference</h3>
           <p className="text-sm text-celestial-stone leading-relaxed font-light">
             The Moodboard provides a <span className="text-starlight font-bold">global stylistic vector</span> for the entire project. All generated visual takes will inherit the color palette, lighting atmosphere, and texture of this reference image.
           </p>
           <div className="flex flex-wrap gap-4 justify-center md:justify-start">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg nm-button border border-white/5 opacity-60">
                <i className="fa-solid fa-palette text-[10px] text-luna-gold"></i>
                <span className="text-[8px] font-bold text-starlight uppercase">Color Consistency</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg nm-button border border-white/5 opacity-60">
                <i className="fa-solid fa-lightbulb text-[10px] text-luna-gold"></i>
                <span className="text-[8px] font-bold text-starlight uppercase">Lighting Sync</span>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};
