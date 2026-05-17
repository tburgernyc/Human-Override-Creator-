# Phase 15 G11 — Cost / Quota Estimate Before Manifest All

**Status:** Design approved 2026-05-16
**Scope:** First of three Phase 15 sub-projects (G11 only). G12 (Veo content-policy retry) and G10 (server-side render) are deferred to their own specs.

---

## Context

The "Initialize Batch Manifest" flow in `App.tsx:917` kicks off `handleManifestAll`, which iterates pending scenes at concurrency=2 and for each fires three paid API calls: image generation, Veo video, and TTS audio. A 10-scene 1080p batch easily costs a few dollars; a 30-scene batch is well into double digits. Today the user gets only a runtime hint ("Estimated runtime: ~N min") — no $ figure — and clicking the button starts the batch immediately, with no checkpoint.

The roadmap spec (`docs/superpowers/specs/2026-05-14-youtube-quality-plan.md` §G11) describes the fix as: *"Before batch generation, show an estimate: '~10 Veo calls (~$X), ~10 image gens (~$Y), ~$Z total. Continue?' Pull pricing from a constants table updated when Gemini publishes new rates."*

The goal here is to add a pre-flight modal that surfaces the directional cost and forces a deliberate confirmation before the batch runs.

## Scope

In scope:
- `MODEL_COSTS_USD` constants table in `constants.ts`, alongside `MODEL_NAMES`.
- `estimateBatchCost(pendingScenes, resolution)` pure helper in `services/costEstimator.ts`.
- `BatchManifestConfirmModal` React component that displays the estimate and the Continue / Cancel choice.
- Wiring in `App.tsx` so the existing "Initialize Batch Manifest" click opens the modal first; the existing `handleManifestAll` body only runs on Continue.
- Unit tests for the estimator + a drift assertion that every model referenced by the estimator has a price entry.

Out of scope (separate Phase 15 specs):
- **G12** — Veo content-policy auto-retry. Independent code path in `services/gemini.ts`; will get its own brainstorm.
- **G10** — Server-side headless render. Multi-day infrastructure work; deferred until scale demands it.

Out of scope (this PR):
- Per-scene cost tags on individual generate buttons (user chose Manifest All only).
- Resolution / per-scene-duration-aware Veo pricing — flat per-call rates only (user chose directional ballpark).
- Tracking actual spend after batches complete.
- Fetching live pricing from any external source.

## Architecture

Three units, each in its own file with one purpose:

### 1. `constants.ts` — `MODEL_COSTS_USD`

```
                          (number, USD per call)
MODEL_COSTS_USD: {
  IMAGE:       0.04,   // gemini-3-pro-image-preview
  VIDEO:       1.50,   // veo-3.1-generate-preview (1080p path)
  VIDEO_FAST:  0.45,   // veo-3.1-fast-generate-preview (720p path)
  TTS:         0.02,   // gemini-2.5-flash-preview-tts
}
```

- Sits next to `MODEL_NAMES` in `constants.ts`.
- Typed as `Record<keyof typeof MODEL_NAMES, number>` minus the keys the estimator doesn't reference (THINKING, CHECK) — see §Open questions.
- Header comment captures source URL + "as of YYYY-MM-DD" date so future maintainers know the values are directional and need a refresh when Gemini publishes new rates.

### 2. `services/costEstimator.ts` — pure helper

```ts
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
): BatchCostEstimate;
```

- No React, no I/O. Synchronous arithmetic.
- Counts: `imageCount = videoCount = ttsCount = pendingScenes.length` (every batch-manifested scene fires one of each per `handleGenerateSceneAsset` at `App.tsx:598-608`; TTS is called unconditionally even when `narratorLines` is empty, so we count it).
- Veo cost: `resolution === Resolution.FHD ? MODEL_COSTS_USD.VIDEO : MODEL_COSTS_USD.VIDEO_FAST` — matches the model-selection branch at `services/gemini.ts:553`.
- Returns the breakdown so the modal can show the components without re-computing.

### 3. `components/BatchManifestConfirmModal.tsx`

- Props: `{ estimate: BatchCostEstimate; runtimeMin: number; onCancel: () => void; onContinue: () => void }`.
- Renders a small fixed-position card matching the project's existing modal styling (look at `CharacterModal.tsx` for the pattern):
  - Header: "Confirm Batch Manifest"
  - Body lines:
    - "N scenes pending"
    - "≈ $X.XX  (N images · N videos · N TTS)"
    - "~Y min estimated runtime"
  - Footer: `[Cancel] [Continue]` buttons.
- ESC key and overlay click both call `onCancel`.
- Pure presentational — no fetching, no internal state beyond what's controlled by props.

### Wiring in `App.tsx`

- New state: `const [showBatchConfirm, setShowBatchConfirm] = useState(false)`.
- The existing button action at `App.tsx:917-918` changes from `onClick: handleManifestAll` to `onClick: () => openBatchConfirm()`.
- `openBatchConfirm()` computes the pending-scenes set with the same filter used inside `handleManifestAll` (`status !== 'complete'`). If it's empty, it skips the modal and just `addLog`s the existing "All scenes already complete — nothing to manifest" message — matches today's no-op behavior at `App.tsx:743-746`.
- Modal renders conditionally; on Continue it closes itself and invokes `handleManifestAll`. The body of `handleManifestAll` is unchanged.

## Data flow

```
click "Initialize Batch Manifest"
   │
   ▼
openBatchConfirm()
   │
   ├── compute pending = scenes.filter(s => assets[s.id]?.status !== 'complete')
   │
   ├── if pending.length === 0
   │      → addLog("...nothing to manifest"); return
   │
   └── estimate = estimateBatchCost(pending, resolution)
        runtimeMin = Math.max(1, Math.ceil(pending.length * 1.5))
        setShowBatchConfirm(true)  ← passes estimate, runtimeMin via state/props
   │
   ▼
<BatchManifestConfirmModal estimate runtimeMin
     onCancel = () => setShowBatchConfirm(false)
     onContinue = () => { setShowBatchConfirm(false); handleManifestAll(); }
/>
```

The pending-scenes set is computed once at modal-open time. `handleManifestAll` re-computes it internally on Continue (existing behavior) — by design, so any scenes that completed via a concurrent single-scene gen between modal open and confirm aren't re-billed. The number on the modal is a snapshot for the user; the loop's own filter is the source of truth for what actually runs.

## Error handling

There's almost nothing to fail. Enumerated cases:

| Case | Behavior |
|---|---|
| Zero pending scenes | Skip modal, addLog existing message, no state change. |
| User clicks Cancel / ESC / overlay | `setShowBatchConfirm(false)`. No side effects, no log entry. |
| User clicks Continue | Close modal, invoke `handleManifestAll`. The existing batch loop owns all downstream error handling (already in place per `App.tsx:766-770`). |
| `MODEL_COSTS_USD` missing a referenced key | Caught at typecheck — the `Record<…, number>` shape requires every referenced key. No runtime branch. |
| Pricing values out of date | Unavoidable without an external feed. Constants header comment documents source + date; this is by design per the roadmap spec. |

No retries, no network calls in the estimate path, no failure modes that need user-facing messaging.

## Testing

Three layers, all gated by the existing `npm test` CI step:

1. **`scripts/cost-estimator.test.mts`** (new) — pure unit tests for `estimateBatchCost`:
   - 0 pending scenes → all counts 0, totalUsd 0.
   - 5 pending scenes at `Resolution.FHD` → 5 images, 5 videos, 5 TTS, total = 5×(IMAGE + VIDEO + TTS).
   - 5 pending scenes at `Resolution.HD` → uses `VIDEO_FAST`; total = 5×(IMAGE + VIDEO_FAST + TTS).
   - One scene with empty `narratorLines` still counts a TTS call (matches the `handleGenerateSceneAsset` unconditional call at `App.tsx:608`).
   - Returned `totalUsd` matches hand-computed arithmetic to 2 decimal places.
2. **Drift assertion** in `scripts/smoke-helpers.test.mts`: assert that every `MODEL_COSTS_USD` key has a matching key in `MODEL_NAMES`, and that the four keys the estimator references (`IMAGE`, `VIDEO`, `VIDEO_FAST`, `TTS`) are all present in `MODEL_COSTS_USD`. Catches the case where someone adds a model to `MODEL_NAMES` and the estimator stops covering it — or where a referenced key is removed.
3. **No component test for the modal.** It's plain presentational React; the typecheck plus a manual smoke covers it. A manual smoke entry will be added to `scripts/MANUAL_SMOKE.md` describing the open/cancel/continue flow once the implementation lands.

## Files to be modified / created

| File | Status | Change |
|---|---|---|
| `constants.ts` | modify | Add `MODEL_COSTS_USD` with header comment (source + date). |
| `services/costEstimator.ts` | new | Pure `estimateBatchCost` helper + `BatchCostEstimate` interface. |
| `components/BatchManifestConfirmModal.tsx` | new | Presentational modal. |
| `App.tsx` | modify | `showBatchConfirm` state, `openBatchConfirm` handler, button rewire, modal mount. |
| `scripts/cost-estimator.test.mts` | new | Unit tests. |
| `scripts/smoke-helpers.test.mts` | modify | Drift assertion. |
| `package.json` | modify | Append `cost-estimator.test.mts` to the `test` script. |
| `scripts/MANUAL_SMOKE.md` | modify | Add a §7 "Batch Manifest cost modal" smoke entry. |

## Open questions

1. **Should the cost constants live in `constants.ts` or a separate `pricing.ts`?** Lean: `constants.ts` for now — colocated with `MODEL_NAMES`, single source of truth. If the pricing surface grows (per-resolution multipliers, per-second Veo billing) move it then. Marked here so future maintainers know the decision was deliberate.
2. **Initial values for `MODEL_COSTS_USD`.** The values in §1 are placeholders pending confirmation against Gemini's current pricing page at implementation time. Will be sourced and dated when the constants land. Order-of-magnitude is what matters (the user picked directional ballpark) — exact figures will land in the implementation PR after a fresh check.
3. **fastVeo branch when resolution selection changes mid-batch.** Today resolution is a single React state — it can't change while `handleManifestAll` is running. Not a concern. Flagged in case that changes.

## Acceptance

- Clicking "Initialize Batch Manifest" with ≥1 pending scene opens a modal showing scene count, cost breakdown, $ total, and runtime estimate.
- Cancel / ESC / overlay click closes the modal without side effects.
- Continue closes the modal and runs the existing batch flow unchanged.
- `npm test` includes the new `cost-estimator.test.mts` and the drift assertion, both passing.
- The Manifest All button's existing behavior with zero pending scenes (no-op + log) is preserved unchanged.
