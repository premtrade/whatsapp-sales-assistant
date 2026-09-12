-- ==========================================================
-- Service Category Routing & Project Complexity
-- File: 039_service_routing.sql
-- Description: Adds service routing and complexity assessment
-- ==========================================================

SET search_path TO public;

-- ==========================================================
-- TABLE: service_categories
-- ==========================================================

CREATE TABLE IF NOT EXISTS service_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    display_name VARCHAR(255) NOT NULL,
    description TEXT,
    default_assignee UUID REFERENCES staff_users(id) ON DELETE SET NULL,
    backup_assignee UUID REFERENCES staff_users(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    priority INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE service_categories IS
'Service categories for routing conversations to appropriate staff.';

CREATE INDEX IF NOT EXISTS idx_service_categories_name ON service_categories(name);
CREATE INDEX IF NOT EXISTS idx_service_categories_is_active ON service_categories(is_active);

DROP TRIGGER IF EXISTS trg_service_categories_updated ON service_categories;
CREATE TRIGGER trg_service_categories_updated
BEFORE UPDATE ON service_categories
FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- ==========================================================
-- TABLE: project_complexity_assessments
-- ==========================================================

CREATE TABLE IF NOT EXISTS project_complexity_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    scope_score INTEGER NOT NULL DEFAULT 0 CHECK (scope_score >= 0 AND scope_score <= 100),
    technical_score INTEGER NOT NULL DEFAULT 0 CHECK (technical_score >= 0 AND technical_score <= 100),
    permit_score INTEGER NOT NULL DEFAULT 0 CHECK (permit_score >= 0 AND permit_score <= 100),
    timeline_score INTEGER NOT NULL DEFAULT 0 CHECK (timeline_score >= 0 AND timeline_score <= 100),
    budget_score INTEGER NOT NULL DEFAULT 0 CHECK (budget_score >= 0 AND budget_score <= 100),
    total_complexity INTEGER NOT NULL DEFAULT 0 CHECK (total_complexity >= 0 AND total_complexity <= 100),
    complexity_level VARCHAR(20) NOT NULL DEFAULT 'simple'
        CHECK (complexity_level IN ('simple', 'moderate', 'complex', 'very_complex')),
    project_type VARCHAR(100),
    estimated_duration_days INTEGER,
    required_trades JSONB DEFAULT '[]'::jsonb,
    required_permits JSONB DEFAULT '[]'::jsonb,
    special_considerations TEXT,
    recommended_action VARCHAR(50) NOT NULL DEFAULT 'ai_handle'
        CHECK (recommended_action IN ('ai_handle', 'human_review', 'specialist_required', 'escalate')),
    assigned_to UUID REFERENCES staff_users(id) ON DELETE SET NULL,
    assessment_reasoning JSONB DEFAULT '{}'::jsonb,
    assessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE project_complexity_assessments IS
'Project complexity assessments for routing and resource planning.';

CREATE INDEX IF NOT EXISTS idx_project_complexity_contact_id ON project_complexity_assessments(contact_id);
CREATE INDEX IF NOT EXISTS idx_project_complexity_conversation_id ON project_complexity_assessments(conversation_id);
CREATE INDEX IF NOT EXISTS idx_project_complexity_level ON project_complexity_assessments(complexity_level);
CREATE INDEX IF NOT EXISTS idx_project_complexity_recommended_action ON project_complexity_assessments(recommended_action);

DROP TRIGGER IF EXISTS trg_project_complexity_updated ON project_complexity_assessments;
CREATE TRIGGER trg_project_complexity_updated
BEFORE UPDATE ON project_complexity_assessments
FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- ==========================================================
-- TABLE: calendar_events
-- ==========================================================

CREATE TABLE IF NOT EXISTS calendar_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id VARCHAR(255),
    calendar_provider VARCHAR(50) NOT NULL DEFAULT 'google'
        CHECK (calendar_provider IN ('google', 'outlook', 'apple', 'manual')),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    location VARCHAR(500),
    event_type VARCHAR(50) NOT NULL DEFAULT 'appointment'
        CHECK (event_type IN ('appointment', 'meeting', 'reminder', 'other')),
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    timezone VARCHAR(50) DEFAULT 'America/Jamaica',
    is_all_day BOOLEAN NOT NULL DEFAULT FALSE,
    appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    assigned_to UUID REFERENCES staff_users(id) ON DELETE SET NULL,
    attendees JSONB DEFAULT '[]'::jsonb,
    status VARCHAR(20) NOT NULL DEFAULT 'confirmed'
        CHECK (status IN ('confirmed', 'tentative', 'cancelled')),
    last_synced_at TIMESTAMPTZ,
    sync_status VARCHAR(20) DEFAULT 'pending'
        CHECK (sync_status IN ('pending', 'synced', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE calendar_events IS
'Calendar events synced with external calendars (Google, Outlook).';

CREATE INDEX IF NOT EXISTS idx_calendar_events_external_id ON calendar_events(external_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_appointment_id ON calendar_events(appointment_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_contact_id ON calendar_events(contact_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_assigned_to ON calendar_events(assigned_to);
CREATE INDEX IF NOT EXISTS idx_calendar_events_starts_at ON calendar_events(starts_at);
CREATE INDEX IF NOT EXISTS idx_calendar_events_event_type ON calendar_events(event_type);

DROP TRIGGER IF EXISTS trg_calendar_events_updated ON calendar_events;
CREATE TRIGGER trg_calendar_events_updated
BEFORE UPDATE ON calendar_events
FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- ==========================================================
-- SEED DATA: Service Categories
-- ==========================================================

INSERT INTO service_categories (name, display_name, description, priority) VALUES
('general_construction', 'General Construction', 'New builds, additions, and major structural work', 10),
('renovation', 'Renovation', 'Home and office renovations, remodeling projects', 9),
('roofing', 'Roofing', 'Roof repairs, replacements, and installations', 8),
('electrical', 'Electrical', 'Electrical installations, repairs, and upgrades', 7),
('plumbing', 'Plumbing', 'Plumbing installations, repairs, and maintenance', 6),
('painting', 'Painting', 'Interior and exterior painting services', 5),
('ac_works', 'A/C Works', 'Air conditioning installation and repair', 4),
('project_management', 'Project Management', 'Full project management and coordination', 3),
('dry_wall', 'Dry Wall Partitions', 'Dry wall and partition installations', 2),
('ceilings', 'Ceilings', 'Suspended and decorative ceiling installations', 1),
('iron_works', 'Grille & Iron Works', 'Metal fabrication and iron work', 0),
('consultation', 'Consultation', 'Initial consultations and assessments', 0)
ON CONFLICT (name) DO NOTHING;

-- ==========================================================
-- FUNCTION: Assess project complexity
-- ==========================================================

CREATE OR REPLACE FUNCTION assess_project_complexity(
    p_project_type VARCHAR,
    p_scope_description TEXT,
    p_estimated_budget VARCHAR,
    p_timeline VARCHAR,
    p_contact_id UUID,
    p_conversation_id UUID
) RETURNS UUID AS $$
DECLARE
    v_assessment_id UUID;
    v_scope_score INTEGER;
    v_technical_score INTEGER;
    v_permit_score INTEGER;
    v_timeline_score INTEGER;
    v_budget_score INTEGER;
    v_total_complexity INTEGER;
    v_complexity_level VARCHAR(20);
    v_recommended_action VARCHAR(50);
    v_required_trades JSONB;
    v_required_permits JSONB;
BEGIN
    v_scope_score := LEAST(100, 
        CASE 
            WHEN p_scope_description IS NULL THEN 10
            WHEN LENGTH(p_scope_description) < 50 THEN 20
            WHEN LENGTH(p_scope_description) < 200 THEN 40
            WHEN LENGTH(p_scope_description) < 500 THEN 60
            ELSE 80
        END +
        CASE WHEN p_scope_description ~* 'multi|several|multiple|whole|entire|complete' THEN 20 ELSE 0 END +
        CASE WHEN p_scope_description ~* 'structural|foundation|load|beam|column' THEN 15 ELSE 0 END
    );
    
    v_technical_score := CASE p_project_type
        WHEN 'General Construction' THEN 80
        WHEN 'Renovation' THEN 60
        WHEN 'Roofing' THEN 50
        WHEN 'Electrical' THEN 70
        WHEN 'Plumbing' THEN 65
        WHEN 'Painting' THEN 20
        WHEN 'A/C Works' THEN 45
        WHEN 'Project Management' THEN 40
        ELSE 30
    END;
    
    v_permit_score := CASE 
        WHEN p_project_type IN ('General Construction', 'Renovation') THEN 80
        WHEN p_project_type IN ('Electrical', 'Plumbing') THEN 60
        WHEN p_project_type = 'Roofing' THEN 40
        ELSE 20
    END;
    
    v_timeline_score := CASE 
        WHEN p_timeline ~* 'urgent|asap|immediately|emergency' THEN 90
        WHEN p_timeline ~* 'week|1 week|2 week' THEN 70
        WHEN p_timeline ~* 'month|1 month|2 month|3 month' THEN 50
        WHEN p_timeline ~* 'flexible|no rush|whenever' THEN 20
        ELSE 40
    END;
    
    v_budget_score := CASE 
        WHEN p_estimated_budget ~* '1000000|million|2 million|3 million' THEN 80
        WHEN p_estimated_budget ~* '500000|750000' THEN 60
        WHEN p_estimated_budget ~* '100000|200000|300000' THEN 40
        ELSE 20
    END;
    
    v_total_complexity := ROUND(
        (v_scope_score * 0.25) +
        (v_technical_score * 0.30) +
        (v_permit_score * 0.15) +
        (v_timeline_score * 0.15) +
        (v_budget_score * 0.15)
    );
    
    v_complexity_level := CASE 
        WHEN v_total_complexity >= 75 THEN 'very_complex'
        WHEN v_total_complexity >= 55 THEN 'complex'
        WHEN v_total_complexity >= 35 THEN 'moderate'
        ELSE 'simple'
    END;
    
    v_recommended_action := CASE 
        WHEN v_total_complexity >= 75 THEN 'escalate'
        WHEN v_total_complexity >= 55 THEN 'specialist_required'
        WHEN v_total_complexity >= 35 THEN 'human_review'
        ELSE 'ai_handle'
    END;
    
    v_required_trades := CASE p_project_type
        WHEN 'General Construction' THEN '["concrete", "steel", "carpentry", "electrical", "plumbing"]'::jsonb
        WHEN 'Renovation' THEN '["carpentry", "electrical", "plumbing", "painting"]'::jsonb
        WHEN 'Roofing' THEN '["roofing", "carpentry"]'::jsonb
        WHEN 'Electrical' THEN '["electrical"]'::jsonb
        WHEN 'Plumbing' THEN '["plumbing"]'::jsonb
        WHEN 'Painting' THEN '["painting"]'::jsonb
        WHEN 'A/C Works' THEN '["hvac", "electrical"]'::jsonb
        ELSE '[]'::jsonb
    END;
    
    v_required_permits := CASE 
        WHEN p_project_type IN ('General Construction', 'Renovation') THEN '["building_permit", "structural_permit"]'::jsonb
        WHEN p_project_type = 'Electrical' THEN '["electrical_permit"]'::jsonb
        WHEN p_project_type = 'Plumbing' THEN '["plumbing_permit"]'::jsonb
        ELSE '[]'::jsonb
    END;
    
    INSERT INTO project_complexity_assessments (
        contact_id, conversation_id, scope_score, technical_score, permit_score,
        timeline_score, budget_score, total_complexity, complexity_level, project_type,
        required_trades, required_permits, recommended_action, assessment_reasoning
    ) VALUES (
        p_contact_id, p_conversation_id, v_scope_score, v_technical_score, v_permit_score,
        v_timeline_score, v_budget_score, v_total_complexity, v_complexity_level, p_project_type,
        v_required_trades, v_required_permits, v_recommended_action,
        jsonb_build_object(
            'scope_factors', CASE WHEN p_scope_description ~* 'multi|several|multiple' THEN 'Multiple areas involved' ELSE 'Single area focus' END,
            'technical_factors', 'Project type: ' || p_project_type,
            'timeline_factors', CASE WHEN p_timeline ~* 'urgent|asap' THEN 'Urgent timeline' ELSE 'Standard timeline' END,
            'budget_factors', CASE WHEN p_estimated_budget ~* 'million' THEN 'High budget project' ELSE 'Standard budget' END
        )
    ) RETURNING id INTO v_assessment_id;
    
    RETURN v_assessment_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION assess_project_complexity IS
'Assesses project complexity based on multiple factors and returns assessment ID.';

-- ==========================================================
-- FUNCTION: Route conversation to appropriate staff
-- ==========================================================

CREATE OR REPLACE FUNCTION route_conversation(
    p_conversation_id UUID,
    p_project_type VARCHAR
) RETURNS UUID AS $$
DECLARE
    v_assignee_id UUID;
BEGIN
    SELECT default_assignee INTO v_assignee_id
    FROM service_categories
    WHERE name = LOWER(REPLACE(p_project_type, ' ', '_'))
      AND is_active = TRUE
    LIMIT 1;
    
    IF v_assignee_id IS NULL THEN
        SELECT default_assignee INTO v_assignee_id
        FROM service_categories
        WHERE name = 'general_construction'
          AND is_active = TRUE
        LIMIT 1;
    END IF;
    
    IF v_assignee_id IS NOT NULL THEN
        UPDATE conversations
        SET assigned_to = v_assignee_id, updated_at = NOW()
        WHERE id = p_conversation_id;
    END IF;
    
    RETURN v_assignee_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION route_conversation IS
'Routes conversation to appropriate staff based on project type.';

-- ==========================================================
-- VIEW: Service routing overview
-- ==========================================================

CREATE OR REPLACE VIEW v_service_routing AS
SELECT 
    sc.id AS category_id,
    sc.name AS category_name,
    sc.display_name,
    sc.priority,
    sc.is_active,
    su.id AS assignee_id,
    su.first_name || ' ' || su.last_name AS assignee_name,
    su.email AS assignee_email,
    su.role AS assignee_role
FROM service_categories sc
LEFT JOIN staff_users su ON sc.default_assignee = su.id
ORDER BY sc.priority DESC;

COMMENT ON VIEW v_service_routing IS
'Overview of service categories and their assigned staff.';

-- ==========================================================
-- VIEW: Complexity assessment summary
-- ==========================================================

CREATE OR REPLACE VIEW v_complexity_summary AS
SELECT 
    pca.id,
    pca.contact_id,
    c.display_name AS contact_name,
    c.phone AS contact_phone,
    pca.conversation_id,
    pca.project_type,
    pca.total_complexity,
    pca.complexity_level,
    pca.recommended_action,
    pca.required_trades,
    pca.required_permits,
    pca.assigned_to,
    su.first_name || ' ' || su.last_name AS assigned_to_name,
    pca.assessed_at,
    pca.created_at
FROM project_complexity_assessments pca
JOIN contacts c ON pca.contact_id = c.id
LEFT JOIN staff_users su ON pca.assigned_to = su.id
ORDER BY pca.total_complexity DESC, pca.created_at DESC;

COMMENT ON VIEW v_complexity_summary IS
'Summary of project complexity assessments with contact and assignment info.';