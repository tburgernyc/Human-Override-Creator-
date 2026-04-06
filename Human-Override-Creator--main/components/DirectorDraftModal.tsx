
import React from 'react';
import { DirectorDraft, Scene } from '../types';

interface DirectorDraftModalProps {
  draft: DirectorDraft;
  scenes: Scene[];
  onApply: (draft: DirectorDraft) => void;
  onDiscard: () => void;
}

export const DirectorDraftModal: React.FC<DirectorDraftModalProps> = ({ draft, scenes, onApply, onDiscard }) => {
  return (
    <div className="fixed inset-0 z-[450] bg-black/90 backdrop-blur-2xl flex items-center justify-center p-6 animate-in zoom-in-110 duration-500">
      <div className="w-full max-w-5xl nm-panel flex flex-col overflow-hidden border border-luna-gold/20 bg-eclipse-black shadow-[0_50px_150px_rgba(0,0,0,1)]">
        
        <div className="p-10 border-b border-white/5 flex justify-between items-center bg-gold-gradient/5">
          <div className="flex items-center gap-6">
            <div className="w-14 h-14 nm-button rounded-2xl flex items-center justify-center text-luna-gold border border-luna-gold/40">
              <i className="fa-solid fa-file-signature text-2xl"></i>
            </div>
            <div>
              <h2 className="text-2xl font-black text-white uppercase tracking-tighter font-mono italic">Director Refinement Proposal</h2>
              <p className="text-[10px] text-mystic-gray uppercase font-bold tracking-[0.4em] mt-1">Batch Sequence Synchronization Draft</p>
            </div>
          </div>
          <button onClick={onDiscard} className="w-12 h-12 rounded-full nm-button flex items-center justify-center text-mystic-gray hover:text-white transition-all">
            <i className="fa-solid fa-xmark text-lg"></i>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-12 scrollbar-hide space-y-10">
            <div className="p-8 rounded-3xl bg-white/5 border border-white/5 italic text-starlight text-sm leading-relaxed font-light shadow-inner">
                <i className="fa-solid fa-quote-left text-luna-gold/40 mr-4 text-2xl align-top"></i>
                {draft.reasoning}
            </div>

            <div className="space-y-6">
                <h3 className="text-xs font-black text-mystic-gray uppercase tracking-[0.2em] mb-4">Proposed Modifications ({draft.proposedChanges.length} Scenes)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {draft.proposedChanges.map((change, i) => {
                        const originalScene = scenes.find(s => s.id === change.sceneId);
                        if (!originalScene) return null;
                        
                        return (
                            <div key={i} className="nm-panel p-6 rounded-3xl border border-white/5 bg-black/40">
                                <div className="flex justify-between items-center mb-6">
                                    <span className="text-[10px] font-black text-white uppercase tracking-widest">Scene #{scenes.indexOf(originalScene) + 1}</span>
                                    <span className="text-[8px] font-mono text-luna-gold uppercase bg-luna-gold/10 px-3 py-1 rounded-full border border-luna-gold/20">REVISION_{i+1}</span>
                                </div>
                                <div className="space-y-4">
                                    {Object.entries(change.updates).map(([key, value]) => (
                                        <div key={key} className="space-y-2">
                                            <p className="text-[8px] font-black text-mystic-gray uppercase tracking-widest">{key.replace(/([A-Z])/g, ' $1')}</p>
                                            <div className="flex gap-4">
                                                <div className="flex-1 p-3 rounded-xl bg-white/5 border border-white/5 text-[9px] text-mystic-gray line-clamp-2 opacity-50 italic">
                                                   {(originalScene as any)[key]}
                                                </div>
                                                <i className="fa-solid fa-arrow-right text-luna-gold self-center opacity-40"></i>
                                                <div className="flex-1 p-3 rounded-xl bg-luna-gold/10 border border-luna-gold/20 text-[9px] text-white line-clamp-2">
                                                   {value as string}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>

        <div className="p-8 border-t border-white/5 bg-white/5 flex justify-end gap-6 items-center">
          <p className="text-[10px] text-celestial-stone font-medium italic">Applied changes will replace existing parameters in the manifest.</p>
          <div className="flex gap-4">
              <button onClick={onDiscard} className="px-8 py-4 nm-button text-mystic-gray hover:text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all">Discard Draft</button>
              <button 
                onClick={() => onApply(draft)}
                className="px-12 py-4 nm-button-gold text-white rounded-2xl font-black uppercase tracking-[0.3em] text-[10px] shadow-nm-gold hover:scale-105 active:scale-95 transition-all"
              >
                Apply Revisions
              </button>
          </div>
        </div>
      </div>
    </div>
  );
};
