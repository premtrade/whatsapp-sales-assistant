-- ==========================================================
-- Project Type Taxonomy for Garco Construction
-- ==========================================================

SET search_path TO public;

CREATE TABLE IF NOT EXISTS project_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    category VARCHAR(50),
    typical_duration VARCHAR(50),
    requires_site_visit BOOLEAN NOT NULL DEFAULT true,
    requires_quote BOOLEAN NOT NULL DEFAULT true,
    is_active BOOLEAN NOT NULL DEFAULT true,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_types_category
ON project_types(category);

CREATE INDEX IF NOT EXISTS idx_project_types_active
ON project_types(is_active);

DROP TRIGGER IF EXISTS trg_project_types_updated ON project_types;

CREATE TRIGGER trg_project_types_updated
BEFORE UPDATE
ON project_types
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

INSERT INTO project_types (name, category, typical_duration, requires_site_visit, requires_quote) VALUES
  ('General Construction/Renovation', 'construction', '2-12 weeks', true, true),
  ('Project Management', 'consultation', '1-4 weeks', true, true),
  ('General Roof Works', 'structural', '1-3 weeks', true, true),
  ('Dry Wall Partitions & Ceilings', 'finishing', '2-5 days', true, true),
  ('Suspended Ceilings', 'finishing', '1-3 days', true, true),
  ('Trowel-On Works', 'finishing', '2-7 days', true, true),
  ('Textured Spraying', 'finishing', '1-3 days', true, true),
  ('General Painting Works', 'finishing', '3-10 days', true, true),
  ('Electrical Works', 'mechanical', '1-2 weeks', true, true),
  ('Plumbing Works', 'mechanical', '1-2 weeks', true, true),
  ('A/C Works', 'mechanical', '1-3 days', true, true),
  ('General Grille & Iron Works', 'structural', '1-3 weeks', true, true)
ON CONFLICT (name) DO NOTHING;
