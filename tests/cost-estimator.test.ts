import { describe, it, expect } from 'vitest';
import { estimateBatchCost } from '../services/costEstimator';
import { MODEL_COSTS_USD } from '../constants';
import { Resolution, type Scene } from '../types';

const makeScene = (id: string, overrides: Partial<Scene> = {}): Scene => ({
  id,
  description: '',
  visualPrompt: '',
  charactersInScene: [],
  narratorLines: [],
  estimatedDuration: 5,
  musicMood: 'calm',
  ...overrides,
});

describe('estimateBatchCost — pure arithmetic', () => {
  it('zero pending scenes → all counts zero, totalUsd zero', () => {
    expect(estimateBatchCost([], Resolution.FHD)).toEqual({
      sceneCount: 0,
      imageCount: 0,
      videoCount: 0,
      ttsCount: 0,
      totalUsd: 0,
    });
  });

  it('5 FHD scenes → uses VIDEO rate, all counts 5', () => {
    const scenes = [1, 2, 3, 4, 5].map(n => makeScene(`s${n}`));
    const got = estimateBatchCost(scenes, Resolution.FHD);
    const expected = 5 * MODEL_COSTS_USD.IMAGE + 5 * MODEL_COSTS_USD.VIDEO + 5 * MODEL_COSTS_USD.TTS;
    expect(got.sceneCount).toBe(5);
    expect(got.imageCount).toBe(5);
    expect(got.videoCount).toBe(5);
    expect(got.ttsCount).toBe(5);
    expect(got.totalUsd).toBe(Number(expected.toFixed(2)));
  });

  it('5 HD scenes → uses VIDEO_FAST rate', () => {
    const scenes = [1, 2, 3, 4, 5].map(n => makeScene(`s${n}`));
    const got = estimateBatchCost(scenes, Resolution.HD);
    const expected = 5 * MODEL_COSTS_USD.IMAGE + 5 * MODEL_COSTS_USD.VIDEO_FAST + 5 * MODEL_COSTS_USD.TTS;
    expect(got.totalUsd).toBe(Number(expected.toFixed(2)));
  });

  it('scene with empty narratorLines still counts a TTS call (matches handleGenerateSceneAsset)', () => {
    // App.tsx calls generateSceneAudio unconditionally during a batch manifest,
    // so the estimator counts TTS per scene regardless of narratorLines length.
    // This pins that behavior.
    const scenes = [makeScene('s1', { narratorLines: [] })];
    expect(estimateBatchCost(scenes, Resolution.FHD).ttsCount).toBe(1);
  });

  it('totalUsd is rounded to 2 decimal places', () => {
    const scenes = [makeScene('a'), makeScene('b'), makeScene('c')];
    const got = estimateBatchCost(scenes, Resolution.FHD);
    const decimals = (got.totalUsd.toString().split('.')[1] ?? '').length;
    expect(decimals).toBeLessThanOrEqual(2);
    const expected = Number(
      (3 * MODEL_COSTS_USD.IMAGE + 3 * MODEL_COSTS_USD.VIDEO + 3 * MODEL_COSTS_USD.TTS).toFixed(2)
    );
    expect(got.totalUsd).toBe(expected);
  });
});
