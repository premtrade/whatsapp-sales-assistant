import React from 'react'
import ReactDOM from 'react-dom/client'
import { hydrateRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './context/AuthContext'
import { WebSocketProvider } from './context/WebSocketContext'
import App from './App'
import './index.css'
import { inject } from '@vercel/analytics'

inject()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
})

const container = document.getElementById('root')!

const app = (
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <WebSocketProvider>
            <App />
          </WebSocketProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
)

// Marketing routes are prerendered at build time (see scripts/prerender.mjs),
// so their HTML is already in the container and React can hydrate it in place.
// Authenticated routes are served from an empty shell and mounted from scratch.
if (container.hasChildNodes()) {
  hydrateRoot(container, app)
} else {
  ReactDOM.createRoot(container).render(app)
}
