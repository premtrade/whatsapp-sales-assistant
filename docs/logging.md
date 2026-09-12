# Logging Specification

## 1. Structured Logging Format

All logs use a consistent JSON structure:

```json
{
  "timestamp": "ISO 8601 timestamp with timezone",
  "level": "info | warn | error | debug",
  "service": "service-name",
  "request_id": "UUID v4",
  "action": "event-name",
  "entity_type": "table-or-entity",
  "entity_id": "UUID or null",
  "performed_by": "UUID or null",
  "performed_by_type": "system | ai | staff | customer",
  "description": "Human-readable description",
  "old_values": "JSONB or null",
  "new_values": "JSONB or null",
  "metadata": {
    "source": "whatsapp | web | api",
    "workflow": "workflow-name",
    "level": "info | warn | error",
    "service": "service-name",
    "request_id": "UUID",
    "duration_ms": 123
  }
}
```

## 2. Request ID Tracking

### Generation
- Every incoming webhook generates a UUID v4 request ID in the `Generate Request ID & Validate Inputs` Code node.
- The request ID is passed through all subsequent workflow nodes.
- The request ID is included in:
  - Database message records (`messages.metadata`)
  - Audit log entries (`audit_logs.metadata`)
  - Outgoing HTTP headers (`X-Request-ID` to WAHA)

### Propagation
- Workflow 1: Generates `request_id` and passes to Workflow 2
- Workflow 2: Passes `request_id` to Workflow 3, 4, 5, 6, 7
- All sub-workflows include `request_id` in their trigger inputs

## 3. n8n Workflow Logging

### Code Node Logging
n8n Code nodes can log using `console.log()`:
```javascript
console.log(JSON.stringify({
  timestamp: new Date().toISOString(),
  level: 'info',
  service: 'appointment-tool',
  request_id: $('When Executed by Another Workflow').first().json.request_id,
  action: 'validate_inputs',
  message: 'Appointment inputs validated'
}));
```

### Audit Log Nodes
Each workflow includes Postgres `INSERT INTO audit_logs` nodes for key events:
- **Workflow 1**: `message_received` (incoming WhatsApp message)
- **Workflow 2**: `ai_reply` (AI response sent)
- **Workflow 5**: `appointment_created`
- **Workflow 6**: `quote_created`
- **Workflow 7**: `handoff_created`

### Error Logging
All error paths should log to `audit_logs` with `level: 'error'`:
```sql
INSERT INTO audit_logs (
    entity_type, entity_id, action, performed_by,
    performed_by_type, description, metadata
) VALUES (
    'quote', $1, 'quote_creation_failed', NULL,
    'ai', 'Failed to create quote: product not found',
    jsonb_build_object(
        'request_id', $2,
        'level', 'error',
        'service', 'quote-tool',
        'error', 'Product not found'
    )
);
```

## 4. Performance Logging

### Workflow Execution Time
Add timing Code nodes at workflow start and end:
```javascript
const start = Date.now();
// ... workflow logic ...
const duration = Date.now() - start;
console.log(JSON.stringify({
  timestamp: new Date().toISOString(),
  level: 'info',
  service: 'workflow-name',
  request_id: ...,
  action: 'workflow_complete',
  duration_ms: duration
}));
```

### Key Timing Points
- **LLM Response Time**: Time from prompt submission to response receipt
- **Database Query Time**: Time for each Postgres node execution
- **End-to-End Latency**: Time from webhook receipt to response sent

### Storage
Performance metrics can be stored in:
- `audit_logs.metadata` for per-request metrics
- A dedicated `performance_metrics` table for aggregation

## 5. Log Retention

- Audit logs are retained indefinitely (immutable).
- n8n execution logs are retained per n8n configuration (default: 30 days).
- Docker container logs are rotated (max 10MB, 3 files per container).

## 6. Accessing Logs

### Docker Compose
```bash
# View n8n logs
docker compose logs n8n --tail 100

# Follow n8n logs
docker compose logs -f n8n

# View Postgres logs
docker compose logs postgres --tail 100

# View all logs
docker compose logs --tail 50
```

### Database
```sql
-- Recent audit logs
SELECT * FROM audit_logs
ORDER BY created_at DESC
LIMIT 100;

-- Logs for specific request
SELECT * FROM audit_logs
WHERE metadata->>'request_id' = 'uuid-here'
ORDER BY created_at;

-- Error logs only
SELECT * FROM audit_logs
WHERE metadata->>'level' = 'error'
ORDER BY created_at DESC
LIMIT 50;
```

### n8n UI
- Execution logs: n8n Dashboard > Executions
- Workflow-level logs: n8n Dashboard > Workflows > [Workflow] > Executions
