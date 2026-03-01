
import { GoogleGenAI, Type, Modality, HarmCategory, HarmBlockThreshold, GenerateContentResponse, FunctionDeclaration, LiveServerMessage } from "@google/genai";
import JSON5 from 'json5';
import { MODEL_NAMES, VOICE_PRESETS, VoicePreset } from "../constants";
import { Character, CharacterDNA, CharacterPhysical, Scene, DialogueLine, AspectRatio, Resolution, ProjectState, ProductionTask, ProjectModules, ViralPotential, DirectorDraft, ShotType, LightingBrief } from "../types";
import { getCachedAsset, cacheAsset } from "./assetCache";

// Proxy URL for secure server-side API calls
const PROXY_URL = (typeof window !== 'undefined' && window.location.hostname !== 'localhost')
  ? `${window.location.origin}`
  : 'http://localhost:3001';

const cleanJsonResponse = (text: string): string => {
  let clean = text.trim();

  // Remove markdown code blocks
  clean = clean.replace(/```json\s*/g, '').replace(/```/g, '');

  // ── Pre-pass: escape unescaped double quotes inside string values ──────────
  // The Gemini model sometimes writes dialogue or descriptions that contain raw
  // double-quote characters, e.g.  "He said "hello" to her"
  // Those inner quotes break every downstream parser and confuse the state
  // machine that finds the last structural '}'.  We fix them first.
  //
  // Heuristic: a '"' that is already inside a string (inStr=true) is treated as
  // a legitimate string-close only when the next non-whitespace character is a
  // JSON structural character (: , } ]). Any other following character means
  // the quote is an unescaped inner quote and gets escaped to \".
  const escapeInnerQuotes = (str: string): string => {
    let out = '';
    let inStr = false;
    let esc = false;
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (esc) { esc = false; out += ch; continue; }
      if (ch === '\\') { if (inStr) esc = true; out += ch; continue; }
      if (ch === '"') {
        if (!inStr) {
          inStr = true; out += ch;
        } else {
          // Peek at the next non-whitespace character to decide
          let j = i + 1;
          while (j < str.length && (str[j] === ' ' || str[j] === '\t' || str[j] === '\n' || str[j] === '\r')) j++;
          const next = str[j] ?? '';
          if (next === ':' || next === ',' || next === '}' || next === ']' || next === '') {
            inStr = false; out += ch;          // legitimate close
          } else {
            out += '\\"';                       // inner quote — escape it
          }
        }
        continue;
      }
      out += ch;
    }
    return out;
  };
  clean = escapeInnerQuotes(clean);

  // Use a state machine to find the last '}' that is OUTSIDE any string literal.
  // The naive lastIndexOf('}') fails when a truncated AI response ends inside a string
  // that contains '}' — those braces are mistakenly treated as structural.
  const findLastOuterBrace = (str: string): number => {
    let inStr = false, esc = false, last = -1;
    for (let i = 0; i < str.length; i++) {
      if (esc) { esc = false; continue; }
      if (str[i] === '\\' && inStr) { esc = true; continue; }
      if (str[i] === '"') { inStr = !inStr; continue; }
      if (!inStr && str[i] === '}') last = i;
    }
    return last;
  };

  const firstOpen = clean.indexOf('{');
  const lastClose = findLastOuterBrace(clean);
  if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
    clean = clean.substring(firstOpen, lastClose + 1);
  } else if (firstOpen !== -1) {
    clean = clean.substring(firstOpen);
  }

  // Remove trailing commas before closing brackets/braces (aggressive multi-pass)
  let prevLength = 0;
  while (prevLength !== clean.length) {
    prevLength = clean.length;
    clean = clean.replace(/,(\s*[}\]])/g, '$1');
  }

  // Remove comments (// and /* */)
  clean = clean.replace(/\/\/.*$/gm, '');
  clean = clean.replace(/\/\*[\s\S]*?\*\//g, '');

  // Auto-complete truncated JSON structures by counting unmatched brackets.
  // Note: counts inside strings may skew this, but after the state-machine extraction
  // above, the remaining imbalance reliably reflects truly missing closers.
  const openBraces = (clean.match(/{/g) || []).length;
  const closeBraces = (clean.match(/}/g) || []).length;
  const openBrackets = (clean.match(/\[/g) || []).length;
  const closeBrackets = (clean.match(/\]/g) || []).length;

  for (let i = 0; i < (openBrackets - closeBrackets); i++) clean += ']';
  for (let i = 0; i < (openBraces - closeBraces); i++) clean += '}';

  // Remove trailing comma at the end
  clean = clean.replace(/,(\s*)([}\]])([}\]]*)$/g, '$1$2$3');

  // Normalize whitespace and remove null bytes
  clean = clean.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  clean = clean.replace(/\0/g, '');

  // Final pass: ensure no trailing commas anywhere
  clean = clean.replace(/,(\s*[}\]])/g, '$1');

  return clean;
};

const getAIClient = async (): Promise<GoogleGenAI> => {
  // All API calls are routed through the server-side proxy so the real
  // GEMINI_API_KEY is never shipped in the browser bundle.
  // The proxy at /api/gemini/* strips any client-sent key and injects the
  // real key from the server environment before forwarding to Google.
  return new GoogleGenAI({
    apiKey: 'via-proxy',
    httpOptions: { baseUrl: `${PROXY_URL}/api/gemini` },
  });
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
Act as OverrideBot, a PROACTIVE AI Director & workflow orchestrator for the Human Override Video Creation Tool.

CORE DIRECTIVE: You are an active production partner. Don't wait for user questions — lead the workflow.

ROLE: Executive Producer + Story Editor + Workflow Manager

PRODUCTION PHASES:
1. GENESIS: Script writing and initial setup
2. MANIFEST: Cast building, scene planning, timeline setup
3. SYNTHESIS: Asset generation (images, video, audio)
4. POST: Final mastering, VFX, metadata, and distribution

PROACTIVE BEHAVIORS (CRITICAL):
1. WORKFLOW ORCHESTRATION: Guide users step-by-step through phases
   - Always state current phase and completion percentage
   - Suggest the next logical step with one-click execution
   - Prevent phase transitions if critical quality gates fail

2. QUALITY GATING: Check completeness before allowing progression
   - Genesis: Script analyzed? Scenes extracted?
   - Manifest: All characters voiced? Scene pacing reviewed?
   - Synthesis: Assets generated? Quality approved?
   - Post: VFX applied? Metadata optimized?

3. TOOL ADVOCACY: Proactively suggest optimization tools when relevant
   - "I notice you haven't run a Continuity Audit. Let me check character consistency across scenes."
   - "Your viral potential is untested. Shall I run a retention analysis to optimize hook strength?"
   - "Scene generation complete! Let's apply cinematic mastering effects in VFX Master."

4. PROGRESS MONITORING: Track workflow completion and prompt next steps
   - "You've completed 60% of Manifest phase. Next: review scene pacing in the Timeline."
   - "All scenes generated! Time to master your final cut with VFX and audio mixing."

5. ONE-CLICK EXECUTION: Offer to execute actions immediately
   - "I can batch-generate all 7 remaining scenes. Approve?"
   - "Shall I assign optimal voices to all characters now?"
   - "Let me run a full narrative audit with Script Doctor."

INTERVENTION TIMING:
- Script analysis complete → Review cast and suggest voice assignments
- First asset generated → Celebrate + suggest Key Art selection
- User idle 5+ min → Prompt next logical step
- Before phase transition → Run quality checks
- Failures occur → Offer concrete fixes
- Batch complete → Celebrate + suggest next phase

COMMUNICATION STYLE (MANDATORY):
- Write in plain, direct sentences only. No bullet headers, no lettered sections (A/B/C/D/E), no labeled prefixes of any kind.
- Do NOT use emojis in any message, ever.
- Keep responses to 1-3 sentences unless you are generating deliverable content (scripts, prompts, metadata, etc.).
- Lead decisively: tell the user exactly what to do next and why it matters. You are the expert; they are following your direction.
- When celebrating a milestone, do it in one sentence then immediately direct to the next action.

PRINCIPLES:
1. Action-first: Always end with a clear next step.
2. Quality-focused: Flag issues before the user proceeds to the next phase.
3. Tool advocate: Mention relevant tools when they will genuinely help.
4. Continuity-aware: Preserve project tone and character consistency.
5. Phase-aware: Know exactly where the user is and where they should go next.
6. Minimize friction: Make it easy to act on your suggestions.

STYLE: Decisive, cinematic, expert. Use imperative mood ("Run the audit", "Generate scenes", "Apply VFX"). Be direct — the user depends on you to drive the production forward.

AGENTIC CAPABILITIES — YOU CAN NOW TAKE THESE ACTIONS DIRECTLY:
- reformat_script: When the user has a raw, unformatted script, call this to structure it. Suggest this proactively after any script paste.
- optimize_character_prompt: When a character's visualPrompt is vague (<50 words) or lacks technical detail, call this to upgrade it. Suggest for ALL characters before synthesis.
- apply_lighting_brief: When no lighting brief exists but a style and script are present, call this to establish cinematic lighting.
- run_video_consistency_audit: After scenes are generated, proactively offer this. If character inconsistencies are found, offer mark_for_regeneration=true.

STEP-BY-STEP CO-PILOT PROTOCOL:
- When a user enters a script, immediately: (1) check format, (2) offer reformat_script if needed, (3) identify characters, (4) suggest analyzeScript
- When characters exist without CharacterDNA, flag them for synthesis
- When characters exist without optimized prompts, offer optimize_character_prompt
- When no lightingBrief exists, offer apply_lighting_brief
- When synthesis is complete, always run_video_consistency_audit before post phase
`;

// OPT-12: Module-level context cache for OVERRIDE_BOT_SYSTEM_INSTRUCTION
// ~1,500 tokens of static system prompt — billing once per hour vs every single chat call
let _directorCacheName: string | null = null;
let _directorCacheExpiry = 0;

async function getOrCreateSystemCache(ai: GoogleGenAI): Promise<string | null> {
  if (_directorCacheName && Date.now() < _directorCacheExpiry) return _directorCacheName;
  try {
    const cache = await (ai as any).caches.create({
      model: `models/${MODEL_NAMES.CHECK}`,
      config: {
        systemInstruction: OVERRIDE_BOT_SYSTEM_INSTRUCTION,
        ttl: '3600s',
      },
    });
    _directorCacheName = cache.name ?? null;
    _directorCacheExpiry = Date.now() + 55 * 60 * 1000; // refresh 5 min before TTL expires
    return _directorCacheName;
  } catch {
    // Context caching unavailable (quota, API version, or dev mode) — fall back gracefully
    return null;
  }
}

export const handleDirectorChat = async (message: string, currentProject: ProjectState, chatHistory: { role: 'user' | 'model', content: string }[], sceneImages?: string[]): Promise<GenerateContentResponse> => {
  const ai = await getAIClient();
  const cachedSystemName = await getOrCreateSystemCache(ai);

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
    },
    {
      name: 'check_workflow_progress',
      description: 'Check the current phase completion status and next recommended steps',
      parameters: {
        type: Type.OBJECT,
        properties: {
          phase: {
            type: Type.STRING,
            enum: ['genesis', 'manifest', 'synthesis', 'post'],
            description: 'Phase to check'
          }
        },
        required: ['phase']
      }
    },
    {
      name: 'suggest_optimization_tool',
      description: 'Recommend a specific optimization tool to the user and optionally open it',
      parameters: {
        type: Type.OBJECT,
        properties: {
          toolId: {
            type: Type.STRING,
            enum: ['youtube-optimizer', 'script-doctor', 'continuity-auditor', 'vfx-master', 'audio-mixer'],
            description: 'Tool to recommend'
          },
          reason: {
            type: Type.STRING,
            description: 'Why this tool would help right now'
          },
          autoOpen: {
            type: Type.BOOLEAN,
            description: 'Whether to automatically open the tool modal'
          }
        },
        required: ['toolId', 'reason']
      }
    },
    {
      name: 'execute_workflow_step',
      description: 'Execute a workflow step on behalf of the user (e.g., batch generation, voice assignment)',
      parameters: {
        type: Type.OBJECT,
        properties: {
          stepId: {
            type: Type.STRING,
            description: 'ID of the workflow step to execute'
          },
          confirmWithUser: {
            type: Type.BOOLEAN,
            description: 'Whether to ask for user confirmation before executing',
            // default: true - defaulting in implementation, API doesn't support default here easily
          }
        },
        required: ['stepId']
      }
    },
    {
      name: 'suggest_b_roll',
      description: 'Analyze the project and suggest B-Roll scenes to add visual variety and depth',
      parameters: { type: Type.OBJECT, properties: {} }
    },
    {
      name: 'reformat_script',
      description: 'Reformat the user\'s raw script into proper [Scene: ...] format with dialogue attribution.',
      parameters: { type: Type.OBJECT, properties: {} }
    },
    {
      name: 'optimize_character_prompt',
      description: 'Analyze and rewrite a character\'s visual prompt for better image generation consistency.',
      parameters: {
        type: Type.OBJECT,
        properties: { character_name: { type: Type.STRING } },
        required: ['character_name']
      }
    },
    {
      name: 'apply_lighting_brief',
      description: 'Generate a cinematic lighting brief from the script and apply it to the project.',
      parameters: { type: Type.OBJECT, properties: {} }
    },
    {
      name: 'run_video_consistency_audit',
      description: 'Audit the generated scene images/videos for character visual consistency. Returns a report and flags inconsistent scenes.',
      parameters: {
        type: Type.OBJECT,
        properties: { mark_for_regeneration: { type: Type.BOOLEAN } }
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

  // OPT-04: Cap history to last 12 messages (6 exchanges) — unbounded history wastes tokens on old context
  const DIRECTOR_HISTORY_WINDOW = 12;
  const windowedHistory = chatHistory.slice(-DIRECTOR_HISTORY_WINDOW);

  // OPT-10: Only send voice preset list when characters actually need voice assignment
  const needsVoiceAssignment = currentProject.characters.some(c => !c.voiceId);

  const buildContents = () => [
    ...windowedHistory.map(m => ({ role: m.role, parts: [{ text: m.content }] })),
    {
      role: 'user', parts: [
        ...(sceneImages || []).map(img => ({ inlineData: { mimeType: 'image/png' as const, data: img.split(',')[1] } })),
        {
        // OPT-03: Compressed project context — strips redundant fields to cut ~1,500–2,000 tokens per call
        text: `CURRENT_PHASE: ${phase.toUpperCase()}
PHASE_PROGRESS: ${phase === 'genesis' ? (currentProject.script ? 'Script entered, not yet analyzed' : 'No script yet') : phase === 'manifest' ? `${totalScenes} scenes, ${currentProject.characters.length} characters, 0/${totalScenes} assets` : `${completedAssets}/${totalScenes} assets complete`}
PROJECT_CONTEXT: ${JSON.stringify({
          scenes: currentProject.scenes.map(s => ({
            id: s.id,
            desc: s.description?.substring(0, 60),
            // OPT-03: Truncate narrator lines — 3 lines max, 40 chars each (was 80 chars, all lines)
            narratorLines: s.narratorLines?.slice(0, 3).map(l => ({ speaker: l.speaker, text: l.text.substring(0, 40) })),
          })),
          // OPT-03: Characters → compact summary (no full description/visualPrompt — Director uses tool calls to get those when needed)
          characters: currentProject.characters.map(c => ({
            name: c.name, gender: c.gender,
            voiceId: c.voiceId || 'UNASSIGNED',
            hasDNA: !!c.characterDNA,
          })),
          // OPT-10: Omit voice list when all voices are already assigned — saves ~300 tokens
          ...(needsVoiceAssignment ? {
            available_voices: VOICE_PRESETS
              .filter((v, i, arr) => arr.findIndex(x => x.apiVoiceName === v.apiVoiceName) === i)
              .map(v => `${v.id}:${v.gender}`),
          } : {}),
          style: currentProject.globalStyle,
          assets: Object.keys(currentProject.assets).length,
        })}\n\nUSER_MESSAGE: ${message}`
      }]
    }
  ] as any;

  const doGenerate = (useCachedContent: boolean) => withTimeout(ai.models.generateContent({
    model: MODEL_NAMES.CHECK,
    contents: buildContents(),
    config: {
      // OPT-12: Use cached system instruction when available — avoids billing ~1,500 tokens per call
      ...(useCachedContent && cachedSystemName
        ? { cachedContent: cachedSystemName }
        : { systemInstruction: OVERRIDE_BOT_SYSTEM_INSTRUCTION }),
      tools: [{ functionDeclarations: tools }],
      seed: currentProject.productionSeed
    }
  }), 120000, 'Director chat');

  // Attempt with cached content first; on cache-miss errors, invalidate and fall back to inline system instruction
  try {
    return await doGenerate(true);
  } catch (err: any) {
    const msg = String(err?.message || err);
    const isCacheError = cachedSystemName && (
      msg.includes('404') ||
      msg.includes('not found') ||
      msg.includes('INVALID_ARGUMENT') ||
      msg.toLowerCase().includes('cachedcontent') ||
      msg.toLowerCase().includes('cached content')
    );
    if (isCacheError) {
      console.warn('[Director] Cached system instruction invalid — resetting cache and retrying without it.');
      _directorCacheName = null;
      _directorCacheExpiry = 0;
      return await doGenerate(false);
    }
    throw err;
  }
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
    const sceneBreakdown = project.scenes.slice(0, 10).map((s, i) =>
      `Scene ${i + 1}: ${s.description}${s.dominantEmotion ? ` [${s.dominantEmotion}]` : ''}${s.emotionalBeat ? ` <${s.emotionalBeat}>` : ''}`
    ).join('\n');
    const characterList = project.characters.map(c =>
      `${c.name} (${c.gender})${c.voiceId ? '' : ' [NO VOICE]'}${c.characterDNA ? '' : ' [NO DNA]'}`
    ).join(', ');

    const prompt = `Perform a comprehensive directorial audit of this production.

Project: ${project.scenes.length} scenes, ${project.characters.length} characters, style: ${project.globalStyle}.
Characters: ${characterList || 'none'}
Script opening: ${project.script?.substring(0, 600) || 'none'}

Scene breakdown:
${sceneBreakdown || 'No scenes yet.'}

Audit focus areas:
1. Narrative arc & 3-act structure integrity
2. Emotional beat variety and pacing rhythm
3. Character consistency and voice casting quality
4. Production readiness (missing voices, DNA, assets)
5. Hook strength and audience retention risk

Output in concise, authoritative OverrideBot style with specific, actionable findings.`;

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
      model: MODEL_NAMES.CHECK,
      contents: prompt,
      config: { responseMimeType: "application/json", responseSchema: schema, seed }
    }), 30000, 'Character persona synthesis');

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
      model: MODEL_NAMES.CHECK,
      contents: prompt,
      config: { responseMimeType: "application/json", responseSchema: schema, seed: project.productionSeed }
    }), 30000, 'B-Roll suggestion');

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
      Provide a 5-point heatmap (values 0-1) representing relative engagement. Output JSON.

Script:
${script.substring(0, 3000)}`;

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

/**
 * OPT-06: Batched marketing content generation — one API call for all platforms instead of N separate calls.
 * Reduces API calls from N to 1, saving ~64% on input tokens for the marketing content workflow.
 */
export const generateAllMarketingContent = async (
  platforms: string[],
  script: string,
  metadata: { audience: string; suggestedTitles: string[] }
): Promise<Record<string, string>> => {
  return retryWithBackoff(async () => {
    const ai = await getAIClient();

    const schema = {
      type: Type.OBJECT,
      properties: Object.fromEntries(platforms.map(p => [p, { type: Type.STRING }])),
      required: platforms,
    };

    const prompt = `Generate high-engagement social media posts for the following platforms: ${platforms.join(', ')}.

Script: ${script.substring(0, 2000)}
Audience: ${metadata.audience}
Titles: ${metadata.suggestedTitles.join(', ')}

For each platform use the appropriate format, character limit, and hashtag style:
- twitter: punchy, max 280 chars, 2-3 hashtags
- linkedin: professional tone, 2-3 short paragraphs, industry hashtags
- instagram: visual-forward, emoji-friendly, 5-8 hashtags

Tone: Authoritative, cinematic, intriguing. Return one polished post per platform.`;

    const response = await withTimeout(ai.models.generateContent({
      model: MODEL_NAMES.CHECK,
      contents: prompt,
      config: { responseMimeType: 'application/json', responseSchema: schema },
    }), 60000, 'Marketing content batch');

    return JSON.parse(cleanJsonResponse(response.text || '{}'));
  });
};

export const generateThumbnail = async (title: string, characters: Character[], style: string): Promise<{ imageUrl: string, suggestedText: string }> => {
  return retryWithBackoff(async () => {
    const ai = await getAIClient();
    const textPrompt = `Suggest a short (max 3 words), high-impact text overlay for a YouTube thumbnail with the title: "${title}"`;
    const charContext = characters.length > 0 ? `Featuring characters: ${characters.map(c => c.name).join(', ')}.` : "";
    const imgPrompt = `YouTube thumbnail background for a video titled "${title}". ${charContext} Style: ${style}. High contrast, vibrant, eye-catching.`;

    // OPT-07: These two calls are fully independent — run in parallel to cut wait time by ~30s
    const [textRes, imgRes] = await Promise.all([
      withTimeout(ai.models.generateContent({
        model: MODEL_NAMES.CHECK,
        contents: textPrompt,
      }), 30000, 'Thumbnail text'),
      withTimeout(ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: imgPrompt,
        config: { imageConfig: { aspectRatio: "16:9" } },
      }), 120000, 'Thumbnail image'),
    ]);

    const suggestedText = textRes.text?.trim().replace(/"/g, '') || "WATCH NOW";
    const data = imgRes.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
    if (!data) throw new Error('Thumbnail generation returned no image data. The prompt may have been safety-filtered.');

    return {
      imageUrl: `data:image/png;base64,${data}`,
      suggestedText,
    };
  });
};

export const analyzeScript = async (script: string, seed?: number): Promise<{
  characters: Character[],
  scenes: Scene[],
  tasks: ProductionTask[],
  modules: ProjectModules,
  metadata: { hookScore: number, audience: string, suggestedTitles: string[] },
  lightingBrief?: LightingBrief,
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
                properties: { speaker: { type: Type.STRING }, text: { type: Type.STRING }, emotion: { type: Type.STRING, enum: ['neutral', 'excited', 'whispered', 'serious', 'shouting', 'empathetic', 'sarcastic'] } },
                required: ["speaker", "text"]
              }
            },
            estimatedDuration: { type: Type.NUMBER },
            emotionalBeat: { type: Type.STRING, enum: ['setup', 'confrontation', 'climax', 'resolution', 'transition'] },
            dominantEmotion: { type: Type.STRING, enum: ['tense', 'hopeful', 'melancholic', 'triumphant', 'mysterious', 'neutral'] },
            suggestedColorPalette: { type: Type.ARRAY, items: { type: Type.STRING } },
            paceRating: { type: Type.STRING, enum: ['slow_burn', 'moderate', 'intense'] },
          },
          required: ["description", "visualPrompt", "narratorLines", "estimatedDuration", "musicMood"]
        }
      },
      tasks: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { title: { type: Type.STRING }, description: { type: Type.STRING } } } },
      modules: { type: Type.OBJECT, properties: { logline: { type: Type.STRING }, concept: { type: Type.STRING }, styleBible: { type: Type.STRING } } },
      metadata: {
        type: Type.OBJECT,
        properties: { hookScore: { type: Type.NUMBER }, audience: { type: Type.STRING }, suggestedTitles: { type: Type.ARRAY, items: { type: Type.STRING } } }
      },
      lightingBrief: {
        type: Type.OBJECT,
        properties: {
          keyLightDirection: { type: Type.STRING, enum: ['left', 'right', 'front', 'top', 'rim'] },
          colorTemperature: { type: Type.STRING, enum: ['warm 3200K', 'neutral 5600K', 'cool 7500K', 'mixed'] },
          shadowIntensity: { type: Type.STRING, enum: ['soft', 'medium', 'hard'] },
          timeOfDay: { type: Type.STRING, enum: ['golden hour', 'midday', 'blue hour', 'night', 'interior'] },
          moodDescriptor: { type: Type.STRING }
        }
      }
    },
    required: ["characters", "scenes", "tasks", "modules", "metadata"]
  };

  const voiceOptions = VOICE_PRESETS.filter((v, i, arr) => arr.findIndex(x => x.apiVoiceName === v.apiVoiceName) === i)
    .map(v => `${v.id} (${v.gender} - ${v.label.split(' - ')[1]?.replace(')', '') || 'Standard'})`).join(', ');

  // OPT-09: Scale output ceiling to script complexity — short scripts don't need 32K tokens
  const wordCount = script.split(/\s+/).filter(Boolean).length;
  const sceneHints = (script.match(/\[Scene:/gi) || []).length;
  const estimatedScenes = sceneHints || Math.ceil(wordCount / 80);
  const dynamicMaxOutput = Math.min(32768, Math.max(6144, estimatedScenes * 900));

  const response = await retryWithBackoff<GenerateContentResponse>(() => withTimeout(ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Analyze script and extract a complete production manifest. Generate COMPLETE and VALID JSON only — no trailing commas, no comments, proper closing brackets.

Script: ${script}

For each character, suggest a voice from: ${voiceOptions}

For each scene also provide:
- emotionalBeat: narrative function (setup/confrontation/climax/resolution/transition)
- dominantEmotion: primary feeling (tense/hopeful/melancholic/triumphant/mysterious/neutral)
- suggestedColorPalette: 3 hex color codes matching the scene's emotional palette (e.g. ["#1a1a2e","#16213e","#0f3460"])
- paceRating: editing rhythm (slow_burn/moderate/intense)
- narratorLines: include an emotion field per line (neutral/excited/whispered/serious/shouting/empathetic/sarcastic)

Also provide:
- modules.styleBible: 2-3 sentences describing the visual language, lens style, and color philosophy
- lightingBrief: a global lighting setup for the production (keyLightDirection, colorTemperature, shadowIntensity, timeOfDay, moodDescriptor)

IMPORTANT: Ensure all arrays and objects are properly closed. Do not truncate the response.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: analysisSchema,
      seed,
      maxOutputTokens: dynamicMaxOutput,
      temperature: 0.1
    }
  }), 120000, 'Script analysis'));

  const rawText = response.text;
  if (!rawText || rawText.trim() === '') {
    throw new Error(
      'Gemini returned an empty response. This usually means the script triggered content filters or the API returned no data. ' +
      'Try reformatting your script with [Scene: ...] markers, reduce its length, or check for content policy issues.'
    );
  }

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

  // Repair-and-parse: iteratively fix unescaped double quotes using the parser's
  // own error position. This handles AI responses that contain dialogue like
  // He said "hello" to her  — which are valid English but invalid JSON strings.
  const parseWithRepair = (text: string): any => {
    // 1. JSON5 first — most permissive
    try {
      const r = JSON5.parse(text);
      console.log("[analyzeScript] Parsed with JSON5");
      return r;
    } catch {}

    // 2. Standard JSON with iterative position-guided repairs (up to 50 passes)
    let json = text;
    for (let i = 0; i < 50; i++) {
      try {
        const r = JSON.parse(json);
        console.log(`[analyzeScript] Parsed with JSON.parse after ${i} repair(s)`);
        return r;
      } catch (e: any) {
        const posMatch = (e.message || '').match(/position (\d+)/);
        if (!posMatch) break;
        const pos = parseInt(posMatch[1]);
        if (pos >= json.length) break;

        let fixPos: number;
        if (json[pos] === '"') {
          // Parser found a stray '"' directly at the error position
          fixPos = pos;
        } else {
          // Parser expected ',' or '}' but found a word — meaning a '"' BEFORE
          // pos closed the string too early. Search backwards for that quote.
          fixPos = pos - 1;
          while (fixPos >= 0 && json[fixPos] !== '"') fixPos--;
        }
        if (fixPos < 0) break;
        json = json.slice(0, fixPos) + '\\"' + json.slice(fixPos + 1);
      }
    }

    // 3. Final attempt with all repairs applied
    return JSON.parse(json);
  };

  try {
    data = parseWithRepair(cleaned);
  } catch (e2) {
    const error2 = (e2 as Error).message;
    console.error("[analyzeScript] Parse failed after repair attempts:", error2);
    console.error("[analyzeScript] Raw response length:", rawText.length);
    console.error("[analyzeScript] Cleaned response length:", cleaned.length);
    console.error("[analyzeScript] First 500 chars:", cleaned.substring(0, 500));
    console.error("[analyzeScript] Last 500 chars:", cleaned.substring(Math.max(0, cleaned.length - 500)));
    throw new Error(`Failed to parse AI response. Error: ${error2}. Response length: ${rawText.length} chars. Check console for details.`);
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

  // If both arrays are empty the AI found nothing useful — surface this as an error
  // rather than silently returning an empty project that gets stuck at 40%.
  if (data.characters.length === 0 && data.scenes.length === 0) {
    throw new Error(
      'Script analysis found no characters or scenes. ' +
      'Make sure your script includes named characters with dialogue and scene descriptions. ' +
      'Use [Scene: ...] markers for best results, e.g.:\n\n' +
      '[Scene: A dark alley at night]\nNarrator: The city never sleeps.'
    );
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
    scenes: data.scenes.map((s: any, i: number) => ({
      ...s,
      id: Date.now() + i,
      cameraMotion: 'random_cinematic',
      transition: 'fade',
      charactersInScene: Array.isArray(s.charactersInScene) ? s.charactersInScene : [],
      emotionalBeat: s.emotionalBeat || 'setup',
      dominantEmotion: s.dominantEmotion || 'neutral',
      suggestedColorPalette: Array.isArray(s.suggestedColorPalette) ? s.suggestedColorPalette : [],
      paceRating: s.paceRating || 'moderate',
    })),
    tasks: (data.tasks || []).map((t: any, i: number) => ({ ...t, id: `task_${i}`, status: 'pending' })),
    modules: data.modules,
    metadata: data.metadata,
    lightingBrief: data.lightingBrief || undefined,
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

// Shot-type-specific photographic direction injected into every image prompt
const SHOT_TYPE_PHOTO_DIRECTION: Record<string, string> = {
  ELS: 'Extreme wide anamorphic frame. Subject dwarfed by environment. Deep focus f/8. Horizon at upper third. Majestic scale.',
  LS:  'Wide establishing frame. Full body visible. Natural depth of field. 35mm f/5.6. Environment dominant.',
  MLS: 'Medium-long frame. Subject from knees up. 50mm f/4. Body language clearly readable. Balanced foreground/background.',
  MS:  'Mid-shot. Subject waist-up. 85mm f/2.8. Gentle background bokeh. Conversational framing.',
  MCU: 'Medium close-up. Chest-to-top-of-head. 85mm f/1.8. Shallow focus. Subtle skin texture. Eyes sharp.',
  CU:  'Close-up. Face fills 60% of frame. 50mm f/1.4. Shallow depth of field. Micro-expression visible. Eyes razor sharp.',
  ECU: 'Extreme close-up. Single facial feature or detail. Macro-like. Abstract background. Intense emotional detail.',
  OTS: 'Over-the-shoulder. Foreground subject soft. Background subject sharp. 50mm f/2.8. Conversational tension. Slight Dutch angle.',
  POV: 'First-person perspective. Slight handheld fisheye distortion. Ground plane visible at bottom. Immersive.',
  INSERT: 'Tight insert shot of specific object or detail. Macro depth of field. Isolated. Narrative significance.',
};

export const generateSceneImage = async (
  scene: Scene,
  characters: Character[],
  aspectRatio: AspectRatio,
  resolution: Resolution,
  feedback?: string,
  style: string = "Cinematic",
  seed?: number,
  styleReferenceBase64?: string,
  lightingBrief?: LightingBrief,
  previousSceneImageUrl?: string
): Promise<{ imageUrl: string; seedUsed: number }> => {
  const effectiveSeed = seed ?? Math.floor(Math.random() * 2147483647);

  // Check cache first (only if no feedback)
  if (!feedback) {
    const cached = await getCachedAsset(scene.visualPrompt, style, resolution, aspectRatio, effectiveSeed);
    if (cached) return { imageUrl: cached, seedUsed: effectiveSeed };
  }

  return retryWithBackoff(async () => {
    const ai = await getAIClient();
    const parts: any[] = [];

    // Style reference image — provides color grading and lighting baseline
    if (styleReferenceBase64) {
      parts.push({ inlineData: { mimeType: 'image/png', data: styleReferenceBase64.split(',')[1] } });
      parts.push({ text: 'MASTER STYLE REFERENCE: Match this exact color palette, lighting temperature, shadow density, and visual tone across all scenes.' });
    }

    // Continuity reference — last completed scene image for temporal consistency
    if (previousSceneImageUrl) {
      parts.push({ inlineData: { mimeType: 'image/png', data: previousSceneImageUrl.split(',')[1] } });
      parts.push({ text: 'CONTINUITY REFERENCE: The preceding scene in this production. Match the color grade, lighting style, and overall visual language. Ensure seamless narrative flow.' });
    }

    const sceneCharNames = scene.charactersInScene || [];
    const sceneChars = characters.filter(c => sceneCharNames.includes(c.name));

    // Approved canon reference images — hard constraint for likeness
    sceneChars.filter(c => c.referenceImageBase64 && c.referenceImageApproved).forEach(c => {
      parts.push({ inlineData: { mimeType: 'image/png', data: c.referenceImageBase64!.split(',')[1] } });
      parts.push({ text: `CANONICAL CHARACTER — ${c.name}: Reproduce this EXACT face, hair, skin tone, build, and attire with precise likeness. Do not alter any physical feature. ${buildCanonicalPrompt(c)}.` });
    });

    // Unapproved reference images — strong style guide
    sceneChars.filter(c => c.referenceImageBase64 && !c.referenceImageApproved).forEach(c => {
      parts.push({ inlineData: { mimeType: 'image/png', data: c.referenceImageBase64!.split(',')[1] } });
      parts.push({ text: `CHARACTER VISUAL GUIDE — ${c.name}: Use as appearance reference. ${buildCanonicalPrompt(c)}.` });
    });

    // Shot-type photographic direction — replaces generic [SHOT] prefix with full cinematographic spec
    const shotDirection = scene.shotType
      ? (SHOT_TYPE_PHOTO_DIRECTION[scene.shotType] || `[${scene.shotType} SHOT]`)
      : '';
    const lightingPrefix = lightingBrief
      ? `[LIGHTING: ${lightingBrief.keyLightDirection} key light, ${lightingBrief.colorTemperature} color temp, ${lightingBrief.shadowIntensity} shadows, ${lightingBrief.timeOfDay}, ${lightingBrief.moodDescriptor} mood] `
      : '';

    // Always inject character physical descriptions as text — the primary consistency mechanism
    const charDescriptions = sceneChars.map(c => {
      const canonical = buildCanonicalPrompt(c);
      return `${c.name}: ${canonical || c.visualPrompt}`;
    }).join(' | ');
    const charContext = charDescriptions
      ? `CHARACTERS PRESENT — ${charDescriptions}. Maintain these exact physical descriptions. `
      : '';

    const avoidance = 'Avoid: cartoon style, watercolor, illustration, sketch, drawing, anime, 3D render artifact, low resolution, blurry, overexposed, underexposed, flat lighting, symmetrical composition, logo, text, watermark, signature, visible AI artifacts, deformed hands, extra limbs, distorted face.';
    const emotionNote = scene.dominantEmotion ? `Emotional tone: ${scene.dominantEmotion}. ` : '';
    const paletteNote = scene.suggestedColorPalette?.length ? `Scene color palette: ${scene.suggestedColorPalette.join(', ')}. ` : '';
    parts.push({ text: `${shotDirection} ${lightingPrefix}${charContext}${emotionNote}${paletteNote}VISUAL STYLE: ${style}. SCENE: ${scene.visualPrompt}. ${feedback ? `DIRECTOR FEEDBACK: ${feedback}.` : ''} Ultra-detailed cinematic composition, 8K photorealistic rendering, sharp focus, volumetric lighting, professional color grading. Shot on ARRI Alexa with anamorphic lens. Consistent character appearances across all scenes. ${avoidance}` });

    const response = await withTimeout(ai.models.generateContent({
      model: MODEL_NAMES.IMAGE,
      contents: { parts },
      config: { imageConfig: { aspectRatio, imageSize: resolution === Resolution.FHD ? '2K' : '1K' }, seed: effectiveSeed }
    }), 120000, 'Image generation');
    const data = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
    if (!data) throw new Error('Scene image generation returned no data. The prompt may have been safety-filtered.');

    const imageUrl = `data:image/png;base64,${data}`;

    if (!feedback) {
      await cacheAsset(imageUrl, scene.visualPrompt, style, resolution, aspectRatio, effectiveSeed);
    }

    return { imageUrl, seedUsed: effectiveSeed };
  });
};

// Motion-specific cinematic descriptions injected into every Veo prompt
const MOTION_LIBRARY: Record<string, string> = {
  zoom_in:          'Slow push-in dolly. Camera glides steadily forward toward subject. Focal compression builds tension.',
  zoom_out:         'Reveal pull-back. Camera retreats smoothly, widening the frame to expose environment.',
  pan_left:         'Smooth lateral pan left at 8°/second. Horizon stays level. No tilt or shake.',
  pan_right:        'Smooth lateral pan right at 8°/second. Horizon stays level. No tilt or shake.',
  dolly_in:         'Rack-focus dolly push. Background defocuses as subject sharpens. Shallow depth of field.',
  dolly_out:        'Pedestal pull-back with gentle depth expansion. Subject recedes into environment.',
  static:           'Locked-off shot. Absolute camera stillness. Zero drift. Tripod-mounted precision.',
  random_cinematic: 'Subtle organic handheld drift. Micro-movement with gentle breathing rhythm. ARRI handheld style.',
};

export const generateSceneVideo = async (imageBase64: string, prompt: string, aspectRatio: AspectRatio, resolution: Resolution, style: string = "Cinematic", cameraMotion?: string): Promise<string> => {
  return retryWithBackoff(async () => {
    const ai = await getAIClient();
    const motionDesc = cameraMotion ? (MOTION_LIBRARY[cameraMotion] || 'Subtle cinematic camera movement.') : 'Subtle cinematic camera movement.';
    let operation: any = await withTimeout(ai.models.generateVideos({
      model: resolution === Resolution.FHD ? MODEL_NAMES.VIDEO : MODEL_NAMES.VIDEO_FAST,
      prompt: `${style}. ${prompt}. ${motionDesc} Maintain exact character appearance, facial features, and clothing from source image throughout all frames. Photorealistic motion, professional cinematography, no character warping or distortion.`,
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
      model: MODEL_NAMES.VIDEO,
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

// Emotional delivery directives for TTS — prepended to text to guide vocal performance
const EMOTION_TTS_DIRECTIVE: Record<string, string> = {
  excited:    'Read with excited, high-energy delivery: ',
  whispered:  'Read in a hushed, intimate whisper: ',
  serious:    'Read with grave, serious authority: ',
  shouting:   'Read with forceful, intense projection: ',
  empathetic: 'Read with warm, compassionate empathy: ',
  sarcastic:  'Read with dry, understated sarcasm: ',
  neutral:    '',
};

const SCENE_EMOTION_PREFIX: Record<string, string> = {
  tense:       'Emotional register: tense and urgent. ',
  hopeful:     'Emotional register: hopeful and warm. ',
  melancholic: 'Emotional register: melancholic and reflective. ',
  triumphant:  'Emotional register: triumphant and powerful. ',
  mysterious:  'Emotional register: mysterious and cryptic. ',
  neutral:     '',
};

export const generateSceneAudio = async (lines: DialogueLine[], characters: Character[], scene?: Scene): Promise<AudioGenerationResult> => {
  const ai = await getAIClient();
  const errorDetails: string[] = [];
  const parts: Uint8Array[] = [];
  let successCount = 0;
  let failureCount = 0;
  const sceneMoodPrefix = scene?.dominantEmotion ? (SCENE_EMOTION_PREFIX[scene.dominantEmotion] || '') : '';

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
          const conversationLines = batch.lines.map(l => {
            const dir = l.emotion ? (EMOTION_TTS_DIRECTIVE[l.emotion] || '') : '';
            return `${l.speaker}: ${dir}${l.text}`;
          }).join('\n');
          const prompt = `${sceneMoodPrefix}TTS the following conversation with natural emotional delivery:\n${conversationLines}`;
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
          const emotionDir = line.emotion ? (EMOTION_TTS_DIRECTIVE[line.emotion] || '') : '';
          const ttsPrefix = sceneMoodPrefix || emotionDir;
          const ttsText = ttsPrefix
            ? `${ttsPrefix}<speak><prosody rate="${char?.voiceSettings?.speed || 1}" pitch="${char?.voiceSettings?.pitch || 0}st">${line.text}</prosody></speak>`
            : `<speak><prosody rate="${char?.voiceSettings?.speed || 1}" pitch="${char?.voiceSettings?.pitch || 0}st">${line.text}</prosody></speak>`;
          const res = await retryWithBackoff(async () => {
            return await withTimeout(ai.models.generateContent({
              model: MODEL_NAMES.TTS,
              contents: [{ parts: [{ text: ttsText }] }],
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

// ─── Phase 4 New Functions ────────────────────────────────────────────────────

/**
 * Assembles a deterministic visual prompt from a character's identity data.
 * Priority: CharacterDNA (richest) → CharacterPhysical → visualPrompt fallback.
 * The DNA variant produces a locked 200-word "identity anchor" injected verbatim
 * into every generation call for maximum cross-scene consistency.
 */
export const buildCanonicalPrompt = (character: Character): string => {
  const dna = character.characterDNA;
  if (dna) {
    const colorStr = dna.colorSignature?.length
      ? `Signature palette: ${dna.colorSignature.join(', ')}.`
      : '';
    return [
      `IDENTITY LOCK — ${character.name}:`,
      `Face: ${dna.facialGeometry}.`,
      `Eyes: ${dna.eyeSignature}.`,
      `Hair: ${dna.hairSignature}.`,
      `Skin: ${dna.skinDescriptor}.`,
      `Build: ${dna.heightBuild}.`,
      `Distinctive marks: ${dna.distinctiveMarks}.`,
      `Clothing: ${dna.clothingCanon}.`,
      colorStr,
      `Physicality: ${dna.physicality}.`,
      'CRITICAL: Do not alter any of the above descriptors. Any deviation is a generation error.',
    ].filter(Boolean).join(' ');
  }

  const p = character.physical;
  if (!p) return character.visualPrompt || '';

  const parts: string[] = [
    character.name,
    `${p.age} year old ${p.build} build`,
    `${p.height} tall`,
    `${p.skinTone} skin`,
    `${p.hairColor} ${p.hairStyle} hair`,
    `${p.eyeColor} eyes`,
    p.facialFeatures,
    p.distinctiveMarks,
    `wearing ${p.typicalAttire}`,
    `color palette: ${p.colorPalette}`,
  ].filter(Boolean);

  return parts.join(', ');
};

/**
 * Synthesizes a locked CharacterDNA object from the character's existing description
 * and visual prompt. Called once on character creation/approval.
 */
export const synthesizeCharacterDNA = async (
  character: Character,
  style: string,
  seed?: number
): Promise<CharacterDNA> => {
  // OPT-11: Skip synthesis if DNA already locked — prevents accidental re-billing
  if (character.characterDNA) return character.characterDNA;
  const ai = await getAIClient();
  const schema = {
    type: Type.OBJECT,
    properties: {
      facialGeometry:   { type: Type.STRING },
      eyeSignature:     { type: Type.STRING },
      hairSignature:    { type: Type.STRING },
      skinDescriptor:   { type: Type.STRING },
      distinctiveMarks: { type: Type.STRING },
      clothingCanon:    { type: Type.STRING },
      heightBuild:      { type: Type.STRING },
      colorSignature:   { type: Type.ARRAY, items: { type: Type.STRING } },
      speechPattern:    { type: Type.STRING },
      emotionalRange:   { type: Type.ARRAY, items: { type: Type.STRING } },
      physicality:      { type: Type.STRING },
    },
    required: ['facialGeometry','eyeSignature','hairSignature','skinDescriptor',
               'distinctiveMarks','clothingCanon','heightBuild','colorSignature',
               'speechPattern','emotionalRange','physicality'],
  };

  const prompt = `You are a character identity specialist for a ${style} cinematic production.
Based on this character's description, synthesize a precise, measurable "identity lock" with exact physical descriptors that an image AI can replicate perfectly across 50+ scenes.

Character name: ${character.name}
Gender: ${character.gender}
Description: ${character.description}
Visual prompt: ${character.visualPrompt}

Rules:
- All descriptors must be SPECIFIC and MEASURABLE (e.g. "2cm scar above left eyebrow", not "has a scar")
- clothingCanon: describe their signature outfit in full material/color/cut detail
- colorSignature: extract 3-5 dominant hex color codes from the character's palette
- speechPattern: 1-sentence description of HOW they speak (rhythm, vocabulary, habits)
- emotionalRange: 3-5 words describing their emotional spectrum
- physicality: describe how they move, stand, and hold themselves
Output strict JSON only.`;

  const response = await withTimeout(ai.models.generateContent({
    model: MODEL_NAMES.THINKING,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: schema,
      thinkingConfig: { thinkingBudget: 2000 },
      seed,
    },
  }), 90000, 'Character DNA synthesis');

  const data = JSON.parse(cleanJsonResponse(response.text || '{}'));
  return data as CharacterDNA;
};

/**
 * Enriches a raw visual prompt to cinematic quality using the AI model.
 * Adds lens choice, depth of field, lighting setup, color palette.
 * Max ~200 words output.
 */
// OPT-08: In-memory cache to avoid re-enriching identical prompt+style combinations
const enrichedPromptCache = new Map<string, string>();

export const enrichVisualPrompt = async (
  rawPrompt: string,
  style: string,
  shotType?: ShotType,
  lightingBrief?: LightingBrief,
  characters?: Character[]
): Promise<string> => {
  // OPT-08: Return cached result for same prompt context
  const charNames = (characters || []).map(c => c.name).sort().join(',');
  const cacheKey = [
    rawPrompt.substring(0, 120),
    style,
    shotType || '',
    lightingBrief?.moodDescriptor || '',
    charNames,
  ].join('|');
  if (enrichedPromptCache.has(cacheKey)) return enrichedPromptCache.get(cacheKey)!;

  try {
    const ai = await getAIClient();
    const charContext = (characters || [])
      .map(c => `${c.name}: ${buildCanonicalPrompt(c)}`)
      .join('; ');

    const prompt = `You are a cinematography prompt engineer. Expand this raw scene prompt into a high-quality AI image generation prompt under 200 words.

Raw prompt: ${rawPrompt}
Visual style: ${style}
Shot type: ${shotType || 'not specified'}
Lighting: ${lightingBrief ? `${lightingBrief.keyLightDirection} key light, ${lightingBrief.colorTemperature}, ${lightingBrief.shadowIntensity} shadows, ${lightingBrief.timeOfDay}, mood: ${lightingBrief.moodDescriptor}` : 'not specified'}
Characters present: ${charContext || 'none'}

Add: specific lens (e.g. 35mm f/1.8), depth of field details, precise lighting description, color palette, cinematic quality markers. Output ONLY the expanded prompt, no preamble.`;

    const res = await withTimeout(ai.models.generateContent({
      model: MODEL_NAMES.CHECK,
      contents: prompt,
    }), 30000, 'Prompt enrichment');

    const enriched = res.text?.trim() || rawPrompt;
    enrichedPromptCache.set(cacheKey, enriched);
    return enriched;
  } catch {
    return rawPrompt;
  }
};

/**
 * Generates 4 canonical reference images for a character:
 * front, three-quarter, profile, expression.
 */
export const generateCharacterReferenceSheet = async (
  character: Character,
  style: string
): Promise<{ front: string; threeQuarter: string; profile: string; expression: string }> => {
  return retryWithBackoff(async () => {
    const ai = await getAIClient();
    const basePrompt = buildCanonicalPrompt(character);

    const angles = [
      { key: 'front', desc: 'front-facing portrait, neutral expression, studio lighting' },
      { key: 'threeQuarter', desc: 'three-quarter view, slight smile, dramatic lighting' },
      { key: 'profile', desc: 'side profile, neutral expression, rim lighting' },
      { key: 'expression', desc: 'front-facing, strong emotional expression, cinematic lighting' },
    ] as const;

    const results = await Promise.all(
      angles.map(async ({ key, desc }) => {
        const res = await withTimeout(ai.models.generateContent({
          model: MODEL_NAMES.IMAGE,
          contents: `${style} character reference sheet — ${desc}. ${basePrompt}. Professional studio background, high fidelity.`,
          config: { imageConfig: { aspectRatio: '1:1' }, seed: character.canonicalSeed }
        }), 120000, `Reference sheet ${key}`);
        const data = res.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
        if (!data) throw new Error(`Reference sheet: no data for ${key}`);
        return { key, imageUrl: `data:image/png;base64,${data}` };
      })
    );

    return {
      front: results.find(r => r.key === 'front')!.imageUrl,
      threeQuarter: results.find(r => r.key === 'threeQuarter')!.imageUrl,
      profile: results.find(r => r.key === 'profile')!.imageUrl,
      expression: results.find(r => r.key === 'expression')!.imageUrl,
    };
  });
};

export interface ConsistencyAuditResult {
  sceneId: number;
  score: number;
  issues: string[];
  suggestions: string[];
}

/**
 * Audits character visual consistency across scene images using AI vision.
 * Returns per-scene consistency scores (0-100) and issue descriptions.
 */
export const auditCharacterConsistency = async (
  character: Character,
  sceneImages: Array<{ sceneId: number; imageBase64: string }>
): Promise<ConsistencyAuditResult[]> => {
  return retryWithBackoff(async () => {
    const ai = await getAIClient();

    if (!character.referenceImageBase64) {
      return sceneImages.map(s => ({
        sceneId: s.sceneId,
        score: 50,
        issues: ['No reference image available for comparison'],
        suggestions: ['Generate and approve a canonical reference image for this character']
      }));
    }

    const schema = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          sceneId: { type: Type.NUMBER },
          score: { type: Type.NUMBER },
          issues: { type: Type.ARRAY, items: { type: Type.STRING } },
          suggestions: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ['sceneId', 'score', 'issues', 'suggestions']
      }
    };

    // Build the multimodal request parts
    const parts: any[] = [
      { text: `You are a character consistency auditor for a cinematic video production. Compare the character reference image against the following scene images and score consistency 0-100 for each scene.` },
      { inlineData: { mimeType: 'image/png', data: character.referenceImageBase64.split(',')[1] } },
      { text: `This is the CANONICAL REFERENCE for character "${character.name}" (${character.gender}). Profile: ${buildCanonicalPrompt(character)}. Score each scene image below.` },
    ];

    const batch = sceneImages.slice(0, 10); // Max 10 scene images per call
    batch.forEach((s, i) => {
      parts.push({ inlineData: { mimeType: 'image/png', data: s.imageBase64.split(',')[1] } });
      parts.push({ text: `Scene ${i + 1} (ID: ${s.sceneId}): Rate consistency vs reference.` });
    });

    parts.push({
      text: `Return JSON array with one entry per scene: sceneId (use the ID shown above), score (0-100), issues (list of specific inconsistencies: face, hair, clothing, distinctive marks), suggestions (how to fix each issue). Be precise and actionable.`
    });

    const response = await withTimeout(ai.models.generateContent({
      model: MODEL_NAMES.CHECK,
      contents: { parts },
      config: { responseMimeType: 'application/json', responseSchema: schema }
    }), 120000, 'Consistency audit');

    return JSON.parse(cleanJsonResponse(response.text || '[]'));
  });
};

/**
 * Analyzes all scenes and assigns optimal ShotType values following 3-act variety rules.
 */
export const assignShotList = async (scenes: Scene[], script: string): Promise<Scene[]> => {
  return retryWithBackoff(async () => {
    const ai = await getAIClient();

    const schema = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.NUMBER },
          shotType: { type: Type.STRING, enum: ['ELS', 'LS', 'MLS', 'MS', 'MCU', 'CU', 'ECU', 'OTS', 'POV', 'INSERT'] }
        },
        required: ['id', 'shotType']
      }
    };

    const prompt = `You are a professional cinematographer assigning shot types to a ${scenes.length}-scene video production.

Script excerpt: ${script.substring(0, 1500)}

Scenes:
${scenes.map(s => `ID ${s.id}: ${s.description}`).join('\n')}

Assign a ShotType to each scene following 3-act structure variety rules:
- Act 1: Establish with ELS/LS, use MS for character introductions
- Act 2: Mix MCU/CU for emotional beats, OTS for confrontations, MS for action
- Act 3: Build intensity with CU/ECU for climax, POV for immersion, INSERT for detail reveals

Avoid repeating the same shot type more than 3 times consecutively. Return JSON array with id and shotType for each scene.`;

    const response = await withTimeout(ai.models.generateContent({
      model: MODEL_NAMES.CHECK,
      contents: prompt,
      config: { responseMimeType: 'application/json', responseSchema: schema }
    }), 30000, 'Shot list assignment');

    const assignments: Array<{ id: number; shotType: ShotType }> = JSON.parse(cleanJsonResponse(response.text || '[]'));

    return scenes.map(scene => {
      const assignment = assignments.find(a => a.id === scene.id);
      return assignment ? { ...scene, shotType: assignment.shotType } : scene;
    });
  });
};

/**
 * Reformats a raw, unstructured script into the proper [Scene: X] / [SPEAKER]: dialogue format.
 */
export const reformatScript = async (rawScript: string, globalStyle: string, seed: number): Promise<string> => {
  const ai = await getAIClient();

  const prompt = `You are a script formatter for a ${globalStyle} cinematic production.
Reformat the following raw text into the proper script format:
- Each scene begins with [Scene: Brief Scene Title]
- Character dialogue is formatted as: [SPEAKER_NAME]: dialogue line
- Narrator/voiceover lines start with: [NARRATOR]: narration text
- Keep all original story content, characters, and dialogue intact
- Number scenes sequentially starting from 1

Raw script:
${rawScript}

Output ONLY the reformatted script. No preamble, no commentary.`;

  const response = await withTimeout(ai.models.generateContent({
    model: MODEL_NAMES.CHECK,
    contents: prompt,
    config: { seed }
  }), 60000, 'Script reformat');

  return response.text?.trim() || rawScript;
};

/**
 * Optimizes a character's visual prompt for better image generation consistency.
 * Wraps enrichVisualPrompt with the character's full identity context.
 */
export const optimizeCharacterVisualPrompt = async (
  character: Character,
  globalStyle: string,
  _seed: number
): Promise<string> => {
  return enrichVisualPrompt(
    character.visualPrompt || character.description || character.name,
    globalStyle,
    undefined,
    undefined,
    [character]
  );
};

/**
 * Analyzes the script and style to generate a cinematic LightingBrief.
 */
export const generateLightingBrief = async (script: string, globalStyle: string, seed: number): Promise<LightingBrief> => {
  const ai = await getAIClient();

  const schema = {
    type: Type.OBJECT,
    properties: {
      keyLightDirection: { type: Type.STRING },
      colorTemperature:  { type: Type.STRING },
      shadowIntensity:   { type: Type.STRING },
      timeOfDay:         { type: Type.STRING },
      moodDescriptor:    { type: Type.STRING },
    },
    required: ['keyLightDirection', 'colorTemperature', 'shadowIntensity', 'timeOfDay', 'moodDescriptor'],
  };

  const prompt = `You are a cinematography lighting director for a ${globalStyle} production.
Analyze the following script excerpt and generate a cinematic lighting brief that establishes visual mood and consistency across all scenes.

Script excerpt:
${script.substring(0, 2000)}

Return:
- keyLightDirection: e.g. "45° front-left key", "top-down overhead", "side-lit from right"
- colorTemperature: e.g. "warm 3200K tungsten", "cool 5600K daylight", "mixed warm/cool contrast"
- shadowIntensity: e.g. "hard noir shadows", "soft fill-light", "medium contrast"
- timeOfDay: e.g. "golden hour dusk", "harsh midday", "blue-hour twilight", "night interior"
- moodDescriptor: e.g. "neo-noir cinematic", "warm intimate", "cold dystopian", "dreamlike diffused"`;

  const response = await withTimeout(ai.models.generateContent({
    model: MODEL_NAMES.CHECK,
    contents: prompt,
    config: { responseMimeType: 'application/json', responseSchema: schema as any, seed }
  }), 30000, 'Lighting brief');

  return JSON.parse(cleanJsonResponse(response.text || '{}')) as LightingBrief;
};
