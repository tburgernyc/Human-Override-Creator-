
export interface CharacterPhysical {
  age: string;
  build: string;
  height: string;
  skinTone: string;
  hairColor: string;
  hairStyle: string;
  eyeColor: string;
  facialFeatures: string;
  distinctiveMarks: string;
  typicalAttire: string;
  colorPalette: string;
}

/** Immutable identity anchor generated once and locked per character.
 *  Every image/video generation call injects this verbatim. */
export interface CharacterDNA {
  facialGeometry: string;       // e.g. "oval face, high cheekbones, slightly asymmetric jaw"
  eyeSignature: string;         // e.g. "deep-set almond eyes, dark brown iris, heavy upper lid"
  hairSignature: string;        // e.g. "coarse black hair, undercut fade, always slightly disheveled"
  skinDescriptor: string;       // e.g. "warm medium-dark skin, Fitzpatrick IV, no blemishes"
  distinctiveMarks: string;     // e.g. "2cm diagonal scar upper left cheekbone"
  clothingCanon: string;        // e.g. "weathered olive field jacket, black turtleneck"
  heightBuild: string;          // e.g. "5'10\", lean athletic, broad shoulders"
  colorSignature: string[];     // Hex codes for outfit palette
  speechPattern: string;        // e.g. "clipped sentences, dry humor, rarely finishes thoughts"
  emotionalRange: string[];     // e.g. ["stoic", "explosive anger", "dry humor"]
  physicality: string;          // e.g. "slight forward lean, purposeful gait, crosses arms when thinking"
}

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
  physical?: CharacterPhysical;
  canonicalSeed?: number;
  referenceImageApproved?: boolean;
  characterDNA?: CharacterDNA;
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
export type ShotType = 'ELS' | 'LS' | 'MLS' | 'MS' | 'MCU' | 'CU' | 'ECU' | 'OTS' | 'POV' | 'INSERT';

export interface LightingBrief {
  keyLightDirection: 'left' | 'right' | 'front' | 'top' | 'rim';
  colorTemperature: 'warm 3200K' | 'neutral 5600K' | 'cool 7500K' | 'mixed';
  shadowIntensity: 'soft' | 'medium' | 'hard';
  timeOfDay: 'golden hour' | 'midday' | 'blue hour' | 'night' | 'interior';
  moodDescriptor: string;
}

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
  id: number;
  description: string;
  visualPrompt: string;
  cameraAngle?: string;
  cameraMotion?: CameraMotion;
  shotType?: ShotType;
  lighting?: string;
  charactersInScene: string[];
  narratorLines: DialogueLine[];
  estimatedDuration: number;
  actualAudioDuration?: number;  // Locked after TTS generation (seconds)
  musicMood: 'suspense' | 'action' | 'calm' | 'cheerful' | 'melancholic';
  ambientSfx?: 'none' | 'rain' | 'city_hum' | 'wind' | 'space_drone' | 'data_stream';
  sfxVolume?: number; // 0-100
  textOverlay?: TextOverlay;
  transition?: TransitionType;
  transitionDuration?: number;
  colorGrading?: ColorGrade;
  styleOverride?: string;
  productionNotes?: string;
  // Semantic metadata from two-phase script parsing
  emotionalBeat?: 'setup' | 'confrontation' | 'climax' | 'resolution' | 'transition';
  dominantEmotion?: 'tense' | 'hopeful' | 'melancholic' | 'triumphant' | 'mysterious' | 'neutral';
  suggestedColorPalette?: string[];  // Hex codes for scene color intent
  paceRating?: 'slow_burn' | 'moderate' | 'intense';
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
    sceneId: number;
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
  styleBible?: string;  // Auto-generated style guide (color palette, lens, transitions, typography)
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
  [sceneId: number]: {
    imageUrl?: string;
    videoUrl?: string;
    audioUrl?: string;
    status: 'pending' | 'generating_image' | 'generating_video' | 'generating_audio' | 'validating' | 'complete' | 'error';
    variants: AssetHistoryItem[];
    error?: string;
    seed?: number;
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

export type ProductionPhase = 'genesis' | 'manifest' | 'synthesis' | 'post';

export interface ToolUsageRecord {
  toolId: string;
  timestamp: number;
  result?: any;
}

export interface InterventionRecord {
  interventionId: string;
  timestamp: number;
  action: 'executed' | 'dismissed';
}

export interface PhaseProgress {
  completedSteps: string[];
  skippedSteps: string[];
  lastUpdated: number;
}

export interface ConsistencyScore {
  overall: number;
  face: number;
  hair: number;
  clothing: number;
  marks: number;
  lastAudit?: number;
  sceneScores?: Record<number, { score: number; issues: string[] }>;
}

export interface ProjectState {
  script: string;
  status: 'idle' | 'analyzing' | 'character_gen' | 'scene_gen' | 'animating' | 'audio_gen' | 'validating' | 'rendering' | 'ready';
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
  productionSeed: number;
  keyArtSceneId?: number;
  activeDraft?: DirectorDraft | null;
  cinematicProfile?: 'natural' | 'dreamy' | 'high_contrast' | 'vintage' | 'noir';
  lightingBrief?: LightingBrief;
  consistencyScores?: Record<string, ConsistencyScore>;
  mastering?: {
    musicVolume: number;
    voiceVolume: number;
    ambientVolume: number;
    filmGrain: number;
    bloomIntensity: number;
    vignetteIntensity: number;
    lightLeakIntensity: number;
    filmBurnIntensity: number;
    lutPreset?: 'none' | 'kodak_5219' | 'fuji_400h' | 'bleach_bypass' | 'vintage_faded' | 'clean_rec709';
  };

  // Workflow tracking
  workflowProgress?: Record<ProductionPhase, PhaseProgress>;
  toolUsageHistory?: ToolUsageRecord[];
  interventionHistory?: InterventionRecord[];
  directorMode?: 'guided' | 'expert';
  qualityGateOverrides?: string[];
  lastActivityTimestamp?: number;
}

export enum AspectRatio {
  SQUARE = "1:1",
  PORTRAIT = "9:16",
  LANDSCAPE = "16:9",
  WIDE = "21:9",
  STANDARD = "4:3"
}

export enum Resolution {
  HD = "720p",
  FHD = "1080p",
  UHD = "4k"
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
