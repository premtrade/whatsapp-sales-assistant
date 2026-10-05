BEGIN;

ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS lead_stage VARCHAR(30) NOT NULL DEFAULT 'new';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'conversations_lead_stage_check'
          AND conrelid = 'public.conversations'::regclass
    ) THEN
        ALTER TABLE public.conversations
        ADD CONSTRAINT conversations_lead_stage_check
        CHECK (lead_stage IN (
            'new',
            'qualifying',
            'qualified',
            'product_interest',
            'quote_requested',
            'quote_sent',
            'negotiating',
            'appointment_requested',
            'won',
            'lost'
        ));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_conversations_lead_stage
ON public.conversations (lead_stage);

INSERT INTO public.schema_migrations (migration_name)
VALUES ('065_repair_conversation_lead_stage.sql')
ON CONFLICT (migration_name) DO NOTHING;

COMMIT;