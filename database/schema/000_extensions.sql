-- ==========================================================
-- WhatsApp Sales Assistant
-- Sprint 2
-- File: 000_extensions.sql
-- ==========================================================

SET search_path TO public;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS vector;