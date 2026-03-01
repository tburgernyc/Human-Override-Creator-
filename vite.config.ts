import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3005,
        host: '0.0.0.0',
        watch: {
          // Force polling on WSL-mounted Windows paths (/mnt/c/...) where
          // inotify events don't propagate from NTFS to WSL.
          usePolling: true,
          interval: 300,
        },
        proxy: {
          '/api': {
            target: `http://localhost:${env.PROXY_PORT || 3001}`,
            changeOrigin: true,
          },
        },
      },
      plugins: [react()],
      build: {
        chunkSizeWarningLimit: 600,
        rollupOptions: {
          output: {
            manualChunks: {
              'vendor-react':  ['react', 'react-dom'],
              'vendor-google': ['@google/genai', '@google/generative-ai'],
            },
          },
        },
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
