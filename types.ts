
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
  id: number;
  description: string;
  visualPrompt: string;
  cameraAngle?: string;
  cameraMotion?: CameraMotion;
  lighting?: string;
  charactersInScene: string[];
  narratorLines: DialogueLine[];
  estimatedDuration: number;
  musicMood: 'suspense' | 'action' | 'calm' | 'cheerful' | 'melancholic';
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
  mastering?: {
    musicVolume: number; 
    voiceVolume: number; 
    ambientVolume: number; 
    filmGrain: number;   
    bloomIntensity: number; 
    vignetteIntensity: number; 
    lightLeakIntensity: number; 
    filmBurnIntensity: number; 
    lutPreset?: 'none' | 'kodak_5219' | 'fuji_400h' | 'noir' | 'technicolor';
  };
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
  FHD = "1080p"
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
