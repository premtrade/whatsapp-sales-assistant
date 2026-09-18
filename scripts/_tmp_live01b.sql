SELECT jsonb_pretty(n)
FROM workflow_entity w, jsonb_array_elements(w.nodes::jsonb) n
WHERE w.name = '01 - Incoming WhatsApp Message' AND n->>'name' = 'Upsert Conversation';
