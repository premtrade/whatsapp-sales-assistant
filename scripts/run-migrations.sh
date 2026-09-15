#!/bin/bash
# =============================================================================
# Database Migration Runner
# =============================================================================
# This script runs all pending migrations in order, tracking which have been
# applied in the schema_migrations table.
#
# Usage: ./scripts/run-migrations.sh
# =============================================================================

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
MIGRATIONS_DIR="$PROJECT_ROOT/database/migrations"
SCHEMA_DIR="$PROJECT_ROOT/database/schema"

# Database connection settings (can be overridden via environment variables)
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_USER="${POSTGRES_USER:-waflo}"
DB_NAME="${POSTGRES_DB:-waflo}"
DB_PASSWORD="${POSTGRES_PASSWORD:-}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to run psql command
run_psql() {
    local query="$1"
    if [ -n "$DB_PASSWORD" ]; then
        PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -c "$query"
    else
        psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -c "$query"
    fi
}

# Function to run psql file
run_psql_file() {
    local file="$1"
    if [ -n "$DB_PASSWORD" ]; then
        PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$file"
    else
        psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$file"
    fi
}

# Function to check if migration has been applied
is_migration_applied() {
    local migration_name="$1"
    local result
    result=$(run_psql "SELECT is_migration_applied('$migration_name');")
    echo "$result" | grep -q "t"
}

# Function to record migration as applied
record_migration() {
    local migration_name="$1"
    local execution_time="$2"
    run_psql "SELECT record_migration_applied('$migration_name', NULL, $execution_time);"
}

# Function to ensure migration tracker exists
ensure_migration_tracker() {
    log_info "Ensuring migration tracker exists..."
    
    run_psql "
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id SERIAL PRIMARY KEY,
            migration_name VARCHAR(255) NOT NULL UNIQUE,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            checksum VARCHAR(64),
            execution_time_ms INTEGER
        );
        
        CREATE OR REPLACE FUNCTION is_migration_applied(migration_name VARCHAR)
        RETURNS BOOLEAN AS \$\$
        BEGIN
            RETURN EXISTS (SELECT 1 FROM schema_migrations WHERE schema_migrations.migration_name = \$1);
        END;
        \$\$ LANGUAGE plpgsql;
        
        CREATE OR REPLACE FUNCTION record_migration_applied(
            p_migration_name VARCHAR,
            p_checksum VARCHAR DEFAULT NULL,
            p_execution_time_ms INTEGER DEFAULT NULL
        )
        RETURNS VOID AS \$\$
        BEGIN
            INSERT INTO schema_migrations (migration_name, checksum, execution_time_ms)
            VALUES (p_migration_name, p_checksum, p_execution_time_ms)
            ON CONFLICT (migration_name) DO NOTHING;
        END;
        \$\$ LANGUAGE plpgsql;
    "
}

# Function to run a single migration
run_migration() {
    local file="$1"
    local filename
    filename=$(basename "$file")
    
    if is_migration_applied "$filename"; then
        log_info "Skipping $filename (already applied)"
        return 0
    fi
    
    log_info "Applying migration: $filename"
    local start_time
    start_time=$(date +%s%3N)
    
    if run_psql_file "$file"; then
        local end_time
        end_time=$(date +%s%3N)
        local execution_time=$((end_time - start_time))
        record_migration "$filename" "$execution_time"
        log_info "Successfully applied $filename (${execution_time}ms)"
    else
        log_error "Failed to apply $filename"
        return 1
    fi
}

# Main execution
main() {
    echo "========================================"
    echo "  Database Migration Runner"
    echo "========================================"
    echo ""
    
    # Ensure migration tracker exists
    ensure_migration_tracker
    
    # Collect all migration files (schema + migrations)
    local all_migrations=()
    
    # Add schema files first (numbered 000-099)
    for file in "$SCHEMA_DIR"/*.sql; do
        [ -f "$file" ] && all_migrations+=("$file")
    done
    
    # Add migration files (numbered 100+)
    for file in "$MIGRATIONS_DIR"/*.sql; do
        [ -f "$file" ] && all_migrations+=("$file")
    done
    
    # Sort migrations by filename
    IFS=$'\n' all_migrations=($(sort <<<"${all_migrations[*]}")); unset IFS
    
    local total=${#all_migrations[@]}
    local applied=0
    local skipped=0
    
    log_info "Found $total migration files"
    echo ""
    
    for migration_file in "${all_migrations[@]}"; do
        if run_migration "$migration_file"; then
            if is_migration_applied "$(basename "$migration_file")"; then
                ((applied++))
            else
                ((skipped++))
            fi
        else
            log_error "Migration failed. Stopping."
            exit 1
        fi
    done
    
    echo ""
    echo "========================================"
    log_info "Migration complete!"
    echo "  Total: $total"
    echo "  Applied: $applied"
    echo "  Skipped: $skipped"
    echo "========================================"
}

# Run main function
main "$@"
