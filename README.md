<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Human Override Creator

An AI-powered forensic-grade video production suite that transforms scripts into high-fidelity cinematic video through a multi-agent pipeline. Powered by Google Gemini, it features an embedded AI Director ("The Forensic Orchestrator") that audits, orchestrates, and quality-gates every stage of production — from script analysis to final mastering.

---

## Core Pipeline

### The Forensic Orchestrator (Director AI)

A context-aware production director powered by Gemini 2.5 Flash that enforces professional standards at every stage:

- **Discerning Eye** — Audits all generative inputs. Strips subjective descriptors ("stunning," "beautiful") and injects technical lens/lighting specifications. Enforces CharacterDNA consistency across every visual prompt.
- **Quality Gatekeeper** — Authorized to reject outputs below professional grade via three automated gates:
  - **Fidelity Gate**: Vision-based character drift and lighting consistency audit
  - **Density Gate**: Shot variety enforcement — auto-overrides framing after 3× consecutive same shot type
  - **Tone Gate**: Ensures narration maintains clinical, forensic delivery
- **Orchestration Logic** — Enforces an Audio-Led Master Clock workflow: TTS generates first, audio duration locks the timing, then visuals conform to the clock.
- **Action Matrix** — Four intervention protocols: HALT (character drift), INJECT (visual stagnation), TRIM (A/V sync mismatch), REPLACE (glamour/fantasy detection).

### Tiered Visual Quality Assurance (VQA)

A 3-tier verification system that maximizes quality while minimizing API cost:

| Tier | Method | Cost | Catches |
|------|--------|------|---------|
| **Tier 1** | Client-side canvas histogram analysis | FREE | Blank, overexposed, underexposed images |
| **Tier 2** | Text-only prompt specificity audit | ~400 tokens | Vague prompts before wasting image generation |
| **Tier 3** | Full vision model comparison vs Master Reference + CharacterDNA | ~3,000 tokens | Character drift, lighting inconsistency, anatomy errors |

Each scene has a **regeneration budget** (max 3 attempts across all gates) to prevent cascade loops.

---

## Video Output Quality

### Image Generation

All scene images are generated through Gemini's image model with forensic realism prompting:

- **Camera Profile**: ARRI Alexa Mini + Cooke S4 prime lenses
- **Film Stock**: 35mm grain with available-light aesthetic
- **Color Science**: Rec.709 compliant, naturalistic skin tones — no beauty filters, no HDR tonemapping
- **Texture Standard**: Visible pores, imperfections, and sweat at 4K — no airbrushing
- **Lighting**: Harsh shadows with naturalistic fall-off — no three-point beauty lighting, no ethereal glow
- **Prompt Sanitization**: Automatic stripping of subjective terms and injection of technical lens/lighting specs

### Audio & TTS

Multi-speaker text-to-speech with 13 emotional delivery modes:

| Standard | Forensic |
|----------|----------|
| Excited, Whispered, Serious | Clinical, Analytical, Ominous |
| Shouting, Empathetic, Sarcastic | Accusatory, Measured, Revelatory |

- **Scene-Level Batching**: Scenes with ≤2 speakers generate all dialogue in a single API call
- **Forensic Scene Moods**: Procedural, Interrogative, Ominous, Revelatory — applied as emotional register prefixes to TTS
- **50Hz System Hum**: Low-frequency sine wave mixed at -30dB into the final audio track for forensic facility ambiance

### Video Generation

Motion video generated via Veo 2.0 with cinematic camera movements:

- **Camera Motions**: Zoom In/Out, Pan Left/Right, Dolly In/Out, Static, Random Cinematic
- **Transitions**: Cut, Dissolve, Fade Black/White, Glitch, Zoom Transition, Whip Pan
- **Master Clock Conformance**: FFmpeg trims/pads video to match the exact TTS audio duration
- **Shot Types**: ELS, LS, MLS, MS, MCU, CU, ECU, OTS, POV, INSERT — with Density Gate auto-variety enforcement

### Final Mastering

Server-side FFmpeg rendering with broadcast-quality settings:

- **Video**: H.264, CRF 16, slow preset, YUV420p, up to 1920×1080
- **Audio**: AAC, 48kHz, 192kbps
- **Loudness**: Netflix-spec normalization — **-27 LKFS** integrated, **-2 dB True Peak**, LRA 7
- **System Hum**: 50Hz forensic ambiance at -30dB
- **A/V Sync**: Automatic duration conformance via Master Clock

---

## Production Workflow

```
Script Input → Forensic Orchestrator Analysis
    ↓
Scene Extraction + Character Identification
    ↓
Voice Assignment + CharacterDNA Synthesis
    ↓
Audio-Led Master Clock (TTS generates first → locks timing)
    ↓
Prompt Sanitization → Image Generation → VQA Tiered Audit
    ↓
Video Generation (Veo 2) → FFmpeg Duration Conform
    ↓
Final Mastering (loudnorm + system hum + overlays)
    ↓
Export (MP4 / WebM)
```

---

## Performance Optimizations

The pipeline includes 13+ documented optimizations to minimize API costs:

- **Phase-Aware Context Pruning**: Director receives only data relevant to the current phase (~25-30% token savings)
- **System Instruction Caching**: Director prompt cached for 1 hour (saves ~1,500 tokens/call)
- **Asset Cache with DNA Hash**: IndexedDB cache keyed on prompt + style + resolution + CharacterDNA — prevents stale images and redundant API calls
- **Scene-Level TTS Batching**: 33-50% fewer TTS API calls for scenes with ≤2 speakers
- **Dynamic Output Scaling**: `maxOutputTokens` scales to script complexity — up to 80% savings on short scripts
- **Compressed Context**: Narrator lines and character descriptions truncated to essential fields
- **VQA Gate-Aware Suppression**: Intervention engine skips redundant audits on VQA-validated content

---

## Architecture

- **Frontend**: React + Vite + TypeScript
- **Backend**: Node.js + Express (`server/proxy.ts`)
- **AI Models**: Google Gemini 2.5 Flash (text, image, vision, TTS) + Veo 2.0 (video)
- **Media Processing**: FFmpeg via `fluent-ffmpeg` + `@ffmpeg-installer/ffmpeg`
- **Asset Caching**: IndexedDB with LRU eviction
- **Deployment**: Railway / Heroku via `railway.toml` + `Procfile`

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- A [Google Gemini API Key](https://aistudio.google.com/app/apikey)

### Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```env
   # .env.local
   GEMINI_API_KEY=your_api_key_here
   ```

3. **Run locally** (two terminals):

   ```bash
   # Terminal 1 — Frontend (port 3005)
   npm run dev

   # Terminal 2 — Backend proxy (port 3001)
   npm run server
   ```

### Production Deployment

```bash
npm run build
npm run start
```

Includes `railway.toml` and `Procfile` for Railway/Heroku. The backend serves the compiled Vite frontend directly in production.
