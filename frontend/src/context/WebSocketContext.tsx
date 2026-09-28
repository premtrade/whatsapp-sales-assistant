import { useEffect, useCallback, useState, createContext, useContext, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { webSocketService, type WebSocketMessage } from '@/services/websocket'
import { useAuth } from '@/context/AuthContext'
import type { ConnectionState, WebSocketMessageType } from '@/services/websocket'

/** How often the UI refetches while the realtime socket is down or disabled. */
const POLL_INTERVAL_MS = 10_000

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

  // Rejected credentials must not loop forever - clear the session like a 401 does.
  useEffect(() => {
    return webSocketService.on('auth_error', () => {
      localStorage.removeItem('auth_token')
      localStorage.removeItem('auth_staff')
      localStorage.removeItem('staff_user')
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.assign('/login?expired=1')
      }
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
