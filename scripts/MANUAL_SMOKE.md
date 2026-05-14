# Manual Smoke Verification

Run after Phase 2/3 changes to confirm video output quality.

## 1. Helper unit tests (automated)

```bash
node scripts/smoke-helpers.test.mjs
```

Validates: `pickMimeType` fallback order, `computeBitrate` scaling, `sniffWavHeader` WAV detection, `stripDataUriPrefix`, `parseJsonResponse`.

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

1. In DevTools → **Application** tab → **Local Storage** → `http://localhost:3000` → find the key `human_override_active_project_v7`. (If absent, click "New Project" in the app once to create one, then look again.)
2. Click the value to edit it. Find the `mastering` object and change `"lutPreset"` to `"kodak_5219"` (a legacy value that no longer exists in the new enum). Save (Enter or click outside).
3. Hard-refresh the page (Ctrl+Shift+R).
4. Click **"Open VFX Synthesis Lab"** (the gold button with the wand-sparkles icon).
5. **Expected:** The LUT dropdown/selector shows **"Kodak Vision3 250D"** as the currently-selected preset. **No** red errors in the Console.

Repeat with each legacy value to confirm all four map paths work:

| Set `lutPreset` to | After refresh, VFXMaster should show |
|---|---|
| `kodak_5219` | Kodak Vision3 250D |
| `fuji_400h` | Fuji Eterna 250D |
| `noir` | Bleach Bypass |
| `technicolor` | Kodak 2383 Print |
| `garbage_value` | Bypass (None) |

Set `lutPreset` back to `"none"` when done.

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
