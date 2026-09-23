#!/bin/bash
# =============================================================================
# WAFLO SSL Setup Script
# Run ONLY after waflo.com DNS points to this droplet (206.189.179.60)
# Verifies DNS before proceeding.
# =============================================================================
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERR]${NC} $1"; exit 1; }

DOMAIN="${1:-waflo.com}"
EMAIL="${2:-premtrade12@yahoo.com}"
DROPLET_IP="206.189.179.60"
REPO_DIR="${REPO_DIR:-/root/whatsapp-sales-assistant}"

echo "================================================"
echo "  WAFLO SSL Setup for $DOMAIN"
echo "================================================"

# ---------------------------------------------------------------------------
echo ""
echo "==> 1. Checking DNS resolution for $DOMAIN"
# ---------------------------------------------------------------------------
RESOLVED_IP=$(dig +short "$DOMAIN" A | head -1 || true)
if [ "$RESOLVED_IP" != "$DROPLET_IP" ]; then
  err "DNS NOT ready: $DOMAIN resolves to '$RESOLVED_IP' (expected $DROPLET_IP)
  
Please update your DNS:
  A  @    ->  $DROPLET_IP
  A  www  ->  $DROPLET_IP

Then wait 5-30 min for propagation and re-run this script."
fi
ok "$DOMAIN -> $DROPLET_IP (DNS correct)"

# ---------------------------------------------------------------------------
echo ""
echo "==> 2. Install certbot"
# ---------------------------------------------------------------------------
if ! command -v certbot &>/dev/null; then
  apt update -qq
  apt install -y certbot python3-certbot-nginx
  ok "certbot installed"
else
  ok "certbot already installed"
fi

# ---------------------------------------------------------------------------
echo ""
echo "==> 3. Deploy production nginx config"
# ---------------------------------------------------------------------------
cp "$REPO_DIR/docker/nginx/conf.d/waflo.conf" /etc/nginx/sites-available/waflo
ln -sf /etc/nginx/sites-available/waflo /etc/nginx/sites-enabled/waflo

# Disable the bare-IP backend config if present
if [ -f /etc/nginx/sites-enabled/backend ]; then
  rm -f /etc/nginx/sites-enabled/backend
  warn "Removed old bare-IP backend nginx config"
fi

# Test with a temporary HTTP-only block while certbot gets the cert
cat > /etc/nginx/sites-available/waflo-temp <<'EOF'
server {
    listen 80;
    server_name waflo.com www.waflo.com;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 50M;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:4000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 50M;
    }

    location /health {
        proxy_pass http://127.0.0.1:4000/health;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
EOF

ln -sf /etc/nginx/sites-available/waflo-temp /etc/nginx/sites-enabled/waflo
nginx -t && systemctl reload nginx
ok "Temporary HTTP nginx config active"

# ---------------------------------------------------------------------------
echo ""
echo "==> 4. Obtain Let's Encrypt certificate"
# ---------------------------------------------------------------------------
mkdir -p /var/www/html
certbot certonly --webroot -w /var/www/html \
  -d "$DOMAIN" -d "www.$DOMAIN" \
  --email "$EMAIL" \
  --agree-tos --non-interactive
ok "Certificate obtained"

# ---------------------------------------------------------------------------
echo ""
echo "==> 5. Deploy HTTPS nginx config"
# ---------------------------------------------------------------------------
# The repo waflo.conf already has the SSL config — enable it now
cp "$REPO_DIR/docker/nginx/conf.d/waflo.conf" /etc/nginx/sites-available/waflo
ln -sf /etc/nginx/sites-available/waflo /etc/nginx/sites-enabled/waflo
rm -f /etc/nginx/sites-enabled/waflo-temp

nginx -t && systemctl reload nginx
ok "HTTPS nginx config active"

# ---------------------------------------------------------------------------
echo ""
echo "==> 6. Set up auto-renewal"
# ---------------------------------------------------------------------------
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet && systemctl reload nginx") | crontab -
ok "Auto-renewal cron job added (runs 3am daily)"

# ---------------------------------------------------------------------------
echo ""
echo "==> 7. Verify"
# ---------------------------------------------------------------------------
echo "Testing HTTPS..."
curl -sf "https://$DOMAIN/health" | python3 -m json.tool 2>/dev/null || \
  curl -s "https://$DOMAIN/health" || echo "(check manually)"

echo ""
echo "=========================================="
echo " SSL setup complete!"
echo "  https://$DOMAIN          -> frontend (Vercel)"
echo "  https://$DOMAIN/api/*    -> backend"
echo "  https://$DOMAIN/health   -> backend health"
echo "=========================================="
echo ""
echo "NEXT: Update Vercel project to add custom domain '$DOMAIN':"
echo "  https://vercel.com/premtrade/waflo/settings/domains"

