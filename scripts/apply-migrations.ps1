<#
.SYNOPSIS
    Applies every *.sql file in database/migrations/ (in filename order)
    against the whatsapp_sales database of the running postgres service.

.DESCRIPTION
    Use this to upgrade an already-booted stack. On first boot, docker
    applies the initdb scripts mounted to /docker-entrypoint-initdb.d
    (which include 000-021 schema + 022_sales_state now). This script is
    only needed for migrations added after first boot.

    Usage:
        .\scripts\apply-migrations.ps1
        .\scripts\apply-migrations.ps1 -Database mydb -PostgresUser myuser

    Requires the stack to be running (docker compose up -d).
#>
param(
    [string] $Database,
    [string] $PostgresUser,
    [string] $MigrationsDir
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

if (-not $Database)      { $Database      = $env:POSTGRES_DB }
if (-not $PostgresUser)  { $PostgresUser  = $env:POSTGRES_USER }
if (-not $MigrationsDir) { $MigrationsDir = Join-Path $RepoRoot 'database\migrations' }

if (-not $Database)      { $Database      = 'whatsapp_sales' }
if (-not $PostgresUser)   { $PostgresUser  = 'postgres' }

if (-not (Test-Path $MigrationsDir)) {
    Write-Error "Migrations directory not found: $MigrationsDir"
    exit 1
}

$Files = Get-ChildItem -Path $MigrationsDir -Filter '*.sql' | Sort-Object Name
if (-not $Files) {
    Write-Host "No migration files found in $MigrationsDir."
    exit 0
}

Write-Host "Applying $($Files.Count) migration(s) to database '$Database' as user '$PostgresUser'..."
foreach ($f in $Files) {
    Write-Host "  -> $($f.Name)"
    $Content = Get-Content -Path $f.FullName -Raw
    $Content | docker compose exec -T postgres psql -U $PostgresUser -d $Database -v ON_ERROR_STOP=1 -X -q
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Migration FAILED: $($f.Name)"
        exit $LASTEXITCODE
    }
}
Write-Host "All migrations applied successfully." -ForegroundColor Green
