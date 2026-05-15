export const MODEL_NAMES = {
  THINKING: 'gemini-2.5-pro',
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

// Royalty-free music from Wikimedia Commons (public domain, no auth needed).
// All URLs were resolved against the Commons imageinfo API on 2026-05-14 —
// the pre-Q3 set was entirely 404 (made-up filenames). When picking a track at
// render time we deterministically hash sceneId → pool index so the same scene
// always gets the same track across re-renders, but a long project sees
// varied music across scenes within a mood.
export type MusicMood = 'suspense' | 'action' | 'calm' | 'cheerful' | 'melancholic';

export interface MusicTrack {
  id: string;
  title: string;
  url: string;
}

export const MUSIC_TRACKS: Record<MusicMood, MusicTrack[]> = {
  suspense: [
    { id: 'mussorgsky_bald_mountain', title: 'Mussorgsky — Night on Bald Mountain', url: 'https://upload.wikimedia.org/wikipedia/commons/c/ca/Modest_Mussorgsky_-_night_on_bald_mountain.ogg' },
    { id: 'holst_mars', title: 'Holst — Mars, the Bringer of War', url: 'https://upload.wikimedia.org/wikipedia/commons/8/85/Holst-_mars.ogg' },
    { id: 'beethoven_5_mvt1', title: 'Beethoven — Symphony No. 5, mvt 1', url: 'https://upload.wikimedia.org/wikipedia/commons/5/5b/Ludwig_van_Beethoven_-_Symphonie_5_c-moll_-_1._Allegro_con_brio.ogg' },
  ],
  action: [
    { id: 'vivaldi_summer_presto', title: 'Vivaldi — Four Seasons: Summer, Presto', url: 'https://upload.wikimedia.org/wikipedia/commons/f/fa/Vivaldi_-_Four_Seasons_2_Summer_mvt_3_Presto_-_John_Harrison_violin.oga' },
    { id: 'vivaldi_spring_allegro', title: 'Vivaldi — Four Seasons: Spring, Allegro', url: 'https://upload.wikimedia.org/wikipedia/commons/f/ff/Vivaldi_-_Four_Seasons_1_Spring_mvt_1_Allegro_-_John_Harrison_violin.oga' },
    { id: 'bach_brandenburg_3_1', title: 'Bach — Brandenburg Concerto 3, Allegro', url: 'https://upload.wikimedia.org/wikipedia/commons/b/b0/Bach_-_Brandenburg_Concerto_No._3_-_1._Allegro.ogg' },
    { id: 'tchaikovsky_1812', title: 'Tchaikovsky — 1812 Overture', url: 'https://upload.wikimedia.org/wikipedia/commons/0/08/1812_Overture%2C_Op._48_-_Pyotr_Ilyich_Tchaikovsky.ogg' },
  ],
  calm: [
    { id: 'satie_gymnopedie_3', title: 'Satie — Gymnopedie No. 3', url: 'https://upload.wikimedia.org/wikipedia/commons/2/25/Erik_Satie_-_Gymnopedie_No.3_-_Arr_for_soprano_saxophone_and_strings_-_David_Hernando_Vitores.ogg' },
    { id: 'bach_air_g', title: 'Bach — Air on the G String', url: 'https://upload.wikimedia.org/wikipedia/commons/1/1e/Air_%28Bach%29.ogg' },
    { id: 'tchaikovsky_sugar_plum', title: 'Tchaikovsky — Dance of the Sugar Plum Fairy', url: 'https://upload.wikimedia.org/wikipedia/commons/9/9d/Tchaikovsky_-_Dance_of_the_Sugar_Plum_Fairy_-_The_Nutcracker.ogg' },
  ],
  cheerful: [
    { id: 'bach_brandenburg_1_1', title: 'Bach — Brandenburg Concerto 1, Allegro', url: 'https://upload.wikimedia.org/wikipedia/commons/f/f4/Bach_-_Brandenburg_Concerto_No._1_-_1._Allegro.ogg' },
    { id: 'grieg_holberg_rigaudon', title: 'Grieg — Holberg Suite: Rigaudon', url: 'https://upload.wikimedia.org/wikipedia/commons/b/b6/Grieg_Holberg_Suite_5_Rigaudon.ogg' },
    { id: 'grieg_holberg_praeludium', title: 'Grieg — Holberg Suite: Praeludium', url: 'https://upload.wikimedia.org/wikipedia/commons/f/f3/Grieg_Holberg_Suite_1_Praeludium.ogg' },
    { id: 'strauss_blue_danube', title: 'Strauss — Blue Danube', url: 'https://upload.wikimedia.org/wikipedia/commons/9/91/Strauss%2C_An_der_sch%C3%B6nen_blauen_Donau.ogg' },
    { id: 'vivaldi_spring_3', title: 'Vivaldi — Four Seasons: Spring, Allegro (mvt 3)', url: 'https://upload.wikimedia.org/wikipedia/commons/d/d9/Vivaldi_-_Four_Seasons_1_Spring_mvt_3_Allegro_-_John_Harrison_violin.oga' },
  ],
  melancholic: [
    { id: 'chopin_nocturne_op32', title: 'Chopin — Nocturne Op. 32 No. 1', url: 'https://upload.wikimedia.org/wikipedia/commons/a/a7/Chopin%2C_Nocturne_op_32_no_1.ogg' },
    { id: 'albinoni_adagio', title: 'Albinoni — Adagio in G minor', url: 'https://upload.wikimedia.org/wikipedia/commons/e/e1/Tomaso_Giovanni_Albinoni_-_Adagio_in_G_minor_-_Arr_for_alto_saxophone_and_piano_-_David_Hernando_Vitores.ogg' },
    { id: 'mozart_40_andante', title: 'Mozart — Symphony 40, Andante', url: 'https://upload.wikimedia.org/wikipedia/commons/5/53/Mozart_Symphony_40_G_minor_-_2_Andante.oga' },
  ],
};

// Pick a track for a scene. If musicTrackId is set and matches a track in the
// pool, use it. Otherwise hash sceneId into the pool deterministically so
// re-renders are stable and a long project doesn't repeat the same track every
// scene of the same mood. Returns undefined if the mood pool is empty.
export const pickMusicTrack = (mood: MusicMood, musicTrackId: string | undefined, sceneId: string): MusicTrack | undefined => {
  const pool = MUSIC_TRACKS[mood];
  if (!pool || pool.length === 0) return undefined;
  if (musicTrackId) {
    const explicit = pool.find(t => t.id === musicTrackId);
    if (explicit) return explicit;
  }
  let hash = 0;
  for (let i = 0; i < sceneId.length; i++) hash = ((hash << 5) - hash + sceneId.charCodeAt(i)) | 0;
  return pool[Math.abs(hash) % pool.length];
};

// Flat list of legal track IDs grouped by mood, for the analyze prompt schema.
export const MUSIC_TRACK_IDS_BY_MOOD: Record<MusicMood, string[]> = Object.fromEntries(
  (Object.entries(MUSIC_TRACKS) as [MusicMood, MusicTrack[]][]).map(([mood, tracks]) => [mood, tracks.map(t => t.id)])
) as Record<MusicMood, string[]>;

export const INITIAL_SCRIPT_PLACEHOLDER = `Title: The Future of Quantum Computing

[Scene: A futuristic lab with a quantum computer glowing in the center.]
Narrator: Quantum computing is not just faster; it's a fundamental shift in how we process information.

[Scene: Close up of a microchip with data streams flowing around it.]
Narrator: While classical computers think in ones and zeros, quantum bits exist in a state of superposition.

[Scene: A visualization of a complex molecule being simulated.]
Narrator: This allows us to solve problems in seconds that would take supercomputers thousands of years.`;