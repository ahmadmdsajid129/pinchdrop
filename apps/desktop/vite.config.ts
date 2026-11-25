import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Three pages: index.html (main window), pill.html (always-on-top pill / Island) and
// overlay.html (full-screen, click-through hand tracking shown only while the camera is on).
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  resolve: {
    alias: {
      '@pinchdrop/gesture-core': path.resolve(__dirname, '../../packages/gesture-core/src/index.ts'),
    },
  },
  server: {
    port: 5174,
    strictPort: true,
  },
  build: {
    target: 'es2021',
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        pill: path.resolve(__dirname, 'pill.html'),
        overlay: path.resolve(__dirname, 'overlay.html'),
      },
    },
  },
});
