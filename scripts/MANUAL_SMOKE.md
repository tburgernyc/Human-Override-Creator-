# Manual Smoke Verification

Run after Phase 2/3 changes to confirm video output quality.

## 1. Helper unit tests (automated)

```bash
npm test
```

Runs three suites under `tsx` (also gated in CI):
- `scripts/smoke-helpers.test.mts` — pure helpers (`pickMimeType` fallback order, `computeBitrate`, `sniffWavHeader`, `stripDataUriPrefix`, `parseJsonResponse`), real `normalizeLutPreset` from `services/lutMigration.ts`, `buildLutArg` against the canonical `LUT_PRESETS` import, plus a drift assertion guarding `server/proxy.ts`'s local `LUT_PRESETS` against `types.ts`, and the pure parsers from `verify-mp4.mjs`.
- `scripts/lut-migration.test.mts` — 11 load-bearing assertions on the legacy LUT enum migration.
- `scripts/verify-mp4-fixture.test.mts` — end-to-end coverage for `verify-mp4.mjs` by generating synthetic good/bad MP4s via `ffmpeg-static` and asserting the right PASS/FAIL outcomes.

## 2. End-to-end render verification (manual)

1. Start the app: `npm run dev:all` (Vite + proxy).
2. Open `http://localhost:3000`.
3. In the LandingPage, paste a 3-scene script — pull the placeholder text from `constants.ts` (`INITIAL_SCRIPT_PLACEHOLDER`) for quick start.
4. Run the full Generate flow so each scene has an `imageUrl` and `audioUrl`.
5. Open the **AudioMixer** — confirm the **Atmosphere** slider responds to drags (Phase 2.7 fix). Move it to ~80% and close.
6. Open **VFX Master** (mastering panel) — set `bloomIntensity: 60`, `lightLeakIntensity: 50`, `filmBurnIntensity: 70`. Drag each slider while watching the preview canvas — each should visibly alter the frame (Phase 2.5 fix). If any slider has no visual effect, the wiring regressed.
7. Click **Render**. Wait for the output blob.
8. Save the downloaded `.webm` (or `.mp4` if you're on Safari) and run:

```bash
ffprobe -v error -select_streams v:0 -show_entries stream=avg_frame_rate,bit_rate,width,height,codec_name -of default=nw=1 output.webm
ffprobe -v error -select_streams a:0 -show_entries stream=sample_rate,channels -of default=nw=1 output.webm
```

### Pass criteria

- `avg_frame_rate` ≈ 30/1 (within 0.5 fps).
- `bit_rate` within ±10% of `width × height × 30 × 0.1`, clamped [2 Mbps, 20 Mbps].
- `sample_rate` = 24000.
- `codec_name` ∈ {vp9, vp8, h264}.
- Total stream duration = sum of scene `estimatedDuration` (±100 ms).

### Audio sync checks

- Voice pitch in the rendered file matches preview playback (no chipmunk effect — Phase 2.1).
- No voice bleed from scene N into scene N+1's frames (Phase 2.4 — bounded TTS).
- Music plays in the rendered file, not just the preview (Phase 2.10 — music port).

## 3. AI proxy verification (manual)

With the dev server running and a valid `GEMINI_API_KEY` in `.env`:

1. **Array query params** — open browser DevTools → Network. Trigger any Gemini call that accepts repeated query params; confirm the proxy forwards all values (was previously coerced to `[object Object]` per audit).
2. **Upstream error surfacing** — temporarily set an invalid `GEMINI_API_KEY` in the proxy env, retry a call. Expect `401` (or similar) to reach the client with the upstream error body intact, not an opaque `200`.
3. **Malformed JSON handling** — point a single Gemini call at an unreachable endpoint or force a 500; confirm `parseJsonResponse` surfaces the raw response in the error message (Phase 3.7).
4. **Partial TTS failure** — generate audio for a scene with 3+ speakers where one line is malformed. Expect the other lines to render successfully (Phase 3.6 — `Promise.allSettled`).

## 4. Build + type check

```bash
npm run build
```

Should exit 0 with no TypeScript errors and produce a `dist/` directory.

## 5. Phase 14 — Visual fidelity (G8 + G9)

### 5.0 Setup (one-time, before running any step)

**Start both servers** in one terminal:

```bash
npm run dev:all
```

This concurrently starts:
- The proxy server on `http://localhost:3001` (handles `/api/transcode`, `/api/gemini/*`, `/api/download`)
- The Vite dev server on `http://localhost:3000` (serves the SPA and proxies `/api/*` to 3001)

You should see two coloured log streams labeled `proxy` and `vite`. If `proxy` complains about a missing `GEMINI_API_KEY`:
1. `cp .env.example .env`
2. Edit `.env` and paste a real key from <https://aistudio.google.com/apikey>
3. Re-run `npm run dev:all`

**Open the app** at `http://localhost:3000`. Open DevTools (F12) — keep the **Console** and **Network** tabs visible throughout; you'll inspect a response header in step 5.4.

**Cost note.** Steps 5.3 and 5.5 use no Gemini quota. Steps 5.1, 5.2, 5.4 do — roughly 1 image gen + 1 short Veo render per fresh project, on the order of a few cents to a dollar depending on resolution. If you've already got a project with a rendered WebM from earlier testing, reuse it for steps 5.4 and 5.5 to avoid re-spending.

**Run order (cheapest first):** 5.3 → 5.5 → 5.4 → 5.1 → 5.2.

---

### 5.3 — Legacy LUT enum migration (FREE — localStorage only)

Verifies that pre-Phase-14 projects with old `lutPreset` values load without error and remap to the new filmstock names.

> **Prereq.** The "Open VFX Synthesis Lab" button lives inside the `phase-post` section, which is gated on `project.scenes.length > 0` (App.tsx). A brand-new "New Project" has zero scenes, so Stage 4 won't render and the button won't exist in the DOM. The snippet below seeds a minimal dummy scene alongside the legacy `lutPreset` in one paste — no need to run the real Generate flow.

1. In DevTools → **Console**, paste this one-liner. Substitute the highlighted value for each row in the table below.

   ```js
   (()=>{const k='human_override_active_project_v7';const p=JSON.parse(localStorage.getItem(k));p.mastering.lutPreset='kodak_5219';if(!p.scenes||p.scenes.length===0)p.scenes=[{id:'smoke',description:'smoke',visualPrompt:'',charactersInScene:[],narratorLines:[],estimatedDuration:1,musicMood:'calm'}];localStorage.setItem(k,JSON.stringify(p));location.reload();})()
   ```

   If `localStorage.getItem(k)` returns `null` on the first run (no project yet), click **"New Project"** in the app once, then re-run the snippet.

2. After the reload, scroll to the **Post-Production & Release** section (or click the **04 Post** tab in the phase nav). Click **"Open VFX Synthesis Lab"** — the wand-sparkles button on the right side of that section's header. It's a *gold-outlined* button by default (`text-luna-gold border border-luna-gold/20`); the fill only goes solid gold on hover.

3. **Expected:** in the modal that opens, one LUT preset button in the grid is highlighted with a solid gold fill (`bg-luna-gold text-white`) matching the table below. **No** red errors in the Console.

| Set `lutPreset` to | Highlighted LUT button in VFXMaster |
|---|---|
| `kodak_5219`    | Kodak Vision3 250D |
| `fuji_400h`     | Fuji Eterna 250D |
| `noir`          | Bleach Bypass |
| `technicolor`   | Kodak 2383 Print |
| `garbage_value` | Bypass (None) |

When done, run the snippet one more time with `'none'` to restore the documented post-smoke state.

> **Automated cross-check.** The pure mapping function lives at `services/lutMigration.ts` and has 11 load-bearing assertions in `scripts/lut-migration.test.mts`. Run `npx tsx scripts/lut-migration.test.mts` to verify the mapping table without a browser.

---

### 5.5 — Graceful LUT degradation (FREE if you have an existing rendered WebM)

Verifies the server silently downgrades to no-LUT when the `.cube` file is missing rather than failing the whole transcode.

**Prereq:** an already-rendered WebM in the app (the "Master Export" view shows "Download Master Unit"). If you don't have one yet, do step 5.4 first and come back.

1. From a terminal in the repo root:
   ```bash
   mv public/luts/kodak_2383.cube public/luts/kodak_2383.cube.bak
   ```
2. In the app, open **VFX Synthesis Lab** and select **"Kodak 2383 Print"** as the LUT. Close the panel.
3. In the renderer view, click **"Download Master Unit (MP4)"**.
4. In DevTools → **Network** tab, click the `transcode?lutPreset=kodak_2383` request, then the **Headers** panel → **Response Headers**.
5. **Expected:**
   - `X-LUT-Applied: false`
   - `X-LUT-Preset: none`
   - An MP4 still downloads (no error).
   - A red log entry appears in the production-log UI: `LUT "kodak_2383" could not be applied; MP4 uses preview color only.`
6. Restore the file:
   ```bash
   mv public/luts/kodak_2383.cube.bak public/luts/kodak_2383.cube
   ```

---

### 5.4 — Real LUT applied on transcode (needs a rendered scene)

Verifies the end-to-end path: client sends `?lutPreset=...`, server injects `lut3d=...` into ffmpeg pass 2, returns an MP4 with real graded color.

**Prereq:** a project with at least one scene that has both an image and a Veo video generated. If you don't have one, create a new project, paste any short script into Script Input, accept the AI-generated scene breakdown, generate one scene's image + video. (This costs a few Veo+image API calls.)

1. Open **VFX Synthesis Lab**, select **"Kodak 2383 Print"**, close the panel.
2. Trigger **"Initialize Master Export"** (or the equivalent render-trigger button in the dashboard). Wait for the WebM to finish rendering — the renderer view will show "Download Master Unit (WebM)".
3. Click **"Download Master Unit (MP4)"**. The button enters a "transcoding…" state for several seconds.
4. In DevTools → **Network** → click the `transcode?lutPreset=kodak_2383` request → **Response Headers**.
5. **Expected:**
   - `X-LUT-Applied: true`
   - `X-LUT-Preset: kodak_2383`
   - An MP4 downloads (~10–50 MB depending on scene length).
6. Play the MP4. Then change the preset to **"Bypass (None)"** in VFXMaster, re-click "Download Master Unit (MP4)", and compare. **Expected:** the kodak_2383 MP4 is visibly warmer / more contrasted than the `none` MP4 from the same source render.

Repeat for any of the other four LUTs (`kodak_vision3_250d`, `fuji_eterna_250d`, `arri_logc_to_rec709`, `bleach_bypass`) to confirm each produces a different look.

---

### 5.1 — Turnaround sheet renders at 3:1 (costs ~1 image gen)

Verifies G8: the character reference is now a 3-panel composite instead of a single front portrait.

1. Open the project dashboard. Click **"Add Character"** (or edit an existing one without a `turnaroundSheetBase64`).
2. Fill in name + visual prompt (e.g. "Female detective, mid-30s, dark hair, leather jacket"). Save.
3. Open the character card, click the **regenerate icon** on the portrait area (Font Awesome `fa-wand-magic-sparkles` overlay that appears on hover). Wait ~10–30 s.
4. **Expected — CharacterModal:** the preview area shows a **wide 3-panel strip** (front / 3-quarter / profile of the same character), at roughly 21:9 aspect — *not* a square portrait. (The original plan called for 3:1, but Gemini's image API doesn't accept that ratio; 21:9 is the closest supported substitute.)
5. **Expected — CastEnsemble carousel** (the small circles at the top of the dashboard): the circle for this character shows **only the front panel**, cropped to a usable headshot. The 3/4 and profile panels are not visible (they're cropped out by `object-position: left center`).
6. **Console check:** no errors. The character record in localStorage now has a `turnaroundSheetBase64` field (DevTools → Application → Local Storage → inspect the character).

---

### 5.2 — Scene image uses turnaround (costs ~1 scene image gen)

Verifies that `generateSceneImage` injects the turnaround sheet and instructs the model to pick the matching angle.

**Prereq:** a character with a `turnaroundSheetBase64` (do 5.1 first).

1. Create a scene that explicitly features that character. In the scene's visual prompt, describe a **side or profile shot** (e.g., "Detective viewed from the side, looking out a rain-soaked window").
2. Trigger image generation for that scene (click the scene card's image-gen action).
3. **Expected:** the generated scene image shows the character at roughly the framing described — head-on, three-quarter, or full profile depending on the prompt — and the face/identity matches across angles. The model has been instructed to "use whichever panel angle best matches the camera framing of this scene" (see `services/gemini.ts` `generateSceneImage`).
4. **Bonus identity-drift check:** if you have a multi-scene project, generate scene images for one head-on scene and one profile scene of the same character. The face should read as the same person frame-to-frame (the failure mode this feature exists to prevent is a profile shot rendering with a different face).

---

### 5.x — Restore-state checklist after smoke run

- [ ] `public/luts/` has all 5 `.cube` files (no `.bak` leftovers).
- [ ] localStorage `lutPreset` is back to `none` (or whatever value you intend to keep).
- [ ] Any test characters / scenes created solely for smoke can be deleted from the project to keep production data clean.

---

## 6. YouTube-Ready Sign-off

The nine-item checklist at `docs/superpowers/specs/2026-05-14-youtube-quality-plan.md` §6 must be walked end-to-end on a real export before declaring the app produces YouTube-grade output. Items 2-7 are mechanical and automated by `scripts/verify-mp4.mjs`; items 1, 8, and 9 require human eyeballs.

### 6.0 Build the test corpus

1. Start the app: `npm run dev:all`.
2. Create a new project. Paste the placeholder script from `constants.ts` (`INITIAL_SCRIPT_PLACEHOLDER`) into Script Input — it produces ~5 scenes which is enough volume to stress item 8.
3. Run the full generation flow: scene breakdown → cast → scene images → Veo videos → audio.
4. Open **VFX Synthesis Lab** and pick any non-`none` LUT (Kodak 2383 is a safe default).
5. Click **Initialize Master Export** and let the renderer produce the WebM.
6. Once the WebM is ready, download all four artifacts in turn:
   - **Download Master Unit (MP4)** → `master_production_unit.mp4`
   - **Captions (.srt)** → `master_production_unit.srt`
   - **Thumbnail** → `master_production_unit_thumbnail.png`
   - **Metadata** → `master_production_unit_metadata.txt`

If any download button is disabled, the underlying export is missing — generate the missing piece (e.g., re-run TTS for narrator lines) before continuing.

### 6.1 Run the automated checks (items 2-7)

From the repo root, with the four artifacts in one directory:

```bash
node scripts/verify-mp4.mjs \
  --mp4       ~/Downloads/master_production_unit.mp4 \
  --srt       ~/Downloads/master_production_unit.srt \
  --thumbnail ~/Downloads/master_production_unit_thumbnail.png \
  --metadata  ~/Downloads/master_production_unit_metadata.txt
```

Expected: every line tagged `[PASS]` and exit code `0`. If anything is `[FAIL]`, the measured value is printed inline — treat that as a regression, file the fix, and re-run before continuing.

The script covers:

| # | Check | Mechanism |
|---|---|---|
| 1* | Decodes without errors end-to-end | `ffmpeg -v error -i mp4 -f null -` (mechanical proxy for "plays in QuickTime/VLC/`<video>`"; visual glitches like green frames or A/V drift still need eyeballs) |
| 2 | H.264 video + AAC audio codecs | ffmpeg stream-info probe |
| 3 | Integrated loudness within ±0.5 LU of -14 LUFS | ffmpeg `loudnorm=print_format=summary` |
| 4 | True peak ≤ -1.0 dBTP | same loudnorm pass |
| 5 | SRT cues parseable, monotonic, end > start | pure parser |
| 6 | Thumbnail is 1920×1080 PNG/JPEG | ffmpeg stream-info probe |
| 7 | Metadata `.txt` has header + TITLE block | pure parser |

(Item 5's *timing-against-video* — does the caption land on the spoken word? — remains a manual eyeball check during item 1 playback.)

### 6.2 Manual playback check (item 1)

Open `master_production_unit.mp4` in **all three**:

- QuickTime (or platform native: Windows Media Player / Files)
- VLC
- A browser `<video>` element — drop the file into a blank `<video controls>` test page or use `chrome://media-internals` to confirm decode without errors

Expected: each plays back end-to-end with audible voice + music + ambient. No "unsupported codec" prompts, no green frames, no audio dropouts.

While playing, spot-check that the SRT timing lines up: open the `.srt` in QuickTime (drag onto the video window) — when a caption is on screen, the spoken word should be audible within ~250 ms.

### 6.3 Render-stability check (item 8)

If the test corpus produced a project under 3 minutes total, extend it: add scenes until the project's combined `estimatedDuration` is ≥ 180 seconds (the renderer shows total length in the render dialog).

Click **Initialize Master Export** with the long project. Watch the browser tab — DevTools should stay responsive, no "Aw, Snap" crash page, no `MediaRecorder` errors in console. The final `.webm` should be unbroken (re-run §6.1 against it if you want to be thorough).

If the tab crashes, **stop the sign-off** — this is G10 territory (Phase 15 server-side render). File it and pick that work up next.

### 6.4 Upload preview (item 9)

Upload `master_production_unit.mp4` + `master_production_unit.srt` to a **private** YouTube test channel. Use YouTube Studio's preview player:

- Voice, music, and ambient are all audible and the mix is balanced (no track dominating)
- Captions appear when toggled on in the player, timing reads natural
- The thumbnail uploads cleanly when supplied (item 6 sanity)
- The metadata `.txt` produces usable copy when pasted into Title + Description + Tags fields

### 6.5 Sign-off table

Copy this block into your commit message or the roadmap file when complete:

```
YouTube-Ready Sign-off — <DATE> — <YOUR-INITIALS>
Project: <project-name> (<N> scenes, <minutes>m)
LUT applied: <kodak_2383 / none / ...>

[ ] Item 1 — Plays in QuickTime / VLC / <video>
[ ] Item 2-7 — verify-mp4.mjs reports all PASS (paste output here)
[ ] Item 8 — 3-min+ render completes without tab crash
[ ] Item 9 — YouTube Studio preview: A/V balance + captions OK

Notes:
  <observed loudness, any oddities, things to revisit>
```

Once all four boxes are checked, edit `docs/superpowers/specs/2026-05-14-youtube-quality-plan.md` lines 186-194 — replace each `- [ ]` with `- [x] <date>` so the project state reflects that Phase 14 has been formally verified.

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

## 8. Per-phase regenerate + stale-audio indicator (audit slice A1+A2)

Verifies that the SceneInspector header buttons let the user regenerate image, video, or audio in isolation — and that editing narration after audio has been generated visibly flags the audio as stale.

### 8.1 Audio-only regenerate preserves visual assets (PAID — one TTS call)

1. `npm run dev:all` and open a project with at least one fully-generated scene (image + video + audio).
2. Click the scene to open **Deep Scene Inspector**.
3. In the inspector header, locate the three regenerate buttons: **Image**, **Video**, **Audio**.
4. Click **Audio**.
5. **Expected:** the scene card flips to `generating_audio` status; image and video stay unchanged (no flicker, same thumbnail, same Veo URI in the variants list).
6. After completion, the scene status returns to `complete`; the variants array length is unchanged (audio-only does not append a variant).

### 8.2 Stale-audio indicator on narration edit (FREE — no API calls)

1. Open a scene whose audio has been generated. In the inspector header, the **Audio** button is in the resting (gray) state — not pulsing.
2. Switch to the **Vocal Staging** tab. Edit any narrator line's text.
3. **Expected:** the **Audio** button immediately picks up a pulsing luna-gold border and a small gold dot — flagging that the synthesized audio no longer matches the on-screen narration.
4. Revert the edit back to the original text. The indicator should disappear (button returns to resting state).
5. With the indicator showing, click **Audio**. After TTS completes, the indicator clears.

### 8.3 Video-only regenerate requires an existing image (FREE)

1. On a scene that has never been generated, open the inspector. The **Video** button is disabled (tooltip: "Generate an image first…").
2. Click **Image**. After image generation completes, the **Video** button becomes enabled.

### 8.4 Image-only regenerate leaves video + audio intact (PAID — one image call)

1. With a fully-generated scene, click **Image** in the inspector.
2. **Expected:** image swaps in; video and audio remain the previous values. No new TTS or Veo call fires.
3. The variants array gets one new entry (image was a visual change).
