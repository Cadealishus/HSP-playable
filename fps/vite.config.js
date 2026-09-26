import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
  server: { host: '127.0.0.1' },
  optimizeDeps: { exclude: ['@dimforge/rapier3d-compat'] },
});
