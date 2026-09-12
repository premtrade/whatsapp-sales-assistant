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

## 2. Troubleshooting

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

## 3. Database Maintenance

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

## 4. SSL Certificate Rotation

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

## 5. User Management

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

## 6. Common Operational Tasks

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

### Check Qdrant Collection
```powershell
.\scripts\init-qdrant.ps1
# Or via API:
Invoke-RestMethod -Uri "http://localhost:6333/collections/whatsapp_sales" -Method Get
```

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
