// Phase 15 G12 — Veo content-policy auto-retry helpers.
//
// Veo (and Imagen) reject prompts that trip Google's safety filters with a 400
// INVALID_ARGUMENT response whose message text mentions safety/policy/harm
// keywords. The SDK's existing retryWithBackoff only handles 429s, so today a
// content-policy rejection dead-ends the user mid-batch with an opaque error.
//
// G12 fixes this by:
//  1. detecting the policy signal (isVeoPolicyError),
//  2. asking Gemini to rewrite the visual prompt in safer terms
//     (rewriteVisualPromptForPolicy),
//  3. retrying the Veo call exactly once with the rewritten prompt.
//
// Splitting these out from gemini.ts keeps them unit-testable without dragging
// in the full SDK surface, and lets the rewriter live next to the detector.

// Heuristic: a Veo policy rejection is always a 4xx client error AND the
// message mentions a safety/policy keyword. Plain 400s from a missing field
// must not trigger a rewrite — only those that look like content-filter hits.
export function isVeoPolicyError(err: unknown): boolean {
  if (!err) return false;
  const e = err as { status?: unknown; code?: unknown; message?: unknown };
  const status = e.status;
  const code = e.code;
  const isClientError = status === 400 || code === 400 || status === 'INVALID_ARGUMENT' || code === 'INVALID_ARGUMENT';
  const msg = typeof e.message === 'string' ? e.message.toLowerCase() : '';
  const hasPolicyText =
    /\b(safety|policy|policies|content[- ]?policy|harm|harmful|blocked|violat|filtered|prohibited|sensitive content)\b/.test(msg);
  // SDK also surfaces a BLOCKED_BY_SAFETY-style finishReason on some pathways
  // without a 400. Treat that as policy regardless of status.
  const hasSafetyReason = /\b(blocked_by_safety|finish[_ ]?reason[:= ]+safety|safety[_ ]?filter)\b/.test(msg);
  return (isClientError && hasPolicyText) || hasSafetyReason;
}

// Generic orchestrator: run `runOnce(prompt)`, and if it throws what looks
// like a content-policy rejection, rewrite the prompt and run it once more.
// Any non-policy error bypasses the rewrite path. If the rewrite itself
// fails, the original policy error is re-thrown so the caller still sees
// the actionable upstream message.
export async function withPolicyRetry<T>(
  prompt: string,
  runOnce: (p: string) => Promise<T>,
  rewriter: (p: string) => Promise<string>,
  onRewrite?: (rewritten: string) => void,
): Promise<T> {
  try {
    return await runOnce(prompt);
  } catch (err) {
    if (!isVeoPolicyError(err)) throw err;
    let rewritten: string;
    try {
      rewritten = await rewriter(prompt);
    } catch {
      throw err;
    }
    onRewrite?.(rewritten);
    return await runOnce(rewritten);
  }
}

// Builds the rewrite prompt sent to the Gemini text model. Exposed so tests can
// pin the exact phrasing — drift here changes rewrite quality across releases.
export function buildRewriteInstruction(originalPrompt: string): string {
  return [
    'The following visual prompt was rejected by automated content policy filters.',
    'Rewrite it so it conveys the same visual mood and scene, but remove any references to:',
    'weapons, violence, blood, drugs, sensitive political figures, explicit imagery, or copyrighted characters.',
    'Keep the cinematography keywords (shot type, lens, lighting, color, motion).',
    'Output ONLY the rewritten prompt, with no commentary, prefix, or quotes.',
    '',
    `Original prompt: ${originalPrompt}`,
  ].join('\n');
}
