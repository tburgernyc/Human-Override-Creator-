export const MODEL_NAMES = {
  THINKING: 'gemini-3-pro-preview',
  IMAGE: 'gemini-3-pro-image-preview',
  VIDEO: 'veo-3.1-generate-preview',
  VIDEO_FAST: 'veo-3.1-fast-generate-preview',
  TTS: 'gemini-2.5-flash-preview-tts',
  CHECK: 'gemini-3-flash-preview',
};

export interface VoicePreset {
  id: string;
  label: string;
  gender: 'Male' | 'Female';
  apiVoiceName: string;
  defaultPitch: number;
  defaultSpeed: number;
}

export const VOICE_PRESETS: VoicePreset[] = [
  // Female Voices (6)
  { id: 'kore_std', label: 'Kore (Female - Balanced)', gender: 'Female', apiVoiceName: 'Kore', defaultPitch: 0, defaultSpeed: 1 },
  { id: 'kore_soft', label: 'Kore (Female - Soft)', gender: 'Female', apiVoiceName: 'Kore', defaultPitch: -2, defaultSpeed: 0.95 },
  { id: 'kore_bright', label: 'Kore (Female - Bright)', gender: 'Female', apiVoiceName: 'Kore', defaultPitch: 2, defaultSpeed: 1.1 },
  { id: 'zephyr_std', label: 'Zephyr (Female - Calm)', gender: 'Female', apiVoiceName: 'Zephyr', defaultPitch: 0, defaultSpeed: 1 },
  { id: 'zephyr_deep', label: 'Zephyr (Female - Deep)', gender: 'Female', apiVoiceName: 'Zephyr', defaultPitch: -3, defaultSpeed: 0.9 },
  { id: 'zephyr_fast', label: 'Zephyr (Female - Energetic)', gender: 'Female', apiVoiceName: 'Zephyr', defaultPitch: 1, defaultSpeed: 1.2 },
  
  // Male Voices (6)
  { id: 'fenrir_std', label: 'Fenrir (Male - Deep)', gender: 'Male', apiVoiceName: 'Fenrir', defaultPitch: 0, defaultSpeed: 1 },
  { id: 'fenrir_intense', label: 'Fenrir (Male - Intense)', gender: 'Male', apiVoiceName: 'Fenrir', defaultPitch: -2, defaultSpeed: 1.1 },
  { id: 'charon_std', label: 'Charon (Male - Gravelly)', gender: 'Male', apiVoiceName: 'Charon', defaultPitch: 0, defaultSpeed: 1 },
  { id: 'charon_old', label: 'Charon (Male - Elder)', gender: 'Male', apiVoiceName: 'Charon', defaultPitch: -4, defaultSpeed: 0.85 },
  { id: 'puck_std', label: 'Puck (Male - Playful)', gender: 'Male', apiVoiceName: 'Puck', defaultPitch: 0, defaultSpeed: 1 },
  { id: 'puck_energetic', label: 'Puck (Male - Fast)', gender: 'Male', apiVoiceName: 'Puck', defaultPitch: 2, defaultSpeed: 1.15 },
];

export const VISUAL_STYLES = [
  'Cinematic Photorealistic',
  'Cyberpunk Neon',
  'Dark Fantasy',
  'Sci-Fi Noir',
  'Anime Production',
  '3D Pixar Style',
  'Vintage 1950s',
  'Watercolor Painting',
  'Oil Painting',
  'Black and White Film'
];

// Using GitHub pages or similar reliable CDN is safer for CORS, but keeping Pixabay with fallback logic is acceptable.
// Ensure these are Direct Downloads.
export const MUSIC_TRACKS = {
  suspense: "https://cdn.pixabay.com/download/audio/2022/03/24/audio_c8c8a73467.mp3", // Dark Mystery
  action: "https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3", // Epic Cinematic
  calm: "https://cdn.pixabay.com/download/audio/2022/02/07/audio_13b567d025.mp3", // Ambient
  cheerful: "https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3", // Upbeat
  melancholic: "https://cdn.pixabay.com/download/audio/2021/11/24/audio_8250811e61.mp3", // Sad Piano
};

export const INITIAL_SCRIPT_PLACEHOLDER = `Title: The Future of Quantum Computing

[Scene: A futuristic lab with a quantum computer glowing in the center.]
Narrator: Quantum computing is not just faster; it's a fundamental shift in how we process information.

[Scene: Close up of a microchip with data streams flowing around it.]
Narrator: While classical computers think in ones and zeros, quantum bits exist in a state of superposition.

[Scene: A visualization of a complex molecule being simulated.]
Narrator: This allows us to solve problems in seconds that would take supercomputers thousands of years.`;