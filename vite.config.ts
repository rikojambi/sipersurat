import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icon-192.svg', 'icon-512.svg'],
      manifest: {
        name: 'SIPERSURAT — Buku Agenda Surat Sekolah',
        short_name: 'SIPERSURAT',
        description: 'Sistem Informasi Pengelolaan Surat Masuk dan Surat Keluar SMKN 6 Muaro Jambi',
        lang: 'id',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0f172a',
        theme_color: '#1e3a8a',
        icons: [
          { src: 'icon-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any maskable' },
          { src: 'icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' }
        ],
        shortcuts: [
          { name: 'Surat Masuk', short_name: 'Masuk', url: '/surat-masuk' },
          { name: 'Surat Keluar', short_name: 'Keluar', url: '/surat-keluar' },
          { name: 'Sinkronisasi', short_name: 'Sync', url: '/pengaturan/sinkronisasi' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/www\.googleapis\.com\/drive\/v3\/.*/i,
            handler: 'NetworkOnly',
            method: 'GET'
          }
        ]
      }
    })
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**']
  }
});
