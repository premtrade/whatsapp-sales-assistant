<#
.SYNOPSIS
    Health check script for WhatsApp Sales Assistant.

.DESCRIPTION
    Checks all service health endpoints, database connectivity, Qdrant,
    Redis, n8n, and WAHA session status. Outputs a color-coded status report.

    Usage:
        .\scripts\health-check.ps1
        .\scripts\health-check.ps1 -Detailed
#>
param(
    [switch] $Detailed
)

$ErrorActionPreference = 'Stop'
$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot   = Split-Path -Parent $ScriptRoot

# Colors
$C_GREEN  = 'Green'
$C_RED    = 'Red'
$C_YELLOW = 'Yellow'
$C_CYAN   = 'Cyan'
$C_GRAY   = 'Gray'

function Write-Header {
    param([string] $Text)
    Write-Host ""
    Write-Host ('=' * 60) -ForegroundColor $C_CYAN
    Write-Host "  $Text" -ForegroundColor $C_CYAN
    Write-Host ('=' * 60) -ForegroundColor $C_CYAN
}

function Write-Status {
    param(
        [string] $Name,
        [string] $Status,
        [string] $Detail = ''
    )
    $color = switch ($Status) {
        'OK'       { $C_GREEN }
        'FAIL'     { $C_RED }
        'WARNING'  { $C_YELLOW }
        'SKIP'     { $C_GRAY }
        default    { $C_GRAY }
    }
    $detailStr = if ($Detail) { " ($Detail)" } else { '' }
    Write-Host ("  {0,-20} {1,-8} {2}" -f $Name, "[$Status]", $detailStr) -ForegroundColor $color
}

function Load-DotEnv {
    $EnvFile = Join-Path $RepoRoot '.env'
    if (-not (Test-Path $EnvFile)) { return }
    Get-Content $EnvFile | ForEach-Object {
        if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
            $Key = $Matches[1]
            $Val = $Matches[2].Trim().Trim('"')
            if (-not [System.Environment]::GetEnvironmentVariable($Key)) {
                [System.Environment]::SetEnvironmentVariable($Key, $Val)
            }
        }
    }
}
Load-DotEnv

Write-Host ""
Write-Host "WhatsApp Sales Assistant - Health Check" -ForegroundColor $C_CYAN
Write-Host "Time: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor $C_GRAY

$allOk = $true
$results = @{}

# =============================================================================
# 1. Docker Compose Status
# =============================================================================
Write-Header "Docker Compose"

$services = @('postgres', 'redis', 'qdrant', 'n8n', 'waha', 'backend', 'frontend', 'pgadmin')
$containerStatus = @{}

foreach ($svc in $services) {
    $containerId = docker compose ps -q $svc 2>$null
    if (-not $containerId) {
        Write-Status -Name $svc -Status 'FAIL' -Detail 'not running'
        $allOk = $false
        continue
    }

    $health = docker inspect --format "{{.State.Health.Status}}" $containerId 2>$null
    if ($LASTEXITCODE -ne 0) {
        $health = 'no-healthcheck'
    }

    $status = if ($health -eq 'healthy') { 'OK' } elseif ($health -eq 'unhealthy') { 'FAIL' } elseif ($health -eq 'starting') { 'WARNING' } else { 'WARNING' }
    $containerStatus[$svc] = @{ id = $containerId; health = $health }

    Write-Status -Name $svc -Status $status -Detail $health
}

# =============================================================================
# 2. Service Endpoints
# =============================================================================
Write-Header "Service Endpoints"

$endpoints = @(
    @{ Name = 'PostgreSQL'; Url = "postgresql://${env:POSTGRES_USER}:${env:POSTGRES_PASSWORD}@localhost:${env:POSTGRES_PORT}/postgres" },
    @{ Name = 'Redis'; Url = "redis://:${env:REDIS_PASSWORD}@localhost:${env:REDIS_PORT}" },
    @{ Name = 'Qdrant'; Url = "http://localhost:${env:QDRANT_PORT}" },
    @{ Name = 'n8n'; Url = "http://localhost:${env:N8N_PORT}/healthz" },
    @{ Name = 'WAHA'; Url = "http://localhost:3001/api/status" },
    @{ Name = 'Backend'; Url = "http://localhost:${env:BACKEND_PORT}/health" },
    @{ Name = 'Frontend'; Url = "http://localhost:${env:FRONTEND_PORT}" }
)

foreach ($ep in $endpoints) {
    $name = $ep.Name
    $url = $ep.Url
    $status = 'SKIP'
    $detail = ''

    try {
        if ($url -match '^postgresql://') {
            $credPart = $url -replace '^postgresql://', ''
            $hostPort = $credPart.Split('@')[1] -replace '/.*$', ''
            $host = $hostPort.Split(':')[0]
            $port = $hostPort.Split(':')[1]

            $container = docker compose ps -q postgres 2>$null
            if ($container) {
                $result = docker compose exec -T postgres pg_isready -h $host -p $port -U $env:POSTGRES_USER -d $env:POSTGRES_DB 2>&1
                if ($LASTEXITCODE -eq 0) {
                    $status = 'OK'
                    $detail = 'accepting connections'
                } else {
                    $status = 'FAIL'
                    $detail = $result
                }
            }
        } elseif ($url -match '^redis://') {
            $container = docker compose ps -q redis 2>$null
            if ($container) {
                $result = docker compose exec -T redis redis-cli -a $env:REDIS_PASSWORD ping 2>&1
                if ($LASTEXITCODE -eq 0 -and $result -match 'PONG') {
                    $status = 'OK'
                    $detail = 'PONG'
                } else {
                    $status = 'FAIL'
                    $detail = $result
                }
            }
        } else {
            $req = Invoke-WebRequest -Uri $url -Method GET -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
            if ($req.StatusCode -eq 200) {
                $status = 'OK'
                $detail = "HTTP $($req.StatusCode)"
            } else {
                $status = 'WARNING'
                $detail = "HTTP $($req.StatusCode)"
            }
        }
    } catch {
        $status = 'FAIL'
        $detail = $_.Exception.Message.Substring(0, [Math]::Min(50, $_.Exception.Message.Length))
    }

    Write-Status -Name $name -Status $status -Detail $detail
    if ($status -ne 'OK') { $allOk = $false }
}

# =============================================================================
# 3. WAHA Session Status
# =============================================================================
Write-Header "WAHA Session Status"

try {
    $wahaApiKey = $env:WAHA_API_KEY
    $wahaUrl = "http://localhost:3001/api/sessions"
    $headers = @{ 'X-Api-Key' = $wahaApiKey }
    $resp = Invoke-RestMethod -Uri $wahaUrl -Headers $headers -Method GET -TimeoutSec 5 -ErrorAction Stop

    if ($resp -and $resp.sessions) {
        foreach ($session in $resp.sessions) {
            $status = if ($session.status -eq 'CONNECTED') { 'OK' } else { 'WARNING' }
            Write-Status -Name $session.name -Status $status -Detail $session.status
        }
    } else {
        Write-Status -Name 'WAHA Sessions' -Status 'WARNING' -Detail 'no sessions found'
    }
} catch {
    Write-Status -Name 'WAHA Sessions' -Status 'FAIL' -Detail $_.Exception.Message
    $allOk = $false
}

# =============================================================================
# 4. n8n Webhook Accessibility
# =============================================================================
Write-Header "n8n Webhook Accessibility"

try {
    $n8nWebhook = "http://localhost:5678/webhook/waha/messages"
    $req = Invoke-WebRequest -Uri $n8nWebhook -Method POST -ContentType 'application/json' -Body '{}' -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
    $status = 'OK'
    $detail = "HTTP $($req.StatusCode)"
} catch {
    $status = if ($_.Exception.Response.StatusCode -eq 404) { 'WARNING' } else { 'FAIL' }
    $detail = $_.Exception.Message
}

Write-Status -Name 'n8n Webhook' -Status $status -Detail $detail
if ($status -ne 'OK') { $allOk = $false }

# =============================================================================
# 5. Database Tables Check
# =============================================================================
if ($Detailed) {
    Write-Header "Database Tables"

    $tables = @('contacts', 'conversations', 'messages', 'products', 'quotes', 'quote_items', 'appointments', 'knowledge_documents', 'knowledge_chunks', 'staff_users', 'handoffs', 'settings', 'audit_logs', 'customer_facts', 'conversation_summaries', 'memory_embeddings')

    foreach ($table in $tables) {
        $sql = "SELECT COUNT(*) FROM $table;"
        $count = docker compose exec -T postgres psql -U $env:POSTGRES_USER -d $env:POSTGRES_DB -t -A -c $sql 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Status -Name $table -Status 'OK' -Detail "$count rows"
        } else {
            Write-Status -Name $table -Status 'FAIL' -Detail 'query failed'
            $allOk = $false
        }
    }
}

# =============================================================================
# Summary
# =============================================================================
Write-Host ""
Write-Host ('=' * 60)
if ($allOk) {
    Write-Host "  Overall Status: HEALTHY" -ForegroundColor $C_GREEN
} else {
    Write-Host "  Overall Status: DEGRADED - some checks failed" -ForegroundColor $C_RED
}
Write-Host ('=' * 60)
Write-Host ""

exit $(if ($allOk) { 0 } else { 1 })
