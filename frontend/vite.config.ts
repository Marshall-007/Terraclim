import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { themeColor, color } from './src/theme/tokens';

// GitHub Pages serves the app under /<repo>/, so CI builds set VITE_BASE.
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon.svg', 'icon-maskable.svg'],
      manifest: {
        name: 'Vino — Vineyard Irrigation Intelligence',
        short_name: 'Vino',
        description:
          'Know when to pour. Deficit-irrigation glide-path guidance for wine blocks.',
        theme_color: themeColor,
        background_color: color.paper,
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          {
            src: 'icon-maskable.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff,woff2}'],
        navigateFallback: `${base}index.html`,
        runtimeCaching: [
          {
            // Cache the last successful API responses so the app survives offline.
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'vino-api',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }) => url.hostname.includes('tile.openstreetmap.org'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'vino-osm-tiles',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 14 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Esri World Imagery satellite basemap (R10) — cached the same way
            // so the offline demo keeps its aerial view.
            urlPattern: ({ url }) => url.hostname.includes('arcgisonline.com'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'vino-esri-tiles',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 14 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          leaflet: ['leaflet', 'react-leaflet'],
          charts: ['recharts'],
        },
      },
    },
  },
  server: { port: 5173, host: true },
  preview: { port: 4173, host: true },
});
