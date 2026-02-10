
import React from 'react';
import { ProjectState } from '../types';

interface ProductionStageOverviewProps {
    project: ProjectState;
}

export const ProductionStageOverview: React.FC<ProductionStageOverviewProps> = ({ project }) => {
    const totalAssets = project.scenes.length * 3; // img, vid, audio
    const manifestedAssets = Object.values(project.assets).reduce((acc, a) => {
        let count = 0;
        if (a.imageUrl) count++;
        if (a.videoUrl) count++;
        if (a.audioUrl) count++;
        return acc + count;
    }, 0);
    const healthPercent = Math.min(Math.round((manifestedAssets / totalAssets) * 100), 100) || 0;

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-10">
            <div className="nm-panel p-8 flex flex-col justify-center border border-white/5 bg-gradient-to-br from-white/5 to-transparent">
                <div className="flex items-center justify-between mb-6">
                    <h4 className="text-[9px] font-black text-mystic-gray uppercase tracking-widest">Neural Health</h4>
                    <span className={`text-[9px] font-black uppercase ${healthPercent > 80 ? 'text-deep-sage' : healthPercent > 30 ? 'text-luna-gold' : 'text-solar-amber'}`}>{healthPercent}% SYNC</span>
                </div>
                <div className="h-2 w-full nm-inset-input rounded-full overflow-hidden mb-4">
                    <div className="h-full bg-gold-gradient transition-all duration-1000" style={{ width: `${healthPercent}%` }}></div>
                </div>
                <p className="text-[10px] text-celestial-stone italic opacity-60">"Pipeline calibration is reaching optimal temporal lock."</p>
            </div>

            <div className="nm-panel p-8 flex items-center gap-6 border border-white/5">
                <div className="w-14 h-14 rounded-2xl nm-button flex items-center justify-center text-solar-amber text-xl">
                    <i className="fa-solid fa-users"></i>
                </div>
                <div>
                    <h4 className="text-[9px] font-black text-mystic-gray uppercase tracking-widest mb-1">Cast Registry</h4>
                    <p className="text-xl font-black text-white font-mono uppercase">{project.characters.length} Personnel</p>
                    <p className="text-[8px] text-deep-sage font-bold uppercase mt-1">Identity Locked</p>
                </div>
            </div>

            <div className="nm-panel p-8 flex items-center gap-6 border border-white/5">
                <div className="w-14 h-14 rounded-2xl nm-button flex items-center justify-center text-luna-gold text-xl">
                    <i className="fa-solid fa-clapperboard"></i>
                </div>
                <div>
                    <h4 className="text-[9px] font-black text-mystic-gray uppercase tracking-widest mb-1">Sequence Manifest</h4>
                    <p className="text-xl font-black text-white font-mono uppercase">{project.scenes.length} Units</p>
                    <p className="text-[8px] text-luna-gold font-bold uppercase mt-1">Directorial Ready</p>
                </div>
            </div>
        </div>
    );
};
