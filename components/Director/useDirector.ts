import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { ProductionPhase, ProjectState } from "../../types";
import { handleDirectorChat } from "../../services/gemini";
import { getPhaseChecklist, WorkflowStep } from "../../services/workflowOrchestrator";

export interface ActionButton {
  label: string;
  action: string;
  variant: 'primary' | 'secondary' | 'skip';
}

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  isError?: boolean;
  actionButtons?: ActionButton[];
  stepId?: string;
}

interface UseDirectorProps {
  currentPhase: ProductionPhase;
  project: ProjectState;
  onExecuteTool: (name: string, args: any) => Promise<any>;
  onGenerateCharacters?: () => Promise<void>;
  onGenerateScenes?: () => Promise<void>;
}

// Steps that must execute BEFORE character image generation in the Manifest phase.
// Running these first produces better images (cinematic prompts + lighting consistency).
const MANIFEST_PRE_IMAGE_STEP_IDS = new Set(['optimize_character_prompts', 'apply_lighting_brief']);

// Build ordered workflow steps for the current phase, including virtual steps
function buildWorkflowSteps(phase: ProductionPhase, project: ProjectState): WorkflowStep[] {
  const checklist = getPhaseChecklist(phase, project);
  const steps: WorkflowStep[] = [...checklist.requiredSteps];

  if (phase === 'manifest') {
    // 1. Pre-image steps (optimize prompts + lighting first — images will be better)
    const preImageSteps = checklist.optionalSteps.filter(s => MANIFEST_PRE_IMAGE_STEP_IDS.has(s.id));
    steps.push(...preImageSteps);

    // 2. Character image generation (virtual step — not in workflowOrchestrator)
    const hasAllImages =
      project.characters.length > 0 &&
      project.characters.every(c => c.referenceImageBase64);
    steps.push({
      id: 'generate_character_images',
      label: 'Character Images',
      description: 'Generate AI reference images for all characters',
      status: hasAllImages ? 'completed' : 'pending',
      autoExecutable: true,
      priority: 'critical',
    });

    // 3. Post-image steps (continuity audit needs images to be meaningful)
    const postImageSteps = checklist.optionalSteps.filter(s => !MANIFEST_PRE_IMAGE_STEP_IDS.has(s.id));
    steps.push(...postImageSteps);
  } else {
    steps.push(...checklist.optionalSteps);
  }

  return steps;
}

// Build a step-presentation message with inline action buttons
function buildStepMessage(step: WorkflowStep, phase: ProductionPhase): Message {
  type StepCopy = { content: string; buttons: ActionButton[] };

  const STEP_COPY: Record<string, StepCopy> = {
    write_script: {
      content: "No script detected yet. Write one in the Editor tab or use the AI Scriptwriter to generate one from a concept.",
      buttons: [],
    },
    analyze_script: {
      content: "Script is ready. Click **Initialize Pipeline** in the Creative Terminal to extract scenes and characters — required before moving forward.",
      buttons: [],
    },
    run_script_doctor: {
      content: "Optional: The Script Doctor analyzes your script for pacing issues, weak hooks, and narrative gaps. Skip if your script is already how you want it.",
      buttons: [
        { label: 'Run Script Doctor', action: 'run_script_doctor', variant: 'primary' },
        { label: 'Skip', action: 'skip_step', variant: 'skip' },
      ],
    },
    set_style: {
      content: "Optional: Setting a global visual style (e.g. 'Cinematic', 'Anime', 'Dark Fantasy') keeps all scenes visually consistent. You can skip this and the AI will adapt to your script's tone.",
      buttons: [
        { label: 'Skip', action: 'skip_step', variant: 'skip' },
      ],
    },
    assign_voices: {
      content: `Voice casting — I'll auto-assign the best matching voice to each character based on their personality and gender. You can swap any voice afterward in the Cast section.`,
      buttons: [
        { label: 'Auto-Assign Voices', action: 'assign_voices', variant: 'primary' },
        { label: 'Skip', action: 'skip_step', variant: 'skip' },
      ],
    },
    generate_character_images: {
      content: "Now let's generate reference images for each character. I'll create a portrait for all of them — you can review and regenerate any that don't look right.",
      buttons: [
        { label: 'Generate Character Images', action: 'generate_characters', variant: 'primary' },
        { label: 'Skip', action: 'skip_step', variant: 'skip' },
      ],
    },
    optimize_character_prompts: {
      content: "Recommended: I'll upgrade every character's visual prompt to be cinematically precise. This directly improves how consistently each character looks across all generated scenes.",
      buttons: [
        { label: 'Optimize All Prompts', action: 'optimize_character_prompts', variant: 'primary' },
        { label: 'Skip', action: 'skip_step', variant: 'skip' },
      ],
    },
    apply_lighting_brief: {
      content: "Recommended: A lighting brief locks in the mood, time-of-day, and light quality for your entire production — every scene will share a coherent visual atmosphere.",
      buttons: [
        { label: 'Generate Lighting Brief', action: 'apply_lighting_brief', variant: 'primary' },
        { label: 'Skip', action: 'skip_step', variant: 'skip' },
      ],
    },
    run_continuity_audit: {
      content: "Optional: The Continuity Auditor checks that character descriptions and scene references are consistent throughout. Recommended if you have multiple characters.",
      buttons: [
        { label: 'Run Audit', action: 'run_continuity_audit', variant: 'secondary' },
        { label: 'Skip', action: 'skip_step', variant: 'skip' },
      ],
    },
    add_character_references: {
      content: "Optional: You can upload real reference photos for characters to improve visual consistency across scenes.",
      buttons: [
        { label: 'Skip', action: 'skip_step', variant: 'skip' },
      ],
    },
    review_timeline: {
      content: "Optional: Review scene pacing in the Production Timeline to check timing and transitions.",
      buttons: [
        { label: 'Skip', action: 'skip_step', variant: 'skip' },
      ],
    },
    adjust_scene_descriptions: {
      content: "Optional: Fine-tune individual scene descriptions and image prompts using the Scene Inspector.",
      buttons: [
        { label: 'Skip', action: 'skip_step', variant: 'skip' },
      ],
    },
    generate_assets: {
      content: "Time to generate all scene assets — images, audio, and video for every scene. I'll run this as a batch process and monitor for failures.",
      buttons: [
        { label: 'Start Batch Generation', action: 'generate_scenes', variant: 'primary' },
      ],
    },
    set_key_art: {
      content: "Optional: Select a scene as the Key Art reference — it sets the visual benchmark for cross-scene consistency.",
      buttons: [
        { label: 'Skip', action: 'skip_step', variant: 'skip' },
      ],
    },
    review_failed_assets: {
      content: "Optional: Check the Synthesis tab for any failed scenes and retry them.",
      buttons: [
        { label: 'Skip', action: 'skip_step', variant: 'skip' },
      ],
    },
    add_broll: {
      content: "Optional: B-Roll scenes add visual variety. I can analyze your script and suggest 2–3 B-Roll inserts.",
      buttons: [
        { label: 'Suggest B-Roll', action: 'suggest_broll', variant: 'secondary' },
        { label: 'Skip', action: 'skip_step', variant: 'skip' },
      ],
    },
    adjust_audio_mixing: {
      content: "Optional: Fine-tune audio levels per scene in the Audio Mixer.",
      buttons: [
        { label: 'Skip', action: 'skip_step', variant: 'skip' },
      ],
    },
    run_video_consistency_audit: {
      content: "Recommended: Now that scenes are generated, I'll scan all of them for character visual drift — any scenes where a character looks inconsistent will be flagged for regeneration.",
      buttons: [
        { label: 'Run Consistency Check', action: 'run_video_consistency_audit', variant: 'secondary' },
        { label: 'Skip', action: 'skip_step', variant: 'skip' },
      ],
    },
    run_viral_analysis: {
      content: "Optional: Viral analysis scores your hook strength, pacing, and emotional peaks — and suggests changes to maximize engagement.",
      buttons: [
        { label: 'Analyze Virality', action: 'run_viral_analysis', variant: 'secondary' },
        { label: 'Skip', action: 'skip_step', variant: 'skip' },
      ],
    },
    generate_seo_metadata: {
      content: "Optional: I can generate optimized YouTube metadata — title options, description, and tags — based on your content.",
      buttons: [
        { label: 'Generate SEO', action: 'run_seo', variant: 'secondary' },
        { label: 'Skip', action: 'skip_step', variant: 'skip' },
      ],
    },
    apply_vfx_mastering: {
      content: "Optional: VFX Mastering adds film grain, bloom, vignette, and color grading for a cinematic finish.",
      buttons: [
        { label: 'Open VFX Mastering', action: 'open_vfx', variant: 'secondary' },
        { label: 'Skip', action: 'skip_step', variant: 'skip' },
      ],
    },
    generate_thumbnail: {
      content: "Optional: Open the Thumbnail Studio to generate a custom thumbnail for your video.",
      buttons: [
        { label: 'Open Thumbnail Studio', action: 'open_thumbnail_studio', variant: 'secondary' },
        { label: 'Skip', action: 'skip_step', variant: 'skip' },
      ],
    },
    generate_social_posts: {
      content: "Optional: Open the Content Multiplier to generate social media posts for your video.",
      buttons: [
        { label: 'Open Content Multiplier', action: 'open_social_posts', variant: 'secondary' },
        { label: 'Skip', action: 'skip_step', variant: 'skip' },
      ],
    },
  };

  const copy = STEP_COPY[step.id] ?? {
    content: `Next: **${step.label}** — ${step.description}`,
    buttons: step.priority !== 'critical'
      ? [{ label: 'Skip', action: 'skip_step', variant: 'skip' as const }]
      : [],
  };

  return {
    role: 'assistant',
    content: copy.content,
    actionButtons: copy.buttons.length > 0 ? copy.buttons : undefined,
    stepId: step.id,
  };
}

export function useDirector({
  currentPhase,
  project,
  onExecuteTool,
  onGenerateCharacters,
  onGenerateScenes,
}: UseDirectorProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [currentStepId, setCurrentStepId] = useState<string | null>(null);

  // Refs to avoid stale closures in async callbacks
  const messagesRef = useRef<Message[]>(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Guard against concurrent greeting calls (React Strict Mode runs effects twice)
  const greetingInitiatedRef = useRef(false);

  // Sets to track session-level completion/skip (use refs to avoid stale closures in handleAction)
  const completedRef = useRef<Set<string>>(new Set());
  const skippedRef = useRef<Set<string>>(new Set());

  // Latest workflow steps — kept in a ref so callbacks always see current list
  const workflowSteps = useMemo(
    () => buildWorkflowSteps(currentPhase, project),
    // Re-compute whenever any signal that affects step status changes.
    // Must be exhaustive: each new auto-detected step needs its own dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      currentPhase,
      project.characters.length,
      project.scenes.length,
      // Voice assignment — assign_voices step auto-detects from all chars having voiceId
      project.characters.filter(c => c.voiceId).length,
      // Reference images — generate_character_images step auto-detects from all chars having images
      project.characters.filter(c => c.referenceImageBase64).length,
      // Character DNA — tracked for downstream step awareness
      project.characters.filter(c => c.characterDNA).length,
      // Asset generation — generate_assets step auto-detects from all scenes complete
      Object.values(project.assets).filter(a => a?.status === 'complete').length,
      // Workflow progress — persisted completions/skips (run_continuity_audit, etc.)
      project.workflowProgress,
      // Lighting brief — apply_lighting_brief step auto-detects from presence
      !!project.lightingBrief,
      // Key art — set_key_art step auto-detects
      project.keyArtSceneId,
      // Viral data — run_viral_analysis step auto-detects
      !!project.viralData,
      // YouTube metadata — generate_seo_metadata step auto-detects
      !!project.youtubeMetadata,
    ]
  );
  const workflowStepsRef = useRef(workflowSteps);
  useEffect(() => { workflowStepsRef.current = workflowSteps; }, [workflowSteps]);

  // Find and present the next actionable step that hasn't been done or skipped
  const presentNextStep = useCallback(() => {
    const next = workflowStepsRef.current.find(step => {
      if (step.status === 'completed') return false;
      if (completedRef.current.has(step.id)) return false;
      if (skippedRef.current.has(step.id)) return false;
      return true;
    });

    if (next) {
      setCurrentStepId(next.id);
      setMessages(prev => [...prev, buildStepMessage(next, currentPhase)]);
    } else {
      setCurrentStepId(null);
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `All steps for this phase are complete. You're ready to move forward — or ask me anything about the project.`,
          actionButtons: [{ label: "What's next?", action: 'next_phase', variant: 'primary' }],
        },
      ]);
    }
  }, [currentPhase]);

  const sendMessage = useCallback(async (userText: string) => {
    if (!userText.trim()) return;
    setMessages(prev => [...prev, { role: "user", content: userText }]);
    setIsTyping(true);

    try {
      const chatHistory = messagesRef.current
        .filter(m => m.role !== "system")
        .map(m => ({
          role: (m.role === "assistant" ? "model" : "user") as "user" | "model",
          content: m.content,
        }));
      const response = await handleDirectorChat(userText, project, chatHistory);

      // Execute any function calls the model returned — isolate tool errors so they
      // don't propagate to the outer catch and masquerade as connection failures.
      if (response.functionCalls) {
        for (const fc of response.functionCalls) {
          if (fc.name) {
            try {
              await onExecuteTool(fc.name, fc.args);
            } catch (toolErr: any) {
              console.error(`[Director] Tool execution failed for "${fc.name}":`, toolErr);
              // Surface the tool error as a non-fatal assistant message so the
              // user knows something failed without killing the entire response.
              setMessages(prev => [
                ...prev,
                {
                  role: 'assistant',
                  content: `Action "${fc.name}" failed: ${toolErr?.message?.substring(0, 120) || 'Unknown error'}. You can continue — other actions are unaffected.`,
                  isError: true,
                },
              ]);
            }
          }
        }
      }

      if (response.text) {
        setMessages(prev => [...prev, { role: "assistant", content: response.text! }]);
      } else if (!response.functionCalls?.length) {
        setMessages(prev => [...prev, { role: "assistant", content: "Command executed." }]);
      }
    } catch (err: any) {
      const msg = String(err?.message || err);
      console.error('[Director] Chat API error:', err);

      // Give the user actionable feedback based on the error category
      const isAuth = msg.includes('403') || msg.toLowerCase().includes('api key') || msg.toLowerCase().includes('authentication') || msg.toLowerCase().includes('unauthorized');
      const isQuota = msg.includes('429') || msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('resource_exhausted');
      const isTimeout = msg.toLowerCase().includes('timed out');
      const isNetwork = msg.toLowerCase().includes('failed to fetch') || msg.toLowerCase().includes('network') || msg.toLowerCase().includes('econnreset');

      const userMessage = isAuth
        ? 'Director offline — API key not found or unauthorized. Set GEMINI_API_KEY in your environment.'
        : isQuota
        ? 'Director is rate-limited. Wait 30 seconds, then try again.'
        : isTimeout
        ? 'Director timed out — the model is under load. Try a shorter message or wait a moment.'
        : isNetwork
        ? 'Director signal lost — network error. Check your connection and retry.'
        : `Director signal lost: ${msg.substring(0, 120)}`;

      setMessages(prev => [
        ...prev,
        { role: "assistant", content: userMessage, isError: true },
      ]);
    } finally {
      setIsTyping(false);
    }
  }, [currentPhase, project, onExecuteTool]);

  const handleAction = useCallback(async (action: string, stepId?: string) => {
    // Use the stepId from the button if provided, otherwise fall back to currentStepId
    const effectiveStepId = stepId ?? currentStepId ?? undefined;

    const markDone = (id: string) => {
      completedRef.current.add(id);
      setCurrentStepId(null);
    };

    switch (action) {
      case 'assign_voices': {
        setIsTyping(true);
        try {
          const history = messagesRef.current
            .filter(m => m.role !== 'system')
            .map(m => ({
              role: (m.role === 'assistant' ? 'model' : 'user') as 'user' | 'model',
              content: m.content,
            }));
          const response = await handleDirectorChat(
            'AUTO-EXECUTE VOICE CASTING: For EVERY character in the project, analyze their name, gender, and personality, then call update_character with the best matching voiceId. Call update_character for each character individually. After all calls, summarize your casting decisions briefly.',
            project,
            history
          );
          if (response.functionCalls) {
            for (const fc of response.functionCalls) {
              if (fc.name) await onExecuteTool(fc.name, fc.args);
            }
          }
          setMessages(prev => [
            ...prev,
            { role: 'assistant', content: response.text || 'Voice casting complete.' },
          ]);
          if (effectiveStepId) markDone(effectiveStepId);
          setTimeout(() => presentNextStep(), 400);
        } catch {
          setMessages(prev => [
            ...prev,
            { role: 'assistant', content: 'Voice casting failed. Try again or assign voices manually in the Cast section.', isError: true },
          ]);
        } finally {
          setIsTyping(false);
        }
        break;
      }

      case 'generate_characters': {
        setMessages(prev => [...prev, { role: 'system', content: 'Generating character reference images...' }]);
        try {
          await onGenerateCharacters?.();
          setMessages(prev => [
            ...prev,
            {
              role: 'assistant',
              content: 'Character images generated. Review them in the Cast section — click Regenerate on any that need a redo.',
              actionButtons: [{ label: 'Continue', action: 'advance', variant: 'primary' }],
              stepId: effectiveStepId,
            },
          ]);
          if (effectiveStepId) markDone(effectiveStepId);
        } catch {
          setMessages(prev => [
            ...prev,
            { role: 'assistant', content: 'Some images failed. Check the Cast section to retry individually.', isError: true },
          ]);
        }
        break;
      }

      case 'generate_scenes': {
        setMessages(prev => [...prev, { role: 'system', content: 'Starting batch scene generation...' }]);
        try {
          await onGenerateScenes?.();
          if (effectiveStepId) markDone(effectiveStepId);
          setTimeout(() => presentNextStep(), 400);
        } catch {
          setMessages(prev => [
            ...prev,
            { role: 'assistant', content: 'Batch generation encountered errors. Check the Synthesis tab for details.', isError: true },
          ]);
        }
        break;
      }

      case 'run_script_doctor': {
        await onExecuteTool('suggest_optimization_tool', { toolId: 'script-doctor', autoOpen: true });
        setMessages(prev => [...prev, { role: 'system', content: 'Script Doctor opened.' }]);
        if (effectiveStepId) markDone(effectiveStepId);
        setTimeout(() => presentNextStep(), 400);
        break;
      }

      case 'optimize_character_prompts': {
        setMessages(prev => [...prev, { role: 'system', content: 'Upgrading character visual prompts...' }]);
        try {
          // Optimize each character's visual prompt sequentially
          for (const char of project.characters) {
            await onExecuteTool('optimize_character_prompt', { character_name: char.name });
          }
          setMessages(prev => [
            ...prev,
            {
              role: 'assistant',
              content: `All character prompts upgraded to cinematic grade. Your cast's visual DNA is locked and ready for synthesis.`,
              actionButtons: [{ label: 'Continue', action: 'advance', variant: 'primary' }],
              stepId: effectiveStepId,
            },
          ]);
          if (effectiveStepId) markDone(effectiveStepId);
        } catch {
          setMessages(prev => [
            ...prev,
            { role: 'assistant', content: 'Prompt optimization failed — you can continue, but scene-to-scene character consistency may vary.', isError: true },
          ]);
        }
        break;
      }

      case 'apply_lighting_brief': {
        setMessages(prev => [...prev, { role: 'system', content: 'Generating cinematic lighting brief...' }]);
        try {
          await onExecuteTool('apply_lighting_brief', {});
          setMessages(prev => [
            ...prev,
            {
              role: 'assistant',
              content: `Lighting brief applied. Every scene now shares consistent mood, time-of-day, and light quality.`,
              actionButtons: [{ label: 'Continue', action: 'advance', variant: 'primary' }],
              stepId: effectiveStepId,
            },
          ]);
          if (effectiveStepId) markDone(effectiveStepId);
          setTimeout(() => presentNextStep(), 400);
        } catch {
          setMessages(prev => [
            ...prev,
            { role: 'assistant', content: 'Lighting brief failed — you can continue without it.', isError: true },
          ]);
        }
        break;
      }

      case 'run_video_consistency_audit': {
        setMessages(prev => [...prev, { role: 'system', content: 'Running post-synthesis consistency scan...' }]);
        try {
          const report = await onExecuteTool('run_video_consistency_audit', { mark_for_regeneration: false });
          setMessages(prev => [
            ...prev,
            {
              role: 'assistant',
              content: typeof report === 'string' ? report : 'Consistency scan complete.',
              actionButtons: [{ label: 'Continue', action: 'advance', variant: 'primary' }],
              stepId: effectiveStepId,
            },
          ]);
          if (effectiveStepId) markDone(effectiveStepId);
          setTimeout(() => presentNextStep(), 400);
        } catch {
          setMessages(prev => [
            ...prev,
            { role: 'assistant', content: 'Consistency audit failed — you can proceed to Post phase.', isError: true },
          ]);
        }
        break;
      }

      case 'run_continuity_audit': {
        // Open the Continuity Auditor (character-level, pre-synthesis) — NOT the Consistency Dashboard
        await onExecuteTool('suggest_optimization_tool', {
          toolId: 'continuity-auditor',
          reason: 'Audit character visual descriptions against scene prompts for continuity',
          autoOpen: true,
        });
        setMessages(prev => [...prev, { role: 'system', content: 'Continuity Firewall opened.' }]);
        if (effectiveStepId) markDone(effectiveStepId);
        setTimeout(() => presentNextStep(), 400);
        break;
      }

      case 'suggest_broll': {
        await onExecuteTool('suggest_b_roll', {});
        if (effectiveStepId) markDone(effectiveStepId);
        setTimeout(() => presentNextStep(), 400);
        break;
      }

      case 'run_viral_analysis': {
        // Run the actual analysis and navigate to Post phase
        await onExecuteTool('run_viral_analysis', {});
        if (effectiveStepId) markDone(effectiveStepId);
        setTimeout(() => presentNextStep(), 400);
        break;
      }

      case 'run_seo': {
        // Navigate to Post phase where YouTubeOptimizer SEO tab is available
        await onExecuteTool('suggest_optimization_tool', { toolId: 'youtube-optimizer', autoOpen: true });
        if (effectiveStepId) markDone(effectiveStepId);
        setTimeout(() => presentNextStep(), 400);
        break;
      }

      case 'open_vfx': {
        await onExecuteTool('suggest_optimization_tool', { toolId: 'vfx-master', autoOpen: true });
        if (effectiveStepId) markDone(effectiveStepId);
        setTimeout(() => presentNextStep(), 400);
        break;
      }

      case 'open_thumbnail_studio': {
        // Navigate to Post phase — YouTubeOptimizer thumbnail tab is there
        await onExecuteTool('suggest_optimization_tool', { toolId: 'youtube-optimizer', autoOpen: true });
        if (effectiveStepId) markDone(effectiveStepId);
        setTimeout(() => presentNextStep(), 400);
        break;
      }

      case 'open_social_posts': {
        // Navigate to Post phase — YouTubeOptimizer content multiplier tab is there
        await onExecuteTool('suggest_optimization_tool', { toolId: 'youtube-optimizer', autoOpen: true });
        if (effectiveStepId) markDone(effectiveStepId);
        setTimeout(() => presentNextStep(), 400);
        break;
      }

      case 'advance':
      case 'mark_done': {
        if (effectiveStepId) markDone(effectiveStepId);
        setTimeout(() => presentNextStep(), 200);
        break;
      }

      case 'skip_step': {
        setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content: 'No problem — skip just this once, or skip it for the whole project?',
            actionButtons: [
              { label: 'Skip Once', action: 'skip_once', variant: 'secondary' },
              { label: 'Skip for Project', action: 'skip_always', variant: 'skip' },
              { label: 'Never Mind', action: 'cancel_skip', variant: 'secondary' },
            ],
            stepId: effectiveStepId,
          },
        ]);
        break;
      }

      case 'skip_once': {
        if (effectiveStepId) {
          skippedRef.current.add(effectiveStepId);
          setMessages(prev => [...prev, { role: 'system', content: 'Skipped.' }]);
          setTimeout(() => presentNextStep(), 200);
        }
        break;
      }

      case 'skip_always': {
        if (effectiveStepId) {
          skippedRef.current.add(effectiveStepId);
          setMessages(prev => [...prev, { role: 'system', content: 'Step skipped for this project.' }]);
          setTimeout(() => presentNextStep(), 200);
        }
        break;
      }

      case 'cancel_skip': {
        setMessages(prev => [...prev, { role: 'system', content: 'No problem, still on track.' }]);
        break;
      }

      case 'next_phase': {
        sendMessage(`I've completed all steps for the ${currentPhase} phase. What should I do next to advance the production?`);
        break;
      }

      default:
        break;
    }
  }, [currentPhase, currentStepId, presentNextStep, onExecuteTool, onGenerateCharacters, onGenerateScenes, project, sendMessage]);

  const sendProactiveGreeting = useCallback(async () => {
    // Check both the messages array AND the initiated flag to prevent race conditions
    // (React 18 Strict Mode runs effects twice; we must guard synchronously)
    if (messagesRef.current.length > 0 || greetingInitiatedRef.current) return;
    greetingInitiatedRef.current = true;
    setIsTyping(true);

    let greetingPrompt: string;
    if (!project.script || project.script.trim().length < 20) {
      greetingPrompt = 'New project, no script yet. Give a single concise sentence greeting as the Director — acknowledge we\'re starting fresh.';
    } else if (project.scenes.length === 0) {
      greetingPrompt = 'Script is present but not analyzed. Give a single concise sentence greeting as the Director — acknowledge the script is ready to process.';
    } else {
      greetingPrompt = `${currentPhase.toUpperCase()} phase — ${project.scenes.length} scenes, ${project.characters.length} characters. Give a single concise sentence greeting as the Director — mention the phase and that you will guide through the steps. One sentence only.`;
    }

    try {
      const response = await handleDirectorChat(greetingPrompt, project, []);
      if (response.functionCalls) {
        for (const fc of response.functionCalls) {
          if (fc.name) await onExecuteTool(fc.name, fc.args);
        }
      }
      setMessages([{ role: 'assistant', content: response.text || "Director online. Let's build something." }]);
    } catch {
      setMessages([{ role: 'assistant', content: "Director online. Let's get this production moving." }]);
    } finally {
      setIsTyping(false);
      // Present the first actionable workflow step after greeting
      setTimeout(() => presentNextStep(), 500);
    }
  }, [currentPhase, project, onExecuteTool, presentNextStep]);

  return {
    messages,
    isTyping,
    sendMessage,
    sendProactiveGreeting,
    currentStepId,
    handleAction,
    workflowSteps,
  };
}
