/// <reference types="vite/client" />

// Custom env vars used by the app. Augment ImportMetaEnv so `import.meta.env.X`
// is typed at every call site (replaces the prior `(import.meta as any).env`
// cast — CH3).
interface ImportMetaEnv {
  readonly VITE_PROXY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
