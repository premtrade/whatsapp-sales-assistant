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

DROP TRIGGER IF EXISTS trg_quick_replies_updated ON quick_replies;

CREATE TRIGGER trg_quick_replies_updated
BEFORE UPDATE
ON quick_replies
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

INSERT INTO quick_replies (title, text, category, created_by) VALUES
  ('Schedule Site Visit', 'I can help schedule a site visit. Please provide your preferred date and time, and the project location.', 'appointments', '00000000-0000-0000-0000-000000000000'),
  ('Request Quote', 'I can prepare a quote for you. Please describe the work needed and any specific requirements.', 'quotes', '00000000-0000-0000-0000-000000000000'),
  ('Request More Info', 'Thank you for your inquiry. Could you please provide more details about your project so I can assist you better?', 'general', '00000000-0000-0000-0000-000000000000'),
  ('Escalate to Manager', 'I will connect you with a Garco representative who can provide further assistance.', 'handoff', '00000000-0000-0000-0000-000000000000'),
  ('Payment Terms', 'Payment terms will be confirmed by a Garco representative before work begins.', 'policy', '00000000-0000-0000-0000-000000000000'),
  ('Business Hours', 'I don''t have confirmed opening hours. I can connect you with someone who can confirm them.', 'policy', '00000000-0000-0000-0000-000000000000')
ON CONFLICT (title) DO NOTHING;
