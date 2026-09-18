# Business Onboarding Plan

## Current State

The database schema supports multi-tenancy through the `businesses` table and `business_id` scoping on 15+ operational tables. However, the onboarding path is **incomplete and partially broken**:

- **Business creation API** (`POST /api/businesses`) is restricted to `super_admin` only.
- **`business.service.ts` references a non-existent `businesses.business_id` column**, causing runtime SQL errors on create/list.
- **No self-service signup flow** exists in the backend or frontend.
- **No invitation flow** exists for creating the first staff user of a new business.
- **Inbound WhatsApp resolution** works by matching the WAHA session name or destination phone against `businesses.whatsapp_phone` / `businesses.waha_session_name` inside n8n Workflow 01.
- **WAHA is currently single-session** in the Docker compose (`WAHA_SESSION=default`), though the schema supports per-business session names.
- **No onboarding wizard, knowledge-base seeding, or default configuration** exists for new tenants.

## Decision Required

**How should a new business be onboarded?**

### Option A: Admin-Provisioned (Recommended for now)
A `super_admin` creates the business via the API/UI, then an admin creates staff users for that business. The business owner receives credentials out-of-band (email, SMS, etc.). This matches the current auth model and requires the smallest surface area.

### Option B: Self-Service with Approval
A public signup form creates a `pending` business. A `super_admin` approves it, after which the business becomes active. This requires email delivery, approval queue UI, and timeout/cleanup logic.

### Option C: Fully Self-Service
Anyone can sign up, create their business, and invite staff without admin intervention. This requires email verification, password reset, and stricter rate-limiting/abuse prevention.

**Recommendation:** Start with **Option A** because the codebase already enforces role-based access and has no email infrastructure. Self-service can be layered on later.

## Implementation Plan

### 1. Fix Broken Business Service

**File:** `backend/src/services/business.service.ts`

Remove references to `businesses.business_id`, which does not exist in the schema:

- In `getBusinesses`: drop the `tenantId` filter or replace it with a check against `staff_users` membership if the caller is not `super_admin`.
- In `getBusinessById`: drop the `tenantId` filter or scope it correctly.
- In `createBusiness`: remove the `business_id` column from the `INSERT`.
- In `updateBusiness` / `deleteBusiness`: drop the invalid `business_id = $N` predicate.

**Validation:** Run existing backend tests and add a unit test that calls `createBusiness` with valid data and asserts no SQL error is thrown.

### 2. Expose Business Management UI

**File:** `frontend/src/App.tsx` and related pages

Add a **Businesses** page accessible only to `super_admin`:

- List businesses with status, slug, WhatsApp phone, session name.
- Create business form: name, slug, WhatsApp phone, session name, currency, timezone.
- Edit / soft-delete business.

**Backend routes already exist** under `/api/businesses` and enforce `super_admin`. The frontend just needs to consume them.

### 3. Build Staff Invitation Flow

**Files:** `backend/src/services/staff.service.ts`, `backend/src/routes/staff.routes.ts`, new frontend pages/components

When a business is created, the admin must be able to invite staff:

1. Admin creates a staff user with `status = 'invited'` and a random password hash.
2. System generates a time-limited invitation token stored in `staff_users.metadata`.
3. Frontend sends an invitation email/SMS containing a magic-link-style URL: `https://app/accept-invite?token=...`.
4. Backend endpoint `POST /api/staff/accept-invite` validates the token, sets a password, and flips status to `active`.

**Note:** Email/SMS delivery is out of scope for the initial plan; the invitation link can be copied manually from the UI for now.

### 4. Seed Default Configuration per Business

When a new business is created, seed the following automatically:

- **Settings:** Default values for `whatsapp_api_version`, `ai_model`, `currency`, `timezone`, `message_limit`, etc.
- **Knowledge documents:** Empty state (no Garco-specific content). The business admin can upload their own via the Knowledge page.
- **Quick replies:** Empty set.
- **Staff user:** Create the inviting admin as the first `admin` or `manager` user.

This can be done in the `createBusiness` transaction or via a new `onboardBusiness` service function.

### 5. Document Manual / Automated Onboarding Steps

**File:** `docs/runbook.md` or a new `docs/onboarding.md`

Document the exact steps for **Option A**:

1. `super_admin` opens the Businesses page and clicks **New Business**.
2. Enters business name, slug, WhatsApp phone number, and preferred WAHA session name.
3. Saves. System seeds default settings and creates an empty tenant.
4. `super_admin` opens **Staff** page, selects the new business, and creates an admin user.
5. Admin receives invitation link, sets password, and logs in.
6. Admin uploads knowledge documents, configures AI prompt/instructions, and connects WhatsApp via Settings > WhatsApp tab.
7. Test: send a WhatsApp message to the business phone and verify it routes to the correct tenant in n8n Workflow 01.

### 6. WAHA Multi-Session Notes (Out of Scope for Initial Onboarding)

The current Docker compose provisions a **single WAHA session**. If a deployment needs multiple businesses with separate WhatsApp numbers:

- Each business must have its own WAHA session name.
- The `WAHA_SESSION` env var would need to be removed or generalized.
- n8n Workflow 01 already resolves the business by `session` or `to` phone, so the workflow layer is ready.
- Infrastructure changes (multiple sessions, QR provisioning, session lifecycle) are **out of scope** for the initial onboarding plan.

## Validation

1. **Unit tests:** Fix `business.service.ts` and add test coverage for create/list.
2. **Integration test:** Create a business, create a staff user for it, verify that staff user can log in and see only their tenant's data.
3. **Manual smoke test:** Run Docker compose, create a business via API, insert a test contact/message, verify n8n Workflow 01 resolves the correct `business_id`.

## Open Questions

1. Should the `businesses` table support a parent/child hierarchy (e.g., agencies managing multiple businesses)? The current `business.service.ts` hints at it, but the schema does not. **Recommended:** Keep businesses flat for now; remove the erroneous `business_id` references.
2. Should invitation tokens expire? **Recommended:** Yes, 7 days.
3. Should a business be able to have multiple WhatsApp numbers/sessions? **Recommended:** Yes, but defer to a future migration after single-session onboarding is stable.
