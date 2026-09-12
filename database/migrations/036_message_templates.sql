-- ==========================================================
-- Message Templates for Garco Construction
-- File: 036_message_templates.sql
-- Description: Pre-built message templates for common scenarios
-- ==========================================================

SET search_path TO public;

-- ==========================================================
-- TABLE: message_templates
-- ==========================================================

CREATE TABLE IF NOT EXISTS message_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Template identification
    name VARCHAR(100) NOT NULL UNIQUE,
    category VARCHAR(50) NOT NULL,
    description TEXT,
    
    -- Template content
    subject VARCHAR(255),
    body TEXT NOT NULL,
    
    -- Variables that can be substituted (JSON array of variable names)
    variables JSONB DEFAULT '[]'::jsonb,
    
    -- Template metadata
    language VARCHAR(10) NOT NULL DEFAULT 'en',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    usage_count INTEGER NOT NULL DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);

-- ==========================================================
-- COMMENTS
-- ==========================================================

COMMENT ON TABLE message_templates IS
'Pre-built WhatsApp message templates for common customer interaction scenarios.';

COMMENT ON COLUMN message_templates.category IS
'Template category: greeting, service_inquiry, quote_request, appointment, follow_up, closing.';

COMMENT ON COLUMN message_templates.variables IS
'JSON array of variable names that can be substituted in the template (e.g., ["customer_name", "service_type"]).';

-- ==========================================================
-- INDEXES
-- ==========================================================

CREATE INDEX IF NOT EXISTS idx_message_templates_category ON message_templates(category);
CREATE INDEX IF NOT EXISTS idx_message_templates_is_active ON message_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_message_templates_name ON message_templates(name);

-- ==========================================================
-- TRIGGER
-- ==========================================================

DROP TRIGGER IF EXISTS trg_message_templates_updated ON message_templates;

CREATE TRIGGER trg_message_templates_updated
BEFORE UPDATE
ON message_templates
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- ==========================================================
-- SEED DATA: Common Construction Message Templates
-- ==========================================================

INSERT INTO message_templates (name, category, description, subject, body, variables) VALUES
-- Greeting templates
('welcome_greeting', 'greeting', 'Initial welcome message for new customers', 'Welcome to Garco',
'Hello {{customer_name}}! Welcome to Garco Construction Services Ltd. We have been serving Jamaica since 1999 with quality construction services. How can we help you today?', '["customer_name"]'),

('returning_customer_greeting', 'greeting', 'Greeting for returning customers', 'Welcome back to Garco',
'Welcome back {{customer_name}}! Thank you for contacting Garco Construction again. We are here to assist with your construction needs.', '["customer_name"]'),

-- Service inquiry templates
('service_inquiry_general', 'service_inquiry', 'Response to general service inquiry', 'Our Services',
'Thank you for your interest in Garco Construction! We offer a wide range of services including: General Construction, Renovation, Roofing, Electrical, Plumbing, Painting, A/C Works, and Project Management. Which service are you interested in?', '[]'),

('service_inquiry_roofing', 'service_inquiry', 'Response to roofing inquiries', 'Roofing Services',
'Thank you for inquiring about our roofing services! Garco provides complete roof works including repairs, replacements, and new installations. To provide an accurate estimate, we would need to schedule a site visit. Would you like to arrange a convenient time?', '[]'),

('service_inquiry_electrical', 'service_inquiry', 'Response to electrical inquiries', 'Electrical Services',
'Thank you for your electrical service inquiry! Our licensed electricians handle all types of electrical works from installations to repairs. For safety and accurate pricing, we recommend a site assessment. Shall we schedule a visit?', '[]'),

-- Quote request templates
('quote_request_received', 'quote_request', 'Acknowledgment of quote request', 'Quote Request Received',
'Thank you for requesting a quote{{customer_name_text}}. We have received your request for {{service_type}} and will prepare an estimated quote for you. A representative will follow up shortly with details.', '["customer_name_text", "service_type"]'),

('quote_follow_up_24h', 'follow_up', 'First follow-up after 24 hours', 'Following Up on Your Quote',
'Hello {{customer_name}}, I wanted to follow up on the quote we sent for your {{service_type}} project. Do you have any questions or would you like to discuss any details? We are here to help!', '["customer_name", "service_type"]'),

('quote_follow_up_3day', 'follow_up', 'Second follow-up after 3 days', 'Checking In',
'Hi {{customer_name}}, I hope you had a chance to review the quote for your {{service_type}} project. If you would like to proceed or have any questions, please let us know. We would be happy to schedule a site visit if needed.', '["customer_name", "service_type"]'),

('quote_follow_up_7day', 'follow_up', 'Final follow-up after 7 days', 'Special Offer',
'Dear {{customer_name}}, as a valued prospective customer, I wanted to let you know we currently have availability for new projects. If you would like to move forward with your {{service_type}} project, we would be pleased to offer you priority scheduling. Please let us know if you are interested!', '["customer_name", "service_type"]'),

-- Appointment templates
('appointment_confirmation', 'appointment', 'Appointment confirmation message', 'Appointment Confirmed',
'Your appointment has been confirmed for {{appointment_date}} at {{appointment_time}}. Our team will meet you at {{location}}. If you need to reschedule, please let us know at least 24 hours in advance. See you then!', '["appointment_date", "appointment_time", "location"]'),

('appointment_reminder_48h', 'follow_up', '48-hour appointment reminder', 'Appointment Reminder',
'Hello {{customer_name}}, this is a friendly reminder that you have an appointment with Garco Construction on {{appointment_date}} at {{appointment_time}}. We look forward to meeting with you!', '["customer_name", "appointment_date", "appointment_time"]'),

('appointment_reminder_24h', 'follow_up', '24-hour appointment reminder', 'Tomorrow Appointment',
'Hi {{customer_name}}, just a reminder that your appointment with Garco Construction is tomorrow at {{appointment_time}}. Please ensure the site is accessible. See you then!', '["customer_name", "appointment_time"]'),

-- Closing templates
('project_completed', 'closing', 'Project completion message', 'Project Complete',
'Dear {{customer_name}}, we are pleased to inform you that your {{service_type}} project has been completed. We hope you are satisfied with our work. If you have any concerns, please do not hesitate to contact us. Thank you for choosing Garco Construction!', '["customer_name", "service_type"]'),

('thank_you_referral', 'closing', 'Thank you for referral', 'Thank You',
'Thank you for recommending Garco Construction to others! We appreciate your trust in our services. If you know anyone who needs quality construction services, we would be honored to help them too!', '[]'),

-- Handoff templates
('handoff_to_human', 'handoff', 'Handoff to human agent message', 'Connecting You',
'{{customer_name_text}}Let me connect you with one of our specialists who can better assist you with your inquiry. Please hold for a moment while I transfer you. A Garco representative will be with you shortly.', '["customer_name"]')

ON CONFLICT (name) DO NOTHING;

-- ==========================================================
-- FUNCTION: Use template (increment usage count)
-- ==========================================================

CREATE OR REPLACE FUNCTION use_message_template(p_template_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE message_templates
    SET usage_count = usage_count + 1,
        last_used_at = NOW()
    WHERE id = p_template_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION use_message_template IS
'Increments usage count and updates last_used_at timestamp for a template.';
