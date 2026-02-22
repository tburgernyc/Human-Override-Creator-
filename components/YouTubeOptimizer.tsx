
import React, { useState, useEffect } from 'react';
import { generateAllMarketingContent, generateThumbnail, analyzeViralPotential } from '../services/gemini';
import { Character, ViralPotential } from '../types';

interface YouTubeOptimizerProps {
  metadata: {
    hookScore: number;
    audience: string;
    suggestedTitles: string[];
  };
  script: string;
  characters: Character[];
  globalStyle: string;
  viralData?: ViralPotential;
  onUpdateViral?: (data: ViralPotential) => void;
}

export const YouTubeOptimizer: React.FC<YouTubeOptimizerProps> = ({ metadata, script, characters, globalStyle, viralData, onUpdateViral }) => {
  const [activeTab, setActiveTab] = useState<'seo' | 'multiplier' | 'thumbnail' | 'viral'>('seo');
  const [multiplierContent, setMultiplierContent] = useState<{ twitter?: string, linkedin?: string }>({});
  const [thumbnailData, setThumbnailData] = useState<{ imageUrl?: string, text?: string }>({});
  const [loadingPlatform, setLoadingPlatform] = useState<string | null>(null);
  const [isGeneratingThumbnail, setIsGeneratingThumbnail] = useState(false);
  const [isAnalyzingViral, setIsAnalyzingViral] = useState(false);

  // OPT-06: Batch both platforms in a single API call instead of two sequential ones
  const handleGeneratePost = async (_platform: 'twitter' | 'linkedin') => {
    setLoadingPlatform('all');
    try {
        const results = await generateAllMarketingContent(['twitter', 'linkedin'], script, metadata);
        setMultiplierContent({ twitter: results.twitter, linkedin: results.linkedin });
    } catch (e) {
        console.error("Failed to generate posts", e);
    } finally {
        setLoadingPlatform(null);
    }
  };

  const handleCreateThumbnail = async () => {
    setIsGeneratingThumbnail(true);
    try {
      const data = await generateThumbnail(metadata.suggestedTitles[0], characters, globalStyle);
      setThumbnailData({ imageUrl: data.imageUrl, text: data.suggestedText });
    } catch (e) {
      console.error(e);
    } finally {
      setIsGeneratingThumbnail(false);
    }
  };

  const handleRunViralAnalysis = async () => {
    setIsAnalyzingViral(true);
    try {
        const data = await analyzeViralPotential(script);
        onUpdateViral?.(data);
    } catch (e) {
        console.error(e);
    } finally {
        setIsAnalyzingViral(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("Copied to clipboard!");
  };

  return (
    <div className="glass-panel rounded-2xl p-8 border border-white/5 animate-in slide-in-from-top-5 duration-700 shadow-[0_30px_100px_rgba(0,0,0,0.5)]">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-6">
        <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-solar-amber/10 flex items-center justify-center border border-solar-amber/20">
            <i className="fa-brands fa-youtube text-solar-amber text-lg"></i>
            </div>
            <div>
            <h3 className="text-lg font-bold text-white tracking-tight uppercase font-mono">Distribution Intelligence</h3>
            <p className="text-[10px] text-mystic-gray uppercase font-bold tracking-widest">AI-Generated Marketing Suite</p>
            </div>
        </div>

        <div className="flex bg-eclipse-black/50 p-1 rounded-xl border border-white/10">
            {['seo', 'multiplier', 'thumbnail', 'viral'].map((tab) => (
                <button 
                    key={tab}
                    onClick={() => setActiveTab(tab as any)}
                    className={`px-6 py-2 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-luna-gold text-white shadow-lg' : 'text-celestial-stone hover:text-white'}`}
                >
                    {tab.replace('_', ' ')}
                </button>
            ))}
        </div>
      </div>

      {activeTab === 'seo' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 animate-in fade-in duration-500">
            <div className="space-y-6">
                <div className="p-6 rounded-2xl bg-white/5 border border-white/5">
                    <div className="flex justify-between items-end mb-4">
                        <span className="text-[10px] font-bold text-celestial-stone uppercase tracking-widest">Hook Retention</span>
                        <span className="text-2xl font-black text-white font-mono">{metadata.hookScore}/10</span>
                    </div>
                    <div className="h-2 w-full bg-eclipse-black rounded-full overflow-hidden border border-white/5">
                        <div 
                            className={`h-full transition-all duration-1000 ${metadata.hookScore > 7 ? 'bg-deep-sage' : metadata.hookScore > 4 ? 'bg-solar-amber/50' : 'bg-solar-amber'}`}
                            style={{ width: `${metadata.hookScore * 10}%` }}
                        ></div>
                    </div>
                </div>
                <div className="p-6 rounded-2xl bg-white/5 border border-white/5">
                    <span className="text-[10px] font-bold text-celestial-stone uppercase tracking-widest block mb-4">Target Audience</span>
                    <div className="px-4 py-2 rounded-lg bg-eclipse-black border border-white/10 text-[11px] font-bold text-luna-gold inline-block uppercase">
                        {metadata.audience}
                    </div>
                </div>
            </div>

            <div className="lg:col-span-2 space-y-6">
                <div className="p-6 rounded-2xl bg-white/5 border border-white/5">
                    <span className="text-[10px] font-bold text-celestial-stone uppercase tracking-widest block mb-6">High-CTR Title Proposals</span>
                    <div className="space-y-3">
                    {metadata.suggestedTitles.map((title, i) => (
                        <div key={i} className="group flex items-center justify-between p-4 bg-eclipse-black rounded-xl border border-white/5 hover:border-luna-gold/30 transition-all cursor-pointer">
                            <span className="text-sm font-medium text-starlight line-clamp-1">{title}</span>
                            <button onClick={() => copyToClipboard(title)} className="opacity-0 group-hover:opacity-100 transition-opacity text-luna-gold text-xs">
                                <i className="fa-solid fa-copy"></i>
                            </button>
                        </div>
                    ))}
                    </div>
                </div>
            </div>
        </div>
      )}

      {activeTab === 'multiplier' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in duration-500">
            {['twitter', 'linkedin'].map((platform) => (
                <div key={platform} className="p-8 rounded-3xl bg-white/5 border border-white/5 group hover:border-luna-gold/20 transition-all flex flex-col">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <i className={`fa-brands fa-${platform === 'twitter' ? 'x-twitter' : 'linkedin'} text-white text-lg`}></i>
                            <h4 className="text-xs font-bold text-white uppercase tracking-widest">{platform} Blueprint</h4>
                        </div>
                        {multiplierContent[platform as keyof typeof multiplierContent] && (
                            <button onClick={() => copyToClipboard(multiplierContent[platform as keyof typeof multiplierContent]!)} className="text-luna-gold hover:text-white transition-colors">
                                <i className="fa-solid fa-copy text-xs"></i>
                            </button>
                        )}
                    </div>
                    <div className="space-y-4 flex-1">
                        <div className="p-4 bg-eclipse-black rounded-xl border border-white/5 text-[11px] text-celestial-stone italic whitespace-pre-wrap min-h-[100px]">
                            {multiplierContent[platform as keyof typeof multiplierContent] || `Awaiting ${platform} synthesis...`}
                        </div>
                        <button
                            onClick={() => handleGeneratePost(platform as any)}
                            disabled={loadingPlatform === 'all'}
                            className="w-full py-2 bg-luna-gold/10 text-luna-gold text-[9px] font-bold uppercase tracking-widest rounded-lg border border-luna-gold/30 hover:bg-luna-gold hover:text-white transition-all"
                        >
                            {loadingPlatform === 'all' ? <i className="fa-solid fa-sync fa-spin mr-2"></i> : null}
                            Generate Post
                        </button>
                    </div>
                </div>
            ))}
        </div>
      )}

      {activeTab === 'thumbnail' && (
        <div className="animate-in zoom-in-95 duration-500">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                <div className="space-y-6">
                    <h4 className="text-sm font-bold text-white uppercase tracking-widest font-mono">Thumbnail Studio</h4>
                    <p className="text-xs text-celestial-stone leading-relaxed">Design high-impact visual covers that leverage your production characters.</p>
                    <button 
                        onClick={handleCreateThumbnail}
                        disabled={isGeneratingThumbnail}
                        className="w-full bg-gold-gradient text-white py-4 rounded-xl font-bold text-[10px] uppercase tracking-widest shadow-xl shadow-luna-gold/20 disabled:opacity-30"
                    >
                        {isGeneratingThumbnail ? <i className="fa-solid fa-sync fa-spin mr-2"></i> : <i className="fa-solid fa-palette mr-2"></i>}
                        Design New Cover
                    </button>
                </div>

                <div className="relative aspect-video bg-eclipse-black rounded-2xl overflow-hidden border border-white/10 shadow-2xl group">
                    {thumbnailData.imageUrl ? (
                        <>
                            <img src={thumbnailData.imageUrl} className="w-full h-full object-cover" alt="Thumbnail" />
                            {thumbnailData.text && (
                                <div className="absolute inset-0 flex items-center justify-center p-8">
                                    <h5 className="text-5xl md:text-7xl font-black text-white text-center leading-tight drop-shadow-[0_10px_30px_rgba(0,0,0,1)] uppercase italic tracking-tighter">
                                        {thumbnailData.text}
                                    </h5>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-mystic-gray/20">
                            <i className="fa-solid fa-image text-6xl mb-4"></i>
                            <p className="text-[10px] uppercase tracking-widest font-black">Ready for Design</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
      )}

      {activeTab === 'viral' && (
        <div className="animate-in fade-in duration-500 space-y-8">
            {!viralData ? (
                <div className="py-12 flex flex-col items-center justify-center text-center nm-inset-input rounded-3xl">
                    <i className="fa-solid fa-microscope text-4xl text-luna-gold/20 mb-6"></i>
                    <h4 className="text-lg font-bold text-white uppercase tracking-tight mb-2">Deep Viral Diagnostic</h4>
                    <p className="text-xs text-mystic-gray max-w-sm mb-8">Run an AI-powered psychology audit on your script to predict retention and emotional engagement.</p>
                    <button 
                        onClick={handleRunViralAnalysis}
                        disabled={isAnalyzingViral}
                        className="nm-button-gold text-white px-10 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-nm-gold"
                    >
                        {isAnalyzingViral ? <i className="fa-solid fa-sync fa-spin mr-2"></i> : null}
                        Begin Viral Synthesis
                    </button>
                </div>
            ) : (
                <>
                    <div className="p-8 rounded-3xl bg-white/5 border border-white/5 flex flex-col md:flex-row gap-10 items-center">
                        <div className="relative w-32 h-32 flex-shrink-0">
                            <svg viewBox="0 0 36 36" className="w-full h-full">
                                <path className="stroke-eclipse-black" strokeWidth="3" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                                <path className="stroke-luna-gold" strokeDasharray={`${viralData.hookScore * 10}, 100`} strokeWidth="3" strokeLinecap="round" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center flex-col">
                                <span className="text-2xl font-black text-white">{viralData.hookScore * 10}%</span>
                                <span className="text-[7px] text-mystic-gray font-bold uppercase tracking-widest">Viral Index</span>
                            </div>
                        </div>
                        <div className="flex-1 space-y-4">
                            <h4 className="text-xs font-black text-white uppercase tracking-widest">Narrative Heatmap Diagnostic</h4>
                            <div className="grid grid-cols-5 gap-1.5 h-8">
                                {viralData.heatmap.map((val, i) => (
                                    <div 
                                        key={i} 
                                        className={`h-full rounded-sm transition-all duration-1000 nm-button border border-white/5`} 
                                        style={{ 
                                            opacity: val,
                                            backgroundColor: val > 0.8 ? '#ef4444' : val > 0.5 ? '#3b82f6' : '#27272a'
                                        }}
                                        title={`Segment ${i+1}: ${Math.floor(val * 100)}% Engagement`}
                                    ></div>
                                ))}
                            </div>
                            <p className="text-[10px] text-celestial-stone leading-relaxed italic opacity-80">
                                "{viralData.predictionSummary}"
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="p-6 rounded-2xl bg-white/5 border border-white/5">
                            <h5 className="text-[9px] font-black text-luna-gold uppercase tracking-[0.2em] mb-4">Retention Catalysts</h5>
                            <ul className="space-y-3">
                                {viralData.retentionCatalysts.map((item, i) => (
                                    <li key={i} className="flex items-center gap-3 text-[11px] text-starlight">
                                        <i className="fa-solid fa-circle-check text-deep-sage text-[8px]"></i>
                                        {item}
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div className="p-6 rounded-2xl bg-white/5 border border-white/5">
                            <h5 className="text-[9px] font-black text-solar-amber uppercase tracking-[0.2em] mb-4">Engagement Friction</h5>
                            <ul className="space-y-3">
                                {viralData.engagementFriction.map((item, i) => (
                                    <li key={i} className="flex items-center gap-3 text-[11px] text-starlight">
                                        <i className="fa-solid fa-circle-exclamation text-solar-amber text-[8px]"></i>
                                        {item}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                    <div className="flex justify-center">
                         <button onClick={handleRunViralAnalysis} className="text-[8px] font-bold text-mystic-gray uppercase tracking-widest hover:text-white transition-colors">Recalculate Analysis</button>
                    </div>
                </>
            )}
        </div>
      )}
    </div>
  );
};
