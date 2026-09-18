# WhatsApp Sales Assistant — Frontend ↔ Backend Integration Guide

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (React + Vite)                        │
│  Port: 3000  │  vite.config.ts proxies /api → :4000, /ws → ws://:4000      │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────────┐  ┌───────────────┐   │
│  │ AuthCtx  │  │ WebSocketCtx │  │  services/api.ts │  │ hooks/*.ts    │   │
│  │ (JWT)    │  │ (real-time)  │  │  axios instance  │  │ useApi/Query  │   │
│  └────┬─────┘  └──────┬───────┘  └────────┬─────────┘  └──────┬────────┘   │
│       │                │                    │                     │           │
└───────┼────────────────┼────────────────────┼─────────────────────┼───────────┘
        │    REST/HTTP   │    WebSocket       │   REST/HTTP          │
        ▼                ▼                    ▼                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         BACKEND (Express + TypeScript)                      │
│                         Port: 4000  │  /api/*  │  /ws                        │
│  ┌────────────┐  ┌──────────────────┐  ┌──────────────┐  ┌─────────────┐   │
│  │ app.ts     │  │  routes/*.ts     │  │ controllers  │  │  services    │   │
│  │ (Express)  │  │  Express routers │  │  per domain   │  │  business    │   │
│  └─────┬──────┘  └────────┬─────────┘  └──────┬───────┘  └──────┬──────┘   │
│        │                  │                     │                  │          │
│  ┌─────┴──────────────────┴─────────────────────┴──────────────────┴──────┐ │
│  │  middleware/auth.ts        ←  JWT Bearer token validation              │ │
│  │  middleware/webhookAuth.ts ←  HMAC/X-Webhook-Secret for WAHA/n8n      │ │
│  │  middleware/rateLimiter.ts ←  per-route rate limits                    │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  websocketServer.ts   ←  /ws  tenant-scoped broadcast, auth query   │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  routes/webhook.routes.ts  ←  POST /api/webhooks/waha  (WAHA→)      │   │
│  │                            ←  POST /api/webhooks/n8n   (n8n→)      │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│        │                         │                        │                  │
│        ▼                         ▼                        ▼                  │
│  ┌──────────────┐    ┌────────────────────┐   ┌───────────────────┐         │
│  │  PostgreSQL  │    │   WAHA (waha)      │   │   n8n (workflows) │         │
│  │  pgvector    │    │   port 3000        │   │   port 5678       │         │
│  │  multi-tenant│    │   WhatsApp HTTP API│   │   AI orchestration│         │
│  └──────────────┘    └────────────────────┘   └───────────────────┘         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Complete API Endpoint Reference

All endpoints are prefixed with `/api` unless noted. Every protected route requires a
`Authorization: Bearer <jwt>` header.

### 2.1 Authentication

| Method | Endpoint              | Description                           |
|--------|-----------------------|---------------------------------------|
| POST   | `/api/auth/login`     | Login with email + password → JWT     |
| GET    | `/api/auth/me`        | Get current authenticated staff user  |

### 2.2 Dashboard & Stats

| Method | Endpoint              | Description                              |
|--------|-----------------------|------------------------------------------|
| GET    | `/api/stats/dashboard`| Aggregated KPIs: conversations, quotes,  |
|        |                       | handoffs, appointments, pipeline, trends |

### 2.3 Contacts

| Method | Endpoint               | Description                           |
|--------|------------------------|---------------------------------------|
| GET    | `/api/contacts`        | Paginated list, filter by status/source/search |
| GET    | `/api/contacts/:id`    | Single contact detail                 |
| POST   | `/api/contacts`        | Create contact                        |
| PATCH  | `/api/contacts/:id`    | Update contact                        |
| DELETE | `/api/contacts/:id`    | Delete contact                        |
| GET    | `/api/contacts/:id/facts` | Customer facts for contact          |

### 2.4 Conversations

| Method | Endpoint                        | Description                            |
|--------|---------------------------------|----------------------------------------|
| GET    | `/api/conversations`            | Paginated list, filters: status/channel/assignedTo/date range |
| GET    | `/api/conversations/:id`        | Single conversation with relations     |
| PATCH  | `/api/conversations/:id/status` | Update conversation status             |
| GET    | `/api/conversations/:id/notes`  | Internal conversation notes            |
| POST   | `/api/conversations/:id/notes`  | Add internal note                      |
| DELETE | `/api/conversations/:id/notes/:noteId` | Delete note                  |

### 2.5 Messages

| Method | Endpoint                            | Description                        |
|--------|-------------------------------------|------------------------------------|
| GET    | `/api/messages/:conversationId`     | Paginated message list             |
| POST   | `/api/messages/:conversationId/reply` | Send outgoing staff reply       |

### 2.6 Handoffs

| Method | Endpoint                        | Description                        |
|--------|---------------------------------|------------------------------------|
| GET    | `/api/handoffs`                 | Paginated handoffs                 |
| GET    | `/api/handoffs/pending`         | Pending handoffs needing action    |
| PATCH  | `/api/handoffs/:id/status`      | Accept / complete / cancel         |
| PATCH  | `/api/handoffs/:id/assign`      | Assign handoff to staff            |

### 2.7 Quotes

| Method | Endpoint                          | Description                       |
|--------|-----------------------------------|-----------------------------------|
| GET    | `/api/quotes`                     | Paginated quotes                  |
| GET    | `/api/quotes/:id`                 | Quote detail with items           |
| POST   | `/api/quotes`                     | Create quote                      |
| PATCH  | `/api/quotes/:id`                 | Update quote                      |
| DELETE | `/api/quotes/:id`                 | Delete quote                      |
| GET    | `/api/quotes/:id/items`           | List quote items                  |
| POST   | `/api/quotes/:id/items`           | Add quote item                    |
| PATCH  | `/api/quotes/:id/items/:itemId`   | Update quote item                 |
| DELETE | `/api/quotes/:id/items/:itemId`   | Delete quote item                 |

### 2.8 Appointments

| Method | Endpoint                        | Description                        |
|--------|---------------------------------|------------------------------------|
| GET    | `/api/appointments`             | Paginated appointments             |
| PATCH  | `/api/appointments/:id`         | Confirm / cancel / mark complete   |

### 2.9 Knowledge Base

| Method | Endpoint                                | Description                   |
|--------|-----------------------------------------|-------------------------------|
| GET    | `/api/knowledge/documents`              | Paginated documents           |
| GET    | `/api/knowledge/documents/:id`          | Document detail               |
| POST   | `/api/knowledge/documents`              | Upload PDF/DOCX               |
| GET    | `/api/knowledge/documents/:id/chunks`   | Chunked embeddings            |

### 2.10 Lead Scores

| Method | Endpoint                        | Description                      |
|--------|---------------------------------|----------------------------------|
| GET    | `/api/lead-scores`              | Paginated lead scores            |
| GET    | `/api/lead-scores/:id`          | Single lead score                |
| POST   | `/api/lead-scores`              | Create / recalculate             |
| PATCH  | `/api/lead-scores/:id`          | Update status                    |
| GET    | `/api/lead-scores/pipeline`     | Pipeline summary for kanban      |

### 2.11 Follow-ups

| Method | Endpoint                        | Description                      |
|--------|---------------------------------|----------------------------------|
| GET    | `/api/follow-ups/due`           | Due follow-ups, optional conv filter |

### 2.12 Quick Replies

| Method | Endpoint                        | Description                      |
|--------|---------------------------------|----------------------------------|
| GET    | `/api/quick-replies`            | Filterable by category           |
| POST   | `/api/quick-replies`            | Create quick reply               |

### 2.13 Staff Management

| Method | Endpoint                        | Description                      |
|--------|---------------------------------|----------------------------------|
| GET    | `/api/staff/users`              | Paginated staff, role/status filter |
| GET    | `/api/staff/users/:id`          | Staff detail                     |
| POST   | `/api/staff/users`              | Create staff user                |
| PUT    | `/api/staff/users/:id`          | Update staff user                |
| PATCH  | `/api/staff/users/:id/status`   | Activate / deactivate            |
| DELETE | `/api/staff/users/:id`          | Delete staff user                |

### 2.14 Settings

| Method | Endpoint                        | Description                      |
|--------|---------------------------------|----------------------------------|
| GET    | `/api/settings`                 | All settings                     |
| PUT    | `/api/settings`                 | Bulk update settings             |
| POST   | `/api/settings`                 | Create individual setting        |
| GET    | `/api/settings/export`          | Export all settings as JSON      |
| POST   | `/api/settings/import`          | Import settings                  |

### 2.15 WhatsApp Config

| Method | Endpoint                        | Description                      |
|--------|---------------------------------|----------------------------------|
| GET    | `/api/whatsapp/config`          | WhatsApp / WAHA configuration    |
| GET    | `/api/whatsapp/status`          | Connection health status         |
| POST   | `/api/whatsapp/test-connection` | Test WAHA connectivity           |

### 2.16 System Health

| Method | Endpoint               | Description                    |
|--------|------------------------|--------------------------------|
| GET    | `/api/system/health`   | DB, Redis, WAHA, n8n health   |
| GET    | `/api/system/metrics`  | CPU, memory, queue depth       |

### 2.17 Audit Logs

| Method | Endpoint               | Description                    |
|--------|------------------------|--------------------------------|
| GET    | `/api/audit-logs`       | Paginated, filterable          |

### 2.18 Business (Tenant)

| Method | Endpoint               | Description                    |
|--------|------------------------|--------------------------------|
| GET    | `/api/businesses`      | List businesses (super_admin)  |
| GET    | `/api/businesses/:id`  | Business detail                |

### 2.19 Webhooks (Inbound)

| Method | Endpoint               | Auth                       | Source  | Description                         |
|--------|------------------------|----------------------------|---------|-------------------------------------|
| POST   | `/api/webhooks/waha`   | X-Webhook-Secret / HMAC    | WAHA    | Inbound WhatsApp events             |
| POST   | `/api/webhooks/n8n`    | X-Webhook-Secret / HMAC    | n8n     | Workflow completion callbacks        |

### 2.20 Public Health

| Method | Endpoint        | Description                   |
|--------|-----------------|-------------------------------|
| GET    | `/health`        | Liveness / readiness probe   |

---

## 3. WebSocket Event Types

The `/ws` endpoint supports the following event types over the same WebSocket
connection after authentication:

| Direction | Type                   | Payload shape                                   | Triggered by backend when…            |
|-----------|------------------------|-------------------------------------------------|----------------------------------------|
| → client  | `connected`            | `null`                                          | WS handshake succeeds                  |
| → client  | `auth_success`         | `{ message, userId, tenantId }`                 | Token validated                        |
| → client  | `auth_error`           | `{ message }`                                   | Token invalid / expired                |
| → client  | `new_message`          | `{ conversationId, message }`                   | New message stored in DB               |
| → client  | `new_handoff`          | `Handoff` object                                | AI creates a handoff                   |
| → client  | `handoff_updated`      | `Handoff` object                                | Staff updates handoff status           |
| → client  | `conversation_updated` | `Conversation` object                           | Conversation status changes            |
| → client  | `dashboard_stats_updated` | Stats object                                 | Dashboard data refreshes               |
| → client  | `pong`                 | `{ timestamp }`                                 | Client sends `ping`                    |
| ← server  | `auth`                 | `{ token }`                                     | Client authenticates on open           |
| ← server  | `ping`                 | `null`                                          | Keepalive (client may respond `pong`)  |

---

## 4. Authentication Flow

### 4.1 Login Sequence

```
Frontend                        Backend
   │                               │
   │  POST /api/auth/login          │
   │  { email, password }           │
   │───────────────────────────────▶│
   │                               │  validate credentials (bcrypt)
   │                               │  SELECT staff_users WHERE email
   │                               │
   │  ◀────────────────────────────│
   │  { success, data: {            │
   │    token: "jwt:eyJhbG...",    │
   │    user: { id, email, role }  │
   │  }}                            │
   │                               │
   │  localStorage.setItem(         │
   │    'auth_token', 'jwt:...')    │
   │  localStorage.setItem(         │
   │    'staff_user', JSON)         │
   │                               │
```

> **Note:** The token is stored with a `jwt:` prefix in `auth_service.ts`. The
> `getToken()` helper strips this prefix before attaching it to the
> `Authorization: Bearer` header. This allows the app to distinguish between
> raw JWTs and prefixed tokens.

### 4.2 Token Refresh & Expiry

The frontend axios interceptor (`api.ts:65–85`) handles `401` responses globally:

```ts
// frontend/src/services/api.ts
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('auth_token')
      localStorage.removeItem('auth_staff')
      localStorage.removeItem('staff_user')
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.assign('/login?expired=1')
      }
    }
    return Promise.reject(apiError)
  }
)
```

The backend JWT expiry is configured via `JWT_EXPIRES_IN` (default `1d`).

### 4.3 WebSocket Authentication

Two methods are supported:

**Method A — Query Parameter (preferred, avoids race condition)**

```
wss://host:4000/ws?token=<JWT>
```

The server validates the token during the HTTP upgrade handshake before
accepting the connection.

**Method B — Auth Message**

```json
{ "type": "auth", "payload": { "token": "<JWT>" } }
```

The server allows a 5-second window (`AUTH_TIMEOUT_MS`) for the client to send
this after the socket opens. Unauthenticated clients are closed with code `4001`.

The current frontend `WebSocketService` uses Method B. The server also supports
Method A. To align them, update the frontend:

```ts
// frontend/src/services/websocket.ts  (updated connect)
const token = authService().getToken()
const wsUrl = token
  ? `${this.url}?token=${encodeURIComponent(token)}`
  : this.url

this.ws = new WebSocket(wsUrl)
// Remove the manual auth send — server validates at handshake now
```

---

## 5. Data Flow Patterns

### 5.1 Inbound WhatsApp Message Flow

```
WhatsApp user
    │
    │  (message via WhatsApp network)
    ▼
WAHA (devlikeapro/waha:chrome)
    │
    │  POST /api/webhooks/waha
    │  Headers: X-Webhook-Secret / X-Signature-256
    │  Body: { event, session, payload }
    │
    ▼
Backend /api/webhooks/waha
    │  middleware/webhookAuth.ts  → validates HMAC / secret
    │  zod schema validation
    │
    ├──▶ forward to n8n (if WAHA_WEBHOOK_FORWARD_TO_N8N=true)
    │        POST n8n_url  { event, session, payload, source:'waha' }
    │
    └──▶ (internal) emitNewMessage(tenantId, conversationId, message)
                 │
                 ▼
            broadcastToTenant(tenantId, {
              type: 'new_message',
              payload: { conversationId, message },
              timestamp: '...'
            })
                 │
                 ▼
            WebSocket /ws   (all authenticated staff in tenant)
                 │
                 ▼
            Frontend WebSocketContext.on('new_message', handler)
                 │
                 ▼
            React Query cache invalidation / optimistic update
                 │
                 ▼
            MessageBubble renders new message in Inbox
```

### 5.2 Staff Sends a Reply

```
Staff clicks "Send" in ConversationDetail
    │
    │  POST /api/messages/:conversationId/reply
    │  Authorization: Bearer <JWT>
    │  { text_body: "Hello!" }
    │
    ▼
Backend message.controller.ts
    │  authenticate middleware → req.user
    │  zod validation (text_body 1-10000 chars)
    │  message.service.sendMessage(conversationId, text, staffId)
    │       │
    │       ├── INSERT INTO messages (outgoing, sender_type='staff')
    │       ├── UPDATE conversations SET last_message_at = now()
    │       ├── CALL WAHA /api/sendText (POST)
    │       │       { session, chatId, text }
    │       └── createAuditLog(...)
    │
    ▼  { success: true, data: Message }
    │
    ▼  (WebSocket broadcast to tenant)
    │  emitNewMessage(tenantId, conversationId, message)
    │
    ▼
Frontend receives response → updates local state
Frontend WebSocketContext.on('new_message') → syncs across tabs
```

### 5.3 AI Processing via n8n

```
Inbound message → WAHA webhook → n8n workflow
    │
    │  Workflow 1: Incoming WhatsApp Message
    │  Workflow 2: AI Brain (LLM call)
    │  Workflow 3: Memory & Context Builder
    │  ...
    │
    ▼
n8n calls back to backend
    POST /api/webhooks/n8n
    Headers: X-Webhook-Secret
    { event, tenantId, data }
    │
    ▼
Backend processes → DB writes, WebSocket broadcasts
```

---

## 6. Environment Configuration

### 6.1 Frontend (`frontend/.env` or injected via Docker)

| Variable            | Default                        | Description                               |
|---------------------|--------------------------------|-------------------------------------------|
| `VITE_API_URL`      | `/api`                         | Backend API base URL                      |
| `VITE_WS_URL`       | `ws://localhost:4000/ws`       | WebSocket server URL                      |
| `VITE_N8N_URL`      | `http://localhost:5678`        | n8n public URL                            |

### 6.2 Backend (`.env`)

| Variable                  | Default                       | Description                              |
|---------------------------|-------------------------------|------------------------------------------|
| `BACKEND_PORT`            | `4000`                        | Express server port                      |
| `CORS_ORIGINS`            | `http://localhost:3000,...`   | Allowed frontend origins                |
| `JWT_SECRET`              | (required)                    | HMAC secret for JWT signing              |
| `JWT_EXPIRES_IN`          | `1d`                          | Token TTL                                |
| `WAHA_API_KEY`            | (required)                    | WAHA API key                             |
| `WAHA_HOST`               | `waha`                        | WAHA service hostname (Docker network)   |
| `WAHA_PORT`               | `3000`                        | WAHA HTTP API port                       |
| `WAHA_SESSION`            | `default`                     | WAHA WhatsApp session name               |
| `WAHA_WEBHOOK_URL`        | (optional)                    | Public URL for WAHA to call back         |
| `WAHA_WEBHOOK_EVENTS`     | `["message.create",...]`      | Events WAHA forwards                     |
| `WAHA_WEBHOOK_SECRET`     | (falls back to WAHA_API_KEY)  | Secret for `/api/webhooks/waha`          |
| `N8N_WEBHOOK_URL`         | (optional)                    | Where WAHA events are forwarded          |
| `N8N_ENCRYPTION_KEY`      | (required)                    | n8n credential encryption key            |
| `N8N_WEBHOOK_SECRET`      | (falls back to N8N_ENCRYPTION_KEY) | Secret for `/api/webhooks/n8n`    |
| `POSTGRES_*`              | see `.env.example`             | Database connection                      |
| `GEMINI_API_KEY`          | (optional)                    | Google Generative AI for embeddings      |

---

## 7. Integration Layer Code

### 7.1 Axios Instance (`frontend/src/services/api.ts`)

The project already has a solid axios setup. Here is the reference pattern:

```ts
// frontend/src/services/api.ts
import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// Attach JWT to every request
api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Global 401 handler
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('auth_token')
      localStorage.removeItem('staff_user')
      window.location.assign('/login?expired=1')
    }
    return Promise.reject(error)
  }
)
```

**Data shape convention** — every successful response wraps data in:

```json
{
  "success": true,
  "data": { ... },
  "meta": { "page": 1, "limit": 20, "total": 100, "totalPages": 5 }
}
```

Paginated endpoints always include `meta`; non-paginated endpoints omit it.

### 7.2 Fetch-based Integration (Alternative to axios)

If you need a lightweight fetch wrapper for a specific integration point:

```ts
// frontend/src/utils/fetchClient.ts
export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem('auth_token')?.replace(/^jwt:/, '')

  const res = await fetch(`${import.meta.env.VITE_API_URL || '/api'}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(err.message || `HTTP ${res.status}`)
  }

  const json = await res.json()
  return (json.data ?? json) as T
}

// Usage:
const messages = await apiFetch<Message[]>(
  `/messages/${conversationId}?limit=50&offset=0`
)
```

### 7.3 React Query Integration (`frontend/src/hooks/useApi.ts`)

```ts
// hooks/useApi.ts — already in the codebase
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export function useApiQuery<T>(queryKey: any[], queryFn: () => Promise<T>) {
  return useQuery({ queryKey, queryFn, staleTime: 30000 })
}

export function useApiMutation<TData, TVars>(
  mutationFn: (v: TVars) => Promise<TData>,
  opts?: { invalidateQueries?: any[][] }
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: () => {
      opts?.invalidateQueries?.forEach((key) => qc.invalidateQueries({ queryKey: key }))
    },
  })
}

// Usage in a component:
const { data, isLoading } = useApiQuery(
  ['conversations', { page: 1, limit: 20 }],
  () => apiFetch<PaginatedResponse<Conversation>>('/conversations?page=1&limit=20')
)

const sendReply = useApiMutation(
  (vars: { conversationId: string; text: string }) =>
    apiFetch<Message>(`/messages/${vars.conversationId}/reply`, {
      method: 'POST',
      body: JSON.stringify({ text_body: vars.text }),
    }),
  { invalidateQueries: [['conversations'], ['messages', vars.conversationId]] }
)
```

### 7.4 WebSocket Hook (`frontend/src/hooks/useRealtime.ts`)

The existing hook has a bug — it reads `localStorage.getItem('token')` instead of
`'auth_token'`. Here is the corrected, production-ready version:

```ts
// frontend/src/hooks/useRealtime.ts
import { useEffect, useState, useCallback } from 'react'
import { webSocketService, type WebSocketMessage, type WebSocketMessageType } from '@/services/websocket'
import { authService } from '@/services/auth'

export function useRealtime(
  handlers: Partial<Record<WebSocketMessageType, (msg: WebSocketMessage) => void>>
) {
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const token = authService().getToken()
    if (!token) return

    // Use query-token auth to avoid race condition
    const wsUrl = `${import.meta.env.VITE_WS_URL || 'ws://localhost:4000/ws'}?token=${encodeURIComponent(token)}`
    const ws = new WebSocket(wsUrl)

    ws.onopen = () => setConnected(true)
    ws.onclose = () => setConnected(false)
    ws.onerror = () => setConnected(false)

    ws.onmessage = (event) => {
      try {
        const msg: WebSocketMessage = JSON.parse(event.data)
        const handler = handlers[msg.type as WebSocketMessageType]
        if (handler) handler(msg)
      } catch { /* ignore malformed */ }
    }

    return () => { ws.close() }
  }, [handlers])

  return { connected }
}
```

**Usage in the Inbox page:**

```tsx
// frontend/src/pages/Inbox.tsx
import { useRealtime } from '@/hooks/useRealtime'
import { useQueryClient } from '@tanstack/react-query'

export function InboxPage() {
  const qc = useQueryClient()

  useRealtime({
    new_message: (msg) => {
      qc.invalidateQueries({ queryKey: ['conversations'] })
      qc.invalidateQueries({ queryKey: ['messages', msg.payload.conversationId] })
    },
    handoff_updated: () => qc.invalidateQueries({ queryKey: ['handoffs'] }),
    conversation_updated: () => qc.invalidateQueries({ queryKey: ['conversations'] }),
    dashboard_stats_updated: () => qc.invalidateQueries({ queryKey: ['dashboard'] }),
  })

  // ...rest of component
}
```

### 7.5 WebSocket Context Integration

The existing `WebSocketContext` already wraps `webSocketService`. To wire up the
correct token handling, update `websocket.ts` to support query-token auth:

```ts
// frontend/src/services/websocket.ts  — update connect()
connect(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (this.ws?.readyState === WebSocket.OPEN) { resolve(); return }

    const token = authService().getToken()
    const wsUrl = token
      ? `${this.url}?token=${encodeURIComponent(token)}`
      : this.url

    this.ws = new WebSocket(wsUrl)
    this.manualClose = false

    this.ws.onopen = () => {
      this.reconnectAttempts = 0
      this.emit({ type: 'connected', payload: null, timestamp: new Date().toISOString() })
      resolve()
    }
    // ... rest unchanged
  })
}
```

---

## 8. Handling Asynchronous WhatsApp API Responses

The WhatsApp API (via WAHA) is inherently asynchronous. A `sendMessage` call
returns immediately, but delivery is not guaranteed at that moment. The system
handles this through:

### 8.1 Optimistic UI Update + WebSocket Reconciliation

```
1. Staff sends reply
   POST /api/messages/:id/reply → { message } (status: 'pending_delivery')
2. Frontend optimistically inserts message into local state
3. Backend calls WAHA /api/sendText
4. WAHA delivers to WhatsApp → WAHA fires webhook event
5. Backend /api/webhooks/waha receives event
   → message.service updates message status (delivered_at, read_at)
   → emitNewMessage broadcasts updated message
6. Frontend WebSocket handler replaces optimistic message with confirmed one
```

### 8.2 Webhook Reliability Pattern

```ts
// backend/src/routes/webhook.routes.ts — key reliability patterns

// 1. Always respond 200 immediately (WAHA/n8n expect fast acks)
res.status(200).json({ success: true, message: 'Event accepted', receivedEvent: event })

// 2. Process asynchronously after ack
setImmediate(async () => {
  try {
    await processInboundMessage(payload)
    await emitNewMessage(tenantId, conversationId, processedMessage)
  } catch (err) {
    logger.error('Async webhook processing failed', { error: err })
  }
})

// 3. HMAC validation prevents replay attacks
validateWebhookSource({
  sourceName: 'WAHA',
  secretHeaderName: 'x-webhook-secret',
  signatureHeaderName: 'x-signature-256',
  secretEnvVarName: 'WAHA_WEBHOOK_SECRET',
  defaultSecret: process.env.WAHA_API_KEY,
})
```

### 8.3 Frontend: Async State Machine

```tsx
// Example: Message send with state machine
type SendStatus = 'idle' | 'sending' | 'sent' | 'delivered' | 'read' | 'error'

function useSendMessage() {
  const [status, setStatus] = useState<SendStatus>('idle')

  const send = useCallback(async (conversationId: string, text: string) => {
    setStatus('sending')
    try {
      const msg = await apiFetch<Message>(`/messages/${conversationId}/reply`, {
        method: 'POST',
        body: JSON.stringify({ text_body: text }),
      })
      setStatus('sent') // WAHA accepted

      // WebSocket handler will transition to 'delivered'/'read'
      return msg
    } catch (e) {
      setStatus('error')
      throw e
    }
  }, [])

  return { send, status }
}
```

---

## 9. Multi-Tenancy & Security

### 9.1 Tenant Isolation

Every authenticated request carries `req.user.tenantId` (= `business_id`). All
service-layer queries filter by `tenantId`:

```sql
-- All queries implicitly or explicitly filter:
SELECT * FROM conversations
WHERE business_id = $1  -- tenantId from JWT
  AND id = $2
```

Super-admin users can impersonate tenants by sending `X-Tenant-Id` header
(`backend/src/middleware/auth.ts:51–84`).

### 9.2 WebSocket Tenant Isolation

```ts
// backend/src/websocketServer.ts
export function broadcastToTenant(targetTenantId: string, message: WSMessage): void {
  if (!targetTenantId) throw new Error('targetTenantId is required')
  clients.forEach((client) => {
    if (client.authenticated && client.tenantId === targetTenantId) {
      client.ws.send(JSON.stringify(message))
    }
  })
}
```

### 9.3 Frontend: Tenant Header Propagation

If your frontend sends `X-Tenant-Id` for super-admin impersonation, add it to
the axios interceptor:

```ts
// frontend/src/services/api.ts
api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`

  // Propagate tenant impersonation header if present
  const tenantId = localStorage.getItem('impersonated_tenant_id')
  if (tenantId) config.headers['X-Tenant-Id'] = tenantId

  return config
})
```

---

## 10. Error Handling Strategy

### 10.1 Backend Error Format

```ts
// backend/src/utils/errors.ts
export class ApiError extends Error {
  statusCode: number
  code?: string
  constructor(message: string, statusCode = 500, code?: string) {
    super(message)
    this.statusCode = statusCode
    this.code = code
  }
}

// All errors pass through errorHandler middleware → standardized JSON:
{
  "success": false,
  "error": "VALIDATION_FAILED",
  "message": "Message text is required",
  "status": 400
}
```

### 10.2 Frontend Error Handling

```ts
// frontend/src/services/api.ts — interceptor already normalizes errors
const apiError: ApiError = {
  message: error.response?.data?.message || error.message || 'An unexpected error occurred',
  code: error.response?.data?.code,
  status: error.response?.status,
}

// In components, use toast for user feedback:
try {
  await sendReply(convId, text)
  toast.success('Message sent')
} catch (err) {
  toast.error(err instanceof Error ? err.message : 'Failed to send message')
}
```

---

## 11. Vite Proxy Configuration

During development, Vite proxies API and WebSocket requests to the backend:

```ts
// frontend/vite.config.ts
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/api': 'http://backend:4000',
      '/ws': { target: 'ws://backend:4000', ws: true },
    },
  },
})
```

In production, the frontend Docker image is served by nginx (or similar) with
`VITE_API_URL=http://backend:4000` injected at build time.

---

## 12. Sequence Diagrams

### 12.1 Staff Login + WebSocket Connection

```
Staff (browser)                      Frontend                  Backend            DB
     │                                  │                        │               │
     │  Navigate to /login              │                        │               │
     │─────────────────────────────────▶│                        │               │
     │                                  │  POST /api/auth/login   │               │
     │                                  │───────────────────────▶│               │
     │                                  │                        │  validate     │
     │                                  │                        │────────────────▶│
     │                                  │                        │◀──────────────│
     │                                  │◀───────────────────────│               │
     │◀─────────────────────────────────│  { token, user }        │               │
     │  localStorage.setItem(...)       │                        │               │
     │                                  │                        │               │
     │  WebSocketProvider mounts        │                        │               │
     │                                  │  WS connect wss://...   │               │
     │                                  │──────────────────────────────────────▶│
     │                                  │                        │  HTTP upgrade │
     │                                  │                        │────────────────│
     │                                  │                        │  validate JWT │
     │                                  │                        │  via query    │
     │                                  │                        │────────────────│
     │                                  │◀──────────────────────────────────────│
     │                                  │  { type:'auth_success' }│               │
     │  UI ready, real-time active      │                        │               │
```

### 12.2 Inbound Message → Frontend Update

```
WhatsApp user                         WAHA                    Backend           DB     Frontend
     │                                  │                        │               │         │
     │  sends "Hello"                   │                        │               │         │
     │─────────────────────────────────▶│                        │               │         │
     │                                  │  POST /api/webhooks/waha│               │         │
     │                                  │───────────────────────▶│               │         │
     │                                  │                        │  validate HMAC│         │
     │                                  │                        │────────────────│         │
     │                                  │                        │◀──────────────│         │
     │                                  │◀───────────────────────│               │         │
     │                                  │  200 OK { success }    │               │         │
     │                                  │                        │  persist msg  │         │
     │                                  │                        │────────────────│         │
     │                                  │                        │◀──────────────│         │
     │                                  │                        │  WS broadcast │         │
     │                                  │                        │─────────────────────────▶│
     │                                  │                        │               │  render │
```

---

## 13. Implementation Checklist

### Backend
- [ ] Confirm all routes are registered in `backend/src/app.ts`
- [ ] Verify `webhookAuth.ts` validates both `X-Webhook-Secret` and `X-Signature-256`
- [ ] Ensure `waha.service.ts` sends `X-Api-Key` header on every WAHA call
- [ ] Add `emitNewMessage` call after persisting incoming messages in `message.service.ts`
- [ ] Set `WAHA_WEBHOOK_URL` to the publicly reachable backend URL (e.g. via ngrok)
- [ ] Configure `CORS_ORIGINS` to match frontend URLs

### Frontend
- [ ] Update `WebSocketService.connect()` to use query-token auth (`?token=`)
- [ ] Fix `useRealtime.ts` to read `auth_token` key instead of `token`
- [ ] Remove duplicate function definitions in `frontend/src/services/api.ts`
  (lines 402–488 duplicate 295–398)
- [ ] Fix the `updateStaffUser` and related functions that use bare regex `/staff/users/`
  instead of string literals `'/staff/users/'`
- [ ] Set `VITE_API_URL` and `VITE_WS_URL` in the frontend environment
- [ ] Wrap the app with both `AuthProvider` and `WebSocketProvider` in `App.tsx`

### Infrastructure
- [ ] Set `WAHA_WEBHOOK_URL` in `docker-compose.yml` environment block for `waha` service
- [ ] Ensure backend port `4000` is accessible from WAHA (or use a reverse proxy / ngrok)
- [ ] Set strong `JWT_SECRET`, `WAHA_API_KEY`, `N8N_ENCRYPTION_KEY`
- [ ] Enable Redis for session caching (currently configured but verify usage)

---

## 14. Troubleshooting

| Symptom                              | Likely Cause                              | Fix                                                      |
|--------------------------------------|-------------------------------------------|----------------------------------------------------------|
| `401 Unauthorized` on every request  | Token missing or `jwt:` prefix not stripped | Check `getToken()` in `api.ts` and `auth.ts`          |
| WebSocket closes immediately         | Token not sent or invalid                  | Use `?token=` in WS URL; check JWT expiry               |
| Messages not appearing in inbox      | WAHA webhook not reaching backend          | Set `WAHA_WEBHOOK_URL`; check firewall / ngrok          |
| CORS errors in browser console       | `CORS_ORIGINS` doesn't include frontend    | Update `.env` and restart backend                       |
| Stale data after staff action        | React Query not invalidating               | Add correct `invalidateQueries` keys in mutation opts   |
| Duplicate API calls in `api.ts`      | Copy-paste error (lines 402–488)           | Remove the duplicated block at the bottom of `api.ts`    |

---

## 15. Key Files Reference

| File                                         | Role                                           |
|----------------------------------------------|-------------------------------------------------|
| `backend/src/app.ts`                         | Express app, route registration, middleware     |
| `backend/src/server.ts`                      | HTTP + WebSocket server bootstrap               |
| `backend/src/websocketServer.ts`             | WebSocket server, auth, broadcast functions     |
| `backend/src/middleware/auth.ts`             | JWT validation, tenant impersonation            |
| `backend/src/middleware/webhookAuth.ts`      | HMAC / secret validation for inbound webhooks   |
| `backend/src/routes/webhook.routes.ts`       | WAHA + n8n inbound webhook endpoints            |
| `backend/src/services/waha.service.ts`       | Direct WAHA HTTP API calls (sendFile, sendText) |
| `backend/src/services/message.service.ts`    | Message business logic + WAHA dispatch          |
| `backend/src/config/index.ts`                | Environment variable parsing                    |
| `frontend/src/services/api.ts`               | Axios instance, interceptors, all API functions |
| `frontend/src/services/websocket.ts`         | WebSocket client class with reconnect logic     |
| `frontend/src/services/auth.ts`              | Token storage / retrieval helpers               |
| `frontend/src/context/AuthContext.tsx`        | React auth state provider                       |
| `frontend/src/context/WebSocketContext.tsx`   | React WebSocket state provider                  |
| `frontend/src/hooks/useApi.ts`               | React Query wrappers                            |
| `frontend/src/hooks/useRealtime.ts`           | WebSocket hook for pages                        |
| `frontend/vite.config.ts`                    | Dev proxy: `/api` → `:4000`, `/ws` → `ws://:4000` |
| `docker-compose.yml`                         | Service orchestration, env injection            |
