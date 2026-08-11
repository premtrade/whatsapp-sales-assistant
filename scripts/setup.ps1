<#
.SYNOPSIS
Bootstrap script for WhatsApp Sales Assistant

.DESCRIPTION
This script starts the Docker Compose stack and prepares the environment.
#>

Write-Host "Starting WhatsApp Sales Assistant Setup..." -ForegroundColor Cyan

# 1. Check if .env exists
if (-not (Test-Path ".env")) {
    Write-Host "Creating .env from .env.example..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"
}

# 2. Start Docker Compose
Write-Host "Starting Docker containers in detached mode..." -ForegroundColor Cyan
docker compose up -d

Write-Host "Waiting for services to become healthy (this may take a minute)..." -ForegroundColor Yellow
Start-Sleep -Seconds 15

# 3. Check health
$services = docker compose ps --format json | ConvertFrom-Json
foreach ($service in $services) {
    Write-Host "$($service.Service): $($service.State) ($($service.Health))"
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
# Register the WAHA -> n8n webhook (idempotent; safe to re-run)
Write-Host "Registering WAHA -> n8n webhook..." -ForegroundColor Cyan
& "$PSScriptRoot\configure-waha-webhook.ps1"

Write-Host "Setup Complete!" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "Service URLs:"
Write-Host " - pgAdmin:  http://localhost:5050  (credentials in .env)"
Write-Host " - n8n:     http://localhost:5678  (credentials in .env)"
Write-Host " - Flowise: http://localhost:3000  (credentials in .env)"
Write-Host " - WAHA:    http://localhost:3001  (credentials in .env)"
Write-Host ""
Write-Host "Next Steps:"
Write-Host " 1. Open the WAHA Dashboard and scan the QR code to link WhatsApp."
Write-Host " 2. This script auto-registers the WAHA -> n8n webhook (path: waha/messages)."
Write-Host " 3. Open n8n; Workflow '01 - Incoming WhatsApp Message' is active and listening."
Write-Host " 4. (Optional) Open Flowise and import your Sales Assistant chatflow."
Write-Host "==========================================================" -ForegroundColor Green
