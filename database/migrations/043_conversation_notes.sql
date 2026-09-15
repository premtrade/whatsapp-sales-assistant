-- ==========================================================
-- Conversation Notes for internal staff collaboration
-- ==========================================================

SET search_path TO public;

CREATE TABLE IF NOT EXISTS conversation_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    staff_id UUID NOT NULL REFERENCES staff_users(id),
    note TEXT NOT NULL,
    is_internal BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversation_notes_conversation
ON conversation_notes(conversation_id);

CREATE INDEX IF NOT EXISTS idx_conversation_notes_staff
ON conversation_notes(staff_id);

DROP TRIGGER IF EXISTS trg_conversation_notes_updated ON conversation_notes;

CREATE TRIGGER trg_conversation_notes_updated
BEFORE UPDATE
ON conversation_notes
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- ==========================================================
-- Quick Replies for staff efficiency
-- ==========================================================

CREATE TABLE IF NOT EXISTS quick_replies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(100) NOT NULL,
    text TEXT NOT NULL,
    category VARCHAR(50),
    created_by UUID NOT NULL REFERENCES staff_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quick_replies_category
ON quick_replies(category);

-- Unique title required by the ON CONFLICT (title) dedupe below
CREATE UNIQUE INDEX IF NOT EXISTS uq_quick_replies_title
ON quick_replies(title);

DROP TRIGGER IF EXISTS trg_quick_replies_updated ON quick_replies;

CREATE TRIGGER trg_quick_replies_updated
BEFORE UPDATE
ON quick_replies
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- Seed default quick replies. created_by is resolved to the seeded admin
-- account (the zero-UUID placeholder would violate the staff FK).
INSERT INTO quick_replies (title, text, category, created_by)
SELECT t.title, t.text, t.category,
       COALESCE(
         (SELECT id FROM staff_users ORDER BY created_at LIMIT 1),
         '00000000-0000-0000-0000-000000000000'::uuid
       )
FROM (VALUES
  ('Schedule Site Visit', 'I can help schedule a site visit. Please provide your preferred date and time, and the project location.', 'appointments'),
  ('Request Quote', 'I can prepare a quote for you. Please describe the work needed and any specific requirements.', 'quotes'),
  ('Request More Info', 'Thank you for your inquiry. Could you please provide more details about your project so I can assist you better?', 'general'),
  ('Escalate to Manager', 'I will connect you with a Garco representative who can provide further assistance.', 'handoff'),
  ('Payment Terms', 'Payment terms will be confirmed by a Garco representative before work begins.', 'policy'),
  ('Business Hours', 'I don''t have confirmed opening hours. I can connect you with someone who can confirm them.', 'policy')
) AS t(title, text, category)
ON CONFLICT (title) DO NOTHING;
