# Phase 15 G11 — Cost Estimate Pre-flight Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pre-flight confirmation modal showing a directional $ cost estimate before "Initialize Batch Manifest" fires the batch generation loop.

**Architecture:** Three units. A flat `MODEL_COSTS_USD` constants table in `constants.ts` (alongside `MODEL_NAMES`). A pure `estimateBatchCost` helper in `services/costEstimator.ts`. A presentational `BatchManifestConfirmModal` React component. `App.tsx` adds a `showBatchConfirm` state, wires both Manifest All action sites to open the modal first, and the modal's Continue button fires the existing unchanged `handleManifestAll`. New unit tests + a drift assertion gate the work via the existing `npm test` CI step.

**Tech Stack:** TypeScript, React 19, Vite, tsx + Node 20 `node:assert/strict` (existing harness), ffmpeg-static (unrelated; cited only because the test runner pattern is shared).

**Spec:** `docs/superpowers/specs/2026-05-16-phase-15-g11-cost-estimate-design.md`

---

## File Plan

| File | Status | Responsibility |
|---|---|---|
| `constants.ts` | modify | Add `MODEL_COSTS_USD` flat per-call USD rates + header comment with source + date. |
| `services/costEstimator.ts` | new | `BatchCostEstimate` interface + pure `estimateBatchCost(pendingScenes, resolution)` helper. |
| `scripts/cost-estimator.test.mts` | new | Unit tests for the estimator. |
| `scripts/smoke-helpers.test.mts` | modify | Drift assertion: every key the estimator references exists in both `MODEL_COSTS_USD` and `MODEL_NAMES`. |
| `package.json` | modify | Append the new test file to the `test` script. |
| `components/BatchManifestConfirmModal.tsx` | new | Presentational modal — scene count, breakdown, total $, runtime estimate, Cancel + Continue. |
| `App.tsx` | modify | `showBatchConfirm` state, `openBatchConfirm()` handler, rewire the two Manifest All action sites (lines 918, 926), mount the modal. |
| `scripts/MANUAL_SMOKE.md` | modify | New §7 entry for the modal open / cancel / continue flow. |

---

### Task 1: Add `MODEL_COSTS_USD` to `constants.ts`

**Files:**
- Modify: `constants.ts:1-9` (extends `MODEL_NAMES` block)

- [ ] **Step 1: Confirm Gemini pricing values**

Before editing, check current Gemini pricing at https://ai.google.dev/gemini-api/docs/pricing and Veo pricing at https://ai.google.dev/gemini-api/docs/video to source values for IMAGE, VIDEO (1080p), VIDEO_FAST (720p), TTS. If pricing isn't reachable or unclear, use these placeholders documented as such in the comment:

- IMAGE: 0.04 (gemini-3-pro-image-preview)
- VIDEO: 1.50 (veo-3.1-generate-preview, 1080p path)
- VIDEO_FAST: 0.45 (veo-3.1-fast-generate-preview, 720p path)
- TTS: 0.02 (gemini-2.5-flash-preview-tts)

- [ ] **Step 2: Add the constant**

Edit `constants.ts`. Insert immediately after the `MODEL_NAMES` closing brace (currently at line 8):

```ts
// Phase 15 G11 — directional per-call USD costs used by services/costEstimator
// to show a pre-flight estimate before the Manifest All batch fires. Keep flat
// per-call (no per-resolution or per-second modeling); the modal is for order-
// of-magnitude awareness, not accounting accuracy.
// Source: https://ai.google.dev/gemini-api/docs/pricing — as of 2026-05-16.
// Refresh when Gemini publishes new rates.
export const MODEL_COSTS_USD: Record<'IMAGE' | 'VIDEO' | 'VIDEO_FAST' | 'TTS', number> = {
  IMAGE:      0.04,
  VIDEO:      1.50,
  VIDEO_FAST: 0.45,
  TTS:        0.02,
};
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0, no output.

- [ ] **Step 4: Commit**

```bash
git add constants.ts
git commit -m "feat(phase-15): MODEL_COSTS_USD pricing constants for G11 estimator"
```

---

### Task 2: Create the pure estimator with TDD

**Files:**
- Create: `services/costEstimator.ts`
- Create: `scripts/cost-estimator.test.mts`
- Modify: `package.json:9-16` (extend `test` script)

- [ ] **Step 1: Write the failing test file**

Create `scripts/cost-estimator.test.mts`:

```ts
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
```

- [ ] **Step 2: Run to confirm it fails (module not found)**

Run: `npx tsx scripts/cost-estimator.test.mts`
Expected: ERR_MODULE_NOT_FOUND or similar — `services/costEstimator` doesn't exist yet.

- [ ] **Step 3: Create the estimator with the minimal implementation**

Create `services/costEstimator.ts`:

```ts
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
```

- [ ] **Step 4: Run to confirm tests pass**

Run: `npx tsx scripts/cost-estimator.test.mts`
Expected: all 5 tests `ok`, final line `5 passed, 0 failed`, exit 0.

- [ ] **Step 5: Wire the new test into `npm test`**

Edit `package.json:16`. Change the `test` script from:

```json
"test": "tsx scripts/smoke-helpers.test.mts && tsx scripts/lut-migration.test.mts && tsx scripts/verify-mp4-fixture.test.mts"
```

to:

```json
"test": "tsx scripts/smoke-helpers.test.mts && tsx scripts/lut-migration.test.mts && tsx scripts/cost-estimator.test.mts && tsx scripts/verify-mp4-fixture.test.mts"
```

(Insert the cost-estimator line before the slow fixture test so failures surface fast.)

- [ ] **Step 6: Run full `npm test`**

Run: `npm test`
Expected: all four suites pass, exit 0.

- [ ] **Step 7: Make the test executable + commit**

```bash
chmod +x scripts/cost-estimator.test.mts
git add services/costEstimator.ts scripts/cost-estimator.test.mts package.json
git commit -m "feat(phase-15): pure estimateBatchCost helper + unit tests"
```

---

### Task 3: Drift assertion in `scripts/smoke-helpers.test.mts`

Catches the case where someone adds a new model to `MODEL_NAMES` and the estimator stops covering it — or removes a key the estimator references.

**Files:**
- Modify: `scripts/smoke-helpers.test.mts` (append a new section near the existing LUT_PRESETS drift block)

- [ ] **Step 1: Add the drift test**

Open `scripts/smoke-helpers.test.mts`. Find the existing drift section header `// ---------- LUT_PRESETS drift (Phase 14) ----------`. After that section's closing `});`, append:

```ts
// ---------- MODEL_COSTS_USD drift (Phase 15 G11) ----------
// The estimator at services/costEstimator.ts depends on four keys from
// MODEL_COSTS_USD: IMAGE, VIDEO, VIDEO_FAST, TTS. Each of those must also
// exist in MODEL_NAMES — otherwise the estimator references a model the
// codebase no longer uses. Catches drift in both directions.
import { MODEL_COSTS_USD } from '../constants';
import { MODEL_NAMES } from '../constants';

const ESTIMATOR_REFERENCED_KEYS = ['IMAGE', 'VIDEO', 'VIDEO_FAST', 'TTS'] as const;

console.log('\nMODEL_COSTS_USD drift vs MODEL_NAMES');
test('every key the estimator references exists in MODEL_COSTS_USD', () => {
  for (const k of ESTIMATOR_REFERENCED_KEYS) {
    assert.ok(
      k in MODEL_COSTS_USD,
      `MODEL_COSTS_USD is missing required key "${k}" — the estimator depends on it`,
    );
    assert.equal(typeof MODEL_COSTS_USD[k], 'number');
    assert.ok(MODEL_COSTS_USD[k] >= 0, `MODEL_COSTS_USD["${k}"] must be ≥ 0`);
  }
});

test('every key in MODEL_COSTS_USD has a matching key in MODEL_NAMES', () => {
  for (const k of Object.keys(MODEL_COSTS_USD)) {
    assert.ok(
      k in MODEL_NAMES,
      `MODEL_COSTS_USD["${k}"] has no matching MODEL_NAMES["${k}"] — remove the price or add the model`,
    );
  }
});
```

- [ ] **Step 2: Run the smoke-helpers tests**

Run: `npx tsx scripts/smoke-helpers.test.mts`
Expected: previous 56 tests still pass, plus 2 new `ok` lines for the drift assertions. Final line: `58 passed, 0 failed`.

- [ ] **Step 3: Drift-sanity check (positive verification)**

Temporarily remove the `VIDEO_FAST` line from `MODEL_COSTS_USD` in `constants.ts`:

```ts
export const MODEL_COSTS_USD: Record<'IMAGE' | 'VIDEO' | 'VIDEO_FAST' | 'TTS', number> = {
  IMAGE:      0.04,
  VIDEO:      1.50,
  // VIDEO_FAST: 0.45,  ← removed
  TTS:        0.02,
};
```

Run: `npx tsx scripts/smoke-helpers.test.mts 2>&1 | grep -E "FAIL|passed"`

Expected: at least one FAIL line referencing `VIDEO_FAST`. The TypeScript type also complains — that's an additional layer of protection. Restore the line; re-run; confirm all pass again.

- [ ] **Step 4: Commit**

```bash
git add scripts/smoke-helpers.test.mts
git commit -m "test(phase-15): drift assertion between MODEL_COSTS_USD and MODEL_NAMES"
```

---

### Task 4: `BatchManifestConfirmModal` component

**Files:**
- Create: `components/BatchManifestConfirmModal.tsx`

- [ ] **Step 1: Create the component**

Create `components/BatchManifestConfirmModal.tsx`:

```tsx
// Phase 15 G11 — pre-flight confirmation for the Manifest All batch.
// Plain presentational React; all data comes via props. Cancel / overlay
// click close the modal with no side effects; Continue calls the parent's
// onContinue (which closes the modal and fires handleManifestAll).

import React from 'react';
import type { BatchCostEstimate } from '../services/costEstimator';

interface BatchManifestConfirmModalProps {
  estimate: BatchCostEstimate;
  runtimeMin: number;
  onCancel: () => void;
  onContinue: () => void;
}

export const BatchManifestConfirmModal: React.FC<BatchManifestConfirmModalProps> = ({
  estimate,
  runtimeMin,
  onCancel,
  onContinue,
}) => {
  // Clicking the dark overlay (outside the card) cancels; clicks inside the
  // card don't bubble out.
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onCancel();
  };

  return (
    <div
      onClick={handleOverlayClick}
      className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-eclipse-black/80 backdrop-blur-md animate-in fade-in"
    >
      <div className="glass-panel w-full max-w-md rounded-3xl overflow-hidden border-luna-gold/20 shadow-2xl p-8">
        <h2 className="text-luna-gold text-lg font-bold uppercase tracking-[0.2em] mb-4">
          Confirm Batch Manifest
        </h2>
        <p className="text-mystic-gray text-sm mb-2">
          {estimate.sceneCount} scene{estimate.sceneCount === 1 ? '' : 's'} pending
        </p>
        <p className="text-white text-2xl font-bold mb-1">
          ≈ ${estimate.totalUsd.toFixed(2)}
        </p>
        <p className="text-mystic-gray text-xs mb-4">
          {estimate.imageCount} image{estimate.imageCount === 1 ? '' : 's'} ·{' '}
          {estimate.videoCount} video{estimate.videoCount === 1 ? '' : 's'} ·{' '}
          {estimate.ttsCount} TTS call{estimate.ttsCount === 1 ? '' : 's'}
        </p>
        <p className="text-mystic-gray text-xs mb-6">
          ~{runtimeMin} min estimated runtime
        </p>
        <p className="text-mystic-gray/70 text-[10px] uppercase tracking-[0.15em] mb-6">
          Directional estimate — actual cost depends on Gemini pricing at call time.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-2xl border border-white/10 text-mystic-gray hover:text-white hover:border-white/30 transition-colors text-[10px] font-bold uppercase tracking-[0.2em]"
          >
            Cancel
          </button>
          <button
            onClick={onContinue}
            className="flex-1 py-3 rounded-2xl bg-luna-gold text-eclipse-black hover:bg-luna-gold/90 transition-colors text-[10px] font-bold uppercase tracking-[0.2em]"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0, no output.

- [ ] **Step 3: Commit**

```bash
git add components/BatchManifestConfirmModal.tsx
git commit -m "feat(phase-15): BatchManifestConfirmModal presentational component"
```

---

### Task 5: Wire the modal into `App.tsx`

**Files:**
- Modify: `App.tsx:14` (import), `App.tsx:158-162` (state region), `App.tsx:731-783` (handleManifestAll surrounding region), `App.tsx:918` + `App.tsx:926` (action rewiring), JSX render region near the bottom of the component (parallel to existing modal mounts).

- [ ] **Step 1: Add the import**

In `App.tsx`, near the top with the other component imports (currently around `import { ProductionManifest } from './components/ProductionManifest';` at line 14), add:

```tsx
import { BatchManifestConfirmModal } from './components/BatchManifestConfirmModal';
import { estimateBatchCost, type BatchCostEstimate } from './services/costEstimator';
```

- [ ] **Step 2: Add the state**

Find the existing `const [showManifest, setShowManifest] = useState(false);` declaration (line 162). On a new line immediately after it, add:

```tsx
const [batchConfirm, setBatchConfirm] = useState<{ estimate: BatchCostEstimate; runtimeMin: number } | null>(null);
```

(Single state object means open/close + payload are coupled, avoiding desync between `showConfirm=true` and a stale estimate.)

- [ ] **Step 3: Add `openBatchConfirm` handler**

Find `handleManifestAll` (declared at line 731). Immediately before its declaration, add:

```tsx
const openBatchConfirm = () => {
  if (isBatchProcessing) return;
  // Re-compute pending with the same filter handleManifestAll uses. If empty,
  // skip the modal and just log — matches the existing no-op behavior at
  // App.tsx where handleManifestAll would have logged the same thing.
  const pending = project.scenes.filter(
    scene => project.assets[scene.id]?.status !== 'complete',
  );
  if (pending.length === 0) {
    addLog('All scenes already complete — nothing to manifest.', 'system');
    return;
  }
  const estimate = estimateBatchCost(pending, resolution);
  const runtimeMin = Math.max(1, Math.ceil(pending.length * 1.5));
  setBatchConfirm({ estimate, runtimeMin });
};
```

- [ ] **Step 4: Rewire both action sites**

In the existing dashboard step block near line 918, change:

```tsx
action: { label: 'Initialize Batch Manifest', onClick: handleManifestAll },
```

to:

```tsx
action: { label: 'Initialize Batch Manifest', onClick: openBatchConfirm },
```

And at line 926, change:

```tsx
action: { label: 'Continue Batch Manifest', onClick: handleManifestAll },
```

to:

```tsx
action: { label: 'Continue Batch Manifest', onClick: openBatchConfirm },
```

Leave `handleManifestAll` itself untouched — the modal's Continue button calls it directly.

- [ ] **Step 5: Mount the modal**

Find the existing modal-mount region near the bottom of App.tsx — `{editingCharacter && <CharacterModal …/>}` at line 1275 is the pattern. Adjacent to that (e.g., on the next line), add:

```tsx
{batchConfirm && (
  <BatchManifestConfirmModal
    estimate={batchConfirm.estimate}
    runtimeMin={batchConfirm.runtimeMin}
    onCancel={() => setBatchConfirm(null)}
    onContinue={() => {
      setBatchConfirm(null);
      handleManifestAll();
    }}
  />
)}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0, no output.

- [ ] **Step 7: Run full test suite**

Run: `npm test`
Expected: all suites pass, exit 0.

- [ ] **Step 8: Manual smoke**

Start the app:

```bash
npm run dev:all
```

In the browser at `http://localhost:3000`:

1. Open a project that has at least one un-manifested scene (or create one — paste the `INITIAL_SCRIPT_PLACEHOLDER` from `constants.ts`).
2. Click **"Initialize Batch Manifest"**.
3. **Expected:** A modal opens showing the scene count, a $ figure, a runtime estimate, and Cancel + Continue buttons.
4. Click **Cancel**. **Expected:** Modal closes, no batch runs, log shows nothing new.
5. Click **"Initialize Batch Manifest"** again. Click on the dark area outside the card. **Expected:** Modal closes (overlay-click cancel).
6. Click **"Initialize Batch Manifest"** again. Click **Continue**. **Expected:** Modal closes, batch starts (existing log lines like "Batch Manifesting Sequence Initialized...").
7. With all scenes complete, click **"Initialize Master Export"** is shown instead — no modal involved.

- [ ] **Step 9: Commit**

```bash
git add App.tsx
git commit -m "feat(phase-15): wire BatchManifestConfirmModal into Manifest All flow"
```

---

### Task 6: Document the new manual smoke entry

**Files:**
- Modify: `scripts/MANUAL_SMOKE.md` (append a new §7 section)

- [ ] **Step 1: Append §7**

Open `scripts/MANUAL_SMOKE.md`. Append at the very end:

```markdown

## 7. Phase 15 G11 — Batch Manifest cost confirm modal

Verifies the pre-flight cost estimate intercepts the Manifest All click.

### 7.1 Modal opens with non-zero estimate (FREE — no Gemini calls)

1. `npm run dev:all` and open `http://localhost:3000`.
2. Open or create a project with ≥1 pending scene.
3. Click **"Initialize Batch Manifest"**.
4. **Expected:** modal shows `N scenes pending`, a `$X.XX` figure, breakdown line (`N images · N videos · N TTS calls`), runtime estimate (`~Y min`), and Cancel + Continue buttons.
5. Click **Cancel**. Modal closes, no log entry, no batch starts.
6. Re-open the modal. Click on the dark area outside the card. Same outcome.

### 7.2 Continue fires the batch (PAID — runs the real flow)

1. With the modal open, click **Continue**.
2. **Expected:** modal closes; the log shows `Batch Manifesting Sequence Initialized…`; scenes progress through the existing concurrency=2 pipeline.

### 7.3 Zero pending scenes skips the modal

1. With a project where every scene is already complete, the dashboard's call-to-action button changes to **"Initialize Master Export"** — no Manifest All button is shown. Clicking elsewhere does not open the cost modal.

### 7.4 Pricing drift sanity (automated)

Pricing constants in `constants.ts` (`MODEL_COSTS_USD`) are dated in their header comment. When Gemini publishes new rates, update the values and the date. The drift assertion in `scripts/smoke-helpers.test.mts` covers structural drift (missing or extra keys vs `MODEL_NAMES`) — value drift is by design and intentional, not gated.
```

- [ ] **Step 2: Commit**

```bash
git add scripts/MANUAL_SMOKE.md
git commit -m "docs(phase-15): MANUAL_SMOKE §7 — batch manifest cost modal smoke"
```

---

## Final Verification

After all 6 tasks land:

- [ ] **Full local green:** `npm test && npx tsc --noEmit && npx tsc --noEmit -p server/tsconfig.json && npm run build` exits 0 across the board.
- [ ] **Manual smoke (Task 5 Step 8 + Task 6 §7) walked once end-to-end on real localhost.**
- [ ] **Spec acceptance criteria checked off:**
  - Modal opens on click with pending ≥ 1 — ✓ Task 5 Step 8.3.
  - Cancel / overlay closes without side effects — ✓ Task 5 Step 8.4-5.
  - Continue runs existing flow unchanged — ✓ Task 5 Step 8.6.
  - `npm test` includes the new suite + drift assertion, all passing — ✓ Task 2 Step 6, Task 3 Step 2.
  - Zero-pending no-op preserved — ✓ Task 5 Step 3 (`addLog` then return).

## Notes

- The plan deliberately makes Task 1 stand alone (constants) so the value-confirmation step has a clean commit boundary — easy to amend pricing later without entangling unrelated changes.
- `BatchManifestConfirmModal` has no internal state and no useEffect — the simpler the modal, the less surface for regression.
- ESC-to-close was discussed in the spec but isn't implemented here; `CharacterModal` doesn't have it either, so this matches the existing codebase pattern. Overlay-click-to-cancel covers the common dismiss gesture.
