import React from 'react';
import { ProjectState } from '../types';

interface ProductionManifestProps {
    project: ProjectState;
    youtubeMetadata?: { hookScore: number, audience: string, suggestedTitles: string[] };
    onClose: () => void;
}

export const ProductionManifest: React.FC<ProductionManifestProps> = ({ project, youtubeMetadata, onClose }) => {
    const totalDuration = project.scenes.reduce((acc, s) => acc + (s.estimatedDuration || 0), 0);
    const completeAssets = Object.values(project.assets).filter(a => a.status === 'complete').length;
    const progress = (completeAssets / project.scenes.length) * 100 || 0;

    // Dynamic audit calculations
    const performAudits = () => {
        const audits = [];

        // 1. Character Persistence Audit
        const charactersWithImages = project.characters.filter(c => c.referenceImageBase64).length;
        const totalCharacters = project.characters.length;
        const characterPersistence = totalCharacters > 0 ? (charactersWithImages / totalCharacters) * 100 : 100;
        const allCharactersConsistent = project.characters.every(c => c.visualPrompt && c.visualPrompt.length > 10);

        audits.push({
            icon: 'fa-user-check',
            title: 'Character Persistence',
            status: characterPersistence === 100 && allCharactersConsistent ? 'Optimal' : characterPersistence >= 80 ? 'High' : characterPersistence >= 50 ? 'Warning' : 'Failed',
            desc: `${charactersWithImages}/${totalCharacters} characters have reference images. ${allCharactersConsistent ? 'All have detailed visual prompts.' : 'Some lack detailed prompts.'}`
        });

        // 2. Style Consistency Audit
        const scenesWithOverride = project.scenes.filter(s => s.styleOverride).length;
        const globalStyleUsage = project.scenes.length - scenesWithOverride;
        const styleConsistency = project.scenes.length > 0 ? (globalStyleUsage / project.scenes.length) * 100 : 100;

        audits.push({
            icon: 'fa-palette',
            title: 'Style Consistency',
            status: styleConsistency === 100 ? 'Optimal' : styleConsistency >= 80 ? 'High' : styleConsistency >= 50 ? 'Warning' : 'Failed',
            desc: `${globalStyleUsage}/${project.scenes.length} scenes use global style "${project.globalStyle || 'Cinematic'}". ${scenesWithOverride > 0 ? `${scenesWithOverride} have overrides.` : 'No overrides detected.'}`
        });

        // 3. Pacing Logic Audit
        const avgDuration = totalDuration / (project.scenes.length || 1);
        const outliers = project.scenes.filter(s => {
            const duration = s.estimatedDuration || 0;
            return duration > 10 || duration < 2;
        });
        const pacingQuality = project.scenes.length > 0 ? ((project.scenes.length - outliers.length) / project.scenes.length) * 100 : 100;

        audits.push({
            icon: 'fa-clock',
            title: 'Pacing Logic',
            status: outliers.length === 0 ? 'Optimal' : outliers.length <= 2 ? 'Calibrated' : outliers.length <= 5 ? 'Warning' : 'Failed',
            desc: `Avg scene duration: ${avgDuration.toFixed(1)}s. ${outliers.length > 0 ? `${outliers.length} outlier(s) detected (>10s or <2s).` : 'All scenes within optimal range.'}`
        });

        // 4. Continuity Audit
        const sceneIds = project.scenes.map(s => s.id);
        const uniqueIds = new Set(sceneIds);
        const hasDuplicateIds = sceneIds.length !== uniqueIds.size;
        const missingAssets = project.scenes.filter(s => !project.assets[s.id]).length;
        const continuityIssues = hasDuplicateIds || missingAssets > 0;

        audits.push({
            icon: 'fa-magnifying-glass-chart',
            title: 'Continuity Audit',
            status: !continuityIssues ? 'Optimal' : missingAssets <= 2 ? 'Warning' : 'Failed',
            desc: continuityIssues
                ? `${hasDuplicateIds ? 'Duplicate scene IDs detected. ' : ''}${missingAssets > 0 ? `${missingAssets} scenes missing asset entries.` : 'No narrative breaks.'}`
                : 'No sequence gaps or ID conflicts. All scenes tracked.'
        });

        return audits;
    };

    const auditResults = performAudits();
    const overallHealth = auditResults.every(a => a.status === 'Optimal' || a.status === 'High' || a.status === 'Calibrated')
        ? 'EXCELLENT'
        : auditResults.some(a => a.status === 'Failed')
        ? 'CRITICAL'
        : 'ACCEPTABLE';

    return (
        <div className="fixed inset-0 z-[300] bg-eclipse-black/95 backdrop-blur-3xl flex items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-500">
            <div className="w-full max-w-5xl glass-panel rounded-[3rem] border-white/10 overflow-hidden flex flex-col shadow-[0_50px_200px_rgba(0,0,0,0.8)]">
                
                <div className="p-10 border-b border-white/5 flex justify-between items-center bg-gold-gradient/5">
                    <div>
                        <h2 className="text-3xl font-black text-white tracking-tighter uppercase font-mono italic">Production Manifest</h2>
                        <p className="text-[10px] text-mystic-gray uppercase font-bold tracking-[0.4em] mt-1">Real-time Project Telemetry & Synthesis</p>
                    </div>
                    <button onClick={onClose} className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center text-mystic-gray hover:text-white hover:border-white/20 transition-all">
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-12 scrollbar-hide">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                        
                        {/* Stats Panel */}
                        <div className="lg:col-span-1 space-y-8">
                            <div className="p-8 rounded-3xl bg-white/5 border border-white/5 shadow-inner">
                                <h3 className="text-[10px] font-black text-luna-gold uppercase tracking-[0.2em] mb-6">Core Statistics</h3>
                                <div className="space-y-6">
                                    <div>
                                        <p className="text-[9px] text-mystic-gray uppercase font-bold mb-2">Total Project Runtime</p>
                                        <p className="text-3xl font-black text-white font-mono">{totalDuration}s</p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] text-mystic-gray uppercase font-bold mb-2">Pipeline Completion</p>
                                        <div className="flex items-center gap-4">
                                            <div className="flex-1 h-2 bg-black rounded-full overflow-hidden border border-white/5">
                                                <div className="h-full bg-luna-gold shadow-[0_0_10px_#3b82f6]" style={{ width: `${progress}%` }}></div>
                                            </div>
                                            <span className="text-sm font-bold text-white font-mono">{Math.floor(progress)}%</span>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="p-4 rounded-2xl bg-black/40 border border-white/5">
                                            <p className="text-[8px] text-mystic-gray uppercase font-bold mb-1">Scenes</p>
                                            <p className="text-lg font-bold text-white">{project.scenes.length}</p>
                                        </div>
                                        <div className="p-4 rounded-2xl bg-black/40 border border-white/5">
                                            <p className="text-[8px] text-mystic-gray uppercase font-bold mb-1">Ensemble</p>
                                            <p className="text-lg font-bold text-white">{project.characters.length}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {youtubeMetadata && (
                                <div className="p-8 rounded-3xl bg-solar-amber/5 border border-solar-amber/20">
                                    <h3 className="text-[10px] font-black text-solar-amber uppercase tracking-[0.2em] mb-4">AI Retention Guard</h3>
                                    <div className="flex justify-between items-center">
                                        <span className="text-[11px] text-celestial-stone font-medium">Hook Score</span>
                                        <span className="text-2xl font-black text-white font-mono">{youtubeMetadata.hookScore}/10</span>
                                    </div>
                                    <p className="text-[9px] text-mystic-gray mt-4 leading-relaxed italic opacity-70">
                                        "Opening sequence metrics indicate optimal viewer retention probability."
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Audit Log / findings */}
                        <div className="lg:col-span-2 space-y-8">
                            <div className="p-8 rounded-[2.5rem] bg-white/5 border border-white/5 h-full">
                                <h3 className="text-[10px] font-black text-mystic-gray uppercase tracking-[0.2em] mb-8 flex items-center gap-2">
                                    <i className="fa-solid fa-list-check text-luna-gold"></i> Production Integrity Audit
                                </h3>
                                
                                <div className="space-y-6">
                                    {auditResults.map((item, i) => {
                                        const statusColor =
                                            item.status === 'Optimal' || item.status === 'High' || item.status === 'Calibrated' ? 'text-deep-sage' :
                                            item.status === 'Warning' ? 'text-solar-amber' :
                                            'text-red-500';

                                        return (
                                          <div key={i} className="flex gap-6 p-6 rounded-2xl hover:bg-white/5 transition-colors border border-transparent hover:border-white/5 group">
                                              <div className="w-12 h-12 rounded-xl bg-eclipse-black flex items-center justify-center border border-white/10 text-mystic-gray group-hover:text-luna-gold transition-colors">
                                                  <i className={`fa-solid ${item.icon}`}></i>
                                              </div>
                                              <div className="flex-1">
                                                  <div className="flex justify-between items-center mb-1">
                                                      <h4 className="text-xs font-bold text-white uppercase tracking-widest">{item.title}</h4>
                                                      <span className={`text-[9px] font-black uppercase tracking-widest ${statusColor}`}>{item.status}</span>
                                                  </div>
                                                  <p className="text-[11px] text-celestial-stone leading-relaxed opacity-60 font-light">{item.desc}</p>
                                              </div>
                                          </div>
                                        );
                                    })}
                                </div>

                                <div className={`mt-12 p-6 rounded-2xl flex items-center justify-between ${
                                    overallHealth === 'EXCELLENT' ? 'bg-luna-gold/10 border border-luna-gold/20' :
                                    overallHealth === 'CRITICAL' ? 'bg-red-500/10 border border-red-500/20' :
                                    'bg-solar-amber/10 border border-solar-amber/20'
                                }`}>
                                    <div className="flex items-center gap-4">
                                        <div className={`w-3 h-3 rounded-full animate-pulse ${
                                            overallHealth === 'EXCELLENT' ? 'bg-luna-gold shadow-[0_0_10px_#3b82f6]' :
                                            overallHealth === 'CRITICAL' ? 'bg-red-500 shadow-[0_0_10px_#ef4444]' :
                                            'bg-solar-amber shadow-[0_0_10px_#f59e0b]'
                                        }`}></div>
                                        <p className={`text-[10px] font-bold uppercase tracking-widest ${
                                            overallHealth === 'EXCELLENT' ? 'text-luna-gold' :
                                            overallHealth === 'CRITICAL' ? 'text-red-500' :
                                            'text-solar-amber'
                                        }`}>Production Health: {overallHealth}</p>
                                    </div>
                                    <button className="text-[10px] font-black text-white uppercase tracking-widest underline decoration-luna-gold underline-offset-4">Rerun Deep Audit</button>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>

                <div className="p-8 bg-eclipse-black border-t border-white/5 flex justify-center">
                    <button 
                        onClick={onClose}
                        className="px-12 py-4 bg-white text-black rounded-full font-black uppercase text-[10px] tracking-[0.3em] hover:bg-luna-gold hover:text-white transition-all shadow-2xl"
                    >
                        Dismiss Manifest
                    </button>
                </div>
            </div>
        </div>
    );
};
