
import React, { useState } from 'react';
import { Scene } from '../types';

interface BRollSuggestionModalProps {
  suggestions: Scene[];
  onAccept: (scenes: Scene[]) => void;
  onClose: () => void;
}

export const BRollSuggestionModal: React.FC<BRollSuggestionModalProps> = ({ suggestions, onAccept, onClose }) => {
  const [selectedIds, setSelectedIds] = useState<number[]>(suggestions.map(s => s.id));

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleImport = () => {
    const toImport = suggestions.filter(s => selectedIds.includes(s.id));
    onAccept(toImport);
  };

  return (
    <div className="fixed inset-0 z-[400] bg-black/95 backdrop-blur-3xl flex items-center justify-center p-6 animate-in fade-in duration-500">
      <div className="w-full max-w-4xl nm-panel flex flex-col overflow-hidden border border-white/5 bg-eclipse-black">
        <div className="p-8 border-b border-white/5 flex justify-between items-center bg-white/5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-luna-gold/10 border border-luna-gold/30 flex items-center justify-center text-luna-gold">
              <i className="fa-solid fa-film text-xl"></i>
            </div>
            <div>
              <h2 className="text-xl font-black text-white uppercase tracking-tighter font-mono italic">B-Roll Synthesizer</h2>
              <p className="text-[10px] text-mystic-gray uppercase font-bold tracking-[0.3em]">AI-Suggested intercut sequences for visual density</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full nm-button flex items-center justify-center text-mystic-gray hover:text-white transition-all">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-10 scrollbar-hide space-y-6">
          {suggestions.map((scene, idx) => (
            <div 
              key={scene.id} 
              onClick={() => toggleSelect(scene.id)}
              className={`p-6 rounded-2xl border transition-all cursor-pointer group ${selectedIds.includes(scene.id) ? 'bg-luna-gold/10 border-luna-gold/50' : 'bg-white/5 border-white/5 hover:border-white/10'}`}
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-4">
                   <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${selectedIds.includes(scene.id) ? 'bg-luna-gold text-white border-luna-gold' : 'bg-black/40 text-mystic-gray border-white/10'}`}>
                      {selectedIds.includes(scene.id) ? <i className="fa-solid fa-check text-xs"></i> : <span className="text-xs font-bold">{idx + 1}</span>}
                   </div>
                   <h3 className="text-sm font-bold text-white uppercase font-mono">{scene.description}</h3>
                </div>
                <span className="text-[10px] font-mono text-luna-gold font-black">{scene.estimatedDuration}s</span>
              </div>
              <p className="text-[11px] text-celestial-stone italic opacity-80 leading-relaxed mb-4">"{scene.visualPrompt}"</p>
              <div className="flex gap-4">
                 <span className="text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded bg-black/40 text-mystic-gray border border-white/5">{scene.musicMood}</span>
                 <span className="text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded bg-black/40 text-mystic-gray border border-white/5">Cinematic Cut</span>
              </div>
            </div>
          ))}
        </div>

        <div className="p-8 border-t border-white/5 bg-white/5 flex justify-end gap-4">
          <button onClick={onClose} className="px-8 py-3 text-[10px] font-bold text-celestial-stone uppercase tracking-widest">Cancel</button>
          <button 
            onClick={handleImport}
            disabled={selectedIds.length === 0}
            className="px-12 py-3 nm-button-gold text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-nm-gold hover:scale-105 active:scale-95 transition-all disabled:opacity-30"
          >
            Inject {selectedIds.length} Scenes into Timeline
          </button>
        </div>
      </div>
    </div>
  );
};
