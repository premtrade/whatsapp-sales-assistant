# Public Beta / Free-Trial Launch — Technical & Operational Checklist

**Project:** WAFLO — WhatsApp Sales Assistant (Garco MVP)
**Date:** 2026-10-07
**Scope:** Requirements to safely launch a public beta or 14-day free-trial program on top of the current codebase.

---

## Part 0 — Current-State Analysis (Basis for this Checklist)

### 0.1 Subscription models — what exists today
| Artifact | Location | Status |
|---|---|---|
| Pricing tiers (`Starter` $79/mo · 500 AI responses · 1 user · 1 location; `Professional` $199/mo · 2,000 responses · 5 users · 3 locations; `Business` $399/mo · unlimited · "Contact Sales") | `frontend/src/pages/LandingPage.tsx` → `pricingTiers[]` | **Marketing copy only.** Hardcoded in the React page; no corresponding backend model. |
| "Start Free Trial" CTAs and "14-day free trial. No credit card required." | `LandingPage.tsx` lines ~158–257, 634 | **Dead links/buttons.** No signup/trial route exists anywhere in the app. |
| Self-serve signup / registration endpoint | `backend/src/routes/auth.routes.ts` | **Missing.** Only `POST /login` exists (with `authRateLimiter`). No `/register`, no invitation flow, no onboarding API. |
| Subscription / plan / entitlement tables | `database/schema/*`, `database/migrations/022–048` | **Missing.** No `subscriptions`, `plans`, `entitlements`, `usage_counters`, or `trials` table. `grep -ri "subscri|billing|entitle|plan_id|trial"` over the DB returns nothing. |
| Tenant model | Migration `045_multi_tenancy.sql` + `046_enforce_tenant_isolation.sql` | ✅ Exists: `businesses` table with `status CHECK ('active','inactive','suspended')`, `metadata JSONB`, `slug`, `whatsapp_phone`, `waha_session_name`; `business_id` NOT NULL FK on contacts/conversations/products/knowledge/quotes/appointments/handoffs/settings/staff_users. This is the natural anchor for plans/trials. |
| Feature flags / quota enforcement | `backend/src/**` | **Missing.** No flag system; `settings` KV table has no feature-flag convention; dashboard queries (`dashboard.service.ts`) are global aggregates without `business_id` filters — usage metering does not exist yet. |

### 0.2 Billing configuration — what exists today
- **No payment provider integration at all**: no Stripe/Paddle/Lobsters keys in `.env.example`, no webhook handlers, no invoices, no customer records. The only "payment" hits in the repo are Garco *end-customer* FAQ content (`037_construction_faq.sql`), which is unrelated to SaaS billing.
- **No email/notification service**: `.env.example` has no SMTP/SendGrid/Mailgun config; the platform cannot currently send trial-start, expiry-warning, or welcome emails.
- **No scheduled-job infrastructure**: no `node-cron`/queue workers in `backend/src` (only one `setInterval` heartbeat in `websocketServer.ts`). Trial-expiry sweeps and dunning retries have nowhere to run.
- Rate limiting is per-process IP-based (`middleware/rateLimiter.ts`: 100 req/15 min API, 10 req/15 min auth) — not per-tenant, and Redis is available but unused for distributed limits.

### 0.3 Plan structure — what exists today
- Three tiers defined purely as front-end constants (see 0.1). Limits promised by the landing page (AI-response caps, staff-user seats, location counts) have **no server-side representation**.
- Auth payload (`UserPayload` in `backend/src/types/index.ts`, decoded in `middleware/auth.ts`) carries `id/email/role/employeeNumber/name` — it does **not** carry `business_id`/`plan`, so entitlement checks cannot even be performed inside request handlers today.
- WAHA session binding per tenant (`uq_businesses_waha_session`, `047_configure_waha_sessions.sql`, `048_whatsapp_settings.sql`) is the main per-tenant resource that must be provisioned/deprovisioned during trial lifecycle.

**Conclusion:** the product is architecturally multi-tenant-ready but has *zero* subscription/billing/trial machinery. The checklist below therefore starts from greenfield implementation on top of the existing `businesses` anchor.

---

## Part 1 — Technical Infrastructure Requirements

### 1.1 Database schema updates
- [ ] **Migration `049_plans.sql`** — `plans` table: `id`, `code` (`starter|professional|business|beta_trial`), `name`, `price_cents`, `currency`, `billing_interval` (`month|year`), `max_ai_responses`, `max_staff_users`, `max_locations`, `trial_days` (default 14), `features JSONB`, `is_active`. Seed the three landing-page tiers + a hidden `beta_trial` plan so marketing copy and enforcement share one source of truth.
- [ ] **Migration `050_subscriptions.sql`** — `subscriptions` table anchored to `businesses(id)` (FK, `ON DELETE CASCADE`, consistent with 045): `plan_id`, `status` CHECK `('trialing','active','past_due','canceled','expired','grace_period')`, `trial_start_at`, `trial_ends_at` (generated: `trial_start_at + plan.trial_days`), `current_period_start/end`, `cancel_at_period_end`, `provider`/`provider_customer_id`/`provider_subscription_id` (nullable until billing vendor chosen), `converted_at`. Partial indexes on `status` and `trial_ends_at WHERE status='trialing'` for the expiry sweep.
- [ ] **Migration `051_usage_counters.sql`** — `usage_counters` (`business_id`, `period_start`, `metric` e.g. `ai_responses`, `quantity`) with unique `(business_id, period_start, metric)`; increment path used by the AI-reply pipeline so "500 AI responses" becomes enforceable.
- [ ] **Feature-flag storage** — either rows in `settings` under a reserved namespace (e.g. `flag.beta_public_signup`) with `data_type='boolean'`, or a dedicated `feature_flags` table + `business_feature_overrides`. Keep in sync with `docs/AUDIT_AND_FIXES.md` conventions for tenant-scoped settings introduced in 045/048.
- [ ] Backfill policy: every existing `businesses` row (incl. seeded Garco tenant) gets an explicit `subscriptions` row (`status='active'`, internal/unlimited plan) via migration script — never rely on absence-of-row meaning "unlimited".
- [ ] Re-run `046`-style guardrails: any new tenant-owned table added for billing must get `business_id NOT NULL` + FK in the same migration.

### 1.2 Entitlement & plan-enforcement logic (backend)
- [ ] **JWT claims extension**: add `businessId` (and optionally `planCode`) to `UserPayload` and to token issuance in `auth.service.ts`; update `authenticate` middleware to hydrate `req.user.businessId`. Without this, per-tenant gating cannot happen in-request.
- [ ] New `entitlement.service.ts` + `subscription.service.ts` exposing `getEntitlement(businessId)`, `assertWithinQuota(businessId, metric)`, `canAddStaffUser(businessId)`, `canAddLocation(businessId)`; cache results in Redis with short TTL (utils/cache.ts already exists).
- [ ] **Middleware `requireActiveSubscription`**: reject requests with HTTP 402/403 + machine-readable codes (`TRIAL_EXPIRED`, `QUOTA_EXCEEDED`, `SUBSCRIPTION_SUSPENDED`) when `businesses.status != 'active'` or subscription state forbids access; wire into all tenant-scoped routers (`conversation`, `quote`, `knowledge`, `staff`, `whatsappConfig`, …).
- [ ] Enforce the three advertised limits concretely: AI-response cap (metered counter checked before invoking the AI workflow path), staff-seat cap (in `staff.service.ts` create), location/WAHA-session cap (in `whatsappConfig.service.ts` connect).
- [ ] Grace behavior spec: define hard-stop vs. soft-lock (read-only UI) at expiry — recommend read-only grace period (e.g. 7 days) rather than instant data lockout for a beta.
- [ ] Unit + integration tests under `tests/unit`, `tests/integration` covering: trial day math, quota boundary (N vs N+1 responses), suspended tenant rejection, cross-tenant isolation of counters.

### 1.3 Feature flagging & beta gating
- [ ] Implement a minimal flags module (read from `settings`/`feature_flags`, cached, admin-overridable per business) — no external vendor needed at this scale.
- [ ] Required launch flags: `beta.public_signup` (kill-switch for open registration), `beta.waitlist_only`, `trial.enabled`, `trial.require_card` (must default **false** to honor "No credit card required"), `billing.provider_enabled`, plus per-feature flags for anything risky exposed to beta tenants.
- [ ] Tenant allowlist/blocklist mechanism (beta cohort membership queryable for support ops).
- [ ] Front-end flag consumption: expose `GET /api/features` (or embed in login response) so `LandingPage.tsx` CTAs and the app shell can hide/disable trial flows when the flag is off — currently CTAs are unconditional.

### 1.4 Signup & provisioning flow (new API surface)
- [ ] `POST /auth/register` (business owner): creates `businesses` row (unique slug validation, `whatsapp_phone` uniqueness), first `staff_users` admin, `subscriptions` row `status='trialing'` with `trial_ends_at = NOW()+interval '14 days'`, welcome email trigger. Add `authRateLimiter` reuse + CAPTCHA/abuse gate for open beta.
- [ ] Idempotent tenant provisioning job: WAHA session creation per business (respect `uq_businesses_waha_session`), embedding/knowledge-bootstrap defaults, per-tenant settings seed (timezone/currency defaults already column-level in 045).
- [ ] Onboarding wizard endpoints/status field (`onboarded_at` or metadata JSONB) so trial clock and activation are auditable.

### 1.5 Metering & observability
- [ ] Instrument the AI-reply path (WAHA webhook → n8n workflow → assistant reply) to increment `usage_counters` exactly once per AI response (dedupe on message wamid like `025_messages_unique_wamid.sql` pattern).
- [ ] Fix global-aggregate leakage: `dashboard.service.ts` currently issues unscoped `SELECT ... FROM conversations` etc.; scope every metric by `business_id` before multi-tenant beta users see dashboards (also verify `trends`, `handoffsByReason`, `leadPipeline`).
- [ ] Usage-exposure telemetry: alert at 80%/100% of plan quota; structured logs (`utils/logger.ts`) with `businessId` on every entitlement denial for churn analysis.
- [ ] Metrics per `docs/monitoring.md` & `docs/health-check.md`: trials started/converted/expired, 402/403 rates, provisioning failures, AI cost per tenant (OpenAI/Groq tokens — key budgets must become per-tenant-aware before open signup).

### 1.6 Billing-system groundwork (even if beta launches card-free)
- [ ] Provider decision + SDK integration (Stripe recommended): `customers`, `products/prices` mirrored into `plans` seeds; store only `provider_*` IDs locally.
- [ ] `POST /webhooks/billing` with signature verification, replay protection, idempotency key table; handle `invoice.paid`, `invoice.payment_failed`, `subscription.deleted`, `checkout.session.completed` → drive `subscriptions.status` transitions.
- [ ] Checkout/upgrade flow ("Start Free Trial" → card-at-trial-end or post-trial upsell page); dunning schedule (retry windows map onto `past_due` → `grace_period` → `canceled`).
- [ ] Secrets: add `STRIPE_*`, SMTP, and scheduler env vars to `.env.example` and docker-compose; rotate the placeholder values (`change_me_*`) before public exposure.
- [ ] Tax/invoice compliance placeholders (JMD/US VAT handling) and a finance export view of `subscriptions`.

### 1.7 Security, abuse & isolation hardening for public exposure
- [ ] Verify RLS or repository-layer scoping everywhere (046 enforced NOT NULL but application queries must filter; audit each service like the dashboard fix above).
- [ ] Replace IP-based rate limits with Redis-backed per-tenant + per-IP limits; add per-tenant AI-message ceilings to protect WAHA numbers from spam bans and LLM budgets from runaway loops (`followUp`, `Abandoned Conversation Recovery` workflows can auto-send — gate them by plan).
- [ ] JWT secret rotation, `expiresIn` review (`BACKEND_JWT_EXPIRES_IN=1d`), refresh strategy for long-lived dashboard sessions.
- [ ] Data-deletion/export path for canceled trials (GDPR-style; `deleted_at` column already exists on `businesses` — implement cascade purge job honoring ON DELETE CASCADE semantics).
- [ ] Pen-test pass on new public endpoints using `tests/security` suite; CORS origins lockdown (`CORS_ORIGINS` currently localhost-only — must add production domains).

### 1.8 Deployment & environment readiness
- [ ] Confirm CI gates (`​.github/workflows/ci.yml`, `tests.yml`) run the new billing/entitlement tests; migrations applied via `scripts/apply-migrations.ps1` pipeline with rollback notes per new file.
- [ ] Staging environment with realistic multi-tenant seed data (second fake business besides Garco) to smoke-test isolation before beta.
- [ ] Backup/restore rehearsal (`scripts/backup.ps1`, `restore.ps1`, `BACKUP_RETENTION_DAYS=7`) including new billing tables.
- [ ] Traefik HTTPS + domain for the public landing/signup pages (`TRAEFIK_ENABLED=false` today; ACME email placeholder must be replaced).

---

## Part 2 — Operational Workflow Requirements

### 2.1 Trial lifecycle management
- [ ] Define canonical trial policy: 14 days, no card (matching landing-page promise), one trial per business/phone/email; document what happens on Day 0/7/12/14/15/+21.
- [ ] Expiry job (cron/scheduler — must stand up job infra since none exists): daily sweep of `subscriptions WHERE status='trialing' AND trial_ends_at < NOW()` → transition to `grace_period`/`expired`, suspend WAHA sessions, notify.
- [ ] Reminder cadence: T-3 days expiry warning, day-of expiry, post-expiry conversion nudge; templates owned by marketing, sent via new email service.
- [ ] Trial-extension & override SOP: who can extend (support role), recorded where (`audit_logs` — immutable per 028), max extension length.
- [ ] Conversion tracking: define trial→paid conversion event (`converted_at`), target %, weekly funnel report (signup → onboarded → activated → converted).

### 2.2 Billing-cycle management
- [ ] Calendar of cycles: monthly anchor dates, proration rules for mid-cycle upgrades (Starter→Professional), downgrades effective next cycle.
- [ ] Dunning playbook: failed-payment retry schedule (e.g., day 1/3/5/7), suspension threshold, reinstatement procedure, WAHA reconnection after payment.
- [ ] Cancellation workflow: self-serve cancel (`cancel_at_period_end`) + retention offer step; data-retention window post-cancel (e.g., 30-day hold, then purge job).
- [ ] Business-tier "Contact Sales": manual quote→invoice→provision process documented in `docs/runbook.md` style, including how offline contracts flip `subscriptions.status='active'`.
- [ ] Finance reconciliation: month-end export of active subscriptions vs. provider dashboard; refund authority matrix.

### 2.3 User access controls & tenant administration
- [ ] Role model review: enumerate `staff_users` roles and seat limits per plan (1/5/unlimited) — enforce in staff-invite flow; define the super-admin/"platform ops" role distinct from tenant roles.
- [ ] Internal/ops access policy: staff access to beta tenant data requires impersonation logging in `audit_logs` (immutable table already exists).
- [ ] Offboarding checklist: suspend tenant (`businesses.status='suspended'`), revoke JWTs/session invalidation, disconnect WAHA session, archive knowledge docs.
- [ ] Beta-cohort access gating ops: waitlist approval queue, invite emails, referral exceptions (ties to `beta.waitlist_only` flag).

### 2.4 Support & incident operations
- [ ] Beta intake: in-app feedback widget or shared channel; triage SLA (e.g., P1 response 4h); known-issues page linked from the app shell.
- [ ] Runbook additions (`docs/runbook.md`): trial-sweep failure recovery, webhook-replay repair for missed billing events, quota miscount correction procedure, per-tenant kill-switch operation.
- [ ] Escalation ladder & on-call rotation for the beta window; comms templates for outage affecting paying vs. trial tenants differently.
- [ ] Abuse/fraud review loop: daily check of new signups (disposable email patterns, multiple trials per phone), takedown criteria for WAHA-policy-violating tenants.

### 2.5 Launch-readiness process (go/no-go)
- [ ] Pre-launch checklist execution: security audit items from `docs/security.md` closed; `docs/AUDIT_AND_FIXES.md` regression suite green.
- [ ] Legal/compliance: ToS + Privacy Policy + trial terms pages linked from signup (currently absent from LandingPage footer flow); acceptable-use policy for messaging automation (WhatsApp BSP/TOS risk).
- [ ] Marketing/product alignment: landing-page tier copy regenerated from `plans` seed (single source of truth); pricing-change process defined so frontend constants can't drift from enforcement again.
- [ ] Soft-launch stages: internal dogfood (Garco tenant) → invited beta (≤10 tenants) → limited public (flags on, capacity watch) → GA with billing live. Exit criteria per stage: crash-free rate, quota accuracy, support load, conversion signal.
- [ ] Rollback plan: `beta.public_signup=false` instantly closes registration; DB migrations reversible or additive-only guarantee documented.

---

## Appendix A — Gap Summary (Current State → Required State)

| Capability | Now | Needed for beta/trial |
|---|---|---|
| Plans as data | Frontend constants only | `plans` table seeded from same values |
| Subscriptions/trials | Does not exist | `subscriptions` table + lifecycle states |
| Signup/provisioning | Login-only auth | `/auth/register` + tenant bootstrap |
| Quota metering | None | `usage_counters` + AI-path instrumentation |
| Entitlement enforcement | None | services + middleware + JWT `businessId` |
| Feature flags | None | settings-backed flags + kill switches |
| Payments | None | provider integration + webhooks (post-beta OK) |
| Scheduled jobs | None | cron/worker for expiry sweep & reminders |
| Email notifications | None | SMTP service + templates |
| Per-tenant rate limiting | IP-only | Redis per-tenant limits |
| Tenant-scoped analytics | Global queries | scoped dashboard queries |
| Trial ops playbooks | None | §2.1–2.5 documents + owners |
