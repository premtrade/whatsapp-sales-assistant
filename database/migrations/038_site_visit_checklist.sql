-- ==========================================================
-- Site Visit Preparation Checklist
-- File: 038_site_visit_checklist.sql
-- Description: Adds site visit preparation capabilities
-- ==========================================================

SET search_path TO public;

-- ==========================================================
-- TABLE: site_visit_checklists
-- ==========================================================

CREATE TABLE IF NOT EXISTS site_visit_checklists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id UUID REFERENCES appointments(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    
    -- Project information
    project_type VARCHAR(100) NOT NULL,
    project_location VARCHAR(255),
    customer_name VARCHAR(255),
    customer_phone VARCHAR(25),
    
    -- Checklist items (JSON array)
    checklist_items JSONB NOT NULL DEFAULT '[]'::jsonb,
    
    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    
    -- Preparation notes
    preparation_notes TEXT,
    special_equipment_needed JSONB DEFAULT '[]'::jsonb,
    
    -- Assigned staff
    assigned_to UUID REFERENCES staff_users(id) ON DELETE SET NULL,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- ==========================================================
-- COMMENTS
-- ==========================================================

COMMENT ON TABLE site_visit_checklists IS
'Preparation checklists for site visits based on project type.';

COMMENT ON COLUMN site_visit_checklists.checklist_items IS
'JSON array of checklist items with {item, completed, notes} structure.';

COMMENT ON COLUMN site_visit_checklists.special_equipment_needed IS
'JSON array of special equipment needed for the visit.';

-- ==========================================================
-- INDEXES
-- ==========================================================

CREATE INDEX IF NOT EXISTS idx_site_visit_checklists_appointment_id ON site_visit_checklists(appointment_id);
CREATE INDEX IF NOT EXISTS idx_site_visit_checklists_conversation_id ON site_visit_checklists(conversation_id);
CREATE INDEX IF NOT EXISTS idx_site_visit_checklists_status ON site_visit_checklists(status);
CREATE INDEX IF NOT EXISTS idx_site_visit_checklists_assigned_to ON site_visit_checklists(assigned_to);
CREATE INDEX IF NOT EXISTS idx_site_visit_checklists_project_type ON site_visit_checklists(project_type);

-- ==========================================================
-- TRIGGER
-- ==========================================================

DROP TRIGGER IF EXISTS trg_site_visit_checklists_updated ON site_visit_checklists;

CREATE TRIGGER trg_site_visit_checklists_updated
BEFORE UPDATE
ON site_visit_checklists
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- ==========================================================
-- TABLE: site_visit_photos
-- ==========================================================

CREATE TABLE IF NOT EXISTS site_visit_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
    checklist_id UUID REFERENCES site_visit_checklists(id) ON DELETE SET NULL,
    
    -- Photo metadata
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size INTEGER,
    mime_type VARCHAR(100),
    caption TEXT,
    
    -- Photo context
    photo_type VARCHAR(50) NOT NULL DEFAULT 'customer_submitted'
        CHECK (photo_type IN ('customer_submitted', 'site_visit', 'progress', 'completion', 'other')),
    
    -- AI analysis (future feature)
    ai_analysis JSONB DEFAULT '{}'::jsonb,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================================
-- COMMENTS
-- ==========================================================

COMMENT ON TABLE site_visit_photos IS
'Photos submitted by customers or taken during site visits.';

COMMENT ON COLUMN site_visit_photos.photo_type IS
'Type of photo: customer_submitted, site_visit, progress, completion, other.';

COMMENT ON COLUMN site_visit_photos.ai_analysis IS
'JSON object for future AI analysis results (damage assessment, measurements, etc.).';

-- ==========================================================
-- INDEXES
-- ==========================================================

CREATE INDEX IF NOT EXISTS idx_site_visit_photos_contact_id ON site_visit_photos(contact_id);
CREATE INDEX IF NOT EXISTS idx_site_visit_photos_conversation_id ON site_visit_photos(conversation_id);
CREATE INDEX IF NOT EXISTS idx_site_visit_photos_appointment_id ON site_visit_photos(appointment_id);
CREATE INDEX IF NOT EXISTS idx_site_visit_photos_checklist_id ON site_visit_photos(checklist_id);
CREATE INDEX IF NOT EXISTS idx_site_visit_photos_photo_type ON site_visit_photos(photo_type);
CREATE INDEX IF NOT EXISTS idx_site_visit_photos_created_at ON site_visit_photos(created_at DESC);

-- ==========================================================
-- TRIGGER
-- ==========================================================

DROP TRIGGER IF EXISTS trg_site_visit_photos_updated ON site_visit_photos;

CREATE TRIGGER trg_site_visit_photos_updated
BEFORE UPDATE
ON site_visit_photos
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- ==========================================================
-- FUNCTION: Generate site visit checklist
-- ==========================================================

CREATE OR REPLACE FUNCTION generate_site_visit_checklist(
    p_project_type VARCHAR,
    p_appointment_id UUID,
    p_conversation_id UUID,
    p_customer_name VARCHAR,
    p_customer_phone VARCHAR,
    p_project_location VARCHAR
) RETURNS UUID AS $$
DECLARE
    v_checklist_id UUID;
    v_checklist_items JSONB;
    v_equipment JSONB;
BEGIN
    -- Generate checklist items based on project type
    v_checklist_items := CASE p_project_type
        WHEN 'Roofing' THEN '[
            {"item": "Bring safety harness and roof anchors", "completed": false},
            {"item": "Check weather forecast", "completed": false},
            {"item": "Bring measuring tape and laser measure", "completed": false},
            {"item": "Bring camera for documentation", "completed": false},
            {"item": "Verify roof access points", "completed": false},
            {"item": "Check for electrical hazards", "completed": false},
            {"item": "Bring samples of roofing materials", "completed": false}
        ]'::jsonb
        WHEN 'Electrical' THEN '[
            {"item": "Bring multimeter and voltage tester", "completed": false},
            {"item": "Bring circuit tester", "completed": false},
            {"item": "Verify main electrical panel location", "completed": false},
            {"item": "Check for proper access to electrical room", "completed": false},
            {"item": "Bring PPE (gloves, safety glasses)", "completed": false},
            {"item": "Review existing electrical permits", "completed": false}
        ]'::jsonb
        WHEN 'Plumbing' THEN '[
            {"item": "Bring pipe inspection camera", "completed": false},
            {"item": "Bring pressure gauge", "completed": false},
            {"item": "Verify water shut-off location", "completed": false},
            {"item": "Check access to main plumbing lines", "completed": false},
            {"item": "Bring pipe samples and fittings catalog", "completed": false}
        ]'::jsonb
        WHEN 'Painting' THEN '[
            {"item": "Bring color swatches and fan deck", "completed": false},
            {"item": "Bring moisture meter", "completed": false},
            {"item": "Check surface condition", "completed": false},
            {"item": "Measure square footage", "completed": false},
            {"item": "Bring paint samples for approval", "completed": false},
            {"item": "Verify ventilation requirements", "completed": false}
        ]'::jsonb
        ELSE '[
            {"item": "Bring measuring tape and laser measure", "completed": false},
            {"item": "Bring camera for documentation", "completed": false},
            {"item": "Verify site access", "completed": false},
            {"item": "Review project requirements", "completed": false},
            {"item": "Bring safety equipment (hard hat, vest)", "completed": false},
            {"item": "Prepare estimation forms", "completed": false}
        ]'::jsonb
    END;
    
    -- Generate equipment list based on project type
    v_equipment := CASE p_project_type
        WHEN 'Roofing' THEN '["Safety harness", "Measuring tape", "Camera", "Roofing samples"]'::jsonb
        WHEN 'Electrical' THEN '["Multimeter", "Voltage tester", "PPE", "Circuit diagrams"]'::jsonb
        WHEN 'Plumbing' THEN '["Pipe camera", "Pressure gauge", "Pipe samples", "Fittings catalog"]'::jsonb
        WHEN 'Painting' THEN '["Color swatches", "Moisture meter", "Paint samples", "Measuring tape"]'::jsonb
        ELSE '["Measuring tape", "Camera", "Safety equipment", "Estimation forms"]'::jsonb
    END;
    
    -- Insert checklist
    INSERT INTO site_visit_checklists (
        appointment_id,
        conversation_id,
        project_type,
        project_location,
        customer_name,
        customer_phone,
        checklist_items,
        special_equipment_needed,
        status
    ) VALUES (
        p_appointment_id,
        p_conversation_id,
        p_project_type,
        p_project_location,
        p_customer_name,
        p_customer_phone,
        v_checklist_items,
        v_equipment,
        'pending'
    ) RETURNING id INTO v_checklist_id;
    
    RETURN v_checklist_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION generate_site_visit_checklist IS
'Generates a site visit preparation checklist based on project type.';

-- ==========================================================
-- VIEW: Site visit details with checklist
-- ==========================================================

CREATE OR REPLACE VIEW v_site_visit_details AS
SELECT 
    a.id AS appointment_id,
    a.appointment_type,
    a.title,
    a.description,
    a.location,
    a.starts_at,
    a.ends_at,
    a.status AS appointment_status,
    a.assigned_to,
    su.first_name AS staff_first_name,
    su.last_name AS staff_last_name,
    su.email AS staff_email,
    su.phone AS staff_phone,
    c.id AS contact_id,
    c.display_name AS contact_name,
    c.phone AS contact_phone,
    c.email AS contact_email,
    c.company AS contact_company,
    svc.id AS checklist_id,
    svc.project_type,
    svc.checklist_items,
    svc.special_equipment_needed,
    svc.status AS checklist_status,
    svc.preparation_notes,
    svc.completed_at AS checklist_completed_at
FROM appointments a
JOIN contacts c ON a.contact_id = c.id
LEFT JOIN staff_users su ON a.assigned_to = su.id
LEFT JOIN site_visit_checklists svc ON a.id = svc.appointment_id
ORDER BY a.starts_at ASC;

COMMENT ON VIEW v_site_visit_details IS
'Comprehensive view of site visit appointments with checklist information.';