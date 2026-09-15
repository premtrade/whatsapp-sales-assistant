#!/bin/bash
# =============================================================================
# VPS Backend Exposure Script
# =============================================================================
# Run this script on your DigitalOcean VPS to expose the backend
# for Vercel frontend connectivity.
# =============================================================================

set -euo pipefail

echo "========================================"
echo "  Backend Exposure Setup for Vercel"
echo "========================================"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Step 1: Check if nginx is installed
echo ""
log_info "Step 1: Checking nginx installation..."
if command -v nginx &> /dev/null; then
    log_info "nginx is already installed"
else
    log_info "Installing nginx..."
    sudo apt update
    sudo apt install nginx -y
    log_info "nginx installed successfully"
fi

# Step 2: Check if backend is running
echo ""
log_info "Step 2: Checking backend status..."
if curl -s http://localhost:4000/health > /dev/null 2>&1; then
    log_info "Backend is running on port 4000"
else
    log_error "Backend is not responding on port 4000"
    log_info "Attempting to start backend..."
    cd ~/whatsapp-sales-assistant
    docker compose up -d backend
    sleep 5
    if curl -s http://localhost:4000/health > /dev/null 2>&1; then
        log_info "Backend started successfully"
    else
        log_error "Failed to start backend. Please check manually."
        exit 1
    fi
fi

# Step 3: Create nginx configuration
echo ""
log_info "Step 3: Creating nginx configuration..."
sudo tee /etc/nginx/sites-available/backend > /dev/null <<'EOF'
server {
    listen 80;
    server_name 206.189.179.60;

    # Increase client body size for file uploads
    client_max_body_size 50M;

    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # WebSocket support
    location /ws {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }
}
EOF
log_info "nginx configuration created"

# Step 4: Enable the site
echo ""
log_info "Step 4: Enabling backend site..."
sudo ln -sf /etc/nginx/sites-available/backend /etc/nginx/sites-enabled/backend

# Remove default site if it exists
if [ -f /etc/nginx/sites-enabled/default ]; then
    sudo rm /etc/nginx/sites-enabled/default
    log_info "Removed default nginx site"
fi

# Step 5: Test nginx configuration
echo ""
log_info "Step 5: Testing nginx configuration..."
if sudo nginx -t; then
    log_info "nginx configuration is valid"
else
    log_error "nginx configuration test failed"
    exit 1
fi

# Step 6: Restart nginx
echo ""
log_info "Step 6: Restarting nginx..."
sudo systemctl restart nginx
log_info "nginx restarted"

# Step 7: Open firewall
echo ""
log_info "Step 7: Configuring firewall..."
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
log_info "Firewall configured"

# Step 8: Verify backend is accessible
echo ""
log_info "Step 8: Verifying backend accessibility..."
sleep 2

if curl -s http://206.189.179.60/health > /dev/null 2>&1; then
    log_info "Backend is publicly accessible!"
    echo ""
    log_info "Testing health endpoint:"
    curl -s http://206.189.179.60/health | head -c 200
    echo ""
else
    log_error "Backend is not publicly accessible"
    log_info "Checking nginx error logs..."
    sudo tail -20 /var/log/nginx/error.log
fi

echo ""
echo "========================================"
log_info "Setup complete!"
echo ""
echo "  Backend URL: http://206.189.179.60"
echo "  Health Check: http://206.189.179.60/health"
echo ""
log_info "Next steps:"
echo "  1. Push frontend/vercel.json to GitHub"
echo "  2. Wait for Vercel to redeploy"
echo "  3. Visit https://waflo.vercel.app"
echo "========================================"
