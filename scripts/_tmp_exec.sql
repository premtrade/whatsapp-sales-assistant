SELECT w.name, e.id, e.status, to_char(e."startedAt",'MM-DD HH24:MI:SS') AS started
FROM execution_entity e
JOIN workflow_entity w ON w.id = e."workflowId"
WHERE e."startedAt" > NOW() - INTERVAL '3 hours'
ORDER BY e."startedAt" DESC
LIMIT 40;