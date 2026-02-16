
import { ProjectState, ProductionPhase } from '../types';

export interface InterventionAction {
  label: string;
  icon: string;
  oneClick: boolean;
  execute: (project: ProjectState) => Promise<void>;
  actionId?: string; // For tracking execution
}

export interface Intervention {
  id: string;
  title: string;
  message: string;
  type: 'suggestion' | 'warning' | 'opportunity' | 'celebration';
  actions: InterventionAction[];
  dismissible: boolean;
  autoShowModal?: boolean;
  modalId?: string;
  priority: number; // 1-10, higher = more urgent
}

export interface InterventionTrigger {
  id: string;
  condition: (project: ProjectState, prevState?: ProjectState) => boolean;
  priority: number;
  intervention: Intervention;
  cooldown?: number; // Min ms between same trigger
}

// Cooldown tracking
const triggerHistory: Map<string, number> = new Map();

/**
 * Check if a trigger is on cooldown
 */
function isOnCooldown(triggerId: string, cooldownMs: number = 0): boolean {
  if (cooldownMs === 0) return false;

  const lastTrigger = triggerHistory.get(triggerId);
  if (!lastTrigger) return false;

  return Date.now() - lastTrigger < cooldownMs;
}

/**
 * Record that a trigger has fired
 */
function recordTrigger(triggerId: string) {
  triggerHistory.set(triggerId, Date.now());
}

/**
 * Check if intervention was already dismissed
 */
function wasDismissed(interventionId: string, project: ProjectState): boolean {
  return project.interventionHistory?.some(
    record => record.interventionId === interventionId && record.action === 'dismissed'
  ) || false;
}

/**
 * All intervention triggers
 */
export const INTERVENTION_TRIGGERS: InterventionTrigger[] = [
  // 1. Script Analysis Complete
  {
    id: 'script_analysis_complete',
    priority: 8,
    cooldown: 0, // Only trigger once per analysis
    condition: (project, prevState) => {
      // Check if scenes just appeared (script was just analyzed)
      const hadNoScenes = !prevState || prevState.scenes.length === 0;
      const hasScenes = project.scenes.length > 0;
      return hadNoScenes && hasScenes;
    },
    intervention: {
      id: 'script_analyzed',
      title: '🎬 Script Analysis Complete!',
      message: 'Your script has been broken down into scenes and characters. Next critical steps: assign voices to all characters and review scene continuity.',
      type: 'celebration',
      actions: [
        {
          label: 'Assign Voices Now',
          icon: 'fa-microphone',
          oneClick: true,
          actionId: 'assign_voices',
          execute: async () => { }
        },
        {
          label: 'Run Continuity Audit',
          icon: 'fa-shield-check',
          oneClick: true,
          actionId: 'run_continuity_audit',
          execute: async () => { }
        }
      ],
      dismissible: true,
      priority: 8
    }
  },

  // 2. First Scene Generated
  {
    id: 'first_scene_generated',
    priority: 7,
    cooldown: 0,
    condition: (project, prevState) => {
      const prevCompleteCount = Object.values(prevState?.assets || {}).filter(a => a.status === 'complete').length;
      const currentCompleteCount = Object.values(project.assets || {}).filter(a => a.status === 'complete').length;
      return prevCompleteCount === 0 && currentCompleteCount === 1;
    },
    intervention: {
      id: 'first_scene_complete',
      title: '🎉 First Scene Generated!',
      message: 'Your production is taking shape! Consider setting this scene as your Key Art reference to maintain visual consistency across all scenes.',
      type: 'celebration',
      actions: [
        {
          label: 'Set as Key Art',
          icon: 'fa-image',
          oneClick: true,
          actionId: 'set_key_art',
          execute: async () => { }
        },
        {
          label: 'Generate Remaining Scenes',
          icon: 'fa-play',
          oneClick: true,
          actionId: 'generate_remaining_scenes',
          execute: async () => { }
        }
      ],
      dismissible: true,
      priority: 7
    }
  },

  // 3. 3+ Scenes Generated (batch suggestion)
  {
    id: 'multiple_scenes_generated',
    priority: 6,
    cooldown: 30 * 60 * 1000, // 30 minutes
    condition: (project, prevState) => {
      const completeCount = Object.values(project.assets || {}).filter(a => a.status === 'complete').length;
      const pendingCount = Object.values(project.assets || {}).filter(a => a.status === 'pending').length;
      return completeCount >= 3 && pendingCount > 0;
    },
    intervention: {
      id: 'batch_generation_suggestion',
      title: '⚡ Ready for Batch Generation',
      message: 'You have multiple scenes remaining. Batch generation can process them all at once, saving time.',
      type: 'opportunity',
      actions: [
        {
          label: 'Generate All Remaining',
          icon: 'fa-bolt',
          oneClick: true,
          actionId: 'generate_remaining_scenes',
          execute: async () => { }
        }
      ],
      dismissible: true,
      priority: 6
    }
  },

  // 4. All Assets Complete
  {
    id: 'all_assets_complete',
    priority: 9,
    cooldown: 0,
    condition: (project, prevState) => {
      const prevAllComplete = prevState && prevState.scenes.length > 0 &&
        prevState.scenes.every(s => prevState.assets?.[s.id]?.status === 'complete');
      const currentAllComplete = project.scenes.length > 0 &&
        project.scenes.every(s => project.assets?.[s.id]?.status === 'complete');
      return !prevAllComplete && currentAllComplete;
    },
    intervention: {
      id: 'synthesis_complete',
      title: '🎉 All Scenes Generated!',
      message: 'Synthesis phase complete! Time to master your final cut with VFX effects and run a viral analysis to optimize for viewer retention.',
      type: 'celebration',
      actions: [
        {
          label: 'Apply VFX Mastering',
          icon: 'fa-wand-magic-sparkles',
          oneClick: false,
          actionId: 'apply_vfx_mastering',
          execute: async () => { }
        },
        {
          label: 'Analyze Viral Potential',
          icon: 'fa-chart-line',
          oneClick: true,
          actionId: 'analyze_viral_potential',
          execute: async () => { }
        }
      ],
      dismissible: true,
      priority: 9
    }
  },

  // 5. Character Added (continuity check)
  {
    id: 'character_added',
    priority: 5,
    cooldown: 10 * 60 * 1000, // 10 minutes
    condition: (project, prevState) => {
      return project.characters.length > (prevState?.characters.length || 0);
    },
    intervention: {
      id: 'new_character_continuity',
      title: '👤 New Character Added',
      message: 'A new character has been added to your production. Run the Continuity Auditor to ensure consistent appearance across all scenes.',
      type: 'suggestion',
      actions: [
        {
          label: 'Run Continuity Check',
          icon: 'fa-shield-check',
          oneClick: true,
          actionId: 'run_continuity_audit',
          execute: async () => { }
        }
      ],
      dismissible: true,
      priority: 5
    }
  },

  // 6. Asset Generation Failed Multiple Times
  {
    id: 'repeated_failures',
    priority: 8,
    cooldown: 15 * 60 * 1000, // 15 minutes
    condition: (project, prevState) => {
      const failedCount = Object.values(project.assets || {}).filter(a => a.status === 'error').length;
      return failedCount >= 2;
    },
    intervention: {
      id: 'generation_failures',
      title: '⚠️ Generation Issues Detected',
      message: 'Multiple scenes failed to generate. This usually indicates prompt issues or API limits. Review failed scenes and try improving their visual descriptions.',
      type: 'warning',
      actions: [
        {
          label: 'Review Failed Scenes',
          icon: 'fa-search',
          oneClick: false,
          actionId: 'review_failed_scenes',
          execute: async () => { }
        },
        {
          label: 'Get Help from Director',
          icon: 'fa-comments',
          oneClick: false,
          actionId: 'open_director_chat',
          execute: async () => { }
        }
      ],
      dismissible: true,
      priority: 8
    }
  },

  // 7. No Viral Analysis in Post Phase
  {
    id: 'post_no_viral',
    priority: 6,
    cooldown: 20 * 60 * 1000, // 20 minutes
    condition: (project, prevState) => {
      // This will be triggered by phase detection in the main app
      // For now, just check if in post phase without viral data
      return !project.viralData && project.scenes.length > 0;
    },
    intervention: {
      id: 'missing_viral_analysis',
      title: '📊 Optimize for Virality',
      message: 'Your content hasn\'t been analyzed for viral potential. Run a retention analysis to identify hook strength and engagement friction points.',
      type: 'opportunity',
      actions: [
        {
          label: 'Analyze Viral Potential',
          icon: 'fa-chart-line',
          oneClick: true,
          actionId: 'analyze_viral_potential',
          execute: async () => { }
        }
      ],
      dismissible: true,
      priority: 6
    }
  },

  // 8. High Viral Score Achievement
  {
    id: 'high_viral_score',
    priority: 7,
    cooldown: 0,
    condition: (project, prevState) => {
      const hadNoData = !prevState?.viralData;
      const hasHighScore = project.viralData && project.viralData.hookScore >= 80;
      return hadNoData && hasHighScore;
    },
    intervention: {
      id: 'viral_success',
      title: '📈 High Viral Potential Detected!',
      message: 'Your content scored high on viral potential! Strong hook and retention curve. This has excellent sharing potential.',
      type: 'celebration',
      actions: [
        {
          label: 'Generate SEO Metadata',
          icon: 'fa-tags',
          oneClick: true,
          actionId: 'generate_seo_metadata',
          execute: async () => { }
        }
      ],
      dismissible: true,
      priority: 7
    }
  },

  // 9. Missing Voices (critical blocker)
  {
    id: 'missing_voices_warning',
    priority: 9,
    cooldown: 5 * 60 * 1000, // 5 minutes
    condition: (project, prevState) => {
      return project.characters.length > 0 && project.characters.some(c => !c.voiceId);
    },
    intervention: {
      id: 'voices_required',
      title: '⚠️ Voice Assignments Required',
      message: 'Some characters are missing voice assignments. This will block asset generation in the Synthesis phase.',
      type: 'warning',
      actions: [
        {
          label: 'Assign Voices Now',
          icon: 'fa-microphone',
          oneClick: true,
          actionId: 'assign_voices',
          execute: async () => { }
        }
      ],
      dismissible: false, // Cannot dismiss critical blockers
      priority: 9
    }
  },

  // 10. Export Ready Celebration
  {
    id: 'export_ready',
    priority: 8,
    cooldown: 0,
    condition: (project, prevState) => {
      const wasNotReady = !prevState?.renderUrl;
      const isReady = !!project.renderUrl;
      return wasNotReady && isReady;
    },
    intervention: {
      id: 'video_exported',
      title: '🚀 Video Exported Successfully!',
      message: 'Your production is complete and ready to share with the world! Consider generating YouTube metadata and social media posts.',
      type: 'celebration',
      actions: [
        {
          label: 'Download Video',
          icon: 'fa-download',
          oneClick: false,
          actionId: 'download_video',
          execute: async () => { /* Download video */ }
        },
        {
          label: 'Generate Social Posts',
          icon: 'fa-share-nodes',
          oneClick: true,
          actionId: 'generate_social_posts',
          execute: async () => { /* Generate social content */ }
        }
      ],
      dismissible: true,
      priority: 8
    }
  }
];

/**
 * Evaluate all triggers and return active interventions
 */
export function evaluateTriggers(
  project: ProjectState,
  prevState: ProjectState | undefined,
  enabledMode: boolean = true
): Intervention[] {
  if (!enabledMode) {
    // In expert mode, only show critical interventions (priority 9+)
    const criticalTriggers = INTERVENTION_TRIGGERS.filter(t => t.priority >= 9);
    return evaluateSpecificTriggers(criticalTriggers, project, prevState);
  }

  return evaluateSpecificTriggers(INTERVENTION_TRIGGERS, project, prevState);
}

/**
 * Evaluate a specific set of triggers
 */
function evaluateSpecificTriggers(
  triggers: InterventionTrigger[],
  project: ProjectState,
  prevState: ProjectState | undefined
): Intervention[] {
  const activeInterventions: Intervention[] = [];

  for (const trigger of triggers) {
    // Skip if on cooldown
    if (isOnCooldown(trigger.id, trigger.cooldown)) {
      continue;
    }

    // Skip if already dismissed
    if (wasDismissed(trigger.intervention.id, project)) {
      continue;
    }

    // Check condition
    try {
      if (trigger.condition(project, prevState)) {
        activeInterventions.push(trigger.intervention);
        recordTrigger(trigger.id);
      }
    } catch (error) {
      console.error(`Error evaluating trigger ${trigger.id}:`, error);
    }
  }

  // Sort by priority (highest first)
  return activeInterventions.sort((a, b) => b.priority - a.priority);
}

/**
 * Evaluate phase-specific triggers (called on phase transition)
 */
export function evaluatePhaseTransition(
  newPhase: ProductionPhase,
  project: ProjectState
): Intervention | null {
  const phaseInterventions: Record<ProductionPhase, Intervention> = {
    genesis: {
      id: 'entered_genesis',
      title: '🌱 Genesis Phase',
      message: 'Welcome to Genesis! This is where your story begins. Focus on crafting a compelling script with a strong hook in the first 5 seconds.',
      type: 'suggestion',
      actions: [
        {
          label: 'Get Script Writing Tips',
          icon: 'fa-lightbulb',
          oneClick: false,
          actionId: 'open_director_chat',
          execute: async () => { }
        }
      ],
      dismissible: true,
      priority: 5
    },
    manifest: {
      id: 'entered_manifest',
      title: '📋 Manifest Phase',
      message: 'Time to bring your script to life! Assign voices to all characters and review scene pacing. Run the Continuity Auditor to ensure character consistency.',
      type: 'suggestion',
      actions: [
        {
          label: 'Assign Voices',
          icon: 'fa-microphone',
          oneClick: true,
          actionId: 'assign_voices',
          execute: async () => { }
        },
        {
          label: 'Check Continuity',
          icon: 'fa-shield-check',
          oneClick: true,
          actionId: 'run_continuity_audit',
          execute: async () => { }
        }
      ],
      dismissible: true,
      priority: 6
    },
    synthesis: {
      id: 'entered_synthesis',
      title: '✨ Synthesis Phase',
      message: 'Ready to generate your scenes! All characters should have voices assigned. Set a Key Art reference scene to maintain visual consistency.',
      type: 'suggestion',
      actions: [
        {
          label: 'Generate All Scenes',
          icon: 'fa-bolt',
          oneClick: true,
          actionId: 'generate_remaining_scenes',
          execute: async () => { }
        }
      ],
      dismissible: true,
      priority: 6
    },
    post: {
      id: 'entered_post',
      title: '🎬 Post-Production Phase',
      message: 'Final stretch! Apply VFX mastering effects, analyze viral potential, and generate YouTube SEO metadata to maximize your reach.',
      type: 'suggestion',
      actions: [
        {
          label: 'Apply VFX Mastering',
          icon: 'fa-wand-magic-sparkles',
          oneClick: false,
          actionId: 'apply_vfx_mastering',
          execute: async () => { /* VFX Master */ }
        },
        {
          label: 'Analyze Viral Potential',
          icon: 'fa-chart-line',
          oneClick: true,
          actionId: 'analyze_viral_potential',
          execute: async () => { /* Viral analysis */ }
        }
      ],
      dismissible: true,
      priority: 6
    }
  };

  const intervention = phaseInterventions[newPhase];

  // Check if already shown
  if (wasDismissed(intervention.id, project)) {
    return null;
  }

  return intervention;
}

/**
 * Get idle intervention (user inactive for 5+ minutes)
 */
export function getIdleIntervention(
  phase: ProductionPhase,
  project: ProjectState
): Intervention | null {
  // Don't trigger if recently dismissed
  if (wasDismissed('idle_suggestion', project)) {
    return null;
  }

  const idleTime = Date.now() - (project.lastActivityTimestamp || Date.now());
  if (idleTime < 5 * 60 * 1000) {
    return null; // Not idle yet
  }

  // Get next suggested action based on phase
  const suggestions: Record<ProductionPhase, { title: string; message: string; action: string; icon: string }> = {
    genesis: {
      title: '💭 Still Working on Your Script?',
      message: 'Take your time crafting the perfect script. When ready, analyze it to extract scenes and characters.',
      action: 'Analyze Script',
      icon: 'fa-magnifying-glass'
    },
    manifest: {
      title: '🎙️ Ready to Continue?',
      message: 'Complete voice assignments and review scene pacing to prepare for asset generation.',
      action: 'Assign Voices',
      icon: 'fa-microphone'
    },
    synthesis: {
      title: '⚡ Generate Your Scenes?',
      message: 'All preparations are complete. Start generating your scene assets to bring your production to life.',
      action: 'Generate Scenes',
      icon: 'fa-play'
    },
    post: {
      title: '🎬 Finalize Your Production?',
      message: 'Add the finishing touches with VFX mastering and viral optimization before exporting.',
      action: 'Apply VFX',
      icon: 'fa-wand-magic-sparkles'
    }
  };

  const suggestion = suggestions[phase];

  return {
    id: 'idle_suggestion',
    title: suggestion.title,
    message: suggestion.message,
    type: 'suggestion',
    actions: [
      {
        label: suggestion.action,
        icon: suggestion.icon,
        oneClick: false,
        actionId: 'open_phase_action', // Generic, will need to interpret based on phase
        execute: async () => { }
      }
    ],
    dismissible: true,
    priority: 4
  };
}
