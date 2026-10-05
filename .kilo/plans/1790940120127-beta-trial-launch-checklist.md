# Public Beta / Trial Launch Checklist

Codebase analyzed: `whatsapp-sales-assistant` — TypeScript/Express backend, React/Vite frontend, PostgreSQL + pgvector, Stripe for billing, Redis cache, WAHA WhatsApp gateway, n8n/LangChain orchestration.

Current state: trial system is **structurally present** (14-day trial, Stripe checkout, plan-based entitlement, usage metering, hourly trial expiry job via `setInterval`) but **not hardened for a public beta launch**. No beta gating, invite/whitelist system, rate limiting, beta-specific monitoring, or staged rollout controls exist.

---

## 1. Technical Infrastructure

### 1.1 Beta Access Control / Feature Flagging
- [x] Implement a `beta_invite` or `beta_whitelist` table with email/slug + expiry + max_uses
- [x] Add a `BETA_ENABLED` env flag or per-plan metadata toggle to gate public signup at the route level (`public.service.ts:84`)
- [x] Return a structured `beta_access_denied` response (not a generic 403) when the beta is closed or email is not whitelisted
- [x] Add a public `/beta/status` endpoint returning `{ open, waitlistUrl, estimatedLaunch }` for the landing page
- [x] Implement rate limiting on signup and trial-creation endpoints to prevent abuse (express-rate-limit or Redis-backed)
- [x] Add a per-IP / per-email signup cooldown (e.g., 1 attempt per 5 min, 3 attempts per hour)

### 1.2 Entitlement Logic Hardening
- [x] **`subscription.service.ts:162`** — `isUsable()`: add a max-trial-length ceiling so trial cannot be extended indefinitely via clock-skew or direct DB edits
- [x] **`subscription.service.ts:283`** — `expireDueTrials()`: confirm idempotency and that it handles concurrent server restarts (two instances running `setInterval` simultaneously)
- [x] **`subscription.service.ts:302`** — `incrementUsage()`: add a concurrency-safe counter (use `UPDATE ... SET used = GREATEST(used, $4)` or advisory lock) to prevent double-counting under high throughput from n8n
- [x] **`subscription.service.ts:311`** — `requireFeatureLimit()`: enforce limits for *all* known metrics before the action, not just at the middleware boundary; audit every route for coverage
- [x] **`subscription.service.ts:322`** — `requireStaffSeat()`: verify this is applied at the staff-creation route boundary and not bypassable
- [x] **`subscription.service.ts:188`** / `subscription.service.ts:204` — `createTrial` vs `createTrialSubscription`: remove the duplicate (`createTrial` is used at `public.service.ts:126`); standardize on `createTrialSubscription` and delete or deprecate `createTrial`
- [x] **`subscription.service.ts:148`** — `SUB_COLS`: validate that the JSONB `plan` projection does not silently drop newly added plan columns when queries are extended

### 1.3 Database Schema & Migrations
- [x] Add a `beta_invites` table migration: `id, email, slug (nullable, for domain invites), token, used_at, created_at, expires_at, metadata`
- [x] Add a `beta_registrations` audit table: `business_id, email, ip_address, user_agent, signed_up_at` for traceability
- [x] Add a `subscription_events` append-only log: `subscription_id, event_type, from_status, to_status, triggered_by, metadata` for audit and debugging trial expiry during beta
- [x] Add a unique partial index on `subscriptions(business_id)` where `status IN ('trialing','active','past_due')` if migration `056_active_subscription_unique.sql` is not already applied
- [x] Add database index on `subscriptions(trial_ends_at)` and `subscriptions(status, created_at)` to speed up `expireDueTrials` and owner dashboard queries
- [x] Add a `plan_changes` audit log: `subscription_id, from_plan_id, to_plan_id, changed_by, changed_at`
- [x] Verify all existing migrations (`053`, `056`, `059`) are idempotent and safe to re-run; add `IF NOT EXISTS` guards where missing

### 1.4 Caching & Consistency
- [x] **`subscription.service.ts:150`** — `getActiveSubscription()`: document that the 5-minute cache means a just-expired trial is visible as `trialing` for up to 5 min; acceptable for beta but must be documented
- [x] Add cache warming on startup so the expiry job does not miss trials that expired while the server was down
- [x] Add a `POST /admin/cache/purge` endpoint (super_admin only) to invalidate all subscription caches if stale data is suspected during beta

### 1.5 Stripe / Billing Provider Readiness
- [x] **`stripe.service.ts:23`** — `createCheckoutSession()`: add a guard that rejects checkout if the trial period in Stripe does not match the local `TRIAL_DAYS` (currently Stripe trial length is not set; Stripe will bill immediately unless `subscription_data.trial_period_days` is added)
- [x] **`stripe.service.ts:121`** — `handleStripeWebhook()`: add handling for `invoice.payment_succeeded` as well as `invoice.paid` to cover both invoice event types Stripe emits
- [x] **`stripe.service.ts:165`** — `customer.subscription.updated`: add handling for Stripe's `unpaid` status → map to `expired` locally
- [x] **`stripe.service.ts:165`** — add handling for `customer.subscription.created` to catch the case where Stripe fires it without a preceding `checkout.session.completed`
- [x] Implement Stripe webhook idempotency: store `event.id` and skip processing if already seen (currently only `invoice.paid` has idempotency via `provider_payment_id` ON CONFLICT)
- [x] **`subscription.routes.ts`** — `paymentsConfigured()`: when Stripe is unconfigured, return a clear frontend state (`beta_mode: true`) so the UI shows a beta signup CTA instead of a broken checkout
- [x] Test webhook endpoint is accessible publicly (no auth middleware) and is protected by Stripe signature verification only

### 1.6 Trial Expiry & Billing Cycle Management
- [x] Replace the in-process `setInterval` in `server.ts:32` with a proper cron job (e.g., `node-cron` or a Kubernetes CronJob) so expiry is not missed on server restarts or horizontal scaling
- [x] Add an `invoice.payment_failed` → `past_due` transition that also sets `grace_period_ends_at = NOW() + GRACE_PERIOD_DAYS` (currently `expireDueTrials` sets grace period on trial expiry, but payment failure does not)
- [x] Define and enforce a maximum grace period (e.g., 7 days) so past_due does not silently linger forever
- [x] Add a `subscription.status` transition log (append-only) so operators can answer "why did this tenant lose access?"
- [x] When a trial expires and grace period ends, trigger an email/push notification to the business owner (currently no notification mechanism exists)

### 1.7 Usage Metering Integrity
- [x] **`subscription.service.ts:302`** — `incrementUsage()`: add an atomic `INSERT ... ON CONFLICT ... DO UPDATE SET used = usage_records.used + EXCLUDED.used` — this is present, but verify it does not double-count under concurrent n8n webhook calls
- [x] Add a usage spike alert: if a single business exceeds 150% of their plan limit in one hour, flag for manual review (abuse detection during beta)
- [x] Implement per-business daily usage caps separate from monthly plan limits to prevent burst abuse
- [x] Add a `/usage/summary` endpoint that returns current-period usage vs limits for the frontend billing page
- [x] Verify `requireUsageLimit` middleware is applied on **all** n8n-triggered routes and not just Express routes

### 1.8 Frontend Beta Experience
- [x] **`Billing.tsx`** — when `paymentsConfigured` is false, show a beta-specific CTA ("Join the beta — free 14-day trial") instead of a blank state
- [x] **`TrialBanner.tsx:49`** — the banner is hidden for `days > 3 && days < 100`; ensure this does not mask an expired trial (days = 0) from the user
- [x] **`TrialBanner.tsx:71`** — hardcoded `planSlug: 'professional'` in checkout; allow the user to pick their plan instead of defaulting
- [x] Add a beta onboarding checklist (connect WhatsApp, send first message, view analytics) shown only during trial
- [x] Add a public plans/pricing page that renders `GET /plans` and shows the Starter/Professional/Business tiers
- [x] Add a "Request beta access" landing page for when the beta is invite-only

### 1.9 Monitoring, Observability, Alerting
- [x] Add structured log fields for every trial lifecycle event: `trial_created`, `trial_expired`, `grace_period_started`, `subscription_activated`, `payment_failed`, `payment_succeeded`
- [x] Set up alerts: > 10 trials expiring in 24h, > 5% of active subs past_due, Stripe webhook returning 4xx/5xx
- [x] Add health check endpoints: `/health` (up), `/health/ready` (DB + Redis reachable), `/health/live` (process alive)
- [x] Instrument `subscription.service.ts` functions with distributed tracing spans (OpenTelemetry) so trial expiry failures are diagnosable in production
- [x] Log n8n webhook latency and failure rate separately from Express routes

---

## 2. Operational Workflows

### 2.1 Beta Enrollment & Invite Management
- [x] Define invite types: email invite (single use), domain invite (e.g., `@acme.com` — unlimited for that domain), promo code (batch with max_uses + expiry)
- [x] Build an admin UI for `super_admin` to generate, revoke, and audit invites
- [x] Define the beta capacity limit (e.g., max 200 concurrent trials) and enforce it at signup
- [x] Define a waitlist strategy when capacity is reached: collect email + company + use-case, send a queue-number confirmation
- [x] Document the beta launch date and end date; store in `settings` table keyed by `beta_end_date`

### 2.2 Trial Expiration Handling
- [x] Run `expireDueTrials` on a schedule (every hour minimum); verify it is safe to run concurrently (idempotent UPDATE with `WHERE trial_ends_at <= NOW()`)
- [x] On trial expiry:
  1. Set `status = 'expired'`, `grace_period_ends_at = NOW() + 3 days`
  2. Send notification email to business owner
  3. Show "trial expired" state in the frontend (not just "no subscription")
  4. After grace period ends, enforce 402 on all tenant routes
- [x] If the business converts to paid during grace period, clear grace period and set `status = 'active'`
- [x] Run a nightly reconciliation job comparing local `subscriptions` to Stripe customer state to catch drift (e.g., Stripe canceled but local still shows `active`)

### 2.3 Billing Cycle Management
- [x] Define what happens at period end for paying customers (currently `current_period_end` is not used for renewal logic — Stripe handles renewals via webhooks)
- [x] Verify Stripe's `customer.subscription.updated` webhook fires on renewal and updates `current_period_start` / `current_period_end` locally
- [x] Handle the downgrade scenario: if a user moves from Business to Professional mid-cycle, determine proration policy (Stripe default is prorated; document this for operators)
- [x] Handle plan deactivation: when `is_active = FALSE` on a plan, prevent new subscriptions from starting it but allow existing ones to continue until period end
- [x] Handle currency: currently all plans are USD; if adding multi-currency, stripe requires per-currency prices and the checkout session currency must match

### 2.4 User Access Controls
- [x] Verify `super_admin` bypass in `subscription.ts:21` is intentional and documented (it is — but must be explicit for auditors)
- [x] Define which routes are gated by `requireActiveSubscription` and which are not; maintain an allowlist in the plan
- [x] Confirm that `staff_users` CRUD respects `requireStaffSeat` and that seat limits are checked at the database level as well (currently only application-level)
- [x] Implement staff role entitlements: e.g., a `sales` role should not be able to view billing or plan settings even if the subscription is active

### 2.5 Data & Privacy for Beta
- [x] Ensure trial businesses do not retain data beyond the retention period defined in the privacy policy
- [x] Provide a self-serve "Delete my account and data" endpoint (GDPR/Data Protection Act compliance)
- [x] Do not use production AI embeddings or conversation data for model training without explicit opt-in
- [x] Log consent for data processing at signup (timestamp, version of terms accepted)

### 2.6 Incident Response & Runbooks
- [x] Create runbook: "Trial expiry job fails to run" — steps to manually trigger and verify
- [x] Create runbook: "Stripe webhook not received" — steps to replay from Stripe dashboard and verify local state matches
- [x] Create runbook: "Billing outage (Stripe down)" — confirm `fail-open` behavior in middleware (`subscription.ts:47-58`), decide whether to pause trial expiry
- [x] Create runbook: "Mass trial expiry (capacity event)" — steps to extend trials manually, notify users, pause the expiry job
- [x] Create runbook: "Abuse detection" — steps to identify spike-usage businesses, freeze their trial, notify the team

---

## 3. Edge Cases & Failure Modes

### 3.1 Identified Gaps in Current Code
- [x] **`subscription.service.ts:188`** — `createTrial()`: no transaction wrapping; if `INSERT` succeeds but cache invalidation fails, the next `getActiveSubscription` returns stale null
- [x] **`subscription.service.ts:204`** — `createTrialSubscription()`: the 2-minute dedup window does not protect against the race condition where two requests arrive 3 seconds apart — both pass the dupe check and attempt INSERT, hitting the unique constraint from migration 056
- [x] **`subscription.service.ts:283`** — `expireDueTrials()`: uses raw string interpolation `($1||' days')::interval` — safe from SQL injection since `GRACE_PERIOD_DAYS` is a constant, but fragile if the constant is ever made dynamic
- [x] **`server.ts:32`** — `setInterval(runTrialExpiry, 60 * 60 * 1000)`: not persisted across restarts; if the server restarts at 11:58, trials expiring at 12:01 are missed until the next full hour after restart
- [x] **`subscription.service.ts:165`** — `isUsable('trialing')`: uses `new Date(trial_ends_at).getTime() > Date.now()` — this is wall-clock dependent and vulnerable to clock drift; use DB server time or a monotonic clock for production
- [x] **`stripe.service.ts:57`** — `createCheckoutSession()`: does not set `subscription_data.trial_period_days` — Stripe will bill immediately on checkout completion unless the local trial has been set to match
- [x] **`subscription.service.ts:316`** — `requireFeatureLimit`: returns early for `limit === undefined || isUnlimited(limit)` — unknown metrics silently pass; a new metric added to the plan but not in `KNOWN_LIMIT_METRICS` will not be enforced
- [x] **`subscription.service.ts:148`** — `SUB_COLS`: the inline `json_build_object` for the plan will break if `plans` table gains a column that conflicts with `json_build_object` key names

### 3.2 Concurrency & Race Conditions
- [x] Two simultaneous `createTrialSubscription` calls for the same business — verify the unique partial index prevents duplicate trials (migration 056 must be applied before beta)
- [x] Concurrent `incrementUsage` calls from n8n for the same metric — verify no lost updates
- [x] `cancelSub` + `changePlan` race — ensure the middleware reads the current subscription state consistently
- [x] Stripe webhook `invoice.paid` fires for the same invoice twice — verify the `ON CONFLICT (provider_payment_id) DO NOTHING` handles it

### 3.3 Data Integrity
- [x] Orphaned `usage_records` referencing a deleted subscription — add `ON DELETE CASCADE` or a cleanup job
- [x] `payments` records with `amount_paid = 0` from Stripe (e.g., $0 trial invoices) — should these be recorded as `succeeded` or skipped?
- [x] `subscriptions` rows with `status = 'past_due'` but no `grace_period_ends_at` — `isUsable` will treat them as expired; add a NOT NULL default

---

## 4. Testing & Validation

### 4.1 Unit Tests (existing, to extend)
- [x] Add tests for `expireDueTrials` idempotency (running twice produces same result)
- [x] Add tests for `requireFeatureLimit` with unknown metrics (should fail open, document this)
- [x] Add tests for `incrementUsage` concurrency (simulate 100 parallel calls, verify final count)
- [x] Add tests for `isUsable` with `trial_ends_at = NULL` (currently returns `true` for trialing with null trial_ends_at — intentional?)
- [x] Add tests for Stripe webhook idempotency (`invoice.paid` replay)
- [x] Add tests for `createTrialSubscription` race condition (two parallel requests)

### 4.2 Integration Tests
- [x] End-to-end signup → trial created → API gated → trial expires → grace period → blocked → converts → unblocked
- [x] End-to-end Stripe checkout → webhook → subscription active → billing portal → cancel → webhook → local canceled
- [x] End-to-end usage metering: send 500 AI replies → check usage record → send 1 more → verify 402 error
- [x] End-to-end staff seat enforcement: fill Starter plan seats → attempt to add 2nd staff → verify 402

### 4.3 Load & Performance Tests
- [x] Load test the trial expiry job with 100K expired trials (verify it completes in < 5 min)
- [x] Load test `incrementUsage` at peak throughput (simulate 1000 AI replies/min from n8n)
- [x] Verify Redis cache hit rate for `getActiveSubscription` and `getUsage` under normal load
- [x] Test `requireActiveSubscription` fail-open under database outage (should log warning and pass, not throw 500)

### 4.4 Security Tests
- [x] Penetration test: bypass subscription gating by manipulating JWT (tenantId injection, role escalation)
- [x] Penetration test: SQL injection via plan slug in `createCheckoutSession` and `changePlan`
- [x] Verify Stripe webhook signature is enforced (no bypass path)
- [x] Verify `ALLOWED_RETURN_HOSTS` is enforced in checkout and portal redirects
- [x] Verify super_admin bypass does not expose tenant data across tenants

---

## 5. Pre-Launch Checklist (Go/No-Go)

### 5.1 Stripe Configuration
- [ ] Stripe account created and `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` set in production env
- [ ] Stripe webhook endpoint registered and receiving test events
- [ ] Products and prices created in Stripe matching the three local plans (Starter/Professional/Business)
- [ ] `customer.subscription.updated/deleted` and `invoice.payment_failed/paid` webhook handlers tested in Stripe test mode

### 5.2 Infrastructure
- [ ] PostgreSQL 15 with `pgvector` extension deployed and accessible
- [ ] Redis deployed and accessible from backend
- [ ] WAHA instance deployed and reachable
- [ ] n8n instance deployed with webhook URL configured
- [ ] Vercel frontend deployed and `VITE_API_URL` points to production backend
- [ ] Backend health check endpoints responding 200

### 5.3 Data
- [ ] All migrations (`053`, `056`, `059`, `060`) applied to production DB
- [ ] Seed plans (`Starter`, `Professional`, `Business`) present and active
- [ ] `businesses.status` CHECK constraint includes `'trialing'`
- [ ] Index on `subscriptions(trial_ends_at)` and `subscriptions(business_id, status)` exists
- [ ] `beta_invites` table seeded with default promo code or configured via admin

### 5.4 Operational Readiness
- [ ] Alerting configured (trial expiry, payment failures, Stripe webhook errors)
- [ ] Runbooks documented and accessible to on-call
- [ ] Incident response channel (#beta-launch or equivalent) staffed for first 48 hours
- [ ] Rollback plan: Stripe `mode='subscription'` checkout can be disabled by removing the route; local trial creation can be disabled with a feature flag
- [ ] Capacity plan: database connections, Redis memory, n8n queue depth all sized for 200 concurrent beta tenants
