#!/usr/bin/env bash
# Generate self-signed certificates for Postgres SSL
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERT_DIR="$SCRIPT_DIR/certs"

mkdir -p "$CERT_DIR"

if [ -f "$CERT_DIR/server.crt" ] && [ -f "$CERT_DIR/server.key" ]; then
    echo "SSL certificates already exist in $CERT_DIR"
    exit 0
fi

echo "Generating self-signed SSL certificates for Postgres..."

openssl req -new -x509 -days 3650 -nodes \
    -out "$CERT_DIR/server.crt" \
    -keyout "$CERT_DIR/server.key" \
    -subj "/C=JM/ST=Kingston/L=Kingston/O=WhatsAppSales/OU=IT/CN=postgres"

chmod 600 "$CERT_DIR/server.key"
chmod 644 "$CERT_DIR/server.crt"

echo "SSL certificates generated successfully in $CERT_DIR"
echo "  cert: $CERT_DIR/server.crt"
echo "  key:  $CERT_DIR/server.key"
