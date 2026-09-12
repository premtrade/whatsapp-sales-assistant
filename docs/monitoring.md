# Monitoring & Alerting

## 1. Health Check Endpoints

### Application Services

| Service | Endpoint | Description |
|---------|----------|-------------|
| n8n | `http://localhost:5678/healthz` | n8n health check |
| Postgres | `pg_isready -U postgres` | PostgreSQL readiness |
| Redis | `redis-cli ping` | Redis connectivity |
| Qdrant | `http://localhost:6333/healthz` | Qdrant health check |
| WAHA | `http://localhost:3000/api/health` | WAHA API health |

### Database Health Check Query
```sql
SELECT
    'postgres' as service,
    count(*) as active_connections,
    max(now() - query_start) as longest_query
FROM pg_stat_activity
WHERE state = 'active';
```

### Health Check Script
```powershell
# scripts/health-check.ps1
$services = @{
    "n8n" = "http://localhost:5678/healthz"
    "postgres" = "pg_isready -U postgres"
    "redis" = "redis-cli ping"
    "qdrant" = "http://localhost:6333/healthz"
    "waha" = "http://localhost:3000/api/health"
}

foreach ($service in $services.Keys) {
    try {
        $response = Invoke-WebRequest -Uri $services[$service] -UseBasicParsing
        Write-Host "$service : $($response.StatusCode) - OK"
    } catch {
        Write-Host "$service : FAILED - $($_.Exception.Message)"
    }
}
```

## 2. Key Metrics

### Message Throughput
```sql
SELECT
    date_trunc('hour', created_at) as hour,
    count(*) as message_count
FROM messages
WHERE created_at > now() - interval '24 hours'
GROUP BY 1
ORDER BY 1;
```

### LLM Latency
Track in `audit_logs.metadata.duration_ms` or a dedicated table:
```sql
SELECT
    avg((metadata->>'llm_duration_ms')::numeric) as avg_latency_ms,
    percentile_cont(0.95) WITHIN GROUP (ORDER BY (metadata->>'llm_duration_ms')::numeric) as p95_ms,
    max((metadata->>'llm_duration_ms')::numeric) as max_ms
FROM audit_logs
WHERE action = 'ai_reply'
  AND created_at > now() - interval '1 hour';
```

### Handoff Response Time
```sql
SELECT
    avg(extract(epoch from (accepted_at - created_at))) * 1000 as avg_response_ms,
    count(*) as pending_count
FROM handoffs
WHERE status = 'pending'
  AND created_at > now() - interval '24 hours';
```

### Database Connection Pool
```sql
SELECT
    count(*) as total_connections,
    count(*) FILTER (WHERE state = 'active') as active,
    count(*) FILTER (WHERE state = 'idle') as idle,
    max(now() - query_start) as longest_query
FROM pg_stat_activity;
```

### Workflow Failure Rate
```sql
-- In n8n UI: Executions > Failed
-- Or via n8n API:
-- GET /api/v1/executions?status=error&limit=100
```

## 3. Alerting Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| LLM latency (p95) | > 5s | > 15s |
| Workflow failure rate | > 5% | > 20% |
| Database active connections | > 80% of max | > 95% of max |
| Handoff pending time | > 30 min | > 2 hours |
| Message queue depth | > 1000 | > 5000 |
| Disk usage (Postgres) | > 80% | > 95% |
| n8n execution queue | > 50 | > 100 |

## 4. Monitoring Stack Recommendations

### Production Setup
- **Prometheus** + **Grafana** for metrics collection and dashboards
- **Alertmanager** for alert routing
- **Loki** or **ELK** for log aggregation
- **Uptime monitoring**: UptimeRobot, Pingdom, or similar

### Docker Compose Healthchecks
All services include healthchecks in `docker-compose.yml`:
```yaml
healthcheck:
  test: ["CMD-SHELL", "wget -qO- http://localhost:5678/healthz || exit 1"]
  interval: 20s
  timeout: 5s
  retries: 10
```

### Container Resource Limits
Services include resource limits to prevent resource exhaustion:
```yaml
deploy:
  resources:
    limits:
      cpus: '1.0'
      memory: 1G
    reservations:
      cpus: '0.25'
      memory: 256M
```

## 5. Dashboard Panels (Grafana)

### Panel 1: Message Throughput
- Query: messages per hour over last 24h
- Visualization: Time series graph
- Alert: < 10 messages/hour for > 1 hour

### Panel 2: LLM Latency
- Query: p50, p95, p99 latency for AI replies
- Visualization: Heatmap or time series
- Alert: p95 > 5s

### Panel 3: Workflow Success Rate
- Query: success vs failed executions per workflow
- Visualization: Stacked bar chart
- Alert: failure rate > 5%

### Panel 4: Database Connections
- Query: active/idle/total connections
- Visualization: Gauge
- Alert: active > 80% of max_connections

### Panel 5: Handoff Queue
- Query: pending handoffs by age
- Visualization: Table or bar chart
- Alert: any handoff pending > 30 min

## 6. Incident Response

### On-Call Runbook
See `docs/runbook.md` for common operational tasks.

### Escalation
1. **Warning alerts**: Check dashboard, may auto-resolve
2. **Critical alerts**: Page on-call engineer
3. **Service down**: Execute `scripts/health-check.ps1`, check logs, restart if needed
4. **Data issues**: Check `audit_logs`, restore from backup if needed
