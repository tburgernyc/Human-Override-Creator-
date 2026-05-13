# Human Override Creator — Workflow Optimization Design

**Date:** 2026-05-13
**Author:** Audit + optimization plan
**Scope:** End-to-end user flow from script input → final stitched video. Covers UX, pipeline orchestration, character consistency, and video stitching.

---

## 1. Executive Summary

The project ships a credible end-to-end pipeline (Gemini 3 → Veo 3.1 → multi-speaker TTS → canvas-based stitching) but has **one structural defect that breaks its central value proposition**: character reference images are never generated automatically, so the "consistent characters across scenes" promise silently degrades to "Veo's default behavior." Every other issue is secondary to this.

**Top five issues, ranked by impact:**

| # | Issue | Impact | Where |
|---|-------|--------|-------|
| 1 | Character reference images are never auto-generated after script analysis. Scene image generation silently skips characters without `referenceImageBase64`. | Character consistency feature is effectively non-functional unless the user manually opens each character modal and clicks regenerate. | `App.tsx:237-244` (no char-image step), `services/gemini.ts:424` (silent skip) |
| 2 | `ContinuityAuditor` is decorative — the "92% Match" score is a hardcoded loop, and "Force Master Sync" just appends a text suffix to scene prompts. No actual continuity comparison happens. | Users believe characters are validated when they aren't. | `components/ContinuityAuditor.tsx:67`, `App.tsx:723` |
| 3 | Renderer truncates TTS audio to `estimatedDuration` (`source.start(0, 0, durationSec)`). If the model says a 12s line in a 5s scene, half the dialogue is cut from the final export. | Major quality regression in the final stitched video. | `Renderer.tsx:386` |
| 4 | `extendSceneVideo` passes a base64 data URI where Veo expects a remote URI (`video: { uri: prevVideoUri }`). The "Extend (+7s)" feature is broken in production. | Advertised feature fails silently. | `services/gemini.ts:469-498` |
| 5 | The dashboard has **no clear "next step" prompt** at any point. Users see a 4-stage tracker that is **purely decorative** (`<div>` styled as tabs, not clickable), a Cast section with a non-functional "Add" button, and three competing CTA buttons. The "Initialize Master Export" CTA is reachable only after the user discovers they should click "Initialize Batch Manifest" first, with no guidance. | Time-to-first-render is high; new users abandon. | `App.tsx:469-480, 587, 535` |

The rest of the document expands these findings, lists ~30 additional issues, and proposes a phased plan to fix them.

---

## 2. Pipeline Walkthrough (Current State)

The intended user flow vs. what the code actually does:

```
[INTENDED]                          [ACTUAL]
1. Land on home                     → 5-section marketing wall, even for returning users
2. Paste script / generate          → Works (ScriptInput, AI Writer)
3. Click "Initialize Pipeline"      → analyzeScript: returns characters w/o reference images
4. Review characters                → CastEnsemble shows characters BUT add button is noop;
                                       voice always defaults to VOICE_PRESETS[0] regardless of model suggestion
5. (implicit) generate char refs    → MISSING STEP — user must open each character modal and
                                       hover-click the regen overlay manually
6. Batch generate scenes            → "Initialize Batch Manifest": image→video→audio per scene, sequential
                                       (slow; no concurrency)
7. Audit continuity                 → Continuity Auditor opens, shows fake "92% Match" metric
8. Mix audio / VFX                  → Audio Mixer + VFXMaster modals (work, but disconnected)
9. Master export                    → Renderer: canvas → MediaRecorder → .webm download
                                       (TTS truncated, no normalization, no MP4 option)
```

---

## 3. Findings by Area

### 3.1 Character Consistency — **CRITICAL**

| # | Finding | File:Line |
|---|---------|-----------|
| C1 | No auto-generation of character reference images after script analysis. Reference images only exist if the user manually opens each character modal and clicks the regen overlay. | `App.tsx:237-244` |
| C2 | `generateSceneImage` silently filters out characters without `referenceImageBase64` (`.filter(c => ... && c.referenceImageBase64)`). When refs are missing, the call falls through to a text-only prompt — Veo will produce a generic look, not the established character. | `services/gemini.ts:424` |
| C3 | `generateSceneVideo` receives only the scene image + prompt. Character reference images are NEVER passed to Veo, so even when the scene image is good, video animation drifts. | `services/gemini.ts:441-467` |
| C4 | Voice assignment overrides model suggestion. `analyzeScript` maps every character to `VOICE_PRESETS[0].id` (Kore Female) regardless of `synthesizeCharacterPersona`'s suggested voice. | `services/gemini.ts:395` |
| C5 | `synthesizeCharacterPersona` exists but is only invoked when OverrideBot calls `add_character` — never on initial analysis. | `App.tsx:194-206` |
| C6 | `ContinuityAuditor` "92% Match" score is hardcoded: `[...Array(5)].map((_, j) => <div className={... ${j < 4 ? 'bg-deep-sage' ...}}` — no actual matching computation runs. | `components/ContinuityAuditor.tsx:67` |
| C7 | "Force Master Sync to All Scenes" just appends `. (Reference: ${prompt})` text to every scene prompt — no image regeneration, no embedding comparison. | `App.tsx:723` |
| C8 | Multi-speaker TTS only works for exactly 2 speakers. 3+ speaker scenes fall back to per-line single-speaker calls with no shared acoustic context. | `services/gemini.ts:504` |
| C9 | `CastEnsemble`'s add button is a noop (`onAdd={() => { }}` in `App.tsx:535`). Users can't add a character outside of script analysis or OverrideBot chat. | `App.tsx:535` |
| C10 | No turnaround sheet — a single character ref image is a single angle/expression. Veo will struggle to maintain identity in side profiles, close-ups, or different lighting. | `services/gemini.ts:403-413` |

### 3.2 Video Stitching & Rendering — **HIGH**

| # | Finding | File:Line |
|---|---------|-----------|
| V1 | **TTS audio truncated to `estimatedDuration`.** `source.start(0, 0, durationSec)` cuts dialogue mid-sentence if narration is longer than scene duration. | `Renderer.tsx:386` |
| V2 | `extendSceneVideo` passes a base64 data URI (from `blobToBase64`) as `video.uri` — Veo expects a remote URI. Feature is broken. | `services/gemini.ts:475` |
| V3 | No audio normalization. TTS, 5 different public-domain music tracks from Wikimedia, ambient SFX all play at native loudness — no LUFS targeting, no master limiter. | `Renderer.tsx:294-470` |
| V4 | Output is `.webm` only. Many social platforms (X, Instagram, iOS messaging) need `.mp4`. No transcoding step. | `Renderer.tsx:22-33` |
| V5 | Music transitions are abrupt cuts on mood change. No crossfade. No ducking under TTS. | `Renderer.tsx:352-373` |
| V6 | Useless transitions on first scene. `if (p < transThreshold && prevMedia)` — for scene 0 there's no prevMedia so the transition silently no-ops, but the first 15% of scene 0 still skips applying grading/camera motion. | `Renderer.tsx:255-272` |
| V7 | `lastMedia` keeps a reference to the previous scene's `<video>` element after the scene ends, but the element is never paused or cleaned up. Memory bloat over a 5+ scene render. | `Renderer.tsx:450` |
| V8 | Renderer's useEffect depends on `mastering` and `cinematicProfile`. Adjusting an audio slider mid-render cancels and restarts the whole render. | `Renderer.tsx:470` |
| V9 | No live preview during render. Canvas is `className="hidden"`; user stares at a 0–100% spinner. | `Renderer.tsx:513` |
| V10 | Music buffer is refetched if mood changes back. No `Map<mood, AudioBuffer>` cache. | `Renderer.tsx:357-368` |
| V11 | `applyMasteringEffects` writes random noise per frame for film grain — visible flicker, not film grain. Real grain needs spatial coherence + frame-to-frame correlation. | `Renderer.tsx:231-240` |
| V12 | Vercel `/api/download` has `maxDuration: 60` and `responseLimit: '100mb'`. A 30s 1080p video may exceed both — high-res / long-form videos will fail to download in production. | `vercel.json`, `api/download.ts` |
| V13 | `MUSIC_TRACKS` point to Wikimedia Commons `.ogg` files. Some browsers (Safari especially) don't decode `.ogg` reliably via Web Audio. | `constants.ts:52-58` |
| V14 | `Player` component runs a *separate* playback path from `Renderer`. They can disagree on what the final video looks/sounds like. Player has different transition/audio logic entirely (no transitions, no VFX). | `components/Player.tsx` vs `Renderer.tsx` |

### 3.3 Pipeline Orchestration & Cost — **HIGH**

| # | Finding | File:Line |
|---|---------|-----------|
| O1 | `handleManifestAll` runs scenes strictly sequentially. With Veo at minutes per scene, a 6-scene project takes 10–20 min. Image gen and Veo polling could pipeline. | `App.tsx:344-357` |
| O2 | `activePhase` derivation never returns `'post'`. The 4th stage is dead code. | `App.tsx:119` |
| O3 | `ProductionTask[]` is populated by `analyzeScript` but never rendered anywhere. Dead state. | `services/gemini.ts:397` |
| O4 | `autoDiagnosisTriggered` only fires once per session — finishing more renders doesn't re-trigger OverrideBot. Misleading naming: `status='ready'` is set right after script analysis, far before any video exists. | `App.tsx:146-151, 240` |
| O5 | Assets stripped from localStorage on save (base64 too large), so refresh = re-generate everything. No IndexedDB. No cloud storage. | `App.tsx:127-140` |
| O6 | `handleAnalyze` swallows error details: catches and only logs `"Analysis failure."` — user has no way to see the actual error. | `App.tsx:243` |
| O7 | `retryWithBackoff` only applied to `analyzeScript`. Image gen, video gen, and TTS calls have no retry on rate limits. | `services/gemini.ts:56-80, 387` |
| O8 | No cancel button on long-running operations. Once you click "Initialize Batch Manifest," there's no way to stop it. | `App.tsx:344-357` |
| O9 | `youtubeMetadata` is local component state, lost on archive reload. Should live on `ProjectState`. | `App.tsx:114, 241` |
| O10 | `ProjectState.tasks`, `mastering.bloomIntensity`, etc. are all snapshot at create time — when `DEFAULT_PROJECT` schema changes, old archives crash silently. No migration. | `App.tsx:51-59, 75-83` |
| O11 | `KEY_ART` is a Master Style Reference, but the same `styleRef` is passed for every scene image gen call — meaning the first complete scene's image biases ALL subsequent images. Compounds drift if first scene is off. | `App.tsx:262-267` |
| O12 | `productionSeed` is reused across image, video, TTS calls. Same seed across modalities doesn't help with cross-modality consistency and can hurt variety on retakes. | `services/gemini.ts:221, 257, 284, 391, 408, 434` |
| O13 | Errors in `handleGenerateSceneAsset` mark the entire scene as `'error'` even if only audio failed mid-way — actually wait, audio failure is non-fatal but the asset gets stuck in `'generating_audio'` if video succeeded but throws after. Re-reading shows audio failure is caught but visual path is preserved — OK. But the surrounding catch (line 301) sets status=error which loses partial progress. | `App.tsx:246-305` |

### 3.4 User Flow & UX Friction — **HIGH**

| # | Finding | File:Line |
|---|---------|-----------|
| U1 | LandingPage is 5 marketing sections. Returning users see it every reload (initial view is computed from whether `script` is set, so a fresh archived-project load actually goes to dashboard — OK, but new users still hit a wall). | `components/LandingPage.tsx` |
| U2 | **Stage Tracker tabs are not clickable.** They're `<div>` elements styled like tabs (`'01 Genesis', '02 Manifest', '03 Synthesis', '04 Post'`). Users try to click them; nothing happens. | `App.tsx:469-480` |
| U3 | **No "next step" hint anywhere on the dashboard.** After script analysis, the user is shown: CastEnsemble + Audit panel + ProductionTimeline + Storyboard/AssetRegistry/Manifest buttons + Scene Cards + VFX Master button + YouTube Optimizer + Pre-Production Review + Master Export. There is no obvious primary action. | `App.tsx:451-672` |
| U4 | **Modal soup.** 13+ modals managed by individual `useState<boolean>` toggles: CharacterModal, SceneInspector, AssetLibrary, AudioMixer, ContinuityAuditor, DirectorialDeck, BRoll, Storyboard, ScriptDoctor, VFXMaster, DirectorDraft, Player, Renderer, ProductionManifest, Mastering. No escape-to-close, no consistent z-index, no shared close button. | `App.tsx:96-115, 718-732` |
| U5 | Scene cards have **9+ interactive elements** per card: take menu, take selector, edit, regen, extend, inspect, clear, delete, duplicate, move-prev, move-next, set-key-art, audio play. Cognitive overload. | `components/SceneCard.tsx:293-326` |
| U6 | `CastEnsemble` "Add" button does nothing (`onAdd={() => {}}`). | `App.tsx:535` |
| U7 | "Run Continuity Scan" button calls `performFullAudit` which dumps text into OverrideBot chat — but the chat sidebar is hidden by default and not auto-opened on success. User clicks the button and sees nothing change. | `App.tsx:170-182` |
| U8 | "Pre-Production Review" (Player) shows ONE scene at a time with thumbnails — not what the final stitched output will look like. Name is misleading; behavior is unclear. | `App.tsx:660, components/Player.tsx` |
| U9 | `Renderer` shows only "Initializing Pipeline..." → spinner → done. No mini-preview, no per-scene progress, no ETA. | `Renderer.tsx:495-512` |
| U10 | No global toast/error system. Errors funnel through `addLog` → buried in a 5-line right-sidebar console that's only visible when chat is open. | `App.tsx:153-156, 700-710` |
| U11 | Footer links (Documentation, API Status, Support) are `href="#"` with `title="Coming soon"`. Looks like broken links. | `components/Layout.tsx:122-124` |
| U12 | Status label `'ready'` is set right after script analysis — but the project is not "ready" in any meaningful sense (no assets generated). Misleads users into clicking Master Export. The Export button is gated by `isAllComplete`, so it's a soft-gate — but the badge in the header pill ("Neural Health · 4/5 bars") implies system health is great when no assets exist. | `App.tsx:240` |
| U13 | Asset Library, Storyboard View, Production Manifest — three different views of essentially the same scene list. Redundant. | `App.tsx:563-574` |
| U14 | `Mastering` modal (VFXMaster) and AudioMixer have overlapping responsibilities — volume sliders appear in both. | Multiple |
| U15 | Saved projects don't restore `youtubeMetadata`, `viralData`, or `keyArtSceneId` properly. | `App.tsx:74-83, 114` |
| U16 | No mobile usability. Many `hidden md:block`, `xl:col-span`. Mobile users see severely degraded UI. | `components/Layout.tsx`, `App.tsx` |

---

## 4. Optimization Plan

The plan is split into four phases, ordered so each phase delivers visible value and each builds on the previous one. Total estimated effort assumes one developer working full-time.

### Phase 1 — Make Character Consistency Actually Work (1–2 days)

**Goal:** The product's headline feature works end-to-end without manual intervention.

1. **P1.1 — Auto-generate character reference images after script analysis.**
   In `handleAnalyze`, after `analyzeScript` returns, immediately call `generateCharacterImage` for each character in parallel (`Promise.all`) and write `referenceImageBase64` back into `project.characters` before transitioning to `'ready'`. Show a "Synthesizing Cast" step in the loading overlay.
   - Files: `App.tsx:231-244`, `services/gemini.ts:403-413`
   - Risk: increases time-to-first-scene by ~10–20s (image gen latency × characters). Mitigation: parallel + skeleton UI.

2. **P1.2 — Wire `synthesizeCharacterPersona` into the script-analysis path.**
   Use the model's `suggestedVoiceId` instead of always defaulting to `VOICE_PRESETS[0]`. Adds variety automatically.
   - Files: `services/gemini.ts:395`

3. **P1.3 — Make `CastEnsemble` "Add Character" actually work.**
   Wire `onAdd` to a small modal that takes name + gender + description, then runs `synthesizeCharacterPersona` and `generateCharacterImage`.
   - Files: `App.tsx:535`, possibly new component or extend `CharacterModal`

4. **P1.4 — Pass character refs into Veo video generation.**
   `generateSceneVideo` currently accepts only the scene image. Extend its signature to optionally accept character refs as additional images. Per Veo 3.1 docs, multi-image conditioning is supported via the SDK's `imageBytes` array. Update the call site in `handleGenerateSceneAsset` to pass refs for characters in the scene.
   - Files: `services/gemini.ts:441-467`, `App.tsx:267-272`

5. **P1.5 — Replace fake `ContinuityAuditor` metrics with real ones.**
   Two options:
   - **Cheap:** compute a Gemini-judged similarity score — pass the character reference image + the scene image to `gemini-3-flash-preview` with a "rate 0–100 how visually consistent these are" prompt. Cache per (character, scene) pair.
   - **Robust:** generate CLIP-style embeddings via a separate embedding model and compute cosine similarity. More work; deferred.

   For Phase 1, ship the cheap version. Display real scores, not hardcoded ones.
   - Files: `components/ContinuityAuditor.tsx:67`, `services/gemini.ts` (new function)

6. **P1.6 — Generate a character turnaround sheet (optional, time-permitting).**
   Instead of a single front-facing portrait, generate 3 angles per character (front / 3-quarter / profile) and pass all three to scene gen. Significant uplift to identity persistence.
   - Files: `services/gemini.ts:403-413`

### Phase 2 — Streamline the User Flow (1 day)

**Goal:** A new user can produce a finished video in 4 clicks without confusion.

1. **P2.1 — Add a primary "Next Step" CTA that updates with project state.**
   Single sticky banner above the scene grid: "Step 1: Review your cast" → "Step 2: Generate all scenes (≈8 min)" → "Step 3: Export final video." Drive it off `activePhase` (fixed first).
   - Files: `App.tsx:451-672`

2. **P2.2 — Make stage tabs actually navigate.**
   Convert the `<div>` stage tracker into `<button>` elements that scroll-into-view to the corresponding section. Add `'post'` to `activePhase` derivation when render completes.
   - Files: `App.tsx:119, 469-480`

3. **P2.3 — Collapse "Asset Library / Storyboard / Manifest" three buttons into one.**
   Single "View All Assets" modal with tabs. Reduces button noise.
   - Files: `App.tsx:563-574`

4. **P2.4 — Replace 13 separate `useState<boolean>` modal toggles with a `useReducer`-managed modal stack.**
   Add escape-to-close and consistent z-index. Reduces App.tsx complexity.
   - Files: `App.tsx:96-115, 718-732`

5. **P2.5 — Toast notification system.**
   Replace the "Live Console" buried in the sidebar with a global `Toast` component. Errors and successes surface immediately, top-right corner.
   - Files: `App.tsx:153-156`, new `Toast.tsx`

6. **P2.6 — Cancel button on batch operations.**
   Add a "Cancel Pipeline" button visible during `isBatchProcessing`. Hold an `AbortController` ref in App, signal it on cancel, check it between scene iterations.
   - Files: `App.tsx:344-357`

7. **P2.7 — Show concrete progress in `Renderer`.**
   Replace the hidden canvas with a visible mini-canvas preview during render. Show "Scene 3/7" + ETA based on observed frame rate.
   - Files: `Renderer.tsx:495-513`

8. **P2.8 — Fix misleading status labels.**
   `'ready'` should mean "ready to export" not "ready to start." Add a separate `'analyzed'` status. Rename the "Neural Health" indicator to something tied to actual asset completion.
   - Files: `App.tsx:119, types.ts:135`

### Phase 3 — Fix Video Stitching Quality (1–2 days)

**Goal:** The exported video matches the quality the marketing copy promises.

1. **P3.1 — Stop truncating TTS to scene duration.**
   In Renderer, extend scene duration to `max(scene.estimatedDuration, audioDuration + 0.5s)` instead of cutting audio short. Optionally, run a pre-render pass that adjusts `estimatedDuration` for each scene based on its actual TTS length.
   - Files: `Renderer.tsx:386, 347-348`

2. **P3.2 — Audio normalization & ducking.**
   - Pre-decode each TTS clip → compute peak/RMS → normalize to a target LUFS (-16 LUFS for YouTube).
   - Add a sidechain compressor: bg music gain ducked by -8 dB whenever TTS is active.
   - Hard-clip prevention: insert a `DynamicsCompressorNode` as the master before destination.
   - Files: `Renderer.tsx:294-470`

3. **P3.3 — Music crossfades.**
   On mood change, fade out the current music over 1s while fading in the next track. Cache decoded buffers in `Map<mood, AudioBuffer>`.
   - Files: `Renderer.tsx:352-373`

4. **P3.4 — MP4 export option.**
   After MediaRecorder produces .webm, optionally run `ffmpeg.wasm` (or a small Vercel function with ffmpeg) to transcode to MP4 H.264 for social compatibility. Initially: just label the .webm download clearly and provide a "Get MP4" button that transcodes on demand.
   - Files: `Renderer.tsx:329-333`

5. **P3.5 — Fix `extendSceneVideo`.**
   Veo extension needs the operation's *URI*, not a downloaded base64. Either:
   - Store the original `videoUri` (pre-download) on the asset and use that for extension, or
   - Re-upload the base64 to a temp URI before calling extend.
   The cleanest fix is option 1: keep `videoUri` alongside `videoUrl` in the asset state.
   - Files: `services/gemini.ts:469-498`, `App.tsx:307-336`, `types.ts:105-115`

6. **P3.6 — Clean up media elements between scenes in Renderer.**
   Pause + clear src + remove from DOM after each scene. Stops memory leaks.
   - Files: `Renderer.tsx:450`

7. **P3.7 — Remove `mastering` and `cinematicProfile` from Renderer's useEffect deps.**
   Read them via ref so slider changes don't restart the render. Surface them as a "post-process" pass that re-runs only the canvas filter chain, not the whole video.
   - Files: `Renderer.tsx:470`

8. **P3.8 — Better film grain.**
   Pre-generate 4 grain plates (1080p PNGs of monochromatic noise), cycle through them, and blend with `globalCompositeOperation = 'overlay'`. Replaces the random per-pixel scatter.
   - Files: `Renderer.tsx:231-240`

### Phase 4 — Orchestration, Cost & Persistence (1 day)

**Goal:** Make the pipeline production-grade: faster, cheaper, recoverable.

1. **P4.1 — Pipeline parallelism.**
   Image generation can run for all scenes in parallel (limited to ~3 concurrent to respect rate limits). Video operations are long-poll; start all polls concurrently and progress them via `Promise.allSettled`. Audio is independent and can start as soon as text is known — no need to wait for video.
   - Files: `App.tsx:344-357`, possibly extract to `services/pipeline.ts`

2. **P4.2 — IndexedDB-backed asset storage.**
   Replace the localStorage-strip-assets pattern with IndexedDB. Reload restores everything. Use a small wrapper like `idb-keyval` or hand-rolled.
   - Files: `App.tsx:62-83, 127-140`

3. **P4.3 — Surface real errors.**
   `handleAnalyze`'s catch swallows the error. Propagate the error message into the toast system from P2.5.
   - Files: `App.tsx:231-244, all `catch` blocks

4. **P4.4 — Apply `retryWithBackoff` to all generation calls.**
   Image gen, video gen, TTS — wrap in retryWithBackoff at the service layer.
   - Files: `services/gemini.ts:387, 405, 443, 515, 538`

5. **P4.5 — Vercel function limits.**
   `/api/download` proxies the entire video body through Vercel — 60s + 100MB is tight. Options:
   - Issue signed Google URLs from a function and let the client download directly (preferred).
   - Increase Vercel limits (Pro plan).
   - Stream chunked, exit early on timeout.
   - Files: `api/download.ts`, `vercel.json`

6. **P4.6 — Schema migration for archived projects.**
   When loading from `ALL_PROJECTS_KEY`, run a version check and apply migrations for new fields (`mastering`, `cinematicProfile`, `viralData`). Avoid silent crashes.
   - Files: `App.tsx:74-83`

7. **P4.7 — Move `youtubeMetadata` onto `ProjectState`.**
   Currently component-local; lost on archive reload.
   - Files: `App.tsx:114`, `types.ts:134`

8. **P4.8 — Multi-character TTS for 3+ speakers.**
   Gemini's multi-speaker TTS supports >2 speakers in beta. Use it when available; otherwise stitch single-speaker calls with proper inter-line silence (~150ms) and equal gain.
   - Files: `services/gemini.ts:500-558`

---

## 5. Out of Scope (Deferred)

- Mobile-responsive redesign (P2 partial mention but full responsive layout is its own project).
- Replacing the marketing landing page (sales-driven decision, not engineering).
- Real CLIP-style continuity embeddings (Phase 1.5 ships cheap version).
- ffmpeg.wasm full integration vs. server-side transcoding tradeoff (covered briefly in P3.4).
- VFX presets library expansion.

---

## 6. Implementation Order & Stopping Points

The phases are also natural stopping points for user review:

1. **After Phase 1** — User sees consistent characters in their scenes for the first time. If this works, the rest is polish.
2. **After Phase 2** — User can finish a project without help. Validate with a fresh-eyes user test.
3. **After Phase 3** — Exported video matches the in-app preview. Audio quality is presentable.
4. **After Phase 4** — Production-ready: recoverable from refresh, surfaces real errors, faster end-to-end.

Within each phase, items are listed roughly in order of impact-per-effort. The plan recommends implementing P1.1–P1.4 first (the absolute critical path), then surfacing for user feedback before moving to fakes/diagnostics (P1.5, P1.6).
