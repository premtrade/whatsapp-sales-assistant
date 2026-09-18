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
  | 'error'

export interface WebSocketMessage<T = unknown> {
  type: WebSocketMessageType
  payload: T
  timestamp: string
}

export type MessageHandler<T = unknown> = (message: WebSocketMessage<T>) => void

export class WebSocketService {
  private ws: WebSocket | null = null
  private url: string
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private handlers: Map<WebSocketMessageType, Set<MessageHandler>> = new Map()
  private reconnectTimer: number | null = null
  private manualClose = false

  constructor(url?: string) {
    this.url = url || import.meta.env.VITE_WS_URL || 'ws://localhost:4000/ws'
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve()
        return
      }

      const token = authService().getToken()
      const wsUrl = token
        ? `${this.url}?token=${encodeURIComponent(token)}`
        : this.url

      this.ws = new WebSocket(wsUrl)
      this.manualClose = false

      this.ws.onopen = () => {
        console.log('WebSocket connected')
        this.reconnectAttempts = 0
        this.emit({ type: 'connected', payload: null, timestamp: new Date().toISOString() })
        resolve()
      }

      this.ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data)
          this.emit(message)
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error)
        }
      }

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        reject(new Error('WebSocket connection failed'))
      }

      this.ws.onclose = () => {
        console.log('WebSocket disconnected')
        if (!this.manualClose) {
          this.attemptReconnect()
        }
      }
    })
  }

  disconnect(): void {
    this.manualClose = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
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

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached')
      return
    }

    this.reconnectAttempts++
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)

    console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`)

    this.reconnectTimer = window.setTimeout(() => {
      this.connect().catch(() => {})
    }, delay)
  }

  get readyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }
}

export const webSocketService = new WebSocketService()
