SELECT n->'parameters'->'conditions' AS v
FROM workflow_entity, jsonb_array_elements(nodes::jsonb) n
WHERE name='01 - Incoming WhatsApp Message' AND n->>'name'='Status Filter';

