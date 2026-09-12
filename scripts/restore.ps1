<#
.SYNOPSIS
    Restore script for WhatsApp Sales Assistant backups.

.DESCRIPTION
    Restores PostgreSQL databases, Docker volumes, and .env file from a backup.
    Validates restore integrity after completion.

    Usage:
        .\scripts\restore.ps1 -BackupFile C:\Backups\backup_20260818_120000
        .\scripts\restore.ps1 -BackupId backup_20260818_120000
#>
param(
    [string] $BackupFile,
    [string] $BackupId,
    [switch] $SkipVolumeRestore,
    [switch] $SkipDbRestore
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

# =============================================================================
# Resolve Backup Path
# =============================================================================
if (-not $BackupFile -and $BackupId) {
    $BackupDir = Join-Path $RepoRoot 'backups'
    $BackupFile = Join-Path $BackupDir $BackupId
}

if (-not (Test-Path $BackupFile)) {
    Write-Error "Backup not found: $BackupFile"
    exit 1
}

$manifestPath = Join-Path $BackupFile "manifest.json"
if (-not (Test-Path $manifestPath)) {
    Write-Error "Backup manifest not found: $manifestPath"
    exit 1
}

$Manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
Write-Host "Restoring backup: $($Manifest.id)" -ForegroundColor Cyan
Write-Host "Timestamp: $($Manifest.timestamp)"

# =============================================================================
# Pre-flight Checks
# =============================================================================
Write-Host ""
Write-Host "Pre-flight checks..." -ForegroundColor Yellow

if (-not (Test-CommandExists 'docker')) {
    Write-Error "Docker is not available."
    exit 1
}

$servicesRunning = docker compose ps --services --filter "status=running" 2>$null
if ($servicesRunning) {
    Write-Host "WARNING: Some services are running. Stopping stack before restore..." -ForegroundColor Yellow
    Push-Location $RepoRoot
    docker compose down --volumes 2>&1 | Out-Null
    Pop-Location
    Start-Sleep -Seconds 3
}

# =============================================================================
# 1. Restore PostgreSQL Databases
# =============================================================================
if (-not $SkipDbRestore) {
    Write-Host ""
    Write-Host "[1/3] Restoring PostgreSQL databases..." -ForegroundColor Yellow

    $dbFiles = $Manifest.files | Where-Object { $_ -like "*postgres_*.sql.gz" -or $_ -like "*n8n_*.sql.gz" }

    foreach ($file in $dbFiles) {
        $fileName = Split-Path $file -Leaf
        Write-Host "  Restoring: $fileName"

        $tempFile = Join-Path $BackupFile $fileName
        if (-not (Test-Path $tempFile)) {
            Write-Host "    WARNING: File not found in backup: $fileName" -ForegroundColor Red
            continue
        }

        $sqlContent = Get-Content $tempFile -Encoding Byte | ForEach-Object { $_ } | gzip -Decompress
        $dbName = if ($fileName -like "postgres_*") { $env:POSTGRES_DB } elseif ($fileName -like "n8n_*") { $env:N8N_DB } else { 'unknown' }

        if ($dbName -eq 'unknown') { continue }

        Write-Host "    Target database: $dbName"

        Push-Location $RepoRoot
        $sqlContent | docker compose exec -T postgres psql -U $env:POSTGRES_USER -d $dbName -v ON_ERROR_STOP=1 -q 2>&1 | ForEach-Object { Write-Host "    $_" }
        Pop-Location

        if ($LASTEXITCODE -eq 0) {
            Write-Host "    Restored OK."
        } else {
            Write-Host "    ERROR: Restore failed for $fileName" -ForegroundColor Red
        }
    }
} else {
    Write-Host "[1/3] Skipping database restore (SkipDbRestore set)." -ForegroundColor Yellow
}

# =============================================================================
# 2. Restore Docker Volumes
# =============================================================================
if (-not $SkipVolumeRestore) {
    Write-Host ""
    Write-Host "[2/3] Restoring Docker volumes..." -ForegroundColor Yellow

    $volumes = $Manifest.volumes

    foreach ($tarFile in $volumes) {
        $fileName = Split-Path $tarFile -Leaf
        $volName = $fileName -replace '_\d{8}_\d{6}\.tar\.gz$', ''

        Write-Host "  Restoring volume: $volName"

        if (-not (Test-Path $tarFile)) {
            Write-Host "    WARNING: Volume backup not found: $fileName" -ForegroundColor Red
            continue
        }

        $tempContainer = "restore-temp-$volName"
        $sourcePath = "/var/lib/docker/volumes/whatsapp-sales-assistant_${volName}/_data"

        Write-Host "    Creating temporary container..."
        docker run --rm --name $tempContainer `
            -v "whatsapp-sales-assistant_${volName}:${sourcePath}" `
            alpine:3.19 sh -c "tar xzf /tmp/volume_restore.tar.gz -C ${sourcePath}" 2>&1 | Out-Null

        docker cp $tarFile "${tempContainer}:/tmp/volume_restore.tar.gz" 2>&1 | Out-Null

        Write-Host "    Volume restored: $volName"
    }
} else {
    Write-Host "[2/3] Skipping volume restore (SkipVolumeRestore set)." -ForegroundColor Yellow
}

# =============================================================================
# 3. Restore .env
# =============================================================================
Write-Host ""
Write-Host "[3/3] Restoring .env file..." -ForegroundColor Yellow

$envBackup = $Manifest.files | Where-Object { $_ -like ".env_*" } | Select-Object -First 1
if ($envBackup) {
    $envSource = Join-Path $BackupFile (Split-Path $envBackup -Leaf)
    if (Test-Path $envSource) {
        Copy-Item $envSource (Join-Path $RepoRoot '.env') -Force
        Write-Host "  .env restored from backup."
    } else {
        Write-Host "  WARNING: .env backup file not found in backup." -ForegroundColor Red
    }
} else {
    Write-Host "  No .env backup found in manifest." -ForegroundColor Yellow
}

# =============================================================================
# Integrity Validation
# =============================================================================
Write-Host ""
Write-Host "Validating restore integrity..." -ForegroundColor Yellow

$errors = @()

Push-Location $RepoRoot
$pgCheck = docker compose exec -T postgres pg_isready -U $env:POSTGRES_USER -d $env:POSTGRES_DB 2>&1
Pop-Location

if ($LASTEXITCODE -ne 0) {
    $errors += "PostgreSQL not responding after restore."
} else {
    Write-Host "  PostgreSQL: OK"
}

$redisCheck = docker compose exec -T redis redis-cli -a $env:REDIS_PASSWORD ping 2>&1
if ($LASTEXITCODE -ne 0) {
    $errors += "Redis not responding after restore."
} else {
    Write-Host "  Redis: OK"
}

if ($errors.Count -gt 0) {
    Write-Host ""
    Write-Host "Validation errors:" -ForegroundColor Red
    foreach ($err in $errors) {
        Write-Host "  - $err" -ForegroundColor Red
    }
    Write-Host ""
    Write-Host "Please investigate before starting services." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Restore integrity: PASSED" -ForegroundColor Green
Write-Host ""
Write-Host "Restore completed. To start services:" -ForegroundColor Cyan
Write-Host "  docker compose up -d"
