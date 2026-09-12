-- n8n database
SELECT 'CREATE DATABASE n8n'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'n8n')\gexec

GRANT ALL PRIVILEGES ON DATABASE n8n TO CURRENT_USER;

-- whatsapp_sales database (main app database)
SELECT 'CREATE DATABASE whatsapp_sales'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'whatsapp_sales')\gexec

GRANT ALL PRIVILEGES ON DATABASE whatsapp_sales TO CURRENT_USER;

-- Switch context so all subsequent init scripts (01_ through 18_)
-- are executed inside the whatsapp_sales database, not the default postgres db.
\connect whatsapp_sales
