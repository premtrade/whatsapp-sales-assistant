SELECT n->>'name' AS node_name, n->>'type' AS node_type
FROM workflow_entity w, jsonb_array_elements(w.nodes::jsonb) n
WHERE w.name = 'Workflow 2 - AI Brain'
  AND (n->>'type' LIKE '%toolWorkflow%' OR n->>'type' LIKE '%lmChatGroq%' OR n->>'type' LIKE '%agent%');

SELECT jsonb_pretty(connections)
FROM workflow_entity WHERE name = 'Workflow 2 - AI Brain';

SELECT n->'parameters'->>'model' AS groq_model
FROM workflow_entity w, jsonb_array_elements(w.nodes::jsonb) n
WHERE w.name = 'Workflow 2 - AI Brain' AND n->>'type' LIKE '%lmChatGroq%';