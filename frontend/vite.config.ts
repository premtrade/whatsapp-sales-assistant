import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/api': 'http://backend:4000',
      '/ws': { target: 'ws://backend:4000', ws: true }
    }
  },
  // `vite preview` serves the built bundle, so it needs its own proxy to
  // reach an API. It points at the deployed one by default so the marketing
  // pages can be checked against real data.
  preview: {
    host: '127.0.0.1',
    port: 4173,
    proxy: {
      '/api': process.env.PREVIEW_API_TARGET || 'https://waflo.vercel.app',
      '/ws': { target: process.env.PREVIEW_WS_TARGET || 'wss://waflo.vercel.app', ws: true }
    }
  }
})
