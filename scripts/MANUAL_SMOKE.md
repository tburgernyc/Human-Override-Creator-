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
