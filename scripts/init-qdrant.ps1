<#
.SYNOPSIS
    Creates the Qdrant vector collection used by the WhatsApp Sales Assistant
    (idempotent). Vectors for memory/knowledge live in Qdrant; the pointer is
    tracked back in PostgreSQL (memory_embeddings.qdrant_point_id).

.DESCRIPTION
    Reads connection settings from .env (QDRANT_HOST/PORT/API_KEY/COLLECTION) and
    creates the collection with the configured embedding size (EMBED_DIMS, default 1536
    = OpenAI text-embedding-3-small) using Cosine distance. Safe to re-run.

    Usage:  .\scripts\init-qdrant.ps1
            $env:EMBED_DIMS=1536; .\scripts\init-qdrant.ps1
#>
param(
    [string]$Collection = $env:QDRANT_COLLECTION,
    [int]$Dims = 1536
)

$ErrorActionPreference = 'Stop'
$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot   = Split-Path -Parent $ScriptRoot

function Load-DotEnv {
    $EnvFile = Join-Path $RepoRoot '.env'
    if (-not (Test-Path $EnvFile)) { return }
    Get-Content $EnvFile | ForEach-Object {
        if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
            $Key = $Matches[1]; $Val = $Matches[2].Trim().Trim('"')
            if (-not [System.Environment]::GetEnvironmentVariable($Key)) {
                [System.Environment]::SetEnvironmentVariable($Key, $Val)
            }
        }
    }
}
Load-DotEnv

if (-not $Collection) { $Collection = $env:QDRANT_COLLECTION }
if (-not $Collection) { $Collection = 'whatsapp_sales_v2' }
$Host0 = $env:QDRANT_HOST
if ($Host0 -eq 'qdrant') { $Host0 = 'localhost' }  # compose service name -> host-side port
if (-not $Host0) { $Host0 = 'localhost' }
$Port  = $env:QDRANT_PORT
if (-not $Port) { $Port = '6333' }
$ApiKey = $env:QDRANT_API_KEY

$Base = "http://$Host0`:$Port"
$Headers = @{ 'Content-Type' = 'application/json' }
if ($ApiKey) { $Headers['X-Api-Key'] = $ApiKey }

Write-Host "Qdrant: $Base  collection='$Collection' dims=$Dims"

# 1) does it already exist?
try {
    $r = Invoke-RestMethod -Uri "$Base/collections/$Collection" -Headers @{ 'X-Api-Key' = $ApiKey } -Method Get -TimeoutSec 10
    $status = $r.result.status
    Write-Host "Collection '$Collection' already exists (status=$status). Nothing to do."
    return
} catch {
    # 404 => create it
}

Write-Host "Creating collection '$Collection' (size=$Dims, Cosine)..."
$Body = @{
    vectors          = @{ size = $Dims; distance = 'Cosine' }
    on_disk_payload  = $true
    optimizers_config = @{ indexing_threshold = 100 }
} | ConvertTo-Json -Depth 6
try {
    $resp = Invoke-RestMethod -Uri "$Base/collections/$Collection" -Headers $Headers -Method Put -Body $Body -TimeoutSec 15
    Write-Host "Created OK."
} catch {
    Write-Error "Failed to create collection: $($_.Exception.Message)"
    exit 1
}

# 3) verify
$check = Invoke-RestMethod -Uri "$Base/collections/$Collection" -Headers @{ 'X-Api-Key' = $ApiKey } -Method Get -TimeoutSec 10
$v = $check.result.config.params.vectors
Write-Host "Verified: status=$($check.result.status) size=$($v.size) distance=$($v.distance)"
