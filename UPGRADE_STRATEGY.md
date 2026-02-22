# Human Override — Production Upgrade Strategy
## Elevating to Disney / Netflix Series Quality

**Document Date:** February 2026
**Codebase Audited:** Full stack — 30+ components, 4 services, proxy server
**Status:** Ready for Executive Review

---

## Part 1 — Audit Findings

### 1.1 Character Image Generation

| Issue | Severity | Current Code | Impact |
|-------|----------|-------------|--------|
| No structured physical attribute breakdown | Critical | `CharacterModal.tsx` — single free-text `visualPrompt` textarea | Characters drift appearance across scenes because prompts are written inconsistently |
| No character bible / reference sheet generation pass | Critical | Characters are analyzed inline during script parsing only | No canonical reference image is generated before scenes start |
| Reference images are optional and not propagated | High | `generateSceneImage()` accepts optional `referenceImageBase64` | Most scenes are generated without any visual reference anchor |
| Naive consistency auditing | High | `ContinuityAuditor.calculateVisualSimilarity()` — word-matching only | False positives/negatives; no actual visual comparison |
| Single model for all image generation | Medium | `gemini-2.5-flash-image` used for all images | Preview model; Imagen 3 offers higher quality and better instruction-following |
| No prompt quality gate before generation | Medium | Images generated from raw `visualPrompt` | Low-quality prompts produce low-quality images with no warning |
| No seed persistence | Medium | Seed not consistently propagated or stored per-character | Regenerating a character image may produce a completely different person |

### 1.2 Video Clip Generation

| Issue | Severity | Current Code | Impact |
|-------|----------|-------------|--------|
| No img2video anchoring across scenes | Critical | `generateSceneVideo()` sends text prompt only | Each clip is generated from scratch; visual style discontinuity between scenes |
| No scene-to-scene color continuity | High | VFX profiles applied post-generation as CSS filters | Color temperature and lighting may clash between consecutive clips |
| No shot variety enforcement | High | Scene descriptions drive framing, but no system enforces a wide/medium/CU mix | Productions can end up with all medium shots — no cinematic depth |
| 8-second clip ceiling | High | Veo API hard limit on preview model | Long scenes require multiple clips stitched manually |
| No motion continuity between clips | Medium | Each Veo call is independent | Character position, eyeline, and screen direction can break between cuts |
| No camera language vocabulary | Medium | `cameraMotion` is a free-text field | No standardized shot types (OTS, POV, Dutch angle) enforced |

### 1.3 Audio Pipeline

| Issue | Severity | Current Code | Impact |
|-------|----------|-------------|--------|
| 2-speaker TTS batch limit (API constraint) | High | `generateSceneAudio()` batches max 2 speakers | Multi-character scenes require multiple API calls; timing can drift |
| No audio mastering pass | High | AudioMixer provides volume sliders only | No normalization, EQ, or compression; levels are uneven |
| No automatic audio ducking | Medium | Music and dialogue play at fixed volumes | Dialogue gets buried under music |
| No ambient/room tone generation | Medium | No background environment audio | Scenes feel sterile without ambient presence |
| Music limited to Wikimedia OGG tracks | Medium | `constants.ts` hardcodes ~10 OGG URLs | Limited mood range; tracks may not loop cleanly |

### 1.4 Rendering Pipeline

| Issue | Severity | Current Code | Impact |
|-------|----------|-------------|--------|
| Browser Canvas API + MediaRecorder | High | `Renderer.tsx` encodes video in-browser | No hardware acceleration; poor performance on long timelines; WebM-only |
| CSS filter LUT simulation | High | `VFXMaster.tsx` — all LUT presets are `filter: brightness() contrast() ...` strings | Not real LUT processing; colors shift non-linearly and unexpectedly |
| No proper frame-rate control | Medium | Canvas recorder targets 25fps with `requestAnimationFrame` | Inconsistent frame delivery under load causes stuttering |
| No HDR support | Medium | 8-bit canvas drawing context | Highlights clip; no wide-gamut output |
| No audio/video sync correction | Medium | Audio offset applied as a fixed delay | Sync can drift on long renders |

### 1.5 Project Architecture

| Issue | Severity | Current Code | Impact |
|-------|----------|-------------|--------|
| All state in localStorage | High | `assetCache.ts` — 10MB max, 50 entry LRU | Asset eviction destroys generated content; no cloud persistence |
| No undo/redo stack | Medium | `useState` only, no history | A misclick can destroy work irreversibly |
| API key in `.env` and `.env.local` | Medium | Both files contain live key | Security risk if repo is accidentally shared |
| No project versioning | Low | Single project object | Cannot roll back to a prior creative direction |

---

## Part 2 — Upgrade Strategy

Upgrades are organized into three tiers by effort and impact. Each tier can be executed independently. Complete Tier 1 before Tier 2.

---

## Tier 1 — Foundation (Weeks 1–3)
### "Fix the bones" — These unlock everything above them

---

### UPGRADE 1.1 — Structured Character Bible System

**Goal:** Replace the free-text visual prompt with a structured character specification that produces consistent, reproducible prompt injections.

**Files to modify:** `types.ts`, `CharacterModal.tsx`, `services/gemini.ts`, `App.tsx`

**Implementation Steps:**

1. **Extend the `Character` type in `types.ts`:**
```typescript
interface CharacterPhysical {
  age: string;           // e.g. "late 30s"
  build: string;         // e.g. "athletic, broad-shouldered"
  height: string;        // e.g. "6'2\""
  skinTone: string;      // e.g. "warm brown, South Asian complexion"
  hairColor: string;     // e.g. "jet black"
  hairStyle: string;     // e.g. "close-cropped undercut"
  eyeColor: string;      // e.g. "dark brown, almond-shaped"
  facialFeatures: string; // e.g. "strong jaw, high cheekbones, light stubble"
  distinctiveMarks: string; // e.g. "scar above left eyebrow"
  typicalAttire: string; // e.g. "tailored charcoal suit, no tie"
  colorPalette: string;  // e.g. "cool blues and grays"
}

interface Character {
  // ...existing fields...
  physical: CharacterPhysical;
  canonicalSeed?: number;       // Seed used to generate the approved reference image
  referenceImageBase64?: string; // The approved canonical reference image
  referenceImageApproved?: boolean; // User has approved this as the canonical look
}
```

2. **Update `CharacterModal.tsx`** to replace the single textarea with structured fields organized in labeled sections: Identity, Face, Body, Style. Auto-assemble the `visualPrompt` string from these fields on save so the AI-facing prompt is always deterministic.

3. **Add a `buildCanonicalPrompt(character: Character): string` utility** in `services/gemini.ts` that assembles a full, consistent prompt from `CharacterPhysical`. Example output:
```
[CHARACTER: Maya Chen] A woman in her late 30s with an athletic build and warm brown South Asian complexion. Jet black close-cropped undercut hair. Dark brown almond-shaped eyes. Strong jaw, high cheekbones, light stubble. Scar above left eyebrow. Wearing tailored charcoal suit. Cool blue-gray color palette. Consistent character appearance throughout.
```

4. **Inject this canonical prompt as a mandatory prefix** in every scene's `visualPrompt` when that character appears. Do not let scene-level prompts override physical descriptors.

---

### UPGRADE 1.2 — Character Reference Sheet Generation Pass

**Goal:** Generate a set of 4 canonical reference images per character (front/3-quarter/profile/expression) before any scene generation begins. Lock the approved image as `referenceImageBase64`.

**Files to modify:** `services/gemini.ts`, `App.tsx`, `components/CharacterModal.tsx`

**Implementation Steps:**

1. **Add `generateCharacterReferenceSheet()` to `services/gemini.ts`:**
```typescript
export async function generateCharacterReferenceSheet(
  character: Character,
  style: VisualStyle
): Promise<{ front: string; threeQuarter: string; profile: string; expression: string }> {
  const basePrompt = buildCanonicalPrompt(character);
  const shots = [
    { key: 'front',        angle: 'straight-on portrait, neutral expression, soft studio lighting' },
    { key: 'threeQuarter', angle: 'three-quarter view, slight smile, rembrandt lighting' },
    { key: 'profile',      angle: 'side profile, dramatic side lighting' },
    { key: 'expression',   angle: 'emotional close-up, intense expression, fill light only' },
  ];
  // Generate all 4 in parallel
  const results = await Promise.all(
    shots.map(s => generateSceneImage(`${basePrompt}, ${s.angle}, character reference sheet`, style, '1:1', '1024x1024', character.canonicalSeed))
  );
  return { front: results[0], threeQuarter: results[1], profile: results[2], expression: results[3] };
}
```

2. **Add a "Generate Reference Sheet" button** in `CharacterModal.tsx`. Display the 4 images in a 2×2 grid. Let the user click one to mark it as the canonical `referenceImageBase64`.

3. **Gate scene generation on reference approval** in `App.tsx`: if a character appears in a scene and `referenceImageApproved !== true`, show a warning and offer to generate the reference sheet first.

---

### UPGRADE 1.3 — AI-Powered Continuity Auditor

**Goal:** Replace the naive word-matching `calculateVisualSimilarity()` with a Gemini Vision call that actually compares the generated scene images.

**Files to modify:** `components/ContinuityAuditor.tsx`, `services/gemini.ts`

**Implementation Steps:**

1. **Add `auditCharacterConsistency()` to `services/gemini.ts`:**
```typescript
export async function auditCharacterConsistency(
  character: Character,
  sceneImages: Array<{ sceneId: number; sceneTitle: string; imageBase64: string }>
): Promise<Array<{ sceneId: number; score: number; issues: string[]; suggestions: string[] }>> {
  const prompt = `You are a visual continuity supervisor for a professional film production.

CHARACTER SPEC: ${buildCanonicalPrompt(character)}
REFERENCE IMAGE: [attached as first image]

For each of the ${sceneImages.length} scene images provided, analyze:
1. Does the character's face match the reference? (0-100 score)
2. Is hair color/style consistent?
3. Is clothing consistent with their established wardrobe?
4. Are any distinctive marks visible and correct?
5. What specific continuity errors exist?

Return a JSON array with one object per scene image.`;

  const parts = [
    { text: prompt },
    { inlineData: { mimeType: 'image/png', data: character.referenceImageBase64! } },
    ...sceneImages.map(img => ({ inlineData: { mimeType: 'image/png', data: img.imageBase64 } }))
  ];
  // Call gemini-2.5-flash with vision; parse JSON response
}
```

2. **Update `ContinuityAuditor.tsx`** to call this function when scene images are available, display per-scene scores with issue callouts, and replace the word-matching score bar with actual AI vision results.

3. **Fix `text-crimson-red` and `bg-crimson-red/10`** in `ContinuityAuditor.tsx` — change to `text-red-500` and `bg-red-500/10` (standard Tailwind). This is the same undefined color bug that was already fixed in `App.tsx`.

---

### UPGRADE 1.4 — Seed-Locked Character Generation

**Goal:** Store the random seed used to generate the approved reference image and use the same seed for all subsequent generations of that character.

**Files to modify:** `services/gemini.ts`, `types.ts`, `App.tsx`

**Implementation Steps:**

1. When a reference image is approved in `CharacterModal`, store the seed used:
```typescript
character.canonicalSeed = seedUsedForGeneration;
character.referenceImageApproved = true;
```

2. In `generateSceneImage()`, when a character reference image is provided, also pass `canonicalSeed` as the generation seed. This maximizes consistency even when the model cannot perfectly follow the reference image.

3. In `assetCache.ts`, include `canonicalSeed` in the hash key for character-containing images.

---

### UPGRADE 1.5 — Asset Cache: IndexedDB Upgrade

**Goal:** Replace the 10MB localStorage asset cache with an IndexedDB-backed cache supporting 500MB+, video storage, and true LRU with per-asset metadata.

**Files to modify:** `services/assetCache.ts`

**Implementation Steps:**

1. Replace `localStorage.getItem/setItem` with `indexedDB` operations using a simple wrapper:
```typescript
const DB_NAME = 'human_override_assets_v2';
const STORE_NAME = 'assets';
const MAX_SIZE_BYTES = 500 * 1024 * 1024; // 500MB

// Open DB with schema migration support
async function openDB(): Promise<IDBDatabase> { ... }

// Store and retrieve base64 data URIs and video blobs
export async function getCachedAsset(key: string): Promise<string | null> { ... }
export async function cacheAsset(key: string, data: string, meta: AssetMeta): Promise<void> { ... }
```

2. Add video URL caching: store the video `blobUrl` created from `ArrayBuffer` and revoke old URLs on eviction.

3. Separate cache buckets for `images`, `videos`, `audio` with individual size limits.

---

## Tier 2 — Visual & Video Quality (Weeks 4–7)
### "Build the look" — Disney/Netflix level visual consistency

---

### UPGRADE 2.1 — Image-to-Video Scene Anchoring

**Goal:** Generate each video clip from the approved scene still image rather than text only, ensuring visual continuity between the still and the motion clip.

**Files to modify:** `services/gemini.ts`

**Implementation Steps:**

1. **Update `generateSceneVideo()` to accept and use the scene's approved still image:**
```typescript
export async function generateSceneVideo(
  scene: Scene,
  style: VisualStyle,
  referenceImageBase64?: string  // Scene's approved still
): Promise<VideoResult> {
  const request: any = {
    model: VIDEO_MODEL,
    prompt: scene.videoPrompt || scene.visualPrompt,
    config: {
      aspectRatio: scene.aspectRatio,
      durationSeconds: scene.duration || 8,
      numberOfVideos: 1,
    }
  };

  // If we have a reference still, use image-to-video mode
  if (referenceImageBase64) {
    request.image = {
      imageBytes: referenceImageBase64,
      mimeType: 'image/png'
    };
  }
  // ... rest of polling loop
}
```

2. **Auto-generate the scene still first** if it doesn't exist, then pass it into the video generation. Display this as a two-step process in `SceneCard.tsx` ("Generating still... → Generating motion...").

---

### UPGRADE 2.2 — Shot List Enforcement System

**Goal:** Enforce cinematic shot variety — no production should have all medium shots.

**Files to modify:** `types.ts`, `services/gemini.ts`, `components/SceneCard.tsx`, `App.tsx`

**Implementation Steps:**

1. **Add `shotType` field to `Scene` type:**
```typescript
type ShotType =
  | 'ELS'   // Extreme Long Shot
  | 'LS'    // Long Shot
  | 'MLS'   // Medium Long Shot
  | 'MS'    // Medium Shot
  | 'MCU'   // Medium Close-Up
  | 'CU'    // Close-Up
  | 'ECU'   // Extreme Close-Up
  | 'OTS'   // Over-the-Shoulder
  | 'POV'   // Point of View
  | 'INSERT'; // Insert/Cutaway
```

2. **Add `assignShotList()` to `services/gemini.ts`** that analyzes all scenes and assigns shot types following the 3-act rule of thirds (act 1: establishing shots; act 2: medium shots + close-ups; act 3: close-ups + wide catharsis). Returns an updated scenes array.

3. **Inject shot type descriptor into visual prompt** before generation: `"[SHOT: MCU] ${scene.visualPrompt}"`.

4. **Add a "Shot List" view** in `StoryboardView` showing the shot type distribution as a visual bar chart so the director can see at a glance if the production is shot-type-diverse.

---

### UPGRADE 2.3 — Real LUT Color Grading Pipeline

**Goal:** Replace CSS filter LUT simulations with actual 3D LUT processing using WebGL.

**Files to modify:** `components/VFXMaster.tsx`, `components/Renderer.tsx`

**Implementation Steps:**

1. **Create `services/lutProcessor.ts`** — a WebGL-based 3D LUT applier:
```typescript
// Load a .cube LUT file and apply it to a canvas frame via WebGL
export class LUTProcessor {
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private lutTexture: WebGL3DTexture;

  async loadLUT(lutUrl: string): Promise<void> { ... }
  applyToCanvas(sourceCanvas: HTMLCanvasElement, destCanvas: HTMLCanvasElement): void { ... }
}
```

2. **Bundle 5 professional `.cube` LUT files** in `public/luts/`:
   - `kodak_5219.cube` — Warm film stock (Documentary)
   - `fuji_3510.cube` — Cool, desaturated (Thriller)
   - `bleach_bypass.cube` — High contrast silver (Noir)
   - `vintage_faded.cube` — Faded matte (Period drama)
   - `clean_rec709.cube` — Neutral broadcast (Corporate)

3. **Apply the LUT in `Renderer.tsx`** during the canvas frame drawing loop, after compositing each image:
```typescript
const frameCanvas = document.createElement('canvas');
// ... draw image frame ...
if (lutProcessor && selectedLUT) {
  lutProcessor.applyToCanvas(frameCanvas, outputCanvas);
} else {
  outputCtx.drawImage(frameCanvas, 0, 0);
}
```

4. **Update `VFXMaster.tsx`** to select actual LUT files by name and pass the selection to the Renderer.

---

### UPGRADE 2.4 — Scene Lighting Consistency System

**Goal:** Establish a global lighting brief that is injected into every scene prompt to prevent jarring light/shadow discontinuities.

**Files to modify:** `types.ts`, `App.tsx`, `services/gemini.ts`, `components/VFXMaster.tsx`

**Implementation Steps:**

1. **Add `lightingBrief` to `ProjectState`:**
```typescript
interface LightingBrief {
  keyLightDirection: 'left' | 'right' | 'front' | 'top' | 'rim';
  colorTemperature: 'warm 3200K' | 'neutral 5600K' | 'cool 7500K' | 'mixed';
  shadowIntensity: 'soft' | 'medium' | 'hard';
  timeOfDay: 'golden hour' | 'midday' | 'blue hour' | 'night' | 'interior';
  moodDescriptor: string; // e.g. "chiaroscuro, dramatic Renaissance painting lighting"
}
```

2. **Add a Lighting Brief editor** in `VFXMaster.tsx` — simple dropdowns for each field, with a preview text showing the assembled lighting descriptor.

3. **Prepend the lighting descriptor** to every generated image and video prompt in `generateSceneImage()` and `generateSceneVideo()`.

---

### UPGRADE 2.5 — Multi-Pass Prompt Enrichment

**Goal:** Run a prompt enrichment pass before every generation call to ensure prompts reach Disney/Pixar/Netflix cinematic quality standards.

**Files to modify:** `services/gemini.ts`

**Implementation Steps:**

1. **Add `enrichVisualPrompt()` to `services/gemini.ts`:**
```typescript
export async function enrichVisualPrompt(
  rawPrompt: string,
  style: VisualStyle,
  shotType: ShotType,
  lightingBrief: LightingBrief,
  characters: Character[]
): Promise<string> {
  const systemPrompt = `You are a senior cinematographer and visual development artist.
Expand this scene prompt to Disney/Pixar/Netflix production quality.
Add: specific lens choice (e.g. 85mm f/1.4), depth of field, lighting setup, color palette,
texture detail, atmospheric elements, and composition framing.
Do NOT change what happens — only elevate the visual language.
Keep output under 200 words. Return enriched prompt only.`;
  // gemini-2.0-flash call (cheap, fast)
}
```

2. **Call this before every `generateSceneImage()` and `generateSceneVideo()` call** in `App.tsx`. Display a "Enriching prompt..." step in the generation progress UI.

---

## Tier 3 — Production Infrastructure (Weeks 8–12)
### "Build the studio" — Professional pipeline for series production

---

### UPGRADE 3.1 — Server-Side Rendering Pipeline (FFmpeg)

**Goal:** Move video encoding from the browser Canvas/MediaRecorder to server-side FFmpeg, enabling H.264/H.265 output, proper frame rate control, real LUT application, and 4K capability.

**Files to modify:** `server/proxy.ts` → `server/renderer.ts` (new), `components/Renderer.tsx`

**Implementation Steps:**

1. **Create `server/renderer.ts`** — Express endpoint that accepts image frames + audio and runs FFmpeg:
```typescript
app.post('/api/render', async (req, res) => {
  const { frames, audio, fps, resolution, lut, outputFormat } = req.body;
  // Write frames to temp directory
  // Run: ffmpeg -r {fps} -i frame_%04d.png -i audio.mp3
  //   -vf "lut3d={lut}" -c:v libx264 -crf 18 -preset slow output.mp4
  // Stream the output back
});
```

2. **Install `fluent-ffmpeg`** on the server: `npm install fluent-ffmpeg @ffbin/ffmpeg-static`

3. **Update `Renderer.tsx`** to send collected frames + audio to `/api/render` instead of using MediaRecorder. Show server-side progress via a polling `/api/render/status/:jobId` endpoint.

4. **Output formats:** MP4 (H.264 for broad compatibility), MOV (ProRes 422 for editing), WebM (VP9 for web). Let user choose.

---

### UPGRADE 3.2 — Automatic Audio Ducking & Mastering

**Goal:** Implement automatic audio ducking so music drops under dialogue, and a mastering pass that normalizes all scene audio to -14 LUFS.

**Files to modify:** `server/proxy.ts` or new `server/audio.ts`, `App.tsx`, `components/AudioMixer.tsx`

**Implementation Steps:**

1. **Server-side audio mastering endpoint** using FFmpeg:
```bash
# Normalize dialogue to -14 LUFS
ffmpeg -i dialogue.wav -af loudnorm=I=-14:LRA=11:TP=-1.5 dialogue_normalized.wav

# Duck music under dialogue using sidechain
ffmpeg -i music.mp3 -i dialogue.wav \
  -filter_complex "[0:a]volume=0.8[music];[music][1:a]sidechaincompress=threshold=0.1:ratio=4:release=1000[out]" \
  -map "[out]" mixed.mp3
```

2. **Add a "Master Audio" button** in `AudioMixer.tsx` that submits all scene audio + music selections to this endpoint.

3. **Add ambient sound generation** via a Gemini text prompt → sound description → royalty-free sound library API (Freesound.org or Pixabay) lookup. Each scene gets an ambient layer (crowd murmur, wind, interior hum, etc.).

---

### UPGRADE 3.3 — Character Consistency Score Dashboard

**Goal:** A dedicated production dashboard showing character consistency scores across all scenes, with one-click re-generation of failing scenes.

**Files to modify:** New `components/ConsistencyDashboard.tsx`, `App.tsx`

**Implementation Steps:**

1. **Create `ConsistencyDashboard.tsx`** with:
   - Per-character consistency score radar chart (face/hair/clothing/marks)
   - Scene-by-scene heatmap (green = consistent, yellow = minor issues, red = fails)
   - "Fix All Failing Scenes" batch action
   - Before/after comparison view for each scene

2. **Run consistency audit automatically** after each batch generation completes in `App.tsx`.

3. **Add consistency thresholds** to quality gates in `workflowOrchestrator.ts`: block progression to Post phase if any character's average consistency score is below 75.

---

### UPGRADE 3.4 — Project Versioning & Cloud Persistence

**Goal:** Replace localStorage-only persistence with server-side project storage, version history, and export/import.

**Files to modify:** `server/proxy.ts` → new `server/projects.ts`, `App.tsx`

**Implementation Steps:**

1. **Create `server/projects.ts`** with endpoints:
   - `POST /api/projects` — create/save project
   - `GET /api/projects` — list all projects
   - `GET /api/projects/:id` — load project
   - `POST /api/projects/:id/versions` — save named version snapshot
   - `GET /api/projects/:id/versions` — list version history

2. **Use SQLite** (via `better-sqlite3`) for project metadata + store asset files in `./data/assets/` directory with UUID filenames.

3. **Add 20-state undo/redo** to `App.tsx` using a `history: ProjectState[]` + `historyIndex: number` state pair. Key operations (scene edit, delete, character change) push to history.

4. **Migrate existing localStorage project on first load** to the server store.

---

### UPGRADE 3.5 — Director AI Upgrade: Vision-Capable Scene Analysis

**Goal:** Give the Director Assistant access to the actual generated images so it can give feedback based on what it sees, not just what the prompt says.

**Files to modify:** `server/proxy.ts` director endpoint, `services/gemini.ts handleDirectorChat()`, `components/DirectorAssistant.tsx`

**Implementation Steps:**

1. **Update `/api/director/chat`** to accept `sceneImages` alongside messages:
```typescript
app.post('/api/director/chat', async (req, res) => {
  const { messages, currentPhase, projectName, lastAction, sceneImages } = req.body;
  // Pass sceneImages as inlineData parts to the vision-capable model
  // Use gemini-2.5-flash (vision) instead of gemini-2.0-flash (text only)
});
```

2. **Pass the top 5 generated scene images** with every Director chat message — the Director can now say "I see that scene 3 has inconsistent lighting" instead of only analyzing text.

3. **Add new Director tools:**
   - `analyze_color_palette` — extract dominant colors from scene images and suggest grade
   - `flag_continuity_error` — mark a scene as needing re-generation with explanation
   - `suggest_transition` — recommend a specific transition between two scenes based on their content

---

## Part 3 — Quick Wins (Can Be Done Immediately)

These require minimal effort but have visible quality impact:

| Fix | File | Change |
|-----|------|--------|
| Fix `text-crimson-red` in ContinuityAuditor | `ContinuityAuditor.tsx` | Change to `text-red-500` and `bg-red-500/10` |
| Increase cache size | `services/assetCache.ts` | Change `MAX_SIZE_BYTES` to `50 * 1024 * 1024` (50MB) and `MAX_ENTRIES` to 200 |
| Add character descriptor to every scene prompt | `services/gemini.ts` | Prefix each scene's visual prompt with the assembled character canonical prompt for all characters appearing in that scene |
| Add aspect ratio label to scene cards | `components/SceneCard.tsx` | Show `[16:9]` / `[9:16]` / `[1:1]` chip on each scene card |
| Store seed per scene in `ProjectState` | `types.ts`, `App.tsx` | Add `seed?: number` to `GeneratedAssets`; store it when an image is generated so retries use the same seed |
| Add `gemini-2.5-flash` to image model options | `constants.ts`, `services/gemini.ts` | The preview model is being replaced; expose model selection to power users |
| Show generation cost estimate | `App.tsx` | Count total scenes × ~$0.003/image + videos × ~$0.07/clip before batch generation |

---

## Part 4 — Model Recommendations

| Use Case | Current Model | Recommended Upgrade | Reason |
|----------|--------------|--------------------|---------|
| Image Generation | `gemini-2.5-flash-image` | **Imagen 3** (`imagen-3.0-generate-002`) | Imagen 3 is Gemini's dedicated image model — significantly better photorealism, instruction-following, and text rendering |
| Video Generation | `veo-2.0-generate-preview` | **Veo 2** (stable, not preview) when available | Preview model; stable release will have longer clip duration and better consistency |
| Director Chat | `gemini-2.0-flash` | **`gemini-2.5-flash`** | 2.5-flash has vision capability — can actually see generated images |
| Continuity Audit | Word matching (no AI) | **`gemini-2.5-flash`** with image inputs | Can compare character appearance visually |
| Prompt Enrichment | N/A | **`gemini-2.0-flash`** | Fast and cheap; use for prompt enrichment pass |

---

## Part 5 — Execution Order Summary

```
WEEK 1-2  │ Quick Wins (immediate quality improvement)
           │ Upgrade 1.1 (Structured Character Bible)
           │ Upgrade 1.3 (Fix ContinuityAuditor — color bug + AI vision)
           │
WEEK 3    │ Upgrade 1.2 (Reference Sheet Generation)
           │ Upgrade 1.4 (Seed-Locked Generation)
           │ Upgrade 1.5 (IndexedDB Cache)
           │
WEEK 4-5  │ Upgrade 2.1 (Image-to-Video Anchoring)
           │ Upgrade 2.2 (Shot List Enforcement)
           │ Upgrade 2.4 (Lighting Consistency)
           │
WEEK 6-7  │ Upgrade 2.3 (Real LUT Pipeline with WebGL)
           │ Upgrade 2.5 (Multi-Pass Prompt Enrichment)
           │
WEEK 8-9  │ Upgrade 3.1 (Server-Side FFmpeg Rendering)
           │ Upgrade 3.2 (Audio Ducking & Mastering)
           │
WEEK 10-12│ Upgrade 3.3 (Consistency Score Dashboard)
           │ Upgrade 3.4 (Project Versioning & Cloud Persistence)
           │ Upgrade 3.5 (Director Vision Capability)
```

---

## Part 6 — What This Achieves

After completing all three tiers, the Human Override system will have:

- **Character visual consistency** comparable to VFX pipelines — structured canonical reference, seed-locked generation, and AI vision continuity scoring instead of keyword matching
- **Shot language diversity** enforced by a system that understands 180-degree rule, shot-reverse-shot patterns, and rule of thirds without manual intervention
- **Real color grading** via WebGL 3D LUT processing on every frame — not CSS filter approximations
- **img2video continuity** — each video clip animated from its approved scene still, eliminating the jarring visual drift between still and motion
- **Professional audio** — LUFS-normalized dialogue, automatic music ducking, ambient layering
- **H.264/ProRes output** via server-side FFmpeg instead of browser-encoded WebM — files deliverable to any edit suite
- **500MB+ asset persistence** via IndexedDB — generated assets survive across sessions and tabs
- **20-state undo/redo** and project versioning — no more irreversible misclicks
- **Vision-capable Director AI** — gives feedback based on what it actually sees in the generated images

This moves the production pipeline from "browser toy with AI features" to a professional-grade pre-production and pre-visualization tool on par with cloud-based studio production platforms.

---

*End of Upgrade Strategy Document*
