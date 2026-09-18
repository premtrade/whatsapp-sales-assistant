SELECT e.id,
       d.data::jsonb -> 'resultData' ->> 'lastNodeExecuted' AS last_node,
       left(d.data::jsonb -> 'resultData' -> 'error' ->> 'message', 200) AS err
FROM execution_entity e
JOIN execution_data d ON d."executionId" = e.id
WHERE e.status = 'error'
ORDER BY e.id DESC
LIMIT 4;