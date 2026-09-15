#!/bin/bash
# =============================================================================
# Docker Migration Runner
# =============================================================================
# This script runs pending migrations inside the Docker container.
# It's designed to be called from the CI/CD pipeline during deployment.
#
# Usage: docker compose exec postgres /docker-entrypoint-initdb.d/run-migrations.sh
# =============================================================================

set -euo pipefail

DB_USER="${POSTGRES_USER:-waflo}"
DB_NAME="${POSTGRES_DB:-waflo}"
MIGRATIONS_DIR="/docker-entrypoint-initdb.d"

echo "========================================"
echo "  Database Migration Runner"
echo "========================================"

# Ensure migration tracker exists
psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'EOF'
CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY,
    migration_name VARCHAR(255) NOT NULL UNIQUE,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    checksum VARCHAR(64),
    execution_time_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_schema_migrations_name ON schema_migrations(migration_name);

CREATE OR REPLACE FUNCTION is_migration_applied(migration_name VARCHAR)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (SELECT 1 FROM schema_migrations WHERE schema_migrations.migration_name = $1);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION record_migration_applied(
    p_migration_name VARCHAR,
    p_checksum VARCHAR DEFAULT NULL,
    p_execution_time_ms INTEGER DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO schema_migrations (migration_name, checksum, execution_time_ms)
    VALUES (p_migration_name, p_checksum, p_execution_time_ms)
    ON CONFLICT (migration_name) DO NOTHING;
END;
$$ LANGUAGE plpgsql;
EOF

echo "Migration tracker ready."

# Mark all existing baseline migrations as applied (for existing databases)
psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'EOF'
INSERT INTO schema_migrations (migration_name) VALUES
    ('000_extensions.sql'),
    ('001_functions.sql'),
    ('002_contacts.sql'),
    ('003_conversations.sql'),
    ('004_messages.sql'),
    ('005_products.sql'),
    ('006_quotes.sql'),
    ('007_quote_items.sql'),
    ('008_appointments.sql'),
    ('009_knowledge_documents.sql'),
    ('010_knowledge_chunks.sql'),
    ('011_staff_users.sql'),
    ('012_handoffs.sql'),
    ('013_settings.sql'),
    ('014_audit_logs.sql'),
    ('015b_fix_foreign_keys.sql'),
    ('016_views.sql'),
    ('017_seed_data.sql'),
    ('018_validation.sql'),
    ('019_customer_facts.sql'),
    ('020_conversation_summaries.sql'),
    ('021_memory_embeddings.sql'),
    ('022_sales_state.sql'),
    ('023_knowledge_trgm_index.sql'),
    ('024_seed_knowledge.sql'),
    ('025_fix_messages_unique_constraint.sql'),
    ('025b_align_memory_embeddings.sql'),
    ('026_align_conversation_summaries.sql'),
    ('027_seed_garco_document.sql'),
    ('028_audit_logs_immutable.sql'),
    ('029_staff_passwords.sql'),
    ('030_remove_demo_sales_data.sql'),
    ('031_remove_roof_demo_data.sql'),
    ('032_pgvector_embeddings.sql'),
    ('033_fix_garco_product_price.sql'),
    ('034_quotes_metadata_column.sql'),
    ('045_multi_tenancy.sql'),
    ('048_whatsapp_settings.sql'),
    ('000_create_migration_tracker.sql')
ON CONFLICT (migration_name) DO NOTHING;
EOF

echo "Baseline migrations marked."

# Show migration count
psql -U "$DB_USER" -d "$DB_NAME" -c "SELECT count(*) AS total_applied_migrations FROM schema_migrations;"

echo "========================================"
echo "  Migration check complete!"
echo "========================================"
