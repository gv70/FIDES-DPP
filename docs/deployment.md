# Deployment Guide - FIDES-DPP

This guide covers deployment options for FIDES-DPP from development to production.

**Important**: Docker Compose is the **reference reproducibility path for CI and fresh environments**. Local installs are valid for development. Both paths produce identical results. See [TESTING_GUIDE.md](./TESTING_GUIDE.md) for dual-path instructions.

## Deployment Profiles

FIDES-DPP supports three deployment profiles via Docker Compose:

| Profile | Services | Storage | Walt.id | Use Case |
|---------|----------|---------|---------|----------|
| **default** (FOSS-only) | kubo + fidesdpp | File-based | No | Development, testing |
| **stateful** | kubo + postgres + fidesdpp | PostgreSQL | No | Production-ready FOSS |
| **enhanced** | kubo + postgres + walt.id + fidesdpp | PostgreSQL | Yes | Full features (optional) |

## Prerequisites

- Docker 24.0+ and Docker Compose 2.20+
- 2GB RAM minimum (4GB recommended)
- 10GB disk space
- Network access to Polkadot RPC and UNTP schema URLs

## Quick Start (Development)

### 1. Clone Repository

```bash
git clone https://github.com/gv70/FIDES-DPP.git
cd FIDES-DPP
```

### 2. Configure Environment

```bash
cp .env.example .env

# Edit .env (optional, defaults work for dev):
# CONTRACT_ADDRESS=0x2b7da3eab6f9660e7bfadc5ea0076e5883b6f11f
# POLKADOT_RPC_URL=wss://westend-asset-hub-rpc.polkadot.io
# STORAGE_BACKEND=file
```

For local development outside Docker, use the web app env file:

```bash
cp fidesdpp/.env.example fidesdpp/.env.local
```

Issuer state is stored locally in `data/issuers.json` (Docker Compose volume) or `fidesdpp/data/issuers.json` (local runs). This file is not committed.

Sandbox test mode (no domain) stores state in `fidesdpp/data/issuers.test.json` and is enabled by setting `FIDES_MODE=test`.

### 3. Start Services (FOSS-only)

```bash
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f fidesdpp
```

### 4. Access Application

- Web UI: http://localhost:3000
- IPFS API: http://127.0.0.1:5001
- IPFS Gateway: http://127.0.0.1:8080

## Production Deployment

### Profile: stateful (Recommended for Production)

```bash
# 1. Set production environment
cat > .env <<EOF
NODE_ENV=production
CONTRACT_ADDRESS=0x2b7da3eab6f9660e7bfadc5ea0076e5883b6f11f
POLKADOT_RPC_URL=wss://westend-asset-hub-rpc.polkadot.io

# Storage
STORAGE_BACKEND=postgres
DATABASE_URL=postgresql://fides:CHANGE_ME_STRONG_PASSWORD@postgres:5432/fides_dpp
POSTGRES_PASSWORD=CHANGE_ME_STRONG_PASSWORD

# IPFS
IPFS_BACKEND=kubo
IPFS_NODE_URL=http://kubo:5001
IPFS_GATEWAY_URL=http://kubo:8080

# URLs (use your domain)
IDR_BASE_URL=https://dpp.example.com
RENDER_BASE_URL=https://dpp.example.com

# UNTP
UNTP_SCHEMA_URL=https://test.uncefact.org/vocabulary/untp/dpp/untp-dpp-schema-0.6.0.json
EOF

# 2. Start with stateful profile
docker-compose --profile stateful up -d

# 3. Verify PostgreSQL initialized
docker-compose logs postgres | grep "database system is ready"

# 4. Verify app healthy
curl http://localhost:3000/api/health
```

### Profile: enhanced (With walt.id)

```bash
# Additional config in .env:
echo "USE_WALT_ID=true" >> .env
echo "USE_WALT_ID_DIDWEB=true" >> .env
echo "WALT_ID_ISSUER_URL=http://waltid-issuer:7002" >> .env

# Start with enhanced profile
docker-compose --profile enhanced up -d

# Verify walt.id running
docker-compose logs waltid-issuer

# Test without walt.id (fallback)
USE_WALT_ID=false USE_WALT_ID_DIDWEB=false docker-compose up fidesdpp
```

## Persistence & Data Management

### File-based Storage (Default)

Data location: `./data/` (Docker volume mount)

```bash
# Backup data
tar -czf fides-data-backup-$(date +%Y%m%d).tar.gz ./data/

# Restore data
tar -xzf fides-data-backup-20251211.tar.gz
```

Files:
- `./data/status-lists.json` - Status List mappings
- `./data/issuers.json` - DID:web issuer keys and authorized accounts

### PostgreSQL Storage (Stateful Profile)

Data location: `postgres-data` Docker volume

```bash
# Backup database
docker-compose exec postgres pg_dump -U fides fides_dpp > backup.sql

# Restore database
docker-compose exec -T postgres psql -U fides fides_dpp < backup.sql

# Access PostgreSQL
docker-compose exec postgres psql -U fides fides_dpp
```

## Volumes

| Volume | Purpose | Backup? |
|--------|---------|---------|
| `ipfs-data` | IPFS blocks | Yes (important) |
| `postgres-data` | Status List state | Yes (critical) |
| `waltid-data` | Walt.id state (optional) | Optional |
| `./data` | File-based storage | Yes (critical) |

## Security Hardening

### 1. Change Default Passwords

```bash
# Generate strong password
openssl rand -base64 32

# Update in .env:
POSTGRES_PASSWORD=<generated_password>
DATABASE_URL=postgresql://fides:<generated_password>@postgres:5432/fides_dpp
```

### 2. Use Image Digests (Supply-chain Security)

```yaml
# In docker-compose.yml, replace tags with digests:
kubo:
  image: ipfs/kubo@sha256:7c7e3f5c4d8e9f0a...  # Example digest

waltid-issuer:
  image: waltid/issuer-api@sha256:abc123...  # See DEPENDENCIES.md
```

Get current digest:
```bash
docker pull waltid/issuer-api:1.2.0
docker inspect waltid/issuer-api:1.2.0 | grep "RepoDigests" -A 1
```

### 3. Build walt.id from Source

```yaml
# In docker-compose.yml, uncomment build section:
waltid-issuer:
  build:
    context: https://github.com/walt-id/waltid-identity.git#v1.2.0
    dockerfile: waltid-issuer-api/Dockerfile
```

### 4. Run Behind Reverse Proxy

```nginx
# Example nginx configuration
server {
  listen 443 ssl http2;
  server_name dpp.example.com;
  
  ssl_certificate /etc/ssl/certs/dpp.example.com.crt;
  ssl_certificate_key /etc/ssl/private/dpp.example.com.key;
  
  location / {
    proxy_pass http://localhost:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
  
  # DID document (did:web hosting)
  location /.well-known/did.json {
    proxy_pass http://localhost:3000/.well-known/did.json;
  }
}
```

## Monitoring

### Health Checks

```bash
# App health
curl http://localhost:3000/api/health

# IPFS health
curl http://127.0.0.1:5001/api/v0/id

# PostgreSQL health
docker-compose exec postgres pg_isready -U fides

# Walt.id health (if enabled)
curl http://localhost:7002/health  # Only if healthchecks feature configured
```

### Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f fidesdpp

# Filter for errors
docker-compose logs fidesdpp | grep -i error
```

## Troubleshooting

### "IPFS connection failed"

**Symptoms**: App shows "IPFS disconnected"

**Solution**:
```bash
# Check kubo logs
docker-compose logs kubo

# Restart kubo
docker-compose restart kubo

# Verify connectivity
curl http://127.0.0.1:5001/api/v0/id
```

### "Database connection error"

**Symptoms**: "DATABASE_URL not set" or connection refused

**Solution**:
```bash
# Ensure postgres is running
docker-compose ps postgres

# Check DATABASE_URL in .env matches postgres service

# Test connection
docker-compose exec postgres psql -U fides -d fides_dpp -c "SELECT 1"
```

### "Walt.id service unavailable"

**Symptoms**: Startup warnings about walt.id

**Solution**:
```bash
# If not using walt.id (default), ignore warnings

# If using walt.id:
docker-compose --profile enhanced up -d

# Check walt.id logs
docker-compose logs waltid-issuer

# Verify USE_WALT_ID flags in .env
```

## Scaling

### Horizontal Scaling

For multi-instance deployments:

1. Use PostgreSQL (required for shared state)
2. Use external IPFS cluster or Pinata
3. Add load balancer (nginx, HAProxy)
4. Consider Redis for prepared passport cache

```yaml
# Example docker-compose.override.yml for scaling
services:
  fidesdpp:
    deploy:
      replicas: 3
    
  postgres:
    environment:
      - POSTGRES_MAX_CONNECTIONS=100
```

### Vertical Scaling

Resource limits:

```yaml
services:
  fidesdpp:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G
```

## Maintenance

### Regular Tasks

```bash
# 1. Vacuum PostgreSQL (weekly)
docker-compose exec postgres vacuumdb -U fides -d fides_dpp -z

# 2. Garbage collect IPFS (weekly)
docker-compose exec kubo ipfs repo gc

# 3. Check disk usage
docker system df -v

# 4. Update dependencies (monthly)
cd fidesdpp && npm audit fix
```

### Upgrades

```bash
# 1. Backup data (choose one)
# File-based: tar -czf fides-data-backup-$(date +%Y%m%d).tar.gz ./data/
# PostgreSQL: docker-compose exec postgres pg_dump -U fides fides_dpp > backup.sql

# 2. Pull new image
docker-compose pull

# 3. Rebuild
docker-compose build

# 4. Restart with new version
docker-compose up -d

# 5. Verify
curl http://localhost:3000/api/health
```

## License

This deployment guide: Apache-2.0
