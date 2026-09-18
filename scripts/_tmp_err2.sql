SELECT e.id,
       d.data::jsonb ->> 7  AS last_node,          -- resultData.lastNodeExecuted
       d.data::jsonb ->> 19 AS err_name,           -- error.name
       d.data::jsonb ->> 20 AS err_node,           -- error.node
       left(d.data::jsonb ->> 22, 300) AS err_message
FROM execution_entity e
JOIN execution_data d ON d."executionId" = e.id
WHERE e.id IN (174, 171, 170, 169, 152, 150, 148, 145);