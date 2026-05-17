import { describe, it, expect, vi } from 'vitest';
import { isVeoPolicyError, buildRewriteInstruction, withPolicyRetry } from '../services/veoPolicyRetry';

const makePolicyError = () => Object.assign(new Error('content policy violation'), { status: 400 });
const makeNonPolicyError = () => Object.assign(new Error('Veo submission timed out after 60s'));

describe('isVeoPolicyError — positive cases', () => {
  it('detects 400 + "safety" keyword', () => {
    expect(isVeoPolicyError({ status: 400, message: 'Request was blocked by Google safety filters.' })).toBe(true);
  });
  it('detects 400 + "content policy" phrasing', () => {
    expect(isVeoPolicyError({ status: 400, message: 'The request violates our content policy.' })).toBe(true);
  });
  it('detects 400 + "blocked"', () => {
    expect(isVeoPolicyError({ status: 400, message: 'Generation blocked.' })).toBe(true);
  });
  it('detects 400 + "violates" (the verb form)', () => {
    expect(isVeoPolicyError({ status: 400, message: 'Prompt violates safety policies.' })).toBe(true);
  });
  it('detects 400 + "filtered"', () => {
    expect(isVeoPolicyError({ status: 400, message: 'Output was filtered by safety review.' })).toBe(true);
  });
  it('accepts code-only signal (no status field)', () => {
    expect(isVeoPolicyError({ code: 400, message: 'safety check rejected this prompt' })).toBe(true);
  });
  it('accepts INVALID_ARGUMENT status string + keyword', () => {
    expect(isVeoPolicyError({ status: 'INVALID_ARGUMENT', message: 'Harmful content detected.' })).toBe(true);
  });
  it('detects finishReason=safety without a 400', () => {
    expect(isVeoPolicyError({ status: 200, message: 'finishReason: SAFETY' })).toBe(true);
  });
});

describe('isVeoPolicyError — negative cases', () => {
  it('returns false for null/undefined', () => {
    expect(isVeoPolicyError(null)).toBe(false);
    expect(isVeoPolicyError(undefined)).toBe(false);
  });
  it('returns false for 429 rate limit', () => {
    expect(isVeoPolicyError({ status: 429, message: 'quota exceeded' })).toBe(false);
  });
  it('returns false for 500 server errors', () => {
    expect(isVeoPolicyError({ status: 500, message: 'Internal error' })).toBe(false);
  });
  it('returns false for a 400 with no policy keyword (e.g. missing field)', () => {
    expect(isVeoPolicyError({ status: 400, message: 'Invalid argument: aspectRatio must be 16:9 or 9:16' })).toBe(false);
  });
  it('returns false for timeout errors (no status, no keyword)', () => {
    expect(isVeoPolicyError({ message: 'Veo submission timed out after 60s' })).toBe(false);
  });
  it('returns false for a plain Error with no shape', () => {
    expect(isVeoPolicyError(new Error('something broke'))).toBe(false);
  });
});

describe('withPolicyRetry — orchestration', () => {
  it('returns the first-attempt value when there is no error (no rewrite needed)', async () => {
    const runOnce = vi.fn().mockResolvedValue('ok');
    const rewriter = vi.fn();
    const onRewrite = vi.fn();
    const out = await withPolicyRetry('original', runOnce, rewriter, onRewrite);
    expect(out).toBe('ok');
    expect(runOnce).toHaveBeenCalledTimes(1);
    expect(runOnce).toHaveBeenCalledWith('original');
    expect(rewriter).not.toHaveBeenCalled();
    expect(onRewrite).not.toHaveBeenCalled();
  });

  it('rewrites and retries when the first attempt throws a policy error', async () => {
    const runOnce = vi.fn()
      .mockRejectedValueOnce(makePolicyError())
      .mockResolvedValueOnce('recovered');
    const rewriter = vi.fn().mockResolvedValue('safer prompt');
    const onRewrite = vi.fn();

    const out = await withPolicyRetry('unsafe prompt', runOnce, rewriter, onRewrite);

    expect(out).toBe('recovered');
    expect(runOnce).toHaveBeenCalledTimes(2);
    expect(runOnce).toHaveBeenNthCalledWith(1, 'unsafe prompt');
    expect(runOnce).toHaveBeenNthCalledWith(2, 'safer prompt');
    expect(rewriter).toHaveBeenCalledWith('unsafe prompt');
    expect(onRewrite).toHaveBeenCalledWith('safer prompt');
  });

  it('does NOT retry on a non-policy error', async () => {
    const err = makeNonPolicyError();
    const runOnce = vi.fn().mockRejectedValueOnce(err);
    const rewriter = vi.fn();
    await expect(withPolicyRetry('anything', runOnce, rewriter)).rejects.toBe(err);
    expect(runOnce).toHaveBeenCalledTimes(1);
    expect(rewriter).not.toHaveBeenCalled();
  });

  it('re-throws the ORIGINAL policy error when the rewriter itself fails', async () => {
    const policyErr = makePolicyError();
    const runOnce = vi.fn().mockRejectedValueOnce(policyErr);
    const rewriter = vi.fn().mockRejectedValueOnce(new Error('rewriter SDK down'));
    await expect(withPolicyRetry('p', runOnce, rewriter)).rejects.toBe(policyErr);
    // runOnce only called once (the retry doesn't happen if rewrite fails)
    expect(runOnce).toHaveBeenCalledTimes(1);
  });

  it('bubbles a non-policy error from the second attempt as-is', async () => {
    const secondErr = new Error('downstream 500');
    const runOnce = vi.fn()
      .mockRejectedValueOnce(makePolicyError())
      .mockRejectedValueOnce(secondErr);
    const rewriter = vi.fn().mockResolvedValue('rewritten');
    await expect(withPolicyRetry('p', runOnce, rewriter)).rejects.toBe(secondErr);
    expect(runOnce).toHaveBeenCalledTimes(2);
  });

  it('does NOT call onRewrite if the rewriter throws', async () => {
    const onRewrite = vi.fn();
    const runOnce = vi.fn().mockRejectedValueOnce(makePolicyError());
    const rewriter = vi.fn().mockRejectedValueOnce(new Error('boom'));
    await expect(withPolicyRetry('p', runOnce, rewriter, onRewrite)).rejects.toBeDefined();
    expect(onRewrite).not.toHaveBeenCalled();
  });
});

describe('buildRewriteInstruction', () => {
  it('embeds the original prompt verbatim', () => {
    const got = buildRewriteInstruction('A detective drawing a gun in the rain');
    expect(got).toContain('A detective drawing a gun in the rain');
  });
  it('mentions the forbidden categories we want stripped', () => {
    const got = buildRewriteInstruction('anything');
    expect(got).toMatch(/weapons|violence/);
  });
  it('requires the model to return only the rewritten prompt', () => {
    const got = buildRewriteInstruction('anything');
    expect(got).toMatch(/ONLY the rewritten prompt/);
  });
});
