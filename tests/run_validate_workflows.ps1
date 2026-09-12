# Validate workflow DB state by piping the SQL file into psql inside the container.
# Usage: powershell -File tests/run_validate_workflows.ps1
# Or:    cat tests/validate_workflows.sql | docker compose exec -T postgres psql -U postgres -d whatsapp_sales -X

Get-Content -LiteralPath "$PSScriptRoot/validate_workflows.sql" -Raw |
    docker compose exec -T postgres psql -U postgres -d whatsapp_sales -X