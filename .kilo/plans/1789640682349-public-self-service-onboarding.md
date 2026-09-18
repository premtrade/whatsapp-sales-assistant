# Public Self-Service Business Onboarding Plan

## Current State

- `businesses` table exists with `slug`, `whatsapp_phone`, `waha_session_name`, `status`.
- Multi-tenant `business_id` scoping is applied across 15+ tables via migrations `045`–`051`.
- `POST /api/businesses` requires `super_admin`. No public signup endpoint exists.
- `business.service.ts` references a non-existent `businesses.business_id` column (broken).
- WAHA is single-session in Docker compose (`WAHA_SESSION=default`), but WAHA itself supports multiple sessions.
- n8n Workflow 01 resolves a business by `businesses.whatsapp_phone` or `businesses.waha_session_name`.
- No email/SMS delivery exists in the codebase. Verification must happen in-app or via WhatsApp.

## Goal

Anyone can sign up a new business through a public form, immediately log in, and complete setup without admin intervention.

## Constraints

- **No email/SMS provider.** Verification must use in-app flows or WhatsApp.
- **Single WAHA container** in compose today. Multi-session is a WAHA configuration change, not a code blocker.
- **Slug must be globally unique.** WhatsApp phone should be unique per active business.
- **n8n Workflow 01** already routes by session/phone, so the workflow layer is ready for multi-tenant.

## Flow

```
Public signup form
  → POST /api/public/signup
    → Create business (status = 'pending')
    → Create owner staff user (status = 'active', role = 'admin')
    → Seed default settings
    → Return JWT + business slug
  → Owner logs in, sees setup checklist
    → Step 1: Connect WhatsApp (scan QR for their WAHA session)
    → Step 2: Upload knowledge documents
    → Step 3: Review AI prompt / quick replies
    → Step 4: Send test message
  → System marks business as 'active'
```

## Implementation Plan

### 1. Fix Broken Business Service

**File:** `backend/src/services/business.service.ts`

- Remove all references to `businesses.business_id` (schema has no such column).
- In `getBusinesses`: if caller is not `super_admin`, filter to businesses where the caller's staff user is a member (cross-join or EXISTS on `staff_users`).
- In `getBusinessById`: same scoping rule.
- In `createBusiness`: remove `business_id` from `INSERT` and parameters.
- In `updateBusiness` / `deleteBusiness`: remove invalid `business_id = $N` predicate.

### 2. Add Public Signup Endpoint

**Files:** `backend/src/routes/public.routes.ts`, `backend/src/controllers/public.controller.ts`, `backend/src/services/public.service.ts`

New unauthenticated route: `POST /api/public/signup`

Request body:
```json
{
  "businessName": "Acme Corp",
  "slug": "acme",
  "whatsappPhone": "+18765551234",
  "ownerName": "Jane Doe",
  "email": "jane@acme.com",
  "password": "securePass123!"
}
```

Service logic (`public.service.ts`):
1. Validate slug format: lowercase alphanumeric + hyphens, 3–50 chars, globally unique.
2. Validate `whatsappPhone`: E.164 format, unique among `active`/`pending` businesses.
3. Validate email format and uniqueness in `staff_users`.
4. Validate password: min 8 chars, 1 uppercase, 1 number.
5. Create `businesses` record with `status = 'pending'`, `currency = 'JMD'`, `timezone = 'America/Jamaica'`.
6. Hash password, create `staff_users` record with `role = 'admin'`, `business_id = new_business.id`.
7. Seed default settings for the business:
   - `whatsapp_api_version`: `v18.0`
   - `ai_model`: `llama-3.3-70b-versatile`
   - `message_limit`: `1000`
   - `currency`: `JMD`
   - `timezone`: `America/Jamaica`
   - `webhook_url`: empty
   - `ai_prompt`: empty (business configures later)
8. Return `{ success, data: { business, user, token } }`.

**Transaction:** Wrap business + staff + settings inserts in a single DB transaction.

### 3. Add Frontend Public Signup Page

**Files:** `frontend/src/pages/Signup.tsx`, route in `frontend/src/App.tsx`

- Public route (no auth required).
- Form fields: business name, slug (auto-generated from name, editable), WhatsApp phone, owner full name, email, password, confirm password.
- Client-side validation + API call to `POST /api/public/signup`.
- On success: store JWT, redirect to `/setup` checklist.
- On error: show field-level validation messages.

### 4. Add Setup Checklist Page

**File:** `frontend/src/pages/Setup.tsx`

Authenticated route. Visible only when `business.status === 'pending'`.

Steps:
1. **Connect WhatsApp**
   - Show QR code fetched from WAHA for the business's session.
   - Session name: `businesses.waha_session_name` (auto-generated from slug during signup).
   - Poll `GET /api/whatsapp/status` until connected.
   - Once connected, verify phone matches `businesses.whatsapp_phone`.
   - Call `PATCH /api/public/business/{id}/activate` to flip status to `active`.
   - Redirect to dashboard.

2. **Upload Knowledge** (optional, can skip)
   - Link to Knowledge page.

3. **Configure AI** (optional, can skip)
   - Link to Settings page.

4. **Test**
   - Prompt to send a WhatsApp message to the business number.
   - Show "Send test message" button that triggers a WAHA send.
   - Verify inbound routing works.

### 5. Add Business Activation Endpoint

**Files:** extend `public.service.ts` or `business.service.ts`

`PATCH /api/public/business/{id}/activate`

- Requires auth (owner or super_admin).
- Sets `businesses.status = 'active'`, `updated_at = NOW()`.
- Returns updated business.

### 6. Multi-Session WAHA Support

**File:** `docker-compose.yml`

Current: `WAHA_SESSION: ${WHATSAPP_SESSION:-default}` (single session).

Change: remove the global `WAHA_SESSION` env var. The backend will pass the session name per-request in the `X-Session-Name` header or as a query parameter.

Update `backend/src/config/index.ts`:
- `waha.session` becomes optional/removed from config.
- New method `getWahaSession(tenantId)` that looks up `businesses.waha_session_name`.

Update `backend/src/services/waha.service.ts` and `whatsappConfig.service.ts`:
- All WAHA API calls include `X-Session-Name: <business.waha_session_name>`.

**Note:** WAHA Chrome image already supports multiple sessions in one container. Each session gets its own directory under `/app/.sessions/`.

### 7. Auto-Generate WAHA Session Name

During signup, generate `waha_session_name` from slug: `waha-{slug}` (max 100 chars, lowercase alphanumeric + hyphens).

Store in `businesses.waha_session_name`.

n8n Workflow 01 already uses `session` from the payload or falls back to `default`. Update Workflow 01 to pass the resolved `business_id` through so downstream nodes can use it. (This is already partially done—`business_id` is passed to Workflow 2.)

### 8. Backend Routes Summary

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/public/signup` | None | Create business + owner |
| PATCH | `/api/public/business/:id/activate` | Owner/Admin | Mark business active |
| GET | `/api/public/business/slug/:slug` | None | Check slug availability (for signup form) |
| GET | `/api/public/business/phone/:phone` | None | Check phone availability |

### 9. Frontend Route Summary

| Path | Component | Auth | Purpose |
|------|-----------|------|---------|
| `/signup` | `Signup.tsx` | None | Public signup form |
| `/setup` | `Setup.tsx` | Required | First-time WhatsApp pairing + checklist |
| `/businesses` | `BusinessesPage.tsx` | Super-admin only | Manage all businesses |

## Validation

1. **Unit tests:**
   - `public.service.ts`: signup with valid/invalid inputs, duplicate slug, duplicate phone, weak password.
   - `business.service.ts`: fix and cover create/list/get without SQL errors.

2. **Integration test:**
   - `POST /api/public/signup` → 201, returns JWT.
   - Login with new credentials → 200, `businessId` in token.
   - `GET /api/contacts` with new token → returns only new business's contacts.
   - `PATCH /api/public/business/:id/activate` → status changes to `active`.

3. **Manual smoke test:**
   - Open `/signup`, fill form, submit.
   - Log in with new credentials.
   - Complete WhatsApp QR pairing in Setup page.
   - Send WhatsApp message to business number.
   - Verify n8n Workflow 01 resolves correct `business_id` and AI responds.

## Out of Scope

- Email/SMS delivery for password reset or notifications.
- Approval queue / super-admin review of pending businesses.
- Multiple WhatsApp numbers per business (1:1 mapping for now).
- Parent/child business hierarchy.
- Payment/billing integration.

## Open Questions

1. Should signup auto-activate the business immediately, or require WhatsApp pairing first? **Recommended:** Require WhatsApp pairing so the business is functional end-to-end before being marked `active`.
2. Should we allow signup with a personal WhatsApp number (not Business API)? **Recommended:** Yes, WAHA supports personal numbers; just document that the number becomes the business's channel.
3. Should slugs be changeable after signup? **Recommended:** Yes, via `PUT /api/businesses/:id` by admin, with re-indexing of dependent URLs if any.
