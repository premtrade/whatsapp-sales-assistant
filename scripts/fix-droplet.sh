#!/bin/bash
# =============================================================================
# WAFLO Droplet Fix Script
# Run this on the DigitalOcean droplet as root:
#   ssh root@206.189.179.60
#   bash <(curl -s https://raw.githubusercontent.com/premtrade/whatsapp-sales-assistant/main/scripts/fix-droplet.sh)
# OR paste it directly into your SSH session.
# =============================================================================
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERR]${NC} $1"; }
step() { echo -e "\n${YELLOW}===> $1${NC}"; }

REPO_DIR="${REPO_DIR:-/root/whatsapp-sales-assistant}"

# ---------------------------------------------------------------------------
step "1. Locate repo"
# ---------------------------------------------------------------------------
if [ ! -d "$REPO_DIR" ]; then
  err "Repo not found at $REPO_DIR"
  echo "Set REPO_DIR env var to the correct path and re-run, e.g.:"
  echo "  REPO_DIR=/home/ubuntu/whatsapp-sales-assistant bash fix-droplet.sh"
  exit 1
fi
cd "$REPO_DIR"
ok "Repo found at $REPO_DIR"

# ---------------------------------------------------------------------------
step "2. Pull latest code from GitHub"
# ---------------------------------------------------------------------------
git pull origin main
ok "Code updated"

# ---------------------------------------------------------------------------
step "3. Check current container state"
# ---------------------------------------------------------------------------
docker compose ps

# ---------------------------------------------------------------------------
step "4. Restart WAHA (was OOM-killed)"
# ---------------------------------------------------------------------------
docker compose up -d waha
sleep 8
WAHA_STATUS=$(docker inspect --format='{{.State.Status}}' waha 2>/dev/null || echo "missing")
if [ "$WAHA_STATUS" = "running" ]; then
  ok "WAHA is running"
else
  warn "WAHA status: $WAHA_STATUS — check logs: docker logs waha --tail 40"
fi

# ---------------------------------------------------------------------------
step "5. Diagnose /health 503"
# ---------------------------------------------------------------------------
echo "Current health response:"
curl -sf http://localhost:4000/health | python3 -m json.tool 2>/dev/null || \
  curl -s http://localhost:4000/health || echo "(no response)"

echo ""
echo "Backend last 30 lines of logs:"
docker logs backend --tail 30 2>&1

# ---------------------------------------------------------------------------
step "6. Ensure all core containers are up"
# ---------------------------------------------------------------------------
docker compose up -d postgres redis n8n backend
sleep 10

echo "Health after restart:"
curl -s http://localhost:4000/health | python3 -m json.tool 2>/dev/null || \
  curl -s http://localhost:4000/health || echo "(no response)"

# ---------------------------------------------------------------------------
step "7. Fix Nginx — ensure /api/* and /health proxy correctly to backend"
# ---------------------------------------------------------------------------
# Check which nginx site is active
if [ -f /etc/nginx/sites-enabled/backend ]; then
  NGINX_CONF="/etc/nginx/sites-available/backend"
  warn "Using sites-available/backend config (bare-IP server block)"
elif [ -d /etc/nginx/conf.d ]; then
  NGINX_CONF="/etc/nginx/conf.d/waflo.conf"
  warn "Using conf.d/waflo.conf"
else
  NGINX_CONF="/etc/nginx/nginx.conf"
  warn "Using default nginx.conf"
fi

echo "Active nginx config: $NGINX_CONF"
cat "$NGINX_CONF" 2>/dev/null | head -40 || true

# The bare-IP config (set up by setup-vps-for-vercel.sh) proxies / -> localhost:4000
# which means GET / returns the backend root, and GET /api/businesses works.
# NOTE 2026-09-23: backend now mounts healthRoutes at BOTH /health and /api/health
# (see backend/src/app.ts), so Vercel's /api/health rewrite works with no nginx
# patch needed. The explicit /health location below is kept as a harmless fallback
# for droplets still running an older backend build.

# Only rewrite if using the bare-IP sites-available config
if [ -f /etc/nginx/sites-available/backend ]; then
  echo ""
  echo "Patching bare-IP nginx config to add explicit /health location..."
  
  # Check if /health block already present
  if grep -q "location /health" /etc/nginx/sites-available/backend 2>/dev/null; then
    ok "/health location already in nginx config"
  else
    # Insert before the closing brace of the server block
    sed -i '/^}/i\    location /health {\n        proxy_pass http://localhost:4000/health;\n        proxy_set_header Host $host;\n        proxy_set_header X-Real-IP $remote_addr;\n    }' \
      /etc/nginx/sites-available/backend 2>/dev/null || \
      warn "sed patch failed — edit $NGINX_CONF manually"
  fi
fi

# ---------------------------------------------------------------------------
step "7b. Ensure CORS allows the Vercel frontend"
# ---------------------------------------------------------------------------
# Vercel rewrites keep the browser same-origin, but direct API calls and
# local dev still need the deployed origin in CORS_ORIGINS.
if grep -q "CORS_ORIGINS" .env 2>/dev/null; then
  if grep -q "waflo.vercel.app" .env 2>/dev/null; then
    ok "CORS_ORIGINS already includes waflo.vercel.app"
  else
    warn "Adding https://waflo.vercel.app to CORS_ORIGINS in .env"
    # Append without duplicating; backend reads comma-separated list
    sed -i 's|^CORS_ORIGINS=.*|&,https://waflo.vercel.app|' .env
    docker compose up -d backend
    sleep 8
    ok "Backend restarted with updated CORS_ORIGINS"
  fi
else
  warn "CORS_ORIGINS not found in .env — add: CORS_ORIGINS=https://waflo.vercel.app,http://localhost:3000"
fi

# ---------------------------------------------------------------------------
step "7c. Ensure swap exists (WAHA chrome needs headroom)"
# ---------------------------------------------------------------------------
if swapon --show 2>/dev/null | grep -q .; then
  ok "Swap already enabled: $(free -h | awk '/Swap/{print $2}')"
else
  warn "No swap detected — creating 2G swapfile (WAHA chrome was OOM-killed at 1G)..."
  fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q "/swapfile" /etc/fstab 2>/dev/null || echo "/swapfile none swap sw 0 0" >> /etc/fstab
  ok "2G swap enabled"
fi

# ---------------------------------------------------------------------------
step "8. Test and reload nginx"
# ---------------------------------------------------------------------------
nginx -t && systemctl reload nginx && ok "Nginx reloaded" || warn "Nginx config test failed — check config manually"

# ---------------------------------------------------------------------------
step "9. Verify endpoints"
# ---------------------------------------------------------------------------
echo ""
echo "--- / (backend root) ---"
curl -s http://localhost/ | python3 -m json.tool 2>/dev/null || curl -s http://localhost/ || echo "(no response)"

echo ""
echo "--- /health ---"
curl -s http://localhost/health | python3 -m json.tool 2>/dev/null || curl -s http://localhost/health || echo "(no response)"

echo ""
echo "--- /api/health (Vercel rewrite target - expect 200) ---"
curl -s http://localhost/api/health | python3 -m json.tool 2>/dev/null || curl -s http://localhost/api/health || echo "(no response - backend predates /api/health alias, redeploy)"

echo ""
echo "--- /api/businesses (expect 401) ---"
curl -s -o /dev/null -w "HTTP %{http_code}" http://localhost/api/businesses

echo ""
echo ""

# ---------------------------------------------------------------------------
step "10. WAHA WhatsApp session status"
# ---------------------------------------------------------------------------
WAHA_KEY=$(grep WAHA_API_KEY .env 2>/dev/null | cut -d= -f2 | tr -d '\r\n' || echo "")
if [ -n "$WAHA_KEY" ]; then
  echo "WAHA sessions:"
  curl -s -H "X-Api-Key: $WAHA_KEY" http://localhost:3001/api/sessions 2>/dev/null | \
    python3 -m json.tool 2>/dev/null || echo "(WAHA not ready yet)"
else
  warn "WAHA_API_KEY not found in .env — check .env file"
fi

# ---------------------------------------------------------------------------
step "11. Summary"
# ---------------------------------------------------------------------------
echo ""
docker compose ps
echo ""
echo "=========================================="
echo " PUBLIC CHECKS (from internet):"
echo "  curl http://206.189.179.60/"
echo "  curl http://206.189.179.60/health"
echo "  curl https://waflo.vercel.app"
echo "  curl https://waflo.vercel.app/api/health"
echo "=========================================="
echo ""
echo "NEXT STEPS:"
echo "  1. If /health still 503 — check 'docker logs backend --tail 50' for DB errors"
echo "     (Redis no longer fails /health; status shows 'degraded' instead)"
echo "  2. Add GitHub secrets (see below) so CI/CD auto-deploys on push"
echo "     Required: DEPLOY_HOST, DEPLOY_USER, DEPLOY_SSH_KEY, DEPLOY_PATH,"
echo "               POSTGRES_USER, POSTGRES_DB, POSTGRES_PASSWORD"
echo "  3. waflo.com stays on Vercel (CNAME -> cname.vercel-dns.com). No SSL script"
echo "     needed on the droplet; Vercel handles frontend TLS."
echo ""
echo "GitHub secrets to add at:"
echo "  https://github.com/premtrade/whatsapp-sales-assistant/settings/environments"
echo "  Create environment: 'production'"
echo "  DEPLOY_HOST     = 206.189.179.60"
echo "  DEPLOY_USER     = root"
echo "  DEPLOY_SSH_KEY  = <paste the private SSH key authorized on this droplet>"
echo "  DEPLOY_PATH     = $REPO_DIR"
echo "  POSTGRES_USER   = $(grep POSTGRES_USER .env 2>/dev/null | head -1 | cut -d= -f2 | tr -d '\r\n' || echo 'waflo')"
echo "  POSTGRES_DB     = $(grep POSTGRES_DB .env 2>/dev/null | head -1 | cut -d= -f2 | tr -d '\r\n' || echo 'waflo')"

