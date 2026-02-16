
import { ProjectState, ProductionPhase } from '../types';

export interface WorkflowStep {
  id: string;
  label: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  autoExecutable: boolean;
  priority: 'critical' | 'recommended' | 'optional';
  toolId?: string;
  onExecute?: (project: ProjectState) => Promise<void>;
}

export interface QualityGate {
  id: string;
  condition: (project: ProjectState) => boolean;
  message: string;
  severity: 'blocker' | 'warning' | 'info';
  autoFixable: boolean;
  autoFixAction?: (project: ProjectState) => Promise<void>;
}

export interface PhaseChecklist {
  phase: ProductionPhase;
  requiredSteps: WorkflowStep[];
  optionalSteps: WorkflowStep[];
  qualityGates: QualityGate[];
  completionPercentage: number;
}

// Quality gates for each phase
export const QUALITY_GATES: Record<ProductionPhase, QualityGate[]> = {
  genesis: [
    {
      id: 'has_script',
      condition: (p) => p.script && p.script.length > 50,
      message: 'Script is required to proceed',
      severity: 'blocker',
      autoFixable: false
    },
    {
      id: 'scene_format',
      condition: (p) => p.scenes && p.scenes.length > 0,
      message: 'Script must be analyzed to extract scenes',
      severity: 'blocker',
      autoFixable: false
    },
    {
      id: 'has_style',
      condition: (p) => !!p.globalStyle,
      message: 'Consider setting a global visual style for consistency',
      severity: 'warning',
      autoFixable: false
    }
  ],
  manifest: [
    {
      id: 'missing_voices',
      condition: (p) => !p.characters.some(c => !c.voiceId),
      message: 'All characters must have voice assignments',
      severity: 'blocker',
      autoFixable: true,
      autoFixAction: async (p) => {
        // This will be handled by triggering voice casting modal
      }
    },
    {
      id: 'low_scene_count',
      condition: (p) => p.scenes.length >= 2,
      message: 'Very few scenes - consider expanding script',
      severity: 'warning',
      autoFixable: false
    },
    {
      id: 'no_continuity_check',
      condition: (p) => {
        // Check if continuity auditor was run (via tool usage history)
        return p.toolUsageHistory?.some(t => t.toolId === 'continuity-auditor') || false;
      },
      message: 'Character continuity has not been audited',
      severity: 'warning',
      autoFixable: false
    }
  ],
  synthesis: [
    {
      id: 'pending_assets',
      condition: (p) => !Object.values(p.assets || {}).some(a => a.status === 'pending'),
      message: 'Ungenerated scenes detected - run batch manifest',
      severity: 'blocker',
      autoFixable: false
    },
    {
      id: 'failed_assets',
      condition: (p) => !Object.values(p.assets || {}).some(a => a.status === 'error'),
      message: 'Some assets failed - review and retry',
      severity: 'warning',
      autoFixable: false
    },
    {
      id: 'no_key_art',
      condition: (p) => !!p.keyArtSceneId,
      message: 'No Key Art reference scene selected',
      severity: 'warning',
      autoFixable: false
    }
  ],
  post: [
    {
      id: 'incomplete_assets',
      condition: (p) => p.scenes.every(s => p.assets?.[s.id]?.status === 'complete'),
      message: 'Not all assets complete - export will be incomplete',
      severity: 'blocker',
      autoFixable: false
    },
    {
      id: 'no_viral_analysis',
      condition: (p) => !!p.viralData,
      message: 'Viral potential has not been analyzed',
      severity: 'warning',
      autoFixable: false
    },
    {
      id: 'no_mastering',
      condition: (p) => !!p.mastering,
      message: 'VFX mastering has not been applied',
      severity: 'warning',
      autoFixable: false
    }
  ]
};

// Workflow steps for each phase
export const WORKFLOW_STEPS: Record<ProductionPhase, { required: WorkflowStep[], optional: WorkflowStep[] }> = {
  genesis: {
    required: [
      {
        id: 'write_script',
        label: 'Write Script',
        description: 'Create your script with scenes in [Scene: ...] format',
        status: 'pending',
        autoExecutable: false,
        priority: 'critical'
      },
      {
        id: 'analyze_script',
        label: 'Analyze Script',
        description: 'Extract scenes and characters from script',
        status: 'pending',
        autoExecutable: true,
        priority: 'critical'
      }
    ],
    optional: [
      {
        id: 'set_style',
        label: 'Set Global Style',
        description: 'Define the visual style for your production',
        status: 'pending',
        autoExecutable: false,
        priority: 'recommended'
      },
      {
        id: 'set_aspect_ratio',
        label: 'Set Aspect Ratio',
        description: 'Choose aspect ratio (16:9, 9:16, etc.)',
        status: 'pending',
        autoExecutable: false,
        priority: 'recommended'
      },
      {
        id: 'add_moodboard',
        label: 'Add Moodboard Reference',
        description: 'Upload reference images for visual inspiration',
        status: 'pending',
        autoExecutable: false,
        priority: 'optional',
        toolId: 'moodboard'
      },
      {
        id: 'run_script_doctor',
        label: 'Run Script Doctor',
        description: 'Analyze script for narrative issues and improvements',
        status: 'pending',
        autoExecutable: true,
        priority: 'optional',
        toolId: 'script-doctor'
      }
    ]
  },
  manifest: {
    required: [
      {
        id: 'assign_voices',
        label: 'Assign Voices to Characters',
        description: 'All characters need voice assignments',
        status: 'pending',
        autoExecutable: true,
        priority: 'critical'
      }
    ],
    optional: [
      {
        id: 'run_continuity_audit',
        label: 'Run Continuity Auditor',
        description: 'Check character consistency across scenes',
        status: 'pending',
        autoExecutable: true,
        priority: 'recommended',
        toolId: 'continuity-auditor'
      },
      {
        id: 'review_timeline',
        label: 'Review Scene Pacing',
        description: 'Check scene timing and transitions in timeline',
        status: 'pending',
        autoExecutable: false,
        priority: 'recommended'
      },
      {
        id: 'add_character_references',
        label: 'Add Character Reference Images',
        description: 'Upload reference images for characters',
        status: 'pending',
        autoExecutable: false,
        priority: 'optional'
      },
      {
        id: 'adjust_scene_descriptions',
        label: 'Adjust Scene Descriptions',
        description: 'Fine-tune scene descriptions and prompts',
        status: 'pending',
        autoExecutable: false,
        priority: 'optional'
      }
    ]
  },
  synthesis: {
    required: [
      {
        id: 'generate_assets',
        label: 'Generate All Scene Assets',
        description: 'Generate images, video, and audio for all scenes',
        status: 'pending',
        autoExecutable: true,
        priority: 'critical'
      }
    ],
    optional: [
      {
        id: 'set_key_art',
        label: 'Set Key Art Reference',
        description: 'Choose a scene as the visual reference for consistency',
        status: 'pending',
        autoExecutable: false,
        priority: 'recommended'
      },
      {
        id: 'review_failed_assets',
        label: 'Review and Retry Failed Assets',
        description: 'Fix any failed asset generations',
        status: 'pending',
        autoExecutable: false,
        priority: 'recommended'
      },
      {
        id: 'add_broll',
        label: 'Add B-Roll Scenes',
        description: 'Add supplementary B-Roll for visual variety',
        status: 'pending',
        autoExecutable: false,
        priority: 'optional',
        toolId: 'broll-suggester'
      },
      {
        id: 'adjust_audio_mixing',
        label: 'Adjust Audio Mixing',
        description: 'Fine-tune audio levels per scene',
        status: 'pending',
        autoExecutable: false,
        priority: 'optional',
        toolId: 'audio-mixer'
      }
    ]
  },
  post: {
    required: [],
    optional: [
      {
        id: 'run_viral_analysis',
        label: 'Analyze Viral Potential',
        description: 'Check hook strength and retention potential',
        status: 'pending',
        autoExecutable: true,
        priority: 'recommended',
        toolId: 'youtube-optimizer'
      },
      {
        id: 'generate_seo_metadata',
        label: 'Generate YouTube SEO Metadata',
        description: 'Create optimized title, description, and tags',
        status: 'pending',
        autoExecutable: true,
        priority: 'recommended',
        toolId: 'youtube-optimizer'
      },
      {
        id: 'apply_vfx_mastering',
        label: 'Apply VFX Mastering',
        description: 'Add film grain, bloom, color grading, etc.',
        status: 'pending',
        autoExecutable: false,
        priority: 'recommended',
        toolId: 'vfx-master'
      },
      {
        id: 'generate_thumbnail',
        label: 'Generate Thumbnail',
        description: 'Create a compelling thumbnail',
        status: 'pending',
        autoExecutable: false,
        priority: 'optional'
      },
      {
        id: 'generate_social_posts',
        label: 'Generate Social Media Posts',
        description: 'Create promotional content for social platforms',
        status: 'pending',
        autoExecutable: false,
        priority: 'optional'
      }
    ]
  }
};

/**
 * Get the checklist for a specific phase with current progress
 */
export function getPhaseChecklist(phase: ProductionPhase, project: ProjectState): PhaseChecklist {
  const phaseSteps = WORKFLOW_STEPS[phase];
  const phaseGates = QUALITY_GATES[phase];
  const progress = project.workflowProgress?.[phase];

  // Update step statuses based on project state
  const updateStepStatus = (step: WorkflowStep): WorkflowStep => {
    if (progress?.completedSteps.includes(step.id)) {
      return { ...step, status: 'completed' };
    }
    if (progress?.skippedSteps.includes(step.id)) {
      return { ...step, status: 'skipped' };
    }

    // Auto-detect completion based on project state
    switch (step.id) {
      case 'write_script':
        return { ...step, status: project.script && project.script.length > 50 ? 'completed' : 'pending' };
      case 'analyze_script':
        return { ...step, status: project.scenes.length > 0 ? 'completed' : 'pending' };
      case 'assign_voices':
        return { ...step, status: project.characters.every(c => c.voiceId) ? 'completed' : 'pending' };
      case 'generate_assets':
        const allGenerated = project.scenes.length > 0 &&
          project.scenes.every(s => project.assets?.[s.id]?.status === 'complete');
        return { ...step, status: allGenerated ? 'completed' : 'pending' };
      case 'set_key_art':
        return { ...step, status: project.keyArtSceneId ? 'completed' : 'pending' };
      case 'run_viral_analysis':
        return { ...step, status: project.viralData ? 'completed' : 'pending' };
      case 'apply_vfx_mastering':
        return { ...step, status: project.mastering ? 'completed' : 'pending' };
      case 'set_style':
        return { ...step, status: project.globalStyle ? 'completed' : 'pending' };
      case 'run_continuity_audit':
        const audited = project.toolUsageHistory?.some(t => t.toolId === 'continuity-auditor');
        return { ...step, status: audited ? 'completed' : 'pending' };
      case 'run_script_doctor':
        const doctored = project.toolUsageHistory?.some(t => t.toolId === 'script-doctor');
        return { ...step, status: doctored ? 'completed' : 'pending' };
      default:
        return step;
    }
  };

  const requiredSteps = phaseSteps.required.map(updateStepStatus);
  const optionalSteps = phaseSteps.optional.map(updateStepStatus);

  // Calculate completion percentage
  const totalRequired = requiredSteps.length;
  const completedRequired = requiredSteps.filter(s => s.status === 'completed').length;
  const totalOptional = optionalSteps.length;
  const completedOptional = optionalSteps.filter(s => s.status === 'completed').length;

  // Required steps count for 70%, optional for 30%
  const requiredWeight = 0.7;
  const optionalWeight = 0.3;
  const requiredPercent = totalRequired > 0 ? (completedRequired / totalRequired) * requiredWeight : requiredWeight;
  const optionalPercent = totalOptional > 0 ? (completedOptional / totalOptional) * optionalWeight : 0;
  const completionPercentage = Math.round((requiredPercent + optionalPercent) * 100);

  return {
    phase,
    requiredSteps,
    optionalSteps,
    qualityGates: phaseGates,
    completionPercentage
  };
}

/**
 * Evaluate quality gates for a specific phase
 * Returns only the gates that are failing
 */
export function evaluateQualityGates(phase: ProductionPhase, project: ProjectState): QualityGate[] {
  const gates = QUALITY_GATES[phase];
  const overrides = project.qualityGateOverrides || [];

  return gates.filter(gate => {
    // Skip if overridden
    if (overrides.includes(gate.id)) {
      return false;
    }

    // Check if condition is met (gates are written with positive condition = passing)
    return !gate.condition(project);
  });
}

/**
 * Calculate overall phase completion percentage
 */
export function calculatePhaseCompletion(phase: ProductionPhase, project: ProjectState): number {
  const checklist = getPhaseChecklist(phase, project);
  return checklist.completionPercentage;
}

/**
 * Get the next suggested step for a phase
 */
export function getNextSuggestedStep(phase: ProductionPhase, project: ProjectState): WorkflowStep | null {
  const checklist = getPhaseChecklist(phase, project);

  // First, find any critical pending steps
  const criticalPending = checklist.requiredSteps.find(s =>
    s.status === 'pending' && s.priority === 'critical'
  );
  if (criticalPending) return criticalPending;

  // Then, recommended required steps
  const recommendedRequired = checklist.requiredSteps.find(s =>
    s.status === 'pending' && s.priority === 'recommended'
  );
  if (recommendedRequired) return recommendedRequired;

  // Then, recommended optional steps
  const recommendedOptional = checklist.optionalSteps.find(s =>
    s.status === 'pending' && s.priority === 'recommended'
  );
  if (recommendedOptional) return recommendedOptional;

  // Finally, any optional steps
  const anyOptional = checklist.optionalSteps.find(s => s.status === 'pending');
  if (anyOptional) return anyOptional;

  return null;
}

/**
 * Check if a phase is ready for transition (no blocking quality gates)
 */
export function canTransitionFromPhase(phase: ProductionPhase, project: ProjectState): {
  canTransition: boolean;
  blockers: QualityGate[];
  warnings: QualityGate[];
} {
  const failedGates = evaluateQualityGates(phase, project);
  const blockers = failedGates.filter(g => g.severity === 'blocker');
  const warnings = failedGates.filter(g => g.severity === 'warning');

  return {
    canTransition: blockers.length === 0,
    blockers,
    warnings
  };
}

/**
 * Mark a workflow step as completed
 */
export function markStepCompleted(
  phase: ProductionPhase,
  stepId: string,
  project: ProjectState
): ProjectState {
  const currentProgress = project.workflowProgress || {} as Record<ProductionPhase, any>;
  const phaseProgress = currentProgress[phase] || { completedSteps: [], skippedSteps: [], lastUpdated: Date.now() };

  return {
    ...project,
    workflowProgress: {
      ...currentProgress,
      [phase]: {
        ...phaseProgress,
        completedSteps: [...new Set([...phaseProgress.completedSteps, stepId])],
        skippedSteps: phaseProgress.skippedSteps.filter(id => id !== stepId),
        lastUpdated: Date.now()
      }
    }
  };
}

/**
 * Mark a workflow step as skipped
 */
export function markStepSkipped(
  phase: ProductionPhase,
  stepId: string,
  project: ProjectState
): ProjectState {
  const currentProgress = project.workflowProgress || {} as Record<ProductionPhase, any>;
  const phaseProgress = currentProgress[phase] || { completedSteps: [], skippedSteps: [], lastUpdated: Date.now() };

  return {
    ...project,
    workflowProgress: {
      ...currentProgress,
      [phase]: {
        ...phaseProgress,
        skippedSteps: [...new Set([...phaseProgress.skippedSteps, stepId])],
        completedSteps: phaseProgress.completedSteps.filter(id => id !== stepId),
        lastUpdated: Date.now()
      }
    }
  };
}
