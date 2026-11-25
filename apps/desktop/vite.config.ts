import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Two pages: index.html (main window) and pill.html (always-on-top pill / Island).
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
      },
    },
  },
});
