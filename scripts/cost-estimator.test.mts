#!/usr/bin/env -S npx tsx
// Pure-arithmetic unit tests for the Phase 15 G11 cost estimator.
// Run with: npx tsx scripts/cost-estimator.test.mts

import assert from 'node:assert/strict';
import { estimateBatchCost } from '../services/costEstimator';
import { MODEL_COSTS_USD } from '../constants';
import { Resolution, type Scene } from '../types';

let passed = 0, failed = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); console.log(`  ok  ${name}`); passed++; }
  catch (e: any) { console.log(`  FAIL  ${name}\n    ${e.message}`); failed++; }
};

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

console.log('\nestimateBatchCost — pure arithmetic');

test('zero pending scenes → all counts zero, totalUsd zero', () => {
  const got = estimateBatchCost([], Resolution.FHD);
  assert.deepEqual(got, {
    sceneCount: 0,
    imageCount: 0,
    videoCount: 0,
    ttsCount: 0,
    totalUsd: 0,
  });
});

test('5 FHD scenes → uses VIDEO rate, all counts 5', () => {
  const scenes = [1, 2, 3, 4, 5].map(n => makeScene(`s${n}`));
  const got = estimateBatchCost(scenes, Resolution.FHD);
  const expected =
    5 * MODEL_COSTS_USD.IMAGE +
    5 * MODEL_COSTS_USD.VIDEO +
    5 * MODEL_COSTS_USD.TTS;
  assert.equal(got.sceneCount, 5);
  assert.equal(got.imageCount, 5);
  assert.equal(got.videoCount, 5);
  assert.equal(got.ttsCount, 5);
  assert.equal(got.totalUsd, Number(expected.toFixed(2)));
});

test('5 HD scenes → uses VIDEO_FAST rate', () => {
  const scenes = [1, 2, 3, 4, 5].map(n => makeScene(`s${n}`));
  const got = estimateBatchCost(scenes, Resolution.HD);
  const expected =
    5 * MODEL_COSTS_USD.IMAGE +
    5 * MODEL_COSTS_USD.VIDEO_FAST +
    5 * MODEL_COSTS_USD.TTS;
  assert.equal(got.totalUsd, Number(expected.toFixed(2)));
});

test('scene with empty narratorLines still counts a TTS call (matches handleGenerateSceneAsset)', () => {
  // App.tsx:608 calls generateSceneAudio unconditionally during a batch
  // manifest, so the estimator counts TTS per scene regardless of
  // narratorLines length. This test pins that behavior.
  const scenes = [makeScene('s1', { narratorLines: [] })];
  const got = estimateBatchCost(scenes, Resolution.FHD);
  assert.equal(got.ttsCount, 1);
});

test('totalUsd is rounded to 2 decimal places', () => {
  const scenes = [makeScene('a'), makeScene('b'), makeScene('c')];
  const got = estimateBatchCost(scenes, Resolution.FHD);
  // No more than 2 decimal digits.
  const decimals = (got.totalUsd.toString().split('.')[1] ?? '').length;
  assert.ok(decimals <= 2, `expected ≤2 decimals, got ${decimals} (${got.totalUsd})`);
  // And the rounded value equals what we'd compute by hand from the constants.
  const expected = Number(
    (3 * MODEL_COSTS_USD.IMAGE + 3 * MODEL_COSTS_USD.VIDEO + 3 * MODEL_COSTS_USD.TTS).toFixed(2)
  );
  assert.equal(got.totalUsd, expected);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
