# WAFLO — Lifecycle & Operational Framework

> **Context:** WAFLO is a multi-tenant B2B SaaS WhatsApp Sales Assistant. The current codebase has functional self-service onboarding (`POST /api/public/signup`, `/setup` checklist) and operational infrastructure, but **no monetization layer** exists yet—no `plans`, `subscriptions`, `payments`, `invoices`, `trials`, or pricing enforcement tables.  
> This framework details how to build and operate those capabilities.

---

## 1. Subscription Management

### 1.1 Current State Assessment

| Layer | Status | Location |
|---|---|---|
| Public signup | Implemented | `backend/src/services/public.service.ts:82` |
| Setup checklist | Implemented | `frontend/src/pages/Setup.tsx` |
| Pricing UI | Marketing only (static) | `frontend/src/pages/LandingPage.tsx:150-181` |
| Plan definitions | None | — |
| Trial enforcement | None | — |
| Payment gateway | None | — |
| Usage metering | None (default `message_limit = 1000` seeded but unenforced) | `public.service.ts:40-48` |

### 1.2 Recommended Architecture

#### Database Schema

Add four new tables:

```sql
-- plans: catalog of available subscription tiers
CREATE TABLE plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(50) NOT NULL UNIQUE,
    price_monthly NUMERIC(10,2) NOT NULL,
    price_yearly NUMERIC(10,2),
    currency VARCHAR(3) NOT NULL DEFAULT 'JMD',
    features JSONB NOT NULL DEFAULT '{}',
    limits JSONB NOT NULL DEFAULT '{}',
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_public BOOLEAN NOT NULL DEFAULT TRUE,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- subscriptions: current plan binding per business
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES plans(id),
    status VARCHAR(20) NOT NULL DEFAULT 'trialing'
        CHECK (status IN ('trialing','active','past_due','canceled','expired','paused')),
    current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_period_end TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    trial_ends_at TIMESTAMPTZ,
    canceled_at TIMESTAMPTZ,
    grace_period_ends_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- usage_records: daily/monthly metering for AI responses, staff seats, locations
CREATE TABLE usage_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE CASCADE,
    metric VARCHAR(50) NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    limit_value INTEGER,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(business_id, metric, period_start)
);

-- payments: transaction ledger
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    amount NUMERIC(10,2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'JMD',
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','succeeded','failed','refunded','disputed')),
    provider VARCHAR(50) NOT NULL,
    provider_payment_id VARCHAR(255),
    provider_customer_id VARCHAR(255),
    method VARCHAR(50),
    failure_reason TEXT,
    metadata JSONB NOT NULL DEFAULT '{}',
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### Plan Design

Mirror the existing marketing tiers in `LandingPage.tsx` with enforceable limits:

| Plan | Monthly | AI Responses/Month | Staff Users | Locations | Trial |
|---|---|---|---|---|---|
| Starter | $79 | 500 | 1 | 1 | 14 days |
| Professional | $199 | 2,000 | 5 | 3 | 14 days |
| Business | $399 | Unlimited | Unlimited | Unlimited | 14 days |

**Feature matrix** stored as JSONB in `plans.features`:
```json
{
  "ai_responses": true,
  "pdf_quotes": true,
  "appointments": true,
  "lead_scoring": true,
  "knowledge_base": true,
  "handoffs": true,
  "multi_location": true,
  "api_access": false,
  "custom_branding": false,
  "sso": false
}
```

**Limit matrix** stored as JSONB in `plans.limits`:
```json
{
  "ai_responses": 500,
  "staff_users": 1,
  "locations": 1,
  "whatsapp_numbers": 1,
  "storage_mb": 500
}
```

#### Trial Lifecycle

**Free Trial Strategy (14 days, no credit card):**

1. **Trigger:** On `POST /api/public/signup`, assign the `starter` plan with `status = 'trialing'`, set `trial_ends_at = NOW() + 14 days`.
2. **Enforcement:** Add a `requireActiveSubscription()` middleware in `backend/src/middleware/auth.ts` that:
   - Checks `subscriptions.status` for the tenant.
   - Blocks access if `trialing` and past `trial_ends_at`.
   - Blocks access if `canceled`, `expired`, or `past_due` beyond grace period.
   - Allows full feature access during trial.
3. **Grace Period:** After trial expiry, allow 3 days of read-only access (`status = 'past_due'`) before suspending the tenant (`businesses.status = 'suspended'`).
4. **Conversion Nudges:** Frontend banners at 7 days, 3 days, and 1 day before expiry (`frontend/src/components/TrialBanner.tsx`).
5. **Churn Prevention:** At 48 hours before expiry, trigger an n8n workflow sending a WhatsApp reminder to the business owner with a Stripe Checkout link.

**Paid Activation:**

1. Integrate **Stripe Checkout** (frontend) + **Stripe Billing Portal** for plan changes.
2. Webhook handler at `POST /api/webhooks/stripe` to sync `payment_intent.succeeded` → `payments` record + flip `subscriptions.status = 'active'`.
3. Use Stripe Customer Portal for self-service plan upgrades/downgrades.

#### Usage Metering & Enforcement

1. Increment `usage_records` via background job or n8n workflow on every AI reply.
2. Add a `checkUsageLimit(metric)` guard in `backend/src/middleware/usage.ts`.
3. When limit is reached, return `402 Payment Required` with a checkout URL.
4. For unlimited plans, skip enforcement.

#### Cancellation & Dunning

- **Voluntary cancellation:** `status = 'canceled'`, access continues until `current_period_end`.
- **Payment failure:** `status = 'past_due'`, Stripe dunning email + in-app banner.
- **Hard cutoff:** After 3 failed attempts + grace period, suspend tenant and show a restore page.

---

## 2. B2B Onboarding

### 2.1 Current State

| Component | Status | Location |
|---|---|---|
| Public signup | Implemented | `backend/src/services/public.service.ts` |
| Setup checklist | Implemented | `frontend/src/pages/Setup.tsx` |
| WhatsApp pairing | Implemented | WAHA + n8n Workflow 01 |
| Staff invitation | Not implemented | — |
| Knowledge base seeding | Manual only | — |
| Contract/agreement signing | Not implemented | — |
| Account verification | Not implemented | — |

### 2.2 Recommended B2B Onboarding Workflow

This is a **5-phase workflow** for new business clients, combining the existing self-service flow with admin-assisted B2B steps.

#### Phase 1: Lead Capture & Qualification

| Step | Tool/System | Owner |
|---|---|---|
| Landing page form → CRM | `POST /api/public/signup` | Marketing / Self-service |
| Auto-assign to sales rep | n8n or manual | Sales |
| Qualification call | CRM + Calendar | Sales |
| Send proposal / SOW | Email / DocuSign | Sales |

**Implementation note:** Add a `leads` table and route `/api/public/leads` for unauthenticated demo requests. Qualify before granting access.

#### Phase 2: Account Provisioning

For **B2B clients**, bypass the public signup and use **admin-provisioned onboarding** (recommended per `.kilo/plans/1789640682349-business-onboarding.md`):

1. `super_admin` creates business in admin UI:
   ```json
   POST /api/businesses
   {
     "name": "Garco Construction",
     "slug": "garco",
     "whatsapp_phone": "+18761234567",
     "currency": "JMD",
     "timezone": "America/Jamaica"
   }
   ```
2. System auto-seeds:
   - Default settings (`ai_model`, `message_limit`, etc.) — already implemented in `public.service.ts:40-48`.
   - Default quick replies.
   - Empty knowledge base.
   - Assigned subscription plan (trial or paid).
3. `super_admin` creates owner staff user with `status = 'invited'`.
4. Generate a time-limited invitation token (7-day expiry) stored in `staff_users.metadata.invite_token`.
5. Send invitation via email/SMS (out-of-band until email provider is added).

**Frontend:** `frontend/src/pages/BusinessesPage.tsx` (admin) with invite modal.

#### Phase 3: Technical Setup

Deliver a **setup checklist** similar to `Setup.tsx`, but enhanced for B2B:

| Step | Action | Validation |
|---|---|---|
| 1. Accept invitation | Set password, log in | Token validation |
| 2. Connect WhatsApp | Scan QR / verify number | WAHA session active + phone match |
| 3. Upload knowledge base | 3-5 PDFs (products, pricing, services) | Document count ≥ 3 |
| 4. Configure AI prompt | Greeting, tone, handoff triggers | Non-empty prompt |
| 5. Set business hours | Define when AI operates | At least one day configured |
| 6. Invite team | Add managers, agents | Staff count > 1 |
| 7. Test end-to-end | Send/receive WhatsApp, verify AI reply | Message received + AI responded |

**Progress tracking:** Add `businesses.onboarding_progress JSONB` to store step completion status.

#### Phase 4: Account Verification

For B2B, verify the business is legitimate:

1. **Domain verification:** If `businesses.website` is provided, verify DNS TXT record (out-of-band).
2. **Phone verification:** Send a one-time code via WhatsApp to `businesses.whatsapp_phone` and require entry in the dashboard.
3. **Document upload:** Require business registration certificate (stored in `businesses.metadata` or a new `business_documents` table).
4. **Review queue:** `super_admin` approves verified businesses to unlock full feature access.

#### Phase 5: Training & Handoff

1. **Live training session** (30-45 min): Walk through inbox, quotes, appointments, handoffs.
2. **Video library:** Record 5-10 minute tutorials for each feature module.
3. **Sandbox environment:** Provide a `demo` business template with sample conversations for safe experimentation.
4. **Success metrics:** Track time-to-first-AI-reply, time-to-first-quote, and activation rate.

---

## 3. Pricing Strategy and Management

### 3.1 Current State

- **Static pricing only** in `frontend/src/pages/LandingPage.tsx:150-181`.
- **No dynamic pricing** or plan management UI.
- **No usage-based billing** or add-ons.
- **Default `message_limit = 1000`** is seeded in `public.service.ts:43` but not enforced.

### 3.2 Pricing Model Design

#### 3.2.1 Recommended Model: Hybrid Per-Seat + Usage

**Base subscription** covers platform access, per-user licensing, and core features.  
**Overage charges** apply for AI responses beyond plan limits.

| Component | Starter | Professional | Business |
|---|---|---|---|
| Base price | $79/mo | $199/mo | $399/mo |
| Included AI responses | 500 | 2,000 | Unlimited |
| Overage rate (per 1K responses) | $0.15 | $0.12 | N/A |
| Staff users | 1 | 5 | Unlimited |
| Locations | 1 | 3 | Unlimited |
| WhatsApp numbers | 1 | 1 | 3 |

#### 3.2.2 Add-On Products

| Add-On | Price | Use Case |
|---|---|---|
| Extra AI responses (1K) | $12/mo | Spikes on promotions |
| Additional location | $49/mo | Multi-site contractors |
| Dedicated support | $199/mo | Priority response SLA |
| Custom AI model | $299/mo | Fine-tuned for industry |
| White-label branding | $499/mo | Agency reseller |

**Implementation:** Store add-ons in `subscriptions.metadata` or a separate `subscription_addons` table.

### 3.3 Plan Management & Migration

#### Creating / Updating Plans

**Admin UI** (`super_admin` only):

- **CRUD** for plans at `/admin/plans`.
- **Version plans** rather than edit in place (append-only `plans` table with `is_active` flag). This preserves historical billing accuracy.
- **Migration path:** When a plan is updated, existing subscribers stay on their current plan until renewal or manual migration.

**Price Changes:**

1. **Increase:** Existing subscribers are grandfathered for the remainder of their term. At renewal, they receive a 30-day notification of the new price with an option to downgrade or cancel.
2. **Decrease:** Apply immediately to active subscribers.
3. **Sunsetting a plan:** Mark `is_active = false`, stop selling, migrate existing subscribers to the closest replacement plan with a notification.

#### Price Elasticity Analysis

Track these metrics to model elasticity:

```sql
-- Conversion rate by plan
SELECT 
    p.name,
    COUNT(s.id) as subscribers,
    AVG(EXTRACT(EPOCH FROM (s.created_at - b.created_at)))/86400 as avg_days_to_convert
FROM subscriptions s
JOIN plans p ON p.id = s.plan_id
JOIN businesses b ON b.id = s.business_id
WHERE s.status IN ('trialing','active')
GROUP BY p.name;

-- Upgrade/downgrade frequency
SELECT 
    from_plan.name as from_plan,
    to_plan.name as to_plan,
    COUNT(*) as transitions
FROM subscription_history sh
JOIN plans from_plan ON from_plan.id = sh.from_plan_id
JOIN plans to_plan ON to_plan.id = sh.to_plan_id
WHERE sh.created_at > now() - interval '90 days'
GROUP BY from_plan.name, to_plan.name;

-- Churn by price point
SELECT 
    p.price_monthly,
    COUNT(s.id) as churned_count,
    AVG(EXTRACT(EPOCH FROM (s.updated_at - s.created_at)))/86400 as avg_lifetime_days
FROM subscriptions s
JOIN plans p ON p.id = s.plan_id
WHERE s.status = 'canceled'
  AND s.updated_at > now() - interval '90 days'
GROUP BY p.price_monthly;
```

**Tools:** Export to CSV, analyze in Python/R or a BI tool (Metabase, Looker).

---

## 4. Operational Oversight

### 4.1 Key Performance Indicators (KPIs)

#### Financial KPIs

| KPI | Definition | Target | Query Location |
|---|---|---|---|
| **MRR** | Sum of active subscription monthly values | Growing 5% MoM | `subscriptions` + `plans` |
| **ARR** | MRR × 12 | — | Derived from MRR |
| **ARPU** | MRR / active business count | $150+ | Derived |
| **Trial-to-paid conversion** | Paid activations / trials started | >25% | `subscriptions` |
| **Trial-to-paid time** | Days from signup to first payment | <10 days | `subscriptions.created_at` → `payments.paid_at` |
| **Churn rate** | Canceled subscriptions / total active | <3% MoM | `subscriptions` |
| **LTV** | ARPU × avg lifetime (months) | >$800 | Derived |
| **CAC** | Sales + marketing spend / new customers | <LTV/3 | External data |
| **Net Revenue Retention** | (MRR at end + churn - downgrades) / MRR at start | >110% | Derived |
| **Failed payment rate** | Failed payments / total attempts | <2% | `payments` |

#### Product/Engagement KPIs

| KPI | Definition | Target | Data Source |
|---|---|---|---|
| **Activation rate** | Businesses completing setup checklist / signups | >70% | `businesses` + checklist flag |
| **Time-to-first-AI-reply** | Hours from signup to first inbound message | <24h | `messages` |
| **DAU/MAU** | Distinct businesses using app daily / monthly | >40% | `audit_logs` |
| **Feature adoption** | % using quotes, appointments, knowledge base | >60% | Feature-specific tables |
| **AI accuracy** | Handoff rate / total AI messages | <15% | `handoffs` / `messages` |
| **Support ticket rate** | Tickets / active business | <0.5/mo | External support tool |

#### Billing/Operational KPIs

| KPI | Definition | Alert Threshold |
|---|---|---|
| **Payment failure rate** | Failed `payments` / total | >5% warning, >10% critical |
| **d-0 revenue** | Expected MRR - actual collected | >5% variance |
| **Trial expiry pipeline** | Trials expiring in next 7 days | Always visible |
| **Suspended tenants** | `businesses.status = 'suspended'` | >5% of total |
| **Support ticket SLA** | Avg response time | >2h warning, >8h critical |

### 4.2 Administrative Tools & Dashboards

#### Super Admin Dashboard

Build at `frontend/src/pages/AdminDashboard.tsx` (`super_admin` only):

| Panel | Data Source | Refresh |
|---|---|---|
| **Revenue summary** | MRR, ARR, ARPU, NRR | Daily |
| **Trial funnel** | Signups → activated → trial → paid | Real-time |
| **Plan distribution** | Subscribers per plan tier | Daily |
| **Churn list** | Recently canceled with reason | Real-time |
| **Payment health** | Failed payments, dunning queue | Hourly |
| **Usage alerts** | Businesses near/over limits | Real-time |
| **Support queue** | Pending handoffs, high-priority tickets | Real-time |

#### Operational Runbooks

Add to `docs/runbook.md`:

1. **Trial expiry blitz:** Export list of trials expiring in 48h; send reminder emails/SMS; flag for sales outreach.
2. **Payment failure recovery:** Run daily script to retry failed payments via Stripe; send dunning emails; suspend after 3 failures.
3. **Abuse prevention:** Rate-limit `POST /api/public/signup` (e.g., 5 per IP per hour via `express-rate-limit`); flag disposable emails.
4. **Plan migration:** Document process for grandfathering vs. immediate migration.
5. **Refund processing:** Admin UI to issue refunds via Stripe with audit log entry.

#### Monitoring Extensions

Extend `docs/monitoring.md` with billing-specific queries:

```sql
-- Trial expiry countdown
SELECT 
    b.name,
    s.trial_ends_at,
    EXTRACT(EPOCH FROM (s.trial_ends_at - NOW()))/3600 as hours_remaining
FROM subscriptions s
JOIN businesses b ON b.id = s.business_id
WHERE s.status = 'trialing'
  AND s.trial_ends_at < NOW() + interval '7 days'
ORDER BY s.trial_ends_at ASC;

-- Usage overrun risk
SELECT 
    b.name,
    u.metric,
    u.used,
    u.limit_value,
    ROUND((u.used::numeric / NULLIF(u.limit_value, 0)) * 100, 1) as pct_used
FROM usage_records u
JOIN businesses b ON b.id = u.business_id
WHERE u.period_start = date_trunc('month', CURRENT_DATE)
  AND u.limit_value IS NOT NULL
  AND u.used >= u.limit_value * 0.8
ORDER BY pct_used DESC;
```

#### Alerting

Add to the existing Prometheus/Grafana stack (or equivalent):

| Alert | Condition | Severity |
|---|---|---|
| Trial expiry spike | >10 trials expiring in 24h | Info |
| Payment failures >5% | Daily failed/total >5% | Warning |
| Revenue anomaly | Daily revenue <80% of 7-day avg | Critical |
| High trial-to-paid time | Avg days >14 | Warning |
| Plan capacity | Any plan >90% of historical avg signups | Info |

---

## 5. Implementation Roadmap

### Phase 1: Foundation (Weeks 1-3)

1. Add database migrations for `plans`, `subscriptions`, `payments`, `usage_records`.
2. Seed default plans matching `LandingPage.tsx` pricing.
3. Build `subscription.service.ts` with plan assignment, trial logic, and status checks.
4. Add `requireActiveSubscription()` middleware.
5. Build super admin plan management UI.

### Phase 2: Payment Integration (Weeks 4-6)

1. Integrate Stripe Checkout + Customer Portal.
2. Build webhook handler `POST /api/webhooks/stripe`.
3. Implement usage metering middleware.
4. Add trial countdown banners in frontend.

### Phase 3: B2B Onboarding (Weeks 7-9)

1. Fix `business.service.ts` (remove invalid `business_id` references).
2. Build staff invitation flow with token generation.
3. Enhance setup checklist with verification steps.
4. Add sandbox/demo environment.

### Phase 4: Analytics & Optimization (Weeks 10-12)

1. Build admin dashboard panels for financial KPIs.
2. Implement Stripe Sigma or Metabase for revenue analytics.
3. Set up dunning automation via n8n.
4. Run first pricing elasticity analysis.

---

## 6. Risk Register

| Risk | Impact | Mitigation |
|---|---|---|
| **No payment provider configured** | High | Start with Stripe Test mode; switch to Live by changing API keys. |
| **Trial abuse (fake signups)** | Medium | Rate-limit signups, require phone verification, block disposable emails. |
| **Grandfathering complexity** | Medium | Use append-only plan versions; never edit existing plan rows. |
| **Usage meter performance** | Medium | Batch meter inserts; aggregate in n8n or a background job, not on the hot path. |
| **Stripe webhook replay attacks** | High | Verify webhook signatures; use idempotency keys on payment inserts. |
| **Price change backlash** | Medium | 30-day advance notice; grandfather existing subscribers for at least one term. |

---

*Framework prepared for WAFLO (WhatsApp Sales Assistant).*  
*Next action: Validate schema migrations against existing `businesses.status` enum (`active`, `inactive`, `suspended`, `pending`) and ensure `trialing` is added to the constraint.*
