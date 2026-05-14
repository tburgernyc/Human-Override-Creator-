# YouTube-Quality Roadmap — Phases 12-15

**Date:** 2026-05-14
**Author:** Post-Phase-11 follow-up
**Scope:** What's left after the [quality-hardening plan](./2026-05-13-quality-hardening-plan.md) for the project to produce video that's truly YouTube-grade — correct container, mastered audio, accessible, distributable.

The quality-hardening plan closed the obvious bugs and quality losses. This document inventories the remaining gaps that prevent the build from being something a YouTuber would actually ship.

---

## 1. Confirmed gaps

### G1. **WebM-only export** — distribution blocker
- `components/Renderer.tsx` line ~390 — `MediaRecorder` emits whatever `pickMimeType` picks first (VP9 WebM in current Chrome). The download filename now matches the mime type (R2) but the file is still WebM.
- YouTube ingests WebM, but every editor (Premiere, Final Cut, CapCut, DaVinci) and every cross-post path (Twitter, Instagram, TikTok) expects MP4 H.264 + AAC.
- **Fix:** Server-side ffmpeg transcode endpoint (Q1 from the prior plan). Same pass can also do mastering (G2/G3 below).

### G2. **No master-bus LUFS normalization** — loudness inconsistency
- `components/Renderer.tsx` ~line 470 — voice bus is RMS-normalized to ~-18 dBFS (Q2). Music + ambient buses pass through fixed gains. The final mix's integrated loudness varies by content density.
- YouTube targets **-14 LUFS** integrated. If the upload is below, listeners crank volume; above, YouTube re-normalizes and you lose dynamic range.
- **Fix:** ffmpeg `loudnorm` filter in the same transcode pass — two-pass (measure then apply) hits -14 LUFS exactly.

### G3. **No true-peak limiter** — risk of clipping after upload
- `components/Renderer.tsx` ~line 376 — master `DynamicsCompressor` (threshold -8 dB, 4:1 ratio) catches transients but isn't a brickwall. Inter-sample peaks > 0 dBFS pass through to the encoder, and YouTube's downstream processing can introduce clicks.
- **Fix:** ffmpeg `alimiter` (or `loudnorm`'s `TP=-1` flag) in the transcode pass.

### G4. **No captions / subtitles export**
- `Scene.narratorLines` exists with `speaker` + `text` + scene `estimatedDuration`. Captions never get baked or exported.
- YouTube heavily favors captioned content (accessibility + retention). Most uploaders expect at minimum an `.srt` sidecar.
- **Fix:** Generate `.srt` from `narratorLines` + per-scene cumulative timing during render. Bonus: optional burned-in caption pass via ffmpeg `subtitles` filter.

### G5. **No thumbnail export**
- The first scene's `imageUrl` is already in `project.assets` but nothing surfaces "Download Thumbnail."
- YouTube needs one. Users currently have to right-click → save image from somewhere else.
- **Fix:** Add a "Download Thumbnail" button next to "Download Master Unit" in `Renderer.tsx`. Auto-pick `project.assets[keyArtSceneId ?? scenes[0].id].imageUrl`.

### G6. **YouTube metadata export**
- `ProjectState.youtubeMetadata` exists as a type (`types.ts`). Surfacing status unverified — may already render or may be dead.
- Even if the UI renders it, exporting a copy-pasteable title+description+tags block (or a JSON the YouTube uploader can consume) would close the loop.
- **Fix:** Audit the current `youtubeMetadata` flow; add an "Export Metadata" button that downloads a `.txt` with title/description/tags or copies to clipboard.

### G7. **Veo 720p extension silently degrades 1080p projects**
- `services/gemini.ts` `extendSceneVideo` (~line 542) hardcodes `resolution: '720p'` because Veo's extension API only supports 720p.
- In an FHD/1080p project, clicking "Extend" on a scene drops that segment to 720p. The user never sees a warning; the final stitched video has a visible quality drop mid-timeline.
- **Fix:** Two options:
  - (a) Warn before extending in a non-720p project ("Extension only available at 720p — extended portion will appear softer than the rest of your timeline. Continue?")
  - (b) Auto-upscale the 720p extension to 1080p with a 2D bicubic pass during render. Won't recover detail but matches the rest of the timeline visually.
  - Recommend (a) for honesty + (b) as a follow-up.

### G8. **Single-angle character refs** — identity drift on side shots (Q8 from prior plan)
- `services/gemini.ts` `generateCharacterImage` outputs one front-facing portrait at 1:1.
- Veo's identity preservation drops sharply past ~30° off-axis. A scene where a character turns away can render with a different face.
- **Fix:** Output a 3-angle turnaround sheet (front / 3-quarter / profile) per character. Either three separate image-gen calls stitched into one composite reference, or one image-gen call with a turnaround-sheet prompt. Update scene image-gen prompts to mention "multiple angles available — pick the one matching the camera in this scene."

### G9. **CSS-filter "LUT" presets** — visual ceiling
- `components/Renderer.tsx` `applyGrading` — LUT presets are CSS canvas filters (relabeled in B6 to be honest about that: "Warm Contrast", "High-Contrast B&W"). Real film stocks need a 3D LUT pass.
- **Fix paths:**
  - **Server-side (cheap):** Once G1 ffmpeg pipeline exists, add `lut3d=<file.cube>` filter to the transcode pass. ~Half day per LUT. Requires bundling `.cube` files.
  - **Client-side (heavier):** WebGL pass that loads a `.cube` and applies in real time during render. ~2 days, no infra needed.
  - Recommend server-side once G1 lands.

### G10. **Long-render stability** — quality ceiling under load
- `MediaRecorder` + `canvas.captureStream()` is real-time, single-pass, and browser-bound. A 3-minute video = 5400 frames each needing to land their 33ms budget. R1's adaptive pacer mitigates by dropping effects; it doesn't prevent tab OOM or recorder chunk drops on long renders.
- B4's chunked timeslice recovers partial work on crash but doesn't prevent the crash.
- **Fix:** Server-side render — headless Chromium (Puppeteer) running the same Renderer component, or rebuild as an ffmpeg + image-sequence pipeline. Multi-day, multi-week if done right.
- **Pragmatic alternative:** Cap user-facing project length (e.g., 5 min) and document. Defer real server-side render until the user base demands it.

### G11. **No cost/quota visibility**
- A 10-scene 1080p project burns ≥10 Veo calls plus image/audio per scene plus character refs. At Veo pricing this is real money ($1-5/render). Users have no estimate before clicking "Manifest All."
- **Fix:** Before batch generation, show an estimate: "~10 Veo calls (~$X), ~10 image gens (~$Y), ~$Z total. Continue?" Pull pricing from a constants table updated when Gemini publishes new rates.

### G12. **Veo content-policy failures abort scenes**
- `services/gemini.ts` `retryWithBackoff` only retries on rate-limit errors. A Veo content-policy block (which can fire on prompts the safety filter dislikes) fails immediately with no recovery path — the scene falls into `status: 'error'` and the user has to manually regenerate.
- **Fix:** On Veo content-policy errors, auto-retry with the prompt rewritten by the THINKING model to soften flagged language. Cap at 2 retries. Surface to the user when the rewrite kicks in so they understand why the visual prompt may have changed.

---

## 2. Proposed phases

Grouped by impact and the order that maximizes reuse — Phase 12 unlocks cheap implementations of several downstream items.

### Phase 12 — Server-side encode pipeline (the keystone) — ~1.5 days

The single biggest force multiplier. Once ffmpeg is on the server, MP4 + LUFS + true-peak all happen in one pass, and Phase 14 LUTs become a one-line filter addition.

- **G1** — Server-side ffmpeg + `/api/transcode` endpoint
  - Add ffmpeg to the Railway image (`nixpacks.toml` override or Dockerfile)
  - New endpoint accepts streaming WebM upload, runs `ffmpeg -i pipe:0 -c:v libx264 -preset slow -crf 18 -c:a aac -b:a 192k -movflags +faststart pipe:1` (or two-pass for higher quality), streams MP4 back
  - Stream both directions to keep memory flat for long videos
  - Apply R7's rate limiter to this endpoint — it's expensive
- **G2** — Two-pass `loudnorm` to hit -14 LUFS exactly
- **G3** — `alimiter=limit=0.95` (or `loudnorm`'s built-in TP=-1) for true-peak ceiling
- Client-side: Renderer's complete state offers "Download Master Unit (MP4)" — POSTs the WebM blob to `/api/transcode`, shows a progress indicator, downloads the MP4 response
- Keep "Download Source (WebM)" as a fallback link

**Acceptance:** A rendered scene, downloaded via the MP4 button, has -14 LUFS integrated loudness measured by ffmpeg's `loudnorm` analyzer, no peaks above -1 dBTP, and plays cleanly in QuickTime / VLC / a basic web `<video>` element.

### Phase 13 — Distribution polish — ~1.5 days

Independent of Phase 12; all client-side. Highest impact-per-effort once Phase 12 is in.

- **G4** — SRT caption export
  - Walk `scenes`, accumulate per-scene timing from `estimatedDuration` (which already accounts for TTS length post-Phase-3), emit one `.srt` cue per narratorLine
  - Add "Download Captions (.srt)" button alongside the MP4 download
  - Bonus: optional burned-in captions via ffmpeg `subtitles` filter when Phase 12 transcodes (requires SRT to exist before transcode call)
- **G5** — Thumbnail export — small UI add
- **G6** — Metadata export audit + export button
- **G7** — Veo 720p extension warning modal at extend-trigger time

**Acceptance:** A YouTuber can render → download MP4 → download SRT → download thumbnail → upload to YouTube Studio with title/description filled in, all from this app's UI.

### Phase 14 — Visual fidelity — ~2 days

Independent of 12/13. The improvements users see on screen rather than the ones that matter for distribution.

- **G8** — Q8 character turnaround sheets
  - Modify `generateCharacterImage` to emit a 3-panel composite (front / 3-quarter / profile)
  - Update scene-image prompts to reference the turnaround
  - Update `Character.referenceImageBase64` to optionally hold a sheet vs single image (backwards-compatible)
- **G9** — Real 3D LUTs
  - If Phase 12 done: bundle 4-6 `.cube` files in `public/luts/`, pass `lut3d=...` to the transcode pass when `lutPreset !== 'none'`
  - If Phase 12 not done: WebGL pass in `applyGrading` — significantly heavier

**Acceptance:** A scene featuring a character turning 90° during a pan still reads as the same person frame-to-frame. The "Kodak Vision3" preset (renamed back) looks like Kodak Vision3, not Instagram.

### Phase 15 — Reliability + economics — ~2-3 days (optional, scale-driven)

Defer until you hit the scale that demands it.

- **G10** — Server-side headless render (puppeteer or ffmpeg image-sequence)
- **G11** — Cost/quota estimate before "Manifest All"
- **G12** — Veo content-policy auto-retry with prompt rewrite

**Acceptance:** A 5-minute, 30-scene project completes reliably to a single MP4 without browser crashes. Users see an accurate cost estimate before clicking Manifest All. Content-policy failures don't dead-end the user.

---

## 3. Recommended order

If you only have time for one phase, do **Phase 12** — it's the keystone and produces a YouTube-ready container/audio combo by itself.

1. **Phase 12** — MP4 + mastered audio. This is the gap between "technically rendered" and "uploadable."
2. **Phase 13** — Captions, thumbnail, metadata. These close the loop with YouTube Studio.
3. **Phase 14** — Visual fidelity. Lifts the ceiling once the floor is solid.
4. **Phase 15** — Only when project length or user base demands it.

**Total effort for YouTube-ready (Phases 12 + 13):** ~3 days of focused work.
**Total effort including visual fidelity (12 + 13 + 14):** ~5 days.

---

## 4. Cross-cutting considerations

### Cost
- Phase 12 ffmpeg adds no API cost — just CPU on Railway (server-side transcode is cheap on x86).
- Phase 14 G8 turnarounds increase image-gen cost ~3× per character ref (one image becomes three). Character refs are one-time per project though, so amortized cost is small.
- No new ongoing services required — ffmpeg is bundled in the image, LUTs are static files.

### Deployment
- Phase 12 requires the Railway image to include ffmpeg. The current build uses Nixpacks (`npx tsx server/proxy.ts` start command). Need to either:
  - Add a `nixpacks.toml` declaring the ffmpeg package
  - Or switch to a Dockerfile that runs `apt-get install ffmpeg` then the existing start command
- Either is a single small addition; pick based on existing Railway config conventions.

### CI
- Phase 12 should add an integration test that submits a tiny WebM to `/api/transcode` and asserts the output has MP4 magic bytes + ffprobe reports H.264 + AAC. Once CH5 wires up vitest (currently deferred), this is the first real test to add.

### Memory
- The transcode endpoint must stream end-to-end (don't buffer the full WebM in memory) — a 3-min 1080p WebM is ~150 MB. Use Node's `pipeline()` between the request body, an ffmpeg child-process stdio pipe, and the response.

---

## 5. Things explicitly NOT in this plan

- **Lyria music generation** — when Gemini exposes Lyria in the SDK it'd replace MUSIC_TRACKS. Worth tracking but not blocking YouTube quality.
- **Direct YouTube upload via the YouTube Data API** — out of scope. The user can upload manually.
- **Multi-track audio export (separate stems)** — pro editors would love it; YouTubers don't need it.
- **HDR / 4K output** — Veo doesn't output above 1080p in the current model, and YouTube's 1080p tier is fine for almost all creators.

---

## 6. Checklist before declaring "YouTube-ready"

Run these manually on a 5-scene test project before claiming the app produces YouTube-quality output:

- [ ] `.mp4` downloads and plays in QuickTime, VLC, and a `<video>` element with no error
- [ ] `ffprobe` reports H.264 video + AAC audio
- [ ] `ffmpeg -i out.mp4 -af loudnorm=print_format=summary -f null -` reports integrated loudness within ±0.5 LU of -14 LUFS
- [ ] No samples above -1 dBTP
- [ ] An `.srt` downloads alongside the video; cue timing matches when scrubbing in QuickTime
- [ ] A thumbnail downloads as a single 1920×1080 PNG/JPG
- [ ] Title + description + tags either copy to clipboard or download as a `.txt` block
- [ ] Render of a 3-minute project (5+ scenes) completes without browser crash and produces an unbroken MP4
- [ ] Uploaded to a YouTube test channel — preview plays back with audible voice, music, ambient, and captions all present and balanced
