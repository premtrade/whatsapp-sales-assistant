-- ==========================================================
-- Project : WhatsApp Sales Assistant
-- Sprint 2.5
-- File    : 017_seed_data.sql
-- Purpose : Demo Data
-- ==========================================================

SET search_path TO public;

-- ==========================================================
-- CONTACT
-- ==========================================================

INSERT INTO contacts
(
    phone,
    display_name,
    email,
    company
)
VALUES
(
    '+18765551234',
    'John Brown',
    'john@example.com',
    'Brown Construction'
)
ON CONFLICT (phone) DO NOTHING;

-- ==========================================================
-- PRODUCT
-- ==========================================================

INSERT INTO products
(
    sku,
    name,
    description,
    category,
    product_type,
    unit,
    price,
    currency
)
VALUES
(
    'ROOF-001',
    'Roof Inspection',
    'Residential roof inspection',
    'Roofing',
    'service',
    'job',
    15000,
    'JMD'
)
ON CONFLICT (sku) DO NOTHING;

-- ==========================================================
-- STAFF
-- ==========================================================

INSERT INTO staff_users
(
    employee_number,
    first_name,
    last_name,
    email,
    role
)
VALUES
(
    'EMP001',
    'Leroy',
    'Dunn',
    'leroy@example.com',
    'admin'
)
ON CONFLICT (email) DO NOTHING;

-- ==========================================================
-- SETTINGS
-- ==========================================================

INSERT INTO settings
(setting_key, setting_value, data_type)
VALUES
('company_name','Demo Company','string')
ON CONFLICT (setting_key) DO NOTHING;

INSERT INTO settings
(setting_key, setting_value, data_type)
VALUES
('currency','JMD','string')
ON CONFLICT (setting_key) DO NOTHING;

INSERT INTO settings
(setting_key, setting_value, data_type)
VALUES
('timezone','America/Jamaica','string')
ON CONFLICT (setting_key) DO NOTHING;
