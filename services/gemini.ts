
import { GoogleGenAI, Type, Modality, HarmCategory, HarmBlockThreshold, GenerateContentResponse, FunctionDeclaration, LiveServerMessage } from "@google/genai";
import { MODEL_NAMES, VOICE_PRESETS, VoicePreset, MUSIC_TRACKS } from "../constants";
import { Character, Scene, DialogueLine, AspectRatio, Resolution, ProjectState, ProductionTask, ProjectModules, ViralPotential, DirectorDraft } from "../types";

const cleanJsonResponse = (text: string): string => {
  let clean = text.trim();
  if (clean.startsWith('```json')) {
    clean = clean.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (clean.startsWith('```')) {
    clean = clean.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }
  return clean;
};

// Parses a Gemini text response that is expected to contain JSON. On failure,
// surfaces the raw response so a malformed/safety-filtered reply doesn't
// silently turn into an empty object.
const parseJsonResponse = <T = any>(text: string | undefined, fallback?: T): T => {
  const raw = text || '';
  const cleaned = cleanJsonResponse(raw);
  if (!cleaned) {
    if (fallback !== undefined) return fallback;
    throw new Error('Gemini returned an empty response (likely safety-filtered).');
  }
  try {
    return JSON.parse(cleaned);
  } catch (e: any) {
    const preview = raw.slice(0, 500);
    throw new Error(`Failed to parse JSON response from Gemini: ${e.message}\nFirst 500 chars: ${preview}`);
  }
};

// Strips the `data:<mime>;base64,` prefix from a data URI. Throws if no
// comma is present — preferable to silently passing undefined downstream.
const stripDataUriPrefix = (s: string): string => {
  const idx = s.indexOf(',');
  if (idx < 0) throw new Error('Expected data URI with base64 prefix, got raw string.');
  return s.slice(idx + 1);
};

// Routes all SDK calls through the secure API proxy, keeping the API key server-side.
// In production (Vercel), uses the current page's origin so no env var is needed.
// Locally, falls back to VITE_PROXY_URL or the Express dev proxy on port 3001.
const PROXY_BASE_URL: string = import.meta.env?.VITE_PROXY_URL ??
  (typeof window !== 'undefined'
    ? `${window.location.origin}/api/gemini`
    : 'http://localhost:3001/api/gemini');

const getAIClient = (): GoogleGenAI => {
  // apiVersion: '' prevents the SDK from prepending 'v1beta/' to paths.
  // The proxy re-adds it when forwarding to googleapis.com.
  return new GoogleGenAI({ apiKey: 'proxy', httpOptions: { baseUrl: PROXY_BASE_URL, apiVersion: '' } });
};

// Promise-race timeout. Without this, a hung connection (e.g. captive WiFi
// intercepting TLS, or a stalled upstream) waits for the OS-level give-up,
// which can be several minutes — long enough that users assume the app is broken.
const withTimeout = <T>(promise: Promise<T>, ms: number, label: string): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });

const retryWithBackoff = async <T>(
  operation: () => Promise<T>,
  retries: number = 4,
  initialDelay: number = 6000
): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    // The SDK throws plain Error subclasses but doesn't export a typed shape
    // for `.status` / `.code`, so narrow defensively rather than cast to any (CH3).
    const err = error as { status?: unknown; code?: unknown; message?: unknown };
    const isRateLimit =
      err.status === 429 ||
      err.code === 429 ||
      (typeof err.message === 'string' && (
        err.message.includes('429') ||
        err.message.includes('quota') ||
        err.message.includes('RESOURCE_EXHAUSTED')
      ));

    if (isRateLimit && retries > 0) {
      await new Promise(resolve => setTimeout(resolve, initialDelay));
      return retryWithBackoff(operation, retries - 1, initialDelay * 2);
    }
    throw error;
  }
};

const OVERRIDE_BOT_SYSTEM_INSTRUCTION = `
Act as OverrideBot, an action-oriented AI copilot for the Human Override Video Creation Tool.
You are a hybrid of Executive Producer, Story Editor, Scriptwriter, and Research Assistant.

PRINCIPLES:
1. Action-first: Propose concrete next steps and execute via tools.
2. Minimize back-and-forth: Deliver usable outputs immediately.
3. Structured outputs: Always follow the A–E response format.
4. Asset-aware: Use existing images/videos/characters in your logic.
5. Continuity-aware: Preserve project tone and character details.

RESPONSE CONTRACT (MANDATORY STRUCTURE):
A. QUICK DIAGNOSIS: Project status, biggest bottleneck, and immediate plan.
B. DELIVERABLES: Ready-to-use content (scripts, metadata, titles).
C. NEXT ACTIONS: Specific tasks for the user or the app.
D. QUESTIONS: Max 3 required clarifications.
E. ASSUMPTIONS: List any narrative or production assumptions.

STYLE: Urgent, cinematic, investigative, plausible dystopian. Use short sentences and active voice.
`;

export const handleDirectorChat = async (message: string, currentProject: ProjectState, chatHistory: { role: 'user' | 'model', content: string }[]): Promise<GenerateContentResponse> => {
  const ai = getAIClient();

  const tools: FunctionDeclaration[] = [
    { name: 'get_project_context', description: 'Returns the full project state.', parameters: { type: Type.OBJECT, properties: {} } },
    {
      name: 'update_project_module',
      description: 'Update a specific project module.',
      parameters: {
        type: Type.OBJECT,
        properties: { module_name: { type: Type.STRING }, content: { type: Type.STRING } },
        required: ['module_name', 'content']
      }
    },
    {
      name: 'update_scene',
      description: 'Update a specific scene by ID.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          scene_id: { type: Type.STRING },
          updates: { type: Type.OBJECT, properties: { visualPrompt: { type: Type.STRING }, description: { type: Type.STRING }, musicMood: { type: Type.STRING }, ambientSfx: { type: Type.STRING } } }
        },
        required: ['scene_id', 'updates']
      }
    },
    {
      name: 'add_character',
      description: 'Create a new character in the project.',
      parameters: {
        type: Type.OBJECT, properties: { name: { type: Type.STRING }, description: { type: Type.STRING }, gender: { type: Type.STRING, enum: ['Male', 'Female'] } },
        required: ['name', 'description', 'gender']
      }
    },
    {
      name: 'propose_batch_refinement',
      description: 'Propose a list of changes to multiple scenes for stylistic or narrative consistency.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          reasoning: { type: Type.STRING },
          changes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                sceneId: { type: Type.STRING },
                updates: { type: Type.OBJECT, properties: { visualPrompt: { type: Type.STRING }, musicMood: { type: Type.STRING }, cameraMotion: { type: Type.STRING } } }
              }
            }
          }
        },
        required: ['reasoning', 'changes']
      }
    }
  ];

  const response = await ai.models.generateContent({
    model: MODEL_NAMES.THINKING,
    contents: [
      ...chatHistory.map(m => ({ role: m.role, parts: [{ text: m.content }] })),
      {
        role: 'user', parts: [{
          text: `PROJECT_CONTEXT: ${JSON.stringify({
            scenes: currentProject.scenes.map(s => ({ id: s.id, desc: s.description })),
            characters: currentProject.characters.map(c => c.name),
            style: currentProject.globalStyle,
            assets: Object.keys(currentProject.assets).length
          })}\n\nUSER_MESSAGE: ${message}`
        }]
      }
    ],
    config: {
      systemInstruction: OVERRIDE_BOT_SYSTEM_INSTRUCTION,
      tools: [{ functionDeclarations: tools }],
      thinkingConfig: { thinkingBudget: 12000 },
      seed: currentProject.productionSeed
    }
  });

  return response;
};

export const performFullAudit = async (project: ProjectState): Promise<string> => {
  const ai = getAIClient();
  const prompt = `Perform a comprehensive directorial audit of the following project.
    Project Summary: ${project.scenes.length} scenes, ${project.characters.length} characters.
    Global Style: ${project.globalStyle}.
    Focus on: Narrative logic, Visual coherence, Pacing, and Production readiness.
    Output in a concise, authoritative 'OverrideBot' style.`;

  const response = await ai.models.generateContent({
    model: MODEL_NAMES.THINKING,
    contents: prompt,
    config: { thinkingConfig: { thinkingBudget: 8000 }, seed: project.productionSeed }
  });
  return response.text || "Audit signal lost.";
};

export const synthesizeCharacterPersona = async (name: string, gender: 'Male' | 'Female', style: string, seed?: number): Promise<Partial<Character>> => {
  const ai = getAIClient();
  const schema = {
    type: Type.OBJECT,
    properties: {
      description: { type: Type.STRING },
      visualPrompt: { type: Type.STRING },
      suggestedVoiceId: { type: Type.STRING }
    },
    required: ["description", "visualPrompt", "suggestedVoiceId"]
  };

  const prompt = `Create a cinematic character profile for "${name}" (${gender}) within the visual style of "${style}".
  Provide a detailed backstory and a high-fidelity visual prompt for AI image generation.
  Suggest a voice type from: ${VOICE_PRESETS.map(v => v.id).join(', ')}.`;

  const response = await ai.models.generateContent({
    model: MODEL_NAMES.THINKING,
    contents: prompt,
    config: { responseMimeType: "application/json", responseSchema: schema, thinkingConfig: { thinkingBudget: 4000 }, seed }
  });

  const data = parseJsonResponse<any>(response.text);
  return {
    description: data.description,
    visualPrompt: data.visualPrompt,
    voiceId: data.suggestedVoiceId
  };
};

export const suggestBRoll = async (project: ProjectState): Promise<Scene[]> => {
  const ai = getAIClient();
  const schema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        description: { type: Type.STRING },
        visualPrompt: { type: Type.STRING },
        estimatedDuration: { type: Type.NUMBER },
        musicMood: { type: Type.STRING, enum: ['suspense', 'action', 'calm', 'cheerful', 'melancholic'] },
        narratorLines: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { speaker: { type: Type.STRING }, text: { type: Type.STRING } } } }
      },
      required: ["description", "visualPrompt", "estimatedDuration", "musicMood"]
    }
  };

  const prompt = `Analyze this video project and suggest 3 high-impact B-Roll intercut scenes to improve visual density and variety.
    Current Scenes: ${project.scenes.map(s => s.description).join(' | ')}.
    Style: ${project.globalStyle}.
    Each B-Roll scene should be short (1-3s) and relevant to the narrative gaps. Output JSON.`;

  const response = await ai.models.generateContent({
    model: MODEL_NAMES.THINKING,
    contents: prompt,
    config: { responseMimeType: "application/json", responseSchema: schema, thinkingConfig: { thinkingBudget: 4000 }, seed: project.productionSeed }
  });

  return parseJsonResponse<any[]>(response.text, []);
};

export const analyzeViralPotential = async (script: string, seed?: number): Promise<ViralPotential> => {
  const ai = getAIClient();
  const schema = {
    type: Type.OBJECT,
    properties: {
      hookScore: { type: Type.NUMBER },
      retentionCatalysts: { type: Type.ARRAY, items: { type: Type.STRING } },
      engagementFriction: { type: Type.ARRAY, items: { type: Type.STRING } },
      heatmap: { type: Type.ARRAY, items: { type: Type.NUMBER } },
      predictionSummary: { type: Type.STRING }
    },
    required: ["hookScore", "retentionCatalysts", "engagementFriction", "heatmap", "predictionSummary"]
  };

  const prompt = `Perform a viral psychology analysis on this video script for a YouTube audience.
    Assess hook strength, pacing, and emotional peaks.
    Provide a 5-point heatmap (values 0-1) representing relative engagement. Output JSON.`;

  const response = await ai.models.generateContent({
    model: MODEL_NAMES.THINKING,
    contents: prompt,
    config: { responseMimeType: "application/json", responseSchema: schema, thinkingConfig: { thinkingBudget: 4000 }, seed }
  });

  return parseJsonResponse<any>(response.text);
};

export const generateMarketingContent = async (platform: string, script: string, metadata: any): Promise<string> => {
  const ai = getAIClient();
  const prompt = `Generate a high-engagement ${platform} post for a video with the following script and metadata:
  Script: ${script.substring(0, 2000)}
  Audience: ${metadata.audience}
  Titles: ${metadata.suggestedTitles.join(', ')}
  Tone: Authoritative, cinematic, and intriguing. Use relevant hashtags.`;

  const response = await ai.models.generateContent({
    model: MODEL_NAMES.CHECK,
    contents: prompt,
  });
  return response.text || "";
};

export const generateThumbnail = async (title: string, characters: Character[], style: string): Promise<{ imageUrl: string, suggestedText: string }> => {
  const ai = getAIClient();
  const textPrompt = `Suggest a short (max 3 words), high-impact text overlay for a YouTube thumbnail with the title: "${title}"`;
  const textRes = await ai.models.generateContent({
    model: MODEL_NAMES.CHECK,
    contents: textPrompt
  });
  const suggestedText = textRes.text?.trim().replace(/"/g, '') || "WATCH NOW";

  const charContext = characters.length > 0 ? `Featuring characters: ${characters.map(c => c.name).join(', ')}.` : "";
  const imgPrompt = `YouTube thumbnail background for a video titled "${title}". ${charContext} Style: ${style}. High contrast, vibrant, eye-catching.`;

  const imgRes = await ai.models.generateContent({
    model: MODEL_NAMES.IMAGE,
    contents: imgPrompt,
    config: { imageConfig: { aspectRatio: "16:9" } }
  });
  const data = imgRes.candidates?.[0]?.content?.parts.find(p => p.inlineData)?.inlineData?.data;
  if (!data) throw new Error('Thumbnail generation returned no image data. The prompt may have been safety-filtered.');

  return {
    imageUrl: `data:image/png;base64,${data}`,
    suggestedText
  };
};

export const analyzeScript = async (script: string, seed?: number): Promise<{
  characters: Character[],
  scenes: Scene[],
  tasks: ProductionTask[],
  modules: ProjectModules,
  metadata: { hookScore: number, audience: string, suggestedTitles: string[] }
}> => {
  const ai = getAIClient();
  const analysisSchema = {
    type: Type.OBJECT,
    properties: {
      characters: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            description: { type: Type.STRING },
            gender: { type: Type.STRING, enum: ['Male', 'Female'] },
            visualPrompt: { type: Type.STRING },
            voiceId: { type: Type.STRING, enum: VOICE_PRESETS.map(v => v.id) },
          },
          required: ["name", "description", "gender", "visualPrompt", "voiceId"]
        }
      },
      scenes: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            description: { type: Type.STRING },
            visualPrompt: { type: Type.STRING },
            charactersInScene: { type: Type.ARRAY, items: { type: Type.STRING } },
            musicMood: { type: Type.STRING, enum: ['suspense', 'action', 'calm', 'cheerful', 'melancholic'] },
            // Optional pin to a specific track id within the mood pool (Q3).
            // Listing every legal id as the enum lets the model name a track
            // when one fits the scene's energy better than a random pick.
            musicTrackId: { type: Type.STRING, enum: Object.values(MUSIC_TRACKS).flat().map(t => t.id) },
            narratorLines: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: { speaker: { type: Type.STRING }, text: { type: Type.STRING } },
                required: ["speaker", "text"]
              }
            },
            estimatedDuration: { type: Type.NUMBER }
          },
          required: ["description", "visualPrompt", "narratorLines", "estimatedDuration", "musicMood"]
        }
      },
      tasks: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { title: { type: Type.STRING }, description: { type: Type.STRING } } } },
      modules: { type: Type.OBJECT, properties: { logline: { type: Type.STRING }, concept: { type: Type.STRING } } },
      metadata: {
        type: Type.OBJECT,
        properties: { hookScore: { type: Type.NUMBER }, audience: { type: Type.STRING }, suggestedTitles: { type: Type.ARRAY, items: { type: Type.STRING } } }
      }
    },
    required: ["characters", "scenes", "tasks", "modules", "metadata"]
  };

  const voiceCatalog = VOICE_PRESETS.map(v => `${v.id} (${v.gender}, ${v.label})`).join('; ');
  const prompt = `Analyze script and extract production manifest. For each character, pick the most fitting voiceId from this catalog (must match exactly): ${voiceCatalog}.

Script:
${script}`;

  const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
    model: MODEL_NAMES.THINKING,
    contents: prompt,
    config: { responseMimeType: "application/json", responseSchema: analysisSchema, thinkingConfig: { thinkingBudget: 12000 }, seed }
  }));

  const data = parseJsonResponse<any>(response.text);
  return {
    characters: data.characters.map((c: any) => {
      // Validate the model's voice pick; fall back to a gender-matched default if invalid.
      const picked = VOICE_PRESETS.find(v => v.id === c.voiceId);
      const fallback = VOICE_PRESETS.find(v => v.gender === c.gender) || VOICE_PRESETS[0];
      return { ...c, id: `char_${crypto.randomUUID()}`, voiceId: (picked ?? fallback).id, voiceSettings: { pitch: 0, speed: 1 } };
    }),
    scenes: data.scenes.map((s: any) => ({ ...s, id: crypto.randomUUID(), cameraMotion: 'random_cinematic', transition: 'fade' })),
    tasks: (data.tasks || []).map((t: any, i: number) => ({ ...t, id: `task_${i}`, status: 'pending' })),
    modules: data.modules,
    metadata: data.metadata
  };
};

export const generateCharacterImage = async (character: Character, resolution: Resolution, style: string, seed?: number): Promise<string> => {
  const ai = getAIClient();
  const response = await retryWithBackoff(() => ai.models.generateContent({
    model: MODEL_NAMES.IMAGE,
    contents: `${style} character portrait of ${character.name}. ${character.visualPrompt}. Neutral pose, centered, front-facing, professional studio lighting, plain neutral background. Clear, photorealistic facial features for identity reference.`,
    config: { imageConfig: { aspectRatio: "1:1" }, seed }
  }));
  const data = response.candidates?.[0]?.content?.parts.find(p => p.inlineData)?.inlineData?.data;
  if (!data) throw new Error('Character image generation returned no data. The prompt may have been safety-filtered.');
  return `data:image/png;base64,${data}`;
};

// Phase 14 G8: a 3-panel turnaround sheet (front | 3-quarter | profile) baked
// into a single ultra-wide image. Veo's identity preservation drops past ~30°
// off-axis with only a front portrait, so scenes that pan across a character
// can render a different face. Feeding the model all three angles in one
// reference lets the per-scene image generator pick whichever panel matches
// the shot framing.
//
// Aspect ratio is 21:9 (the closest ultra-wide the Gemini image API accepts).
// The original Phase-14 plan called for 3:1, but Gemini's imageConfig.aspectRatio
// rejects 3:1 with 400 INVALID_ARGUMENT; 21:9 (≈ 2.33:1) is the supported
// substitute. Each of the 3 panels ends up at ~7:9 (portrait-ish) — narrower
// than a square, which is actually fine for head-and-shoulders shots.
export const generateCharacterTurnaround = async (character: Character, style: string, seed?: number): Promise<string> => {
  const ai = getAIClient();
  const response = await retryWithBackoff(() => ai.models.generateContent({
    model: MODEL_NAMES.IMAGE,
    contents: `${style} 3-panel character turnaround sheet of ${character.name}. Equal-sized horizontal panels left-to-right: (1) front view, (2) three-quarter view turned 45° to the camera-left, (3) full profile facing camera-left. Same outfit, same lighting, same identity in all three. ${character.visualPrompt}. Plain neutral grey background, photorealistic facial features, professional studio lighting. No text, no labels.`,
    config: { imageConfig: { aspectRatio: "21:9" }, seed }
  }));
  const data = response.candidates?.[0]?.content?.parts.find(p => p.inlineData)?.inlineData?.data;
  if (!data) throw new Error('Character turnaround generation returned no data. The prompt may have been safety-filtered.');
  return `data:image/png;base64,${data}`;
};

// Generates reference images for a batch of characters with bounded concurrency.
// Reports per-character completion via onComplete so the UI can update progressively.
// Phase 14: writes a 21:9 turnaround sheet to `turnaroundSheetBase64`.
// Characters with an existing turnaround sheet are skipped (legacy single
// `referenceImageBase64` does NOT block regeneration — a user upgrading a
// pre-Phase-14 project should get the better sheet).
export const generateCharacterRefsConcurrent = async (
  characters: Character[],
  style: string,
  productionSeed: number,
  onComplete: (charId: string, img?: string, err?: Error) => void,
  concurrency: number = 3
): Promise<Character[]> => {
  const result: Character[] = characters.map(c => ({ ...c }));
  let cursor = 0;

  const worker = async () => {
    while (cursor < characters.length) {
      const myIdx = cursor++;
      const char = characters[myIdx];
      if (char.turnaroundSheetBase64) continue;
      try {
        const charSeed = productionSeed + myIdx * 7919; // distinct seed per character
        const sheet = await generateCharacterTurnaround(char, style, charSeed);
        result[myIdx] = { ...char, turnaroundSheetBase64: sheet };
        onComplete(char.id, sheet);
      } catch (e) {
        onComplete(char.id, undefined, e instanceof Error ? e : new Error('character ref generation failed'));
      }
    }
  };

  const workers = Array.from({ length: Math.min(concurrency, characters.length) }, () => worker());
  await Promise.all(workers);
  return result;
};

export const generateSceneImage = async (scene: Scene, characters: Character[], aspectRatio: AspectRatio, resolution: Resolution, feedback?: string, style: string = "Cinematic", seed?: number, styleReferenceBase64?: string): Promise<string> => {
  const ai = getAIClient();
  const parts: any[] = [];

  if (styleReferenceBase64) {
    parts.push({ inlineData: { mimeType: 'image/png', data: stripDataUriPrefix(styleReferenceBase64) } });
    parts.push({ text: "Use this image as a Master Style Reference for color palette and lighting." });
  }

  // Phase 14: prefer the 3-panel turnaround sheet when present (better identity
  // preservation at off-axis camera angles). Fall back to the legacy single
  // portrait for pre-Phase-14 projects that haven't been regenerated yet.
  characters.filter(c => scene.charactersInScene.includes(c.name) && (c.turnaroundSheetBase64 || c.referenceImageBase64)).forEach(c => {
    const sheet = c.turnaroundSheetBase64;
    const ref = sheet || c.referenceImageBase64!;
    parts.push({ inlineData: { mimeType: 'image/png', data: stripDataUriPrefix(ref) } });
    parts.push({ text: sheet
      ? `This is a turnaround sheet for ${c.name}. Use whichever panel angle (front, 3/4, or profile) best matches the camera framing of this scene. Maintain identity across all panels.`
      : `Maintain visual consistency for character: ${c.name}.` });
  });

  parts.push({ text: `Style: ${style}. Scene Description: ${scene.visualPrompt}. ${feedback || ''}. Cinematic 8k rendering. High quality textures.` });

  const response = await retryWithBackoff(() => ai.models.generateContent({
    model: MODEL_NAMES.IMAGE,
    contents: { parts },
    config: { imageConfig: { aspectRatio, imageSize: resolution === Resolution.FHD ? '2K' : '1K' }, seed }
  }));
  const data = response.candidates?.[0]?.content?.parts.find(p => p.inlineData)?.inlineData?.data;
  if (!data) throw new Error('Scene image generation returned no data. The prompt may have been safety-filtered.');
  return `data:image/png;base64,${data}`;
};

export interface SceneVideoResult {
  /** Base64 data URI for inline playback in the browser. */
  videoUrl: string;
  /** Remote Veo URI of the original operation output — required for extendSceneVideo. */
  videoUri: string;
}

export const generateSceneVideo = async (imageBase64: string, prompt: string, aspectRatio: AspectRatio, resolution: Resolution, style: string = "Cinematic"): Promise<SceneVideoResult> => {
  const ai = getAIClient();
  // Only the initial operation submission is wrapped in retry — the polling
  // loop below has its own exponential backoff for transient 5xx during polls.
  // 60s per attempt gives Veo plenty of headroom while still failing fast on a
  // hung connection (which would otherwise stall for the OS TCP timeout).
  let operation: any = await retryWithBackoff(() => withTimeout(ai.models.generateVideos({
    model: resolution === Resolution.FHD ? MODEL_NAMES.VIDEO : MODEL_NAMES.VIDEO_FAST,
    prompt: `${style}. ${prompt}. Subtle cinematic motion.`,
    image: { imageBytes: stripDataUriPrefix(imageBase64), mimeType: 'image/png' },
    config: { numberOfVideos: 1, aspectRatio: aspectRatio === AspectRatio.PORTRAIT ? '9:16' : '16:9', resolution }
  }), 60_000, 'Veo submission'));

  // Exponential backoff with 30s cap; total wall-clock budget 10 min.
  const startedAt = Date.now();
  const TOTAL_BUDGET_MS = 10 * 60 * 1000;
  let attempt = 0;
  while (!operation.done) {
    if (Date.now() - startedAt > TOTAL_BUDGET_MS) throw new Error('Video generation timed out after 10 minutes.');
    const delay = Math.min(2 ** attempt * 1000, 30000);
    await new Promise(r => setTimeout(r, delay));
    attempt++;
    operation = await ai.operations.getVideosOperation({ operation });
  }

  const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!videoUri) throw new Error('Video generation completed but returned no video URI.');
  // Route download through the proxy so the API key is never in the client
  const blob = await (await fetch(`/api/download?uri=${encodeURIComponent(videoUri)}`)).blob();
  const videoUrl = await blobToBase64(blob);
  return { videoUrl, videoUri };
};

// Extends a previously generated Veo video. The input MUST be the remote URI
// emitted by a prior generateSceneVideo call (operation.response.generatedVideos[0].video.uri)
// — passing a base64 data URL here fails server-side. See SceneVideoResult.
export const extendSceneVideo = async (prevVideoUri: string, prompt: string, aspectRatio: AspectRatio): Promise<SceneVideoResult> => {
  if (!prevVideoUri || prevVideoUri.startsWith('data:')) {
    throw new Error('extendSceneVideo requires the remote Veo URI from the original operation, not a base64 data URL.');
  }
  const ai = getAIClient();
  // Only 720p videos can be extended currently according to Veo guidelines
  let operation: any = await retryWithBackoff(() => withTimeout(ai.models.generateVideos({
    model: 'veo-3.1-generate-preview',
    prompt: `Continue the scene: ${prompt}`,
    video: { uri: prevVideoUri },
    config: {
      numberOfVideos: 1,
      resolution: '720p',
      aspectRatio: aspectRatio === AspectRatio.PORTRAIT ? '9:16' : '16:9'
    }
  }), 60_000, 'Veo extension submission'));

  const startedAt = Date.now();
  const TOTAL_BUDGET_MS = 10 * 60 * 1000;
  let attempt = 0;
  while (!operation.done) {
    if (Date.now() - startedAt > TOTAL_BUDGET_MS) throw new Error('Video extension timed out after 10 minutes.');
    const delay = Math.min(2 ** attempt * 1000, 30000);
    await new Promise(r => setTimeout(r, delay));
    attempt++;
    operation = await ai.operations.getVideosOperation({ operation });
  }

  const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!videoUri) throw new Error('Video extension completed but returned no video URI.');
  const blob = await (await fetch(`/api/download?uri=${encodeURIComponent(videoUri)}`)).blob();
  const videoUrl = await blobToBase64(blob);
  return { videoUrl, videoUri };
};

// Number of distinct speakers Gemini's multi-speaker TTS reliably handles in
// one call. Above this we fall back to per-line single-speaker stitching.
const MULTI_SPEAKER_LIMIT = 5;
const TTS_SAMPLE_RATE = 24000;
// Same-speaker monologues used to feel choppy because we inserted a uniform
// 150 ms gap between every line. Real cadence is shorter within a thought and
// longer when the speaker changes. (B9)
const SAME_SPEAKER_SILENCE_MS = 50;
const DIFFERENT_SPEAKER_SILENCE_MS = 200;

// Returns a Uint8Array of 16-bit PCM silence at the TTS sample rate. Used to
// pad between concatenated single-speaker lines so they don't slam together.
const makeSilence = (durationMs: number): Uint8Array => {
  const samples = Math.floor(TTS_SAMPLE_RATE * (durationMs / 1000));
  return new Uint8Array(samples * 2); // zeros = silence in signed 16-bit PCM
};

export const generateSceneAudio = async (lines: DialogueLine[], characters: Character[]): Promise<string> => {
  const ai = getAIClient();
  const speakersInScene = Array.from(new Set(lines.map(l => l.speaker)));

  // Multi-speaker path: one call handles 2..N distinct voices with shared
  // acoustic context. Better-sounding than stitched single-speaker output.
  if (speakersInScene.length >= 2 && speakersInScene.length <= MULTI_SPEAKER_LIMIT) {
    // Wrap each line in <prosody> when the speaker has non-default voice
    // settings, so the per-character speed/pitch sliders in CharacterModal
    // actually take effect in multi-speaker scenes (B2). Previously these were
    // only applied in the single-speaker fallback path. Plain lines (no
    // overrides) are emitted as-is so the speaker label detection isn't
    // disturbed for the common case.
    const hasProsody = (c?: Character) =>
      (c?.voiceSettings?.speed ?? 1) !== 1 || (c?.voiceSettings?.pitch ?? 0) !== 0;
    const lineToPrompt = (l: DialogueLine): string => {
      const char = characters.find(c => c.name === l.speaker);
      if (!hasProsody(char)) return `${l.speaker}: ${l.text}`;
      const rate = char!.voiceSettings!.speed ?? 1;
      const pitch = char!.voiceSettings!.pitch ?? 0;
      return `${l.speaker}: <prosody rate="${rate}" pitch="${pitch}st">${l.text}</prosody>`;
    };
    const anyProsody = lines.some(l => hasProsody(characters.find(c => c.name === l.speaker)));
    const body = lines.map(lineToPrompt).join('\n');
    const prompt = anyProsody
      ? `TTS the following conversation:\n<speak>${body}</speak>`
      : `TTS the following conversation:\n${body}`;
    const speakerConfigs = speakersInScene.map(name => {
      const char = characters.find(c => c.name === name);
      const preset = VOICE_PRESETS.find(p => p.id === char?.voiceId) || VOICE_PRESETS[0];
      return {
        speaker: name,
        voiceConfig: { prebuiltVoiceConfig: { voiceName: preset.apiVoiceName } }
      };
    });

    try {
      const res = await retryWithBackoff(() => ai.models.generateContent({
        model: MODEL_NAMES.TTS,
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            multiSpeakerVoiceConfig: {
              speakerVoiceConfigs: speakerConfigs
            }
          }
        }
      }));
      const data = res.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (data) return `data:audio/pcm;base64,${data}`;
      // Empty response — fall through to single-speaker stitching as a fallback
      console.warn('Multi-speaker TTS returned no audio; falling back to per-line synthesis.');
    } catch (e) {
      console.warn('Multi-speaker TTS failed; falling back to per-line synthesis:', e);
    }
  }

  // Single-speaker or fallback path: render each line separately and concat
  // with brief silence in between. allSettled so one bad line doesn't kill
  // the whole scene's audio.
  const filteredLines = lines.filter(line => line.text.trim());
  const settled = await Promise.allSettled(
    filteredLines.map(line => {
      const char = characters.find(c => c.name === line.speaker);
      const preset = VOICE_PRESETS.find(p => p.id === char?.voiceId) || VOICE_PRESETS[0];
      return retryWithBackoff(() => ai.models.generateContent({
        model: MODEL_NAMES.TTS,
        contents: [{ parts: [{ text: `<speak><prosody rate="${char?.voiceSettings?.speed || 1}" pitch="${char?.voiceSettings?.pitch || 0}st">${line.text}</prosody></speak>` }] }],
        config: { responseModalities: [Modality.AUDIO], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: preset.apiVoiceName } } } }
      })).then(res => {
        const data = res.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        return data ? base64ToUint8Array(data) : null;
      });
    })
  );

  const sameSpeakerSilence = makeSilence(SAME_SPEAKER_SILENCE_MS);
  const speakerChangeSilence = makeSilence(DIFFERENT_SPEAKER_SILENCE_MS);
  const parts: Uint8Array[] = [];
  let lastAppendedSpeaker: string | null = null;
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value) {
      const speaker = filteredLines[i].speaker;
      if (parts.length > 0) {
        parts.push(speaker === lastAppendedSpeaker ? sameSpeakerSilence : speakerChangeSilence);
      }
      parts.push(r.value);
      lastAppendedSpeaker = speaker;
    } else if (r.status === 'rejected') {
      console.error(`TTS line ${i} failed:`, r.reason);
    }
  });
  if (parts.length === 0 && filteredLines.length > 0) {
    throw new Error(`All ${filteredLines.length} TTS line(s) failed.`);
  }
  return parts.length ? `data:audio/pcm;base64,${uint8ArrayToBase64(concatUint8Arrays(parts))}` : "";
};

// Uses Gemini Flash as a vision judge to estimate how well a character's
// identity is preserved in a scene image versus their canonical reference.
// Returns 0-100 + a short note. On failure returns a 0 score so the UI can
// flag it rather than pretending success.
export const analyzeCharacterContinuity = async (
  characterRefBase64: string,
  sceneImageBase64: string,
  characterName: string
): Promise<{ score: number; notes: string }> => {
  const ai = getAIClient();
  const schema = {
    type: Type.OBJECT,
    properties: {
      score: { type: Type.NUMBER },
      notes: { type: Type.STRING }
    },
    required: ["score", "notes"]
  };

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAMES.CHECK,
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/png', data: stripDataUriPrefix(characterRefBase64) } },
          { inlineData: { mimeType: 'image/png', data: stripDataUriPrefix(sceneImageBase64) } },
          { text: `Image 1 is the canonical reference for character "${characterName}". Image 2 is a scene from the same production where this character should appear. Rate how well the character's identity (face shape, hair, age, distinctive features) is preserved on a 0-100 scale. 100 = clearly the same person, 75 = same person with minor drift, 50 = similar archetype but different person, 25 = unrelated, 0 = character is absent from the scene. Provide a short note (max 20 words) calling out the main drift if any. Output JSON.` }
        ]
      },
      config: { responseMimeType: "application/json", responseSchema: schema }
    });

    const parsed = parseJsonResponse<{ score: number; notes: string }>(response.text, { score: 0, notes: 'scoring returned no data' });
    // Clamp defensively — model may emit out-of-range values
    return {
      score: Math.max(0, Math.min(100, Math.round(parsed.score ?? 0))),
      notes: (parsed.notes || '').slice(0, 200)
    };
  } catch (e) {
    return { score: 0, notes: e instanceof Error ? e.message : 'scoring failed' };
  }
};

export const triggerApiKeySelection = async () => { if (typeof window !== 'undefined' && window.aistudio) await window.aistudio.openSelectKey(); };

export const optimizeVisualPrompt = async (line: string, style: string): Promise<string> => {
  const ai = getAIClient();
  const res = await ai.models.generateContent({ model: MODEL_NAMES.CHECK, contents: `Optimize for ${style}: ${line}` });
  return res.text || line;
};

export const previewVoice = async (voiceId: string, settings: { speed: number, pitch: number }): Promise<string> => {
  const ai = getAIClient();
  const preset = VOICE_PRESETS.find(p => p.id === voiceId) || VOICE_PRESETS[0];
  const res = await ai.models.generateContent({
    model: MODEL_NAMES.TTS,
    contents: [{ parts: [{ text: `Sampling vocal profile.` }] }],
    config: { responseModalities: [Modality.AUDIO], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: preset.apiVoiceName } } } }
  });
  return res.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || "";
};

export function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

// Chunked approach avoids O(n²) string concatenation and call-stack overflow on large audio buffers
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000; // 32KB chunks
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((acc, arr) => acc + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) { result.set(arr, offset); offset += arr.length; }
  return result;
}

export const blobToBase64 = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onloadend = () => resolve(reader.result as string);
  reader.onerror = reject;
  reader.readAsDataURL(blob);
});

// WAV header sniffer: if the payload starts with a RIFF/WAVE header (which
// Gemini's multi-speaker TTS sometimes emits), read the true sample rate and
// channel count and skip past the header to the raw PCM data. Falls back to
// the single-speaker default of 24kHz mono otherwise.
const sniffWavHeader = (bytes: Uint8Array): { sampleRate: number; numChannels: number; dataOffset: number } | null => {
  if (bytes.length < 44) return null;
  const isRiff = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
  const isWave = bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45;
  if (!isRiff || !isWave) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Walk chunks starting at offset 12 to find 'fmt ' and 'data'
  let offset = 12;
  let sampleRate = 0;
  let numChannels = 0;
  let dataOffset = -1;
  while (offset + 8 <= bytes.length) {
    const chunkId = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
    const chunkSize = view.getUint32(offset + 4, true);
    if (chunkId === 'fmt ') {
      numChannels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
    } else if (chunkId === 'data') {
      dataOffset = offset + 8;
      break;
    }
    offset += 8 + chunkSize;
  }
  if (!sampleRate || !numChannels || dataOffset < 0) return null;
  return { sampleRate, numChannels, dataOffset };
};

export const decodeAudio = async (base64: string, ctx: AudioContext): Promise<AudioBuffer> => {
  const bytes = base64ToUint8Array(base64);
  const wav = sniffWavHeader(bytes);
  if (wav) {
    if (wav.sampleRate !== 24000 || wav.numChannels !== 1) {
      console.warn(`decodeAudio: non-default WAV format detected (${wav.sampleRate}Hz, ${wav.numChannels}ch)`);
    }
    return decodeAudioRaw(bytes.subarray(wav.dataOffset), ctx, wav.sampleRate, wav.numChannels);
  }
  return decodeAudioRaw(bytes, ctx, 24000, 1);
};

// Raw PCM decoder — accepts Uint8Array directly (used by DirectorAssistant live audio playback)
export const decodeAudioRaw = async (data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> => {
  // Raw PCM from Gemini is 16-bit little-endian. Honor the Uint8Array's
  // byteOffset/byteLength so subarray() views decode correctly.
  const aligned = data.byteOffset % 2 === 0 && data.byteLength % 2 === 0
    ? new Int16Array(data.buffer, data.byteOffset, data.byteLength / 2)
    : new Int16Array(data.slice().buffer);
  const frameCount = Math.floor(aligned.length / numChannels);
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = aligned[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
};

export const generateVideoScript = async (topic: string): Promise<string> => {
  const ai = getAIClient();
  const res = await ai.models.generateContent({ model: MODEL_NAMES.THINKING, contents: `High-quality video script: ${topic}. Use [Scene: ...] format.`, config: { thinkingConfig: { thinkingBudget: 4000 } } });
  return res.text || "";
};
