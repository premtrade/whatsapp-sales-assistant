-- ==========================================================
-- Migration 062: Update Plan Limits and Transparency
-- Purpose: Replace "unlimited" (-1) limits with finite, enforceable caps
--          and add clarity about third-party WhatsApp charges
-- 
-- This migration updates the Business plan to use finite AI response
-- limits (10,000/month) instead of -1 (unlimited). This provides:
-- 1. Safe, deliberate enforcement of usage limits
-- 2. Clear expectations for customers
-- 3. Ability to notify users when approaching limits
--
-- IMPORTANT: WhatsApp/Meta charges for messages are NOT included
-- in subscription fees. These are passed through or billed separately.
-- ==========================================================

SET search_path TO public;

-- Update Business plan to finite limits instead of -1 (unlimited)
UPDATE plans
SET 
    limits = '{"ai_responses": 10000, "staff_users": 10, "locations": 10, "whatsapp_numbers": 5}'::jsonb,
    metadata = metadata || '{"limit_note": "AI responses capped at 10000/month. WhatsApp charges are passed through."}'::jsonb,
    updated_at = NOW()
WHERE slug = 'business';

-- Add metadata to Professional plan about limits
UPDATE plans
SET 
    metadata = metadata || '{"limit_note": "2000 AI responses/month included"}'::jsonb,
    updated_at = NOW()
WHERE slug = 'professional';

-- Add metadata to Starter plan about its exclusions
UPDATE plans
SET 
    metadata = metadata || '{"limit_note": "PDF quotes and appointments not available on Starter plan"}'::jsonb,
    updated_at = NOW()
WHERE slug = 'starter';

-- Update feature flags for Starter plan - remove unavailable features
UPDATE plans
SET 
    features = features || '{"pdf_quotes": false, "appointments": false}'::jsonb,
    updated_at = NOW()
WHERE slug = 'starter';

-- Log the migration completion (use the schema_migrations table used by the project's migration tracker)
INSERT INTO schema_migrations (migration_name)
VALUES ('062_plan_limits_update')
ON CONFLICT (migration_name) DO NOTHING;