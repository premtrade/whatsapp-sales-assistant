-- ==========================================================
-- Lead Scoring Model for Garco Construction
-- File: 035_lead_scoring.sql
-- Description: Adds lead scoring capabilities to prioritize
--              high-value construction leads
-- ==========================================================

SET search_path TO public;

-- ==========================================================
-- TABLE: lead_scores
-- ==========================================================

CREATE TABLE IF NOT EXISTS lead_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    
    -- Scoring components (0-100 each)
    budget_score INTEGER NOT NULL DEFAULT 0 CHECK (budget_score >= 0 AND budget_score <= 100),
    urgency_score INTEGER NOT NULL DEFAULT 0 CHECK (urgency_score >= 0 AND urgency_score <= 100),
    project_type_score INTEGER NOT NULL DEFAULT 0 CHECK (project_type_score >= 0 AND project_type_score <= 100),
    location_score INTEGER NOT NULL DEFAULT 0 CHECK (location_score >= 0 AND location_score <= 100),
    engagement_score INTEGER NOT NULL DEFAULT 0 CHECK (engagement_score >= 0 AND engagement_score <= 100),
    
    -- Composite score (weighted average)
    total_score INTEGER NOT NULL DEFAULT 0 CHECK (total_score >= 0 AND total_score <= 100),
    
    -- Lead qualification status
    status VARCHAR(20) NOT NULL DEFAULT 'new'
        CHECK (status IN ('new', 'qualified', 'unqualified', 'converted', 'lost')),
    
    -- Project details extracted during conversation
    project_type VARCHAR(100),
    estimated_budget VARCHAR(50),
    preferred_timeline VARCHAR(50),
    project_location VARCHAR(255),
    
    -- Scoring metadata
    score_reasoning JSONB DEFAULT '{}'::jsonb,
    last_calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(contact_id, conversation_id)
);

-- ==========================================================
-- COMMENTS
-- ==========================================================

COMMENT ON TABLE lead_scores IS
'Lead scoring records for prioritizing construction leads based on multiple criteria.';

COMMENT ON COLUMN lead_scores.budget_score IS
'Score based on budget fit (0-100). Higher = better budget match.';

COMMENT ON COLUMN lead_scores.urgency_score IS
'Score based on project urgency (0-100). Higher = more urgent.';

COMMENT ON COLUMN lead_scores.project_type_score IS
'Score based on project type alignment with Garco services (0-100).';

COMMENT ON COLUMN lead_scores.location_score IS
'Score based on project location proximity to Garco service area (0-100).';

COMMENT ON COLUMN lead_scores.engagement_score IS
'Score based on customer engagement level (0-100). Higher = more engaged.';

COMMENT ON COLUMN lead_scores.total_score IS
'Weighted composite score (0-100) used for lead prioritization.';

-- ==========================================================
-- INDEXES
-- ==========================================================

CREATE INDEX IF NOT EXISTS idx_lead_scores_contact_id ON lead_scores(contact_id);
CREATE INDEX IF NOT EXISTS idx_lead_scores_conversation_id ON lead_scores(conversation_id);
CREATE INDEX IF NOT EXISTS idx_lead_scores_total_score ON lead_scores(total_score DESC);
CREATE INDEX IF NOT EXISTS idx_lead_scores_status ON lead_scores(status);
CREATE INDEX IF NOT EXISTS idx_lead_scores_project_type ON lead_scores(project_type);
CREATE INDEX IF NOT EXISTS idx_lead_scores_created_at ON lead_scores(created_at DESC);

-- ==========================================================
-- TRIGGER
-- ==========================================================

DROP TRIGGER IF EXISTS trg_lead_scores_updated ON lead_scores;

CREATE TRIGGER trg_lead_scores_updated
BEFORE UPDATE
ON lead_scores
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- ==========================================================
-- TABLE: lead_score_history
-- ==========================================================

CREATE TABLE IF NOT EXISTS lead_score_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_score_id UUID NOT NULL REFERENCES lead_scores(id) ON DELETE CASCADE,
    previous_total_score INTEGER,
    new_total_score INTEGER,
    change_reason VARCHAR(255),
    changed_by VARCHAR(50) DEFAULT 'system',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE lead_score_history IS
'Audit trail for lead score changes over time.';

CREATE INDEX IF NOT EXISTS idx_lead_score_history_lead_id ON lead_score_history(lead_score_id);
CREATE INDEX IF NOT EXISTS idx_lead_score_history_created_at ON lead_score_history(created_at DESC);

-- ==========================================================
-- FUNCTION: Calculate lead score
-- ==========================================================

CREATE OR REPLACE FUNCTION calculate_lead_score(
    p_budget_score INTEGER,
    p_urgency_score INTEGER,
    p_project_type_score INTEGER,
    p_location_score INTEGER,
    p_engagement_score INTEGER
) RETURNS INTEGER AS $$
DECLARE
    v_total INTEGER;
BEGIN
    -- Weighted calculation:
    -- Budget: 25%, Urgency: 20%, Project Type: 25%, Location: 15%, Engagement: 15%
    v_total := ROUND(
        (p_budget_score * 0.25) +
        (p_urgency_score * 0.20) +
        (p_project_type_score * 0.25) +
        (p_location_score * 0.15) +
        (p_engagement_score * 0.15)
    );
    
    RETURN LEAST(100, GREATEST(0, v_total));
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_lead_score IS
'Calculates weighted composite lead score from individual components.';

-- ==========================================================
-- FUNCTION: Auto-update total_score on insert/update
-- ==========================================================

CREATE OR REPLACE FUNCTION trigger_calculate_lead_score()
RETURNS TRIGGER AS $$
BEGIN
    NEW.total_score := calculate_lead_score(
        NEW.budget_score,
        NEW.urgency_score,
        NEW.project_type_score,
        NEW.location_score,
        NEW.engagement_score
    );
    NEW.last_calculated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_calculate_lead_score ON lead_scores;

CREATE TRIGGER trg_calculate_lead_score
BEFORE INSERT OR UPDATE OF budget_score, urgency_score, project_type_score, location_score, engagement_score
ON lead_scores
FOR EACH ROW
EXECUTE FUNCTION trigger_calculate_lead_score();

-- ==========================================================
-- FUNCTION: Log score changes
-- ==========================================================

CREATE OR REPLACE FUNCTION trigger_log_lead_score_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.total_score IS DISTINCT FROM NEW.total_score THEN
        INSERT INTO lead_score_history (lead_score_id, previous_total_score, new_total_score, change_reason)
        VALUES (NEW.id, OLD.total_score, NEW.total_score, 'Score recalculated');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_log_lead_score_change ON lead_scores;

CREATE TRIGGER trg_log_lead_score_change
AFTER UPDATE OF total_score
ON lead_scores
FOR EACH ROW
EXECUTE FUNCTION trigger_log_lead_score_change();

-- ==========================================================
-- VIEW: Lead pipeline summary
-- ==========================================================

CREATE OR REPLACE VIEW v_lead_pipeline AS
SELECT 
    ls.id,
    ls.contact_id,
    c.display_name AS contact_name,
    c.phone AS contact_phone,
    c.email AS contact_email,
    ls.conversation_id,
    ls.total_score,
    ls.status,
    ls.project_type,
    ls.estimated_budget,
    ls.preferred_timeline,
    ls.project_location,
    ls.budget_score,
    ls.urgency_score,
    ls.project_type_score,
    ls.location_score,
    ls.engagement_score,
    ls.last_calculated_at,
    ls.created_at,
    ls.updated_at
FROM lead_scores ls
JOIN contacts c ON ls.contact_id = c.id
ORDER BY ls.total_score DESC, ls.created_at DESC;

COMMENT ON VIEW v_lead_pipeline IS
'Consolidated view of lead scores with contact information for pipeline management.';
