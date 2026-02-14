
import React, { useMemo } from 'react';
import { GeneratedAssets, Scene } from '../types';

interface AssetLibraryProps {
  assets: GeneratedAssets;
  scenes: Scene[];
  onClose: () => void;
  onSelect: (sceneId: number) => void;
}

export const AssetLibrary: React.FC<AssetLibraryProps> = ({ assets, scenes, onClose, onSelect }) => {
  const allAssets = useMemo(() => {
    return scenes.map(scene => ({
      scene,
      asset: assets[scene.id],
    })).filter(item => item.asset && (item.asset.imageUrl || item.asset.videoUrl || item.asset.audioUrl));
  }, [assets, scenes]);

  return (
    <div className="fixed inset-0 z-[400] bg-eclipse-black/95 backdrop-blur-3xl flex items-center justify-center p-6 animate-in fade-in duration-500">
      <div className="w-full max-w-6xl h-full max-h-[85vh] nm-panel flex flex-col overflow-hidden border border-white/5">
        
        <div className="p-8 border-b border-white/5 flex justify-between items-center bg-white/5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-luna-gold/10 border border-luna-gold/30 flex items-center justify-center text-luna-gold">
              <i className="fa-solid fa-photo-film text-xl"></i>
            </div>
            <div>
              <h2 className="text-xl font-black text-white uppercase tracking-tighter font-mono">Asset Registry</h2>
              <p className="text-[10px] text-mystic-gray uppercase font-bold tracking-[0.3em]">Vault of all generated production takes</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full hover:bg-white/5 flex items-center justify-center text-mystic-gray hover:text-white transition-colors">
            <i className="fa-solid fa-xmark text-lg"></i>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-10 scrollbar-hide">
          {allAssets.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center opacity-20">
              <i className="fa-solid fa-box-open text-6xl mb-6"></i>
              <p className="text-sm font-bold uppercase tracking-widest">No assets manifested in current timeline</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {allAssets.map(({ scene, asset }) => (
                <div 
                  key={scene.id} 
                  onClick={() => onSelect(scene.id)}
                  className="nm-card overflow-hidden group cursor-pointer border border-white/5 hover:border-luna-gold/40"
                >
                  <div className="aspect-video bg-black relative">
                    {asset.videoUrl ? (
                      <video src={asset.videoUrl} className="w-full h-full object-cover" muted loop onMouseOver={e => e.currentTarget.play()} onMouseOut={e => {e.currentTarget.pause(); e.currentTarget.currentTime = 0;}} />
                    ) : asset.imageUrl ? (
                      <img src={asset.imageUrl} className="w-full h-full object-cover" alt="Preview" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <i className="fa-solid fa-microphone text-luna-gold/20 text-2xl"></i>
                      </div>
                    )}
                    <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 backdrop-blur-md rounded text-[8px] font-mono text-white">#{scenes.indexOf(scene) + 1}</div>
                  </div>
                  <div className="p-4">
                    <p className="text-[9px] font-bold text-white truncate uppercase tracking-tight mb-1">{scene.description}</p>
                    <div className="flex gap-2 opacity-40">
                      {asset.imageUrl && <i className="fa-solid fa-image text-[8px]"></i>}
                      {asset.videoUrl && <i className="fa-solid fa-video text-[8px]"></i>}
                      {asset.audioUrl && <i className="fa-solid fa-waveform text-[8px]"></i>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-8 border-t border-white/5 bg-white/5 flex justify-end">
          <button onClick={onClose} className="px-10 py-3 bg-white text-black rounded-xl text-[10px] font-bold uppercase tracking-widest shadow-2xl hover:bg-luna-gold hover:text-white transition-all">Dismiss Registry</button>
        </div>
      </div>
    </div>
  );
};
