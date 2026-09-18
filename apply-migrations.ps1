# =============================================================================
# Apply Migrations Script with Tracking
# =============================================================================
# This script applies database migrations in order, skipping already applied ones.
# It uses the migration tracking functions created in migration 000.

# Change to the script's directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $scriptDir

# Load environment variables if .env file exists
if (Test-Path ".env") {
    Get-Content .env | ForEach-Object {
        if ($_ -match '^([^=]+)=(.*)$') {
            Set-Item -Path "Env:$($1)" -Value $2
        }
    }
}

# Database connection parameters from environment
$dbHost = $Env:POSTGRES_HOST ?: 'localhost'
$dbPort = $Env:POSTGRES_PORT ?: 5432
$dbName = $Env:POSTGRES_DB ?: 'postgres'
$dbUser = $Env:POSTGRES_USER ?: 'postgres'
$dbPassword = $Env:POSTGRES_PASSWORD ?: 'postgres'

# Construct connection string
$connectionString = "Host=$dbHost;Port=$dbPort;Username=$dbUser;Password=$dbPassword;Database=$dbName"

# Function to execute SQL against PostgreSQL
function Execute-Sql {
    param(
        [Parameter(Mandatory=$true)][string]$Sql,
        [string]$MigrationName = $null
    )
    
    try {
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        $result = psql "$connectionString" -c "$Sql" -t -A
        $sw.Stop()
        
        if ($MigrationName) {
            $executionTimeMs = $sw.ElapsedMilliseconds
            # Record migration as applied
            $recordSql = "SELECT record_migration_applied('$MigrationName', NULL, $executionTimeMs)"
            psql "$connectionString" -c "$recordSql" -t -A > $null
            Write-Host "Applied migration: $MigrationName ($executionTimeMs ms)"
        }
        
        return $result
    } catch {
        Write-Error "Failed to execute SQL: $($_.Exception.Message)"
        exit 1
    }
}

# Function to get list of migration files
function Get-MigrationFiles {
    $migrationDir = Join-Path $scriptDir "database/migrations"
    if (!(Test-Path $migrationDir)) {
        Write-Error "Migration directory not found: $migrationDir"
        exit 1
    }
    
    Get-ChildItem -Path $migrationDir -Filter "*.sql" | 
        Where-Object { $_.Name -match '^\d{3,}_.+\.sql$' } |
        Sort-Object Name |
        Select-Object -ExpandProperty Name
}

# Main script execution
Write-Host "Starting migration process..."

# Ensure migration tracking table exists
Write-Host "Checking migration tracking table..."
Execute-Sql -Sql "CREATE EXTENSION IF NOT EXISTS plpgsql;" -MigrationName "000_create_migration_tracker.sql"

# Get all migration files
$migrationFiles = Get-Migration Files = Get-MigrationFiles
if (-not $migrationFiles) {
    Write-Error "No migration files found"
    exit 1
}

Write-Host "Found $($migrationFiles.Count) migration files to process"

# Process each migration
foreach ($migrationFile in $migrationFiles) {
    $migrationPath = Join-Path $scriptDir "database/migrations" $migrationFile
    
    # Check if migration has already been applied
    $isApplied = Execute-Sql -Sql "SELECT is_migration_applied('$migrationFile')"
    
    if ($isApplied -eq 't') {
        Write-Host "Skipping already applied migration: $migrationFile"
        continue
    }
    
    Write-Host "Applying migration: $migrationFile"
    
    # Read and execute the migration file
    try {
        $sqlContent = Get-Content -Path $migrationPath -Raw
        Execute-Sql -Sql $sqlContent -MigrationName $migrationFile
    } catch {
        Write-Error "Failed to apply migration $migrationFile: $($_.Exception.Message)"
        exit 1
    }
}

Write-Host "Migration process completed successfully!"