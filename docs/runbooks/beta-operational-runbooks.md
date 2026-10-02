# Operational Runbooks — Public Beta

## 1. Trial Expiry Job Fails to Run

**Symptoms**
- `expireDueTrials` is not expiring trials that have passed their `trial_ends_at`.
- Owner dashboard shows trials that should be expired.

**Diagnosis**
1. Check backend logs for `Trial expiry job failed` errors.
2. Verify the server is running: `curl http://localhost:3000/health`.
3. Check the `subscriptions` table for rows with `status = 'trialing'` and `trial_ends_at <= NOW()`.

**Remediation**
1. Restart the backend server — the expiry job runs on startup (`server.ts:20-31`).
2. If restart is not possible, trigger the job manually via a temporary admin endpoint or by connecting to the DB:
   ```sql
   SELECT expireDueTrials();  -- If exposed as a DB function
   -- Or run the equivalent SQL directly:
   UPDATE subscriptions
   SET status = 'expired',
       grace_period_ends_at = NOW() + INTERVAL '3 days',
       updated_at = NOW()
   WHERE status = 'trialing'
     AND trial_ends_at IS NOT NULL
     AND trial_ends_at <= NOW()
   RETURNING id;
   ```
3. Verify affected tenants show `status = 'expired'` and `grace_period_ends_at` is set.

---

## 2. Stripe Webhook Not Received

**Symptoms**
- A customer completes Stripe Checkout but their local subscription remains `trialing`.
- Payment failures are not reflected in local subscription status.

**Diagnosis**
1. Check Stripe Dashboard → Developers → Webhooks → endpoint health.
2. Verify the webhook endpoint URL in Stripe matches the deployed backend URL.
3. Check backend logs for `Received Stripe webhook` entries.
4. Verify `STRIPE_WEBHOOK_SECRET` is set in the production environment.

**Remediation**
1. Replay the failed event from the Stripe Dashboard.
2. If the webhook endpoint is unreachable, check:
   - Firewall / security group rules
   - Reverse proxy configuration (nginx, Vercel rewrites)
   - SSL certificate validity
3. After replaying, verify local state matches Stripe:
   ```sql
   SELECT s.id, s.status, s.external_subscription_id, s.external_customer_id
   FROM subscriptions s
   JOIN plans p ON p.id = s.plan_id
   WHERE s.external_customer_id IS NOT NULL;
   ```

---

## 3. Billing Outage (Stripe Down)

**Symptoms**
- `createCheckoutSession` returns 500 or times out.
- Stripe Dashboard shows degraded performance.

**Current Behavior**
- The `requireActiveSubscription` middleware **fails open** on infrastructure errors (`subscription.ts:47-58`).
- Tenants with active trials or paid subscriptions will retain API access during the outage.
- Trial expiry will continue to run (it does not depend on Stripe).

**Decision Required**
- If Stripe is down for an extended period (> 24h), decide whether to:
  1. Pause `expireDueTrials` to avoid blocking tenants whose trial expires during the outage.
  2. Extend all active trials by the outage duration via a manual DB update.

**Remediation**
1. Monitor Stripe status at https://status.stripe.com.
2. If pausing trial expiry:
   ```sql
   UPDATE subscriptions
   SET trial_ends_at = trial_ends_at + INTERVAL '1 day'
   WHERE status = 'trialing' AND trial_ends_at <= NOW() + INTERVAL '1 day';
   ```
3. Once Stripe is restored, verify webhook delivery catches up.

---

## 4. Mass Trial Expiry (Capacity Event)

**Symptoms**
- A large number of trials (e.g., 500+) expire at the same time.
- Owner dashboard shows a spike in expired subscriptions.

**Remediation**
1. **Assess impact**: count affected tenants.
   ```sql
   SELECT COUNT(*) FROM subscriptions WHERE status = 'expired' AND created_at >= NOW() - INTERVAL '1 day';
   ```
2. **Notify users**: send an email to all affected business owners offering a trial extension.
3. **Extend trials manually** (if needed):
   ```sql
   UPDATE subscriptions
   SET status = 'trialing',
       trial_ends_at = NOW() + INTERVAL '7 days',
       grace_period_ends_at = NULL,
       updated_at = NOW()
   WHERE status = 'expired'
     AND grace_period_ends_at > NOW()  -- Only extend those still in grace period
   RETURNING id, business_id;
   ```
4. **Pause the expiry job** if the volume is too high for the DB to handle:
   - Comment out the `setInterval` in `server.ts` temporarily, or
   - Set a flag in `settings` that `expireDueTrials` checks before running.

---

## 5. Abuse Detection

**Symptoms**
- A single tenant is generating an unusually high volume of AI responses.
- Usage spikes beyond 150% of plan limit within a short period.

**Diagnosis**
1. Query usage records:
   ```sql
   SELECT business_id, metric, used, limit_value, period_start, period_end
   FROM usage_records
   WHERE metric = 'ai_responses'
     AND period_start = DATE_TRUNC('month', NOW())
   ORDER BY used DESC
   LIMIT 20;
   ```
2. Cross-reference with `subscriptions` to identify the plan.

**Remediation**
1. **Freeze the trial**: set the subscription to `expired` or `canceled`.
   ```sql
   UPDATE subscriptions
   SET status = 'expired',
       grace_period_ends_at = NOW() + INTERVAL '3 days',
       metadata = metadata || '{"frozen_by": "ops", "reason": "abuse"}'::jsonb,
       updated_at = NOW()
   WHERE business_id = 'tenant-id' AND status IN ('trialing', 'active')
   RETURNING id;
   ```
2. **Notify the team**: post in #beta-launch with the tenant ID and evidence.
3. **Review and decide**: if legitimate usage, restore access and consider upgrading the plan. If abuse, keep blocked.

---

## 6. Stripe Webhook Replay / Drift Correction

**Symptoms**
- Local subscription status does not match Stripe Dashboard.
- E.g., Stripe shows `canceled` but local shows `active`.

**Diagnosis**
1. Compare Stripe subscription status with local:
   ```sql
   SELECT s.id, s.status AS local_status, s.external_subscription_id,
          s.metadata->>'stripeStatus' AS stripe_status
   FROM subscriptions s
   WHERE s.external_customer_id IS NOT NULL;
   ```
2. Check Stripe Dashboard for the customer's subscription history.

**Remediation**
1. Trigger a manual sync from Stripe by replaying the latest `customer.subscription.updated` event.
2. If replay is not possible, update local state directly:
   ```sql
   UPDATE subscriptions
   SET status = 'canceled',
       canceled_at = NOW(),
       metadata = metadata || '{"drift_corrected": true, "corrected_at": "' || NOW() || '"}'::jsonb,
       updated_at = NOW()
   WHERE external_subscription_id = 'sub_xxx' AND status != 'canceled';
   ```
3. Verify the tenant's API access reflects the corrected status.

---

## 7. Plan Change Audit

**Symptoms**
- A tenant reports they were moved to a different plan without their knowledge.
- MRR does not match expected revenue.

**Diagnosis**
1. Query `plan_changes`:
   ```sql
   SELECT pc.*, p.name AS to_plan_name, p2.name AS from_plan_name
   FROM plan_changes pc
   JOIN plans p ON p.id = pc.to_plan_id
   LEFT JOIN plans p2 ON p2.id = pc.from_plan_id
   WHERE pc.subscription_id = 'sub-id'
   ORDER BY pc.created_at DESC;
   ```
2. Check `subscriptions.metadata` for `plan_change` entries.

**Remediation**
1. If the change was unauthorized, revert it:
   ```sql
   UPDATE subscriptions
   SET plan_id = (SELECT from_plan_id FROM plan_changes WHERE subscription_id = 'sub-id' ORDER BY created_at DESC LIMIT 1),
       metadata = metadata || '{"reverted": true, "reverted_at": "' || NOW() || '"}'::jsonb,
       updated_at = NOW()
   WHERE id = 'sub-id';
   ```
2. Review access controls: only `super_admin` should be able to change plans via the admin API.

---

## 8. Database Connection Exhaustion

**Symptoms**
- Backend logs show `too many connections for role "..."` or `connection pool exhausted`.
- API returns 500 for all tenant routes.

**Diagnosis**
1. Check active connections:
   ```sql
   SELECT count(*) FROM pg_stat_activity WHERE datname = 'whatsapp_sales';
   ```
2. Check for long-running queries:
   ```sql
   SELECT pid, now() - pg_stat_activity.query_start AS duration, query, state
   FROM pg_stat_activity
   WHERE datname = 'whatsapp_sales' AND state != 'idle'
   ORDER BY duration DESC;
   ```

**Remediation**
1. **Immediate**: restart the backend to release connections.
2. **Short-term**: increase `max_connections` in `postgresql.conf` or connection pool size.
3. **Long-term**: add connection pool monitoring and alerting.
4. Review slow queries and add missing indexes (especially on `subscriptions` and `usage_records`).

---

## 9. Redis Cache Stale Data

**Symptoms**
- A tenant upgrades their plan but still sees old usage limits.
- Subscription status does not update after a webhook.

**Diagnosis**
1. Check Redis for cached keys:
   ```bash
   redis-cli KEYS "subscription:active:*"
   redis-cli KEYS "usage:*"
   ```
2. Compare cached data with database:
   ```sql
   SELECT s.status, s.plan_id, p.slug
   FROM subscriptions s
   JOIN plans p ON p.id = s.plan_id
   WHERE s.business_id = 'tenant-id';
   ```

**Remediation**
1. Purge the affected keys:
   ```bash
   redis-cli DEL "subscription:active:tenant-id"
   redis-cli DEL "usage:tenant-id:ai_responses:<period>"
   ```
2. If a broader purge is needed, use the admin cache clear endpoint (if implemented) or restart Redis.
3. Verify the issue is resolved by re-fetching the data from the frontend.
