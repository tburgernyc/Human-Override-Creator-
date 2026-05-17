// Phase 15 G11 — pure pre-flight cost estimator for the Manifest All batch.
// Counts pending scenes and multiplies by flat per-call USD rates from
// MODEL_COSTS_USD. Resolution picks VIDEO vs VIDEO_FAST (mirrors the model
// selection branch in services/gemini.ts at the generateSceneVideo call site).
//
// Pure — no React, no I/O. Tested in scripts/cost-estimator.test.mts.

import { MODEL_COSTS_USD } from '../constants';
import { Resolution, type Scene } from '../types';

export interface BatchCostEstimate {
  sceneCount: number;
  imageCount: number;
  videoCount: number;
  ttsCount: number;
  totalUsd: number;
}

export function estimateBatchCost(
  pendingScenes: Scene[],
  resolution: Resolution,
): BatchCostEstimate {
  const n = pendingScenes.length;
  const videoRate =
    resolution === Resolution.FHD
      ? MODEL_COSTS_USD.VIDEO
      : MODEL_COSTS_USD.VIDEO_FAST;
  const totalRaw =
    n * MODEL_COSTS_USD.IMAGE + n * videoRate + n * MODEL_COSTS_USD.TTS;
  return {
    sceneCount: n,
    imageCount: n,
    videoCount: n,
    ttsCount: n,
    totalUsd: Number(totalRaw.toFixed(2)),
  };
}
