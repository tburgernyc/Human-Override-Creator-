
import React from 'react';
import { Scene, GeneratedAssets } from '../types';

interface StoryboardViewProps {
  scenes: Scene[];
  assets: GeneratedAssets;
  onSelectScene: (id: number) => void;
  onClose: () => void;
}

export const StoryboardView: React.FC<StoryboardViewProps> = ({ scenes, assets, onSelectScene, onClose }) => {
  return (
    <div className="fixed inset-0 z-[400] bg-eclipse-black/98 backdrop-blur-3xl flex items-center justify-center p-6 animate-in fade-in duration-500">
      <div className="w-full max-w-7xl h-full flex flex-col bg-eclipse-black border border-white/5 rounded-[3rem] overflow-hidden shadow-2xl">
        <header className="p-8 border-b border-white/5 flex justify-between items-center bg-white/5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-luna-gold/10 border border-luna-gold/30 flex items-center justify-center text-luna-gold">
              <i className="fa-solid fa-grip text-xl"></i>
            </div>
            <div>
              <h2 className="text-xl font-black text-white uppercase tracking-tighter font-mono italic">Production Storyboard</h2>
              <p className="text-[10px] text-mystic-gray uppercase font-bold tracking-[0.3em]">Full visual sequence breakdown</p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex gap-4 px-6 py-2 nm-inset-input rounded-full">
               <div className="flex items-center gap-2">
                 <div className="w-2 h-2 rounded-full bg-deep-sage"></div>
                 <span className="text-[8px] font-black text-mystic-gray uppercase">Manifested</span>
               </div>
               <div className="flex items-center gap-2">
                 <div className="w-2 h-2 rounded-full bg-white/10"></div>
                 <span className="text-[8px] font-black text-mystic-gray uppercase">Pending</span>
               </div>
            </div>
            <button onClick={onClose} className="w-10 h-10 rounded-full nm-button flex items-center justify-center text-mystic-gray hover:text-white transition-all">
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-12 scrollbar-hide">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            {scenes.map((scene, idx) => {
              const asset = assets[scene.id];
              const isManifested = asset?.status === 'complete';
              
              return (
                <div 
                  key={scene.id}
                  onClick={() => { onSelectScene(scene.id); onClose(); }}
                  className="group relative cursor-pointer"
                >
                  <div className={`aspect-video rounded-2xl overflow-hidden nm-panel border-2 transition-all group-hover:scale-[1.02] ${isManifested ? 'border-white/5 group-hover:border-luna-gold/50' : 'border-dashed border-white/10'}`}>
                    {asset?.imageUrl ? (
                      <img src={asset.imageUrl} className="w-full h-full object-cover" alt={`Scene ${idx + 1}`} />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-black/40">
                         <span className="text-[10px] text-mystic-gray uppercase font-black tracking-widest opacity-20">Scene {idx + 1}</span>
                         <i className="fa-solid fa-clapperboard text-white/5 mt-2 text-2xl"></i>
                      </div>
                    )}
                    <div className="absolute top-4 left-4 z-10">
                      <span className="px-3 py-1 rounded-lg nm-button bg-black/60 backdrop-blur-md text-[9px] font-black text-white font-mono border border-white/10">#{idx + 1}</span>
                    </div>
                  </div>
                  <div className="mt-4 px-2">
                    <h4 className="text-[10px] font-black text-white uppercase tracking-widest truncate">{scene.description}</h4>
                    <p className="text-[8px] text-mystic-gray mt-1 line-clamp-1 font-serif italic">"{scene.narratorLines[0]?.text}"</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <footer className="p-8 border-t border-white/5 bg-white/5 flex justify-center">
           <button onClick={onClose} className="px-12 py-3 bg-white text-black rounded-xl text-[10px] font-black uppercase tracking-widest shadow-2xl hover:bg-luna-gold hover:text-white transition-all">Dismiss Storyboard</button>
        </footer>
      </div>
    </div>
  );
};
