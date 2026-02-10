
import React, { useState, useRef, useEffect } from 'react';
import { Layout } from './components/Layout';
import { ScriptInput } from './components/ScriptInput';
import { SceneCard } from './components/SceneCard';
import { Player } from './components/Player';
import { Renderer } from './components/Renderer';
import { CharacterModal } from './components/CharacterModal';
import { LandingPage } from './components/LandingPage';
import { ProjectsView } from './components/ProjectsView';
import { SceneInspector } from './components/SceneInspector';
import { ProductionManifest } from './components/ProductionManifest';
import { ProductionTimeline } from './components/ProductionTimeline';
import { CastEnsemble } from './components/CastEnsemble';
import { DirectorAssistant } from './components/DirectorAssistant';
import { YouTubeOptimizer } from './components/YouTubeOptimizer';
import { AssetLibrary } from './components/AssetLibrary';
import { ProductionMonitor } from './components/ProductionMonitor';
import { AudioMixer } from './components/AudioMixer';
import { ContinuityAuditor } from './components/ContinuityAuditor';
import { DirectorialDeck } from './components/DirectorialDeck';
import { BRollSuggestionModal } from './components/BRollSuggestionModal';
import { DirectorDraftModal } from './components/DirectorDraftModal';
import { StoryboardView } from './components/StoryboardView';
import { ScriptDoctor } from './components/ScriptDoctor';
import { VFXMaster } from './components/VFXMaster';
import { Moodboard } from './components/Moodboard';
import { ProductionStageOverview } from './components/ProductionStageOverview';
import { ProjectState, GeneratedAssets, AspectRatio, Resolution, Character, Scene, ChatMessage, ProductionTask, ProjectModules, LogEntry, AssetHistoryItem, ViralPotential, DirectorDraft } from './types';
import { 
  analyzeScript, 
  generateCharacterImage, 
  generateSceneImage, 
  generateSceneVideo, 
  generateSceneAudio, 
  triggerApiKeySelection, 
  suggestBRoll,
  synthesizeCharacterPersona,
  performFullAudit,
  analyzeViralPotential,
  extendSceneVideo
} from './services/gemini';
import { VOICE_PRESETS, VISUAL_STYLES } from './constants';

const LOCAL_STORAGE_KEY = 'human_override_active_project_v7';
const ALL_PROJECTS_KEY = 'human_override_archives_v5';

type ProductionPhase = 'genesis' | 'manifest' | 'synthesis' | 'post';

const App: React.FC = () => {
  const [project, setProject] = useState<ProjectState>(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) return JSON.parse(saved);
    return {
      script: '', status: 'idle', characters: [], scenes: [], assets: {}, tasks: [], modules: {}, productionLog: [],
      currentStepMessage: '', globalStyle: VISUAL_STYLES[0], productionSeed: Math.floor(Math.random() * 1000000),
      activeDraft: null,
      mastering: { 
        musicVolume: 15, voiceVolume: 100, ambientVolume: 30, filmGrain: 5, 
        bloomIntensity: 10, vignetteIntensity: 30, lightLeakIntensity: 20, filmBurnIntensity: 10, lutPreset: 'none' 
      }
    };
  });

  const [archives, setArchives] = useState<ProjectState[]>(() => {
    const saved = localStorage.getItem(ALL_PROJECTS_KEY);
    return typeof saved === 'string' ? JSON.parse(saved) : [];
  });
  
  const [view, setView] = useState<'landing' | 'dashboard' | 'projects'>(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    return saved && JSON.parse(saved).script ? 'dashboard' : 'landing';
  });

  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(AspectRatio.LANDSCAPE);
  const [resolution, setResolution] = useState<Resolution>(Resolution.FHD); 
  const [showPlayer, setShowPlayer] = useState(false);
  const [showRenderer, setShowRenderer] = useState(false);
  const [showMastering, setShowMastering] = useState(false);
  const [showManifest, setShowManifest] = useState(false);
  const [showAssetLibrary, setShowAssetLibrary] = useState(false);
  const [showMixer, setShowMixer] = useState(false);
  const [showAuditor, setShowAuditor] = useState(false);
  const [showDeck, setShowDeck] = useState(false);
  const [showBRoll, setShowBRoll] = useState(false);
  const [showStoryboard, setShowStoryboard] = useState(false);
  const [showScriptDoctor, setShowScriptDoctor] = useState(false);
  const [inspectingScene, setInspectingScene] = useState<Scene | null>(null);
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [bRollSuggestions, setBRollSuggestions] = useState<Scene[]>([]);
  const [currentTaskLabel, setCurrentTaskLabel] = useState("");
  const [hasAuth, setHasAuth] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [youtubeMetadata, setYoutubeMetadata] = useState<any | null>(null);
  const [autoDiagnosisTriggered, setAutoDiagnosisTriggered] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const activePhase: ProductionPhase = !project.script ? 'genesis' : project.scenes.length === 0 ? 'genesis' : !Object.values(project.assets).some(a => a.status === 'complete') ? 'manifest' : 'synthesis';
  const isAllComplete = project.scenes.length > 0 && project.scenes.every(s => project.assets[s.id]?.status === 'complete');

  useEffect(() => {
    const checkAuth = async () => { if (window.aistudio) setHasAuth(await window.aistudio.hasSelectedApiKey()); else setHasAuth(true); };
    checkAuth();
  }, []);

  useEffect(() => { 
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(project));
  }, [project]);

  useEffect(() => {
    localStorage.setItem(ALL_PROJECTS_KEY, JSON.stringify(archives));
  }, [archives]);

  useEffect(() => {
    if (project.status === 'ready' && !autoDiagnosisTriggered) {
      setChatOpen(true);
      setAutoDiagnosisTriggered(true);
    }
  }, [project.status, autoDiagnosisTriggered]);

  const addLog = (message: string, type: LogEntry['type'] = 'system', actionLabel?: string, actionId?: string, actionParams?: any) => {
      const newEntry: LogEntry = { id: Date.now().toString(), timestamp: Date.now(), type, message, actionLabel, actionId, actionParams };
      setProject(p => ({ ...p, productionLog: [newEntry, ...p.productionLog].slice(0, 50) }));
  };

  const handleApplyDraft = (draft: DirectorDraft) => {
      setProject(p => ({
          ...p,
          scenes: p.scenes.map(s => {
              const proposed = draft.proposedChanges.find(c => c.sceneId === s.id);
              return proposed ? { ...s, ...proposed.updates } : s;
          }),
          activeDraft: null
      }));
      addLog("Batch refinement draft applied to timeline.", "success");
  };

  const handleRunFullAudit = async () => {
    addLog("Commencing deep continuity and narrative audit...", "system");
    setIsBatchProcessing(true);
    try {
      await performFullAudit(project);
      setChatOpen(true);
      addLog("Audit Complete: Signal transmitted to Director terminal.", "success");
    } catch (e) {
      addLog("Audit failed: Narrative link unstable.", "error");
    } finally {
      setIsBatchProcessing(false);
    }
  };

  const handleToolExecution = async (name: string, args: any) => {
    addLog(`OverrideBot executing command: ${name}`, "ai_suggestion");
    if (name === 'update_scene') {
      const { scene_id, updates } = args;
      setProject(p => ({
        ...p,
        scenes: p.scenes.map(s => s.id === scene_id ? { ...s, ...updates } : s)
      }));
      return "Scene updated successfully.";
    } else if (name === 'add_character') {
      const { name: charName, description, gender } = args;
      const persona = await synthesizeCharacterPersona(charName, gender, project.globalStyle || "Cinematic", project.productionSeed);
      const newChar: Character = {
        id: `char_${Date.now()}`,
        name: charName,
        description: persona.description || description,
        gender: gender,
        visualPrompt: persona.visualPrompt || "",
        voiceId: persona.voiceId || VOICE_PRESETS[0].id,
        voiceSettings: { speed: 1, pitch: 0 }
      };
      setProject(p => ({ ...p, characters: [...p.characters, newChar] }));
      return "Character added and synthesized.";
    } else if (name === 'propose_batch_refinement') {
        const { reasoning, changes } = args;
        const draft: DirectorDraft = {
            id: `draft_${Date.now()}`,
            timestamp: Date.now(),
            reasoning,
            proposedChanges: changes,
            status: 'pending'
        };
        setProject(p => ({ ...p, activeDraft: draft }));
        return "Draft refinement created for review.";
    } else if (name === 'update_project_module') {
      const { module_name, content } = args;
      setProject(p => ({ ...p, modules: { ...p.modules, [module_name]: content } }));
      return "Module updated.";
    } else if (name === 'suggest_b_roll') {
      const suggestions = await suggestBRoll(project);
      setBRollSuggestions(suggestions.map((s, i) => ({ ...s, id: Date.now() + i })));
      setShowBRoll(true);
      return "B-Roll synthesis complete. Review suggestions in the terminal.";
    }
    return "Unknown tool.";
  };

  const handleAnalyze = async (script: string) => {
    if (!hasAuth) { await triggerApiKeySelection(); setHasAuth(true); return; }
    setProject(prev => ({ ...prev, status: 'analyzing', script }));
    setAutoDiagnosisTriggered(false);
    addLog("Initializing production sequence analysis...", "system");
    try {
      const { characters, scenes, tasks, modules, metadata } = await analyzeScript(script, project.productionSeed);
      const initialAssets: GeneratedAssets = {};
      scenes.forEach(s => initialAssets[s.id] = { status: 'pending', variants: [] });
      setProject(prev => ({ ...prev, status: 'ready', characters, scenes, assets: initialAssets, tasks, modules }));
      setYoutubeMetadata(metadata);
      addLog(`Analysis complete. Visual health: Calibrated.`, "success");
    } catch (error) { addLog("Analysis failure.", "error"); }
  };

  const handleGenerateSceneAsset = async (sceneId: number, feedback?: string) => {
      const scene = project.scenes.find(s => s.id === sceneId);
      if (!scene) return;
      
      setProject(prev => ({ 
        ...prev, 
        assets: { 
          ...prev.assets, 
          [sceneId]: { 
            ...(prev.assets[sceneId] || { status: 'pending', variants: [] }),
            status: 'generating_image' 
          } 
        } 
      }));

      try {
          const moodboardImg = project.modules.outline;
          const keyArtImg = project.keyArtSceneId ? project.assets[project.keyArtSceneId]?.imageUrl : undefined;
          const styleRef = moodboardImg || keyArtImg;

          const img = await generateSceneImage(scene, project.characters, aspectRatio, resolution, feedback, project.globalStyle, project.productionSeed, styleRef);
          setProject(prev => ({ ...prev, assets: { ...prev.assets, [sceneId]: { ...prev.assets[sceneId], imageUrl: img, status: 'generating_video' } } }));
          
          const video = await generateSceneVideo(img, scene.visualPrompt, aspectRatio, resolution, project.globalStyle);
          const audio = await generateSceneAudio(scene.narratorLines, project.characters);
          
          const finalVariant: AssetHistoryItem = { imageUrl: img, videoUrl: video, timestamp: Date.now() };
          
          setProject(prev => {
            const currentAsset = prev.assets[sceneId];
            return { 
              ...prev, 
              assets: { 
                ...prev.assets, 
                [sceneId]: { 
                  ...currentAsset, 
                  imageUrl: img, 
                  videoUrl: video, 
                  audioUrl: audio, 
                  status: 'complete',
                  variants: [finalVariant, ...(currentAsset?.variants || [])].slice(0, 5)
                } 
              } 
            };
          });
      } catch (error) { 
          addLog(`Sequence generation failed for Scene #${sceneId}`, "error");
          setProject(prev => ({ ...prev, assets: { ...prev.assets, [sceneId]: { ...prev.assets[sceneId], status: 'error' } } })); 
      }
  };

  const handleExtendScene = async (sceneId: number) => {
    const scene = project.scenes.find(s => s.id === sceneId);
    const asset = project.assets[sceneId];
    if (!scene || !asset?.videoUrl) return;

    addLog(`Extending temporal sequence for Scene #${project.scenes.indexOf(scene) + 1}`, "system");
    setProject(prev => ({ 
      ...prev, 
      assets: { 
        ...prev.assets, 
        [sceneId]: { ...asset, status: 'generating_video' } 
      } 
    }));

    try {
        const extendedVideo = await extendSceneVideo(asset.videoUrl, scene.visualPrompt, aspectRatio);
        setProject(prev => ({
            ...prev,
            scenes: prev.scenes.map(s => s.id === sceneId ? { ...s, estimatedDuration: (s.estimatedDuration || 5) + 7 } : s),
            assets: {
                ...prev.assets,
                [sceneId]: { ...asset, videoUrl: extendedVideo, status: 'complete' }
            }
        }));
        addLog(`Extended scene sequence complete (+7s).`, "success");
    } catch (e) {
        addLog(`Extension failure for Scene #${sceneId}.`, "error");
        setProject(prev => ({ ...prev, assets: { ...prev.assets, [sceneId]: { ...asset, status: 'complete' } } }));
    }
  };

  const handleCharacterSave = async (char: Character) => {
    setProject(p => ({ ...p, characters: p.characters.map(c => c.id === char.id ? char : c) }));
    setEditingCharacter(null);
    addLog(`Character profile "${char.name}" updated.`, "system");
  };

  const handleManifestAll = async () => {
    if (isBatchProcessing) return;
    setIsBatchProcessing(true);
    addLog("Batch Manifesting Sequence Initialized...", "system");
    for (let i = 0; i < project.scenes.length; i++) {
        const scene = project.scenes[i];
        if (project.assets[scene.id]?.status === 'complete') continue;
        setCurrentTaskLabel(`Manifesting Sequence #${i + 1}: ${scene.description.substring(0, 20)}...`);
        await handleGenerateSceneAsset(scene.id);
    }
    setIsBatchProcessing(false);
    setCurrentTaskLabel("");
    addLog("Full sequence manifest complete.", "success");
  };

  const handleAddBRoll = (newScenes: Scene[]) => {
    const initializedAssets = { ...project.assets };
    newScenes.forEach(s => initializedAssets[s.id] = { status: 'pending', variants: [] });
    setProject(p => ({
        ...p,
        scenes: [...p.scenes, ...newScenes],
        assets: initializedAssets
    }));
    setShowBRoll(false);
    addLog(`${newScenes.length} B-Roll scenes injected.`, "success");
  };

  const handleMoveScene = (id: number, direction: 'prev' | 'next') => {
    setProject(prev => {
      const idx = prev.scenes.findIndex(s => s.id === id);
      const nextIdx = direction === 'prev' ? idx - 1 : idx + 1;
      if (nextIdx < 0 || nextIdx >= prev.scenes.length) return prev;
      const newScenes = [...prev.scenes];
      const [moved] = newScenes.splice(idx, 1);
      newScenes.splice(nextIdx, 0, moved);
      return { ...prev, scenes: newScenes };
    });
  };

  const handleClearAsset = (sceneId: number, type: 'visual' | 'audio' | 'all') => {
    setProject(prev => {
      const newAssets = { ...prev.assets };
      if (!newAssets[sceneId]) return prev;
      const updated = { ...newAssets[sceneId] };
      if (type === 'visual' || type === 'all') { updated.imageUrl = undefined; updated.videoUrl = undefined; }
      if (type === 'audio' || type === 'all') updated.audioUrl = undefined;
      if (type === 'all') updated.status = 'pending';
      newAssets[sceneId] = updated;
      return { ...prev, assets: newAssets };
    });
  };

  const handleSelectVariant = (sceneId: number, variant: AssetHistoryItem) => {
    setProject(prev => ({
      ...prev,
      assets: {
        ...prev.assets,
        [sceneId]: { ...prev.assets[sceneId], imageUrl: variant.imageUrl, videoUrl: variant.videoUrl }
      }
    }));
  };

  const handleSetKeyArt = (sceneId: number) => {
      setProject(p => ({ ...p, keyArtSceneId: sceneId }));
      addLog(`Master Style Reference locked to Scene #${project.scenes.findIndex(s => s.id === sceneId) + 1}.`, "success");
  };

  const scrollToScene = (id: number) => {
    const el = document.getElementById(`scene-${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <Layout 
      activeView={view} 
      onViewChange={setView} 
      isProcessing={isBatchProcessing || (project.status !== 'ready' && project.status !== 'idle')} 
      assistantActive={chatOpen} 
      onToggleAssistant={() => setChatOpen(!chatOpen)}
    >
      <div className={`relative min-h-screen transition-all duration-500 ease-in-out pb-32 ${chatOpen ? 'xl:pr-[25%]' : ''}`}>
        {view === 'landing' && <LandingPage onStart={() => setView('dashboard')} />}
        {view === 'projects' && <ProjectsView projects={archives} onSelect={p => { setProject(p); setView('dashboard'); }} onDelete={idx => setArchives(prev => prev.filter((_, i) => i !== idx))} onImport={() => fileInputRef.current?.click()} />}
        
        <input type="file" ref={fileInputRef} className="hidden" accept=".json" />

        {view === 'dashboard' && (
          <div className="flex flex-col gap-10 pt-8 relative max-w-[1400px] mx-auto animate-in fade-in duration-700 px-4 sm:px-0">
            
            {/* STAGE TRACKER & MASTER CONTROL */}
            <section className="nm-panel p-1 rounded-[2.5rem] bg-gradient-to-br from-white/5 to-transparent border border-white/5">
                <div className="p-8 flex flex-col lg:flex-row justify-between items-center gap-8">
                    <div className="flex items-center gap-6">
                        <div className="w-16 h-16 rounded-3xl nm-button flex items-center justify-center text-luna-gold shadow-2xl relative">
                            <i className="fa-solid fa-tower-broadcast text-2xl animate-pulse"></i>
                            <div className="absolute -top-1 -right-1 w-4 h-4 bg-deep-sage rounded-full border-4 border-eclipse-black"></div>
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-white uppercase tracking-tighter font-mono italic">Production Control</h2>
                            <p className="text-[10px] text-mystic-gray uppercase font-bold tracking-[0.4em] mt-1">Uplink: Core Intelligence Alpha</p>
                        </div>
                    </div>

                    <div className="flex bg-eclipse-black/40 p-1.5 rounded-2xl nm-inset-input border border-white/5 overflow-x-auto max-w-full scrollbar-hide">
                        {[
                            { id: 'genesis', label: '01 Genesis', icon: 'fa-seedling' },
                            { id: 'manifest', label: '02 Manifest', icon: 'fa-file-invoice' },
                            { id: 'synthesis', label: '03 Synthesis', icon: 'fa-wand-magic-sparkles' },
                            { id: 'post', label: '04 Post', icon: 'fa-clapperboard' }
                        ].map((phase) => (
                            <div key={phase.id} className={`px-6 py-3 rounded-xl flex items-center gap-3 transition-all shrink-0 ${activePhase === phase.id ? 'nm-button-gold text-white shadow-nm-gold scale-105 z-10' : 'text-mystic-gray opacity-40'}`}>
                                <i className={`fa-solid ${phase.icon} text-xs`}></i>
                                <span className="text-[10px] font-black uppercase tracking-widest">{phase.label}</span>
                            </div>
                        ))}
                    </div>

                    <div className="flex gap-4">
                        <div className="text-right">
                            <p className="text-[8px] text-mystic-gray uppercase font-black tracking-widest mb-1">Neural Health</p>
                            <div className="flex gap-1">
                                {[...Array(5)].map((_, i) => <div key={i} className={`w-4 h-1 rounded-full ${i < 4 ? 'bg-luna-gold shadow-[0_0_5px_#3b82f6]' : 'bg-white/10'}`}></div>)}
                            </div>
                        </div>
                        <div className="w-px h-10 bg-white/5 mx-2"></div>
                        <button onClick={() => setShowDeck(true)} className="nm-button w-12 h-12 rounded-2xl flex items-center justify-center text-solar-amber hover:text-white transition-all shadow-lg">
                            <i className="fa-solid fa-chart-line"></i>
                        </button>
                    </div>
                </div>
            </section>

            {/* PRODUCTION HEALTH SUMMARY */}
            {project.scenes.length > 0 && <ProductionStageOverview project={project} />}

            {/* STAGE 1: GENESIS (Script & Reference) */}
            <div className={`grid grid-cols-1 xl:grid-cols-12 gap-10 transition-all duration-700 ${activePhase !== 'genesis' ? 'opacity-50 hover:opacity-100 blur-[1px] hover:blur-0' : ''}`}>
                <div className="xl:col-span-8">
                    <ScriptInput onAnalyze={handleAnalyze} isAnalyzing={project.status === 'analyzing'} />
                </div>
                <div className="xl:col-span-4 flex flex-col gap-6">
                    <Moodboard 
                        referenceImage={project.modules.outline} 
                        onUpdate={(img) => setProject(p => ({ ...p, modules: { ...p.modules, outline: img } }))} 
                        onClear={() => setProject(p => ({ ...p, modules: { ...p.modules, outline: undefined } }))} 
                    />
                    <div className="nm-panel p-8 flex-1 flex flex-col justify-center border border-white/5 bg-black/20">
                         <div className="flex items-center gap-4 mb-6">
                             <i className="fa-solid fa-sliders text-luna-gold"></i>
                             <h4 className="text-[10px] font-black text-white uppercase tracking-widest">Aesthetic Protocol</h4>
                         </div>
                         <div className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[8px] text-mystic-gray uppercase font-black">Global Style Vector</label>
                                <select value={project.globalStyle} onChange={e => setProject(p => ({...p, globalStyle: e.target.value}))} className="w-full bg-eclipse-black border border-white/10 rounded-xl px-4 py-3 text-[10px] text-white font-black uppercase tracking-widest outline-none nm-inset-input shadow-inner">{VISUAL_STYLES.map(s => <option key={s} value={s}>{s}</option>)}</select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[8px] text-mystic-gray uppercase font-black">Aspect Ratio</label>
                                <select value={aspectRatio} onChange={e => setAspectRatio(e.target.value as any)} className="w-full bg-eclipse-black border border-white/10 rounded-xl px-4 py-3 text-[10px] text-luna-gold font-black uppercase tracking-widest outline-none nm-inset-input shadow-inner"><option value={AspectRatio.LANDSCAPE}>16:9 Cinema</option><option value={AspectRatio.PORTRAIT}>9:16 Shorts</option><option value={AspectRatio.SQUARE}>1:1 Social</option></select>
                            </div>
                         </div>
                    </div>
                </div>
            </div>

            {/* STAGE 2: MANIFEST (Cast & Timeline) */}
            {project.scenes.length > 0 && (
                <div className="space-y-10 animate-in slide-in-from-bottom-10 duration-1000">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
                        <div className="lg:col-span-4 flex flex-col gap-6">
                            <CastEnsemble characters={project.characters} onEdit={setEditingCharacter} onAdd={() => {}} onAudit={() => setShowAuditor(true)} />
                            <div className="nm-panel p-8 border border-white/5 bg-black/40">
                                <h4 className="text-[10px] font-black text-white uppercase tracking-widest mb-6 flex items-center gap-3">
                                    <i className="fa-solid fa-stethoscope text-luna-gold"></i> Directorial Audit
                                </h4>
                                <div className="space-y-4">
                                    <button 
                                        onClick={handleRunFullAudit}
                                        disabled={isBatchProcessing}
                                        className="w-full nm-button p-4 rounded-2xl flex items-center justify-between group hover:border-luna-gold/30 transition-all border border-white/5"
                                    >
                                        <span className="text-[9px] font-black uppercase tracking-widest text-mystic-gray group-hover:text-white">Run Continuity Scan</span>
                                        <i className="fa-solid fa-chevron-right text-[10px] text-luna-gold transition-transform group-hover:translate-x-1"></i>
                                    </button>
                                    <button 
                                        onClick={() => setShowScriptDoctor(true)}
                                        className="w-full nm-button p-4 rounded-2xl flex items-center justify-between group hover:border-solar-amber/30 transition-all border border-white/5"
                                    >
                                        <span className="text-[9px] font-black uppercase tracking-widest text-mystic-gray group-hover:text-white">Narrative Diagnostic</span>
                                        <i className="fa-solid fa-chevron-right text-[10px] text-solar-amber transition-transform group-hover:translate-x-1"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div className="lg:col-span-8 space-y-6">
                            <ProductionTimeline scenes={project.scenes} assets={project.assets} onSelectScene={scrollToScene} />
                            
                            <div className="flex flex-wrap sm:flex-nowrap gap-4">
                                <button onClick={() => setShowStoryboard(true)} className="flex-1 min-w-[120px] py-6 nm-panel flex flex-col items-center justify-center gap-3 border border-white/5 hover:border-luna-gold/20 transition-all group">
                                    <i className="fa-solid fa-grip text-luna-gold text-xl group-hover:scale-110 transition-transform"></i>
                                    <span className="text-[10px] font-black text-white uppercase tracking-widest">Storyboard View</span>
                                </button>
                                <button onClick={() => setShowAssetLibrary(true)} className="flex-1 min-w-[120px] py-6 nm-panel flex flex-col items-center justify-center gap-3 border border-white/5 hover:border-solar-amber/20 transition-all group">
                                    <i className="fa-solid fa-photo-film text-solar-amber text-xl group-hover:scale-110 transition-transform"></i>
                                    <span className="text-[10px] font-black text-white uppercase tracking-widest">Asset Registry</span>
                                </button>
                                <button onClick={() => setShowManifest(true)} className="flex-1 min-w-[120px] py-6 nm-panel flex flex-col items-center justify-center gap-3 border border-white/5 hover:border-deep-sage/20 transition-all group">
                                    <i className="fa-solid fa-file-invoice text-deep-sage text-xl group-hover:scale-110 transition-transform"></i>
                                    <span className="text-[10px] font-black text-white uppercase tracking-widest">Production Protocol</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* STAGE 3: SYNTHESIS (Scene Grid) */}
                    <section className="space-y-10">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end border-b border-white/5 pb-8 gap-4">
                            <div>
                                <h3 className="text-3xl font-black text-white uppercase tracking-tighter font-mono italic">Neural Synthesis Lab</h3>
                                <p className="text-[10px] text-mystic-gray uppercase font-bold tracking-[0.3em] mt-2">Manifesting visual and auditory temporal takes</p>
                            </div>
                            <div className="flex gap-4">
                                <button onClick={handleManifestAll} disabled={isBatchProcessing} className="px-10 py-4 nm-button-gold text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl shadow-nm-gold hover:scale-105 active:scale-95 transition-all flex items-center gap-4">
                                    <i className="fa-solid fa-bolt-lightning animate-pulse"></i> Initialize Batch Manifest
                                </button>
                                <button onClick={() => setShowMixer(true)} className="w-14 h-14 nm-button rounded-2xl flex items-center justify-center text-solar-amber border border-white/5 hover:text-white transition-all shadow-xl">
                                    <i className="fa-solid fa-sliders"></i>
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
                            {project.scenes.map((scene, idx) => (
                                <div key={scene.id} id={`scene-${scene.id}`} className="relative group/card-container transition-all hover:scale-[1.02] duration-500">
                                    <SceneCard 
                                        index={idx} totalScenes={project.scenes.length} scene={scene} asset={project.assets[scene.id]} characters={project.characters}
                                        onGenerate={handleGenerateSceneAsset} 
                                        onExtend={handleExtendScene}
                                        onUpdate={(id, s) => setProject(p => ({ ...p, scenes: p.scenes.map(sc => sc.id === id ? s : sc) }))}
                                        onMove={(dir) => handleMoveScene(scene.id, dir)} 
                                        onDelete={(id) => setProject(p => ({ ...p, scenes: p.scenes.filter(s => s.id !== id) }))} 
                                        onDuplicate={() => setProject(p => ({ ...p, scenes: [...p.scenes, { ...scene, id: Date.now() }] }))} 
                                        onInspect={setInspectingScene} 
                                        onSelectVariant={handleSelectVariant}
                                        onClearAsset={handleClearAsset}
                                        isProcessing={project.assets[scene.id]?.status.startsWith('generating')} globalStyle={project.globalStyle}
                                    />
                                    {project.assets[scene.id]?.imageUrl && (
                                        <button 
                                            onClick={() => handleSetKeyArt(scene.id)}
                                            className={`absolute top-4 right-4 z-20 w-8 h-8 rounded-lg flex items-center justify-center transition-all ${project.keyArtSceneId === scene.id ? 'bg-luna-gold text-white shadow-nm-gold' : 'nm-button bg-black/60 text-mystic-gray hover:text-white opacity-0 group-hover/card-container:opacity-100'}`}
                                            title="Set as Master Style Reference"
                                        >
                                            <i className="fa-solid fa-camera-retro text-[10px]"></i>
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* STAGE 4: POST-PRODUCTION (Mastering & Distribution) */}
                    <section className="space-y-10 py-10">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end border-b border-white/5 pb-8 gap-4">
                             <div>
                                <h3 className="text-3xl font-black text-white uppercase tracking-tighter font-mono italic">Post-Production & Release</h3>
                                <p className="text-[10px] text-mystic-gray uppercase font-bold tracking-[0.3em] mt-2">Neural mastering and distribution multipliers</p>
                            </div>
                            <button onClick={() => setShowMastering(true)} className="px-8 py-3 nm-button text-luna-gold border border-luna-gold/20 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-luna-gold hover:text-white transition-all flex items-center gap-3">
                                <i className="fa-solid fa-wand-magic-sparkles"></i> Open VFX Synthesis Lab
                            </button>
                        </div>

                        {youtubeMetadata && (
                            <YouTubeOptimizer 
                                metadata={youtubeMetadata} 
                                script={project.script} 
                                characters={project.characters} 
                                globalStyle={project.globalStyle || "Cinematic"}
                                viralData={project.viralData}
                                onUpdateViral={(data) => setProject(p => ({ ...p, viralData: data }))}
                            />
                        )}

                        <div className="flex justify-center pt-20">
                             <div className="w-full max-w-4xl nm-panel p-10 sm:p-16 rounded-[4rem] border border-white/5 relative overflow-hidden bg-gradient-to-t from-luna-gold/5 to-transparent flex flex-col items-center text-center shadow-2xl">
                                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-16 bg-gradient-to-b from-luna-gold to-transparent opacity-40"></div>
                                <h4 className="text-2xl font-black text-white uppercase tracking-widest font-mono italic mb-6">Master Production Unit</h4>
                                <p className="text-sm text-celestial-stone max-w-lg mb-12 font-light">The neural tracks are ready for final merge. Initializing the export will compile all visual takes, audio signals, and VFX mastering into a single master distribution unit.</p>
                                
                                <div className="flex flex-col sm:flex-row gap-6 w-full sm:w-auto">
                                    <button 
                                        onClick={() => setShowPlayer(true)} 
                                        className="px-12 py-5 nm-button text-starlight rounded-2xl font-black uppercase tracking-[0.3em] text-[10px] hover:bg-white/5 transition-all flex items-center justify-center gap-4 border border-white/10"
                                    >
                                        <i className="fa-solid fa-desktop"></i> Pre-Production Review
                                    </button>
                                    <button 
                                        onClick={() => setShowRenderer(true)} 
                                        disabled={!isAllComplete}
                                        className="px-16 py-5 bg-gold-gradient text-white rounded-2xl font-black uppercase tracking-[0.3em] text-[10px] shadow-nm-gold hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-4 disabled:opacity-30 disabled:hover:scale-100"
                                    >
                                        <i className="fa-solid fa-clapperboard"></i> Initialize Master Export
                                    </button>
                                </div>
                             </div>
                        </div>
                    </section>
                </div>
            )}
          </div>
        )}
      </div>

      {/* OVERRIDEBOT SIDEBAR */}
      <aside 
        className={`
          fixed right-0 top-0 bottom-0 z-[150] w-full md:w-[450px] xl:w-[25%] bg-eclipse-black shadow-2xl transition-all duration-500 ease-in-out transform border-l border-white/5
          ${chatOpen ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0 pointer-events-none'}
          flex flex-col pt-24 pb-8 px-6 space-y-8
        `}
      >
        <div className="flex-1 min-h-0">
           <DirectorAssistant 
              project={project} 
              onUpdateProject={updates => setProject(p => ({ ...p, ...updates }))}
              onExecuteTool={handleToolExecution}
              autoTriggerDiagnosis={autoDiagnosisTriggered && chatOpen}
           />
        </div>
        
        <div className="nm-panel p-6 rounded-3xl border-white/5 flex flex-col gap-4 bg-black/40">
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-[9px] font-black text-mystic-gray uppercase tracking-[0.3em] flex items-center gap-2"><i className="fa-solid fa-terminal text-luna-gold"></i> Live Console</h3>
                <span className="text-[7px] font-mono text-mystic-gray opacity-30">SIGNAL_M_001</span>
            </div>
            <div className="space-y-2 max-h-32 overflow-y-auto scrollbar-hide pr-1">
              {project.productionLog.slice(0, 5).map(log => (
                <div key={log.id} className="text-[8px] font-mono leading-relaxed border-l-2 border-white/5 pl-2 py-1 flex gap-3">
                  <span className="text-mystic-gray opacity-40 shrink-0">{new Date(log.timestamp).toLocaleTimeString([], { hour12: false })}</span>
                  <span className={`truncate ${log.type === 'error' ? 'text-solar-amber' : log.type === 'ai_suggestion' ? 'text-luna-gold' : 'text-celestial-stone'}`}>
                    {log.message}
                  </span>
                </div>
              ))}
            </div>
        </div>

        <button onClick={() => setChatOpen(false)} className="absolute top-28 right-8 w-11 h-11 nm-button rounded-full flex items-center justify-center text-mystic-gray hover:text-white transition-all xl:hidden border border-white/10 shadow-lg">
            <i className="fa-solid fa-chevron-right"></i>
        </button>
      </aside>

      {/* MODALS */}
      {editingCharacter && <CharacterModal character={editingCharacter} onClose={() => setEditingCharacter(null)} onSave={handleCharacterSave} onRegenerateImage={async (id) => { const char = project.characters.find(c => c.id === id)!; const img = await generateCharacterImage(char, resolution, project.globalStyle!, project.productionSeed); handleCharacterSave({ ...char, referenceImageBase64: img }); }} />}
      {inspectingScene && <SceneInspector scene={inspectingScene} characters={project.characters} assetImage={project.assets[inspectingScene.id]?.imageUrl} onUpdate={s => setProject(p => ({ ...p, scenes: p.scenes.map(sc => sc.id === s.id ? s : sc) }))} onClose={() => setInspectingScene(null)} />}
      {showAssetLibrary && <AssetLibrary assets={project.assets} scenes={project.scenes} onClose={() => setShowAssetLibrary(false)} onSelect={scrollToScene} />}
      {showMixer && <AudioMixer mastering={project.mastering} onUpdate={u => setProject(p => ({ ...p, mastering: { ...p.mastering!, ...u } }))} onClose={() => setShowMixer(false)} />}
      {showAuditor && <ContinuityAuditor project={project} onSyncPrompts={(id, prompt) => setProject(p => ({ ...p, scenes: p.scenes.map(s => s.charactersInScene.includes(p.characters.find(c => c.id === id)!.name) ? { ...s, visualPrompt: `${s.visualPrompt}. (Reference: ${prompt})` } : s) }))} onClose={() => setShowAuditor(false)} />}
      {showDeck && <DirectorialDeck project={project} onClose={() => setShowDeck(false)} />}
      {showBRoll && <BRollSuggestionModal suggestions={bRollSuggestions} onAccept={handleAddBRoll} onClose={() => setShowBRoll(false)} />}
      {showStoryboard && <StoryboardView scenes={project.scenes} assets={project.assets} onSelectScene={scrollToScene} onClose={() => setShowStoryboard(false)} />}
      {showScriptDoctor && <ScriptDoctor project={project} onClose={() => setShowScriptDoctor(false)} />}
      {showMastering && <VFXMaster mastering={project.mastering} cinematicProfile={project.cinematicProfile} onUpdateMastering={u => setProject(p => ({ ...p, mastering: { ...p.mastering!, ...u } }))} onUpdateProfile={p => setProject(prev => ({ ...prev, cinematicProfile: p }))} onClose={() => setShowMastering(false)} />}
      {project.activeDraft && <DirectorDraftModal draft={project.activeDraft} scenes={project.scenes} onApply={handleApplyDraft} onDiscard={() => setProject(p => ({ ...p, activeDraft: null }))} />}
      {showPlayer && <Player scenes={project.scenes} assets={project.assets} mastering={project.mastering} onClose={() => setShowPlayer(false)} />}
      {showRenderer && <Renderer scenes={project.scenes} assets={project.assets} resolution={resolution} aspectRatio={aspectRatio} globalStyle={project.globalStyle || "Cinematic"} mastering={project.mastering} cinematicProfile={project.cinematicProfile} onCancel={() => setShowRenderer(false)} onComplete={() => {}} />}
      {showManifest && <ProductionManifest project={project} youtubeMetadata={youtubeMetadata} onClose={() => setShowManifest(false)} />}

      <ProductionMonitor isActive={isBatchProcessing} scenes={project.scenes} assets={project.assets} currentTask={currentTaskLabel} />
    </Layout>
  );
};

export default App;
