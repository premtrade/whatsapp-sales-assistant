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

## Step 2: Clone Repository

```bash
# Clone your repo
git clone https://github.com/premtrade/whatsapp-sales-assistant.git
cd whatsapp-sales-assistant

# Create production environment file
cp .env.example .env
nano .env
```

## Step 3: Environment Variables

Create `.env` with these production values:

```env
# Application
NODE_ENV=production
PORT=4000
FRONTEND_URL=https://waflo.com

# Database
DATABASE_URL=postgresql://waflo:YOUR_SECURE_PASSWORD@postgres:5432/waflo
POSTGRES_USER=waflo
POSTGRES_PASSWORD=YOUR_SECURE_PASSWORD
POSTGRES_DB=waflo

# Redis
REDIS_URL=redis://redis:6379
REDIS_PASSWORD=YOUR_SECURE_PASSWORD

# JWT
JWT_SECRET=YOUR_SECURE_JWT_SECRET_MIN_32_CHARS

# Gemini AI
GEMINI_API_KEY=your_gemini_api_key

# Groq LLM
GROQ_API_KEY=your_groq_api_key

# WhatsApp (WAHA)
WAHA_API_URL=http://waha:3000
WAHA_API_KEY=your_waha_api_key
WHATSAPP_SESSION=default

# Qdrant
QDRANT_URL=http://qdrant:6333
QDRANT_API_KEY=your_qdrant_api_key

# n8n
N8N_URL=http://n8n:5678
N8N_API_KEY=your_n8n_api_key

# Encryption
ENCRYPTION_KEY=YOUR_SECURE_ENCRYPTION_KEY_32_CHARS
```

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
# Start all services
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

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

## Step 7: Update Docker Compose

```bash
# Use production compose file
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## Step 8: Verify Deployment

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
