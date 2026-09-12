# WhatsApp Sales Assistant — Garco Construction Audit & Improvement Plan

## Executive Summary

The codebase is well-structured with solid foundations (TypeScript strict mode, PostgreSQL with pgvector, n8n orchestration, React + TanStack Query frontend, comprehensive audit logging). However, several gaps limit customer utility and sales workflow efficiency for a construction firm. This plan prioritizes improvements by impact and implementation readiness.

---

## Priority 1: Fix Critical Reliability Gaps (Week 1-2)

### 1.1 Implement Lead Scoring Service & API
**Problem:** `lead_scores` and `lead_score_history` tables exist (migration `035_lead_scoring.sql`) but no backend service, controller, or routes expose them. The AI Brain has no mechanism to populate or update scores.

**Fix:**
- Create `backend/src/services/leadScore.service.ts` with:
  - `calculateAndSaveLeadScore(contactId, conversationId, signals)` — compute weighted scores from AI-extracted signals (budget, urgency, project_type, location, engagement)
  - `getLeadScores(filters)` — paginated list with sorting by `total_score DESC`
  - `getLeadScoreById(id)` — single record with history
  - `getLeadPipeline()` — aggregated pipeline view
- Create `backend/src/controllers/leadScore.controller.ts`
- Create `backend/src/routes/leadScore.routes.ts` and mount at `/api/lead-scores`
- Add `lead_score` column to `conversations` view queries in `conversation.service.ts`
- Update n8n Workflow 2 (AI Brain) to call a new `Lead Score Tool` after extracting customer facts, passing: `budget`, `urgency`, `project_type`, `location`, `engagement_level`
- Add `lead_scores` to `dashboard.service.ts` stats (average score, distribution by status)

**Validation:** Create `tests/integration/test_lead_scoring.py` — verify score calculation, history logging, API endpoints return 200 with correct schema.

---

### 1.2 Implement WebSocket Authentication
**Problem:** `backend/src/server.ts` creates a WebSocket server but never validates JWT tokens. Any client can connect and receive broadcasts.

**Fix:**
- In `server.ts`, on WS connection, wait for first message of type `auth` with `{ token }`
- Call `auth.service.validateToken(token)` before allowing subscription
- Return error message and close connection if invalid
- Update `frontend/src/services/websocket.ts` to send auth immediately after connect

**Validation:** Attempt WS connection without token — connection closes. With valid token — receives broadcasts.

---

### 1.3 Add Circuit Breaker & Retry for External APIs
**Problem:** Direct calls to Groq, HuggingFace, and WAHA have no timeout protection, retry logic, or fallback. A single Groq outage makes the entire bot unresponsive.

**Fix:**
- Add `backend/src/utils/circuitBreaker.ts` using `opossum` or simple sliding-window implementation
- Wrap all external HTTP calls in n8n Code nodes (or create a shared n8n sub-workflow):
  - Groq: 3 retries, 10s timeout, fallback to cached response or handoff
  - HuggingFace: 2 retries, 15s timeout, fallback to mock embeddings (already exists in `scripts/embed_memory.py`)
  - WAHA: 2 retries, 5s timeout, fallback to queue for retry
- Add `WAHA_RETRY_QUEUE` table for failed outgoing messages with `retry_count`, `next_retry_at`, `status`

**Validation:** Simulate Groq 503 — AI falls back to handoff after 3 retries. Verify retry queue entries created for failed WAHA sends.

---

### 1.4 Fix Inconsistent Pagination Params
**Problem:** Frontend uses `pageSize` (`Dashboard.tsx:21`) but backend expects `limit` (`conversation.service.ts:64`). Some services use `page`/`limit`, others `page`/`pageSize`. This causes silent failures or incorrect pagination.

**Fix:**
- Standardize all backend services to use `page` + `limit`
- Update `frontend/src/services/api.ts` to always send `limit` instead of `pageSize`
- Add integration test verifying pagination works end-to-end

---

## Priority 2: Enhance AI Quality & Construction-Specific Intelligence (Week 3-4)

### 2.1 Upgrade AI Brain to Structured Output
**Problem:** Workflow 2 AI Agent uses free-form text output. No guarantee the model calls tools correctly or extracts facts in a parseable format. The system prompt is a single string with no JSON mode.

**Fix:**
- Switch AI Agent node to use `responseFormat: "json_object"` (or equivalent structured output)
- Define output schema:
  ```json
  {
    "reply": "string — message to customer",
    "facts_extracted": [{"key": "string", "value": "string", "confidence": "number"}],
    "intent": "quote_request|appointment_request|handoff|general_inquiry|complaint",
    "lead_stage": "new|qualifying|qualified|...",
    "sentiment": "positive|neutral|negative|frustrated",
    "escalate": "boolean",
    "escalation_reason": "string"
  }
  ```
- Create `Extract Structured Facts` Code node after AI Agent to parse JSON and upsert to `customer_facts`
- Create `Detect Intent & Sentiment` Code node to update `conversations.lead_stage` and trigger handoff if sentiment is `frustrated` or `negative`
- Update `backend/src/services/conversation.service.ts` to accept `lead_stage` updates via PATCH `/api/conversations/:id/lead-stage`

**Validation:** Unit test with mock AI responses for each intent. Verify `customer_facts` upserted correctly, `lead_stage` updated, handoff triggered for frustrated sentiment.

---

### 2.2 Add Construction Project Type Taxonomy
**Problem:** Quotes are generic with no project categorization. Garco offers 12 specific services (roof, electrical, plumbing, painting, etc.) but the system treats all requests identically.

**Fix:**
- Add `project_types` lookup table or JSONB enum in `quotes` and `lead_scores`:
  ```sql
  CREATE TABLE project_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    category VARCHAR(50),
    typical_duration VARCHAR(50),
    requires_site_visit BOOLEAN DEFAULT true
  );
  INSERT INTO project_types (name, category, typical_duration, requires_site_visit) VALUES
    ('General Construction/Renovation', 'construction', '2-12 weeks', true),
    ('Roof Works', 'structural', '1-3 weeks', true),
    ('Electrical Works', 'mechanical', '1-2 weeks', true),
    ('Plumbing Works', 'mechanical', '1-2 weeks', true),
    ('A/C Works', 'mechanical', '1-3 days', true),
    ('Painting Works', 'finishing', '3-10 days', true),
    ('Dry Wall Partitions & Ceilings', 'finishing', '2-5 days', true),
    ('General Grille & Iron Works', 'structural', '1-3 weeks', true);
  ```
- Update AI Brain prompt to classify customer request into a `project_type` from this taxonomy
- Update Quote Tool to require `project_type_id` and show category-specific notes
- Update frontend `Quotes.tsx` to display project type badge
- Add `project_type` filter to `dashboard.service.ts` pipeline breakdown

**Validation:** Customer says "I need a new roof" → AI classifies as `Roof Works`, quote includes category, dashboard shows roof project count.

---

### 2.3 Implement Proactive Re-engagement Sequences
**Problem:** Abandoned conversations are not automatically followed up. Workflow 10 exists but is not connected to the main flow.

**Fix:**
- Create `backend/src/services/followUp.service.ts`:
  - `detectAbandonedConversations()` — find conversations where `last_message_at > 24h ago` AND `status = 'active'` AND no pending handoff
  - `scheduleFollowUp(conversationId, delayMinutes, template)` — insert into `follow_up_queue`
  - `getDueFollowUps()` — query `follow_up_queue` where `scheduled_at <= NOW()` AND `status = 'pending'`
- Create `follow_up_queue` table:
  ```sql
  CREATE TABLE follow_up_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id),
    contact_id UUID NOT NULL REFERENCES contacts(id),
    template_key VARCHAR(50) NOT NULL,
    scheduled_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    sent_at TIMESTAMPTZ,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    metadata JSONB DEFAULT '{}'::jsonb
  );
  ```
- Create n8n workflow `11 - Follow-up Dispatcher` triggered by backend webhook `/api/follow-ups/dispatch`
- Add templates: `abandoned_6h`, `abandoned_24h`, `quote_follow_up_3d`, `appointment_reminder_1h`
- Update `backend/src/routes/followUp.routes.ts` with `POST /api/follow-ups/dispatch` (auth-required)

**Validation:** Simulate abandoned conversation — verify follow-up queued, dispatched at scheduled time, max 3 attempts.

---

## Priority 3: Improve Staff UX & Lead Conversion (Week 5-6)

### 3.1 Enrich Conversation Detail Context Panel
**Problem:** The right panel in `ConversationDetail.tsx` shows only basic contact info. Staff must navigate away to see lead score, customer facts, or appointment history.

**Fix:**
- Update `backend/src/controllers/conversation.controller.ts` `getConversation` to join:
  - `lead_scores` (latest score, status, project_type, estimated_budget)
  - `customer_facts` (all facts for contact)
  - Upcoming `appointments` (next 2 scheduled/confirmed)
  - Recent `quotes` (last 3)
- Update `frontend/src/pages/ConversationDetail.tsx` context panel to show:
  - **Lead Score** — circular progress indicator (0-100) with color coding (red <30, yellow 30-70, green >70)
  - **Customer Facts** — compact list with confidence badges
  - **Project Interest** — from lead_scores.project_type
  - **Next Appointment** — date/time with "View" link
  - **Recent Quotes** — status badges with totals
- Add "Create Quote" and "Schedule Appointment" quick-action buttons in context panel that open modals

**Validation:** Open conversation with lead score 85, 3 facts, upcoming appointment — all visible without navigation.

---

### 3.2 Add Quick-Reply Templates & Internal Notes
**Problem:** Staff retype common responses. No way to leave internal notes on conversations for other agents.

**Fix:**
- Create `conversation_notes` table:
  ```sql
  CREATE TABLE conversation_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    staff_id UUID NOT NULL REFERENCES staff_users(id),
    note TEXT NOT NULL,
    is_internal BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  ```
- Create `quick_replies` table:
  ```sql
  CREATE TABLE quick_replies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(100) NOT NULL,
    text TEXT NOT NULL,
    category VARCHAR(50),
    created_by UUID NOT NULL REFERENCES staff_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  ```
- Seed initial quick replies for Garco: "Schedule site visit", "Send quote", "Request more info", "Escalate to manager"
- Add `POST /api/conversations/:id/notes` and `GET /api/conversations/:id/notes`
- Add `GET /api/quick-replies` and `POST /api/quick-replies`
- Update `ConversationDetail.tsx`:
  - Notes tab in context panel with add-note form
  - Quick-reply chips above message input

**Validation:** Staff adds internal note — visible to other staff but not to AI/customer. Quick reply inserted into message input on click.

---

### 3.3 Build Lead Pipeline Dashboard View
**Problem:** Dashboard shows generic stats but no lead pipeline visualization. Staff cannot see which leads need attention.

**Fix:**
- Add new frontend page `src/pages/LeadPipeline.tsx` with Kanban-style board:
  - Columns: New → Qualifying → Qualified → Quote Requested → Quote Sent → Negotiating → Appointment Requested → Won → Lost
  - Cards show: contact name, project type, lead score, estimated budget, last activity
- Add `GET /api/lead-pipeline` returning grouped conversations by `lead_stage`
- Update `dashboard.service.ts` to include `leadDistribution` by stage
- Add filters: score range, project type, assigned staff, date range
- Add "Drag to update stage" functionality (PATCH `/api/conversations/:id/lead-stage`)

**Validation:** Lead with score 92 in "Qualified" stage moves to "Quote Requested" — card updates in real-time via WebSocket.

---

## Priority 4: Technical Debt & Reliability (Week 7-8)

### 4.1 Add Redis Caching Layer
**Problem:** Dashboard makes 9+ parallel DB queries on every load. Knowledge search queries pgvector every time. No caching.

**Fix:**
- Install `ioredis` in backend
- Create `backend/src/utils/cache.ts` with TTL-based caching:
  - Dashboard stats: 60s TTL
  - Knowledge search results: 300s TTL
  - Customer facts: 120s TTL
  - Product catalog: 600s TTL (rarely changes)
- Invalidate cache on writes: new message, fact update, quote created, appointment updated
- Add `CACHE_ENABLED` and `CACHE_TTL` env vars for toggling

**Validation:** Load dashboard twice within 60s — second load hits cache (verify via Redis MONITOR or log count).

---

### 4.2 Implement Request ID Correlation
**Problem:** When debugging, there is no way to trace a single customer message through n8n → backend → WAHA.

**Fix:**
- Add `X-Request-ID` middleware in Express that generates UUID if missing
- Pass `X-Request-ID` in all outgoing HTTP calls from n8n (WAHA, Groq, HuggingFace)
- Include `request_id` in all audit log entries
- Add `request_id` column to `messages.metadata` on outgoing AI messages
- Update `backend/src/utils/logger.ts` to include `requestId` in all log entries

**Validation:** Send message → trace single request_id through all log entries and database records.

---

### 4.3 Add Graceful Shutdown & Health Check Improvements
**Problem:** `server.ts` has no SIGTERM handling. Docker Compose may kill the process mid-request. Health check only checks `/health` but not downstream dependencies.

**Fix:**
- In `server.ts`, add:
  ```typescript
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully');
    server.close(() => {
      logger.info('HTTP server closed');
      pool.end(() => {
        logger.info('PostgreSQL pool closed');
        process.exit(0);
      });
    });
    setTimeout(() => process.exit(1), 10000);
  });
  ```
- Update `health.routes.ts` to include:
  - `POSTGRES_POOL` — active/idle/waiting connections
  - `REDIS_PING` — PING response time
  - `N8N_HEALTH` — HTTP 200 from n8n
  - `WAHA_SESSION` — session status from WAHA
  - `GROQ_API` — simple model list call

---

### 4.4 Add Input Sanitization Hardened Against XSS
**Problem:** `sanitizeString` in `validation.ts` only strips `<>`. Customer messages stored in DB and rendered in frontend without escaping.

**Fix:**
- Replace `sanitizeString` with `DOMPurify` (or `sanitize-html`) for all user-facing text
- Add `sanitizePagination` to enforce `limit <= 100`
- Add SQL comment-style injection check: reject inputs containing `--` or `/*` in text fields
- Ensure all frontend rendering uses `{value}` (React auto-escapes) — audit `MessageBubble` and all components

---

## Priority 5: Construction-Specific Features (Week 9-10)

### 5.1 Add Site Visit Scheduling with Location
**Problem:** Appointments have no location context. Garco needs site visits, not just office meetings.

**Fix:**
- Add `appointment_types` lookup:
  ```sql
  CREATE TABLE appointment_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    duration_minutes INTEGER DEFAULT 60,
    requires_quote BOOLEAN DEFAULT false,
    color VARCHAR(20)
  );
  INSERT INTO appointment_types (name, duration_minutes, requires_quote, color) VALUES
    ('Site Visit / Consultation', 60, false, '#16a34a'),
    ('Quote Review Meeting', 30, true, '#2563eb'),
    ('Project Start Meeting', 60, true, '#9333ea'),
    ('Progress Inspection', 45, false, '#f59e0b'),
    ('Final Walkthrough', 60, true, '#10b981');
  ```
- Add `location` and `coordinates` (lat/lng) to `appointments`
- Update Appointment Tool workflow to include `location` and `appointment_type_id`
- Update `frontend/src/pages/Appointments.tsx` to show map pin (using static map image or OpenStreetMap embed)
- Add WhatsApp location sharing support in Workflow 2: if customer sends location, extract coordinates and store in `appointments.location`

---

### 5.2 Add Document & Photo Sharing
**Problem:** Customers cannot share project photos or blueprints. Staff cannot send branded documents beyond PDF quotes.

**Fix:**
- Add `conversation_attachments` table:
  ```sql
  CREATE TABLE conversation_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    file_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_size INTEGER,
    storage_path TEXT NOT NULL,
    uploaded_by VARCHAR(20) NOT NULL CHECK (uploaded_by IN ('customer', 'staff', 'ai')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  ```
- Update WAHA webhook (Workflow 1) to capture incoming media and store in `conversation_attachments`
- Add `POST /api/conversations/:id/attachments` for staff uploads
- Add `GET /api/attachments/:id/download` for retrieval
- Update `ConversationDetail.tsx` to render image/video/document previews inline
- Update `sendWahaDocument` in `waha.service.ts` to support sending images/documents

---

### 5.3 Implement Multi-Language Support (English + Jamaican Patois)
**Problem:** `preferred_language` defaults to `en` but no translation logic exists. Garco's primary market is Jamaica where Patois is widely spoken.

**Fix:**
- Create `translations` table:
  ```sql
  CREATE TABLE translations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    language VARCHAR(10) NOT NULL,
    key VARCHAR(100) NOT NULL,
    value TEXT NOT NULL,
    UNIQUE(language, key)
  );
  ```
- Seed English + Jamaican Patois translations for common bot responses (greetings, price disclaimers, handoff messages)
- Update AI Brain prompt to detect language and respond in matching language
- Update `contact.service.ts` to read `preferred_language` and pass to AI context
- Add language detection in n8n using LangChain language detection node or simple keyword matching

---

## Validation & Rollout Plan

### Pre-Implementation
1. Run `npm run lint && npm run typecheck` — establish baseline
2. Run full test suite: `pytest tests/` and `npm test` — confirm all pass
3. Tag current state: `git tag pre-audit-2026-09-06`

### Implementation Order
1. **Week 1-2:** Priority 1 (Reliability) — lead scoring API, WS auth, circuit breaker, pagination fix
2. **Week 3-4:** Priority 2 (AI Quality) — structured output, project taxonomy, follow-up sequences
3. **Week 5-6:** Priority 3 (Staff UX) — context panel, quick replies, lead pipeline
4. **Week 7-8:** Priority 4 (Tech Debt) — caching, request IDs, graceful shutdown, XSS hardening
5. **Week 9-10:** Priority 5 (Construction Features) — site visit types, attachments, multi-language

### Per-Pull-Request Validation
- Backend: `npm run lint && npm run typecheck && npm test`
- Frontend: `npm run lint && npm run typecheck && npm test`
- Integration: `pytest tests/integration/ -v`
- Security: Run `npm audit` and review new dependencies

### Rollback Strategy
- Each priority is independently deployable
- Use feature flags in `.env` (`ENABLE_LEAD_SCORING`, `ENABLE_WS_AUTH`, etc.)
- Database migrations are backward-compatible (ADD COLUMN IF NOT EXISTS)

---

## Open Questions

1. **WhatsApp Interactive Messages:** Should the bot use WhatsApp List/Reply buttons for appointment confirmation and quote acceptance? This requires WAHA configuration review and increases user engagement but adds UI complexity.

2. **PDF Quote Delivery:** Should quotes be sent as WhatsApp documents (via `sendFile`) or as links to a frontend-hosted page? Current implementation writes to disk with no CDN.

3. **Lead Score Thresholds:** What score thresholds trigger automatic handoff vs. AI continuation? Recommend: score <30 → nurture sequence, 30-70 → AI continue, >70 → immediate staff notification.

4. **Off-Hours Handling:** Should the bot schedule callbacks for after-hours inquiries, or immediately handoff? Garco's hours are unknown (per `Garco.md`).

---

## Files Changed Summary

| Path | Change Type |
|------|-------------|
| `backend/src/services/leadScore.service.ts` | New |
| `backend/src/controllers/leadScore.controller.ts` | New |
| `backend/src/routes/leadScore.routes.ts` | New |
| `backend/src/services/followUp.service.ts` | New |
| `backend/src/utils/circuitBreaker.ts` | New |
| `backend/src/utils/cache.ts` | New |
| `backend/src/server.ts` | Modify (SIGTERM, WS auth) |
| `backend/src/services/conversation.service.ts` | Modify (lead_stage, enrich) |
| `backend/src/services/dashboard.service.ts` | Modify (lead pipeline) |
| `backend/src/middleware/validation.ts` | Modify (XSS hardening) |
| `backend/src/app.ts` | Modify (new routes) |
| `backend/src/routes/*` | Modify (pagination consistency) |
| `frontend/src/pages/ConversationDetail.tsx` | Modify (enriched context panel) |
| `frontend/src/pages/LeadPipeline.tsx` | New |
| `frontend/src/services/api.ts` | Modify (pagination params) |
| `frontend/src/services/websocket.ts` | Modify (auth handshake) |
| `database/schema/*` | New migrations |
| `workflows/Workflow 2 - AI Brain.json` | Modify (structured output, project type) |
| `workflows/06 - Quote Tool.json` | Modify (project_type_id) |
| `workflows/05 - Appointment Tool.json` | Modify (location, type) |
| `workflows/03 - Memory & Context Builder.json` | Modify (sentiment, intent) |
