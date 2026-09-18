-- Remove bogus 'null'/'undefined' literal facts injected by the old Workflow 04 bug
DELETE FROM customer_facts
WHERE lower(fact_key)  IN ('null', 'undefined', '')
   OR lower(fact_value) IN ('null', 'undefined', '');

-- Keep the genuinely extracted facts (service_interest, preferred_date/time)

-- Populate the business whatsapp phone from WAHA me.id for correct contact matching
UPDATE businesses
SET whatsapp_phone = '+18767998637'
WHERE slug = 'garco';
