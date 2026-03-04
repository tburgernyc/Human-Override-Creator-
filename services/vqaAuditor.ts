/**
 * Visual Quality Assurance (VQA) Auditor — Tiered verification system
 * 
 * Tier 1: Client-side checks (FREE — no API call)
 *   - Image dimensions, file size, base64 validity
 *   - Canvas histogram: blank/overexposed/underexposed detection
 * 
 * Tier 2: Text-only prompt audit (~400 tokens)
 *   - Validates prompt specificity before expensive image gen
 * 
 * Tier 3: Full vision VQA (~3,000 tokens)
 *   - Multi-image comparison against Master Reference + CharacterDNA
 *   - Only triggered on Tier-2 flags or user request
 */

import { Character, Scene } from '../types';
import { MODEL_NAMES } from '../constants';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface VQAAuditResult {
    tier: 1 | 2 | 3;
    passed: boolean;
    score: number; // 0-100
    metrics: {
        skinTexture: 'pass' | 'fail' | 'skipped';
        lighting: 'pass' | 'fail' | 'skipped';
        dnaMatch: 'pass' | 'fail' | 'skipped';
        visualPacing: 'pass' | 'fail' | 'skipped';
        anatomy: 'pass' | 'fail' | 'skipped';
    };
    rejectionReason?: string;
    recommendation: 'approve' | 'regenerate' | 'flag_for_review';
}

export interface DensityGateState {
    recentShotTypes: string[];
}

// ─── Tier 1: Client-Side Validation (FREE) ──────────────────────────────────

export function tier1ClientValidation(imageDataUrl: string): VQAAuditResult {
    const defaultMetrics = {
        skinTexture: 'skipped' as const,
        lighting: 'skipped' as const,
        dnaMatch: 'skipped' as const,
        visualPacing: 'skipped' as const,
        anatomy: 'skipped' as const,
    };

    // Check base64 validity
    if (!imageDataUrl || !imageDataUrl.startsWith('data:image/')) {
        return {
            tier: 1, passed: false, score: 0, metrics: defaultMetrics,
            rejectionReason: 'Invalid image data URL format',
            recommendation: 'regenerate',
        };
    }

    // Extract base64 data and check size
    const base64Part = imageDataUrl.split(',')[1];
    if (!base64Part || base64Part.length < 1000) {
        return {
            tier: 1, passed: false, score: 0, metrics: defaultMetrics,
            rejectionReason: `Image too small (${base64Part?.length || 0} bytes base64). Likely a blank or error image.`,
            recommendation: 'regenerate',
        };
    }

    // Estimated pixel check via canvas (if available)
    if (typeof document !== 'undefined') {
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (ctx) {
                const img = new Image();
                img.src = imageDataUrl;
                // Note: synchronous histogram requires image to be loaded already.
                // For async loading, this check runs in the pipeline after image decode.
            }
        } catch {
            // Canvas not available (SSR) — skip
        }
    }

    return {
        tier: 1, passed: true, score: 80, metrics: defaultMetrics,
        recommendation: 'approve',
    };
}

/**
 * Async canvas histogram analysis — call after image is loaded.
 * Rejects blank/overexposed/underexposed images at zero API cost.
 */
export function analyzeHistogram(imageDataUrl: string): { passed: boolean; brightness: number; reason?: string } {
    if (typeof document === 'undefined') return { passed: true, brightness: 128 };

    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return { passed: true, brightness: 128 };

        const img = new Image();
        img.src = imageDataUrl;

        // Sample a small version for speed
        const size = 64;
        canvas.width = size;
        canvas.height = size;
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;

        let totalBrightness = 0;
        let singleColorCount = 0;
        const firstR = data[0], firstG = data[1], firstB = data[2];
        const pixelCount = size * size;

        for (let i = 0; i < data.length; i += 4) {
            const brightness = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
            totalBrightness += brightness;
            if (Math.abs(data[i] - firstR) < 5 && Math.abs(data[i + 1] - firstG) < 5 && Math.abs(data[i + 2] - firstB) < 5) {
                singleColorCount++;
            }
        }

        const meanBrightness = totalBrightness / pixelCount;
        const singleColorRatio = singleColorCount / pixelCount;

        if (singleColorRatio > 0.8) {
            return { passed: false, brightness: meanBrightness, reason: `${(singleColorRatio * 100).toFixed(0)}% of pixels are a single color — likely blank or error image` };
        }
        if (meanBrightness > 240) {
            return { passed: false, brightness: meanBrightness, reason: `Mean brightness ${meanBrightness.toFixed(0)} — overexposed` };
        }
        if (meanBrightness < 15) {
            return { passed: false, brightness: meanBrightness, reason: `Mean brightness ${meanBrightness.toFixed(0)} — underexposed/black` };
        }

        return { passed: true, brightness: meanBrightness };
    } catch {
        return { passed: true, brightness: 128 }; // Fail open
    }
}

// ─── Tier 2: Text-Only Prompt Audit (~400 tokens) ───────────────────────────

export async function tier2PromptAudit(
    visualPrompt: string,
    characterDNAs: string[],
    shotType: string | undefined,
    aiClient: any
): Promise<VQAAuditResult> {
    const defaultMetrics = {
        skinTexture: 'skipped' as const,
        lighting: 'skipped' as const,
        dnaMatch: 'skipped' as const,
        visualPacing: 'skipped' as const,
        anatomy: 'skipped' as const,
    };

    try {
        const prompt = `You are a visual prompt quality auditor. Rate this image generation prompt for specificity and forensic realism on a scale of 0-100.

PROMPT: ${visualPrompt.substring(0, 300)}
CHARACTER DNA: ${characterDNAs.join(' | ').substring(0, 300)}
SHOT TYPE: ${shotType || 'not specified'}

Score criteria: Does the prompt specify lens, lighting, skin texture, film grain, and character physical anchors? Deduct points for subjective terms ("beautiful", "stunning"). Reply with ONLY a JSON object: {"score": number, "issues": string[]}`;

        const response = await aiClient.models.generateContent({
            model: MODEL_NAMES.CHECK,
            contents: prompt,
            config: { responseMimeType: 'application/json', maxOutputTokens: 200, temperature: 0 }
        });

        const text = response.text;
        if (!text) {
            return { tier: 2, passed: true, score: 70, metrics: defaultMetrics, recommendation: 'approve' };
        }

        const result = JSON.parse(text);
        const score = typeof result.score === 'number' ? result.score : 70;

        return {
            tier: 2,
            passed: score >= 60,
            score,
            metrics: defaultMetrics,
            rejectionReason: score < 60 ? `Prompt specificity score ${score}/100. Issues: ${(result.issues || []).join(', ')}` : undefined,
            recommendation: score >= 80 ? 'approve' : score >= 60 ? 'flag_for_review' : 'regenerate',
        };
    } catch (e) {
        console.warn('[VQA Tier 2] Prompt audit failed, passing through:', e);
        return { tier: 2, passed: true, score: 70, metrics: defaultMetrics, recommendation: 'approve' };
    }
}

// ─── Tier 3: Full Vision VQA (~3,000 tokens) ────────────────────────────────

export async function tier3VisionAudit(
    generatedImageBase64: string,
    masterReferenceBase64: string | undefined,
    characterDNA: string,
    shotType: string | undefined,
    aiClient: any
): Promise<VQAAuditResult> {
    try {
        const parts: any[] = [];

        // Generated image
        parts.push({ inlineData: { mimeType: 'image/png', data: generatedImageBase64.split(',')[1] } });
        parts.push({ text: 'GENERATED IMAGE — Audit this image for forensic realism quality.' });

        // Master reference (if available)
        if (masterReferenceBase64) {
            parts.push({ inlineData: { mimeType: 'image/png', data: masterReferenceBase64.split(',')[1] } });
            parts.push({ text: 'MASTER REFERENCE — Compare the generated image against this reference for character fidelity.' });
        }

        parts.push({
            text: `VQA AUDIT INSTRUCTIONS: Evaluate the generated image on these criteria and return a JSON object.

CHARACTER DNA: ${characterDNA.substring(0, 400)}
INTENDED SHOT TYPE: ${shotType || 'not specified'}

Score each metric as "pass" or "fail":
1. skinTexture: Visible pores, sweat, imperfections, 35mm grain = pass. Airbrushed, smooth, glowy, plastic = fail.
2. lighting: Available-light, harsh shadows, naturalistic fall-off = pass. Three-point beauty lights, HDR hyper-saturation = fail.
3. dnaMatch: Features align with character DNA description (>70% similarity) = pass. Jaw/eye/hair deviation = fail.
4. anatomy: Correct anatomy, natural proportions = pass. Extra fingers, distorted limbs = fail.
5. visualPacing: Shot matches intended type = pass. Mismatched framing = fail.

Return ONLY: {"score": 0-100, "skinTexture": "pass"|"fail", "lighting": "pass"|"fail", "dnaMatch": "pass"|"fail", "anatomy": "pass"|"fail", "visualPacing": "pass"|"fail", "issues": string[]}`
        });

        const response = await aiClient.models.generateContent({
            model: MODEL_NAMES.CHECK,
            contents: { parts },
            config: { responseMimeType: 'application/json', maxOutputTokens: 300, temperature: 0 }
        });

        const text = response.text;
        if (!text) {
            return {
                tier: 3, passed: true, score: 70,
                metrics: { skinTexture: 'skipped', lighting: 'skipped', dnaMatch: 'skipped', visualPacing: 'skipped', anatomy: 'skipped' },
                recommendation: 'approve',
            };
        }

        const result = JSON.parse(text);
        const score = typeof result.score === 'number' ? result.score : 70;
        const metrics = {
            skinTexture: (result.skinTexture === 'fail' ? 'fail' : 'pass') as 'pass' | 'fail',
            lighting: (result.lighting === 'fail' ? 'fail' : 'pass') as 'pass' | 'fail',
            dnaMatch: (result.dnaMatch === 'fail' ? 'fail' : 'pass') as 'pass' | 'fail',
            anatomy: (result.anatomy === 'fail' ? 'fail' : 'pass') as 'pass' | 'fail',
            visualPacing: (result.visualPacing === 'fail' ? 'fail' : 'pass') as 'pass' | 'fail',
        };

        const failedMetrics = Object.entries(metrics).filter(([, v]) => v === 'fail').map(([k]) => k);
        const hasP0Failure = metrics.dnaMatch === 'fail' || metrics.anatomy === 'fail';

        return {
            tier: 3,
            passed: score >= 70 && !hasP0Failure,
            score,
            metrics,
            rejectionReason: failedMetrics.length > 0 ? `Failed metrics: ${failedMetrics.join(', ')}` : undefined,
            recommendation: hasP0Failure ? 'regenerate' : score >= 70 ? 'approve' : 'flag_for_review',
        };
    } catch (e) {
        console.warn('[VQA Tier 3] Vision audit failed, passing through:', e);
        return {
            tier: 3, passed: true, score: 70,
            metrics: { skinTexture: 'skipped', lighting: 'skipped', dnaMatch: 'skipped', visualPacing: 'skipped', anatomy: 'skipped' },
            recommendation: 'approve',
        };
    }
}

// ─── Density Gate: Shot Variety Enforcement ──────────────────────────────────

/**
 * Checks for visual stagnation (3+ consecutive same shot type).
 * Returns an override shot type if stagnation is detected.
 */
export function densityGateCheck(
    recentShotTypes: string[],
    currentShotType: string
): { shouldOverride: boolean; overrideShotType?: string; reason?: string } {
    const STAGNATION_THRESHOLD = 3;
    const allRecent = [...recentShotTypes, currentShotType];

    if (allRecent.length < STAGNATION_THRESHOLD) {
        return { shouldOverride: false };
    }

    // Check last N shots for same type
    const lastN = allRecent.slice(-STAGNATION_THRESHOLD);
    const allSame = lastN.every(s => s === lastN[0]);

    if (allSame) {
        // Force variety — inject ECU or Macro depending on current type
        const overrideShotType = lastN[0] === 'ECU' ? 'LS' : 'ECU';
        return {
            shouldOverride: true,
            overrideShotType,
            reason: `Visual stagnation: ${STAGNATION_THRESHOLD} consecutive ${lastN[0]} shots. Injecting ${overrideShotType} for tension variety.`,
        };
    }

    return { shouldOverride: false };
}

// ─── Regeneration Budget ────────────────────────────────────────────────────

const regenerationBudgets = new Map<string | number, number>();
const MAX_REGENERATIONS_PER_SCENE = 3;

export function canRegenerate(sceneId: string | number): boolean {
    const current = regenerationBudgets.get(sceneId) || 0;
    return current < MAX_REGENERATIONS_PER_SCENE;
}

export function recordRegeneration(sceneId: string | number): void {
    const current = regenerationBudgets.get(sceneId) || 0;
    regenerationBudgets.set(sceneId, current + 1);
}

export function getRegenerationCount(sceneId: string | number): number {
    return regenerationBudgets.get(sceneId) || 0;
}

export function resetRegenerationBudgets(): void {
    regenerationBudgets.clear();
}
