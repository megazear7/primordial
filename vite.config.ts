import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages uses /primordial/. A future custom domain sets BASE_PATH=/ (or leaves it unset).
const base = process.env.BASE_PATH || '/';

export default defineConfig({
  base,
  plugins: [
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: 'Primordial',
        short_name: 'Primordial',
        description: 'A watery microbial colony simulation.',
        lang: 'en',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'any',
        background_color: '#01080a',
        theme_color: '#021014',
        categories: ['games', 'entertainment'],
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/icon-maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
      },
    }),
  ],
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
