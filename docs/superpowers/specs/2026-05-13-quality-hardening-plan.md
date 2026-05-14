# Quality Hardening — Follow-up Plan

**Date:** 2026-05-13
**Author:** Post-Phase-4 audit
**Scope:** Bugs, quality losses, and reliability gaps not addressed by the original 4-phase optimization plan.

The original audit prioritized the catastrophic structural defects (character consistency was non-functional, rendering had multiple correctness bugs, deploy was Vercel-only). With those fixed, this document inventories what remains — issues that will either degrade output quality below "looks professional" or eventually crash the pipeline on a real production load.

---

## 1. Confirmed Bugs (will break or silently degrade)

### B1. **Ambient SFX never plays** — DEAD FEATURE
- `AMBIENT_TRACKS` is declared at `Renderer.tsx:8-14` and never referenced again.
- `Scene.ambientSfx` (rain / city_hum / wind / space_drone / data_stream) is set by `analyzeScript` and editable in `SceneInspector`, but the value reaches the renderer and does nothing.
- **Impact:** A feature the UI advertises (ambient atmosphere per scene) produces zero audio. Users wonder why their "rain" scene sounds dry.
- **Fix:** Wire `AMBIENT_TRACKS[scene.ambientSfx]` into a third gain bus parallel to bg music + TTS. Crossfade between ambient tracks on scene change like music. Respect `scene.sfxVolume` (already in the type but unused).

### B2. **Multi-speaker TTS ignores user voice settings** — SILENT QUALITY LOSS
- `generateSceneAudio` line ~595 — for 2-5 speakers it uses `prebuiltVoiceConfig.voiceName` only. The user's `voiceSettings.speed` and `voiceSettings.pitch` from CharacterModal are **only applied** in the per-line fallback branch via `<prosody>` SSML.
- **Impact:** Users tweak a character's pitch/speed expecting it to affect dialogue. In any 2-speaker scene (the common case), those tweaks do nothing.
- **Fix:** Either (a) wrap each speaker's lines in `<prosody>` tags before joining for the multi-speaker prompt, or (b) emit a warning and force-fallback to per-line synthesis whenever any character in scene has non-default voice settings.

### B3. **Audio context at 24kHz downsamples background music** — QUALITY LOSS
- Every `new AudioContext({ sampleRate: 24000 })` in `Renderer.tsx`, `Player.tsx`, `SceneCard.tsx`, `CharacterModal.tsx`.
- 24kHz matches Gemini's TTS output, so TTS sounds correct. But Wikimedia Commons music tracks are typically 44.1kHz — `decodeAudioData` resamples them down to 24kHz, throwing away upper octaves.
- **Impact:** Music sounds muffled, especially the cymbals/strings in the classical tracks. Recorded video output also sounds dated.
- **Fix:** Run the audio context at 48kHz (video standard). TTS at 24kHz upsamples cleanly via the existing decoder; music keeps its full bandwidth.

### B4. **MediaRecorder has no `timeslice`** — DATA LOSS RISK
- `recorder.start()` at `Renderer.tsx:~336` — without a timeslice argument, `ondataavailable` only fires when the recorder stops. If the tab crashes or `recorder.stop()` is never reached (cancel, error mid-loop), **the entire recording is lost**.
- **Fix:** `recorder.start(1000)` — chunks every second. Even on crash, chunks already-emitted are recoverable.

### B5. **`computeBitrate` is conservative** — QUALITY LOSS at 1080p
- `Renderer.tsx:37-40` — `0.1 bits per pixel-second` → 1920×1080×30×0.1 ≈ 6.2 Mbps. YouTube recommends 8 Mbps minimum for 1080p30, 12 Mbps for 1080p60. The output is technically valid but visibly soft on detail-heavy scenes.
- **Fix:** Raise to 0.15 bpps (≈ 9.3 Mbps for 1080p30). Ceiling stays at 20 Mbps.

### B6. **Cinematic profile filters are decorative, not real LUTs**
- `applyGrading` at `Renderer.tsx:92-113` uses CSS canvas filters (`sepia()`, `contrast()`, `hue-rotate()`) to approximate Kodak 5219, Fuji 400H, Technicolor, etc. Real LUTs are 3D color lookup cubes — these CSS approximations look like Instagram filters, not film stocks.
- **Impact:** "Vintage" mode looks washed-out tan instead of warm filmic. "Technicolor" just oversaturates.
- **Fix:** Two options — (a) ship .cube LUT files and apply them via a WebGL pass to canvas (heavy), or (b) downgrade the labels and presets to match what the filters actually do ("Warm Sepia", "Boosted Saturation", "Black & White High Contrast"). Recommend (b) for honesty.

### B7. **Random per-pixel grain looks like dropout, not grain**
- `applyMasteringEffects` at `Renderer.tsx:257-267` paints 5 random pixels per frame at random colors. That's not film grain — it's a sparse noise pattern that flickers.
- **Fix:** Pre-generate 4 grain plates (1080p PNGs of monochromatic gaussian noise), cycle through them at frame rate, blend with `globalCompositeOperation = 'overlay'` at low alpha. Looks like actual film grain.

### B8. **No motion blur on camera moves**
- Zoom/pan motions in `drawMediaFrame` translate/scale the image in single-frame steps. No accumulator, no per-frame blur.
- **Impact:** Camera pans feel jerky on detail-heavy backgrounds. Especially noticeable at lower FPS.
- **Fix:** Render motion at 60 fps internally, then average pairs of frames into the 30-fps output. Or apply a small directional blur shader.

### B9. **Inter-line silence is between every line, even same speaker** — PACING
- P4.8 added 150ms silence between consecutive lines, but the gap is applied to *all* line transitions, not just speaker changes. A character delivering a long monologue gets choppy 150ms breaks every sentence.
- **Fix:** Only insert silence between *different* speakers, or use 50ms for same-speaker transitions and 200ms for speaker changes.

### B10. **`generateSceneImage` requests "2K"/"1K" but downstream Veo uses 720/1080p**
- `services/gemini.ts:~470` — `imageSize: resolution === Resolution.FHD ? '2K' : '1K'`. The image is then fed to Veo which renders at the project resolution. The extra detail is mostly thrown away on encoding.
- **Impact:** ~3× the image-gen cost (Gemini bills by pixels) for marginal final-quality gain.
- **Fix:** Match imageSize to the actual Veo output resolution — `1080p` (or 720p for fast).

### B11. **`/api/download` allowlist is prefix-only**
- `server/proxy.ts` — `uri.startsWith('https://generativelanguage.googleapis.com/')` is enough to use the endpoint. Anyone who can reach the server can use it as a Gemini-domain proxy on our API key.
- **Impact:** If the server is publicly exposed before authentication is wired in, the API key is effectively burnable.
- **Fix:** Stricter validation — require the URI to come from a known Veo operation pattern, or require an auth header / session cookie.

### B12. **No confirmation on `ProjectsView` delete**
- `App.tsx:711` — `onDelete={idx => setArchives(prev => prev.filter((_, i) => i !== idx))}`. One misclick, an entire project is gone, including all the time spent generating it.
- **Fix:** Add a confirmation modal or undo toast.

### B13. **`CharacterModal.handleRegenerateImage` has no loading state**
- The button in `App.tsx:947` is the modal's `onRegenerateImage` — calls `generateCharacterImage` async with no UI feedback. User can click it repeatedly, triggering multiple parallel calls.
- **Fix:** Add `isRegenerating` state in CharacterModal, disable the button, show a spinner.

### B14. **`Player` modal: audio + video go out of sync on autoplay-blocked browsers**
- `Player.tsx:144-145` — `videoRef.current.play().catch(...)` swallows autoplay failure. Audio plays via Web Audio (which has user-gesture activation), so audio plays but video is paused → narration without picture.
- **Fix:** Detect play() rejection and either pause audio (sync) or surface a "click to play" prompt.

### B15. **Project state doesn't carry a stable id** — IDB scope ambiguity
- IDB persistence keys on a single record `'active'`. If two browser tabs run simultaneously, last write wins. No conflict detection.
- **Fix:** Generate `projectId: string` on creation, scope IDB keys by it. Cross-tab BroadcastChannel can warn about concurrent edits.

---

## 2. Quality Gaps (won't break, but ceiling-limit the output)

### Q1. No MP4 output (still .webm only)
- Deferred in P3.4. The fix is to either bundle `ffmpeg.wasm` client-side (25 MB add) or add a server-side ffmpeg pipeline. Since Railway can host arbitrary binaries, server-side ffmpeg is the cleaner path.
- **Recommend:** Add an `/api/transcode` endpoint that takes the .webm blob and returns MP4 H.264 + AAC. Stream the transcode so we can keep memory flat for long videos.

### Q2. No audio normalization to a target loudness (LUFS)
- P3.2 added a compressor as a clip ceiling, but no loudness normalization. YouTube delivers -14 LUFS; cinema masters at -23 LUFS. Output today is somewhere unpredictable depending on TTS line length + music choice.
- **Fix:** Pre-render audio offline, measure integrated LUFS, apply a single gain to hit target.

### Q3. Music library is 5 Wikimedia Commons classical clips
- `constants.ts:52-58` — same 5 tracks for everyone, only roughly tagged by mood.
- **Impact:** Every project sounds derivative.
- **Fix:** Expand to 4-6 tracks per mood; let the model pick by track ID, not just mood category. Even better: generate music via Lyria when it's available in the Gemini SDK.

### Q4. `decodeAudio` defaults to 24kHz mono on missing WAV header
- `services/gemini.ts:651-661` — fine for current TTS, but if Gemini switches default rates this silently produces chipmunk or slow-mo audio.
- **Fix:** Add a sanity check on decoded duration vs expected and warn if 2× or 0.5× off.

### Q5. No reverb / room simulation
- Voices sound very dry. A subtle ConvolverNode with an impulse response would help.

### Q6. `SceneCard.handleOptimizePrompt` discards context
- Only the first narrator line and the scene description are sent to the optimizer, dropping later lines and character names.
- **Fix:** Pass full scene context.

### Q7. `extendSceneVideo` only supports 720p
- Veo limitation, but the UX doesn't tell users this. If they have a 1080p project and click Extend, the output drops to 720p mid-timeline.
- **Fix:** Warn before extending in a non-720p project. Or auto-upscale the 720p extension on render.

### Q8. Character ref images are single front-facing portraits
- Already noted in P1.6 of the original plan as deferred. A turnaround sheet (front / 3-quarter / profile) reliably improves Veo identity preservation, especially in side-angle scenes.

### Q9. No deduplication of identical generations
- Rapid "Take" clicks fire multiple operations. Same prompt + seed = wasted spend.
- **Fix:** Per-scene `inFlight` flag in handleGenerateSceneAsset.

### Q10. `productionLog` keeps only last 50 entries
- Long sessions lose history. Could persist to IDB.

---

## 3. Reliability & Resilience Gaps

### R1. Frame pacer doesn't compensate for sustained slow frames
- `Renderer.tsx:~485-510` — counts `lateFrames` but only logs. If a scene has 50% missed frames, output is below 30 fps with visible stutter.
- **Fix:** Adaptive — if late > 20% sustained, downscale internal resolution.

### R2. `MediaRecorder` may switch mime types between WebM and MP4 H.264 in different Chromium versions
- The blob mime type is fixed at recorder creation. If `pickMimeType` picks h264 today and vp9 tomorrow, downloaded files have inconsistent extensions vs codec.
- **Fix:** Bind the download filename's extension to the actual recorder mime type.

### R3. No timeout on initial `generateVideos` submission
- `retryWithBackoff` handles 429s but a hung connection doesn't trigger retry until the network gives up (often minutes).
- **Fix:** Wrap in `Promise.race` with a 60s submission timeout.

### R4. IDB write failures are silent
- `assetStore.ts` logs warnings only.
- **Fix:** Surface to the toast system when an asset save fails. The user should know if their work isn't being persisted.

### R5. `addLog` truncates older entries silently
- After 50 entries, history is lost.
- **Fix:** Either persist log to IDB or make truncation user-visible ("…and N older entries").

### R6. CSP / XSS surface
- No Content-Security-Policy header. Inline scripts and `dangerouslySetInnerHTML` aren't present today, but the app is one PR away from a vulnerability.
- **Fix:** CSP header in proxy.ts: `default-src 'self'; img-src 'self' data: blob:; media-src 'self' data: blob: https://upload.wikimedia.org; connect-src 'self'`.

### R7. No rate limiting on `/api/gemini/*`
- Anyone with the server URL can drain the API key.
- **Fix:** `express-rate-limit` middleware, modest limits (e.g., 60 req/min/IP).

### R8. Health check doesn't verify Gemini is reachable
- `/api/health` just confirms `GEMINI_API_KEY` is set in env.
- **Fix:** Add a Gemini ping mode (e.g., a small `models.list` call cached for 60s).

### R9. `process.exit(1)` on missing API key prevents graceful restart
- Railway will keep restarting forever.
- **Fix:** Log error, return 503 from all `/api/gemini/*` calls with a clear message; let the process stay up so the operator can fix env without re-deploying.

---

## 4. UX Polish

### UX1. No autosave indicator — users don't know their work is durable
### UX2. No keyboard shortcuts (Cmd+S, Esc to close modals, arrow keys for scene nav)
### UX3. Stage tab visit doesn't update activePhase highlight, only scrolls
### UX4. Modal soup persists — 13+ separate `useState<boolean>` toggles (P2.4 was deferred)
### UX5. AssetLibrary, Storyboard, and ProductionManifest show overlapping data (P2.3 was deferred)
### UX6. Mobile responsive (the "Render Progress" pill is hidden on small screens, the Next Step CTA stacks awkwardly)
### UX7. No undo for scene delete / move
### UX8. DirectorAssistant chat doesn't persist messages

---

## 5. Code Health (won't degrade output, but increases risk of regressions)

### CH1. `SceneCard.tsx` is 332 lines with 13+ state hooks — split into sub-components
### CH2. `App.tsx` is 1000+ lines with 14 modal `useState<boolean>` — useReducer modal stack
### CH3. `as any` casts in `services/gemini.ts` for SDK config — write proper types
### CH4. No CI configured — every push to main risks breakage
### CH5. Only helper-level unit tests — no integration tests, no component tests
### CH6. Some unused vars / dead code (`renderUrl` in ProjectState, `tasks` not displayed)

---

## 6. Proposed Phase 5+ Plan

Grouping by impact and effort. Phases here are **smaller** than the original 1-4 — most items are single-file fixes.

### Phase 5 — Audio Quality Pass (1 day)
- **B1** — Wire ambient SFX into Renderer (third gain bus + crossfade)
- **B2** — Apply voiceSettings to multi-speaker TTS via per-line `<prosody>` injection
- **B3** — Move audio contexts to 48kHz
- **B9** — Smarter inter-line silence (speaker-change-aware)
- **Q2** — LUFS-targeted audio normalization (pre-render pass)
- **Q5** — Subtle ConvolverNode reverb on voice bus

### Phase 6 — Video Quality Pass (1 day)
- **B4** — `recorder.start(1000)` chunked timeslice
- **B5** — Raise bitrate to 0.15 bpps
- **B7** — Real grain plates (cycling pre-rendered PNGs)
- **B6** — Honest LUT presets (rename or implement real 3D LUT via WebGL)
- **B8** — Motion blur on camera moves (oversample + average)
- **R1** — Adaptive frame pacer (downscale internal render on sustained drop)
- **R2** — Filename extension matches actual mime type

### Phase 7 — Bug Hardening (0.5 day)
- **B10** — Match image-gen size to Veo output resolution
- **B11** — Tighten `/api/download` allowlist
- **B12** — Confirmation modal on archive delete
- **B13** — Loading state on CharacterModal regenerate
- **B14** — Player audio/video sync fallback
- **B15** — Stable `projectId`, scope IDB by it
- **Q9** — Dedup in-flight scene generations
- **R3** — 60s timeout on initial generateVideos submission
- **R4** — Surface IDB write failures as toasts

### Phase 8 — Production Hardening (0.5 day)
- **R6** — CSP header in proxy
- **R7** — Rate limit `/api/gemini/*`
- **R8** — Health check pings Gemini
- **R9** — Graceful degradation on missing API key

### Phase 9 — UX Cleanup (1 day, optional)
- **UX1** — Autosave indicator
- **UX2** — Keyboard shortcuts (Esc, Cmd+S, arrow keys)
- **UX4** — useReducer modal stack
- **UX5** — Merge AssetLibrary + Storyboard + ProductionManifest
- **UX7** — Undo for delete

### Phase 10 — Premium Audio/Video (multi-day, larger investments)
- **Q1** — Server-side ffmpeg MP4 transcode endpoint
- **Q3** — Expanded music library, model-picked tracks
- **Q8** — Character turnaround sheets (3 angles)
- **R5** — Persist productionLog to IDB

### Phase 11 — Code Health & Testing (1-2 days)
- **CH1, CH2** — Split SceneCard and App.tsx into focused sub-components
- **CH3** — Replace `as any` with proper SDK types
- **CH4** — GitHub Actions CI: build + smoke on every PR
- **CH5** — Add component tests for the critical flows (analyze → manifest → export)

---

## 7. Recommended Order

If you want one ordering for impact-per-effort:

1. **Phase 7 (Bug Hardening)** first — cheap, fixes confirmed bugs, no risk
2. **Phase 5 (Audio Quality)** — biggest perceptible quality win, especially B1/B2/B3
3. **Phase 6 (Video Quality)** — next-tier perceptible win
4. **Phase 8 (Production Hardening)** — required before any public exposure
5. **Phase 9 (UX Cleanup)** — when there are real users to delight
6. **Phase 10 (Premium)** — when the basics are solid
7. **Phase 11 (Code Health)** — ongoing, do as you go

Total Phase 5-8 effort: ~3 days of focused work. That gets the project from "demo-quality" to "shippable."
