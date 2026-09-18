SELECT w.name, count(*) AS runs,
       to_char(max(e."startedAt"),'MM-DD HH24:MI') AS last_run
FROM execution_entity e
JOIN workflow_entity w ON w.id = e."workflowId"
WHERE e."startedAt" > NOW() - INTERVAL '6 hours'
GROUP BY w.name
ORDER BY runs DESC;

SELECT id, status, "lastNodeExecuted", left("stoppedAt"::text, 16) AS stopped
FROM execution_entity
WHERE status='error'
ORDER BY id DESC
LIMIT 5;