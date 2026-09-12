# Health Check Endpoints

## 1. Application Health Checks

### n8n
```
GET http://localhost:5678/healthz
```
Expected response: `200 OK`

### PostgreSQL
```bash
pg_isready -h localhost -p 5432 -U postgres
```
Expected output: `localhost:5432 - accepting connections`

Or via TCP:
```bash
Test-NetConnection -ComputerName localhost -Port 5432
```

### Redis
```bash
redis-cli -a $env:REDIS_PASSWORD ping
```
Expected output: `PONG`

### Qdrant
```
GET http://localhost:6333/healthz
```
Expected response: `200 OK` with `{"status":"ok"}`

### WAHA
```
GET http://localhost:3000/api/health
```
Expected response: `200 OK` with health status

## 2. Docker Compose Health Checks

All services include built-in healthchecks in `docker-compose.yml`:

```yaml
healthcheck:
  test: ["CMD-SHELL", "wget -qO- http://localhost:5678/healthz || exit 1"]
  interval: 20s
  timeout: 5s
  retries: 10
  start_period: 30s
```

Check service health:
```powershell
docker compose ps
```

Expected output shows `State: Running (healthy)` for all services.

## 3. Database Health Queries

### Connection Pool Status
```sql
SELECT
    count(*) as total_connections,
    count(*) FILTER (WHERE state = 'active') as active_connections,
    count(*) FILTER (WHERE state = 'idle') as idle_connections,
    max(now() - query_start) as longest_running_query
FROM pg_stat_activity;
```

### Table Bloat
```sql
SELECT
    schemaname, relname,
    n_dead_tup,
    last_autovacuum,
    pg_size_pretty(pg_total_relation_size(relid)) as total_size
FROM pg_catalog.pg_stat_user_tables
ORDER BY n_dead_tup DESC
LIMIT 20;
```

### Replication Status (if applicable)
```sql
SELECT * FROM pg_stat_replication;
```

### Audit Log Health
```sql
SELECT
    count(*) as total_audit_logs,
    min(created_at) as oldest_log,
    max(created_at) as newest_log,
    count(*) FILTER (WHERE created_at > now() - interval '24 hours') as logs_24h
FROM audit_logs;
```

## 4. Health Check Script

Create `scripts/health-check.ps1`:

```powershell
<#
.SYNOPSIS
    Performs health checks on all WhatsApp Sales Assistant services.
#>

param(
    [switch]$Detailed
)

$ErrorActionPreference = 'Stop'
$results = @{}

function Test-HttpEndpoint {
    param($Url, $Name)
    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
        $results[$Name] = @{ Status = "OK"; Code = $response.StatusCode }
        Write-Host "$Name : $($response.StatusCode) - OK" -ForegroundColor Green
    } catch {
        $results[$Name] = @{ Status = "FAILED"; Error = $_.Exception.Message }
        Write-Host "$Name : FAILED - $($_.Exception.Message)" -ForegroundColor Red
    }
}

function Test-Command {
    param($Command, $Name)
    try {
        $output = & $Command 2>&1
        if ($LASTEXITCODE -eq 0) {
            $results[$Name] = @{ Status = "OK"; Output = $output }
            Write-Host "$Name : OK" -ForegroundColor Green
        } else {
            $results[$Name] = @{ Status = "FAILED"; Error = $output }
            Write-Host "$Name : FAILED - $output" -ForegroundColor Red
        }
    } catch {
        $results[$Name] = @{ Status = "FAILED"; Error = $_.Exception.Message }
        Write-Host "$Name : FAILED - $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "=== WhatsApp Sales Assistant Health Check ===" -ForegroundColor Cyan
Write-Host ""

# HTTP endpoints
Test-HttpEndpoint -Url "http://localhost:5678/healthz" -Name "n8n"
Test-HttpEndpoint -Url "http://localhost:6333/healthz" -Name "Qdrant"
Test-HttpEndpoint -Url "http://localhost:3000/api/health" -Name "WAHA"

# Command checks
Test-Command -Command { redis-cli -a $env:REDIS_PASSWORD ping } -Name "Redis"
Test-Command -Command { pg_isready -U $env:POSTGRES_USER } -Name "PostgreSQL"

Write-Host ""
Write-Host "=== Summary ===" -ForegroundColor Cyan

$failed = $results.Values | Where-Object { $_.Status -eq "FAILED" }
if ($failed) {
    Write-Host "FAILED services:" -ForegroundColor Red
    $failed | ForEach-Object { Write-Host "  - $($_.Keys | Select-Object -First 1)" -ForegroundColor Red }
    exit 1
} else {
    Write-Host "All services healthy!" -ForegroundColor Green
    exit 0
}
```

## 5. Monitoring Integration

### Prometheus Metrics (if deployed)
- n8n exposes metrics at `/metrics` (enable with `N8N_METRICS=true`)
- Postgres metrics via `postgres_exporter`
- Redis metrics via `redis_exporter`

### Uptime Monitoring
Configure external monitoring (UptimeRobot, Pingdom, etc.) for:
- `http://localhost:5678/healthz` (n8n)
- `http://localhost:3000/api/health` (WAHA)

Alert on downtime > 1 minute.

### Log Aggregation
Forward Docker container logs to a central log store:
```yaml
# docker-compose.yml logging driver
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
```

For production, consider:
- ELK Stack (Elasticsearch, Logstash, Kibana)
- Loki + Grafana
- Datadog / New Relic / Splunk
