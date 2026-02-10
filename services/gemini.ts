
import { GoogleGenAI, Type, Modality, HarmCategory, HarmBlockThreshold, GenerateContentResponse, FunctionDeclaration, LiveServerMessage } from "@google/genai";
import { MODEL_NAMES, VOICE_PRESETS, VoicePreset } from "../constants";
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

const getAIClient = async (): Promise<GoogleGenAI> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key not found.");
  return new GoogleGenAI({ apiKey });
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
    const isRateLimit =
      err?.status === 429 ||
      err?.code === 429 ||
      (typeof err?.message === 'string' && (
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
    ] as any,
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
  const ai = await getAIClient();
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

  const response = await ai.models.generateContent({
    model: MODEL_NAMES.THINKING,
    contents: prompt,
    config: { responseMimeType: "application/json", responseSchema: schema, thinkingConfig: { thinkingBudget: 4000 }, seed }
  });

  const data = JSON.parse(cleanJsonResponse(response.text || "{}"));
  return {
    description: data.description,
    visualPrompt: data.visualPrompt,
    voiceId: data.suggestedVoiceId
  };
};

export const suggestBRoll = async (project: ProjectState): Promise<Scene[]> => {
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

  const response = await ai.models.generateContent({
    model: MODEL_NAMES.THINKING,
    contents: prompt,
    config: { responseMimeType: "application/json", responseSchema: schema, thinkingConfig: { thinkingBudget: 4000 }, seed: project.productionSeed }
  });

  return JSON.parse(cleanJsonResponse(response.text || "[]"));
};

export const analyzeViralPotential = async (script: string, seed?: number): Promise<ViralPotential> => {
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

  const response = await ai.models.generateContent({
    model: MODEL_NAMES.THINKING,
    contents: prompt,
    config: { responseMimeType: "application/json", responseSchema: schema, thinkingConfig: { thinkingBudget: 4000 }, seed }
  });

  return JSON.parse(cleanJsonResponse(response.text || "{}"));
};

export const generateMarketingContent = async (platform: string, script: string, metadata: any): Promise<string> => {
  const ai = await getAIClient();
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
  const ai = await getAIClient();
  const textPrompt = `Suggest a short (max 3 words), high-impact text overlay for a YouTube thumbnail with the title: "${title}"`;
  const textRes = await ai.models.generateContent({
    model: MODEL_NAMES.CHECK,
    contents: textPrompt
  });
  const suggestedText = textRes.text?.trim().replace(/"/g, '') || "WATCH NOW";

  const charContext = characters.length > 0 ? `Featuring characters: ${characters.map(c => c.name).join(', ')}.` : "";
  const imgPrompt = `YouTube thumbnail background for a video titled "${title}". ${charContext} Style: ${style}. High contrast, vibrant, eye-catching.`;

  const imgRes = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
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
          },
          required: ["name", "description", "gender", "visualPrompt"]
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

  const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
    model: MODEL_NAMES.THINKING,
    contents: `Analyze script and extract production manifest: ${script}`,
    config: { responseMimeType: "application/json", responseSchema: analysisSchema, thinkingConfig: { thinkingBudget: 12000 }, seed }
  }));

  const data = JSON.parse(cleanJsonResponse(response.text || "{}"));
  return {
    characters: data.characters.map((c: any, i: number) => ({ ...c, id: `char_${crypto.randomUUID()}`, voiceId: VOICE_PRESETS[0].id, voiceSettings: { pitch: 0, speed: 1 } })),
    scenes: data.scenes.map((s: any) => ({ ...s, id: crypto.randomUUID(), cameraMotion: 'random_cinematic', transition: 'fade' })),
    tasks: (data.tasks || []).map((t: any, i: number) => ({ ...t, id: `task_${i}`, status: 'pending' })),
    modules: data.modules,
    metadata: data.metadata
  };
};

export const generateCharacterImage = async (character: Character, resolution: Resolution, style: string, seed?: number): Promise<string> => {
  const ai = await getAIClient();
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: `${style} character portrait of ${character.name}. ${character.visualPrompt}. Professional studio lighting. High fidelity.`,
    config: { imageConfig: { aspectRatio: "1:1" }, seed }
  });
  const data = response.candidates?.[0]?.content?.parts.find(p => p.inlineData)?.inlineData?.data;
  if (!data) throw new Error('Character image generation returned no data. The prompt may have been safety-filtered.');
  return `data:image/png;base64,${data}`;
};

export const generateSceneImage = async (scene: Scene, characters: Character[], aspectRatio: AspectRatio, resolution: Resolution, feedback?: string, style: string = "Cinematic", seed?: number, styleReferenceBase64?: string): Promise<string> => {
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

  const response = await ai.models.generateContent({
    model: resolution === Resolution.FHD ? MODEL_NAMES.IMAGE : 'gemini-2.5-flash-image',
    contents: { parts },
    config: { imageConfig: { aspectRatio, imageSize: resolution === Resolution.FHD ? '2K' : '1K' }, seed }
  });
  const data = response.candidates?.[0]?.content?.parts.find(p => p.inlineData)?.inlineData?.data;
  if (!data) throw new Error('Scene image generation returned no data. The prompt may have been safety-filtered.');
  return `data:image/png;base64,${data}`;
};

export const generateSceneVideo = async (imageBase64: string, prompt: string, aspectRatio: AspectRatio, resolution: Resolution, style: string = "Cinematic"): Promise<string> => {
  const ai = await getAIClient();
  let operation: any = await ai.models.generateVideos({
    model: resolution === Resolution.FHD ? MODEL_NAMES.VIDEO : MODEL_NAMES.VIDEO_FAST,
    prompt: `${style}. ${prompt}. Subtle cinematic motion.`,
    image: { imageBytes: imageBase64.split(',')[1], mimeType: 'image/png' },
    config: { numberOfVideos: 1, aspectRatio: (aspectRatio === AspectRatio.PORTRAIT ? '9:16' : '16:9') as any, resolution }
  });
  while (!operation.done) { await new Promise(r => setTimeout(r, 10000)); operation = await ai.operations.getVideosOperation({ operation }); }
  const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!videoUri) throw new Error('Video generation completed but returned no video URI.');
  const blob = await (await fetch(`${videoUri}&key=${process.env.API_KEY}`)).blob();
  return await blobToBase64(blob);
};

export const extendSceneVideo = async (prevVideoUri: string, prompt: string, aspectRatio: AspectRatio): Promise<string> => {
  const ai = await getAIClient();
  // Only 720p videos can be extended currently according to guidelines
  let operation: any = await ai.models.generateVideos({
    model: 'veo-3.1-generate-preview',
    prompt: `Continue the scene: ${prompt}`,
    video: { uri: prevVideoUri },
    config: {
      numberOfVideos: 1,
      resolution: '720p',
      aspectRatio: (aspectRatio === AspectRatio.PORTRAIT ? '9:16' : '16:9') as any
    }
  });
  while (!operation.done) { await new Promise(r => setTimeout(r, 10000)); operation = await ai.operations.getVideosOperation({ operation }); }
  const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!videoUri) throw new Error('Video extension completed but returned no video URI.');
  const blob = await (await fetch(`${videoUri}&key=${process.env.API_KEY}`)).blob();
  return await blobToBase64(blob);
};

export const generateSceneAudio = async (lines: DialogueLine[], characters: Character[]): Promise<string> => {
  const ai = await getAIClient();
  const speakersInScene = Array.from(new Set(lines.map(l => l.speaker)));

  if (speakersInScene.length === 2) {
    const prompt = `TTS the following conversation:\n${lines.map(l => `${l.speaker}: ${l.text}`).join('\n')}`;
    const speakerConfigs = speakersInScene.map(name => {
      const char = characters.find(c => c.name === name);
      const preset = VOICE_PRESETS.find(p => p.id === char?.voiceId) || VOICE_PRESETS[0];
      return {
        speaker: name,
        voiceConfig: { prebuiltVoiceConfig: { voiceName: preset.apiVoiceName } }
      };
    });

    const res = await ai.models.generateContent({
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
    });
    const data = res.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    return data ? `data:audio/pcm;base64,${data}` : "";
  }

  const parts: Uint8Array[] = [];
  for (const line of lines) {
    if (!line.text.trim()) continue;
    const char = characters.find(c => c.name === line.speaker);
    const preset = VOICE_PRESETS.find(p => p.id === char?.voiceId) || VOICE_PRESETS[0];
    const res = await ai.models.generateContent({
      model: MODEL_NAMES.TTS,
      contents: [{ parts: [{ text: `<speak><prosody rate="${char?.voiceSettings?.speed || 1}" pitch="${char?.voiceSettings?.pitch || 0}st">${line.text}</prosody></speak>` }] }],
      config: { responseModalities: [Modality.AUDIO], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: preset.apiVoiceName } } } }
    });
    const data = res.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (data) parts.push(base64ToUint8Array(data));
  }
  return parts.length ? `data:audio/pcm;base64,${uint8ArrayToBase64(concatUint8Arrays(parts))}` : "";
};

export const triggerApiKeySelection = async () => { if (typeof window !== 'undefined' && window.aistudio) await window.aistudio.openSelectKey(); };

export const optimizeVisualPrompt = async (line: string, style: string): Promise<string> => {
  const ai = await getAIClient();
  const res = await ai.models.generateContent({ model: MODEL_NAMES.CHECK, contents: `Optimize for ${style}: ${line}` });
  return res.text || line;
};

export const previewVoice = async (voiceId: string, settings: { speed: number, pitch: number }): Promise<string> => {
  const ai = await getAIClient();
  const preset = VOICE_PRESETS.find(p => p.id === voiceId) || VOICE_PRESETS[0];
  const res = await ai.models.generateContent({
    model: MODEL_NAMES.TTS,
    contents: [{ parts: [{ text: `Sampling vocal profile.` }] }],
    config: { responseModalities: [Modality.AUDIO], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: preset.apiVoiceName } } } }
  });
  return res.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || "";
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
  const ai = await getAIClient();
  const res = await ai.models.generateContent({ model: MODEL_NAMES.THINKING, contents: `High-quality video script: ${topic}. Use [Scene: ...] format.`, config: { thinkingBudget: 4000 } } as any);
  return res.text || "";
};
