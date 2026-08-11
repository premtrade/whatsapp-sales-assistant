# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial project structure created with the following directory layout:
  - `docker/` with subdirectories for `compose`, `traefik`, `postgres`, `redis`, `qdrant`, `n8n`, `flowise`, `waha`, and `pgadmin`
  - `database/` with subdirectories for `migrations`, `seed`, and `schema`
  - `workflows/` for n8n workflow definitions
  - `flowise/` for Flowise configurations
  - `frontend/` for the frontend application
  - `backend/` for the backend API services
  - `scripts/` for utility scripts
  - `docs/` for documentation
  - `assets/` for static assets
  - `tests/` for test suites
  - `backups/` for database and configuration backups
  - `.github/` for GitHub workflows and templates
- `README.md` with project overview and setup instructions
- `.env.example` with environment variable templates
- `.gitignore` with common ignore patterns
- `docker-compose.yml` (project root) with service definitions for PostgreSQL, Redis, Qdrant, Flowise, n8n, WAHA, and pgAdmin
- WAHA authentication environment variables (`WAHA_USERNAME`, `WAHA_PASSWORD`, `WAHA_API_KEY`) wired into the compose file
- `database/schema/000_extensions.sql` enabling PostgreSQL extensions: `uuid-ossp`, `pgcrypto`, `pg_trgm`, `citext`, `btree_gist`
- `database/schema/001_functions.sql` with `update_timestamp()` trigger function
- `database/schema/002_contacts.sql` with `contacts` table (15 columns, 8 indexes, 2 check constraints, 1 trigger)
- `database/schema/003_conversations.sql` with `conversations` table (10 columns, 5 indexes, 2 check constraints, 1 foreign key, 1 trigger)
- `database/schema/004_messages.sql` with `messages` table (16 columns, 7 indexes, 3 check constraints, 1 foreign key, 1 trigger)
- `database/schema/005_products.sql` with `products` table (14 columns, 5 indexes, 1 check constraint, 1 unique constraint, 1 trigger)
- `database/schema/006_quotes.sql` with `quotes` table (15 columns, 4 indexes, 1 check constraint, 2 foreign keys, 1 trigger)
- `database/schema/007_quote_items.sql` with `quote_items` table (13 columns, 4 indexes, 2 foreign keys, 1 trigger)
- `database/schema/008_appointments.sql` with `appointments` table (17 columns, 5 indexes, 2 check constraints, 3 foreign keys, 1 trigger)
- `database/schema/009_knowledge_documents.sql` with `knowledge_documents` table (13 columns, 5 indexes, 2 check constraints, 1 trigger)
- `database/schema/010_knowledge_chunks.sql` with `knowledge_chunks` table (10 columns, 5 indexes, 1 foreign key, 1 trigger)
- `database/schema/011_staff_users.sql` with `staff_users` table (13 columns, 4 indexes, 2 unique constraints, 2 check constraints, 1 trigger)
- `database/schema/012_handoffs.sql` with `handoffs` table (12 columns, 5 indexes, 2 check constraints, 1 foreign key, 1 trigger)
- `database/schema/013_settings.sql` with `settings` table (8 columns, 2 indexes, 1 check constraint, 1 unique constraint, 1 trigger)
- `database/schema/014_audit_logs.sql` with `audit_logs` table (12 columns, 5 indexes, 1 check constraint, immutable audit trail)
- `database/schema/016_views.sql` with 6 application views (vw_customer_profile, vw_active_conversations, vw_quote_summary, vw_appointment_schedule, vw_ai_knowledge, vw_dashboard_metrics)
- `database/schema/017_seed_data.sql` with demo seed data (1 contact, 1 product, 1 staff user, 3 settings)
- `database/schema/018_validation.sql` with database health checks (extensions, tables, views, foreign keys, triggers, functions, row counts, dashboard metrics)
- `database/schema/015b_fix_foreign_keys.sql` adding 4 missing staff foreign keys (appointments.assigned_to, quotes.created_by, handoffs.assigned_to, audit_logs.performed_by → staff_users.id)
- `workflows/01_Incoming_WhatsApp_Message.json` extended with "Update Conversation" Postgres node that sets `last_message_at` and `updated_at` on the conversations table after each incoming message
- `workflows/01_Incoming_WhatsApp_Message.json` extended with "Insert Audit Log" Postgres node that writes a `message_received` audit trail entry to the `audit_logs` table (entity_type=conversation, metadata includes phone, message, whatsapp_message_id)
- `workflows/01_Incoming_WhatsApp_Message.json` "Respond 200 OK" node response body updated from `{"success": true}` to `{"status": "received"}`
- `workflows/01_Incoming_WhatsApp_Message.json` connections updated so the non-duplicate path flows: Insert Message → Update Conversation → Insert Audit Log → Respond 200 OK
- Sticky notes added for "Update Conversation" and "Audit Log" sections; "Response" sticky note repositioned

### Changed
- Harden Stage 0 baseline: mount `022_sales_state.sql` into the Postgres initdb chain so the conversation sales-state columns/indexes exist on a fresh boot; re-run `018_validation.sql` last (mounted as `99_validation.sql`) so it validates the memory layer and the `022` columns without ordering errors.
- Sanitize `.env.example` (replace live credentials with placeholders; add `WAHA_WEBHOOK_EVENTS`).
- Add `scripts/configure-waha-webhook.ps1` (idempotent WAHA→n8n webhook registration) and `scripts/apply-migrations.ps1` (idempotent upgrade runner); wire webhook registration into `scripts/setup.ps1` and drop hardcoded password hints.
- Remove stray 0-byte root files (`-Uri`, `Invoke-RestMethod`, `X-Api-Key`, `}`).

### Fixed
- Qdrant health check updated to use a bash TCP check (`/dev/tcp`) instead of `wget`, since the Qdrant container image does not include `wget` or `curl`
- Flowise now uses a separate database (`flowise`) instead of sharing `whatsapp_sales` with n8n, resolving migration conflicts where the `LinkWorkspaceId` migration failed because n8n's `user` table schema differs from Flowise's
- Added `docker/postgres/init-multiple-dbs.sql` to automatically create the `flowise` and `whatsapp_sales` databases on PostgreSQL startup
- Added `FLOWISE_JWT_SECRET` environment variable to resolve "Auth secrets not initialized" error
- Added `FLOWISE_USERNAME`, `FLOWISE_PASSWORD`, and `JWT_SECRET` to the Flowise service in `docker-compose.yml`
- n8n now uses its own separate database (`n8n`) instead of sharing `whatsapp_sales`, with `N8N_DB=n8n` added to env files and `docker-compose.yml`
