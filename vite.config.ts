import { defineConfig } from 'vitest/config';

// GitHub Pages serves the site from /primordial/. Local dev and preview use /.
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 800,
  },
  server: {
    host: true,
    port: 5173,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
