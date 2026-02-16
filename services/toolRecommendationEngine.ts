
import { ProjectState, ProductionPhase } from '../types';

export interface ToolRecommendation {
  toolId: string;
  toolName: string;
  reason: string;
  relevanceScore: number; // 0-100
  whenToUse: string;
  benefit: string;
  estimatedTime: string;
  oneClickAvailable: boolean;
}

/**
 * Get tool recommendations based on current phase and project state
 */
export function getToolRecommendations(
  phase: ProductionPhase,
  project: ProjectState
): ToolRecommendation[] {
  const recommendations: ToolRecommendation[] = [];

  // Check what tools have been used
  const usedTools = new Set(project.toolUsageHistory?.map(t => t.toolId) || []);

  // Phase-specific recommendations
  switch (phase) {
    case 'genesis':
      // Script Doctor
      if (!usedTools.has('script-doctor')) {
        const hasScript = project.script && project.script.length > 100;
        if (hasScript) {
          recommendations.push({
            toolId: 'script-doctor',
            toolName: 'Script Doctor',
            reason: 'Your script hasn\'t been audited for narrative issues',
            relevanceScore: 70,
            whenToUse: 'After writing your script, before analysis',
            benefit: 'Identifies hook weaknesses, pacing issues, and structural problems',
            estimatedTime: '30 seconds',
            oneClickAvailable: true
          });
        }
      }

      // Moodboard
      recommendations.push({
        toolId: 'moodboard',
        toolName: 'Moodboard',
        reason: 'Add visual references to guide your production style',
        relevanceScore: 40,
        whenToUse: 'When defining your visual aesthetic',
        benefit: 'Ensures consistent visual style across all generated scenes',
        estimatedTime: '2-5 minutes',
        oneClickAvailable: false
      });
      break;

    case 'manifest':
      // Continuity Auditor
      if (!usedTools.has('continuity-auditor')) {
        const hasCharacters = project.characters.length > 0;
        const hasMultipleScenes = project.scenes.length > 2;
        if (hasCharacters && hasMultipleScenes) {
          recommendations.push({
            toolId: 'continuity-auditor',
            toolName: 'Continuity Auditor',
            reason: 'Character consistency hasn\'t been verified across scenes',
            relevanceScore: 85,
            whenToUse: 'After script analysis, before asset generation',
            benefit: 'Detects inconsistencies in character appearance, props, and settings',
            estimatedTime: '1 minute',
            oneClickAvailable: true
          });
        }
      }

      // Timeline (Production Timeline)
      recommendations.push({
        toolId: 'timeline',
        toolName: 'Production Timeline',
        reason: 'Review scene pacing and transitions',
        relevanceScore: 60,
        whenToUse: 'When optimizing video flow and timing',
        benefit: 'Visualize scene duration and transitions for better pacing',
        estimatedTime: '2-3 minutes',
        oneClickAvailable: false
      });
      break;

    case 'synthesis':
      // B-Roll Suggester
      const sceneCount = project.scenes.length;
      if (sceneCount < 8) {
        recommendations.push({
          toolId: 'broll-suggester',
          toolName: 'B-Roll Suggester',
          reason: 'Your video has limited visual variety',
          relevanceScore: 65,
          whenToUse: 'When you need more visual diversity',
          benefit: 'Adds supplementary scenes to enhance storytelling',
          estimatedTime: '1-2 minutes',
          oneClickAvailable: true
        });
      }

      // Audio Mixer
      const hasGeneratedAudio = Object.values(project.assets || {}).some(a => a.audioUrl);
      if (hasGeneratedAudio) {
        recommendations.push({
          toolId: 'audio-mixer',
          toolName: 'Audio Mixer',
          reason: 'Fine-tune audio levels for each scene',
          relevanceScore: 55,
          whenToUse: 'After generating scene audio',
          benefit: 'Balance music, dialogue, and ambient sounds',
          estimatedTime: '3-5 minutes',
          oneClickAvailable: false
        });
      }

      // Key Art (if not set)
      if (!project.keyArtSceneId) {
        const completeScenes = Object.values(project.assets || {}).filter(a => a.status === 'complete').length;
        if (completeScenes > 0) {
          recommendations.push({
            toolId: 'key-art',
            toolName: 'Key Art Selection',
            reason: 'No reference scene set for visual consistency',
            relevanceScore: 70,
            whenToUse: 'After generating your first few scenes',
            benefit: 'Maintains consistent visual style across all scenes',
            estimatedTime: '30 seconds',
            oneClickAvailable: false
          });
        }
      }
      break;

    case 'post':
      // YouTube Optimizer (Viral Analysis)
      if (!project.viralData) {
        recommendations.push({
          toolId: 'youtube-optimizer',
          toolName: 'YouTube Optimizer',
          reason: 'Viral potential hasn\'t been analyzed',
          relevanceScore: 90,
          whenToUse: 'Before finalizing and exporting',
          benefit: 'Identifies retention issues, optimizes hook, generates SEO metadata',
          estimatedTime: '1 minute',
          oneClickAvailable: true
        });
      }

      // VFX Master
      if (!project.mastering) {
        recommendations.push({
          toolId: 'vfx-master',
          toolName: 'VFX Master',
          reason: 'Cinematic effects haven\'t been applied',
          relevanceScore: 85,
          whenToUse: 'After all scenes are generated',
          benefit: 'Adds film grain, bloom, color grading, and professional polish',
          estimatedTime: '2-3 minutes',
          oneClickAvailable: false
        });
      }

      // YouTube Optimizer (SEO) - if viral analysis done but no metadata generated
      if (project.viralData && !usedTools.has('youtube-optimizer-seo')) {
        recommendations.push({
          toolId: 'youtube-optimizer-seo',
          toolName: 'YouTube SEO Generator',
          reason: 'Generate optimized metadata for maximum reach',
          relevanceScore: 75,
          whenToUse: 'After viral analysis',
          benefit: 'Creates optimized title, description, tags, and thumbnail text',
          estimatedTime: '1 minute',
          oneClickAvailable: true
        });
      }

      // Thumbnail Generator
      recommendations.push({
        toolId: 'thumbnail-generator',
        toolName: 'Thumbnail Generator',
        reason: 'Create a compelling thumbnail for your video',
        relevanceScore: 60,
        whenToUse: 'When preparing to publish',
        benefit: 'Generates click-worthy thumbnail designs',
        estimatedTime: '2 minutes',
        oneClickAvailable: false
      });
      break;
  }

  // Sort by relevance score (highest first)
  return recommendations.sort((a, b) => b.relevanceScore - a.relevanceScore);
}

/**
 * Get top N tool recommendations
 */
export function getTopRecommendations(
  phase: ProductionPhase,
  project: ProjectState,
  limit: number = 3
): ToolRecommendation[] {
  const allRecommendations = getToolRecommendations(phase, project);
  return allRecommendations.slice(0, limit);
}

/**
 * Check if a specific tool is recommended for current state
 */
export function isToolRecommended(
  toolId: string,
  phase: ProductionPhase,
  project: ProjectState
): boolean {
  const recommendations = getToolRecommendations(phase, project);
  return recommendations.some(r => r.toolId === toolId);
}

/**
 * Get recommendation for a specific tool
 */
export function getToolRecommendation(
  toolId: string,
  phase: ProductionPhase,
  project: ProjectState
): ToolRecommendation | null {
  const recommendations = getToolRecommendations(phase, project);
  return recommendations.find(r => r.toolId === toolId) || null;
}

/**
 * Mark a tool as used (to be called from App.tsx when tool is opened/executed)
 */
export function markToolUsed(
  toolId: string,
  project: ProjectState,
  result?: any
): ProjectState {
  const currentHistory = project.toolUsageHistory || [];

  return {
    ...project,
    toolUsageHistory: [
      ...currentHistory,
      {
        toolId,
        timestamp: Date.now(),
        result
      }
    ]
  };
}
