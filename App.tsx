
import React, { useState, useRef, useEffect, Suspense, lazy } from 'react';
import { Layout } from './components/Layout';
import { ScriptInput } from './components/ScriptInput';
import { SceneCard } from './components/SceneCard';  // eager — rendered in every scene grid
import { ProductionMonitor } from './components/ProductionMonitor';
import { ProductionStageOverview } from './components/ProductionStageOverview';
import { ErrorBoundary } from './components/ErrorBoundary';

// ── Lazy-loaded views (only fetched when the user navigates to them) ──────────
const LandingPage       = lazy(() => import('./components/LandingPage').then(m => ({ default: m.LandingPage })));
const ProjectsView      = lazy(() => import('./components/ProjectsView').then(m => ({ default: m.ProjectsView })));

// ── Lazy-loaded phase workspaces ─────────────────────────────────────────────
const ScriptDoctor      = lazy(() => import('./components/ScriptDoctor').then(m => ({ default: m.ScriptDoctor })));
const Moodboard         = lazy(() => import('./components/Moodboard').then(m => ({ default: m.Moodboard })));
const CastEnsemble      = lazy(() => import('./components/CastEnsemble').then(m => ({ default: m.CastEnsemble })));
const ProductionTimeline = lazy(() => import('./components/ProductionTimeline').then(m => ({ default: m.ProductionTimeline })));
const YouTubeOptimizer  = lazy(() => import('./components/YouTubeOptimizer').then(m => ({ default: m.YouTubeOptimizer })));

// ── Lazy-loaded Director sidebar ─────────────────────────────────────────────
const DirectorAssistant = lazy(() => import('./components/DirectorAssistant').then(m => ({ default: m.DirectorAssistant })));

// ── Lazy-loaded modals (fetched on first open) ───────────────────────────────
const CharacterModal      = lazy(() => import('./components/CharacterModal').then(m => ({ default: m.CharacterModal })));
const SceneInspector      = lazy(() => import('./components/SceneInspector').then(m => ({ default: m.SceneInspector })));
const Player              = lazy(() => import('./components/Player').then(m => ({ default: m.Player })));
const Renderer            = lazy(() => import('./components/Renderer').then(m => ({ default: m.Renderer })));
const AssetLibrary        = lazy(() => import('./components/AssetLibrary').then(m => ({ default: m.AssetLibrary })));
const AudioMixer          = lazy(() => import('./components/AudioMixer').then(m => ({ default: m.AudioMixer })));
const ContinuityAuditor   = lazy(() => import('./components/ContinuityAuditor').then(m => ({ default: m.ContinuityAuditor })));
const ConsistencyDashboard = lazy(() => import('./components/ConsistencyDashboard').then(m => ({ default: m.ConsistencyDashboard })));
const DirectorialDeck     = lazy(() => import('./components/DirectorialDeck').then(m => ({ default: m.DirectorialDeck })));
const BRollSuggestionModal = lazy(() => import('./components/BRollSuggestionModal').then(m => ({ default: m.BRollSuggestionModal })));
const DirectorDraftModal  = lazy(() => import('./components/DirectorDraftModal').then(m => ({ default: m.DirectorDraftModal })));
const StoryboardView      = lazy(() => import('./components/StoryboardView').then(m => ({ default: m.StoryboardView })));
const VFXMaster           = lazy(() => import('./components/VFXMaster').then(m => ({ default: m.VFXMaster })));
const ProductionManifest  = lazy(() => import('./components/ProductionManifest').then(m => ({ default: m.ProductionManifest })));

import { ProjectState, GeneratedAssets, AspectRatio, Resolution, Character, Scene, ChatMessage, ProductionTask, ProjectModules, LogEntry, AssetHistoryItem, ViralPotential, DirectorDraft, ProductionPhase, LightingBrief, ConsistencyScore } from './types';
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
  validateAudio,
  assignShotList,
  enrichVisualPrompt,
  buildCanonicalPrompt,
  synthesizeCharacterDNA,
  reformatScript,
  optimizeCharacterVisualPrompt,
  generateLightingBrief,
  auditCharacterConsistency,
  ConsistencyAuditResult,
} from './services/gemini';
import {
  getPhaseChecklist,
  evaluateQualityGates,
  QualityGate,
  WorkflowStep,
  markStepCompleted,
  markStepSkipped,
  canTransitionFromPhase
} from './services/workflowOrchestrator';
import {
  evaluateTriggers,
  evaluatePhaseTransition,
  getIdleIntervention,
  Intervention,
  InterventionAction
} from './services/interventionEngine';
import { QualityGateModal, ActiveInterventions } from './components/WorkflowComponents';
import { VOICE_PRESETS, VISUAL_STYLES, INITIAL_SCRIPT_PLACEHOLDER } from './constants';
import { ProductionRail, computePhaseCompletion } from './components/ProductionRail';
import { PhaseCTA, CTACheckItem } from './components/PhaseCTA';
import { DirectorSidebar } from './components/DirectorSidebar';

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

const App: React.FC = () => {
  const DEFAULT_PROJECT: ProjectState = {
    script: INITIAL_SCRIPT_PLACEHOLDER, status: 'idle', characters: [], scenes: [], assets: {}, tasks: [], modules: {}, productionLog: [],
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
        // Reset any status that was saved mid-operation (analyzing, generating, etc.)
        // so buttons are never permanently disabled on reload
        if (parsed.status && parsed.status !== 'idle' && parsed.status !== 'ready') {
          parsed.status = parsed.scenes?.length > 0 ? 'ready' : 'idle';
        }
        // Reset stuck asset generating states
        if (parsed.assets) {
          for (const key of Object.keys(parsed.assets)) {
            const asset = parsed.assets[key];
            if (asset.status && asset.status.startsWith('generating_')) {
              asset.status = asset.imageUrl || asset.videoUrl || asset.audioUrl ? 'complete' : 'pending';
            }
          }
        }
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
  const [serverRenderMode, setServerRenderMode] = useState<'webm' | 'mp4-server'>('webm');
  const [isAssigningShotList, setIsAssigningShotList] = useState(false);
  const [inspectingScene, setInspectingScene] = useState<Scene | null>(null);
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [bRollSuggestions, setBRollSuggestions] = useState<Scene[]>([]);
  const [currentTaskLabel, setCurrentTaskLabel] = useState("");
  const [hasAuth, setHasAuth] = useState(() => typeof window === 'undefined' || !(window as any).aistudio);
  const [chatOpen, setChatOpen] = useState(false);
  const batchCancellationRef = useRef(false);
  const [youtubeMetadata, setYoutubeMetadata] = useState<any | null>(null);
  const [autoDiagnosisTriggered, setAutoDiagnosisTriggered] = useState(false);
  const [pendingBatchQueue, setPendingBatchQueue] = useState<BatchQueue | null>(null);
  const [showResumeDialog, setShowResumeDialog] = useState(false);

  // ── Single modal slot — replaces 13 individual show* booleans ────────────
  type ActiveModal =
    | { type: 'player' }
    | { type: 'renderer' }
    | { type: 'vfx' }
    | { type: 'audio_mixer' }
    | { type: 'manifest' }
    | { type: 'asset_library' }
    | { type: 'continuity_auditor' }
    | { type: 'consistency_dashboard' }
    | { type: 'directorial_deck' }
    | { type: 'broll' }
    | { type: 'storyboard' }
    | { type: 'script_doctor' }
    | null;
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const closeModal = () => setActiveModal(null);

  // ── Tab-based phase navigation ─────────────────────────────────────────────
  const [selectedStudioPhase, setSelectedStudioPhase] = useState<ProductionPhase>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const p = JSON.parse(saved);
        if (!p.script) return 'genesis';
        if (!p.scenes?.length) return 'genesis';
        if (!Object.values(p.assets || {}).some((a: any) => a.status === 'complete')) return 'manifest';
        if (p.scenes.every((s: any) => p.assets[s.id]?.status === 'complete')) return 'post';
        return 'synthesis';
      }
    } catch {}
    return 'genesis';
  });

  // ── Director injection — "Ask Director" from error cards ──────────────────
  const [directorInjection, setDirectorInjection] = useState<string | null>(null);



  // Workflow & Director State
  const [activeInterventions, setActiveInterventions] = useState<Intervention[]>([]);
  const [qualityGateModal, setQualityGateModal] = useState<{
    visible: boolean;
    gates: QualityGate[];
    targetPhase: ProductionPhase | null;
  }>({ visible: false, gates: [], targetPhase: null });
  const [directorMode, setDirectorMode] = useState<'guided' | 'expert'>('guided');
  const [workflowExpanded, setWorkflowExpanded] = useState(true);

  const prevProjectRef = useRef<ProjectState>(project);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const checkPhaseGates = (targetPhase: ProductionPhase): boolean => {
    // Only block if we are in a previous phase trying to move forward
    // Or just strictly enforce current phase gates before "leaving" it.

    // Map target to the phase we are leaving
    // If target is manifest, we are leaving genesis.
    // Use activePhase as the source of truth for what gates to check.

    const { canTransition, blockers } = canTransitionFromPhase(activePhase, project);

    // Only block if the target phase implies a transition forward
    // e.g. active=genesis, target=manifest -> check genesis gates.
    // If active=manifest, target=manifest -> don't block (re-running).
    const phaseOrder: ProductionPhase[] = ['genesis', 'manifest', 'synthesis', 'post'];
    const activeIdx = phaseOrder.indexOf(activePhase);
    const targetIdx = phaseOrder.indexOf(targetPhase);

    if (targetIdx > activeIdx && !canTransition) {
      setQualityGateModal({
        visible: true,
        gates: blockers,
        targetPhase
      });
      return false;
    }
    return true;
  };


  const activePhase: ProductionPhase = !project.script ? 'genesis' : project.scenes.length === 0 ? 'genesis' : !Object.values(project.assets).some(a => a.status === 'complete') ? 'manifest' : project.scenes.every(s => project.assets[s.id]?.status === 'complete') ? 'post' : 'synthesis';
  const isAllComplete = project.scenes.length > 0 && project.scenes.every(s => project.assets[s.id]?.status === 'complete');

  useEffect(() => {
    const checkAuth = async () => { if ((window as any).aistudio) setHasAuth(await (window as any).aistudio.hasSelectedApiKey()); else setHasAuth(true); };
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
      let newChar: Character = {
        id: `char_${Date.now()}`,
        name: charName,
        description: persona.description || description,
        gender: gender,
        visualPrompt: persona.visualPrompt || "",
        voiceId: persona.voiceId || VOICE_PRESETS[0].id,
        voiceSettings: { speed: 1, pitch: 0 }
      };
      // Auto-synthesize CharacterDNA for Director-created characters
      try {
        const dna = await synthesizeCharacterDNA(newChar, project.globalStyle || 'Cinematic', project.productionSeed);
        newChar = { ...newChar, characterDNA: dna };
      } catch (e) {
        console.error('[add_character] DNA synthesis failed:', e);
      }
      setProject(p => ({ ...p, characters: [...p.characters, newChar] }));
      return "Character added and synthesized with identity lock.";
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
      setActiveModal({ type: 'broll' });
      return "B-Roll synthesis complete. Review suggestions in the terminal.";
    }
    else if (name === 'check_workflow_progress') {
      const { phase } = args;
      const checklist = getPhaseChecklist(phase || activePhase, project);
      return JSON.stringify(checklist);
    } else if (name === 'suggest_optimization_tool') {
      const { toolId, reason, autoOpen } = args;
      addLog(`Director suggests ${toolId}: ${reason}`, "ai_suggestion");
      if (autoOpen) {
        // Map toolId to UI
        if (toolId === 'script-doctor') setActiveModal({ type: 'script_doctor' });
        if (toolId === 'continuity-auditor') setActiveModal({ type: 'continuity_auditor' });
        if (toolId === 'vfx-master') setActiveModal({ type: 'vfx' });
        if (toolId === 'youtube-optimizer') setActiveModal({ type: 'manifest' });
      }
      return "Suggestion presented to user.";
    } else if (name === 'execute_workflow_step') {
      const { stepId } = args;
      await handleExecuteWorkflowStep(stepId);
      return `Workflow step ${stepId} initiated.`;
    } else if (name === 'assign_shot_list') {
      await handleAssignShotList();
      return "Shot list assigned to all scenes.";
    } else if (name === 'run_consistency_audit') {
      setActiveModal({ type: 'consistency_dashboard' });
      return "Consistency Dashboard opened.";
    } else if (name === 'reformat_script') {
      const reformatted = await reformatScript(project.script || '', project.globalStyle || 'Cinematic', project.productionSeed);
      setProject(p => ({ ...p, script: reformatted }));
      addLog("Director reformatted script to production format.", "ai_suggestion");
      return `Script reformatted. ${reformatted.split('[Scene:').length - 1} scenes detected.`;
    } else if (name === 'optimize_character_prompt') {
      const { character_name } = args;
      const char = project.characters.find(c => c.name.toLowerCase() === character_name.toLowerCase());
      if (!char) return `Character "${character_name}" not found.`;
      const optimized = await optimizeCharacterVisualPrompt(char, project.globalStyle || 'Cinematic', project.productionSeed);
      setProject(p => ({ ...p, characters: p.characters.map(c => c.name === char.name ? { ...c, visualPrompt: optimized } : c) }));
      addLog(`Director optimized visual prompt for ${char.name}.`, "ai_suggestion");
      return `Optimized prompt applied to ${char.name}.`;
    } else if (name === 'apply_lighting_brief') {
      const brief = await generateLightingBrief(project.script || '', project.globalStyle || 'Cinematic', project.productionSeed);
      setProject(p => ({ ...p, lightingBrief: brief }));
      addLog("Director applied cinematic lighting brief.", "ai_suggestion");
      return `Lighting brief applied: ${brief.timeOfDay}, ${brief.moodDescriptor}.`;
    } else if (name === 'run_video_consistency_audit') {
      const { mark_for_regeneration } = args;
      const sceneImagesForAudit = project.scenes
        .map(s => ({ sceneId: s.id, imageBase64: project.assets[s.id]?.imageUrl || '' }))
        .filter(s => s.imageBase64.startsWith('data:'));
      if (sceneImagesForAudit.length === 0) return "No generated scene images found to audit.";
      const charsWithRef = project.characters.filter(c => c.referenceImageBase64);
      if (charsWithRef.length === 0) return "No characters with reference images found. Generate character images first.";
      let allResults: ConsistencyAuditResult[] = [];
      for (const char of charsWithRef) {
        const results = await auditCharacterConsistency(char, sceneImagesForAudit);
        allResults = [...allResults, ...results];
      }
      const inconsistentSceneIds = [...new Set(allResults.filter(r => r.score < 70).map(r => r.sceneId))];
      const topIssues = allResults.filter(r => r.issues.length > 0).slice(0, 3).map(r => `Scene ${r.sceneId}: ${r.issues[0]}`).join('; ');
      const report = `Audited ${sceneImagesForAudit.length} scenes for ${charsWithRef.length} character(s). ${inconsistentSceneIds.length} inconsistent scene(s) found.${topIssues ? ' Issues: ' + topIssues : ''}`;
      if (mark_for_regeneration && inconsistentSceneIds.length > 0) {
        handleMarkScenesForRegeneration(inconsistentSceneIds);
        addLog(`Director flagged ${inconsistentSceneIds.length} inconsistent scenes for regeneration.`, "ai_suggestion");
      }
      return report;
    }
    return "Unknown tool.";
  };

  const handleAssignShotList = async () => {
    if (project.scenes.length === 0) return;
    setIsAssigningShotList(true);
    addLog("Assigning cinematic shot list to scenes...", "system");
    try {
      const updatedScenes = await assignShotList(project.scenes, project.script);
      setProject(p => ({ ...p, scenes: updatedScenes }));
      addLog("Shot list assigned. Cinematic variety optimized for 3-act structure.", "success");
    } catch (e: any) {
      addLog(`Shot list assignment failed: ${e.message}`, "error");
    } finally {
      setIsAssigningShotList(false);
    }
  };

  const handleMarkScenesForRegeneration = (sceneIds: number[]) => {
    setProject(p => {
      const updatedAssets = { ...p.assets };
      sceneIds.forEach(id => {
        if (updatedAssets[id]) {
          updatedAssets[id] = { ...updatedAssets[id], status: 'pending' };
        }
      });
      return { ...p, assets: updatedAssets };
    });
    addLog(`Marked ${sceneIds.length} scene(s) for regeneration.`, "system");
  };

  const handleUpdateConsistencyScores = (scores: Record<string, ConsistencyScore>) => {
    setProject(p => ({ ...p, consistencyScores: scores }));
  };

  const handleAnalyze = async (script: string) => {
    if (!hasAuth) { await triggerApiKeySelection(); setHasAuth(true); return; }
    setProject(prev => ({ ...prev, status: 'analyzing', script }));
    setAutoDiagnosisTriggered(false);
    addLog("Initializing production sequence analysis...", "system");
    try {
      const { characters, scenes, tasks, modules, metadata, lightingBrief } = await analyzeScript(script, project.productionSeed);
      const initialAssets: GeneratedAssets = {};
      scenes.forEach(s => initialAssets[s.id] = { status: 'pending', variants: [] });
      setProject(prev => ({ ...prev, status: 'ready', characters, scenes, assets: initialAssets, tasks, modules, ...(lightingBrief ? { lightingBrief } : {}) }));
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

      // Find the previous scene's completed image for temporal continuity injection
      const sceneIndex = project.scenes.findIndex(s => s.id === sceneId);
      const previousScene = sceneIndex > 0 ? project.scenes[sceneIndex - 1] : null;
      const previousSceneImageUrl = previousScene ? project.assets[previousScene.id]?.imageUrl : undefined;

      // Enrich the raw visual prompt to full cinematographic quality before generation
      const sceneCharsForEnrich = project.characters.filter(c => (scene.charactersInScene || []).includes(c.name));
      const enrichedVisualPrompt = await enrichVisualPrompt(
        scene.visualPrompt,
        project.globalStyle || 'Cinematic',
        scene.shotType,
        project.lightingBrief,
        sceneCharsForEnrich
      );
      const enrichedScene = { ...scene, visualPrompt: enrichedVisualPrompt };

      const { imageUrl: img, seedUsed } = await generateSceneImage(enrichedScene, project.characters, aspectRatio, resolution, feedback, project.globalStyle || 'Cinematic', project.productionSeed, styleRef, project.lightingBrief, previousSceneImageUrl);

      // Validate image
      const imageValidation = validateImage(img);
      if (!imageValidation.valid) {
        throw new Error(`Image validation failed: ${imageValidation.error}`);
      }

      setProject(prev => ({ ...prev, assets: { ...prev.assets, [sceneId]: { ...prev.assets[sceneId], imageUrl: img, seed: seedUsed, status: 'generating_video' } } }));

      const sceneCharsForVideo = project.characters.filter(c => (scene.charactersInScene || []).includes(c.name));
      const charVideoDesc = sceneCharsForVideo.map(c => buildCanonicalPrompt(c) || c.visualPrompt).filter(Boolean).join('; ');
      const videoPrompt = charVideoDesc
        ? `${scene.visualPrompt}. Characters in frame: ${charVideoDesc}.`
        : scene.visualPrompt;
      const video = await generateSceneVideo(img, videoPrompt, aspectRatio, resolution, project.globalStyle, scene.cameraMotion);

      // Validate video
      const videoValidation = validateVideo(video);
      if (!videoValidation.valid) {
        throw new Error(`Video validation failed: ${videoValidation.error}`);
      }

      const audioResult = await generateSceneAudio(scene.narratorLines, project.characters, scene);

      // Validate audio only if we have data (empty URL means all lines failed)
      if (audioResult.audioUrl) {
        const audioValidation = validateAudio(audioResult.audioUrl);
        if (!audioValidation.valid) {
          throw new Error(`Audio validation failed: ${audioValidation.error}`);
        }
        // Lock actual audio duration from PCM bytes (24kHz, 16-bit mono = 48000 bytes/sec)
        try {
          const pcmBytes = atob(audioResult.audioUrl.split(',')[1]).length;
          const actualAudioDuration = pcmBytes / (24000 * 2);
          setProject(prev => ({
            ...prev,
            scenes: prev.scenes.map(s => s.id === sceneId ? { ...s, actualAudioDuration } : s)
          }));
        } catch { /* silently skip duration lock on decode error */ }
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

      const { imageUrl: img, seedUsed: _seed } = await generateSceneImage(scene, project.characters, aspectRatio, resolution, undefined, project.globalStyle || 'Cinematic', project.productionSeed, styleRef, project.lightingBrief);

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
      const audioResult = await generateSceneAudio(scene.narratorLines, project.characters, scene);

      // Validate audio only if we have data (empty URL means all lines failed)
      if (audioResult.audioUrl) {
        const audioValidation = validateAudio(audioResult.audioUrl);
        if (!audioValidation.valid) {
          throw new Error(`Audio validation failed: ${audioValidation.error}`);
        }
        // Lock actual audio duration
        try {
          const pcmBytes = atob(audioResult.audioUrl.split(',')[1]).length;
          const actualAudioDuration = pcmBytes / (24000 * 2);
          setProject(prev => ({
            ...prev,
            scenes: prev.scenes.map(s => s.id === sceneId ? { ...s, actualAudioDuration } : s)
          }));
        } catch { /* silently skip */ }
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
    let savedChar = char;

    // Auto-synthesize CharacterDNA when a reference image is approved for the first time
    if (char.referenceImageApproved && char.referenceImageBase64 && !char.characterDNA) {
      try {
        addLog(`Synthesizing identity lock for "${char.name}"...`, "system");
        const dna = await synthesizeCharacterDNA(char, project.globalStyle || 'Cinematic', project.productionSeed);
        savedChar = { ...char, characterDNA: dna };
        addLog(`Character DNA locked for "${char.name}". Maximum cross-scene consistency active.`, "success");
      } catch (e) {
        console.error('[handleCharacterSave] DNA synthesis failed:', e);
        // Non-blocking — save character without DNA if synthesis fails
      }
    }

    // Check if this is a new character (not in project yet)
    const isNew = !project.characters.find(c => c.id === savedChar.id);

    if (isNew) {
      setProject(p => ({ ...p, characters: [...p.characters, savedChar] }));
      addLog(`New character "${savedChar.name}" added to cast.`, "success");
    } else {
      setProject(p => ({ ...p, characters: p.characters.map(c => c.id === savedChar.id ? savedChar : c) }));
      addLog(`Character profile "${savedChar.name}" updated.`, "system");
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

    const RATE_LIMIT_DELAY = 8000; // 8s between scenes — gives quota room across 50+ scene batches
    const FAILURE_COOLDOWN = 45000; // 45s cooldown after a failed scene to recover from quota exhaustion
    const MAX_RETRIES = 2;

    // Snapshot scenes at batch-start so the loop is immune to re-renders/stale closure
    const scenesSnapshot = project.scenes.slice();

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
      for (let i = 0; i < scenesSnapshot.length; i++) {
        // Check for cancellation
        if (batchCancellationRef.current) {
          cancelledAt = i;
          addLog(`Batch processing cancelled at scene ${i + 1}`, "error");
          break;
        }

        const scene = scenesSnapshot[i];

        // Skip if not in pending queue (already completed or failed in previous session)
        if (!queue.pending.includes(scene.id)) {
          addLog(`Scene #${i + 1} already processed, skipping...`, "system");
          continue;
        }

        // Check if scene is already complete
        const assetStatus = await new Promise<string>((resolve) => {
          setProject(prev => {
            resolve(prev.assets[scene.id]?.status || 'pending');
            return prev;
          });
        });

        if (assetStatus === 'complete') {
          queue.pending = queue.pending.filter(id => id !== scene.id);
          queue.completed.push(scene.id);
          saveBatchQueue(queue);
          addLog(`Scene #${i + 1} already complete, skipping...`, "system");
          continue;
        }

        setCurrentTaskLabel(`Manifesting Sequence #${i + 1} of ${scenesSnapshot.length}: ${scene.description.substring(0, 30)}...`);
        addLog(`Generating Scene #${i + 1} of ${scenesSnapshot.length}...`, "system");

        let success = false;
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          // Check for cancellation before retry
          if (batchCancellationRef.current) {
            cancelledAt = i;
            break;
          }

          if (attempt > 0) {
            const retryDelay = RATE_LIMIT_DELAY * 3 * attempt; // 24s, 48s progressive retry wait
            addLog(`Retrying Scene #${i + 1} (attempt ${attempt + 1}/${MAX_RETRIES + 1}) — waiting ${retryDelay / 1000}s...`, "system");
            await new Promise(r => setTimeout(r, retryDelay));
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
              queue.pending = queue.pending.filter(id => id !== scene.id);
              queue.completed.push(scene.id);
              saveBatchQueue(queue);
              break;
            } else if (finalStatus === 'error') {
              addLog(`Scene #${i + 1} generation failed on attempt ${attempt + 1}`, "error");
            }
          } catch (error) {
            console.error(`Scene ${i + 1} generation error:`, error);
          }
        }

        if (!success && !batchCancellationRef.current) {
          failedScenes.push(i + 1);
          queue.pending = queue.pending.filter(id => id !== scene.id);
          queue.failed.push(scene.id);
          saveBatchQueue(queue);
          // Cooldown after failure — lets quota recover before attacking the next scene
          if (i < scenesSnapshot.length - 1) {
            addLog(`Scene #${i + 1} failed after all retries. Cooling down ${FAILURE_COOLDOWN / 1000}s before next scene...`, "system");
            await new Promise(r => setTimeout(r, FAILURE_COOLDOWN));
          }
        }

        // Standard rate-limit delay between scenes
        if (success && i < scenesSnapshot.length - 1 && !batchCancellationRef.current) {
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
      addLog("Cancellation signal received. Stopping batch process...", "system");
    }
  };

  // --- Workflow & Intervention Logic ---

  useEffect(() => {
    // Check for interventions on project update
    const triggers = evaluateTriggers(project, prevProjectRef.current, directorMode === 'guided');

    if (triggers.length > 0) {
      setActiveInterventions(prev => {
        const existingIds = new Set(prev.map(i => i.id));
        const newInterventions = triggers.filter(t => !existingIds.has(t.id));
        return [...newInterventions, ...prev]; // Newest first
      });
    }

    prevProjectRef.current = project;
  }, [project, directorMode]);

  // Handle Workflow Step Execution
  const handleExecuteWorkflowStep = async (stepId: string) => {
    console.log('Executing step:', stepId);

    // Map step IDs to actual App functions
    switch (stepId) {
      case 'analyze_script':
        if (project.script) await handleAnalyze(project.script);
        break;
      case 'assign_voices':
        // setView('characters') or open modal
        // Assuming we have a way to open voice casting. For now:
        setView('dashboard');
        // trigger specific tab?
        break;
      case 'generate_assets':
        await handleManifestAll();
        break;
      case 'set_key_art':
        setActiveModal({ type: 'asset_library' });
        break;
      case 'run_script_doctor':
        setActiveModal({ type: 'script_doctor' });
        break;
      case 'run_continuity_audit':
        setActiveModal({ type: 'continuity_auditor' });
        break;
      case 'run_viral_analysis':
      case 'generate_seo_metadata':
        setActiveModal({ type: 'manifest' });
        break;
      case 'apply_vfx_mastering':
        setActiveModal({ type: 'vfx' });
        break;
      case 'add_moodboard':
        // Scroll to moodboard
        handleNavigatePhase('genesis');
        break;
      case 'review_timeline':
        handleNavigatePhase('manifest');
        break;
    }

    // Optimistically mark as completed for UI responsiveness
    setProject(p => markStepCompleted(activePhase, stepId, p));
  };

  const handleSkipWorkflowStep = (stepId: string) => {
    setProject(p => markStepSkipped(activePhase, stepId, p));
  };

  const handleExecuteInterventionAction = async (action: InterventionAction) => {
    console.log('Executing intervention action:', action.actionId);

    if (action.actionId) {
      switch (action.actionId) {
        case 'assign_voices':
          // Open voice casting
          break;
        case 'generate_remaining_scenes':
          await handleManifestAll();
          break;
        case 'run_continuity_audit':
          setActiveModal({ type: 'continuity_auditor' });
          break;
        case 'set_key_art':
          setActiveModal({ type: 'asset_library' });
          break;
        case 'apply_vfx_mastering':
          setActiveModal({ type: 'vfx' });
          break;
        case 'analyze_viral_potential':
        case 'generate_seo_metadata':
          setActiveModal({ type: 'manifest' });
          break;
        case 'open_director_chat':
          setChatOpen(true);
          break;
        case 'review_failed_scenes':
          handleNavigatePhase('synthesis');
          break;
      }
    }

    // Dismiss parent intervention
    // Need intervention ID to dismiss specific one. 
    // Just remove top one or pass ID?
    // For now we don't strictly remove, but we should.
  };

  // --- End Workflow Logic ---

  const handleAddBRoll = (newScenes: Scene[]) => {
    const initializedAssets = { ...project.assets };
    newScenes.forEach(s => initializedAssets[s.id] = { status: 'pending', variants: [] });
    setProject(p => ({
      ...p,
      scenes: [...p.scenes, ...newScenes],
      assets: initializedAssets
    }));
    closeModal();
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
    setSelectedStudioPhase(section as ProductionPhase);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectPhase = (phase: ProductionPhase) => {
    const phaseOrder: ProductionPhase[] = ['genesis', 'manifest', 'synthesis', 'post'];
    const selectedIdx = phaseOrder.indexOf(selectedStudioPhase);
    const targetIdx = phaseOrder.indexOf(phase);
    if (directorMode === 'guided' && targetIdx > selectedIdx) {
      if (!checkPhaseGates(phase)) return;
    }
    setSelectedStudioPhase(phase);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAdvancePhase = (nextPhase: ProductionPhase) => {
    if (!checkPhaseGates(nextPhase)) return;
    setSelectedStudioPhase(nextPhase);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ── Derived values used in render ───────────────────────────────────────
  const batchCompletedCount = project.scenes.filter(s => project.assets[s.id]?.status === 'complete').length;
  const assetErrorCount = project.scenes.filter(s => project.assets[s.id]?.status === 'error').length;

  const genesisCTAItems: CTACheckItem[] = [
    { label: 'Script entered', done: !!project.script && project.script.trim().length > 50 },
    { label: 'Script analyzed', done: project.scenes.length > 0 },
    { label: 'Visual style selected', done: !!project.globalStyle, warning: true },
  ];

  const manifestCTAItems: CTACheckItem[] = [
    { label: `${project.characters.length} character${project.characters.length !== 1 ? 's' : ''} in cast`, done: project.characters.length > 0 },
    { label: 'All voices assigned', done: project.characters.length > 0 && project.characters.every(c => c.voiceId) },
    { label: 'DNA locked for all characters', done: project.characters.length > 0 && project.characters.every(c => c.characterDNA), warning: true },
  ];

  const synthesisCTAItems: CTACheckItem[] = [
    { label: `${batchCompletedCount} of ${project.scenes.length} scenes generated`, done: batchCompletedCount === project.scenes.length && project.scenes.length > 0 },
    { label: 'No asset errors', done: assetErrorCount === 0 },
    { label: 'Continuity audited', done: !!project.consistencyScores && Object.keys(project.consistencyScores).length > 0, warning: true },
  ];

  const phaseColors: Record<ProductionPhase, string> = {
    genesis: '#8b5cf6', manifest: '#3b82f6', synthesis: '#00d4ff', post: '#f59e0b',
  };

  return (
    <Layout
      activeView={view}
      onViewChange={setView}
      isProcessing={isBatchProcessing || (project.status !== 'ready' && project.status !== 'idle')}
      assistantActive={chatOpen}
      onToggleAssistant={() => setChatOpen(!chatOpen)}
    >
      {/* Main content — right-padded to accommodate the persistent Director sidebar */}
      <Suspense fallback={
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="flex flex-col items-center gap-3">
            <i className="fa-solid fa-spinner fa-spin text-2xl" style={{ color: '#00d4ff' }}></i>
            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-mystic-gray">Loading</span>
          </div>
        </div>
      }>
      <div
        className="relative min-h-screen pb-32 transition-all duration-300 ease-in-out"
        style={{ paddingRight: chatOpen ? '420px' : '52px' }}
      >
        {view === 'landing' && <LandingPage onStart={() => setView('dashboard')} />}
        {view === 'projects' && <ProjectsView projects={archives} onSelect={p => { setProject(p); setView('dashboard'); }} onDelete={idx => setArchives(prev => prev.filter((_, i) => i !== idx))} onImport={() => fileInputRef.current?.click()} />}

        <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (evt) => {
            try {
              const imported = JSON.parse(evt.target?.result as string);
              if (imported && imported.script !== undefined) {
                setProject(imported);
                setView('dashboard');
                addLog('Project imported successfully.', 'success');
              } else {
                addLog('Import failed: invalid project file format.', 'error');
              }
            } catch {
              addLog('Import failed: could not parse JSON file.', 'error');
            }
            e.target.value = '';
          };
          reader.readAsText(file);
        }} />

        {view === 'dashboard' && (
          <div className="flex flex-col gap-6 pt-6 relative max-w-[1400px] mx-auto animate-in fade-in duration-700 px-4 sm:px-0">

            {/* ── PRODUCTION RAIL — persistent phase navigator ── */}
            <ProductionRail
              activePhase={activePhase}
              selectedPhase={selectedStudioPhase}
              onSelectPhase={handleSelectPhase}
              project={project}
              isBatchProcessing={isBatchProcessing}
              batchProgress={{ completed: batchCompletedCount, total: project.scenes.length }}
              errorCount={assetErrorCount}
              directorOpen={chatOpen}
              onToggleDirector={() => setChatOpen(!chatOpen)}
              directorMode={directorMode}
              onToggleMode={() => setDirectorMode(m => m === 'guided' ? 'expert' : 'guided')}
            />

            {/* ── PHASE WORKSPACES — tab-switched, no more long scroll ── */}
            <div className="animate-in fade-in duration-300" key={selectedStudioPhase}>

            {/* ════════════════════ GENESIS ════════════════════ */}
            {selectedStudioPhase === 'genesis' && (
            <div className="space-y-8">
            <div className={`grid grid-cols-1 xl:grid-cols-12 gap-10`}>
              <div className="xl:col-span-8">
                <ScriptInput
                  script={project.script || ''}
                  onScriptChange={(s) => setProject(p => ({ ...p, script: s }))}
                  onAnalyze={handleAnalyze}
                  isAnalyzing={project.status === 'analyzing'}
                />
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
            </div>{/* end genesis grid */}

            {/* Genesis → Manifest CTA */}
            <PhaseCTA
              currentPhase="genesis"
              nextPhase="manifest"
              nextPhaseLabel="Manifest Cast"
              items={genesisCTAItems}
              onNext={() => handleAdvancePhase('manifest')}
              onDirectorHelp={() => { setChatOpen(true); setDirectorInjection('What do I need to finish in Genesis before I can move to Manifest?'); }}
              canAdvance={project.scenes.length > 0}
            />
            </div>
            )}{/* end selectedStudioPhase === genesis */}

            {/* ════════════════════ MANIFEST ════════════════════ */}
            {selectedStudioPhase === 'manifest' && (
            <div className="space-y-8">
            {project.scenes.length === 0 ? (
              <div className="nm-panel p-16 rounded-3xl border border-white/5 flex flex-col items-center text-center gap-6">
                <i className="fa-solid fa-seedling text-4xl text-mystic-gray opacity-40"></i>
                <div>
                  <h3 className="text-xl font-black text-white uppercase tracking-tight font-mono">Script Not Analyzed</h3>
                  <p className="text-sm text-celestial-stone mt-2">Analyze your script in the Genesis phase first to extract scenes and characters.</p>
                </div>
                <button onClick={() => setSelectedStudioPhase('genesis')} className="px-8 py-3 nm-button-gold text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all">
                  ← Back to Genesis
                </button>
              </div>
            ) : (
            <>
            <ProductionStageOverview project={project} />
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
              <div className="lg:col-span-4 flex flex-col gap-6">
                <CastEnsemble characters={project.characters} onEdit={setEditingCharacter} onAdd={handleAddCharacter} onAudit={() => setActiveModal({ type: 'continuity_auditor' })} />
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
                          onClick={() => setActiveModal({ type: 'script_doctor' })}
                          className="w-full nm-button p-4 rounded-2xl flex items-center justify-between group hover:border-solar-amber/30 transition-all border border-white/5"
                        >
                          <span className="text-[9px] font-black uppercase tracking-widest text-mystic-gray group-hover:text-white">Narrative Diagnostic</span>
                          <i className="fa-solid fa-chevron-right text-[10px] text-solar-amber transition-transform group-hover:translate-x-1"></i>
                        </button>
                        <button
                          onClick={() => setActiveModal({ type: 'consistency_dashboard' })}
                          className="w-full nm-button p-4 rounded-2xl flex items-center justify-between group hover:border-deep-sage/30 transition-all border border-white/5"
                        >
                          <span className="text-[9px] font-black uppercase tracking-widest text-mystic-gray group-hover:text-white">Consistency Dashboard</span>
                          <i className="fa-solid fa-chevron-right text-[10px] text-deep-sage transition-transform group-hover:translate-x-1"></i>
                        </button>
                        <button
                          onClick={handleAssignShotList}
                          disabled={isAssigningShotList || project.scenes.length === 0}
                          className="w-full nm-button p-4 rounded-2xl flex items-center justify-between group hover:border-luna-gold/30 transition-all border border-white/5 disabled:opacity-40"
                        >
                          <span className="text-[9px] font-black uppercase tracking-widest text-mystic-gray group-hover:text-white">
                            {isAssigningShotList ? 'Assigning Shots...' : 'Assign Shot List'}
                          </span>
                          <i className={`fa-solid ${isAssigningShotList ? 'fa-spinner fa-spin' : 'fa-camera-movie'} text-[10px] text-luna-gold`}></i>
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="lg:col-span-8 space-y-6">
                    <ProductionTimeline scenes={project.scenes} assets={project.assets} onSelectScene={scrollToScene} />

                    <div className="flex flex-wrap sm:flex-nowrap gap-4">
                      <button onClick={() => setActiveModal({ type: 'storyboard' })} className="flex-1 min-w-[120px] py-6 nm-panel flex flex-col items-center justify-center gap-3 border border-white/5 hover:border-luna-gold/20 transition-all group">
                        <i className="fa-solid fa-grip text-luna-gold text-xl group-hover:scale-110 transition-transform"></i>
                        <span className="text-[10px] font-black text-white uppercase tracking-widest">Storyboard View</span>
                      </button>
                      <button onClick={() => setActiveModal({ type: 'asset_library' })} className="flex-1 min-w-[120px] py-6 nm-panel flex flex-col items-center justify-center gap-3 border border-white/5 hover:border-solar-amber/20 transition-all group">
                        <i className="fa-solid fa-photo-film text-solar-amber text-xl group-hover:scale-110 transition-transform"></i>
                        <span className="text-[10px] font-black text-white uppercase tracking-widest">Asset Registry</span>
                      </button>
                      <button onClick={() => setActiveModal({ type: 'manifest' })} className="flex-1 min-w-[120px] py-6 nm-panel flex flex-col items-center justify-center gap-3 border border-white/5 hover:border-deep-sage/20 transition-all group">
                        <i className="fa-solid fa-file-invoice text-deep-sage text-xl group-hover:scale-110 transition-transform"></i>
                        <span className="text-[10px] font-black text-white uppercase tracking-widest">Production Protocol</span>
                      </button>
                    </div>
                  </div>
                </div>{/* end manifest grid */}

              {/* Manifest → Synthesis CTA */}
              <PhaseCTA
                currentPhase="manifest"
                nextPhase="synthesis"
                nextPhaseLabel="Synthesis"
                items={manifestCTAItems}
                onNext={() => handleAdvancePhase('synthesis')}
                onDirectorHelp={() => { setChatOpen(true); setDirectorInjection('What do I need to finish in Manifest before moving to Synthesis?'); }}
                canAdvance={project.characters.length > 0 && project.characters.every(c => c.voiceId)}
              />
            </>
            )}{/* end scenes.length > 0 */}
            </div>
            )}{/* end selectedStudioPhase === manifest */}

            {/* ════════════════════ SYNTHESIS ════════════════════ */}
            {selectedStudioPhase === 'synthesis' && (
            <div className="space-y-8">
            <section className="space-y-10">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end border-b border-white/5 pb-8 gap-4">
                    <div>
                      <h3 className="text-3xl font-black text-white uppercase tracking-tighter font-mono italic">Neural Synthesis Lab</h3>
                      <p className="text-[10px] text-mystic-gray uppercase font-bold tracking-[0.3em] mt-2">Manifesting visual and auditory temporal takes</p>
                    </div>
                    <div className="flex gap-4">
                      {!isBatchProcessing ? (
                        <button onClick={() => handleManifestAll()} className="px-10 py-4 nm-button-gold text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl shadow-nm-gold hover:scale-105 active:scale-95 transition-all flex items-center gap-4">
                          <i className="fa-solid fa-bolt-lightning animate-pulse"></i> Initialize Batch Manifest
                        </button>
                      ) : (
                        <button onClick={handleCancelBatch} className="px-10 py-4 bg-solar-amber/20 border border-solar-amber text-solar-amber text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl hover:bg-solar-amber/30 active:scale-95 transition-all flex items-center gap-4">
                          <i className="fa-solid fa-stop"></i> Cancel Batch
                        </button>
                      )}
                      <button onClick={() => setActiveModal({ type: 'audio_mixer' })} className="w-14 h-14 nm-button rounded-2xl flex items-center justify-center text-solar-amber border border-white/5 hover:text-white transition-all shadow-xl">
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
                            onDuplicate={() => { const newId = Date.now(); setProject(p => ({ ...p, scenes: [...p.scenes, { ...scene, id: newId }], assets: { ...p.assets, [newId]: { status: 'pending', variants: [] } } })); }}
                            onInspect={setInspectingScene}
                            onSelectVariant={handleSelectVariant}
                            onClearAsset={handleClearAsset}
                            isProcessing={project.assets[scene.id]?.status?.startsWith('generating') ?? false} globalStyle={project.globalStyle}
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
                </section>{/* end synthesis scene grid */}

              {/* Synthesis → Post CTA */}
              <PhaseCTA
                currentPhase="synthesis"
                nextPhase="post"
                nextPhaseLabel="Post-Production"
                items={synthesisCTAItems}
                onNext={() => handleAdvancePhase('post')}
                onDirectorHelp={() => { setChatOpen(true); setDirectorInjection('My synthesis phase status: what needs attention before post-production?'); }}
                canAdvance={batchCompletedCount > 0}
              />
            </div>
            )}{/* end selectedStudioPhase === synthesis */}

            {/* ════════════════════ POST ════════════════════ */}
            {selectedStudioPhase === 'post' && (
            <div className="space-y-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end border-b border-white/5 pb-8 gap-4">
              <div>
                <h3 className="text-3xl font-black text-white uppercase tracking-tighter font-mono italic">Post-Production & Release</h3>
                <p className="text-[10px] text-mystic-gray uppercase font-bold tracking-[0.3em] mt-2">Neural mastering and distribution multipliers</p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => setActiveModal({ type: 'directorial_deck' })} className="nm-button w-12 h-12 rounded-2xl flex items-center justify-center text-solar-amber hover:text-white transition-all shadow-lg" title="Directorial Deck">
                  <i className="fa-solid fa-chart-line"></i>
                </button>
                <button onClick={() => setActiveModal({ type: 'vfx' })} className="px-8 py-3 nm-button text-luna-gold border border-luna-gold/20 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-luna-gold hover:text-white transition-all flex items-center gap-3">
                  <i className="fa-solid fa-wand-magic-sparkles"></i> VFX Synthesis Lab
                </button>
                <button onClick={() => setActiveModal({ type: 'audio_mixer' })} className="px-8 py-3 nm-button text-solar-amber border border-solar-amber/20 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-solar-amber hover:text-white transition-all flex items-center gap-3">
                  <i className="fa-solid fa-sliders"></i> Audio Mix
                </button>
              </div>
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

            <div className="flex justify-center pt-10">
              <div className="w-full max-w-4xl nm-panel p-10 sm:p-16 rounded-[4rem] border border-white/5 relative overflow-hidden bg-gradient-to-t from-luna-gold/5 to-transparent flex flex-col items-center text-center shadow-2xl">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-16 bg-gradient-to-b from-luna-gold to-transparent opacity-40"></div>
                <h4 className="text-2xl font-black text-white uppercase tracking-widest font-mono italic mb-6">Master Production Unit</h4>
                <p className="text-sm text-celestial-stone max-w-lg mb-12 font-light">The neural tracks are ready for final merge. Initializing the export will compile all visual takes, audio signals, and VFX mastering into a single master distribution unit.</p>
                <div className="flex flex-col sm:flex-row gap-6 w-full sm:w-auto">
                  <button
                    onClick={() => setActiveModal({ type: 'player' })}
                    className="px-12 py-5 nm-button text-starlight rounded-2xl font-black uppercase tracking-[0.3em] text-[10px] hover:bg-white/5 transition-all flex items-center justify-center gap-4 border border-white/10"
                  >
                    <i className="fa-solid fa-desktop"></i> Pre-Production Review
                  </button>
                  <button
                    onClick={() => setActiveModal({ type: 'renderer' })}
                    disabled={!isAllComplete}
                    className="px-16 py-5 bg-gold-gradient text-white rounded-2xl font-black uppercase tracking-[0.3em] text-[10px] shadow-nm-gold hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-4 disabled:opacity-30 disabled:hover:scale-100"
                  >
                    <i className="fa-solid fa-clapperboard"></i> Initialize Master Export
                  </button>
                </div>
              </div>
            </div>
            </div>
            )}{/* end selectedStudioPhase === post */}

            </div>
          </div>
        )}{/* end view === dashboard */}
      </div>{/* end main content */}

      {/* ── PERSISTENT DIRECTOR SIDEBAR ─────────────────────────────────── */}
      <aside
        className="fixed right-0 top-0 bottom-0 z-[150] flex flex-col pt-20 pb-0 transition-all duration-300 ease-in-out"
        style={{
          width: chatOpen ? '420px' : '52px',
          background: '#0a0e1a',
          borderLeft: chatOpen ? '1px solid rgba(0,212,255,0.12)' : '1px solid rgba(255,255,255,0.04)',
          boxShadow: chatOpen ? '-4px 0 40px rgba(0,0,0,0.6)' : 'none',
        }}
      >
        {/* Collapsed strip */}
        {!chatOpen && (
          <div className="flex flex-col items-center gap-4 pt-4 h-full overflow-hidden">
            <button
              onClick={() => setChatOpen(true)}
              className="w-9 h-9 rounded-xl flex items-center justify-center transition-all hover:scale-110"
              style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.2)' }}
              title="Open Director"
            >
              <i className="fa-solid fa-brain text-[12px]" style={{ color: '#00d4ff' }}></i>
            </button>
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: phaseColors[activePhase], boxShadow: `0 0 6px ${phaseColors[activePhase]}` }}
              title={`Phase: ${activePhase}`}
            ></div>
            <div
              className="mt-auto mb-6 text-[7px] font-black uppercase tracking-[0.3em] opacity-30 flex-shrink-0"
              style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', color: '#a1a1aa' }}
            >Director</div>
          </div>
        )}

        {/* Expanded panel */}
        {chatOpen && (
          <div className="flex-1 min-h-0 flex flex-col">
            <ErrorBoundary>
              <DirectorAssistant
                project={project}
                onUpdateProject={(updates) => setProject(prev => ({ ...prev, ...updates }))}
                onExecuteTool={handleToolExecution}
                autoTriggerDiagnosis={autoDiagnosisTriggered}
                currentPhase={activePhase}
                onExecuteWorkflowStep={handleExecuteWorkflowStep}
                onSkipWorkflowStep={handleSkipWorkflowStep}
                pendingInjection={directorInjection}
                onClearInjection={() => setDirectorInjection(null)}
                onOpenTool={(toolId) => {
                  switch (toolId) {
                    case 'script-doctor': setActiveModal({ type: 'script_doctor' }); break;
                    case 'continuity-auditor': setActiveModal({ type: 'continuity_auditor' }); break;
                    case 'vfx-master': setActiveModal({ type: 'vfx' }); break;
                    case 'audio-mixer': setActiveModal({ type: 'audio_mixer' }); break;
                    case 'youtube-optimizer': setActiveModal({ type: 'manifest' }); break;
                    case 'moodboard': setSelectedStudioPhase('genesis'); break;
                  }
                }}
              />
            </ErrorBoundary>

            {/* Mini production log */}
            <div className="nm-panel p-4 rounded-none border-t border-white/5 flex flex-col gap-3 bg-black/40 flex-shrink-0">
              <div className="flex items-center justify-between">
                <h3 className="text-[8px] font-black text-mystic-gray uppercase tracking-[0.3em] flex items-center gap-2">
                  <i className="fa-solid fa-terminal text-luna-gold text-[8px]"></i> Live Console
                </h3>
                <span className="text-[6px] font-mono text-mystic-gray opacity-30">SIGNAL_M_001</span>
              </div>
              <div className="space-y-1.5 max-h-28 overflow-y-auto scrollbar-hide">
                {project.productionLog.slice(0, 5).map(log => (
                  <div key={log.id} className="text-[7px] font-mono flex gap-2 leading-relaxed">
                    <span className="text-mystic-gray opacity-40 shrink-0 w-10">{new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' })}</span>
                    <span className={`truncate ${log.type === 'error' ? 'text-solar-amber' : log.type === 'ai_suggestion' ? 'text-luna-gold' : 'text-celestial-stone'}`}>
                      {log.message}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => setChatOpen(false)}
              className="absolute top-24 right-3 w-8 h-8 nm-button rounded-full flex items-center justify-center text-mystic-gray hover:text-white transition-all border border-white/5 text-[10px]"
            >
              <i className="fa-solid fa-chevron-right"></i>
            </button>
          </div>
        )}
      </aside>

      {/* ── QUALITY GATE MODAL (top-level, not inside aside) ─────────────── */}
      <QualityGateModal
        visible={qualityGateModal.visible}
        gates={qualityGateModal.gates}
        targetPhase={qualityGateModal.targetPhase || 'post'}
        onClose={() => setQualityGateModal(prev => ({ ...prev, visible: false }))}
        onProceed={() => {
          setQualityGateModal(prev => ({ ...prev, visible: false }));
          if (qualityGateModal.targetPhase) handleNavigatePhase(qualityGateModal.targetPhase);
        }}
        onFixGate={async (_gateOrId) => { /* auto-fix placeholder */ }}
        onOverride={() => {
          if (qualityGateModal.targetPhase) {
            handleNavigatePhase(qualityGateModal.targetPhase);
            setQualityGateModal(prev => ({ ...prev, visible: false }));
          }
        }}
      />

      {/* ── MODALS (single activeModal slot) ─────────────────────────────── */}
      {editingCharacter && (
        <CharacterModal
          character={editingCharacter}
          globalStyle={project.globalStyle}
          onClose={() => setEditingCharacter(null)}
          onSave={handleCharacterSave}
          onRegenerateImage={async (id) => {
            const char = project.characters.find(c => c.id === id)!;
            const img = await generateCharacterImage(char, resolution, project.globalStyle!, project.productionSeed);
            handleCharacterSave({ ...char, referenceImageBase64: img });
          }}
        />
      )}
      {inspectingScene && (
        <SceneInspector
          scene={inspectingScene}
          characters={project.characters}
          assetImage={project.assets[inspectingScene.id]?.imageUrl}
          onUpdate={s => setProject(p => ({ ...p, scenes: p.scenes.map(sc => sc.id === s.id ? s : sc) }))}
          onClose={() => setInspectingScene(null)}
        />
      )}
      {activeModal?.type === 'asset_library' && (
        <AssetLibrary assets={project.assets} scenes={project.scenes} onClose={closeModal} onSelect={sceneId => { closeModal(); scrollToScene(sceneId); }} />
      )}
      {activeModal?.type === 'audio_mixer' && (
        <AudioMixer mastering={project.mastering} onUpdate={u => setProject(p => ({ ...p, mastering: { ...p.mastering!, ...u } }))} onClose={closeModal} />
      )}
      {activeModal?.type === 'continuity_auditor' && (
        <ContinuityAuditor
          project={project}
          onSyncPrompts={(id, prompt) => setProject(p => ({ ...p, scenes: p.scenes.map(s => (s.charactersInScene || []).includes(p.characters.find(c => c.id === id)!.name) ? { ...s, visualPrompt: `${s.visualPrompt}. (Reference: ${prompt})` } : s) }))}
          onMarkScenesForRegeneration={handleMarkScenesForRegeneration}
          onClose={closeModal}
        />
      )}
      {activeModal?.type === 'consistency_dashboard' && (
        <ConsistencyDashboard project={project} onUpdateConsistencyScores={handleUpdateConsistencyScores} onMarkScenesForRegeneration={handleMarkScenesForRegeneration} onClose={closeModal} />
      )}
      {activeModal?.type === 'directorial_deck' && (
        <DirectorialDeck project={project} onClose={closeModal} />
      )}
      {activeModal?.type === 'broll' && (
        <BRollSuggestionModal suggestions={bRollSuggestions} onAccept={handleAddBRoll} onClose={closeModal} />
      )}
      {activeModal?.type === 'storyboard' && (
        <StoryboardView scenes={project.scenes} assets={project.assets} onSelectScene={sceneId => { closeModal(); scrollToScene(sceneId); }} onClose={closeModal} />
      )}
      {activeModal?.type === 'script_doctor' && (
        <ScriptDoctor project={project} onClose={closeModal} />
      )}
      {activeModal?.type === 'vfx' && (
        <VFXMaster
          mastering={project.mastering}
          cinematicProfile={project.cinematicProfile}
          lightingBrief={project.lightingBrief}
          onUpdateMastering={u => setProject(p => ({ ...p, mastering: { ...p.mastering!, ...u } }))}
          onUpdateProfile={p => setProject(prev => ({ ...prev, cinematicProfile: p }))}
          onUpdateLightingBrief={brief => setProject(prev => ({ ...prev, lightingBrief: brief }))}
          onClose={closeModal}
        />
      )}
      {activeModal?.type === 'manifest' && (
        <ProductionManifest project={project} youtubeMetadata={youtubeMetadata} onClose={closeModal} />
      )}
      {activeModal?.type === 'player' && (
        <Player scenes={project.scenes} assets={project.assets} mastering={project.mastering} onClose={closeModal} />
      )}
      {activeModal?.type === 'renderer' && (
        <ErrorBoundary>
          <Renderer
            scenes={project.scenes}
            assets={project.assets}
            resolution={resolution}
            aspectRatio={aspectRatio}
            globalStyle={project.globalStyle || "Cinematic"}
            mastering={project.mastering}
            cinematicProfile={project.cinematicProfile}
            outputFormat={serverRenderMode}
            onCancel={closeModal}
            onComplete={() => { }}
          />
        </ErrorBoundary>
      )}
      {project.activeDraft && (
        <DirectorDraftModal draft={project.activeDraft} scenes={project.scenes} onApply={handleApplyDraft} onDiscard={() => setProject(p => ({ ...p, activeDraft: null }))} />
      )}

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
                    <p className="text-2xl font-black text-solar-amber font-mono">{pendingBatchQueue.failed.length}</p>
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

      </Suspense>
      <ProductionMonitor isActive={isBatchProcessing} scenes={project.scenes} assets={project.assets} currentTask={currentTaskLabel} />
    </Layout>
  );
};

export default App;
