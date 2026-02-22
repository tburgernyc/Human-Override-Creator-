
import React from 'react';
import { GeneratedAssets, Scene } from '../types';

interface ProductionMonitorProps {
  isActive: boolean;
  scenes: Scene[];
  assets: GeneratedAssets;
  currentTask?: string;
}

export const ProductionMonitor: React.FC<ProductionMonitorProps> = ({ isActive, scenes, assets, currentTask }) => {
  if (!isActive) return null;

  const totalScenes = scenes.length;
  const completedScenes = Object.values(assets).filter(a => a.status === 'complete').length;
  const progress = totalScenes > 0 ? (completedScenes / totalScenes) * 100 : 0;

  return (
    <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[200] w-full max-w-2xl animate-in slide-in-from-bottom-10 duration-500">
      <div className="nm-panel p-6 bg-eclipse-black/90 backdrop-blur-xl border border-luna-gold/20 shadow-[0_20px_60px_rgba(0,0,0,0.8)]">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 nm-button rounded-xl flex items-center justify-center text-luna-gold relative">
              <i className="fa-solid fa-microchip animate-pulse"></i>
              <div className="absolute inset-0 rounded-xl border border-luna-gold/50 animate-ping opacity-20"></div>
            </div>
            <div>
              <h4 className="text-[10px] font-black text-white uppercase tracking-[0.3em] font-mono">Neural Manifestation Monitor</h4>
              <p className="text-[8px] text-mystic-gray uppercase font-bold tracking-widest">{currentTask || 'Synchronizing Pipeline...'}</p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-xs font-black text-luna-gold font-mono">{Math.floor(progress)}%</span>
            <p className="text-[7px] text-mystic-gray uppercase font-bold tracking-widest">Global Lock</p>
          </div>
        </div>

        <div className="h-1.5 w-full nm-inset-input rounded-full overflow-hidden mb-6">
          <div 
            className="h-full bg-gold-gradient transition-all duration-700 shadow-[0_0_15px_rgba(59,130,246,0.5)]" 
            style={{ width: `${progress}%` }}
          ></div>
        </div>

        <div className="grid grid-cols-5 gap-2 h-1.5">
          {scenes.map((s, i) => {
            const status = assets[s.id]?.status;
            return (
              <div 
                key={s.id} 
                className={`h-full rounded-full transition-colors ${
                  status === 'complete' ? 'bg-deep-sage' : 
                  status?.startsWith('generating') ? 'bg-luna-gold animate-pulse' : 
                  'bg-white/5'
                }`}
              ></div>
            );
          })}
        </div>
        
        <p className="mt-4 text-[7px] text-center text-mystic-gray uppercase tracking-[0.4em] font-bold opacity-40">
          Avoid interrupting the uplink. Multi-modal synthesis in progress.
        </p>
      </div>
    </div>
  );
};
