SELECT e.id, w.name, e.status, to_char(e."startedAt" AT TIME ZONE 'America/Jamaica','HH24:MI:SS') AS t
FROM execution_entity e
JOIN workflow_entity w ON w.id = e."workflowId"
WHERE e.id BETWEEN 118 AND 146
ORDER BY e.id;