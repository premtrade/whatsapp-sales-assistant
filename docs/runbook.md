# Operational Runbook

## 1. Service Startup

### First Time Setup
```powershell
# 1. Copy environment file
Copy-Item .env.example .env

# 2. Edit .env with your credentials
notepad .env

# 3. Generate SSL certificates for Postgres
cd docker/postgres
bash generate-certs.sh
cd ../..

# 4. Start all services
docker compose up -d

# 5. Wait for health checks (30-60 seconds)
Start-Sleep -Seconds 30

# 6. Verify services
.\scripts\health-check.ps1

# 7. Register WAHA webhook
.\scripts\configure-waha-webhook.ps1
```

### Restart Services
```powershell
# Restart all services
docker compose restart

# Restart specific service
docker compose restart n8n

# Rebuild and restart
docker compose up -d --build
```

## 2. Deploying n8n Workflow Changes (Manual Sync)

> n8n workflow definitions live in `workflows/live/` and CI/CD does NOT push them.
> After merging workflow changes, run the manual sync below.

### Why "synced but broken" happens
n8n 2.x keeps TWO copies of every workflow:
- `workflow_entity.nodes` — the editor **DRAFT**
- `workflow_history.nodes` — the **EXECUTABLE** copy selected via `activeVersionId`

The sync script updates BOTH in place; a plain `docker restart n8n` reloads the
executable copy. Also, credential IDs are per n8n instance — the script remaps
them by (type, name) before writing.

### Production (standalone containers)
```powershell
python3 scripts/sync_n8n_from_repo.py workflows/live > n8n_sync.sql
N8N_DB=$(docker exec n8n printenv DB_POSTGRESDB_DATABASE)
docker exec -i -e "PGPASSWORD=$POSTGRES_PASSWORD" postgres psql -U postgres -d $N8N_DB -v ON_ERROR_STOP=1 < n8n_sync.sql
docker restart n8n

# verify
docker exec n8n wget -qO- http://localhost:5678/healthz
docker exec postgres psql -U postgres -d n8n -t -c "SELECT name, status FROM workflow_entity WHERE active;"
```

### Local (docker-compose)
```powershell
python3 scripts/sync_n8n_from_repo.py workflows/live > n8n_sync.sql
N8N_DB=$(docker compose exec -T n8n printenv DB_POSTGRESDB_DATABASE)
docker compose exec -T postgres psql -U postgres -d $N8N_DB -v ON_ERROR_STOP=1 < n8n_sync.sql
docker compose restart n8n
```

### Post-deploy checks
- 5 synced workflows (01 - Incoming WhatsApp Message, Workflow 2, 03 - Memory
  & Context Builder, Workflow 7 - Handoff Tool, 08 - AI Output Processor)
  execute successfully
- active workflow count == 11
- `docker compose logs n8n --tail 100` → no credential-ID errors

## 3. Troubleshooting

### n8n Workflow Not Triggering
1. Check n8n logs: `docker compose logs n8n --tail 100`
2. Verify webhook is registered in WAHA dashboard
3. Check WAHA -> n8n connectivity: `docker compose exec n8n wget -qO- http://n8n:5678/healthz`
4. Verify Workflow 1 is active in n8n UI

### WAHA Session Issues
1. Check WAHA container logs: `docker compose logs waha --tail 100`
2. Check session status: `docker compose exec waha wget -qO- http://localhost:3000/api/sessions`
3. Re-scan QR code if session is disconnected
4. Restart WAHA: `docker compose restart waha`

### Database Connection Issues
1. Check Postgres is running: `docker compose ps postgres`
2. Verify credentials in `.env`
3. Check SSL certs exist: `ls docker/postgres/certs/`
4. Test connection: `docker compose exec postgres psql -U postgres -d whatsapp_sales -c "SELECT 1"`

### High LLM Latency
1. Check Groq API status: https://status.groq.com
2. Review n8n execution logs for timeout errors
3. Consider switching to a faster model or fallback provider
4. Check network connectivity between n8n and Groq API

### Workflow Failures
1. Open n8n UI > Executions > Errors
2. Review error message and node that failed
3. Check `audit_logs` table for structured error details:
   ```sql
   SELECT * FROM audit_logs
   WHERE metadata->>'level' = 'error'
   ORDER BY created_at DESC
   LIMIT 20;
   ```
4. Common fixes:
   - Invalid input: Add validation in Code node
   - Timeout: Increase timeout in HTTP Request node
   - DB connection: Check Postgres health

## 4. Database Maintenance

### Backup
```powershell
# Backup all databases
docker compose exec postgres pg_dumpall -U postgres > backups/full_backup_$(Get-Date -Format 'yyyyMMdd_HHmmss').sql

# Backup specific database
docker compose exec postgres pg_dump -U postgres whatsapp_sales > backups/whatsapp_sales_backup_$(Get-Date -Format 'yyyyMMdd_HHmmss').sql
```

### Restore
```powershell
# Restore specific database
docker compose exec -T postgres psql -U postgres -d whatsapp_sales < backups/whatsapp_sales_backup_20260818.sql
```

### Run Migrations
```powershell
# Apply pending migrations
.\scripts\apply-migrations.ps1
```

### Vacuum & Analyze
```sql
-- In psql
VACUUM ANALYZE;
VACUUM FULL audit_logs;  -- If audit_logs grows very large
```

### Check Table Sizes
```sql
SELECT
    schemaname, relname,
    pg_size_pretty(pg_total_relation_size(relid)) as total_size
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC;
```

## 5. SSL Certificate Rotation

### Generate New Certs
```powershell
cd docker/postgres
bash generate-certs.sh
cd ../..

# Restart Postgres to pick up new certs
docker compose restart postgres
```

### Verify SSL is Working
```sql
SELECT ssl_is_used() FROM pg_stat_ssl LIMIT 1;
-- Should return 't'
```

## 6. User Management

### Create Staff User (in n8n or admin dashboard)
```sql
INSERT INTO staff_users (first_name, last_name, email, role, status)
VALUES ('John', 'Doe', 'john@example.com', 'sales', 'active')
RETURNING *;
```

### Block Customer
```sql
UPDATE contacts
SET status = 'blocked', updated_at = NOW()
WHERE phone = '+1876xxxxxxxx'
RETURNING *;
```

## 7. Common Operational Tasks

### Confirm an Offline Payment

WAFLO currently collects subscriptions by bank transfer, because Stripe does not
support Jamaica as a merchant country.

1. The customer sees a reference (`WAF-XXXXXXXX`) on their Billing page and
   sends the transfer.
2. Check the transfer has arrived (bank statement or account).
3. Open **Owner → Subscription Management** in the dashboard.
4. The request appears under "Payment requests awaiting confirmation".
5. Click **Confirm**. The subscription activates immediately and the customer
   sees it as paid on their Billing page.

Reject a request with **Reject** if the money never arrived — that leaves the
subscription untouched and the customer can request a new reference.

To see the same list from the database:

```sql
SELECT pr.reference, b.name AS business, p.name AS plan,
       pr.amount, pr.currency, pr.status, pr.created_at
FROM payment_requests pr
JOIN businesses b ON b.id = pr.business_id
LEFT JOIN plans p ON p.id = pr.plan_id
WHERE pr.status = 'pending'
ORDER BY pr.created_at ASC;
```

Billing runs on the `BILLING_PROVIDER` setting. To switch to a card processor
later, set the new provider and its credentials — no code change is needed.
See [BILLING.md](BILLING.md).

### Repair a tenant with no subscription

A self-serve signup creates the business, then the trial subscription. If the
second step fails, the tenant is left without a plan: every dashboard call is
gated with a 402, and because `businesses.whatsapp_phone` is unique the
customer cannot sign up again either.

This happened between 1 and 15 October 2026, when the `ON CONFLICT` clause in
`createTrial` could not be matched against the partial unique index added in
migration 056, so the insert raised 42P10 every time. It is fixed, and signup
now rolls the tenant back if the trial cannot be created.

To repair anything left over:

```bash
# On the server, inside the backend container
docker exec <backend-container> node dist/scripts/repair-tenants.js --dry-run
docker exec <backend-container> node dist/scripts/repair-tenants.js
```

It finds every tenant with no subscription, creates a starter trial starting
from now, and backfills any missing settings rows.

### Check a tenant's entitlements

```bash
docker exec <backend-container> node -e "
const { query, closePool } = require('/app/dist/utils/database');
const { getActiveSubscription, isUsable } = require('/app/dist/services/subscription.service');
(async () => {
  const b = await query(\"SELECT id FROM businesses WHERE slug='<slug>'\");
  const sub = await getActiveSubscription(b.rows[0].id);
  console.log({ status: sub?.status, usable: isUsable(sub), plan: sub?.plan?.slug });
  await closePool();
})();
"
```

### Configure transactional email

Trial reminders are the only automated way a prospect hears from us before
their trial expires, and they are windowed: a trial is only reminded when it
has seven days left and when it has two. If delivery fails for the whole of a
window the reminder is lost, not retried. Email therefore has to work.

The provider is a deployment choice, not a code choice:

```bash
EMAIL_PROVIDER=smtp2go     # 1,000/month, free, never expires
EMAIL_PROVIDER=resend       # 3,000/month, free
EMAIL_PROVIDER=brevo        # 300/day, free
EMAIL_PROVIDER=sendgrid     # 100/day, free
```

Add the key for whichever you pick to the server env and restart the backend:

```bash
SMTP2GO_API_KEY=<the key>
```

Check what the running container can actually see - a key that is present but
empty is the failure mode to look for:

```bash
docker exec <backend-container> node -e "
const { getEmailProvider } = require('/app/dist/services/email.service');
const p = getEmailProvider();
console.log(p.id, p.apiKey ? 'key present' : 'KEY EMPTY', require('/app/dist/config').config.email.fromEmail || 'SENDER EMPTY');
"
```

The sender has to be a domain you control with SPF and DKIM set up, or the mail
will be junked. Until that is done, a trial about to expire is reported in the
backend log every hour so it is at least visible.

### Deploy a workflow change

n8n keeps workflows in its own database and the release pipeline does not push
them there, so a fix to a workflow cannot ship on its own. Deploy it by name:

```bash
scripts/deploy-workflow.sh "09 - Appointment Reminders"
```

Two things about n8n 2.x make this less obvious than it looks, and both have
cost time:

- **The running definition is a published version, not the draft.** The draft
  lives in `workflow_entity`, but the version that actually runs lives in
  `workflow_history` and is reached through the workflow's `activeVersionId`.
  Editing `workflow_entity.nodes` changes nothing at runtime. The script
  therefore writes a new version and points the active and published version
  ids at it.
- **n8n writes its in-memory workflows back to the database when it shuts
  down.** Updating the rows while n8n is running is undone by the restart that
  follows. The script stops n8n first, writes, and starts it again.

The script prints which version it published and checks that the published
version carries the change, so a silent no-op is visible.

### Check Active Conversations
```sql
SELECT c.id, co.display_name, c.status, c.last_message_at
FROM conversations c
JOIN contacts co ON co.id = c.contact_id
WHERE c.status != 'closed'
ORDER BY c.last_message_at DESC;
```

### Check Pending Handoffs
```sql
SELECT h.id, co.display_name, h.reason, h.created_at, h.status
FROM handoffs h
JOIN conversations c ON c.id = h.conversation_id
JOIN contacts co ON co.id = c.contact_id
WHERE h.status = 'pending'
ORDER BY h.created_at ASC;
```

### Clear Old Execution Logs (n8n)
- n8n UI: Settings > Database > Clean up executions
- Or via API: `DELETE /api/v1/executions?olderThan=30d`

### Regenerate Embeddings
```powershell
python scripts/embed_memory.py
```
Use one embedding provider per table: `memory_embeddings` / `knowledge_chunks` are `vector(768)`, and
vectors from a Hugging Face model are not comparable with vectors from Gemini (`EMBEDDING_MODEL`).
After switching providers, re-embed every row — see the Model configuration section in `README.md`.

### Check pgvector Embeddings
```powershell
# Embedding columns live in PostgreSQL (migration 032_pgvector_embeddings.sql):
#   knowledge_chunks.embedding vector(768)   + idx_chunks_embedding_hnsw
#   memory_embeddings.embedding vector(768)  + idx_memory_embeddings_embedding_hnsw
docker compose exec -T postgres psql -U $env:POSTGRES_USER -d $env:POSTGRES_DB -c "
  select 'knowledge_chunks' as table_name, count(*) as rows, count(embedding) as embedded
  from knowledge_chunks
  union all
  select 'memory_embeddings', count(*), count(embedding) from memory_embeddings;"
```
No `init-qdrant.ps1` / collection step is needed anymore — Qdrant was removed when the stack moved to pgvector.

## 7. Emergency Procedures

### Service Down
1. `docker compose ps` to check status
2. `docker compose logs <service> --tail 100` to diagnose
3. `docker compose restart <service>` to restart
4. If database corrupted, restore from latest backup

### Data Loss / Corruption
1. Stop Postgres: `docker compose stop postgres`
2. Restore from backup:
   ```powershell
   docker compose exec -T postgres psql -U postgres -d whatsapp_sales < backups/latest.sql
   ```
3. Start Postgres: `docker compose start postgres`
4. Verify data integrity

### Security Incident
1. Rotate all passwords and API keys immediately
2. Check `audit_logs` for suspicious activity:
   ```sql
   SELECT * FROM audit_logs
   WHERE created_at > now() - interval '24 hours'
   AND (performed_by_type = 'staff' OR metadata->>'source' = 'web')
   ORDER BY created_at DESC;
   ```
3. Review n8n execution logs for unauthorized workflow runs
4. Block suspicious phone numbers or IPs
