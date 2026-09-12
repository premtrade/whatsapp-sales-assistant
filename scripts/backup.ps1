<#
.SYNOPSIS
    Backup script for WhatsApp Sales Assistant.

.DESCRIPTION
    Creates timestamped backups of PostgreSQL databases, Docker volumes,
    and the .env file. Implements retention policy based on BACKUP_RETENTION_DAYS.

    Usage:
        .\scripts\backup.ps1
        .\scripts\backup.ps1 -BackupDir C:\Backups\whatsapp-sales
#>
param(
    [string] $BackupDir
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

if (-not $BackupDir) {
    $BackupDir = $env:BACKUP_DIR
}
if (-not $BackupDir) {
    $BackupDir = Join-Path $RepoRoot 'backups'
}

if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

$Timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$BackupId  = "backup_${Timestamp}"
$BackupPath = Join-Path $BackupDir $BackupId
New-Item -ItemType Directory -Path $BackupPath -Force | Out-Null

$Manifest = @{ id = $BackupId; timestamp = $Timestamp; files = @(); volumes = @(); retention_days = $env:BACKUP_RETENTION_DAYS }

Write-Host "Starting backup: $BackupId" -ForegroundColor Cyan

# =============================================================================
# 1. Backup PostgreSQL
# =============================================================================
Write-Host "[1/4] Backing up PostgreSQL..." -ForegroundColor Yellow

$pgDumpFile = Join-Path $BackupPath "postgres_${Timestamp}.sql.gz"
Push-Location $RepoRoot
docker compose exec -T postgres pg_dump -U $env:POSTGRES_USER -d $env:POSTGRES_DB --format=plain --no-owner --no-acl 2>&1 | Out-Null
$dumpResult = docker compose exec -T postgres pg_dump -U $env:POSTGRES_USER -d $env:POSTGRES_DB --format=plain --no-owner --no-acl
Pop-Location

if ($LASTEXITCODE -eq 0 -and $dumpResult) {
    $dumpResult | gzip | Set-Content -Path $pgDumpFile -Encoding Byte
    Write-Host "  PostgreSQL backup saved: $pgDumpFile"
    $Manifest.files += $pgDumpFile
} else {
    Write-Host "  WARNING: PostgreSQL backup failed." -ForegroundColor Red
}

# Backup n8n database
$n8nDumpFile = Join-Path $BackupPath "n8n_${Timestamp}.sql.gz"
Push-Location $RepoRoot
$n8nDumpResult = docker compose exec -T postgres pg_dump -U $env:POSTGRES_USER -d $env:N8N_DB --format=plain --no-owner --no-acl 2>&1
Pop-Location

if ($LASTEXITCODE -eq 0 -and $n8nDumpResult) {
    $n8nDumpResult | gzip | Set-Content -Path $n8nDumpFile -Encoding Byte
    Write-Host "  n8n backup saved: $n8nDumpFile"
    $Manifest.files += $n8nDumpFile
} else {
    Write-Host "  WARNING: n8n database backup failed." -ForegroundColor Red
}

# =============================================================================
# 2. Backup Docker Volumes
# =============================================================================
Write-Host "[2/4] Backing up Docker volumes..." -ForegroundColor Yellow

$volumes = @('postgres_data', 'redis_data', 'qdrant_data', 'n8n_data', 'waha_data')

foreach ($vol in $volumes) {
    $tarFile = Join-Path $BackupPath "${vol}_${Timestamp}.tar.gz"
    Write-Host "  Backing up volume: $vol"

    $container = docker compose ps -q $vol 2>$null
    if (-not $container) {
        Write-Host "    Volume $vol not mounted by a running container, attempting direct backup..."
        $sourcePath = "/var/lib/docker/volumes/whatsapp-sales-assistant_${vol}/_data"
        $tempContainer = "backup-temp-${vol}"

        docker run --rm --name $tempContainer `
            -v "whatsapp-sales-assistant_${vol}:${sourcePath}" `
            alpine:3.19 sh -c "tar czf /tmp/volume_backup.tar.gz -C $sourcePath ." 2>&1 | Out-Null

        docker cp "${tempContainer}:/tmp/volume_backup.tar.gz" $tarFile 2>&1 | Out-Null
    } else {
        Push-Location $RepoRoot
        docker compose exec -T $vol tar czf /tmp/volume_backup.tar.gz -C / 2>&1 | Out-Null
        $containerId = docker compose ps -q $vol
        docker cp "${containerId}:/tmp/volume_backup.tar.gz" $tarFile 2>&1 | Out-Null
        Pop-Location
    }

    if (Test-Path $tarFile) {
        Write-Host "    Saved: $tarFile"
        $Manifest.volumes += $tarFile
    } else {
        Write-Host "    WARNING: Failed to backup volume $vol" -ForegroundColor Red
    }
}

# =============================================================================
# 3. Backup .env File
# =============================================================================
Write-Host "[3/4] Backing up .env file..." -ForegroundColor Yellow

$envBackup = Join-Path $BackupPath ".env_${Timestamp}"
$envFile = Join-Path $RepoRoot '.env'
if (Test-Path $envFile) {
    Copy-Item $envFile $envBackup
    Write-Host "  .env backup saved: $envBackup"
    $Manifest.files += $envBackup
} else {
    Write-Host "  WARNING: .env file not found." -ForegroundColor Red
}

# =============================================================================
# 4. Generate Manifest
# =============================================================================
Write-Host "[4/4] Generating backup manifest..." -ForegroundColor Yellow

$manifestJson = $Manifest | ConvertTo-Json -Depth 3
Set-Content -Path (Join-Path $BackupPath "manifest.json") -Value $manifestJson
Write-Host "  Manifest: $(Join-Path $BackupPath 'manifest.json')"

# =============================================================================
# 5. Retention Policy
# =============================================================================
Write-Host "Applying retention policy ($($env:BACKUP_RETENTION_DAYS) days)..." -ForegroundColor Yellow

$retentionDays = [int]$env:BACKUP_RETENTION_DAYS
if ($retentionDays -le 0) { $retentionDays = 7 }

$cutoff = (Get-Date).AddDays(-$retentionDays)
$oldBackups = Get-ChildItem $BackupDir -Directory | Where-Object { $_.LastWriteTime -lt $cutoff }

foreach ($old in $oldBackups) {
    Write-Host "  Removing old backup: $($old.FullName)"
    Remove-Item $old.FullName -Recurse -Force
}

# =============================================================================
# Summary
# =============================================================================
Write-Host ""
Write-Host "Backup completed: $BackupId" -ForegroundColor Green
Write-Host "Location: $BackupPath"
Write-Host "Files:   $($Manifest.files.Count)"
Write-Host "Volumes: $($Manifest.volumes.Count)"
