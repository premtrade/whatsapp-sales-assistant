# WAFLO Production Deployment Guide

## Prerequisites

- VPS with Ubuntu 22.04 or 24.04 (1 CPU, 2GB RAM minimum)
- Domain name pointing to your VPS IP
- SSH access to the server

## Step 1: Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh

# Install Docker Compose
sudo apt install docker-compose-plugin -y

# Install Nginx
sudo apt install nginx -y

# Install Certbot for SSL
sudo apt install certbot python3-certbot-nginx -y

# Verify installations
docker --version
docker compose version
nginx -v
```

Use Docker Compose v2.24.4 or newer; the production file replaces the base
port mappings so services stay reachable only from the Droplet itself.

## Step 2: Clone Repository

```bash
# Clone your repo
git clone https://github.com/premtrade/whatsapp-sales-assistant.git
cd whatsapp-sales-assistant

# Create production environment file from the template
cp .env.example .env
nano .env
```

**Important:** The project root `.env` is the single source of truth for all passwords and secrets. `docs/env.production.example` is only a documentation template showing the production shape of that file — do not copy its placeholder values into a real deployment. If the Postgres password in your `.env` differs from what is already running in Docker, Postgres will refuse connections.

## Step 3: Environment Variables

Fill in the root `.env` file with your production values. At minimum, change these placeholders:

```env
POSTGRES_PASSWORD=YOUR_SECURE_PASSWORD
POSTGRES_DB=whatsapp_sales
POSTGRES_USER=postgres
JWT_SECRET=YOUR_SECURE_JWT_SECRET_MIN_32_CHARS
GEMINI_API_KEY=your_gemini_api_key
GROQ_API_KEY=your_groq_api_key
WAHA_API_KEY=your_waha_api_key
N8N_API_KEY=your_n8n_api_key
ENCRYPTION_KEY=YOUR_SECURE_ENCRYPTION_KEY_32_CHARS
```

Do not start the base Compose file by itself on the Droplet. It publishes
service ports beyond localhost; use the production pair in Step 5.

## Step 4: Firewall Configuration

```bash
# Allow SSH, HTTP, HTTPS
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw enable
```

## Step 5: Start Services

```bash
# Start all services with localhost-only service ports
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Verify all services are running
docker compose ps

# Check logs
docker compose logs -f backend
```

## Step 6: SSL Certificate

```bash
# Stop Nginx temporarily
sudo systemctl stop nginx

# Get SSL certificate
sudo certbot certonly --standalone -d waflo.com -d www.waflo.com

# Start Nginx
sudo systemctl start nginx

# Test auto-renewal
sudo certbot renew --dry-run
```

## Step 7: Verify Deployment

```bash
# Check all services are running
docker compose ps

# Test health endpoint
curl https://waflo.com/health

# Test API
curl https://waflo.com/api/health

# Check Nginx logs
sudo tail -f /var/log/nginx/access.log
```

## Step 9: Set Up Backups

```bash
# Create backup script
cat > /home/backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/home/backups"
DATE=$(date +%Y%m%d_%H%M%S)

# Backup PostgreSQL
docker compose exec postgres pg_dump -U waflo waflo > $BACKUP_DIR/postgres_$DATE.sql

# Backup volumes
docker run --rm -v waflo_postgres_data:/data -v $BACKUP_DIR:/backup alpine tar czf /backup/postgres_volume_$DATE.tar.gz /data
docker run --rm -v waflo_qdrant_data:/data -v $BACKUP_DIR:/backup alpine tar czf /backup/qdrant_volume_$DATE.tar.gz /data

# Keep only last 7 days
find $BACKUP_DIR -name "*.sql" -mtime +7 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete
EOF

chmod +x /home/backup.sh

# Add to crontab (daily at 2 AM)
(crontab -l 2>/dev/null; echo "0 2 * * * /home/backup.sh") | crontab -
```

## Step 10: Monitoring

```bash
# Install monitoring (optional)
docker run -d \
  --name=portainer \
  --restart=always \
  -p 9000:9000 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  portainer/portainer-ce
```

## Step 11: Domain Configuration

Point your domain to the VPS IP:

**Option A: Nameservers (recommended)**
- Update domain registrar to use Vercel nameservers if using Vercel for frontend
- Or point to your VPS nameservers

**Option B: A records**
```
A    @           YOUR_VPS_IP
A    www         YOUR_VPS_IP
```

## Troubleshooting

### Services won't start
```bash
# Check logs
docker compose logs backend
docker compose logs postgres
```

### Port conflicts
```bash
# Check what's using port 80/443
sudo lsof -i :80
sudo lsof -i :443
```

### SSL issues
```bash
# Renew certificate
sudo certbot renew
sudo systemctl reload nginx
```

## Maintenance

### Update application
```bash
cd whatsapp-sales-assistant
git pull origin main
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

### View logs
```bash
docker compose logs -f [service-name]
```

### Restart services
```bash
docker compose restart
```

## Security Checklist

- [ ] Change default passwords in `.env`
- [ ] Use strong JWT_SECRET (32+ random characters)
- [ ] Enable firewall (UFW)
- [ ] Disable root SSH login
- [ ] Use SSH keys instead of passwords
- [ ] Enable automatic security updates
- [ ] Regular backups configured
- [ ] SSL certificates installed
- [ ] Domain privacy enabled at registrar

## Moving to a New Droplet IP

The Droplet address cannot be read from an environment variable by `frontend/vercel.json` (Vercel
does not interpolate env vars in `vercel.json`), so it is written literally. After a Droplet rebuild
or IP change, update **all** of these — the dashboard fails silently (API calls 502) if any is missed:

| File | What to change |
| ---- | -------------- |
| `frontend/vercel.json` | the three `rewrites[].destination` hosts (`/api`, `/health`, `/ws`) |
| `scripts/setup-ssl.sh` | `DROPLET_IP` default (or export `DROPLET_IP=<new-ip>` before running it) |
| `scripts/setup-vps-for-vercel.sh` | nginx `server_name` and the health-check/summary URLs |
| `scripts/fix-droplet.sh` | the ssh/curl/`DEPLOY_HOST` hints echoed at the end |

Then redeploy the frontend (`vercel --prod`) and reload nginx. `CORS_ORIGINS` in `.env` does not need
the IP — it lists the frontend origins that are allowed to call the API.
