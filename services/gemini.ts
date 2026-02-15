
import { GoogleGenAI, Type, Modality, HarmCategory, HarmBlockThreshold, GenerateContentResponse, FunctionDeclaration, LiveServerMessage } from "@google/genai";
import JSON5 from 'json5';
import { MODEL_NAMES, VOICE_PRESETS, VoicePreset } from "../constants";
import { Character, Scene, DialogueLine, AspectRatio, Resolution, ProjectState, ProductionTask, ProjectModules, ViralPotential, DirectorDraft } from "../types";
import { getCachedAsset, cacheAsset } from "./assetCache";

// Proxy URL for secure server-side API calls
const PROXY_URL = 'http://localhost:3001';

const cleanJsonResponse = (text: string): string => {
  let clean = text.trim();

  // Remove markdown code blocks
  clean = clean.replace(/```json\s*/g, '').replace(/```/g, '');

  // Remove any leading/trailing text outside JSON structure
  const firstOpen = clean.indexOf('{');
  const lastClose = clean.lastIndexOf('}');
  if (firstOpen !== -1 && lastClose !== -1) {
    clean = clean.substring(firstOpen, lastClose + 1);
  }

  // Fix common JSON issues that break standard JSON.parse:

  // 1. Remove trailing commas before closing brackets/braces (aggressive multi-pass)
  let prevLength = 0;
  while (prevLength !== clean.length) {
    prevLength = clean.length;
    clean = clean.replace(/,(\s*[}\]])/g, '$1');
  }

  // 2. Remove comments (// and /* */)
  clean = clean.replace(/\/\/.*$/gm, '');
  clean = clean.replace(/\/\*[\s\S]*?\*\//g, '');

  // 3. Fix truncated strings (unclosed quotes at end)
  if ((clean.match(/"/g) || []).length % 2 !== 0) {
    // Odd number of quotes - likely truncated
    clean = clean + '"';
  }

  // 4. Auto-complete truncated JSON structures
  const openBraces = (clean.match(/{/g) || []).length;
  const closeBraces = (clean.match(/}/g) || []).length;
  const openBrackets = (clean.match(/\[/g) || []).length;
  const closeBrackets = (clean.match(/\]/g) || []).length;

  // Add missing closing brackets
  for (let i = 0; i < (openBrackets - closeBrackets); i++) {
    clean = clean + ']';
  }

  // Add missing closing braces
  for (let i = 0; i < (openBraces - closeBraces); i++) {
    clean = clean + '}';
  }

  // 5. Remove incomplete last object/array element if truncated
  // This handles cases where the response was cut off mid-element
  // Remove any trailing incomplete object (starts with { but no closing })
  clean = clean.replace(/,\s*\{\s*"[^"]*"\s*:\s*[^}]*$/g, '');
  // Remove any trailing incomplete array element
  clean = clean.replace(/,\s*\[\s*[^\]]*$/g, '');

  // 6. Remove trailing comma at the end
  clean = clean.replace(/,(\s*)([}\]])([}\]]*)$/g, '$1$2$3');

  // 7. Normalize whitespace
  clean = clean.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 8. Remove any null bytes
  clean = clean.replace(/\0/g, '');

  // 9. Final pass: ensure no trailing commas anywhere
  clean = clean.replace(/,(\s*[}\]])/g, '$1');

  return clean;
};

const getAIClient = async (): Promise<GoogleGenAI> => {
  // Support both API_KEY (for backwards compatibility) and GEMINI_API_KEY (standard)
  const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("API Key not found. Please set GEMINI_API_KEY in your .env file.");
  }
  return new GoogleGenAI({ apiKey });
};

const withTimeout = <T>(promise: Promise<T>, ms: number, label: string = 'Operation'): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms))
  ]);
};

const retryWithBackoff = async <T>(
  operation: () => Promise<T>,
  retries: number = 4,
  initialDelay: number = 6000
): Promise<T> => {
  try {
    return await operation();
  } catch (error: any) {
    const err = error as any;
    const status = err?.status || err?.code;
    const message = typeof err?.message === 'string' ? err.message : '';

    const isRetriable =
      status === 429 || status === 500 || status === 503 ||
      message.includes('429') ||
      message.includes('quota') ||
      message.includes('RESOURCE_EXHAUSTED') ||
      message.includes('503') ||
      message.includes('500') ||
      message.includes('INTERNAL') ||
      message.includes('UNAVAILABLE') ||
      message.includes('overloaded') ||
      message.includes('timed out') ||
      message.includes('Failed to fetch') ||
      message.includes('network') ||
      message.includes('NetworkError') ||
      message.includes('ECONNRESET');

    if (isRetriable && retries > 0) {
      console.warn(`[RetryWithBackoff] Retriable error (${retries} retries left, waiting ${initialDelay / 1000}s): ${message || status}`);
      await new Promise(resolve => setTimeout(resolve, initialDelay));
      return retryWithBackoff(operation, retries - 1, initialDelay * 2);
    } else if (isRetriable && retries === 0) {
      console.error(`[RetryWithBackoff] Max retries reached. Last error: ${message || status}`);
    } else if (!isRetriable) {
      console.error(`[RetryWithBackoff] Non-retriable error: ${message || status}`);
    }
    throw error;
  }
};

const OVERRIDE_BOT_SYSTEM_INSTRUCTION = `
Act as OverrideBot, an action-oriented AI Director & copilot for the Human Override Video Creation Tool.
You are a hybrid of Executive Producer, Story Editor, Scriptwriter, and Research Assistant.
You are the ACTIVE DIRECTOR — you guide the user through every step of the production pipeline.

PRODUCTION PHASES (you will be told which phase the user is currently in):
1. GENESIS: Script writing and initial setup. Help craft compelling scripts, suggest hooks, recommend styles.
2. MANIFEST: Cast building, scene planning, timeline setup. Audit voices, optimize pacing, check continuity.
3. SYNTHESIS: Asset generation (images, video, audio). Review visual prompts, suggest improvements, quality-check results.
4. POST: Final mastering, VFX, metadata, and distribution. Optimize for platforms, viral analysis, export readiness.

PHASE-AWARE BEHAVIOR:
- Always be aware of the current phase and tailor your guidance to it.
- Proactively suggest what the user should do NEXT within the current phase.
- When a phase is nearing completion, suggest transitioning to the next phase.
- Flag quality issues or missing elements specific to the current phase.
- Offer to improve user inputs (scripts, prompts, descriptions) before they are submitted.

PRINCIPLES:
1. Action-first: Propose concrete next steps and execute via tools.
2. Minimize back-and-forth: Deliver usable outputs immediately.
3. Structured outputs: Always follow the A–E response format.
4. Asset-aware: Use existing images/videos/characters in your logic.
5. Continuity-aware: Preserve project tone and character details.
6. Phase-aware: Know where the user is in production and guide accordingly.
7. Quality-focused: Suggest upgrades to inputs before they are committed.

RESPONSE CONTRACT (MANDATORY STRUCTURE):
A. QUICK DIAGNOSIS: Project status, current phase assessment, biggest bottleneck, and immediate plan.
B. DELIVERABLES: Ready-to-use content (scripts, metadata, titles, improved prompts).
C. NEXT ACTIONS: Specific tasks for the user within the current phase, or transition to next phase.
D. QUESTIONS: Max 3 required clarifications.
E. ASSUMPTIONS: List any narrative or production assumptions.

STYLE: Urgent, cinematic, investigative, plausible dystopian. Use short sentences and active voice.
`;

export const handleDirectorChat = async (message: string, currentProject: ProjectState, chatHistory: { role: 'user' | 'model', content: string }[]): Promise<GenerateContentResponse> => {
  const ai = await getAIClient();

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
          scene_id: { type: Type.NUMBER },
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
      name: 'update_character',
      description: 'Update an existing character by name. Use this to assign a voice, refine their visual description, or adjust voice settings.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          character_name: { type: Type.STRING, description: 'Exact name of the character to update' },
          voiceId: { type: Type.STRING, description: 'Voice preset ID to assign (from available_voices list)' },
          description: { type: Type.STRING, description: 'Updated character description' },
          visualPrompt: { type: Type.STRING, description: 'Updated visual appearance prompt' },
          voiceSpeed: { type: Type.NUMBER, description: 'Voice speed multiplier (0.5-2.0)' },
          voicePitch: { type: Type.NUMBER, description: 'Voice pitch shift in semitones (-10 to 10)' }
        },
        required: ['character_name']
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
                sceneId: { type: Type.NUMBER },
                updates: { type: Type.OBJECT, properties: { visualPrompt: { type: Type.STRING }, musicMood: { type: Type.STRING }, cameraMotion: { type: Type.STRING } } }
              }
            }
          }
        },
        required: ['reasoning', 'changes']
      }
    }
  ];

  // Determine current production phase
  const phase = !currentProject.script || currentProject.scenes.length === 0 ? 'genesis'
    : !Object.values(currentProject.assets).some((a: any) => a.status === 'complete') ? 'manifest'
      : currentProject.scenes.every((s: any) => currentProject.assets[s.id]?.status === 'complete') ? 'post'
        : 'synthesis';

  const completedAssets = Object.values(currentProject.assets).filter((a: any) => a.status === 'complete').length;
  const totalScenes = currentProject.scenes.length;

  const response = await withTimeout(ai.models.generateContent({
    model: MODEL_NAMES.CHECK,
    contents: [
      ...chatHistory.map(m => ({ role: m.role, parts: [{ text: m.content }] })),
      {
        role: 'user', parts: [{
          text: `CURRENT_PHASE: ${phase.toUpperCase()}
PHASE_PROGRESS: ${phase === 'genesis' ? (currentProject.script ? 'Script entered, not yet analyzed' : 'No script yet') : phase === 'manifest' ? `${totalScenes} scenes, ${currentProject.characters.length} characters, 0/${totalScenes} assets` : `${completedAssets}/${totalScenes} assets complete`}
PROJECT_CONTEXT: ${JSON.stringify({
            scenes: currentProject.scenes.map(s => ({ id: s.id, desc: s.description, musicMood: s.musicMood, cameraMotion: s.cameraMotion, narratorLines: s.narratorLines?.map(l => ({ speaker: l.speaker, text: l.text.substring(0, 80) })) })),
            characters: currentProject.characters.map(c => ({ name: c.name, gender: c.gender, voiceId: c.voiceId, description: c.description })),
            available_voices: VOICE_PRESETS.filter((v, i, arr) => arr.findIndex(x => x.apiVoiceName === v.apiVoiceName) === i).map(v => ({ id: v.id, label: v.label, gender: v.gender })),
            style: currentProject.globalStyle,
            assets: Object.keys(currentProject.assets).length
          })}\n\nUSER_MESSAGE: ${message}`
        }]
      }
    ] as any,
    config: {
      systemInstruction: OVERRIDE_BOT_SYSTEM_INSTRUCTION,
      tools: [{ functionDeclarations: tools }],
      seed: currentProject.productionSeed
    }
  }), 120000, 'Director chat');

  return response;
};

export interface DirectorGuidance {
  tips: string[];
  qualityFlags: string[];
  suggestedAction: string;
  phaseProgress: string;
}

export const getDirectorGuidance = async (phase: string, project: ProjectState): Promise<DirectorGuidance> => {
  const ai = await getAIClient();

  const completedAssets = Object.values(project.assets).filter((a: any) => a.status === 'complete').length;
  const totalScenes = project.scenes.length;
  const hasScript = !!project.script;
  const hasCharacters = project.characters.length > 0;
  const hasMissingVoices = project.characters.some(c => !c.voiceId);
  const pendingScenes = project.scenes.filter(s => !project.assets[s.id] || project.assets[s.id]?.status === 'pending').length;

  const schema = {
    type: Type.OBJECT,
    properties: {
      tips: { type: Type.ARRAY, items: { type: Type.STRING } },
      qualityFlags: { type: Type.ARRAY, items: { type: Type.STRING } },
      suggestedAction: { type: Type.STRING },
      phaseProgress: { type: Type.STRING }
    },
    required: ['tips', 'qualityFlags', 'suggestedAction', 'phaseProgress']
  };

  const prompt = `You are the Director for a video production tool. Provide phase-specific guidance.

CURRENT_PHASE: ${phase.toUpperCase()}
Project stats: ${totalScenes} scenes, ${project.characters.length} characters, ${completedAssets}/${totalScenes} assets complete.
Has script: ${hasScript}. Has characters: ${hasCharacters}. Missing voices: ${hasMissingVoices}. Pending scenes: ${pendingScenes}.
Global style: ${project.globalStyle || 'not set'}.
Script preview: ${project.script?.substring(0, 300) || 'none'}.

Provide:
- tips: 2-3 actionable tips for the current phase (short, direct)
- qualityFlags: 0-2 quality warnings if any issues detected (empty array if none)
- suggestedAction: The single most impactful next step the user should take
- phaseProgress: A brief status summary like "Phase 60% complete - cast needs voice assignment"

Be concise and authoritative. Use the OverrideBot voice.`;

  try {
    const response = await withTimeout(ai.models.generateContent({
      model: MODEL_NAMES.CHECK,
      contents: prompt,
      config: { responseMimeType: 'application/json', responseSchema: schema, seed: project.productionSeed }
    }), 30000, 'Director guidance');

    return JSON.parse(cleanJsonResponse(response.text || '{}'));
  } catch {
    // Fallback with static guidance if API fails
    const fallbacks: Record<string, DirectorGuidance> = {
      genesis: { tips: ['Write a compelling hook in the first 3 seconds.', 'Use [Scene: ...] format for visual cues.'], qualityFlags: hasScript ? [] : ['No script detected — production is blocked.'], suggestedAction: hasScript ? 'Initialize the pipeline to analyze your script.' : 'Write or generate a script to begin production.', phaseProgress: hasScript ? 'Script ready — initialize pipeline.' : 'Awaiting script input.' },
      manifest: { tips: ['Review character voices for tonal consistency.', 'Check scene pacing — aim for 3-7s per scene.'], qualityFlags: hasMissingVoices ? ['Some characters have no voice assigned.'] : [], suggestedAction: pendingScenes > 0 ? 'Begin asset generation for pending scenes.' : 'Review scene details in the Inspector.', phaseProgress: `${totalScenes} scenes ready. ${hasMissingVoices ? 'Voice assignment incomplete.' : 'Cast configured.'}` },
      synthesis: { tips: ['Generate all scenes in batch for efficiency.', 'Set a Key Art reference for style coherence.'], qualityFlags: [], suggestedAction: pendingScenes > 0 ? `Generate ${pendingScenes} remaining scenes.` : 'Review generated assets for quality.', phaseProgress: `${completedAssets}/${totalScenes} assets generated.` },
      post: { tips: ['Run VFX mastering for a cinematic finish.', 'Optimize metadata for platform distribution.'], qualityFlags: completedAssets < totalScenes ? ['Not all assets are complete — export will be partial.'] : [], suggestedAction: 'Open the Master Export to compile your production.', phaseProgress: completedAssets === totalScenes ? 'All assets ready — production complete.' : `${totalScenes - completedAssets} scenes still need generation.` }
    };
    return fallbacks[phase] || fallbacks.genesis;
  }
};

export const performFullAudit = async (project: ProjectState): Promise<string> => {
  return retryWithBackoff(async () => {
    const ai = await getAIClient();
    const prompt = `Perform a comprehensive directorial audit of the following project.
      Project Summary: ${project.scenes.length} scenes, ${project.characters.length} characters.
      Global Style: ${project.globalStyle}.
      Focus on: Narrative logic, Visual coherence, Pacing, and Production readiness.
      Output in a concise, authoritative 'OverrideBot' style.`;

    const response = await withTimeout(ai.models.generateContent({
      model: MODEL_NAMES.THINKING,
      contents: prompt,
      config: { thinkingConfig: { thinkingBudget: 4000 }, seed: project.productionSeed }
    }), 90000, 'Full audit');
    return response.text || "Audit signal lost.";
  });
};

export const synthesizeCharacterPersona = async (name: string, gender: 'Male' | 'Female', style: string, seed?: number): Promise<Partial<Character>> => {
  return retryWithBackoff(async () => {
    const ai = await getAIClient();
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

    const response = await withTimeout(ai.models.generateContent({
      model: MODEL_NAMES.THINKING,
      contents: prompt,
      config: { responseMimeType: "application/json", responseSchema: schema, thinkingConfig: { thinkingBudget: 1500 }, seed }
    }), 90000, 'Character persona synthesis');

    try {
      const data = JSON.parse(cleanJsonResponse(response.text || "{}"));
      return {
        description: data.description,
        visualPrompt: data.visualPrompt,
        voiceId: data.suggestedVoiceId
      };
    } catch (parseErr) {
      console.error('[synthesizeCharacterPersona] Failed to parse LLM response:', response.text?.substring(0, 200));
      throw new Error('Failed to parse character persona response from AI');
    }
  });
};

export const suggestBRoll = async (project: ProjectState): Promise<Scene[]> => {
  return retryWithBackoff(async () => {
    const ai = await getAIClient();
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

    const response = await withTimeout(ai.models.generateContent({
      model: MODEL_NAMES.THINKING,
      contents: prompt,
      config: { responseMimeType: "application/json", responseSchema: schema, thinkingConfig: { thinkingBudget: 800 }, seed: project.productionSeed }
    }), 90000, 'B-Roll suggestion');

    return JSON.parse(cleanJsonResponse(response.text || "[]")).map((s: any, i: number) => ({ ...s, id: Date.now() + i, charactersInScene: s.charactersInScene || [], narratorLines: s.narratorLines || [] }));
  });
};

export const analyzeViralPotential = async (script: string, seed?: number): Promise<ViralPotential> => {
  return retryWithBackoff(async () => {
    const ai = await getAIClient();
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

    const response = await withTimeout(ai.models.generateContent({
      model: MODEL_NAMES.THINKING,
      contents: prompt,
      config: { responseMimeType: "application/json", responseSchema: schema, thinkingConfig: { thinkingBudget: 2000 }, seed }
    }), 90000, 'Viral analysis');

    return JSON.parse(cleanJsonResponse(response.text || "{}"));
  });
};

export const generateMarketingContent = async (platform: string, script: string, metadata: any): Promise<string> => {
  return retryWithBackoff(async () => {
    const ai = await getAIClient();
    const prompt = `Generate a high-engagement ${platform} post for a video with the following script and metadata:
    Script: ${script.substring(0, 2000)}
    Audience: ${metadata.audience}
    Titles: ${metadata.suggestedTitles.join(', ')}
    Tone: Authoritative, cinematic, and intriguing. Use relevant hashtags.`;

    const response = await withTimeout(ai.models.generateContent({
      model: MODEL_NAMES.CHECK,
      contents: prompt,
    }), 60000, 'Marketing content');
    return response.text || "";
  });
};

export const generateThumbnail = async (title: string, characters: Character[], style: string): Promise<{ imageUrl: string, suggestedText: string }> => {
  return retryWithBackoff(async () => {
    const ai = await getAIClient();
    const textPrompt = `Suggest a short (max 3 words), high-impact text overlay for a YouTube thumbnail with the title: "${title}"`;
    const textRes = await withTimeout(ai.models.generateContent({
      model: MODEL_NAMES.CHECK,
      contents: textPrompt
    }), 30000, 'Thumbnail text');
    const suggestedText = textRes.text?.trim().replace(/"/g, '') || "WATCH NOW";

    const charContext = characters.length > 0 ? `Featuring characters: ${characters.map(c => c.name).join(', ')}.` : "";
    const imgPrompt = `YouTube thumbnail background for a video titled "${title}". ${charContext} Style: ${style}. High contrast, vibrant, eye-catching.`;

    const imgRes = await withTimeout(ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: imgPrompt,
      config: { imageConfig: { aspectRatio: "16:9" } }
    }), 120000, 'Thumbnail image');
    const data = imgRes.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
    if (!data) throw new Error('Thumbnail generation returned no image data. The prompt may have been safety-filtered.');

    return {
      imageUrl: `data:image/png;base64,${data}`,
      suggestedText
    };
  });
};

export const analyzeScript = async (script: string, seed?: number): Promise<{
  characters: Character[],
  scenes: Scene[],
  tasks: ProductionTask[],
  modules: ProjectModules,
  metadata: { hookScore: number, audience: string, suggestedTitles: string[] }
}> => {
  const ai = await getAIClient();
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
            suggestedVoiceId: { type: Type.STRING },
          },
          required: ["name", "description", "gender", "visualPrompt", "suggestedVoiceId"]
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

  const voiceOptions = VOICE_PRESETS.filter((v, i, arr) => arr.findIndex(x => x.apiVoiceName === v.apiVoiceName) === i)
    .map(v => `${v.id} (${v.gender} - ${v.label.split(' - ')[1]?.replace(')', '') || 'Standard'})`).join(', ');

  const response = await retryWithBackoff<GenerateContentResponse>(() => withTimeout(ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: `Analyze script and extract production manifest. Generate COMPLETE and VALID JSON only - no trailing commas, no comments, proper closing brackets.\n\nScript: ${script}\n\nFor each character, suggest a voice from these options based on gender and personality: ${voiceOptions}\n\nIMPORTANT: Ensure all arrays and objects are properly closed. Do not truncate the response.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: analysisSchema,
      seed,
      maxOutputTokens: 32768, // Maximum allowed - handles very long scripts
      temperature: 0.1 // Lower temperature for more consistent JSON structure
    }
  }), 120000, 'Script analysis'));

  const rawText = response.text || "{}";

  // Check if response was truncated (missing closing brace or incomplete structure)
  const openBraces = (rawText.match(/{/g) || []).length;
  const closeBraces = (rawText.match(/}/g) || []).length;
  const openBrackets = (rawText.match(/\[/g) || []).length;
  const closeBrackets = (rawText.match(/\]/g) || []).length;

  if (openBraces !== closeBraces || openBrackets !== closeBrackets) {
    console.warn(`[analyzeScript] Potentially truncated response detected. Braces: ${openBraces} open, ${closeBraces} close. Brackets: ${openBrackets} open, ${closeBrackets} close.`);
    console.warn(`[analyzeScript] Response length: ${rawText.length} chars. Consider simplifying the script or breaking it into smaller sections.`);
  }

  let data;

  // Clean the response first
  const cleaned = cleanJsonResponse(rawText);

  try {
    // Try JSON5 first since it's more permissive (handles trailing commas, comments, etc.)
    data = JSON5.parse(cleaned);
    console.log("[analyzeScript] Successfully parsed with JSON5");
  } catch (e1) {
    try {
      // Fallback to standard JSON.parse
      data = JSON.parse(cleaned);
      console.log("[analyzeScript] Successfully parsed with JSON.parse");
    } catch (e2) {
      // Both parsers failed - provide detailed error information
      const error1 = (e1 as Error).message;
      const error2 = (e2 as Error).message;

      console.error("[analyzeScript] JSON5 Parse Error:", error1);
      console.error("[analyzeScript] JSON Parse Error:", error2);
      console.error("[analyzeScript] Raw response length:", rawText.length);
      console.error("[analyzeScript] Cleaned response length:", cleaned.length);
      console.error("[analyzeScript] First 500 chars of cleaned:", cleaned.substring(0, 500));
      console.error("[analyzeScript] Last 500 chars of cleaned:", cleaned.substring(Math.max(0, cleaned.length - 500)));

      // Try to identify the problematic position
      const match = error2.match(/position (\d+)/);
      if (match) {
        const pos = parseInt(match[1]);
        const context = cleaned.substring(Math.max(0, pos - 100), Math.min(cleaned.length, pos + 100));
        console.error(`[analyzeScript] Context around error position ${pos}:`, context);
      }

      throw new Error(`Failed to parse AI response after cleaning. JSON5 error: ${error1}. Standard JSON error: ${error2}. Response length: ${rawText.length} chars. Check console for full output.`);
    }
  }

  // Validate and provide defaults for required structure
  if (!data || typeof data !== 'object') {
    throw new Error('Parsed data is not an object');
  }

  // Required arrays - must exist
  if (!Array.isArray(data.characters)) {
    console.warn('[analyzeScript] Characters array missing, using empty array');
    data.characters = [];
  }
  if (!Array.isArray(data.scenes)) {
    console.warn('[analyzeScript] Scenes array missing, using empty array');
    data.scenes = [];
  }

  // Optional objects - provide defaults if missing
  if (!data.modules || typeof data.modules !== 'object') {
    console.warn('[analyzeScript] Modules object missing or invalid, using defaults');
    data.modules = {
      logline: 'A compelling narrative unfolds.',
      concept: 'An engaging story brought to life through AI-powered production.'
    };
  }

  if (!data.metadata || typeof data.metadata !== 'object') {
    console.warn('[analyzeScript] Metadata object missing or invalid, using defaults');
    data.metadata = {
      hookScore: 5,
      audience: 'General',
      suggestedTitles: ['Untitled Production']
    };
  }

  // Ensure modules has required fields
  if (!data.modules.logline) {
    data.modules.logline = 'A compelling narrative unfolds.';
  }
  if (!data.modules.concept) {
    data.modules.concept = 'An engaging story brought to life through AI-powered production.';
  }

  // Ensure metadata has required fields
  if (typeof data.metadata.hookScore !== 'number') {
    data.metadata.hookScore = 5;
  }
  if (!data.metadata.audience) {
    data.metadata.audience = 'General';
  }
  if (!Array.isArray(data.metadata.suggestedTitles)) {
    data.metadata.suggestedTitles = ['Untitled Production'];
  }
  return {
    characters: data.characters.map((c: any, i: number) => {
      const suggestedPreset = VOICE_PRESETS.find(v => v.id === c.suggestedVoiceId);
      const genderPresets = VOICE_PRESETS.filter(v => v.gender === c.gender);
      const fallbackVoice = genderPresets[i % genderPresets.length] || VOICE_PRESETS[0];
      const preset = suggestedPreset || fallbackVoice;
      return { ...c, id: `char_${crypto.randomUUID()}`, voiceId: preset.id, voiceSettings: { pitch: preset.defaultPitch, speed: preset.defaultSpeed } };
    }),
    scenes: data.scenes.map((s: any, i: number) => ({ ...s, id: Date.now() + i, cameraMotion: 'random_cinematic', transition: 'fade' })),
    tasks: (data.tasks || []).map((t: any, i: number) => ({ ...t, id: `task_${i}`, status: 'pending' })),
    modules: data.modules,
    metadata: data.metadata
  };
};

export const generateCharacterImage = async (character: Character, resolution: Resolution, style: string, seed?: number): Promise<string> => {
  return retryWithBackoff(async () => {
    const ai = await getAIClient();
    const response = await withTimeout(ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: `${style} character portrait of ${character.name}. ${character.visualPrompt}. Professional studio lighting. High fidelity.`,
      config: { imageConfig: { aspectRatio: "1:1" }, seed }
    }), 120000, 'Character image');
    const data = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
    if (!data) throw new Error('Character image generation returned no data. The prompt may have been safety-filtered.');
    return `data:image/png;base64,${data}`;
  });
};

export const generateSceneImage = async (scene: Scene, characters: Character[], aspectRatio: AspectRatio, resolution: Resolution, feedback?: string, style: string = "Cinematic", seed?: number, styleReferenceBase64?: string): Promise<string> => {
  // Check cache first (only if no feedback, since feedback modifies generation)
  if (!feedback && seed !== undefined) {
    const cached = getCachedAsset(
      scene.visualPrompt,
      style,
      resolution,
      aspectRatio,
      seed
    );
    if (cached) return cached;
  }

  return retryWithBackoff(async () => {
    const ai = await getAIClient();
    const parts: any[] = [];

    if (styleReferenceBase64) {
      parts.push({ inlineData: { mimeType: 'image/png', data: styleReferenceBase64.split(',')[1] } });
      parts.push({ text: "Use this image as a Master Style Reference for color palette and lighting." });
    }

    characters.filter(c => scene.charactersInScene.includes(c.name) && c.referenceImageBase64).forEach(c => {
      parts.push({ inlineData: { mimeType: 'image/png', data: c.referenceImageBase64!.split(',')[1] } });
      parts.push({ text: `Maintain visual consistency for character: ${c.name}.` });
    });

    parts.push({ text: `Style: ${style}. Scene Description: ${scene.visualPrompt}. ${feedback || ''}. Cinematic 8k rendering. High quality textures.` });

    const response = await withTimeout(ai.models.generateContent({
      model: MODEL_NAMES.IMAGE, // Use consistent image generation model for all resolutions
      contents: { parts },
      config: { imageConfig: { aspectRatio, imageSize: resolution === Resolution.FHD ? '2K' : '1K' }, seed }
    }), 120000, 'Image generation');
    const data = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
    if (!data) throw new Error('Scene image generation returned no data. The prompt may have been safety-filtered.');

    const imageUrl = `data:image/png;base64,${data}`;

    // Cache the result (only if no feedback)
    if (!feedback && seed !== undefined) {
      cacheAsset(imageUrl, scene.visualPrompt, style, resolution, aspectRatio, seed);
    }

    return imageUrl;
  });
};

export const generateSceneVideo = async (imageBase64: string, prompt: string, aspectRatio: AspectRatio, resolution: Resolution, style: string = "Cinematic"): Promise<string> => {
  return retryWithBackoff(async () => {
    const ai = await getAIClient();
    let operation: any = await withTimeout(ai.models.generateVideos({
      model: resolution === Resolution.FHD ? MODEL_NAMES.VIDEO : MODEL_NAMES.VIDEO_FAST,
      prompt: `${style}. ${prompt}. Subtle cinematic motion.`,
      image: { imageBytes: imageBase64.split(',')[1], mimeType: 'image/png' },
      config: { numberOfVideos: 1, aspectRatio: (aspectRatio === AspectRatio.PORTRAIT ? '9:16' : '16:9') as any, resolution }
    }), 60000, 'Video generation init');

    const VIDEO_TIMEOUT = 5 * 60 * 1000; // 5 minute max
    const startTime = Date.now();

    // Exponential backoff polling to reduce API calls
    let pollInterval = 5000; // Start with 5s
    while (!operation.done) {
      const elapsed = Date.now() - startTime;

      if (elapsed > VIDEO_TIMEOUT) {
        throw new Error(`Video generation timed out after ${VIDEO_TIMEOUT / 60000} minutes`);
      }

      await new Promise(r => setTimeout(r, pollInterval));
      operation = await withTimeout(ai.operations.getVideosOperation({ operation }), 30000, 'Video poll');

      // Increase poll interval based on elapsed time
      if (elapsed < 30000) {
        pollInterval = 5000; // 0-30s: 5s intervals
      } else if (elapsed < 60000) {
        pollInterval = 10000; // 30-60s: 10s intervals
      } else if (elapsed < 120000) {
        pollInterval = 15000; // 60-120s: 15s intervals
      } else {
        pollInterval = 20000; // 120s+: 20s intervals
      }
    }
    const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!videoUri) throw new Error('Video generation completed but returned no video URI.');

    // Download video through secure proxy to prevent API key exposure
    const proxyResponse = await withTimeout(
      fetch(`${PROXY_URL}/api/download-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUri })
      }),
      60000,
      'Video download'
    );

    if (!proxyResponse.ok) {
      const errorData = await proxyResponse.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(`Video download failed: ${errorData.error || proxyResponse.statusText}`);
    }

    const blob = await proxyResponse.blob();
    return await blobToBase64(blob);
  }, 2, 10000); // fewer retries for video since it's long-running
};

export const extendSceneVideo = async (prevVideoUri: string, prompt: string, aspectRatio: AspectRatio): Promise<string> => {
  return retryWithBackoff(async () => {
    const ai = await getAIClient();
    // Only 720p videos can be extended currently according to guidelines
    let operation: any = await withTimeout(ai.models.generateVideos({
      model: 'veo-3.1-generate-preview',
      prompt: `Continue the scene: ${prompt}`,
      video: { uri: prevVideoUri },
      config: {
        numberOfVideos: 1,
        resolution: '720p',
        aspectRatio: (aspectRatio === AspectRatio.PORTRAIT ? '9:16' : '16:9') as any
      }
    }), 60000, 'Video extend init');

    const VIDEO_TIMEOUT = 5 * 60 * 1000; // 5 minute max
    const startTime = Date.now();

    // Exponential backoff polling to reduce API calls
    let pollInterval = 5000; // Start with 5s
    while (!operation.done) {
      const elapsed = Date.now() - startTime;

      if (elapsed > VIDEO_TIMEOUT) {
        throw new Error(`Video extension timed out after ${VIDEO_TIMEOUT / 60000} minutes`);
      }

      await new Promise(r => setTimeout(r, pollInterval));
      operation = await withTimeout(ai.operations.getVideosOperation({ operation }), 30000, 'Video extend poll');

      // Increase poll interval based on elapsed time
      if (elapsed < 30000) {
        pollInterval = 5000; // 0-30s: 5s intervals
      } else if (elapsed < 60000) {
        pollInterval = 10000; // 30-60s: 10s intervals
      } else if (elapsed < 120000) {
        pollInterval = 15000; // 60-120s: 15s intervals
      } else {
        pollInterval = 20000; // 120s+: 20s intervals
      }
    }
    const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!videoUri) throw new Error('Video extension completed but returned no video URI.');

    // Download video through secure proxy to prevent API key exposure
    const proxyResponse = await withTimeout(
      fetch(`${PROXY_URL}/api/download-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUri })
      }),
      60000,
      'Video extend download'
    );

    if (!proxyResponse.ok) {
      const errorData = await proxyResponse.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(`Video download failed: ${errorData.error || proxyResponse.statusText}`);
    }

    const blob = await proxyResponse.blob();
    return await blobToBase64(blob);
  }, 2, 10000);
};

export interface AudioGenerationResult {
  audioUrl: string;
  hasErrors: boolean;
  errorDetails?: string[];
}

export const generateSceneAudio = async (lines: DialogueLine[], characters: Character[]): Promise<AudioGenerationResult> => {
  const ai = await getAIClient();
  const errorDetails: string[] = [];
  const parts: Uint8Array[] = [];
  let successCount = 0;
  let failureCount = 0;

  // Group consecutive lines by speaker pairs for batch processing
  const batches: { lines: DialogueLine[], speakers: string[] }[] = [];
  let currentBatch: DialogueLine[] = [];
  let currentSpeakers = new Set<string>();

  for (const line of lines) {
    if (!line.text.trim()) continue;

    const lineSpeakers = new Set([...currentSpeakers, line.speaker]);

    // If adding this line would exceed 2 speakers, start new batch
    if (lineSpeakers.size > 2 && currentBatch.length > 0) {
      batches.push({ lines: currentBatch, speakers: Array.from(currentSpeakers) });
      currentBatch = [line];
      currentSpeakers = new Set([line.speaker]);
    } else {
      currentBatch.push(line);
      currentSpeakers = lineSpeakers;
    }
  }

  // Add final batch
  if (currentBatch.length > 0) {
    batches.push({ lines: currentBatch, speakers: Array.from(currentSpeakers) });
  }

  // Process each batch
  for (const batch of batches) {
    // Use multi-speaker TTS for 2-speaker batches with multiple lines
    if (batch.speakers.length === 2 && batch.lines.length > 1) {
      try {
        const audioUrl = await retryWithBackoff(async () => {
          const prompt = `TTS the following conversation:\n${batch.lines.map(l => `${l.speaker}: ${l.text}`).join('\n')}`;
          const speakerConfigs = batch.speakers.map(name => {
            const char = characters.find(c => c.name === name);
            const preset = VOICE_PRESETS.find(p => p.id === char?.voiceId) || VOICE_PRESETS[0];
            return {
              speaker: name,
              voiceConfig: { prebuiltVoiceConfig: { voiceName: preset.apiVoiceName } }
            };
          });

          const res = await withTimeout(ai.models.generateContent({
            model: MODEL_NAMES.TTS,
            contents: [{ parts: [{ text: prompt }] }],
            config: {
              responseModalities: [Modality.AUDIO],
              speechConfig: {
                multiSpeakerVoiceConfig: {
                  speakerVoiceConfigs: speakerConfigs as any
                }
              }
            }
          }), 60000, 'Multi-speaker TTS');
          const data = res.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
          return data ? base64ToUint8Array(data) : null;
        });

        if (audioUrl) {
          parts.push(audioUrl);
          successCount += batch.lines.length;
        } else {
          failureCount += batch.lines.length;
          batch.lines.forEach(line => {
            errorDetails.push(`${line.speaker}: "${line.text.substring(0, 40)}..." - Multi-speaker batch failed`);
          });
        }
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        console.error(`[generateSceneAudio] Multi-speaker TTS batch failed:`, e);
        failureCount += batch.lines.length;
        batch.lines.forEach(line => {
          errorDetails.push(`${line.speaker}: "${line.text.substring(0, 40)}..." - ${errorMsg}`);
        });
      }
    } else {
      // Process single lines individually
      for (const line of batch.lines) {
        const char = characters.find(c => c.name === line.speaker);
        const preset = VOICE_PRESETS.find(p => p.id === char?.voiceId) || VOICE_PRESETS[0];
        try {
          const res = await retryWithBackoff(async () => {
            return await withTimeout(ai.models.generateContent({
              model: MODEL_NAMES.TTS,
              contents: [{ parts: [{ text: `<speak><prosody rate="${char?.voiceSettings?.speed || 1}" pitch="${char?.voiceSettings?.pitch || 0}st">${line.text}</prosody></speak>` }] }],
              config: { responseModalities: [Modality.AUDIO], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: preset.apiVoiceName } } } }
            }), 30000, 'Single-line TTS');
          });
          const data = res.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
          if (data) {
            parts.push(base64ToUint8Array(data));
            successCount++;
          } else {
            failureCount++;
            errorDetails.push(`${line.speaker}: "${line.text.substring(0, 40)}..." - No audio data returned`);
          }
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : String(e);
          console.error(`[generateSceneAudio] TTS failed for line "${line.text.substring(0, 40)}...", skipping:`, e);
          failureCount++;
          errorDetails.push(`${line.speaker}: "${line.text.substring(0, 40)}..." - ${errorMsg}`);
        }
      }
    }
  }

  const audioUrl = parts.length ? `data:audio/pcm;base64,${uint8ArrayToBase64(concatUint8Arrays(parts))}` : "";
  const hasErrors = failureCount > 0;

  if (hasErrors) {
    console.warn(`[generateSceneAudio] Audio generation completed with errors: ${successCount} succeeded, ${failureCount} failed`);
  } else if (batches.length > 0) {
    console.log(`[generateSceneAudio] Optimized TTS: ${batches.filter(b => b.speakers.length === 2 && b.lines.length > 1).length} batches processed`);
  }

  return { audioUrl, hasErrors, errorDetails: hasErrors ? errorDetails : undefined };
};

export const triggerApiKeySelection = async () => { if (typeof window !== 'undefined' && window.aistudio) await window.aistudio.openSelectKey(); };

export const optimizeVisualPrompt = async (line: string, style: string): Promise<string> => {
  return retryWithBackoff(async () => {
    const ai = await getAIClient();
    const res = await withTimeout(ai.models.generateContent({ model: MODEL_NAMES.CHECK, contents: `Optimize for ${style}: ${line}` }), 30000, 'Visual prompt optimization');
    return res.text || line;
  });
};

export const previewVoice = async (voiceId: string, settings: { speed: number, pitch: number }): Promise<string> => {
  return retryWithBackoff(async () => {
    const ai = await getAIClient();
    const preset = VOICE_PRESETS.find(p => p.id === voiceId) || VOICE_PRESETS[0];
    const res = await withTimeout(ai.models.generateContent({
      model: MODEL_NAMES.TTS,
      contents: [{ parts: [{ text: `Sampling vocal profile.` }] }],
      config: { responseModalities: [Modality.AUDIO], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: preset.apiVoiceName } } } }
    }), 30000, 'Voice preview');
    return res.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || "";
  });
};

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
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

export const decodeAudio = async (base64: string, ctx: AudioContext): Promise<AudioBuffer> => {
  const bytes = base64ToUint8Array(base64);
  // Raw PCM from Gemini is 16-bit little-endian mono 24kHz
  const numChannels = 1;
  const sampleRate = 24000;
  const dataInt16 = new Int16Array(bytes.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export const generateVideoScript = async (topic: string): Promise<string> => {
  return retryWithBackoff(async () => {
    const ai = await getAIClient();
    const res = await withTimeout(ai.models.generateContent({ model: MODEL_NAMES.CHECK, contents: `High-quality video script: ${topic}. Use [Scene: ...] format.` }), 60000, 'Script generation');
    return res.text || "";
  });
};

// ===============================
// Asset Validation Functions
// ===============================

export interface AssetValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates a base64-encoded image
 * Checks: valid base64, decodable, reasonable size
 */
export const validateImage = (imageUrl: string): AssetValidationResult => {
  try {
    if (!imageUrl || !imageUrl.includes('data:image')) {
      return { valid: false, error: 'Invalid image format: must be data URI' };
    }

    // Extract base64 data
    const base64Data = imageUrl.split(',')[1];
    if (!base64Data || base64Data.length < 100) {
      return { valid: false, error: 'Image data too small or missing' };
    }

    // Check base64 is valid by attempting decode
    try {
      const binaryString = atob(base64Data);
      // Verify minimum size (at least 1KB for a valid image)
      if (binaryString.length < 1024) {
        return { valid: false, error: 'Image size too small (< 1KB)' };
      }
      // Verify maximum reasonable size (20MB)
      if (binaryString.length > 20 * 1024 * 1024) {
        return { valid: false, error: 'Image size too large (> 20MB)' };
      }
    } catch (e) {
      return { valid: false, error: 'Invalid base64 encoding' };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: `Image validation error: ${error}` };
  }
};

/**
 * Validates a video blob URL
 * Checks: valid blob URL format, not empty
 */
export const validateVideo = (videoUrl: string): AssetValidationResult => {
  try {
    if (!videoUrl) {
      return { valid: false, error: 'Video URL is empty' };
    }

    // Check if it's a valid blob URL or data URI
    const isBlobUrl = videoUrl.startsWith('blob:');
    const isDataUri = videoUrl.startsWith('data:video') || videoUrl.includes('generativelanguage.googleapis.com');

    if (!isBlobUrl && !isDataUri) {
      return { valid: false, error: 'Invalid video format: must be blob URL or data URI' };
    }

    // For data URIs, check size
    if (isDataUri && videoUrl.includes('data:video')) {
      const base64Data = videoUrl.split(',')[1];
      if (!base64Data || base64Data.length < 1000) {
        return { valid: false, error: 'Video data too small' };
      }
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: `Video validation error: ${error}` };
  }
};

/**
 * Validates an audio data URI (base64-encoded PCM)
 * Checks: valid format, decodable, reasonable duration
 */
export const validateAudio = (audioUrl: string): AssetValidationResult => {
  try {
    if (!audioUrl || !audioUrl.includes('data:audio')) {
      return { valid: false, error: 'Invalid audio format: must be data URI' };
    }

    // Extract base64 data
    const base64Data = audioUrl.split(',')[1];
    if (!base64Data || base64Data.length < 100) {
      return { valid: false, error: 'Audio data too small or missing' };
    }

    // Check base64 is valid
    try {
      const binaryString = atob(base64Data);
      // PCM audio at 24kHz, 16-bit: minimum 1 second = ~48KB
      if (binaryString.length < 10000) {
        return { valid: false, error: 'Audio duration too short (< 0.2s)' };
      }
      // Maximum 60 seconds at 24kHz = ~2.8MB
      if (binaryString.length > 5 * 1024 * 1024) {
        return { valid: false, error: 'Audio duration too long (> 60s)' };
      }
    } catch (e) {
      return { valid: false, error: 'Invalid base64 encoding' };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: `Audio validation error: ${error}` };
  }
};
