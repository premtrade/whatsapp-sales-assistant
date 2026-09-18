SELECT e.id, left(d.data, 600) AS head
FROM execution_entity e
JOIN execution_data d ON d."executionId" = e.id
WHERE e.id = 174;