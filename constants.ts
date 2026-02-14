export const MODEL_NAMES = {
  THINKING: 'gemini-2.0-flash',
  IMAGE: 'gemini-2.5-flash-image', // Use dedicated image generation model for better quality
  VIDEO: 'veo-2.0-generate-preview',
  VIDEO_FAST: 'veo-2.0-generate-preview',
  TTS: 'gemini-2.0-flash',
  CHECK: 'gemini-2.0-flash',
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
  // === FEMALE VOICES ===
  // Kore
  { id: 'kore_std', label: 'Kore (Female - Balanced)', gender: 'Female', apiVoiceName: 'Kore', defaultPitch: 0, defaultSpeed: 1 },
  { id: 'kore_soft', label: 'Kore (Female - Soft)', gender: 'Female', apiVoiceName: 'Kore', defaultPitch: -2, defaultSpeed: 0.95 },
  { id: 'kore_bright', label: 'Kore (Female - Bright)', gender: 'Female', apiVoiceName: 'Kore', defaultPitch: 2, defaultSpeed: 1.1 },
  // Zephyr
  { id: 'zephyr_std', label: 'Zephyr (Female - Calm)', gender: 'Female', apiVoiceName: 'Zephyr', defaultPitch: 0, defaultSpeed: 1 },
  { id: 'zephyr_deep', label: 'Zephyr (Female - Deep)', gender: 'Female', apiVoiceName: 'Zephyr', defaultPitch: -3, defaultSpeed: 0.9 },
  { id: 'zephyr_fast', label: 'Zephyr (Female - Energetic)', gender: 'Female', apiVoiceName: 'Zephyr', defaultPitch: 1, defaultSpeed: 1.2 },
  // Aoede
  { id: 'aoede_std', label: 'Aoede (Female - Warm & Polished)', gender: 'Female', apiVoiceName: 'Aoede', defaultPitch: 0, defaultSpeed: 1 },
  { id: 'aoede_slow', label: 'Aoede (Female - Narrator)', gender: 'Female', apiVoiceName: 'Aoede', defaultPitch: -1, defaultSpeed: 0.9 },
  // Achernar
  { id: 'achernar_std', label: 'Achernar (Female - Vibrant & Youthful)', gender: 'Female', apiVoiceName: 'Achernar', defaultPitch: 0, defaultSpeed: 1 },
  { id: 'achernar_fast', label: 'Achernar (Female - Enthusiastic)', gender: 'Female', apiVoiceName: 'Achernar', defaultPitch: 1, defaultSpeed: 1.15 },
  // Achird
  { id: 'achird_std', label: 'Achird (Female - Friendly & Inquisitive)', gender: 'Female', apiVoiceName: 'Achird', defaultPitch: 0, defaultSpeed: 1 },
  // Algenib
  { id: 'algenib_std', label: 'Algenib (Female - Confident & Warm)', gender: 'Female', apiVoiceName: 'Algenib', defaultPitch: 0, defaultSpeed: 1 },
  // Autonoe
  { id: 'autonoe_std', label: 'Autonoe (Female - Bright)', gender: 'Female', apiVoiceName: 'Autonoe', defaultPitch: 0, defaultSpeed: 1 },
  // Callirrhoe
  { id: 'callirrhoe_std', label: 'Callirrhoe (Female - Easy-Going)', gender: 'Female', apiVoiceName: 'Callirrhoe', defaultPitch: 0, defaultSpeed: 1 },
  // Despina
  { id: 'despina_std', label: 'Despina (Female - Smooth)', gender: 'Female', apiVoiceName: 'Despina', defaultPitch: 0, defaultSpeed: 1 },
  // Erinome
  { id: 'erinome_std', label: 'Erinome (Female - Professional & Clear)', gender: 'Female', apiVoiceName: 'Erinome', defaultPitch: 0, defaultSpeed: 1 },
  { id: 'erinome_slow', label: 'Erinome (Female - Measured)', gender: 'Female', apiVoiceName: 'Erinome', defaultPitch: -1, defaultSpeed: 0.9 },
  // Laomedeia
  { id: 'laomedeia_std', label: 'Laomedeia (Female - Upbeat & Engaging)', gender: 'Female', apiVoiceName: 'Laomedeia', defaultPitch: 0, defaultSpeed: 1 },
  // Leda
  { id: 'leda_std', label: 'Leda (Female - Vibrant & Youthful)', gender: 'Female', apiVoiceName: 'Leda', defaultPitch: 0, defaultSpeed: 1 },
  { id: 'leda_fast', label: 'Leda (Female - High Energy)', gender: 'Female', apiVoiceName: 'Leda', defaultPitch: 1, defaultSpeed: 1.15 },
  // Pulcherrima
  { id: 'pulcherrima_std', label: 'Pulcherrima (Female - Forward)', gender: 'Female', apiVoiceName: 'Pulcherrima', defaultPitch: 0, defaultSpeed: 1 },
  // Sulafat
  { id: 'sulafat_std', label: 'Sulafat (Female - Warm & Persuasive)', gender: 'Female', apiVoiceName: 'Sulafat', defaultPitch: 0, defaultSpeed: 1 },
  // Vindemiatrix
  { id: 'vindemiatrix_std', label: 'Vindemiatrix (Female - Calm & Composed)', gender: 'Female', apiVoiceName: 'Vindemiatrix', defaultPitch: 0, defaultSpeed: 1 },
  { id: 'vindemiatrix_slow', label: 'Vindemiatrix (Female - Reflective)', gender: 'Female', apiVoiceName: 'Vindemiatrix', defaultPitch: -2, defaultSpeed: 0.85 },

  // === MALE VOICES ===
  // Fenrir
  { id: 'fenrir_std', label: 'Fenrir (Male - Deep)', gender: 'Male', apiVoiceName: 'Fenrir', defaultPitch: 0, defaultSpeed: 1 },
  { id: 'fenrir_intense', label: 'Fenrir (Male - Intense)', gender: 'Male', apiVoiceName: 'Fenrir', defaultPitch: -2, defaultSpeed: 1.1 },
  // Charon
  { id: 'charon_std', label: 'Charon (Male - Gravelly)', gender: 'Male', apiVoiceName: 'Charon', defaultPitch: 0, defaultSpeed: 1 },
  { id: 'charon_old', label: 'Charon (Male - Elder)', gender: 'Male', apiVoiceName: 'Charon', defaultPitch: -4, defaultSpeed: 0.85 },
  // Puck
  { id: 'puck_std', label: 'Puck (Male - Playful)', gender: 'Male', apiVoiceName: 'Puck', defaultPitch: 0, defaultSpeed: 1 },
  { id: 'puck_energetic', label: 'Puck (Male - Fast)', gender: 'Male', apiVoiceName: 'Puck', defaultPitch: 2, defaultSpeed: 1.15 },
  // Alnilam
  { id: 'alnilam_std', label: 'Alnilam (Male - Firm & Energetic)', gender: 'Male', apiVoiceName: 'Alnilam', defaultPitch: 0, defaultSpeed: 1 },
  { id: 'alnilam_fast', label: 'Alnilam (Male - Announcer)', gender: 'Male', apiVoiceName: 'Alnilam', defaultPitch: -1, defaultSpeed: 1.1 },
  // Enceladus
  { id: 'enceladus_std', label: 'Enceladus (Male - Breathy)', gender: 'Male', apiVoiceName: 'Enceladus', defaultPitch: 0, defaultSpeed: 1 },
  // Gacrux
  { id: 'gacrux_std', label: 'Gacrux (Male - Mature & Smooth)', gender: 'Male', apiVoiceName: 'Gacrux', defaultPitch: 0, defaultSpeed: 1 },
  { id: 'gacrux_deep', label: 'Gacrux (Male - Authoritative)', gender: 'Male', apiVoiceName: 'Gacrux', defaultPitch: -2, defaultSpeed: 0.95 },
  // Iapetus
  { id: 'iapetus_std', label: 'Iapetus (Male - Clear)', gender: 'Male', apiVoiceName: 'Iapetus', defaultPitch: 0, defaultSpeed: 1 },
  // Orus
  { id: 'orus_std', label: 'Orus (Male - Firm & Authoritative)', gender: 'Male', apiVoiceName: 'Orus', defaultPitch: 0, defaultSpeed: 1 },
  { id: 'orus_deep', label: 'Orus (Male - Commander)', gender: 'Male', apiVoiceName: 'Orus', defaultPitch: -2, defaultSpeed: 0.9 },
  // Rasalgethi
  { id: 'rasalgethi_std', label: 'Rasalgethi (Male - Informative)', gender: 'Male', apiVoiceName: 'Rasalgethi', defaultPitch: 0, defaultSpeed: 1 },
  // Sadachbia
  { id: 'sadachbia_std', label: 'Sadachbia (Male - Lively)', gender: 'Male', apiVoiceName: 'Sadachbia', defaultPitch: 0, defaultSpeed: 1 },
  // Sadaltager
  { id: 'sadaltager_std', label: 'Sadaltager (Male - Knowledgeable)', gender: 'Male', apiVoiceName: 'Sadaltager', defaultPitch: 0, defaultSpeed: 1 },
  // Schedar
  { id: 'schedar_std', label: 'Schedar (Male - Casual & Relatable)', gender: 'Male', apiVoiceName: 'Schedar', defaultPitch: 0, defaultSpeed: 1 },
  // Umbriel
  { id: 'umbriel_std', label: 'Umbriel (Male - Smooth & Trustworthy)', gender: 'Male', apiVoiceName: 'Umbriel', defaultPitch: 0, defaultSpeed: 1 },
  { id: 'umbriel_deep', label: 'Umbriel (Male - Documentary)', gender: 'Male', apiVoiceName: 'Umbriel', defaultPitch: -2, defaultSpeed: 0.9 },
  // Zubenelgenubi
  { id: 'zubenelgenubi_std', label: 'Zubenelgenubi (Male - Deep & Commanding)', gender: 'Male', apiVoiceName: 'Zubenelgenubi', defaultPitch: 0, defaultSpeed: 1 },
  { id: 'zubenelgenubi_trailer', label: 'Zubenelgenubi (Male - Movie Trailer)', gender: 'Male', apiVoiceName: 'Zubenelgenubi', defaultPitch: -3, defaultSpeed: 0.85 },
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

// Royalty-free music from public CDNs (no authentication required).
// These are curated for cinematic production quality.
export const MUSIC_TRACKS: Record<string, string> = {
  suspense: "https://upload.wikimedia.org/wikipedia/commons/5/5a/Suspense_strings.ogg",
  action: "https://upload.wikimedia.org/wikipedia/commons/4/4e/04_-_Vivaldi_Summer_mvt_3_Presto_-_John_Harrison_violin.ogg",
  calm: "https://upload.wikimedia.org/wikipedia/commons/e/e3/Clair_de_Lune_-_Claude_Debussy.ogg",
  cheerful: "https://upload.wikimedia.org/wikipedia/commons/6/6d/Grieg_Holberg_Suite_Rigaudon.ogg",
  melancholic: "https://upload.wikimedia.org/wikipedia/commons/1/1f/Chopin_-_Nocturne_op.9_no.2.ogg",
};

export const INITIAL_SCRIPT_PLACEHOLDER = `Title: The Future of Quantum Computing

[Scene: A futuristic lab with a quantum computer glowing in the center.]
Narrator: Quantum computing is not just faster; it's a fundamental shift in how we process information.

[Scene: Close up of a microchip with data streams flowing around it.]
Narrator: While classical computers think in ones and zeros, quantum bits exist in a state of superposition.

[Scene: A visualization of a complex molecule being simulated.]
Narrator: This allows us to solve problems in seconds that would take supercomputers thousands of years.`;