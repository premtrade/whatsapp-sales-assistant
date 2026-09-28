import { authService } from './auth'

export type WebSocketMessageType =
  | 'new_message'
  | 'new_handoff'
  | 'handoff_updated'
  | 'status_changed'
  | 'quote_updated'
  | 'appointment_updated'
  | 'conversation_updated'
  | 'handoffs_pending'
  | 'dashboard_stats_updated'
  | 'connected'
  | 'auth_success'
  | 'auth_error'
  | 'pong'
  | 'error'

export interface WebSocketMessage<T = unknown> {
  type: WebSocketMessageType
  payload: T
  timestamp?: string
}

export type MessageHandler<T = unknown> = (message: WebSocketMessage<T>) => void
export type ConnectionState = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'auth_failed'

/** Close codes the backend uses for rejected credentials (see backend/src/websocketServer.ts). */
const AUTH_CLOSE_CODES = new Set([4001, 4003])
const HEARTBEAT_INTERVAL_MS = 25_000
/** No frame (including our own pong replies) for this long => treat the socket as dead. */
const HEARTBEAT_TIMEOUT_MS = 70_000
const MAX_RECONNECT_DELAY_MS = 30_000

/**
 * Same-origin `/ws` by default:
 *  - `npm run dev`  -> proxied to the backend by vite.config.ts
 *  - production     -> rewritten by frontend/vercel.json to the api/ws relay function,
 *                      which bridges to the Fastify WebSocket server
 * Set `VITE_WS_URL` to point somewhere else (e.g. `wss://api.<your-domain>/ws`), or to an
 * empty string to disable realtime for a build (the UI then polls instead).
 */
function resolveUrl(url?: string): string {
  if (url !== undefined) return url
  const configured = import.meta.env.VITE_WS_URL as string | undefined
  if (configured === undefined) return '/ws'
  return configured
}

export class WebSocketService {
  private ws: WebSocket | null = null
  private url: string
  private reconnectAttempts = 0
  private reconnectTimer: number | null = null
  private heartbeatTimer: number | null = null
  private lastActivityAt = 0
  private handlers: Map<WebSocketMessageType, Set<MessageHandler>> = new Map()
  private stateListeners: Set<(state: ConnectionState) => void> = new Set()
  private manualClose = false
  private state: ConnectionState = 'idle'

  constructor(url?: string) {
    this.url = resolveUrl(url)
  }

  /** False when realtime is disabled for this build (VITE_WS_URL=""). */
  get enabled(): boolean {
    return this.url.length > 0
  }

  get connectionState(): ConnectionState {
    return this.state
  }

  onConnectionChange(listener: (state: ConnectionState) => void): () => void {
    this.stateListeners.add(listener)
    listener(this.state)
    return () => {
      this.stateListeners.delete(listener)
    }
  }

  private setState(state: ConnectionState): void {
    if (this.state === state) return
    this.state = state
    this.stateListeners.forEach((listener) => {
      try {
        listener(state)
      } catch (error) {
        console.error('WebSocket state listener failed:', error)
      }
    })
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.enabled) {
        reject(new Error('Realtime is disabled for this build'))
        return
      }
      if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
        resolve()
        return
      }

      this.clearReconnectTimer()
      this.manualClose = false
      this.setState(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting')

      const token = authService().getToken()
      const wsUrl = token ? `${this.url}?token=${encodeURIComponent(token)}` : this.url

      let socket: WebSocket
      try {
        socket = new WebSocket(wsUrl)
      } catch (error) {
        this.scheduleReconnect()
        reject(error instanceof Error ? error : new Error('WebSocket connection failed'))
        return
      }

      this.ws = socket
      this.lastActivityAt = Date.now()

      socket.onopen = () => {
        this.reconnectAttempts = 0
        this.lastActivityAt = Date.now()
        this.startHeartbeat()
        this.setState('open')
        this.emit({ type: 'connected', payload: null, timestamp: new Date().toISOString() })
        resolve()
      }

      socket.onmessage = (event) => {
        this.lastActivityAt = Date.now()
        try {
          const message: WebSocketMessage = JSON.parse(event.data)
          if (message.type === 'auth_error') {
            this.handleAuthFailure(message.payload)
            return
          }
          this.emit(message)
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error)
        }
      }

      socket.onerror = () => {
        // Reconnection is driven by onclose; only surface the failure to the caller once.
        if (socket.readyState === WebSocket.CLOSED) {
          reject(new Error('WebSocket connection failed'))
        }
      }

      socket.onclose = (event) => {
        this.stopHeartbeat()
        this.ws = null

        if (this.manualClose) {
          this.setState('idle')
          return
        }

        if (AUTH_CLOSE_CODES.has(event.code) || this.state === 'auth_failed') {
          this.setState('auth_failed')
          this.emit({
            type: 'auth_error',
            payload: { message: event.reason || 'WebSocket authentication failed' },
            timestamp: new Date().toISOString(),
          })
          return
        }

        this.scheduleReconnect()
      }
    })
  }

  disconnect(): void {
    this.manualClose = true
    this.clearReconnectTimer()
    this.stopHeartbeat()
    if (this.ws) {
      try {
        this.ws.close(1000, 'Client disconnect')
      } catch {
        /* ignore */
      }
      this.ws = null
    }
    this.setState('idle')
  }

  send(data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    } else {
      console.warn('WebSocket is not connected')
    }
  }

  on<T = unknown>(type: WebSocketMessageType, handler: MessageHandler<T>): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set())
    }
    this.handlers.get(type)!.add(handler as MessageHandler)

    return () => {
      this.handlers.get(type)?.delete(handler as MessageHandler)
    }
  }

  private emit(message: WebSocketMessage): void {
    const typeHandlers = this.handlers.get(message.type)
    if (typeHandlers) {
      typeHandlers.forEach((handler) => {
        try {
          handler(message)
        } catch (error) {
          console.error('Error in WebSocket message handler:', error)
        }
      })
    }
  }

  private handleAuthFailure(payload: unknown): void {
    this.setState('auth_failed')
    this.manualClose = true
    this.stopHeartbeat()
    if (this.ws) {
      try {
        this.ws.close(4001, 'Authentication failed')
      } catch {
        /* ignore */
      }
      this.ws = null
    }
    this.emit({
      type: 'auth_error',
      payload: payload ?? { message: 'WebSocket authentication failed' },
      timestamp: new Date().toISOString(),
    })
  }

  /**
   * Reconnect forever with capped exponential backoff + jitter. Long-lived sockets get
   * recycled by proxies and platforms (Vercel Functions are duration-bounded), so a drop
   * must never be terminal - the UI polls while the socket is down.
   */
  private scheduleReconnect(): void {
    if (this.manualClose || !this.enabled) return

    this.reconnectAttempts++
    const backoff = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), MAX_RECONNECT_DELAY_MS)
    const delay = backoff / 2 + Math.random() * (backoff / 2)

    this.setState('reconnecting')
    if (this.reconnectAttempts <= 3) {
      console.warn(
        `WebSocket disconnected - reconnecting in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts})`
      )
    }

    this.clearReconnectTimer()
    this.reconnectTimer = window.setTimeout(() => {
      this.connect().catch(() => {
        /* scheduleReconnect already queued the next attempt */
      })
    }, delay)
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatTimer = window.setInterval(() => {
      if (this.ws?.readyState !== WebSocket.OPEN) return
      if (Date.now() - this.lastActivityAt > HEARTBEAT_TIMEOUT_MS) {
        // Dead socket (an intermediary dropped it without a close frame).
        try {
          this.ws.close(4000, 'Heartbeat timeout')
        } catch {
          /* ignore */
        }
        return
      }
      this.send({ type: 'ping' })
    }, HEARTBEAT_INTERVAL_MS)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      window.clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  get readyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }
}

export const webSocketService = new WebSocketService()
