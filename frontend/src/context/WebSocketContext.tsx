import { useEffect, useCallback, useState, createContext, useContext, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { webSocketService, type WebSocketMessage } from '@/services/websocket'
import { useAuth } from '@/context/AuthContext'
import { getCurrentStaff } from '@/services/api'
import type { ConnectionState, WebSocketMessageType } from '@/services/websocket'

/** How often the UI refetches while the realtime socket is down or disabled. */
const POLL_INTERVAL_MS = 10_000

/**
 * A rejected WS handshake no longer means "log the user out" outright: the REST
 * session may still be valid (the socket relay can drop auth for unrelated
 * reasons, e.g. bfcache / serverless cold starts). Verify the token against
 * GET /auth/me first and only redirect to login when that also fails. Guard
 * ensures at most one verification round per token, so a reconnect loop can't
 * hammer the endpoint or trigger repeated redirects.
 */
let authVerificationInFlight = false

async function verifySessionOrLogout(): Promise<void> {
  if (authVerificationInFlight) return
  authVerificationInFlight = true
  try {
    await getCurrentStaff()
    // Session is actually fine - restore the socket now that credentials check out.
    await webSocketService.connect().catch(() => { /* service handles retry/backoff */ })
  } catch {
    // Real 401/expired token: clear local auth and send the user to re-login.
    localStorage.removeItem('auth_token')
    localStorage.removeItem('auth_staff')
    localStorage.removeItem('staff_user')
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.assign('/login?expired=1')
    }
  } finally {
    authVerificationInFlight = false
  }
}

interface WebSocketContextType {
  isConnected: boolean
  connectionState: ConnectionState
  /** True while the UI is relying on polling instead of a live socket. */
  usingPolling: boolean
  send: (data: unknown) => void
  disconnect: () => void
  connect: () => void
  subscribe: <T = unknown>(type: WebSocketMessageType, handler: (message: WebSocketMessage<T>) => void) => () => void
}

const WebSocketContext = createContext<WebSocketContextType | null>(null)

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()
  const queryClient = useQueryClient()
  const [connectionState, setConnectionState] = useState<ConnectionState>(webSocketService.connectionState)

  // The service owns reconnection, so mirror its state instead of assuming success.
  useEffect(() => webSocketService.onConnectionChange(setConnectionState), [])

  useEffect(() => {
    if (!isAuthenticated || !webSocketService.enabled) return

    webSocketService.connect().catch(() => {
      // Reconnection (or the polling fallback below) covers this; nothing to do here.
    })

    return () => {
      webSocketService.disconnect()
    }
  }, [isAuthenticated])

  const isConnected = connectionState === 'open'

  // Polling fallback: keeps every page fresh when the socket is down, disabled for the
  // build, blocked by the network, or recycled by the hosting platform. Invalidate (not
  // refetch) so React Query only reloads queries that are actually on screen.
  useEffect(() => {
    if (!isAuthenticated || isConnected) return
    const timer = window.setInterval(() => {
      queryClient.invalidateQueries()
    }, POLL_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [isAuthenticated, isConnected, queryClient])

  // A freshly opened socket means whatever drifted while it was down should be re-fetched.
  useEffect(() => {
    return webSocketService.on('connected', () => {
      queryClient.invalidateQueries()
    })
  }, [queryClient])

  // Rejected credentials: verify the REST session before logging out so a flaky
  // socket relay doesn't kick the user off the page they just opened.
  useEffect(() => {
    return webSocketService.on('auth_error', () => {
      void verifySessionOrLogout()
    })
  }, [])

  const send = useCallback((data: unknown) => {
    webSocketService.send(data)
  }, [])

  const disconnect = useCallback(() => {
    webSocketService.disconnect()
  }, [])

  const connect = useCallback(async () => {
    await webSocketService.connect().catch(() => {
      /* handled by the service */
    })
  }, [])

  const subscribe = useCallback(<T = unknown>(type: WebSocketMessageType, handler: (message: WebSocketMessage<T>) => void) => {
    return webSocketService.on(type, handler)
  }, [])

  return (
    <WebSocketContext.Provider
      value={{
        isConnected,
        connectionState,
        usingPolling: isAuthenticated && !isConnected,
        send,
        disconnect,
        connect,
        subscribe,
      }}
    >
      {children}
    </WebSocketContext.Provider>
  )
}

export function useWebSocket(): WebSocketContextType {
  const context = useContext(WebSocketContext)
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider')
  }
  return context
}
