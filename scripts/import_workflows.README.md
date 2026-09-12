# One-shot workflow importer for n8n
# Usage:
#   1. Enable the n8n API in docker-compose.yml (see SETUP below)
#   2. Restart n8n:  docker compose up -d n8n
#   3. Create an API key: n8n UI -> Settings -> n8n API -> Create API key (Owner role)
#   4. Set the env var:  $env:N8N_API_KEY = "n8n_api_xxx..."
#   5. Run:  python scripts/import_workflows.py
#
# SETUP (docker-compose.yml under the `n8n` service):
#   environment:
#     N8N_PUBLIC_API_ENABLED: "true"
#     N8N_API_KEY_REQUIRED_HEADER_NAME: "X-N8N-API-KEY"
#     N8N_API_KEY_REQUIRED_HEADER_VALUE: ""  # not needed when using personal API keys
#
# After re-importing, re-link the credentials on each workflow in the n8n UI.
