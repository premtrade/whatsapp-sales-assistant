SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='knowledge_chunks'::regclass;
