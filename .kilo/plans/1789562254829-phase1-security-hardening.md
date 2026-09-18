# Phase 1 Security Hardening - Implementation Plan

## Overview
Close all Phase 1 security gaps identified in the audit. Focus on webhook source validation, WebSocket tenant isolation, and authentication hardening.

---

## 1. Webhook Source Validation (webhookAuth.ts)

### 1.1 Capture Raw Request Body
- **File**: `backend/src/middleware/webhookAuth.ts`
- Add `express.raw({ type: 'application/json' })` middleware before `express.json()` on webhook routes only
- Store raw body in `req.rawBody` for HMAC computation
- Update `validateWebhookSource` to use `req.rawBody` instead of `JSON.stringify(req.body)`

### 1.2 Require X-Timestamp Header
- **File**: `backend/src/middleware/webhookAuth.ts:41-54`
- Change timestamp validation from optional to required
- Throw `UnauthorizedError('Missing X-Timestamp header')` if absent
- Keep ≤300s skew validation

### 1.3 Support X-Webhook-Secret / X-Signature-256 Headers
- **File**: `backend/src/routes/webhook.routes.ts:32-38, 65-71`
- WAHA: use `x-webhook-secret` + `x-signature-256` (fallback to `x-api-key` for backward compat)
- n8n: use `x-webhook-secret` + `x-signature-256` (fallback to `x-n8n-webhook-secret`)

### 1.4 Configurable Webhook Processing
- **File**: `backend/src/routes/webhook.routes.ts`
- Add config option per source: `forward_to_n8n: true/false`
- If true: POST validated payload to n8n webhook URL
- If false: invoke internal handler functions (to be created)
- Keep backward-compatible acknowledgment response

---

## 2. WebSocket Authentication & Tenant Isolation (websocketServer.ts)

### 2.1 Remove Global Broadcast Fallbacks
- **File**: `backend/src/websocketServer.ts`
- Remove `broadcast()` function entirely
- Change `broadcastToTenant` to require `targetTenantId: string` (not `string | undefined`)
- Throw if `targetTenantId` is falsy/empty

### 2.2 Update All Emit Functions to Require Tenant
- **File**: `backend/src/websocketServer.ts:209-252`
- `emitNewMessage`: remove legacy `(conversationId, message)` signature; require `(tenantId, conversationId, message)`
- `emitHandoffCreated/Updated`: require `tenantId` parameter (no fallback to `handoff?.business_id`)
- `emitConversationStatusUpdated`: require `tenantId` parameter
- `emitDashboardStatsUpdated`: require `tenantId` parameter

### 2.3 Fix Handoff Service to Select business_id
- **File**: `backend/src/services/handoff.service.ts:62-119`
- Add `business_id` to SELECT columns in `getHandoffs`, `getPendingHandoffs`, `getHandoffById`
- Pass `handoff.business_id` to `emitHandoffCreated/Updated` calls

### 2.4 Update All Service Call Sites
- **Files**: 
  - `backend/src/services/message.service.ts:80-81` → pass tenantId
  - `backend/src/services/conversation.service.ts:329-330` → pass tenantId
  - `backend/src/services/quote.service.ts:141` → pass tenantId
  - `backend/src/services/appointment.service.ts:123` → pass tenantId
  - `backend/src/services/handoff.service.ts:193, 235, 263` → use handoff.business_id
  - `backend/src/services/dashboard.service.ts` → add tenantId to all emit calls

### 2.5 WebSocket Auth: DB Lookup for HTTP Requests (auth.ts)
- **File**: `backend/src/middleware/auth.ts:7-56`
- After JWT verify, query DB for user by ID + status='active'
- Return user with fresh `business_id` from DB
- Reject if user not found or inactive
- Populate `req.user` from DB row (not just JWT claims)

---

## 3. Authentication Hardening

### 3.1 Super-Admin Role + Impersonation Audit
- **File**: `backend/src/types/index.ts` → add `'super_admin'` to role enum
- **File**: `backend/src/middleware/auth.ts:27-32`
- Only allow `x-tenant-id` header if `user.role === 'super_admin'`
- Create audit log entry on every impersonation with `actor_tenant`, `target_tenant`, `action: 'tenant_impersonation'`
- Update `StaffUser` type and staff create/update to support `super_admin` role

### 3.2 Remove Duplicate Staff Route Mount
- **File**: `backend/src/app.ts:81-82`
- Remove line 82: `app.use('/api/staff/users', staffRoutes);`
- Keep only `app.use('/api/staff', staffRoutes);`

### 3.3 Apply adminRateLimiter
- **File**: `backend/src/routes/settings.routes.ts` (or create admin routes module)
- Mount `adminRateLimiter` on all admin-only routes (staff CRUD, settings import/export, cache clear)

---

## 4. Webhook Rate Limiting & CORS

### 4.1 Per-Source Rate Limiting
- **File**: `backend/src/middleware/rateLimiter.ts`
- Add `createSourceRateLimiter(sourceName: string)` factory using `keyGenerator: (req) => req.headers['x-webhook-source'] || req.ip`
- Apply in `webhook.routes.ts` per route instead of global `webhookRateLimiter`

### 4.2 Add Webhook Headers to CORS
- **File**: `backend/src/app.ts:40-44`
- Add to `allowedHeaders`: `'X-Webhook-Secret', 'X-Signature-256', 'X-Timestamp', 'X-API-Key', 'X-N8N-Webhook-Secret'`

---

## 5. Validation & Testing

### 5.1 Unit Tests (backend/src/__tests__/security/)
- `webhook_validation.test.ts`: HMAC verify, timestamp replay, malformed payload, rate limiter
- `websocket_auth.test.ts`: no auth, invalid token, valid token, tenant-scoped isolation
- `auth_impersonation.test.ts`: super-admin impersonation audit, admin rejection, audit trail

### 5.2 Integration Tests
- Valid WAHA webhook → 200 + n8n forward/internal processing
- Spoofed signature → 401
- Expired timestamp → 401
- WebSocket without auth → 4001 close
- WebSocket cross-tenant message isolation

---

## 6. Migration & Rollout

### 6.1 Database
- No schema changes needed for Phase 1 (business_id already on handoffs from 046)
- Ensure 046 migration applied (business_id NOT NULL on handoffs)

### 6.2 Deployment
- Update `.env.example` with `WEBHOOK_SECRET`, `WAHA_WEBHOOK_SECRET`, `N8N_WEBHOOK_SECRET`
- Document required webhook headers for WAHA/n8n integration

---

## Risk Summary
| Risk | Mitigation |
|------|------------|
| HMAC signature breakage for existing WAHA/n8n | Keep fallback headers; add migration guide |
| Global broadcast removal breaks existing frontend | Frontend uses auth frame, not broadcasts; test tenant-scoped emits |
| Super-admin role addition requires DB migration | Add role enum, update staff seed, backfill existing admins |
| HTTP auth DB lookup adds latency | Add Redis cache layer (future Phase 3); acceptable for auth |

---

## Validation Commands
```bash
cd backend && npm test -- --testPathPattern="security"
cd backend && npm run build
# Manual: curl WAHA webhook with valid/invalid signatures
# Manual: WebSocket connect with/without token
```

---

## Open Questions (Out of Scope for Phase 1)
- Redis caching for auth DB lookups → Phase 3
- Dead-letter queue for failed webhook forwards → Phase 3
- Automated webhook signature rotation → Phase 5