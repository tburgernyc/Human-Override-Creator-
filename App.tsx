
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
import { ErrorBoundary } from './components/ErrorBoundary';
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
  extendSceneVideo,
  validateImage,
  validateVideo,
  validateAudio
} from './services/gemini';
import { VOICE_PRESETS, VISUAL_STYLES } from './constants';

const LOCAL_STORAGE_KEY = 'human_override_active_project_v8';
const LEGACY_STORAGE_KEY = 'human_override_active_project_v7';
const ALL_PROJECTS_KEY = 'human_override_archives_v5';
const BATCH_QUEUE_KEY = 'human_override_batch_queue_v1';

interface BatchQueue {
  pending: number[]; // Scene IDs pending generation
  completed: number[]; // Scene IDs already completed
  failed: number[]; // Scene IDs that failed
  totalScenes: number;
  timestamp: number;
}

type ProductionPhase = 'genesis' | 'manifest' | 'synthesis' | 'post';

const App: React.FC = () => {
  const DEFAULT_PROJECT: ProjectState = {
    script: '', status: 'idle', characters: [], scenes: [], assets: {}, tasks: [], modules: {}, productionLog: [],
    currentStepMessage: '', globalStyle: VISUAL_STYLES[0], productionSeed: Math.floor(Math.random() * 1000000),
    activeDraft: null,
    mastering: {
      musicVolume: 15, voiceVolume: 100, ambientVolume: 30, filmGrain: 5,
      bloomIntensity: 10, vignetteIntensity: 30, lightLeakIntensity: 20, filmBurnIntensity: 10, lutPreset: 'none'
    }
  };

  // Migrate from v7 to v8
  const migrateProjectFromV7 = (v7Project: any): ProjectState => {
    console.log('📦 Migrating project from v7 to v8...');

    // Validate and fix asset statuses
    if (v7Project.assets) {
      for (const key of Object.keys(v7Project.assets)) {
        const asset = v7Project.assets[key];

        // If asset has audio error details but status is complete, mark as error
        if (asset.status === 'complete' && asset.error && asset.error.includes('Audio partial')) {
          asset.status = 'error';
        }

        // Reset stuck generating states
        if (asset.status && asset.status.startsWith('generating_')) {
          asset.status = asset.imageUrl || asset.videoUrl || asset.audioUrl ? 'complete' : 'pending';
        }
      }
    }

    // Reset analyzing status
    if (v7Project.status === 'analyzing') {
      v7Project.status = v7Project.scenes?.length > 0 ? 'ready' : 'idle';
    }

    console.log('✅ Migration complete');
    return v7Project;
  };

  const [project, setProject] = useState<ProjectState>(() => {
    try {
      // First try v8
      let saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        console.log('Loaded project from v8 storage');
        return parsed;
      }

      // Try to migrate from v7
      saved = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (saved) {
        const v7Project = JSON.parse(saved);
        const migratedProject = migrateProjectFromV7(v7Project);

        // Save migrated project to v8
        try {
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(migratedProject));
          // Keep v7 as backup for one session
          console.log('v7 project backed up, migrated to v8');
        } catch (e) {
          console.warn('Failed to save migrated project:', e);
        }

        return migratedProject;
      }
    } catch (e) {
      console.warn('Corrupted project data in localStorage, resetting to defaults.', e);
      localStorage.removeItem(LOCAL_STORAGE_KEY);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    }
    return DEFAULT_PROJECT;
  });

  const [archives, setArchives] = useState<ProjectState[]>(() => {
    try {
      const saved = localStorage.getItem(ALL_PROJECTS_KEY);
      return typeof saved === 'string' ? JSON.parse(saved) : [];
    } catch (e) {
      console.warn('Corrupted archives data in localStorage, resetting.', e);
      localStorage.removeItem(ALL_PROJECTS_KEY);
      return [];
    }
  });

  const [view, setView] = useState<'landing' | 'dashboard' | 'projects'>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      return saved && JSON.parse(saved).script ? 'dashboard' : 'landing';
    } catch {
      return 'landing';
    }
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
  const batchCancellationRef = useRef(false);
  const [youtubeMetadata, setYoutubeMetadata] = useState<any | null>(null);
  const [autoDiagnosisTriggered, setAutoDiagnosisTriggered] = useState(false);
  const [pendingBatchQueue, setPendingBatchQueue] = useState<BatchQueue | null>(null);
  const [showResumeDialog, setShowResumeDialog] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const activePhase: ProductionPhase = !project.script ? 'genesis' : project.scenes.length === 0 ? 'genesis' : !Object.values(project.assets).some(a => a.status === 'complete') ? 'manifest' : project.scenes.every(s => project.assets[s.id]?.status === 'complete') ? 'post' : 'synthesis';
  const isAllComplete = project.scenes.length > 0 && project.scenes.every(s => project.assets[s.id]?.status === 'complete');

  useEffect(() => {
    const checkAuth = async () => { if (window.aistudio) setHasAuth(await window.aistudio.hasSelectedApiKey()); else setHasAuth(true); };
    checkAuth();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(project));
    } catch (e: any) {
      if (e?.name === 'QuotaExceededError' || e?.code === 22) {
        console.warn('localStorage quota exceeded — saving project without large asset data.');
        try {
          const slimAssets: Record<string, any> = {};
          for (const [key, asset] of Object.entries(project.assets)) {
            slimAssets[key] = { ...asset, imageUrl: undefined, videoUrl: undefined, audioUrl: undefined };
          }
          const slimCharacters = project.characters.map(c => ({ ...c, referenceImageBase64: undefined }));
          const slimProject = { ...project, assets: slimAssets, characters: slimCharacters };
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(slimProject));
        } catch {
          console.warn('localStorage still full after stripping assets. Project state saved in memory only.');
        }
      }
    }
  }, [project]);

  useEffect(() => {
    try {
      localStorage.setItem(ALL_PROJECTS_KEY, JSON.stringify(archives));
    } catch (e: any) {
      console.warn('localStorage quota exceeded for archives — skipping archive save.');
    }
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

  // Batch queue management functions
  const saveBatchQueue = (queue: BatchQueue) => {
    try {
      localStorage.setItem(BATCH_QUEUE_KEY, JSON.stringify(queue));
    } catch (e) {
      console.warn('Failed to save batch queue:', e);
    }
  };

  const loadBatchQueue = (): BatchQueue | null => {
    try {
      const saved = localStorage.getItem(BATCH_QUEUE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      console.warn('Failed to load batch queue:', e);
      return null;
    }
  };

  const clearBatchQueue = () => {
    try {
      localStorage.removeItem(BATCH_QUEUE_KEY);
      setPendingBatchQueue(null);
    } catch (e) {
      console.warn('Failed to clear batch queue:', e);
    }
  };

  // Check for pending batch queue on load
  useEffect(() => {
    const queue = loadBatchQueue();
    if (queue && queue.pending.length > 0) {
      // Only show resume dialog if the queue is recent (within 24 hours)
      const hoursSinceLastBatch = (Date.now() - queue.timestamp) / (1000 * 60 * 60);
      if (hoursSinceLastBatch < 24) {
        setPendingBatchQueue(queue);
        setShowResumeDialog(true);
      } else {
        // Clear stale queue
        clearBatchQueue();
      }
    }
  }, []); // Run once on mount

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
    } else if (name === 'update_character') {
      const { character_name, voiceId, description, visualPrompt, voiceSpeed, voicePitch } = args;
      setProject(p => ({
        ...p,
        characters: p.characters.map(c => {
          if (c.name.toLowerCase() !== character_name.toLowerCase()) return c;
          const updates: Partial<Character> = {};
          if (voiceId) updates.voiceId = voiceId;
          if (description) updates.description = description;
          if (visualPrompt) updates.visualPrompt = visualPrompt;
          if (voiceSpeed !== undefined || voicePitch !== undefined) {
            updates.voiceSettings = {
              speed: voiceSpeed ?? c.voiceSettings?.speed ?? 1,
              pitch: voicePitch ?? c.voiceSettings?.pitch ?? 0
            };
          }
          return { ...c, ...updates };
        })
      }));
      addLog(`Character "${character_name}" updated by Director.`, "ai_suggestion");
      return `Character "${character_name}" updated successfully.`;
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
      setChatOpen(true);
    } catch (error: any) {
      const msg = error?.message || String(error);
      console.error('[handleAnalyze] Script analysis failed:', error);
      addLog(`Analysis failure: ${msg}`, "error");
      setProject(prev => ({ ...prev, status: prev.scenes.length > 0 ? 'ready' : 'idle' }));
    }
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

      // Validate image
      const imageValidation = validateImage(img);
      if (!imageValidation.valid) {
        throw new Error(`Image validation failed: ${imageValidation.error}`);
      }

      setProject(prev => ({ ...prev, assets: { ...prev.assets, [sceneId]: { ...prev.assets[sceneId], imageUrl: img, status: 'generating_video' } } }));

      const video = await generateSceneVideo(img, scene.visualPrompt, aspectRatio, resolution, project.globalStyle);

      // Validate video
      const videoValidation = validateVideo(video);
      if (!videoValidation.valid) {
        throw new Error(`Video validation failed: ${videoValidation.error}`);
      }

      const audioResult = await generateSceneAudio(scene.narratorLines, project.characters);

      // Validate audio
      const audioValidation = validateAudio(audioResult.audioUrl);
      if (!audioValidation.valid) {
        throw new Error(`Audio validation failed: ${audioValidation.error}`);
      }

      const finalVariant: AssetHistoryItem = { imageUrl: img, videoUrl: video, timestamp: Date.now() };

      setProject(prev => {
        const currentAsset = prev.assets[sceneId];
        const hasAudioErrors = audioResult.hasErrors;
        const errorMessage = hasAudioErrors
          ? `Audio partial: ${audioResult.errorDetails?.length || 0} line(s) failed. ${audioResult.errorDetails?.join('; ') || ''}`
          : undefined;

        return {
          ...prev,
          assets: {
            ...prev.assets,
            [sceneId]: {
              ...currentAsset,
              imageUrl: img,
              videoUrl: video,
              audioUrl: audioResult.audioUrl,
              status: hasAudioErrors ? 'error' : 'complete',
              error: errorMessage,
              variants: [finalVariant, ...(currentAsset?.variants || [])].slice(0, 5)
            }
          }
        };
      });

      if (audioResult.hasErrors) {
        addLog(`Scene #${sceneId} completed with audio errors: ${audioResult.errorDetails?.length || 0} dialogue line(s) failed`, "error");
      }
    } catch (error: any) {
      const errMsg = error?.message || String(error);
      addLog(`Sequence generation failed for Scene #${sceneId}: ${errMsg.substring(0, 100)}`, "error");
      console.error(`[SceneAsset] Scene ${sceneId} failed:`, error);
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

  const handleRetryImage = async (sceneId: number) => {
    const scene = project.scenes.find(s => s.id === sceneId);
    const asset = project.assets[sceneId];
    if (!scene) return;

    addLog(`Retrying image generation for Scene #${project.scenes.indexOf(scene) + 1}`, "system");
    setProject(prev => ({
      ...prev,
      assets: {
        ...prev.assets,
        [sceneId]: { ...asset, status: 'generating_image', error: undefined }
      }
    }));

    try {
      const moodboardImg = project.modules.outline;
      const keyArtImg = project.keyArtSceneId ? project.assets[project.keyArtSceneId]?.imageUrl : undefined;
      const styleRef = moodboardImg || keyArtImg;

      const img = await generateSceneImage(scene, project.characters, aspectRatio, resolution, undefined, project.globalStyle, project.productionSeed, styleRef);

      // Validate image
      const imageValidation = validateImage(img);
      if (!imageValidation.valid) {
        throw new Error(`Image validation failed: ${imageValidation.error}`);
      }

      setProject(prev => ({
        ...prev,
        assets: {
          ...prev.assets,
          [sceneId]: {
            ...prev.assets[sceneId],
            imageUrl: img,
            status: 'complete',
            error: undefined
          }
        }
      }));
      addLog(`Image regeneration complete for Scene #${sceneId}`, "success");
    } catch (error: any) {
      const errMsg = error?.message || String(error);
      addLog(`Image retry failed for Scene #${sceneId}: ${errMsg.substring(0, 100)}`, "error");
      setProject(prev => ({
        ...prev,
        assets: {
          ...prev.assets,
          [sceneId]: {
            ...prev.assets[sceneId],
            status: 'error',
            error: `Image generation failed: ${errMsg}`
          }
        }
      }));
    }
  };

  const handleRetryVideo = async (sceneId: number) => {
    const scene = project.scenes.find(s => s.id === sceneId);
    const asset = project.assets[sceneId];
    if (!scene || !asset?.imageUrl) {
      addLog(`Cannot retry video: image required for Scene #${sceneId}`, "error");
      return;
    }

    addLog(`Retrying video generation for Scene #${project.scenes.indexOf(scene) + 1}`, "system");
    setProject(prev => ({
      ...prev,
      assets: {
        ...prev.assets,
        [sceneId]: { ...asset, status: 'generating_video', error: undefined }
      }
    }));

    try {
      const video = await generateSceneVideo(asset.imageUrl, scene.visualPrompt, aspectRatio, resolution, project.globalStyle);

      // Validate video
      const videoValidation = validateVideo(video);
      if (!videoValidation.valid) {
        throw new Error(`Video validation failed: ${videoValidation.error}`);
      }

      setProject(prev => ({
        ...prev,
        assets: {
          ...prev.assets,
          [sceneId]: {
            ...prev.assets[sceneId],
            videoUrl: video,
            status: 'complete',
            error: undefined
          }
        }
      }));
      addLog(`Video regeneration complete for Scene #${sceneId}`, "success");
    } catch (error: any) {
      const errMsg = error?.message || String(error);
      addLog(`Video retry failed for Scene #${sceneId}: ${errMsg.substring(0, 100)}`, "error");
      setProject(prev => ({
        ...prev,
        assets: {
          ...prev.assets,
          [sceneId]: {
            ...prev.assets[sceneId],
            status: 'error',
            error: `Video generation failed: ${errMsg}`
          }
        }
      }));
    }
  };

  const handleRetryAudio = async (sceneId: number) => {
    const scene = project.scenes.find(s => s.id === sceneId);
    const asset = project.assets[sceneId];
    if (!scene) return;

    addLog(`Retrying audio generation for Scene #${project.scenes.indexOf(scene) + 1}`, "system");
    setProject(prev => ({
      ...prev,
      assets: {
        ...prev.assets,
        [sceneId]: { ...asset, status: 'generating_audio', error: undefined }
      }
    }));

    try {
      const audioResult = await generateSceneAudio(scene.narratorLines, project.characters);

      // Validate audio
      const audioValidation = validateAudio(audioResult.audioUrl);
      if (!audioValidation.valid) {
        throw new Error(`Audio validation failed: ${audioValidation.error}`);
      }

      const hasAudioErrors = audioResult.hasErrors;
      const errorMessage = hasAudioErrors
        ? `Audio partial: ${audioResult.errorDetails?.length || 0} line(s) failed. ${audioResult.errorDetails?.join('; ') || ''}`
        : undefined;

      setProject(prev => ({
        ...prev,
        assets: {
          ...prev.assets,
          [sceneId]: {
            ...prev.assets[sceneId],
            audioUrl: audioResult.audioUrl,
            status: hasAudioErrors ? 'error' : 'complete',
            error: errorMessage
          }
        }
      }));

      if (hasAudioErrors) {
        addLog(`Audio regeneration completed with errors for Scene #${sceneId}: ${audioResult.errorDetails?.length || 0} line(s) failed`, "error");
      } else {
        addLog(`Audio regeneration complete for Scene #${sceneId}`, "success");
      }
    } catch (error: any) {
      const errMsg = error?.message || String(error);
      addLog(`Audio retry failed for Scene #${sceneId}: ${errMsg.substring(0, 100)}`, "error");
      setProject(prev => ({
        ...prev,
        assets: {
          ...prev.assets,
          [sceneId]: {
            ...prev.assets[sceneId],
            status: 'error',
            error: `Audio generation failed: ${errMsg}`
          }
        }
      }));
    }
  };

  const handleCharacterSave = async (char: Character) => {
    // Check if this is a new character (not in project yet)
    const isNew = !project.characters.find(c => c.id === char.id);

    if (isNew) {
      // Add new character to project
      setProject(p => ({ ...p, characters: [...p.characters, char] }));
      addLog(`New character "${char.name}" added to cast.`, "success");
    } else {
      // Update existing character
      setProject(p => ({ ...p, characters: p.characters.map(c => c.id === char.id ? char : c) }));
      addLog(`Character profile "${char.name}" updated.`, "system");
    }

    setEditingCharacter(null);
  };

  const handleAddCharacter = () => {
    // Create new character template
    const newCharacter: Character = {
      id: `char_${Date.now()}`,
      name: "New Character",
      description: "",
      gender: "Female",
      visualPrompt: "",
      voiceId: VOICE_PRESETS[0].id,
      voiceSettings: { speed: 1, pitch: 0 }
    };

    setEditingCharacter(newCharacter);
    addLog("Opening character creator...", "system");
  };

  const handleManifestAll = async (resumeQueue?: BatchQueue) => {
    if (isBatchProcessing) return;

    // Reset cancellation flag and start batch processing
    batchCancellationRef.current = false;
    setIsBatchProcessing(true);
    addLog(resumeQueue ? "Resuming batch generation..." : "Batch Manifesting Sequence Initialized...", "system");

    const RATE_LIMIT_DELAY = 3000; // 3s between scenes to avoid API quota issues
    const MAX_RETRIES = 2;

    // Initialize or resume queue
    let queue: BatchQueue;
    if (resumeQueue) {
      queue = resumeQueue;
      addLog(`Resuming: ${queue.completed.length} done, ${queue.pending.length} remaining`, "system");
    } else {
      const allSceneIds = project.scenes.map(s => s.id);
      queue = {
        pending: allSceneIds,
        completed: [],
        failed: [],
        totalScenes: allSceneIds.length,
        timestamp: Date.now()
      };
      saveBatchQueue(queue);
    }

    const failedScenes: number[] = [];
    let cancelledAt = -1;

    try {
      for (let i = 0; i < project.scenes.length; i++) {
        // Check for cancellation
        if (batchCancellationRef.current) {
          cancelledAt = i;
          addLog(`Batch processing cancelled at scene ${i + 1}`, "error");
          break;
        }

        const scene = project.scenes[i];

        // Skip if not in pending queue (already completed or failed in previous session)
        if (!queue.pending.includes(scene.id)) {
          addLog(`Scene #${i + 1} already processed, skipping...`, "system");
          continue;
        }

        // Check if scene is already complete using functional state update
        const assetStatus = await new Promise<string>((resolve) => {
          setProject(prev => {
            resolve(prev.assets[scene.id]?.status || 'pending');
            return prev; // No state change, just reading
          });
        });

        if (assetStatus === 'complete') {
          // Update queue
          queue.pending = queue.pending.filter(id => id !== scene.id);
          queue.completed.push(scene.id);
          saveBatchQueue(queue);
          addLog(`Scene #${i + 1} already complete, skipping...`, "system");
          continue;
        }

        setCurrentTaskLabel(`Manifesting Sequence #${i + 1} of ${project.scenes.length}: ${scene.description.substring(0, 30)}...`);
        addLog(`Generating Scene #${i + 1}...`, "system");

        let success = false;
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          // Check for cancellation before retry
          if (batchCancellationRef.current) {
            cancelledAt = i;
            break;
          }

          if (attempt > 0) {
            addLog(`Retrying Scene #${i + 1} (attempt ${attempt + 1}/${MAX_RETRIES + 1})...`, "system");
            await new Promise(r => setTimeout(r, RATE_LIMIT_DELAY * 2)); // longer delay before retry
          }

          try {
            await handleGenerateSceneAsset(scene.id);

            // Check if it succeeded
            const finalStatus = await new Promise<string>((resolve) => {
              setProject(prev => {
                resolve(prev.assets[scene.id]?.status || 'unknown');
                return prev;
              });
            });

            if (finalStatus === 'complete') {
              success = true;
              addLog(`Scene #${i + 1} generated successfully`, "success");
              // Update queue
              queue.pending = queue.pending.filter(id => id !== scene.id);
              queue.completed.push(scene.id);
              saveBatchQueue(queue);
              break;
            } else if (finalStatus === 'error') {
              addLog(`Scene #${i + 1} generation failed with error`, "error");
              // Don't break, allow retries
            }
          } catch (error) {
            console.error(`Scene ${i + 1} generation error:`, error);
          }
        }

        if (!success && !batchCancellationRef.current) {
          failedScenes.push(i + 1);
          // Update queue with failed scene
          queue.pending = queue.pending.filter(id => id !== scene.id);
          queue.failed.push(scene.id);
          saveBatchQueue(queue);
        }

        // Rate-limit delay between scenes (skip if cancelled or last scene)
        if (i < project.scenes.length - 1 && !batchCancellationRef.current) {
          await new Promise(r => setTimeout(r, RATE_LIMIT_DELAY));
        }
      }
    } finally {
      // Always cleanup, even if error occurs
      setIsBatchProcessing(false);
      setCurrentTaskLabel("");
      batchCancellationRef.current = false;
    }

    // Report results
    if (cancelledAt >= 0) {
      addLog(`Batch processing cancelled. Progress saved. ${queue.pending.length} scenes remaining.`, "error");
      // Keep queue for resume
    } else if (failedScenes.length > 0) {
      addLog(`Batch manifest complete with ${failedScenes.length} failures: Scenes ${failedScenes.join(', ')}. You can retry them individually.`, "error");
      clearBatchQueue(); // Clear queue even with failures (user can manually retry)
    } else {
      addLog("Full sequence manifest complete. All scenes generated successfully.", "success");
      clearBatchQueue(); // Clear queue on success
    }
  };

  // Add cancel batch processing function
  const handleCancelBatch = () => {
    if (isBatchProcessing) {
      batchCancellationRef.current = true;
      addLog("Cancelling batch processing...", "system");
    }
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

  const handleNavigatePhase = (section: string) => {
    // Scroll to the relevant section on the dashboard
    const sectionMap: Record<string, string> = {
      genesis: 'genesis-section',
      manifest: 'manifest-section',
      synthesis: 'synthesis-section',
      post: 'post-section'
    };
    const el = document.getElementById(sectionMap[section] || '');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
            <div id="genesis-section" className={`grid grid-cols-1 xl:grid-cols-12 gap-10 transition-all duration-700 ${activePhase !== 'genesis' ? 'opacity-50 hover:opacity-100 blur-[1px] hover:blur-0' : ''}`}>
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
                      <select value={project.globalStyle} onChange={e => setProject(p => ({ ...p, globalStyle: e.target.value }))} className="w-full bg-eclipse-black border border-white/10 rounded-xl px-4 py-3 text-[10px] text-white font-black uppercase tracking-widest outline-none nm-inset-input shadow-inner">{VISUAL_STYLES.map(s => <option key={s} value={s}>{s}</option>)}</select>
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
              <div id="manifest-section" className="space-y-10 animate-in slide-in-from-bottom-10 duration-1000">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
                  <div className="lg:col-span-4 flex flex-col gap-6">
                    <CastEnsemble characters={project.characters} onEdit={setEditingCharacter} onAdd={handleAddCharacter} onAudit={() => setShowAuditor(true)} />
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
                <section id="synthesis-section" className="space-y-10">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end border-b border-white/5 pb-8 gap-4">
                    <div>
                      <h3 className="text-3xl font-black text-white uppercase tracking-tighter font-mono italic">Neural Synthesis Lab</h3>
                      <p className="text-[10px] text-mystic-gray uppercase font-bold tracking-[0.3em] mt-2">Manifesting visual and auditory temporal takes</p>
                    </div>
                    <div className="flex gap-4">
                      {!isBatchProcessing ? (
                        <button onClick={handleManifestAll} className="px-10 py-4 nm-button-gold text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl shadow-nm-gold hover:scale-105 active:scale-95 transition-all flex items-center gap-4">
                          <i className="fa-solid fa-bolt-lightning animate-pulse"></i> Initialize Batch Manifest
                        </button>
                      ) : (
                        <button onClick={handleCancelBatch} className="px-10 py-4 bg-solar-amber/20 border border-solar-amber text-solar-amber text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl hover:bg-solar-amber/30 active:scale-95 transition-all flex items-center gap-4">
                          <i className="fa-solid fa-stop"></i> Cancel Batch
                        </button>
                      )}
                      <button onClick={() => setShowMixer(true)} className="w-14 h-14 nm-button rounded-2xl flex items-center justify-center text-solar-amber border border-white/5 hover:text-white transition-all shadow-xl">
                        <i className="fa-solid fa-sliders"></i>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
                    {project.scenes.map((scene, idx) => (
                      <ErrorBoundary key={scene.id}>
                        <div id={`scene-${scene.id}`} className="relative group/card-container transition-all hover:scale-[1.02] duration-500">
                          <SceneCard
                            index={idx} totalScenes={project.scenes.length} scene={scene} asset={project.assets[scene.id]} characters={project.characters}
                            onGenerate={handleGenerateSceneAsset}
                            onExtend={handleExtendScene}
                            onRetryImage={handleRetryImage}
                            onRetryVideo={handleRetryVideo}
                            onRetryAudio={handleRetryAudio}
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
                      </ErrorBoundary>
                    ))}
                  </div>
                </section>

                {/* STAGE 4: POST-PRODUCTION (Mastering & Distribution) */}
                <section id="post-section" className="space-y-10 py-10">
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
          <ErrorBoundary>
            <DirectorAssistant
              project={project}
              onUpdateProject={updates => setProject(p => ({ ...p, ...updates }))}
              onExecuteTool={handleToolExecution}
              autoTriggerDiagnosis={autoDiagnosisTriggered && chatOpen}
              currentPhase={activePhase}
              onNavigatePhase={handleNavigatePhase}
            />
          </ErrorBoundary>
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
      {showRenderer && (
        <ErrorBoundary>
          <Renderer scenes={project.scenes} assets={project.assets} resolution={resolution} aspectRatio={aspectRatio} globalStyle={project.globalStyle || "Cinematic"} mastering={project.mastering} cinematicProfile={project.cinematicProfile} onCancel={() => setShowRenderer(false)} onComplete={() => { }} />
        </ErrorBoundary>
      )}
      {showManifest && <ProductionManifest project={project} youtubeMetadata={youtubeMetadata} onClose={() => setShowManifest(false)} />}

      {/* Resume Batch Dialog */}
      {showResumeDialog && pendingBatchQueue && (
        <div className="fixed inset-0 z-[500] bg-eclipse-black/90 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-300">
          <div className="w-full max-w-lg nm-panel p-10 rounded-[3rem] border border-white/5 shadow-[0_50px_200px_rgba(0,0,0,0.9)]">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 nm-button rounded-2xl flex items-center justify-center text-solar-amber border border-solar-amber/20">
                <i className="fa-solid fa-rotate-right text-xl"></i>
              </div>
              <div>
                <h2 className="text-2xl font-black text-white uppercase tracking-tight font-mono">Resume Batch Generation?</h2>
                <p className="text-[9px] text-mystic-gray uppercase font-bold tracking-[0.3em] mt-1">Unfinished Progress Detected</p>
              </div>
            </div>

            <div className="space-y-4 mb-8">
              <div className="p-5 rounded-2xl bg-white/5 border border-white/5">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-[9px] text-mystic-gray uppercase font-bold tracking-widest mb-1">Completed</p>
                    <p className="text-2xl font-black text-deep-sage font-mono">{pendingBatchQueue.completed.length}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-mystic-gray uppercase font-bold tracking-widest mb-1">Remaining</p>
                    <p className="text-2xl font-black text-solar-amber font-mono">{pendingBatchQueue.pending.length}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-mystic-gray uppercase font-bold tracking-widest mb-1">Failed</p>
                    <p className="text-2xl font-black text-crimson-red font-mono">{pendingBatchQueue.failed.length}</p>
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-celestial-stone leading-relaxed italic text-center">
                Your previous batch generation was interrupted. You can resume where you left off or start a fresh batch.
              </p>
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => {
                  clearBatchQueue();
                  setShowResumeDialog(false);
                }}
                className="flex-1 px-6 py-4 nm-button text-celestial-stone rounded-2xl font-black uppercase text-[10px] tracking-[0.3em] hover:text-white transition-all"
              >
                Start Fresh
              </button>
              <button
                onClick={() => {
                  setShowResumeDialog(false);
                  handleManifestAll(pendingBatchQueue);
                }}
                className="flex-1 px-6 py-4 nm-button-gold text-white rounded-2xl font-black uppercase text-[10px] tracking-[0.3em] shadow-nm-gold hover:scale-105 active:scale-95 transition-all"
              >
                Resume ({pendingBatchQueue.pending.length} Left)
              </button>
            </div>
          </div>
        </div>
      )}

      <ProductionMonitor isActive={isBatchProcessing} scenes={project.scenes} assets={project.assets} currentTask={currentTaskLabel} />
    </Layout>
  );
};

export default App;
