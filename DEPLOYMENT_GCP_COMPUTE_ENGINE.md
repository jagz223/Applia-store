# GenFeb S.A.S. - Google Cloud Compute Engine Deployment Guide

> **Version:** 1.0  
> **Last Updated:** 2026-02-25  
> **Project:** GenFeb S.A.S. - Plataforma de Servicios  
> **Stack:** React + Express.js + TypeScript + PostgreSQL + Drizzle ORM

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [GCP Project Setup](#gcp-project-setup)
4. [VM Instance Configuration](#vm-instance-configuration)
5. [PostgreSQL Database Setup](#postgresql-database-setup)
6. [Nginx Configuration](#nginx-configuration)
7. [SSL/TLS with Let's Encrypt](#ssltls-with-lets-encrypt)
8. [PM2 Process Management](#pm2-process-management)
9. [Firewall Rules](#firewall-rules)
10. [DNS and Domain Configuration](#dns-and-domain-configuration)
11. [Environment Variables](#environment-variables)
12. [Deployment Steps](#deployment-steps)
13. [Scalability Options](#scalability-options)
14. [Monitoring and Maintenance](#monitoring-and-maintenance)

---

## Architecture Overview

```mermaid
flowchart TB
    subgraph "Google Cloud Platform"
        subgraph "VPC Network"
            subgraph "GenFeb VM"
                Nginx["Nginx<br/>Reverse Proxy<br/>:80, :443"]
                PM2["PM2<br/>Process Manager"]
                NodeJS["Node.js/Express<br/>:5000"]
                SocketIO["Socket.IO<br/>Real-time"]
            end
            CloudSQL["Cloud SQL<br/>PostgreSQL<br/>:5432"]
            Firewall["Cloud Firewall<br/>Rules"]
        end
    end
    
    Users((Users)) -->|HTTPS| DNS["Domain<br/>DNS"]
    DNS -->|443| Firewall
    Firewall -->|443| Nginx
    Nginx -->|5000| NodeJS
    NodeJS -->|5432| CloudSQL
    
    style Nginx fill:#009639,color:#fff
    style PM2 fill:#009639,color:#fff
    style NodeJS fill:#009639,color:#fff
    style CloudSQL fill:#4285F4,color:#fff
    style Firewall fill:#EA4335,color:#fff
```

### Components

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Reverse Proxy** | Nginx | SSL termination, static file serving, load balancing |
| **Application Server** | Express.js + Node.js | API server, Socket.IO, business logic |
| **Database** | PostgreSQL (Cloud SQL) | Persistent data storage |
| **Process Manager** | PM2 | Application lifecycle management |
| **SSL/TLS** | Let's Encrypt + Certbot | HTTPS encryption |
| **Firewall** | GCP Cloud Firewall | Network security |

---

## Prerequisites

### Required Accounts and Tools

- [ ] Google Cloud Platform account with billing enabled
- [ ] Domain name registered (e.g., `genfeb.com`)
- [ ] gcloud CLI installed locally
- [ ] SSH key pair for VM access

### Verify gcloud CLI Installation

```bash
gcloud --version
# Expected: Google Cloud SDK 400.x.x

gcloud auth login
gcloud config set project PROJECT_ID
```

---

## GCP Project Setup

### 1. Create New Project

```bash
# Create project
gcloud projects create genfeb-production --name="GenFeb Production"

# Set as default
gcloud config set project genfeb-production

# Enable billing (via GCP Console)
```

### 2. Enable Required APIs

```bash
# Enable Compute Engine API
gcloud services enable compute.googleapis.com

# Enable Cloud SQL API
gcloud services enable sqladmin.googleapis.com

# Enable Cloud DNS API
gcloud services enable dns.googleapis.com
```

---

## VM Instance Configuration

### Recommended Instance Type

For **small traffic (up to 100 concurrent users)**:

| Resource | Configuration |
|----------|---------------|
| **Machine Type** | e2-standard-2 (2 vCPU, 8GB RAM) |
| **Zone** | us-central1-a (or closest to users) |
| **Boot Disk** | 20 GB SSD Persistent Disk |
| **Operating System** | Ubuntu 22.04 LTS |

### Create the VM Instance

```bash
# Create VM instance
gcloud compute instances create genfeb-server \
    --machine-type=e2-standard-2 \
    --zone=us-central1-a \
    --boot-disk-size=20GB \
    --boot-disk-type=pd-ssd \
    --image-family=ubuntu-2204-lts \
    --image-project=ubuntu-os-cloud \
    --tags=http-server,https-server \
    --scopes=cloud-platform \
    --metadata-from-file startup-script=startup.sh
```

### Startup Script (startup.sh)

Create a `startup.sh` file:

```bash
#!/bin/bash
set -e

echo "=== GenFeb Server Startup Script ==="
echo "Starting at $(date)"

# Update system
apt-get update
apt-get upgrade -y

# Install required packages
apt-get install -y curl wget git nginx certbot python3-certbot-nginx postgresql-client

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Install PM2 globally
npm install -g pm2

# Create application directory
mkdir -p /var/www/genfeb
mkdir -p /var/log/genfeb

# Set permissions
chown -R $USER:$USER /var/www/genfeb
chmod -R 755 /var/www/genfeb

echo "=== Startup script completed ==="
```

---

## PostgreSQL Database Setup

### Option A: Cloud SQL (Recommended)

Cloud SQL provides managed PostgreSQL with automatic backups, high availability, and easier maintenance.

```bash
# Create Cloud SQL instance
gcloud sql instances create genfeb-db \
    --database-version=POSTGRES_16 \
    --tier=db-f1-micro \
    --zone=us-central1-a \
    --storage-type=SSD \
    --storage-size=10GB \
    --enable-google-owned-connection-plugin

# Create database
gcloud sql databases create mango_db --instance=genfeb-db

# Create user
gcloud sql users create mango --instance=genfeb-db --password=mango_pass_strong

# Get connection string
gcloud sql instances describe genfeb-db
# Note: Connection string format: /cloudsql/PROJECT_ID:REGION:INSTANCE_NAME
```

**Connection String (for .env):**
```
postgresql://mango:mango_pass_strong@/mango_db?host=/cloudsql/PROJECT_ID:us-central1-a:genfeb-db
```

### Option B: Self-Hosted PostgreSQL on VM

If you prefer self-hosted (lower cost):

```bash
# SSH into VM
gcloud compute ssh genfeb-server --zone=us-central1-a

# Install PostgreSQL
sudo apt-get update
sudo apt-get install -y postgresql-16

# Configure PostgreSQL
sudo -u postgres psql

# In PostgreSQL console:
CREATE USER mango WITH PASSWORD 'mango_pass_strong';
CREATE DATABASE mango_db OWNER mango;
GRANT ALL PRIVILEGES ON DATABASE mango_db TO mango;

# Exit psql
\q
```

**Connection String (for .env):**
```
postgresql://mango:mango_pass_strong@localhost:5432/mango_db
```

---

## Nginx Configuration

### Create Nginx Configuration

Create `/etc/nginx/sites-available/genfeb`:

```nginx
server {
    listen 80;
    server_name genfeb.com www.genfeb.com;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Static files (React build)
    location / {
        root /var/www/genfeb/dist/public;
        index index.html;
        try_files $uri $uri/ /index.html;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # API requests - proxy to Node.js
    location /api {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Socket.IO - WebSocket support
    location /socket.io {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket timeouts
        proxy_read_timeout 86400;
    }

    # Health check endpoint
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
}

# HTTP to HTTPS redirect
server {
    listen 80;
    server_name _;
    return 301 https://$host$request_uri;
}
```

### Enable the Configuration

```bash
# Create symbolic link
sudo ln -s /etc/nginx/sites-available/genfeb /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

---

## SSL/TLS with Let's Encrypt

### Install Certbot

```bash
# Install certbot
sudo apt-get install -y certbot python3-certbot-nginx

# Obtain SSL certificate
sudo certbot --nginx -d genfeb.com -d www.genfeb.com

# Follow prompts:
# - Enter email address
# - Agree to Terms of Service
# - Choose whether to redirect HTTP to HTTPS
```

### Auto-Renewal Configuration

```bash
# Test auto-renewal
sudo certbot renew --dry-run

# Check renewal timer
sudo systemctl list-timers | grep certbot
```

**Certificate renewal is automatic and runs twice daily.**

---

## PM2 Process Management

### Install PM2

```bash
# Install globally
npm install -g pm2

# Setup PM2 startup script
pm2 startup
# Follow the output to configure systemd service
```

### Create Ecosystem File

Create `/var/www/genfeb/ecosystem.config.js`:

```javascript
module.exports = {
  apps: [
    {
      name: 'genfeb-server',
      script: 'dist/index.cjs',
      cwd: '/var/www/genfeb',
      instances: 1,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 5000
      },
      error_file: '/var/log/genfeb/error.log',
      out_file: '/var/log/genfeb/out.log',
      log_file: '/var/log/genfeb/combined.log',
      time: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      kill_timeout: 5000,
      listen_timeout: 5000,
      shutdown_with_message: true,
      max_restarts: 10,
      min_uptime: '10s'
    }
  ]
};
```

### PM2 Commands

```bash
# Start application
cd /var/www/genfeb
pm2 start ecosystem.config.js

# Save PM2 process list
pm2 save

# View status
pm2 status

# View logs
pm2 logs genfeb-server

# Restart
pm2 restart genfeb-server

# Stop
pm2 stop genfeb-server

# View monit
pm2 monit
```

---

## Firewall Rules

### GCP Cloud Firewall

```bash
# Allow HTTP/HTTPS
gcloud compute firewall-rules create allow-http-https \
    --allow tcp:80,tcp:443 \
    --source-ranges 0.0.0.0/0 \
    --target-tags http-server,https-server \
    --description "Allow HTTP and HTTPS"

# Allow SSH (limit to your IP for security)
gcloud compute firewall-rules create allow-ssh \
    --allow tcp:22 \
    --source-ranges YOUR_IP/32 \
    --description "Allow SSH from specific IP"

# Allow internal communication
gcloud compute firewall-rules create allow-internal \
    --allow tcp:0-65535,udp:0-65535 \
    --source-ranges 10.128.0.0/9 \
    --description "Allow internal GCP traffic"
```

### UFW (Optional - VM-level)

```bash
# Enable UFW
sudo ufw enable

# Allow SSH
sudo ufw allow 22/tcp

# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Check status
sudo ufw status
```

---

## DNS and Domain Configuration

### 1. Reserve Static IP Address

```bash
# Create static IP
gcloud compute addresses create genfeb-ip \
    --region=us-central1

# Get the IP
gcloud compute addresses describe genfeb-ip --region=us-central1
# Note: IP address (e.g., 34.123.45.67)
```

### 2. Configure DNS Records

In your domain registrar (GoDaddy, Namecheap, etc.) or GCP Cloud DNS:

| Record Type | Name | Value | TTL |
|-------------|------|-------|-----|
| A | @ | 34.123.45.67 | 300 |
| A | www | 34.123.45.67 | 300 |
| AAAA | @ | (IPv6 if available) | 300 |

### 3. Using Cloud DNS (Optional)

```bash
# Create managed zone
gcloud dns managed-zones create genfeb-zone \
    --dns-name=genfeb.com \
    --description="GenFeb Production Zone"

# Add record set
gcloud dns record-sets create genfeb.com \
    --zone=genfeb-zone \
    --type=A \
    --ttl=300 \
    --rrdatas=34.123.45.67

# Add www record
gcloud dns record-sets create www.genfeb.com \
    --zone=genfeb-zone \
    --type=A \
    --ttl=300 \
    --rrdatas=34.123.45.67
```

---

## Environment Variables

### Production .env File

Create `/var/www/genfeb/.env`:

```bash
# ===========================================
# GENFEB S.A.S. - PRODUCTION ENVIRONMENT
# ===========================================

# Database - Cloud SQL
DATABASE_URL=postgresql://mango:mango_pass_strong@/mango_db?host=/cloudsql/PROJECT_ID:us-central1-a:genfeb-db

# Enable PostgreSQL
ENABLE_DATABASE=true

# JWT Authentication
JWT_SECRET=YOUR_SUPER_SECURE_JWT_SECRET_MIN_32_CHARS
JWT_EXPIRES_IN=7d
SESSION_SECRET=YOUR_SESSION_SECRET_MIN_32_CHARS

# Stripe Payments (Production Keys)
STRIPE_SECRET_KEY=sk_live_your_stripe_live_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

# Google Maps
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key

# Firebase Admin (Production)
FIREBASE_PROJECT_ID=genfeb-sas
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@genfeb-sas.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY\n-----END PRIVATE KEY-----\n"

# PayPal (Production)
PAYPAL_CLIENT_ID=your_paypal_client_id
PAYPAL_CLIENT_SECRET=your_paypal_client_secret
PAYPAL_MODE=live

# Frontend URL (Production Domain)
FRONTEND_URL=https://genfeb.com

# Node Environment
NODE_ENV=production
PORT=5000
```

### Generate Secure Secrets

```bash
# Generate JWT secret (32+ characters)
openssl rand -base64 32

# Generate session secret
openssl rand -base64 32
```

---

## Deployment Steps

### Step 1: Prepare Local Build

```bash
# Install dependencies
npm install

# Build the application
npm run build

# Verify build output
ls -la dist/
```

### Step 2: Upload Files to VM

```bash
# Create archive
tar -czvf genfeb-deploy.tar.gz \
    dist/ \
    package.json \
    package-lock.json \
    node_modules/ \
    .env

# Upload to VM
gcloud compute scp genfeb-deploy.tar.gz genfeb-server:/var/www/genfeb/ \
    --zone=us-central1-a

# SSH into VM
gcloud compute ssh genfeb-server --zone=us-central1-a
```

### Step 3: Install Dependencies on VM

```bash
cd /var/www/genfeb

# Extract files
tar -xzvf genfeb-deploy.tar.gz

# Install production dependencies
npm ci --only=production

# Or if package-lock is not available
npm install --production
```

### Step 4: Database Migration

```bash
# Run Drizzle migrations
npm run db:push
```

### Step 5: Start Application

```bash
# Start with PM2
cd /var/www/genfeb
pm2 start ecosystem.config.js

# Verify it's running
pm2 status
curl http://localhost:5000/api/health
```

### Step 6: Verify SSL/HTTPS

```bash
# Test HTTPS
curl -I https://genfeb.com

# Test SSL certificate
curl -I -v https://genfeb.com 2>&1 | grep -i "SSL"
```

---

## Scalability Options

### Horizontal Scaling Architecture

```mermaid
flowchart LR
    LB["Load Balancer<br/>GCP HTTP/S"]
    
    subgraph "Managed Instance Group"
        VM1["VM Instance 1"]
        VM2["VM Instance 2"]
        VM3["VM Instance 3"]
    end
    
    subgraph "Cloud SQL"
        DB1["Primary"]
        DB2["Replica (HA)"]
    end
    
    LB --> VM1
    LB --> VM2
    LB --> VM3
    
    VM1 --> DB1
    VM2 --> DB1
    VM3 --> DB1
    DB1 -.-> DB2
```

### Scaling Recommendations

| Traffic Level | VM Configuration | Database |
|---------------|------------------|----------|
| **Small** (0-100 users) | 1x e2-standard-2 | Cloud SQL db-f1-micro |
| **Medium** (100-500 users) | 2x e2-standard-4 | Cloud SQL db-g1-small |
| **Large** (500+ users) | Managed Instance Group | Cloud SQL HA (db-n1-standard) |

### Implementation Steps for Scaling

1. **Create Instance Template:**
   ```bash
   gcloud compute instance-templates create genfeb-template \
       --machine-type=e2-standard-2 \
       --boot-disk-size=20GB \
       --image-family=ubuntu-2204-lts
   ```

2. **Create Managed Instance Group:**
   ```bash
   gcloud compute instance-groups managed create genfeb-group \
       --size=2 \
       --template=genfeb-template \
       --zone=us-central1-a
   ```

3. **Set Up Load Balancer:**
   - Create health check
   - Create backend service
   - Configure URL map
   - Create target proxy and forwarding rule

---

## Monitoring and Maintenance

### Health Checks

```bash
# Application health endpoint
curl https://genfeb.com/api/health

# PM2 process status
pm2 status
pm2 monit

# Nginx status
sudo systemctl status nginx
```

### Log Management

```bash
# Application logs
pm2 logs genfeb-server --lines 100

# Nginx access logs
sudo tail -f /var/log/nginx/access.log

# Nginx error logs
sudo tail -f /var/log/nginx/error.log
```

### Backup Strategy

| Component | Backup Frequency | Retention |
|-----------|------------------|-----------|
| Database (Cloud SQL) | Daily automatic | 30 days |
| Application files | Weekly | 7 backups |
| SSL certificates | Auto-renew | 90 days |

### Monitoring with Google Cloud Operations

```bash
# Install logging agent
curl -sSO https://dl.google.com/cloudagents/add-logging-agent-repo.sh
bash add-logging-agent-repo.sh
sudo apt-get update
sudo apt-get install -y stackdriver-agent

# Configure monitoring
gcloud monitoring dashboards create --config-from-file=dashboard.json
```

---

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| 502 Bad Gateway | Check if Node.js is running: `pm2 status` |
| SSL Certificate Error | Run: `sudo certbot renew` |
| Database Connection Failed | Verify DATABASE_URL and Cloud SQL proxy |
| Static Files Not Loading | Check Nginx root path and permissions |
| WebSocket Disconnects | Check proxy_read_timeout in Nginx |

### Emergency Rollback

```bash
# List PM2 saved processes
pm2 list

# Restore previous version
pm2 delete all
pm2 start ecosystem.config.js

# If needed, revert code
cd /var/www/genfeb
git checkout PREVIOUS_COMMIT
npm run build
pm2 restart genfeb-server
```

---

## Cost Estimation

### Monthly Costs (Small Traffic)

| Resource | Configuration | Estimated Cost |
|----------|---------------|----------------|
| **VM Instance** | e2-standard-2 | ~$40/month |
| **Cloud SQL** | db-f1-micro | ~$10/month |
| **Static IP** | 1 reserved | ~$3/month |
| ** egress** | ~50 GB | ~$4/month |
| **Total** | | **~$57/month** |

---

## Security Checklist

- [ ] Enable UFW firewall on VM
- [ ] Restrict SSH access to specific IP
- [ ] Use strong passwords and secrets
- [ ] Enable Cloud SQL private IP
- [ ] Configure SSL/TLS with Let's Encrypt
- [ ] Set up automated backups
- [ ] Enable Cloud Audit Logs
- [ ] Use GCP Secrets Manager for sensitive data

---

## Support and Resources

- [GCP Documentation](https://cloud.google.com/docs)
- [PM2 Documentation](https://pm2.keymetrics.io/docs/)
- [Let's Encrypt](https://letsencrypt.org/docs/)
- [Nginx Documentation](https://nginx.org/en/docs/)

---

*Generated for GenFeb S.A.S. - GCP Compute Engine Deployment*
