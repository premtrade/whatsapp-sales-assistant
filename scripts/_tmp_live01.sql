SELECT n->>'name' AS node_name, n->>'type' AS node_type
FROM workflow_entity w, jsonb_array_elements(w.nodes::jsonb) n
WHERE w.name = '01 - Incoming WhatsApp Message';
