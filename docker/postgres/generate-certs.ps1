<#
.SYNOPSIS
    Generates self-signed SSL certificates for PostgreSQL.

.DESCRIPTION
    Creates a self-signed certificate and key for Postgres SSL connections.
    Certificates are stored in docker/postgres/certs/.
#>

param(
    [string]$CertDir = "$PSScriptRoot\certs"
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $CertDir)) {
    New-Item -ItemType Directory -Path $CertDir -Force | Out-Null
}

$certPath = Join-Path $CertDir "server.crt"
$keyPath = Join-Path $CertDir "server.key"

if ((Test-Path $certPath) -and (Test-Path $keyPath)) {
    Write-Host "SSL certificates already exist in $CertDir"
    exit 0
}

Write-Host "Generating self-signed SSL certificates for Postgres..."

# Check if openssl is available
$openssl = Get-Command openssl -ErrorAction SilentlyContinue
if (-not $openssl) {
    Write-Warning "OpenSSL not found. Please install OpenSSL to generate certificates."
    Write-Warning "On Windows, you can install via: winget install OpenSSL.OpenSSL"
    Write-Warning "Or use Git Bash: cd docker/postgres && bash generate-certs.sh"
    exit 1
}

& openssl req -new -x509 -days 3650 -nodes `
    -out $certPath `
    -keyout $keyPath `
    -subj "/C=JM/ST=Kingston/L=Kingston/O=WhatsAppSales/OU=IT/CN=postgres"

Write-Host "SSL certificates generated successfully in $CertDir"
Write-Host "  cert: $certPath"
Write-Host "  key:  $keyPath"
