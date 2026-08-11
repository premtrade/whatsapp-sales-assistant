<#
.SYNOPSIS
    Registers the WAHA -> n8n webhook so incoming WhatsApp messages reach
    n8n Workflow 1 (webhook path: waha/messages).

.DESCRIPTION
    Idempotent. If a webhook already points at the n8n target URL it is left
    untouched; otherwise a new registration is POSTed to the WAHA REST API
    using X-Api-Key authentication.

    The target URL uses the docker-internal n8n service name so the WAHA
    container (same compose network) can reach n8n:
        http://<N8N_HOST>:<N8N_PORT>/webhook/waha/messages

    Usage:
        .\scripts\configure-waha-webhook.ps1
        WAHA_API_KEY=... WAHA_HOST=waha N8N_HOST=n8n N8N_PORT=5678 .\scripts\configure-waha-webhook.ps1
#>
param(
    [string] $WahaUrl,
    [string] $WahaApiKey,
    [string] $N8nHost,
    [string] $N8nPort,
    [string] $WahaWebhookEvents
)

$ErrorActionPreference = 'Stop'
$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot   = Split-Path -Parent $ScriptRoot

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

# Fall back to env when parameters are not supplied
if (-not $WahaUrl)            { $WahaUrl            = if ($env:WAHA_HOST) { "http://$env:WAHA_HOST:3000" } else { "http://localhost:3001" } }
if (-not $WahaApiKey)          { $WahaApiKey          = $env:WAHA_API_KEY }
if (-not $N8nHost)            { $N8nHost            = $env:N8N_HOST }
if (-not $N8nPort)            { $N8nPort            = $env:N8N_PORT }
if (-not $WahaWebhookEvents)  { $WahaWebhookEvents  = $env:WAHA_WEBHOOK_EVENTS }
if (-not $WahaWebhookEvents)  { $WahaWebhookEvents  = '["message.create","message.update","message.reaction"]' }

$Base   = $WahaUrl.TrimEnd('/')
$Target = "http://${N8nHost}:${N8nPort}/webhook/waha/messages"

Write-Host "WAHA base:    $Base"
Write-Host "Webhook URL:  $Target"
Write-Host "Events:       $WahaWebhookEvents"

$Headers = @{ 'X-Api-Key' = $WahaApiKey }

# 1) Inspect existing webhooks (tolerant of response shapes across WAHA versions)
$Existing = $null
try {
    $Existing = Invoke-RestMethod -Uri "$Base/api/webhooks" -Headers $Headers -Method GET -ErrorAction Stop
} catch {
    Write-Warning "Could not list existing WAHA webhooks (is WAHA running?). Will attempt to register."
    $Existing = $null
}

$List = @()
if ($Existing) {
    if ($Existing.webhooks)        { $List = $Existing.webhooks }
    elseif ($Existing -is [array]) { $List = $Existing }
    elseif ($Existing.url)         { $List = @($Existing) }
}

$AlreadyRegistered = $List | Where-Object { $_.url -eq $Target }
if ($AlreadyRegistered) {
    Write-Host "Webhook already registered at $Target -- leaving unchanged." -ForegroundColor Green
    return
}

# 2) Register the webhook
$Body = @{
    url    = $Target
    events = @((ConvertFrom-Json -InputObject $WahaWebhookEvents))
} | ConvertTo-Json -Depth 5

try {
    $Response = Invoke-RestMethod -Uri "$Base/api/webhooks" -Headers $Headers -Method POST -Body $Body -ContentType 'application/json' -ErrorAction Stop
    Write-Host "Registered WAHA webhook." -ForegroundColor Green
    $Response | ConvertTo-Json -Depth 5 | Write-Host
} catch {
        Write-Host "Manual fallback: register http://${N8nHost}:${N8nPort}/webhook/waha/messages in the WAHA dashboard -> Webhooks."
    Write-Error "Failed to register WAHA webhook. Response: $($_.Exception.Message)"
}
