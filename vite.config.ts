import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'autoUpdate',
    injectRegister: false,

    pwaAssets: {
      disabled: false,
      config: true,
    },

    manifest: {
      name: 'Billio — Invoicing',
      short_name: 'Billio',
      description: 'Professional invoicing for West African SMBs — create, send and track invoices with Mobile Money support.',
      theme_color: '#185FA5',
      background_color: '#EAEEF3',
      display: 'standalone',
      orientation: 'portrait-primary',
      categories: ['finance', 'business', 'productivity'],
    },

    workbox: {
      globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
      cleanupOutdatedCaches: true,
      clientsClaim: true,
    },

    devOptions: {
      enabled: false,
      navigateFallback: 'index.html',
      suppressWarnings: true,
      type: 'module',
    },
  })],
})