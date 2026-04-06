import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  plugins: [react()],
  // Only VITE_-prefixed environment variables are exposed to the client bundle.
  // The API key is intentionally NOT injected here — it lives server-side in the Express proxy.
  envPrefix: 'VITE_',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    }
  }
});
