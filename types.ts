
export interface Character {
  id: string;
  name: string;
  description: string;
  gender: 'Male' | 'Female';
  visualPrompt: string;
  voiceId: string;
  voiceSettings?: {
    speed: number;
    pitch: number;
  };
  referenceImageBase64?: string;
  // 3:1 composite (front | 3/4 | profile) used by Veo when present;
  // referenceImageBase64 is kept as a fallback for projects pre-Phase-14.
  turnaroundSheetBase64?: string;
}

export interface TextOverlay {
  text: string;
  position: 'top' | 'center' | 'bottom';
  style: 'title' | 'subtitle' | 'cinematic' | 'custom';
  fontFamily?: 'sans' | 'mono' | 'serif';
  fontSize?: number;
  textColor?: string;
  isBold?: boolean;
  isItalic?: boolean;
  isUnderline?: boolean;
  hasShadow?: boolean;
  animation?: 'fade' | 'slide_up' | 'typewriter' | 'zoom_in';
}

export type TransitionType = 'cut' | 'fade' | 'crossfade' | 'zoom_in' | 'zoom_out' | 'slide_left' | 'slide_right' | 'dissolve';
export type CameraMotion = 'static' | 'zoom_in' | 'zoom_out' | 'pan_left' | 'pan_right' | 'dolly_in' | 'dolly_out' | 'random_cinematic';

export interface ColorGrade {
  contrast: number;
  saturation: number;
  brightness: number;
  temperature: number;
  tint: number;
  exposure: number;
  vibrance: number;
}

export interface Scene {
  id: string;
  description: string;
  visualPrompt: string;
  cameraAngle?: string;
  cameraMotion?: CameraMotion;
  lighting?: string;
  charactersInScene: string[];
  narratorLines: DialogueLine[];
  estimatedDuration: number;
  musicMood: 'suspense' | 'action' | 'calm' | 'cheerful' | 'melancholic';
  // Optional pin to a specific track id (Q3). When set and the id exists in
  // the mood's pool, the renderer plays that track; otherwise it falls back
  // to a deterministic hash of sceneId into the pool.
  musicTrackId?: string;
  ambientSfx?: 'none' | 'rain' | 'city_hum' | 'wind' | 'space_drone' | 'data_stream';
  sfxVolume?: number; // 0-100
  textOverlay?: TextOverlay;
  transition?: TransitionType;
  transitionDuration?: number;
  colorGrading?: ColorGrade;
  styleOverride?: string;
  productionNotes?: string;
}

export interface DialogueLine {
  speaker: string;
  text: string;
  emotion?: 'neutral' | 'excited' | 'whispered' | 'serious' | 'shouting' | 'empathetic' | 'sarcastic';
}

export interface DirectorDraft {
  id: string;
  timestamp: number;
  reasoning: string;
  proposedChanges: {
    sceneId: string;
    updates: Partial<Scene>;
  }[];
  status: 'pending' | 'applied' | 'discarded';
}

export interface ProductionTask {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export interface ProjectModules {
  concept?: string;
  logline?: string;
  outline?: string;
}

export interface ChatMessage {
  role: 'user' | 'model' | 'system';
  content: string;
}

export interface AssetHistoryItem {
  imageUrl?: string;
  videoUrl?: string;
  timestamp: number;
}

export interface GeneratedAssets {
  [sceneId: string]: {
    imageUrl?: string;
    videoUrl?: string;
    // Remote Veo URI for the same video — kept alongside the base64 videoUrl so
    // extendSceneVideo can reference the original operation output (the extend
    // endpoint rejects base64 data URIs).
    videoUri?: string;
    audioUrl?: string;
    // Stable snapshot of the narratorLines that produced audioUrl. When the
    // scene's narratorLines drift from this, the SceneInspector flags audio as stale.
    narrationHash?: string;
    status: 'pending' | 'generating_image' | 'generating_video' | 'generating_audio' | 'validating' | 'complete' | 'error';
    variants: AssetHistoryItem[];
    error?: string;
  };
}

export interface LogEntry {
  id: string;
  timestamp: number;
  type: 'system' | 'ai_suggestion' | 'error' | 'success';
  message: string;
  actionLabel?: string;
  actionId?: string;
  actionParams?: any;
}

export interface ViralPotential {
  hookScore: number;
  retentionCatalysts: string[];
  engagementFriction: string[];
  heatmap: number[];
  predictionSummary: string;
}

export interface YoutubeMetadata {
  hookScore: number;
  audience: string;
  suggestedTitles: string[];
}

export interface ProjectState {
  // Stable identifier so IndexedDB asset storage is scoped per-project rather than
  // sharing a single 'active' record (which made two tabs stomp each other and
  // made archive switching ambiguous). Generated on project creation.
  projectId: string;
  script: string;
  // 'analyzed' = script parsed + characters synthesized, no scene assets generated yet.
  // 'ready' = every scene has a complete asset bundle (img + video + audio); export is safe.
  // Promotion 'analyzed' → 'ready' happens automatically when all scenes complete (see App.tsx).
  status: 'idle' | 'analyzing' | 'character_gen' | 'scene_gen' | 'animating' | 'audio_gen' | 'validating' | 'rendering' | 'analyzed' | 'ready';
  characters: Character[];
  scenes: Scene[];
  assets: GeneratedAssets;
  tasks: ProductionTask[];
  modules: ProjectModules;
  productionLog: LogEntry[];
  currentStepMessage: string;
  renderUrl?: string;
  globalStyle?: string;
  viralData?: ViralPotential;
  youtubeMetadata?: YoutubeMetadata;
  productionSeed: number;
  keyArtSceneId?: string;
  activeDraft?: DirectorDraft | null;
  cinematicProfile?: 'natural' | 'dreamy' | 'high_contrast' | 'vintage' | 'noir';
  mastering?: {
    musicVolume: number;
    voiceVolume: number;
    ambientVolume: number;
    filmGrain: number;
    bloomIntensity: number;
    vignetteIntensity: number;
    lightLeakIntensity: number;
    filmBurnIntensity: number;
    lutPreset?: LutPreset;
  };
}

// Phase 14: real .cube file LUTs applied at transcode. Old enum values map
// to these via normalizeLutPreset() in App.tsx at read time.
export const LUT_PRESETS = [
  'none',
  'kodak_vision3_250d',
  'fuji_eterna_250d',
  'kodak_2383',
  'arri_logc_to_rec709',
  'bleach_bypass',
] as const;
export type LutPreset = typeof LUT_PRESETS[number];

export enum AspectRatio {
  SQUARE = "1:1",
  PORTRAIT = "9:16",
  LANDSCAPE = "16:9",
  WIDE = "21:9",
  STANDARD = "4:3"
}

export enum Resolution {
  HD = "720p",
  FHD = "1080p"
}

// G10 (audit slice) — RenderManifest is the JSON payload the client posts to
// POST /api/render. The server uses it to drive an ffmpeg compose pipeline
// (scene-video concat + per-scene TTS mix + LUT/vignette/grain pass + xfade
// transitions) that produces a single MP4 without depending on the browser's
// MediaRecorder. Replaces the client-side Renderer for long projects where
// a multi-minute single-pass canvas record is unreliable.
//
// Asset bytes (audio) ride inline as base64 so the manifest is a single JSON
// POST. The server fetches the Veo videos itself via the existing
// /api/download proxy, which avoids round-tripping the (much larger) video
// blobs through the client.

export type RenderManifestTransition = 'fade' | 'cut' | 'dissolve' | 'wipe';

export interface RenderManifestScene {
    /** Stable id from ProjectState.scenes — useful for server log correlation. */
    id: string;
    /** Veo remote URI for this scene's video clip. The server downloads via /api/download. */
    videoUri: string;
    /** TTS audio as a data URI (data:audio/wav;base64,…) or bare base64. Empty/omitted = no narration. */
    audioBase64?: string;
    /** Seconds — the rendered scene clip length. Server clamps to fit audio when present. */
    estimatedDuration: number;
    /** Transition INTO the next scene. The final scene's value is ignored. */
    transitionToNext?: RenderManifestTransition;
    /** Mood key for music-track selection (matches the client's MUSIC_TRACKS map). */
    mood?: string;
}

export interface RenderManifestMastering {
    lutPreset?: LutPreset;
    /** All four volumes in 0..1, matching the client mastering schema. */
    musicVolume: number;
    voiceVolume: number;
    ambientVolume: number;
    filmGrain: number;
    vignetteIntensity: number;
}

export interface RenderManifest {
    /** Bumped whenever the schema changes; server rejects mismatched versions with 400. */
    schemaVersion: 1;
    /** Project identifier — used for server logs and tmp-dir naming. */
    projectId: string;
    aspectRatio: '16:9' | '9:16' | '1:1';
    resolution: '720p' | '1080p';
    /** Optional descriptive style string forwarded for log lines; not used by ffmpeg. */
    globalStyle?: string;
    scenes: RenderManifestScene[];
    mastering: RenderManifestMastering;
}

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
  interface Window {
    aistudio?: AIStudio;
    webkitAudioContext?: typeof AudioContext;
  }
}
