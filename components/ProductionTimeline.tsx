
import React from 'react';
import { Scene, GeneratedAssets } from '../types';

interface ProductionTimelineProps {
  scenes: Scene[];
  assets: GeneratedAssets;
  currentSceneId?: number;
  onSelectScene: (id: number) => void;
}

export const ProductionTimeline: React.FC<ProductionTimelineProps> = ({ 
  scenes, 
  assets, 
  currentSceneId, 
  onSelectScene 
}) => {
  const totalDuration = scenes.reduce((acc, s) => acc + (s.estimatedDuration || 0), 0);

  const generateWavePath = () => {
    if (scenes.length === 0) return "";
    let path = "M 0 40";
    let currentX = 0;
    
    scenes.forEach((scene) => {
      const width = (scene.estimatedDuration / totalDuration) * 1000;
      const intensity = scene.musicMood === 'action' ? 10 : scene.musicMood === 'suspense' ? 25 : 45;
      const midX = currentX + width / 2;
      path += ` Q ${midX} ${intensity}, ${currentX + width} 40`;
      currentX += width;
    });
    
    return path;
  };

  return (
    <div className="nm-panel p-8 rounded-[2.5rem] border border-white/5 relative overflow-hidden group/timeline">
      {/* Background Pulse */}
      <div className="absolute inset-0 pointer-events-none opacity-20 z-0 overflow-hidden translate-y-4">
        <svg viewBox="0 0 1000 80" preserveAspectRatio="none" className="w-full h-full">
          <path 
            d={generateWavePath()} 
            fill="none" 
            stroke="url(#energyGradient)" 
            strokeWidth="1.5" 
            strokeDasharray="4 4"
            className="animate-[dash_30s_linear_infinite]"
          />
          <defs>
            <linearGradient id="energyGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#3b82f6" />
              <stop offset="50%" stopColor="#ef4444" />
              <stop offset="100%" stopColor="#3b82f6" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      <div className="flex items-center justify-between mb-8 relative z-10">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl nm-button flex items-center justify-center text-luna-gold shadow-lg">
            <i className="fa-solid fa-timeline text-xs"></i>
          </div>
          <div>
            <h3 className="text-[10px] font-black text-white uppercase tracking-[0.3em] font-mono">Master Temporal Sequence</h3>
            <p className="text-[7px] text-mystic-gray uppercase font-bold tracking-widest mt-1">Multi-Track Synthesis Sync</p>
          </div>
        </div>
        <div className="flex items-center gap-6">
           <div className="px-4 py-1.5 nm-inset-input rounded-full flex items-center gap-3">
              <span className="text-[8px] font-black text-starlight uppercase tracking-widest font-mono">{totalDuration}s</span>
              <div className="w-px h-3 bg-white/10"></div>
              <span className="text-[8px] font-black text-luna-gold uppercase tracking-widest font-mono">{scenes.length} Units</span>
           </div>
        </div>
      </div>

      <div className="relative h-28 w-full flex items-end gap-1 z-10 px-1">
        {scenes.map((scene, idx) => {
          const asset = assets[scene.id];
          const isComplete = asset?.status === 'complete';
          const isProcessing = asset?.status?.startsWith('generating');
          const isActive = currentSceneId === scene.id;
          const widthPercent = (scene.estimatedDuration / totalDuration) * 100;

          return (
            <div 
              key={scene.id}
              onClick={() => onSelectScene(scene.id)}
              style={{ width: `${widthPercent}%`, minWidth: '48px' }}
              className="group relative h-full flex flex-col justify-end cursor-pointer transition-all hover:scale-[1.02]"
            >
              {/* Asset Snapshot on Hover */}
              <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-24 aspect-video rounded-lg overflow-hidden nm-panel border border-white/20 opacity-0 group-hover:opacity-100 transition-all pointer-events-none z-50 shadow-2xl scale-90 group-hover:scale-100">
                {asset?.imageUrl ? (
                  <img src={asset.imageUrl} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-black/80 flex items-center justify-center">
                    <i className="fa-solid fa-clapperboard text-white/10 text-xl"></i>
                  </div>
                )}
              </div>

              {/* Status Pips */}
              <div className="flex justify-center gap-1 mb-2 h-2">
                <div className={`w-1 h-1 rounded-full ${asset?.imageUrl ? 'bg-deep-sage shadow-[0_0_3px_#10b981]' : 'bg-white/5'}`}></div>
                <div className={`w-1 h-1 rounded-full ${asset?.videoUrl ? 'bg-deep-sage shadow-[0_0_3px_#10b981]' : 'bg-white/5'}`}></div>
                <div className={`w-1 h-1 rounded-full ${asset?.audioUrl ? 'bg-deep-sage shadow-[0_0_3px_#10b981]' : 'bg-white/5'}`}></div>
              </div>

              {/* Bar Segment */}
              <div className={`
                w-full rounded-t-xl transition-all border-x border-t relative overflow-hidden
                ${isActive ? 'h-full border-luna-gold bg-luna-gold/20' : isComplete ? 'h-[85%] border-deep-sage/30 bg-deep-sage/5 hover:bg-deep-sage/10' : 'h-3/4 border-white/5 bg-white/5 hover:bg-white/10'}
              `}>
                {isProcessing && (
                  <div className="absolute inset-0 bg-luna-gold/10 animate-pulse"></div>
                )}
                {isComplete && asset?.imageUrl && (
                   <img src={asset.imageUrl} className="absolute inset-0 w-full h-full object-cover opacity-5 group-hover:opacity-20 transition-opacity" />
                )}
                <div className={`absolute bottom-0 left-0 h-1 w-full ${isComplete ? 'bg-deep-sage' : isProcessing ? 'bg-luna-gold' : 'bg-white/10'}`}></div>
              </div>
              
              <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[8px] font-mono font-black text-mystic-gray group-hover:text-white transition-colors">
                {idx + 1}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-between mt-6 text-[8px] font-mono text-mystic-gray tracking-widest uppercase relative z-10 px-2">
        <div className="flex gap-6">
            <span className="flex items-center gap-2"><i className="fa-solid fa-lock text-luna-gold text-[6px]"></i> Continuity Vector: Stable</span>
            <span className="flex items-center gap-2"><i className="fa-solid fa-waveform text-solar-amber text-[6px]"></i> Signal Mesh: Optimized</span>
        </div>
        <span className="text-luna-gold/50">Neural Previs V6.2.9</span>
      </div>

      <style>{`
        @keyframes dash {
          to { stroke-dashoffset: -1000; }
        }
      `}</style>
    </div>
  );
};
