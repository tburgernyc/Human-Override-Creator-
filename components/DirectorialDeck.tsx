
import React from 'react';
import { ProjectState } from '../types';

interface DirectorialDeckProps {
  project: ProjectState;
  onClose: () => void;
}

export const DirectorialDeck: React.FC<DirectorialDeckProps> = ({ project, onClose }) => {
  const stats = [
    { label: 'Narrative Density', value: 'High', icon: 'fa-brain', color: 'text-luna-gold' },
    { label: 'Visual Coherence', value: 'Calibrated', icon: 'fa-eye', color: 'text-deep-sage' },
    { label: 'Production Status', value: 'Active', icon: 'fa-bolt', color: 'text-solar-amber' },
    { label: 'Global Style', value: project.globalStyle || 'Cinematic', icon: 'fa-palette', color: 'text-white' }
  ];

  // Calculate emotional intensity from scene description
  const calculateEmotionalIntensity = (scene: any): number => {
    const text = (scene.description + ' ' + scene.visualPrompt).toLowerCase();

    // High-intensity keywords
    const highIntensity = ['explosion', 'fight', 'battle', 'scream', 'terror', 'chase', 'attack', 'danger', 'urgent', 'dramatic', 'intense', 'climax', 'confrontation'];
    const mediumIntensity = ['tension', 'suspense', 'concern', 'worried', 'nervous', 'mysterious', 'argument', 'conflict'];
    const lowIntensity = ['calm', 'peaceful', 'quiet', 'serene', 'gentle', 'soft', 'rest', 'sleep', 'meditate'];

    let score = 50; // Base neutral score (0-100)

    highIntensity.forEach(word => {
      if (text.includes(word)) score += 15;
    });
    mediumIntensity.forEach(word => {
      if (text.includes(word)) score += 8;
    });
    lowIntensity.forEach(word => {
      if (text.includes(word)) score -= 10;
    });

    // Adjust based on music mood
    if (scene.musicMood === 'action' || scene.musicMood === 'suspense') score += 10;
    if (scene.musicMood === 'calm') score -= 10;

    // Clamp between 10 and 90 for visual variance
    return Math.max(10, Math.min(90, score));
  };

  // Generate an emotional curve based on actual scene content
  const generatePulsePath = () => {
    if (!project.scenes || project.scenes.length === 0) {
      // Fallback: flat line at midpoint
      return `M 0 75 L 1000 75`;
    }

    const width = 1000;
    const height = 150;
    const step = width / (project.scenes.length - 1 || 1);

    // Calculate intensity for each scene
    const intensities = project.scenes.map(calculateEmotionalIntensity);

    // Start path
    const firstY = height - (intensities[0] / 100) * height;
    let path = `M 0 ${firstY}`;

    // Create smooth curve through scene intensity points
    for (let i = 1; i < project.scenes.length; i++) {
        const x = i * step;
        const y = height - (intensities[i] / 100) * height; // Invert Y (higher intensity = lower Y)
        const prevY = height - (intensities[i - 1] / 100) * height;

        // Control points for smooth curve
        const controlX = x - step / 2;
        const controlY1 = prevY;
        const controlY2 = y;

        path += ` C ${controlX} ${controlY1}, ${controlX} ${controlY2}, ${x} ${y}`;
    }
    return path;
  };

  return (
    <div className="fixed inset-0 z-[400] bg-eclipse-black flex items-center justify-center p-6 animate-in fade-in zoom-in-105 duration-1000 overflow-y-auto">
      {/* Background Stylized Elements */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-5">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-luna-gold rounded-full blur-[200px]"></div>
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-solar-amber rounded-full blur-[150px]"></div>
      </div>

      <div className="w-full max-w-7xl h-full flex flex-col relative z-10">
        <header className="flex justify-between items-center mb-16 px-4">
            <div className="flex items-center gap-6">
                <div className="w-16 h-16 nm-button rounded-[2rem] flex items-center justify-center text-luna-gold border border-white/5">
                    <i className="fa-solid fa-crown text-2xl"></i>
                </div>
                <div>
                    <h1 className="text-4xl font-black text-white uppercase tracking-tight font-mono italic">Production Deck</h1>
                    <p className="text-[10px] text-mystic-gray uppercase font-bold tracking-[0.5em] mt-1 italic">Strategic Directive Alpha-01</p>
                </div>
            </div>
            <button onClick={onClose} className="w-16 h-16 rounded-full nm-button flex items-center justify-center text-mystic-gray hover:text-white transition-all text-xl">
                <i className="fa-solid fa-xmark"></i>
            </button>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 flex-1 min-h-0 px-4">
            {/* Project Vitals */}
            <div className="space-y-12 overflow-y-auto scrollbar-hide pr-2">
                <div className="nm-panel p-10 rounded-[3rem] border border-white/5 bg-gradient-to-br from-white/5 to-transparent">
                    <h2 className="text-xs font-black text-luna-gold uppercase tracking-[0.3em] mb-10">Aesthetic DNA</h2>
                    <div className="space-y-8">
                        {stats.map((s, i) => (
                            <div key={i} className="flex items-center gap-6 group">
                                <div className={`w-12 h-12 nm-button rounded-2xl flex items-center justify-center ${s.color} transition-transform group-hover:scale-110 shadow-lg`}>
                                    <i className={`fa-solid ${s.icon}`}></i>
                                </div>
                                <div>
                                    <p className="text-[8px] text-mystic-gray uppercase font-black tracking-widest">{s.label}</p>
                                    <p className="text-sm font-bold text-white font-mono uppercase">{s.value}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="nm-panel p-10 rounded-[3rem] border border-white/5">
                    <h2 className="text-xs font-black text-solar-amber uppercase tracking-[0.3em] mb-6 italic">Director's Intent</h2>
                    <p className="text-sm text-celestial-stone leading-relaxed font-light italic">
                        "{project.modules.concept || "The core concept remains fluid. OverrideBot is monitoring script vectors for high-impact cinematic opportunities."}"
                    </p>
                </div>
            </div>

            {/* Script DNA and Narrative visualization */}
            <div className="lg:col-span-2 flex flex-col gap-8 min-h-0">
                <div className="flex-1 nm-inset-input rounded-[4rem] p-12 border border-white/5 relative overflow-hidden flex flex-col">
                    <div className="flex justify-between items-center mb-8">
                        <h2 className="text-xl font-black text-white uppercase tracking-tighter font-mono italic flex items-center gap-4">
                            <i className="fa-solid fa-dna text-luna-gold"></i> Neural Narrative Arc
                        </h2>
                        <span className="text-[8px] font-mono text-mystic-gray bg-white/5 px-4 py-2 rounded-full border border-white/10 uppercase tracking-widest">Temporal Analysis Mode</span>
                    </div>
                    
                    {/* Emotional Arc Graph */}
                    <div className="h-40 w-full mb-10 relative opacity-60">
                        <svg viewBox="0 0 1000 150" className="w-full h-full" preserveAspectRatio="none">
                            <path 
                                d={generatePulsePath()} 
                                fill="none" 
                                stroke="#3b82f6" 
                                strokeWidth="4" 
                                className="animate-[dash_20s_linear_infinite]"
                                strokeDasharray="1000"
                                strokeDashoffset="1000"
                            />
                             <path 
                                d={generatePulsePath()} 
                                fill="none" 
                                stroke="#ef4444" 
                                strokeWidth="1" 
                                className="opacity-40 animate-[dash_15s_linear_infinite]"
                                strokeDasharray="1000"
                                strokeDashoffset="1000"
                            />
                        </svg>
                        <style>{`
                            @keyframes dash {
                                to { stroke-dashoffset: 0; }
                            }
                        `}</style>
                    </div>

                    <div className="flex-1 overflow-y-auto pr-8 scrollbar-hide space-y-12">
                        <div className="space-y-4">
                            <p className="text-[10px] font-black text-mystic-gray uppercase tracking-[0.3em] border-l-2 border-luna-gold pl-4">Core Manifestation</p>
                            <p className="text-2xl font-light text-starlight leading-snug font-serif tracking-tight line-clamp-4 opacity-80">
                                {project.script}
                            </p>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-10">
                            <div className="space-y-6">
                                <p className="text-[10px] font-black text-mystic-gray uppercase tracking-[0.3em] border-l-2 border-solar-amber pl-4">Engagement Peaks</p>
                                <div className="p-8 nm-button rounded-3xl border border-white/5">
                                    <p className="text-sm font-bold text-white italic">"Action beats at 30% and 80% mark provide optimal pacing."</p>
                                </div>
                            </div>
                            <div className="space-y-6">
                                <p className="text-[10px] font-black text-mystic-gray uppercase tracking-[0.3em] border-l-2 border-deep-sage pl-4">Cast Saturation</p>
                                <div className="p-8 nm-button rounded-3xl border border-white/5">
                                    <p className="text-[11px] text-celestial-stone">Character diversity score is 9.4/10. Visual continuity is locked.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex justify-between items-center px-10">
                    <div className="flex items-center gap-10">
                        <div className="flex flex-col">
                            <span className="text-[8px] font-black text-mystic-gray uppercase tracking-[0.4em] mb-1">Timeline Lock</span>
                            <span className="text-xl font-black text-white font-mono uppercase tracking-tight">Active</span>
                        </div>
                        <div className="w-px h-10 bg-white/10"></div>
                        <div className="flex flex-col">
                            <span className="text-[8px] font-black text-mystic-gray uppercase tracking-[0.4em] mb-1">Personnel Sync</span>
                            <span className="text-xl font-black text-white font-mono uppercase tracking-tight">100%</span>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        className="px-16 py-5 nm-button-gold text-white rounded-3xl font-black uppercase tracking-[0.4em] text-[10px] shadow-nm-gold hover:scale-105 active:scale-95 transition-all flex items-center gap-4"
                    >
                        Return to Command <i className="fa-solid fa-arrow-right-long"></i>
                    </button>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};
