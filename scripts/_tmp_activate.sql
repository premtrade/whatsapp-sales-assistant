UPDATE "workflow_entity" SET "active" = true
WHERE "name" IN ('01 - Incoming WhatsApp Message','03 - Memory & Context Builder','04 - Memory Writer','Workflow 2 - AI Brain');
SELECT "id","name","active" FROM "workflow_entity" WHERE "name" IN ('01 - Incoming WhatsApp Message','03 - Memory & Context Builder','04 - Memory Writer','Workflow 2 - AI Brain') ORDER BY "name";
