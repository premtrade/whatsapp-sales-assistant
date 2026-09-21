# Security Best Practices

## 1. Secrets Management

- **Never commit secrets** to version control. All credentials must be stored in `.env` (gitignored).
- Use `.env.example` as a template with placeholder values.
- Rotate all passwords and API keys before deploying to production.
- Use strong, randomly generated secrets:
  - `N8N_ENCRYPTION_KEY`: 32+ character random string
  - `BACKEND_JWT_SECRET`: 64+ character random string
  - Database passwords: minimum 16 characters, mixed case, numbers, symbols

## 2. Database Security

### SQL Injection Prevention
- All SQL queries in n8n workflows use **parameterized queries** (`$1, $2, etc.`).
- Never use string concatenation or template literals to build SQL queries.
- The only exception is `LOWER($1 || '%')` pattern for safe LIKE searches with user input.

### PostgreSQL SSL
- Database connections use SSL in production.
- Self-signed certificates are generated via `docker/postgres/generate-certs.sh`.
- n8n connects to Postgres with `DB_POSTGRESDB_SSL=true` and CA certificate mounted.
- Certificate files are mounted read-only (`:ro`) in containers.

### Access Control
- Postgres listens on `0.0.0.0` only if external access is required. Prefer binding to `127.0.0.1` for local-only deployments.
- Use `scram-sha-256` authentication for Postgres (`POSTGRES_INITDB_ARGS`).
- Database users follow the principle of least privilege.

## 3. n8n Security

### Webhook Validation
- All incoming webhooks should validate the source (WAHA sends `X-Api-Key`).
- n8n webhook paths should be unpredictable (avoid common paths like `/webhook`).
- Consider adding IP allowlisting for WAHA server IPs.

### Credential Storage
- n8n encrypts credentials at rest using `N8N_ENCRYPTION_KEY`.
- Never share the encryption key; rotating it invalidates all stored credentials.
- Use n8n's built-in credential management, not environment variables in workflow JSON.

### Execution Permissions
- Run n8n with a non-root user in production.
- Limit workflow execution permissions to required nodes only.

## 4. WAHA Security

### Network exposure (multi-tenant deployments)

WAHA must **never** be reachable from the public internet. All internal callers
(backend, n8n) reach WAHA over the private Docker network at `http://waha:3000`,
so the host port binding exists only for operator dashboard access:

- `docker-compose.yml` binds `127.0.0.1:3001:3000` (localhost-only)
- `docker-compose.prod.yml` binds `127.0.0.1:3000:3000` (localhost-only)

To open the WAHA dashboard from your workstation, use an SSH tunnel instead of a
public port:

```
ssh -L 3001:127.0.0.1:3001 root@<droplet-ip>
# then open http://localhost:3001
```

Note: `businesses.waha_session_name` (e.g. `waha-<slug>`) is the per-tenant
session. The backend resolves it for every send (`sendWahaText`) and for
self-service QR linking (`POST /api/whatsapp/connect`, `GET /api/whatsapp/status`
auto-provisions the session). Do not route tenant traffic through the global
`default` session.


### API Key Protection
- `WAHA_API_KEY` is passed via n8n's `$env.WAHA_API_KEY` expression, never hardcoded.
- The WAHA dashboard credentials (`WAHA_USERNAME`, `WAHA_PASSWORD`) should be strong.
- Enable WAHA session management and monitor for unauthorized QR code scans.

### HTTPS Enforcement
- In production, expose WAHA, n8n, and other services behind a reverse proxy (Traefik) with TLS termination.
- Use Let's Encrypt certificates via Traefik's built-in ACME support.
- Internal Docker network traffic uses HTTP (isolated by Docker bridge).
- Database connections use SSL regardless of network location.

## 5. Input Validation

### Phone Number Sanitization
- Incoming phone numbers are sanitized to E.164 format (remove all non-digit characters except `+`).
- Minimum length validation (10 digits) rejects obviously invalid numbers.
- All phone operations use the sanitized value throughout the workflow.

### UUID Validation
- All IDs passed between workflows are validated as UUIDs where applicable.
- The `__NULL_UUID__` and `__EMPTY__` sentinel values are used for optional UUID/text fields.

### Message Size Limits
- Incoming messages are truncated to 10,000 characters to prevent abuse.
- Media messages are flagged but not processed in the current implementation.

## 6. Audit & Immutability

- The `audit_logs` table is **immutable**: UPDATE and DELETE operations raise exceptions via database triggers.
- All significant events are logged:
  - Incoming/outgoing messages
  - AI replies
  - Handoffs
  - Quote creation
  - Appointment creation
  - Staff actions (when admin dashboard is implemented)

### Structured Logging Format
```json
{
  "timestamp": "2026-08-18T12:34:56.789Z",
  "level": "info",
  "service": "whatsapp-gateway",
  "request_id": "uuid-string",
  "action": "message_received",
  "entity_type": "conversation",
  "entity_id": "uuid",
  "description": "...",
  "metadata": {}
}
```

## 7. Monitoring & Alerting

### Key Metrics to Monitor
- Message throughput (messages/minute)
- LLM response time (p50, p95, p99)
- Handoff response time
- Database connection pool usage
- n8n workflow execution failures
- WAHA session status

### Alerting Thresholds
- LLM latency > 5s: warning
- LLM latency > 15s: critical
- Workflow failure rate > 5%: warning
- Workflow failure rate > 20%: critical
- Database connections > 80% of pool: warning
- Handoff pending > 30 minutes: warning

## 8. Docker Security

- All services run with non-root users where possible.
- Sensitive directories (Traefik ACME, n8n data) use Docker named volumes.
- Container images are pinned to specific versions in production (avoid `latest` tag).
- Use Docker secrets for sensitive environment variables in Swarm mode.
