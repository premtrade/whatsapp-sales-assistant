-- n8n database
SELECT 'CREATE DATABASE n8n'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'n8n')\gexec

GRANT ALL PRIVILEGES ON DATABASE n8n TO postgres;

-- Flowise database
SELECT 'CREATE DATABASE flowise'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'flowise')\gexec

GRANT ALL PRIVILEGES ON DATABASE flowise TO postgres;

-- whatsapp_sales database (main app database)
SELECT 'CREATE DATABASE whatsapp_sales'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'whatsapp_sales')\gexec

GRANT ALL PRIVILEGES ON DATABASE whatsapp_sales TO postgres;

-- Switch context so all subsequent init scripts (01_ through 18_)
-- are executed inside the whatsapp_sales database, not the default postgres db.
\connect whatsapp_sales
