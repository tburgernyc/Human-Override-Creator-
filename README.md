<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Human Override Creator

An AI-powered professional video creation tool featuring an embedded expert creative AI ("The Director") that proactively guides users through complex creative workflows.

## 🚀 Features

- **The Director AI Assistant:** A proactive, context-aware AI powered by Google Gemini (2.0 Flash) that provides specific, actionable steps based on your current workflow phase.
- **Vision Integration:** Incorporates Gemini 2.5 Flash to analyze scene images alongside chat history for deep, visual-level creative guidance.
- **Secure Architecture:** An Express backend securely proxies all Gemini API requests and handles video downloads, ensuring your API keys are never exposed to the client browser.
- **Server-Side Video Rendering:** Uses `fluent-ffmpeg` to securely and efficiently render frames into high-quality MP4 videos.
- **Project Persistence:** Save, load, and manage your creative projects seamlessly.

## 📋 Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- A [Google Gemini API Key](https://aistudio.google.com/app/apikey)

## 🛠️ Getting Started

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure Environment Variables:**
   Rename or copy `.env.example` to `.env.local` and add your API key:
   ```env
   GEMINI_API_KEY=your_api_key_here
   ```

3. **Run the Application Locally:**
   Developing locally requires running both the Vite frontend server and the Express backend proxy server in separate terminal windows:

   **Terminal 1:** Start the frontend preview (runs on port 3005 by default)
   ```bash
   npm run dev
   ```
   
   **Terminal 2:** Start the backend proxy server (runs on port 3001 by default)
   ```bash
   npm run server
   ```

## 🏗️ Architecture

- **Frontend:** React + Vite + TypeScript (Tailwind CSS / styled components)
- **Backend:** Node.js + Express (`server/proxy.ts`)
- **AI Models:** `@google/genai` and `@google/generative-ai`
- **Media Processing:** `@ffmpeg-installer/ffmpeg` and `fluent-ffmpeg`

## 🌍 Production Deployment

This application includes a `railway.toml` and `Procfile` for convenient hosting on platforms like Railway or Heroku. In a production environment, the backend serves the compiled static Vite frontend directly.

1. Build the production frontend:
   ```bash
   npm run build
   ```
2. Start the production server:
   ```bash
   npm run start
   ```
