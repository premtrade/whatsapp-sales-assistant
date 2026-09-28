// Both URLs are optional overrides. Left unset, the dashboard talks to its own origin:
// `/api` is proxied by vite.config.ts in dev and rewritten by frontend/vercel.json in
// production, and `/ws` is rewritten to the api/ws relay function (which bridges to the
// Fastify WebSocket server). Only set these when the API lives on another hostname.
export const APP_NAME = import.meta.env.VITE_APP_NAME || 'WhatsApp Sales Assistant'
export const API_URL = import.meta.env.VITE_API_URL || '/api'
export const WS_URL = import.meta.env.VITE_WS_URL || '/ws'
