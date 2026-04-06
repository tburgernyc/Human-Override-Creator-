
import React, { useState, useRef, useEffect } from 'react';
import { Scene, GeneratedAssets, DialogueLine, TextOverlay, Character, TransitionType, CameraMotion, AssetHistoryItem } from '../types';
import { decodeAudio, optimizeVisualPrompt } from '../services/gemini';
import { MUSIC_TRACKS } from '../constants';

interface SceneCardProps {
  scene: Scene;
  asset?: GeneratedAssets[number];
  characters?: Character[];
  index: number;
  totalScenes: number;
  onGenerate: (sceneId: number, feedback?: string) => void;
  onExtend: (sceneId: number) => void;
  onUpdate: (sceneId: number, updatedScene: Scene) => void;
  onMove: (direction: 'prev' | 'next') => void;
  onDelete: (sceneId: number) => void;
  onDuplicate: () => void;
  onInspect?: (scene: Scene) => void;
  onClearAsset: (sceneId: number, type: 'visual' | 'audio' | 'all') => void;
  onSelectVariant?: (sceneId: number, variant: AssetHistoryItem) => void;
  isProcessing: boolean;
  globalStyle?: string;
}

export const SceneCard: React.FC<SceneCardProps> = ({ 
  scene, 
  asset, 
  characters = [],
  index, 
  totalScenes, 
  onGenerate, 
  onExtend,
  onUpdate,
  onMove, 
  onDelete, 
  onDuplicate,
  onInspect,
  onClearAsset,
  onSelectVariant,
  isProcessing,
  globalStyle = "Cinematic"
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [showTakes, setShowTakes] = useState(false);
  const [isOptimizingPrompt, setIsOptimizingPrompt] = useState(false);
  
  const [editedDescription, setEditedDescription] = useState(scene.description);
  const [editedPrompt, setEditedPrompt] = useState(scene.visualPrompt);
  const [editedMusicMood, setEditedMusicMood] = useState(scene.musicMood || 'calm');
  const [editedDuration, setEditedDuration] = useState(scene.estimatedDuration || 4);
  const [editedTransition, setEditedTransition] = useState<TransitionType>(scene.transition || 'fade');
  const [editedCameraMotion, setEditedCameraMotion] = useState<CameraMotion>(scene.cameraMotion || 'random_cinematic');
  const [editedLines, setEditedLines] = useState<DialogueLine[]>(scene.narratorLines);
  const [selectedCharNames, setSelectedCharNames] = useState<string[]>(scene.charactersInScene);
  const [overlayText, setOverlayText] = useState(scene.textOverlay?.text || "");
  const [overlayPos, setOverlayPos] = useState<'top'|'center'|'bottom'>(scene.textOverlay?.position || 'bottom');
  const [overlayStyle, setOverlayStyle] = useState<'title'|'subtitle'|'cinematic'>(scene.textOverlay?.style as any || 'subtitle');
  const [editedNotes, setEditedNotes] = useState(scene.productionNotes || "");

  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  const handleSave = () => {
    onUpdate(scene.id, {
        ...scene,
        description: editedDescription,
        visualPrompt: editedPrompt,
        musicMood: editedMusicMood,
        estimatedDuration: editedDuration,
        transition: editedTransition,
        cameraMotion: editedCameraMotion,
        narratorLines: editedLines,
        charactersInScene: selectedCharNames,
        productionNotes: editedNotes,
        textOverlay: overlayText ? {
            text: overlayText,
            position: overlayPos,
            style: overlayStyle as any,
            hasShadow: true,
            isBold: true
        } : undefined
    });
    setIsEditing(false);
  };

  const handleOptimizePrompt = async () => {
    setIsOptimizingPrompt(true);
    try {
        const line = editedLines[0]?.text || editedDescription;
        const optimized = await optimizeVisualPrompt(line, globalStyle);
        setEditedPrompt(optimized);
    } finally { setIsOptimizingPrompt(false); }
  };

  const playAudio = async () => {
    if (!asset?.audioUrl || isPlayingAudio) return;
    try {
        if (!audioContextRef.current) audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();
        setIsPlayingAudio(true);
        const buffer = await decodeAudio(asset.audioUrl.split(',')[1], audioContextRef.current);
        const source = audioContextRef.current.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContextRef.current.destination);
        source.onended = () => setIsPlayingAudio(false);
        source.start(0);
    } catch (e) { setIsPlayingAudio(false); }
  };

  if (isEditing) {
      return (
        <div className="nm-panel p-6 flex flex-col h-full overflow-y-auto min-h-[700px] animate-in slide-in-from-right-5 border border-white/5">
            <h4 className="text-starlight font-bold mb-6 border-b border-white/5 pb-2 uppercase tracking-widest text-[10px] font-mono">Scene Orchestrator {index + 1}</h4>
            <div className="space-y-6">
                <div>
                    <label className="text-[9px] uppercase tracking-widest text-mystic-gray mb-2 block font-bold">Context Description</label>
                    <textarea className="w-full nm-inset-input rounded-xl p-4 text-xs text-starlight outline-none border-none focus:ring-1 focus:ring-luna-gold/20" rows={2} value={editedDescription} onChange={e => setEditedDescription(e.target.value)} />
                </div>
                <div>
                    <div className="flex justify-between items-center mb-2">
                        <label className="text-[9px] uppercase tracking-widest text-luna-gold block font-bold">Visual Prompt</label>
                        <button onClick={handleOptimizePrompt} disabled={isOptimizingPrompt} className="nm-button-gold text-[8px] uppercase tracking-tighter font-black text-white px-3 py-1 rounded-lg transition-all shadow-nm-gold">
                            {isOptimizingPrompt ? <i className="fa-solid fa-sync fa-spin"></i> : 'AI Optimize'}
                        </button>
                    </div>
                    <textarea className="w-full nm-inset-input rounded-xl p-4 text-xs text-starlight outline-none italic border-none focus:ring-1 focus:ring-luna-gold/20" rows={3} value={editedPrompt} onChange={e => setEditedPrompt(e.target.value)} />
                </div>
                <div>
                    <label className="text-[9px] uppercase tracking-widest text-mystic-gray mb-2 block font-bold">Directorial Notes</label>
                    <textarea className="w-full nm-inset-input rounded-xl p-4 text-[10px] text-celestial-stone outline-none border-none italic" rows={2} value={editedNotes} onChange={e => setEditedNotes(e.target.value)} placeholder="Personnel cues, movement notes..." />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-[9px] uppercase tracking-widest text-mystic-gray mb-2 block font-bold">Duration (s)</label>
                        <input type="number" className="w-full nm-inset-input rounded-xl p-3 text-xs text-starlight outline-none border-none" value={editedDuration} onChange={e => setEditedDuration(parseFloat(e.target.value))} />
                    </div>
                    <div>
                        <label className="text-[9px] uppercase tracking-widest text-mystic-gray mb-2 block font-bold">Transition</label>
                        <select className="w-full nm-inset-input rounded-xl p-3 text-xs text-starlight capitalize outline-none border-none" value={editedTransition} onChange={e => setEditedTransition(e.target.value as TransitionType)}>
                            <option value="cut">Cut</option>
                            <option value="fade">Fade</option>
                            <option value="crossfade">Crossfade</option>
                            <option value="zoom_in">Zoom In</option>
                        </select>
                    </div>
                </div>
            </div>
            <div className="flex justify-end gap-4 pt-8 mt-auto">
                <button onClick={() => setIsEditing(false)} className="text-[10px] text-celestial-stone font-bold uppercase tracking-widest px-4 nm-button rounded-xl py-3 border border-white/5">Discard</button>
                <button onClick={handleSave} className="nm-button-gold text-white px-8 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest shadow-nm-gold">Commit Changes</button>
            </div>
        </div>
      );
  }

  const sceneChars = characters.filter(c => scene.charactersInScene.includes(c.name));
  const takeCount = asset?.variants?.length || 0;
  
  const statusSteps = [
    { label: 'IMG', key: 'generating_image', active: asset?.status === 'generating_image' || !!asset?.imageUrl },
    { label: 'VEO', key: 'generating_video', active: asset?.status === 'generating_video' || !!asset?.videoUrl },
    { label: 'TTS', key: 'generating_audio', active: asset?.status === 'generating_audio' || !!asset?.audioUrl }
  ];

  return (
    <div className="nm-card overflow-hidden flex flex-col h-full group relative border border-white/5 bg-eclipse-black">
      <div className="aspect-video bg-eclipse-black relative overflow-hidden border-b border-white/5">
        {asset?.videoUrl ? (
          <video src={asset.videoUrl} className="w-full h-full object-cover" controls={false} loop muted autoPlay playsInline />
        ) : asset?.imageUrl ? (
           <img src={asset.imageUrl} alt="Scene" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-eclipse-black">
             <i className="fa-solid fa-film text-mystic-gray/10 text-4xl mb-3"></i>
             <p className="text-[10px] text-mystic-gray/40 font-mono uppercase tracking-widest">Awaiting Manifest</p>
          </div>
        )}

        {isProcessing && (
          <div className="absolute top-0 left-0 right-0 h-1 flex gap-1 z-50">
            {statusSteps.map((step, i) => (
              <div 
                key={step.label}
                className={`h-full flex-1 transition-all duration-500 ${step.active ? 'bg-luna-gold shadow-[0_0_10px_#3b82f6]' : 'bg-white/10'}`}
              ></div>
            ))}
          </div>
        )}

        <div className="absolute top-3 left-3 flex gap-2">
            <span className="nm-button bg-eclipse-black/60 backdrop-blur-md text-white text-[9px] font-bold px-3 py-1 rounded-lg font-mono border border-white/10 shadow-lg">#{index + 1}</span>
            <span className="nm-button bg-eclipse-black/60 backdrop-blur-md text-white text-[9px] font-bold px-3 py-1 rounded-lg font-mono border border-white/10 shadow-lg">{scene.estimatedDuration}s</span>
        </div>

        {takeCount > 1 && (
            <div className="absolute top-3 right-3">
                <button 
                    onClick={() => setShowTakes(!showTakes)}
                    className="nm-button bg-luna-gold/20 backdrop-blur-md text-luna-gold text-[8px] font-black px-3 py-1 rounded-lg uppercase tracking-tighter border border-luna-gold/30 shadow-lg hover:scale-110 transition-transform"
                >
                    {takeCount} Takes
                </button>
            </div>
        )}

        {showTakes && asset?.variants && (
            <div className="absolute inset-0 bg-eclipse-black/90 backdrop-blur-md z-30 p-4 animate-in fade-in zoom-in-95">
                <div className="flex justify-between items-center mb-4">
                    <h6 className="text-[9px] font-black text-white uppercase tracking-widest">Select Production Take</h6>
                    <button onClick={() => setShowTakes(false)} className="text-mystic-gray hover:text-white"><i className="fa-solid fa-xmark"></i></button>
                </div>
                <div className="grid grid-cols-2 gap-3 h-[calc(100%-2rem)] overflow-y-auto pr-1 scrollbar-hide">
                    {asset.variants.map((v, i) => (
                        <div 
                            key={i} 
                            onClick={() => { onSelectVariant?.(scene.id, v); setShowTakes(false); }}
                            className="nm-button p-1 rounded-xl cursor-pointer group/take relative border border-white/5 hover:border-luna-gold/50"
                        >
                            <img src={v.imageUrl} className="w-full aspect-video object-cover rounded-lg" />
                            <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/60 rounded text-[7px] text-white font-mono">Take {takeCount - i}</div>
                        </div>
                    ))}
                </div>
            </div>
        )}

        {isProcessing && (
            <div className="absolute inset-0 bg-eclipse-black/85 backdrop-blur-sm flex flex-col items-center justify-center z-10">
                <div className="w-12 h-12 nm-button rounded-full flex items-center justify-center mb-4 border border-white/5 relative">
                    <div className="absolute inset-0 nm-button rounded-full animate-ping opacity-20"></div>
                    <div className="w-8 h-8 border-2 border-luna-gold/10 border-t-luna-gold rounded-full animate-spin"></div>
                </div>
                <div className="flex flex-col items-center gap-1">
                   <span className="text-[10px] text-luna-gold font-bold uppercase tracking-[0.3em] animate-pulse">{asset?.status.replace('_', ' ')}</span>
                   <div className="flex gap-4">
                      {statusSteps.map(s => (
                        <span key={s.label} className={`text-[7px] font-black tracking-widest ${s.active ? 'text-white' : 'text-mystic-gray opacity-30'}`}>{s.label}</span>
                      ))}
                   </div>
                </div>
            </div>
        )}
      </div>

      <div className="p-5 flex-1 flex flex-col">
        <div className="flex justify-between items-start mb-3">
            <h5 className="text-starlight text-sm font-bold line-clamp-1 flex-1 font-mono tracking-tight">{scene.description}</h5>
            <div className="flex -space-x-1.5 ml-3">
                {sceneChars.map(c => (
                    <div key={c.id} title={c.name} className="w-7 h-7 rounded-full nm-button p-[2px] bg-eclipse-black overflow-hidden border border-white/10 group-hover:scale-110 transition-transform shadow-lg">
                        {c.referenceImageBase64 ? <img src={c.referenceImageBase64} className="w-full h-full rounded-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><i className="fa-solid fa-user text-[8px] text-mystic-gray"></i></div>}
                    </div>
                ))}
            </div>
        </div>
        <div className="flex-1 space-y-2 mb-6">
            <p className="text-celestial-stone text-[11px] line-clamp-2 italic opacity-60 font-serif">"{scene.narratorLines[0]?.text || 'Atmospheric Sequence'}"</p>
            {scene.productionNotes && (
                <div className="flex items-center gap-2 text-[8px] text-luna-gold/60 uppercase font-black tracking-widest border-l border-luna-gold/20 pl-2">
                    <i className="fa-solid fa-note-sticky text-[7px]"></i>
                    <span className="truncate">{scene.productionNotes}</span>
                </div>
            )}
        </div>
        
        <div className="flex items-center justify-between mt-auto pt-4 border-t border-white/5">
             <div className="flex gap-2">
                 <button onClick={playAudio} disabled={!asset?.audioUrl || isPlayingAudio} className={`w-9 h-9 rounded-xl nm-button flex items-center justify-center transition-all ${isPlayingAudio ? 'text-luna-gold shadow-nm-inset' : 'text-celestial-stone hover:text-white hover:scale-110'}`}>
                    <i className={`fa-solid ${isPlayingAudio ? 'fa-waveform fa-beat-fade' : 'fa-volume-high'} text-[10px]`}></i>
                 </button>
                 <div className="flex items-center gap-1.5 px-3 rounded-xl nm-inset-input">
                    <div className={`w-1.5 h-1.5 rounded-full ${asset?.imageUrl ? 'bg-deep-sage shadow-[0_0_5px_#10b981]' : 'bg-mystic-gray/20'}`}></div>
                    <div className={`w-1.5 h-1.5 rounded-full ${asset?.videoUrl ? 'bg-deep-sage shadow-[0_0_5px_#10b981]' : 'bg-mystic-gray/20'}`}></div>
                    <div className={`w-1.5 h-1.5 rounded-full ${asset?.audioUrl ? 'bg-deep-sage shadow-[0_0_5px_#10b981]' : 'bg-mystic-gray/20'}`}></div>
                 </div>
             </div>
             
             <div className="flex gap-2">
                 <button onClick={() => setIsEditing(true)} className="w-9 h-9 rounded-xl nm-button text-celestial-stone hover:text-white flex items-center justify-center transition-all hover:scale-110"><i className="fa-solid fa-sliders text-[10px]"></i></button>
                 <div className="relative group/actions">
                     <button className="h-9 px-5 rounded-xl nm-button-gold text-white flex items-center justify-center text-[9px] font-black uppercase tracking-[0.2em] transition-all shadow-nm-gold hover:scale-105 active:scale-95">Take</button>
                     <div className="absolute bottom-full right-0 mb-3 w-48 nm-panel rounded-2xl shadow-2xl hidden group-hover/actions:block z-40 py-2 border border-white/5 animate-in fade-in slide-in-from-bottom-2">
                         <button onClick={() => onGenerate(scene.id)} className="w-full text-left px-4 py-3 text-[10px] font-bold text-starlight hover:bg-luna-gold hover:text-white transition-colors uppercase"><i className="fa-solid fa-sparkles mr-3"></i> Trigger New Take</button>
                         {asset?.videoUrl && (
                             <button onClick={() => onExtend(scene.id)} className="w-full text-left px-4 py-3 text-[10px] font-bold text-starlight hover:bg-luna-gold hover:text-white transition-colors uppercase"><i className="fa-solid fa-clock-rotate-left mr-3"></i> Extend (+7s)</button>
                         )}
                         <button onClick={() => onInspect?.(scene)} className="w-full text-left px-4 py-3 text-[10px] font-bold text-starlight hover:bg-luna-gold hover:text-white transition-colors uppercase"><i className="fa-solid fa-microscope mr-3"></i> Deep Inspector</button>
                         <div className="h-px nm-inset-input mx-2 my-1"></div>
                         <button onClick={() => onClearAsset(scene.id, 'all')} className="w-full text-left px-4 py-3 text-[10px] font-medium text-mystic-gray hover:text-solar-amber transition-colors uppercase"><i className="fa-solid fa-trash-can mr-3"></i> Clear Sequence</button>
                     </div>
                 </div>
             </div>
        </div>
      </div>
    </div>
  );
};
