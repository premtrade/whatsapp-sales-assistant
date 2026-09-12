import { useEffect, useCallback, useState, createContext, useContext, type ReactNode } from 'react'
import { webSocketService, type WebSocketMessage } from '@/services/websocket'
import { useAuth } from '@/context/AuthContext'
import type { WebSocketMessageType } from '@/services/websocket'

interface WebSocketContextType {
  isConnected: boolean
  send: (data: unknown) => void
  disconnect: () => void
  connect: () => void
  subscribe: <T = unknown>(type: WebSocketMessageType, handler: (message: WebSocketMessage<T>) => void) => () => void
}

const WebSocketContext = createContext<WebSocketContextType | null>(null)

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    if (!isAuthenticated) return

    const connect = async () => {
      try {
        await webSocketService.connect()
        setIsConnected(true)
      } catch (error) {
        console.error('Failed to connect WebSocket:', error)
        setIsConnected(false)
      }
    }

    connect()

    return () => {
      webSocketService.disconnect()
      setIsConnected(false)
    }
  }, [isAuthenticated])

  const send = useCallback((data: unknown) => {
    webSocketService.send(data)
  }, [])

  const disconnect = useCallback(() => {
    webSocketService.disconnect()
    setIsConnected(false)
  }, [])

  const connect = useCallback(async () => {
    try {
      await webSocketService.connect()
      setIsConnected(true)
    } catch {
      setIsConnected(false)
    }
  }, [])

  const subscribe = useCallback(<T = unknown>(type: WebSocketMessageType, handler: (message: WebSocketMessage<T>) => void) => {
    return webSocketService.on(type, handler)
  }, [])

  return (
    <WebSocketContext.Provider value={{ isConnected, send, disconnect, connect, subscribe }}>
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
