
import React from 'react';
import { Character } from '../types';

interface CastEnsembleProps {
  characters: Character[];
  onEdit: (char: Character) => void;
  onAdd: () => void;
  onAudit: () => void;
}

export const CastEnsemble: React.FC<CastEnsembleProps> = ({ characters, onEdit, onAdd, onAudit }) => {
  return (
    <div className="nm-panel p-8 mb-10">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 nm-button rounded-xl flex items-center justify-center">
            <i className="fa-solid fa-users-viewfinder text-luna-gold"></i>
          </div>
          <h3 className="text-[10px] font-black text-white uppercase tracking-[0.3em] font-mono">Cast Ensemble Registry</h3>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={onAudit}
            className="px-6 py-2 nm-button rounded-full text-[8px] font-bold text-mystic-gray hover:text-white uppercase tracking-widest transition-all"
          >
            Audit Continuity
          </button>
          <button 
            onClick={onAdd}
            className="w-10 h-10 nm-button rounded-xl text-luna-gold flex items-center justify-center hover:scale-110 transition-transform"
          >
            <i className="fa-solid fa-plus text-xs"></i>
          </button>
        </div>
      </div>

      <div className="flex gap-8 overflow-x-auto pb-4 scrollbar-hide px-2">
        {characters.length === 0 ? (
          <div className="w-full h-24 flex items-center justify-center nm-inset-input rounded-2xl">
            <p className="text-[9px] text-mystic-gray font-bold uppercase tracking-widest opacity-40">No personnel registered in manifest</p>
          </div>
        ) : (
          characters.map((char) => (
            <div 
              key={char.id}
              onClick={() => onEdit(char)}
              className="group flex-shrink-0 flex flex-col items-center gap-4 cursor-pointer"
            >
              <div className="relative w-20 h-20 rounded-full nm-button p-[3px] transition-all group-hover:scale-105">
                <div className="relative w-full h-full rounded-full bg-eclipse-black overflow-hidden border border-white/5">
                  {char.referenceImageBase64 ? (
                    <img src={char.referenceImageBase64} className="w-full h-full object-cover" alt={char.name} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-luna-gold/20">
                      <i className="fa-solid fa-user-astronaut text-2xl"></i>
                    </div>
                  )}
                </div>
                {/* Active Indicator */}
                <div className="absolute bottom-0 right-0 w-6 h-6 nm-button rounded-full flex items-center justify-center">
                  <span className="w-2 h-2 rounded-full bg-deep-sage animate-pulse"></span>
                </div>
              </div>
              <div className="text-center">
                <p className="text-[10px] font-black text-white truncate max-w-[100px] uppercase font-mono tracking-tight">{char.name}</p>
                <p className="text-[7px] text-mystic-gray uppercase font-bold tracking-widest mt-1 opacity-60">{char.gender}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
