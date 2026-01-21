# Open-Source-Only IPFS Setup

This guide shows how to run FIDES-DPP using open-source components only.

## Components

This setup uses:

- **Kubo (go-IPFS)**: MIT/Apache 2.0 dual-licensed
- **Helia**: MIT/Apache 2.0 dual-licensed  
- **FIDES-DPP**: Apache 2.0 licensed

No closed-source software is required for core functionality.

## Option 1: Kubo (Recommended for Production)

Kubo is the reference IPFS implementation in Go. It runs as a daemon and provides the full IPFS feature set.

### Installation

#### macOS (via Homebrew)

```bash
brew install ipfs
```

#### Linux (Debian/Ubuntu)

```bash
wget https://dist.ipfs.tech/kubo/v0.30.0/kubo_v0.30.0_linux-amd64.tar.gz
tar -xvzf kubo_v0.30.0_linux-amd64.tar.gz
cd kubo
sudo bash install.sh
```

#### Windows

Download from: https://dist.ipfs.tech/#kubo

Extract and add to PATH.

#### Verify Installation

```bash
ipfs --version
# Should show: ipfs version 0.30.0 (or later)
```

### Initialize and Run

```bash
# Initialize IPFS repository (first time only)
ipfs init

# Start IPFS daemon
ipfs daemon
```

You should see:

```
Daemon is ready
API server listening on /ip4/127.0.0.1/tcp/5001
Gateway server listening on /ip4/127.0.0.1/tcp/8080
```

**Keep the daemon running** while using FIDES-DPP.

### Configure FIDES-DPP

Create `.env.local` in `fidesdpp/` directory:

```bash
# IPFS Backend Selection
IPFS_BACKEND=kubo

# Kubo Configuration
IPFS_NODE_URL=http://127.0.0.1:5001
IPFS_GATEWAY_URL=http://127.0.0.1:8080
```

### Verify Setup

```bash
# Check Kubo is running
curl -X POST http://127.0.0.1:5001/api/v0/version

# Start FIDES-DPP
cd fidesdpp
npm run dev
```

Windows PowerShell notes:

- `curl` is an alias for `Invoke-WebRequest` and does not support `-X`. Use `curl.exe` or `Invoke-RestMethod`:

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:5001/api/v0/version
# or:
curl.exe -X POST http://127.0.0.1:5001/api/v0/version
```

Navigate to http://localhost:3000 and try creating a passport with IPFS enabled.

### Production Considerations

For production deployment:

1. **Run Kubo as a service**:
   ```bash
   # On systemd-based Linux
   sudo systemctl enable ipfs
   sudo systemctl start ipfs
   ```

2. **Configure CORS** for web access:
   ```bash
   ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin '["http://localhost:3000"]'
   ipfs config --json API.HTTPHeaders.Access-Control-Allow-Methods '["PUT", "POST"]'
   ```

3. **Enable garbage collection**:
   ```bash
   ipfs config Datastore.GCPeriod "1h"
   ```

4. **Backup your IPFS key**:
   ```bash
   cp ~/.ipfs/config ~/.ipfs/config.backup
   ```

## Option 2: Helia (Lightweight IPFS)

Helia is a JavaScript IPFS implementation that runs in-process (no separate daemon). Good for development, testing, or lightweight deployments.

### Installation

```bash
cd fidesdpp
npm install helia @helia/json @helia/unixfs
```

### Configure FIDES-DPP

Create `.env.local` in `fidesdpp/` directory:

```bash
# IPFS Backend Selection
IPFS_BACKEND=helia

# Gateway for retrieval (use public gateway or your own)
IPFS_GATEWAY_URL=https://ipfs.io
```

### Verify Setup

```bash
cd fidesdpp
npm run dev
```

Helia starts automatically when you upload to IPFS. No separate daemon is required.

### Storage Location

Helia stores data locally:

- **Browser**: IndexedDB (persistent)
- **Node.js**: File system (typically `.helia` in your home directory)

### Advantages

- No separate daemon to manage
- Easier deployment (fewer moving parts)
- Works in browser and Node.js
- Smaller footprint

### Limitations

- Less mature than Kubo
- Fewer advanced features
- Smaller network participation (for content discovery)

For production, consider using Kubo for better network connectivity and stability.

## Troubleshooting

### Kubo: Port already in use

```bash
# Check if another IPFS instance is running
ps aux | grep ipfs

# Or change ports in config
ipfs config Addresses.API /ip4/127.0.0.1/tcp/5002
ipfs config Addresses.Gateway /ip4/127.0.0.1/tcp/8081
```

### Kubo: Permission denied

```bash
# Check ownership of IPFS directory
ls -la ~/.ipfs

# Fix if needed
chown -R $USER ~/.ipfs
```

### Helia: Dependencies not found

```bash
# Reinstall dependencies
cd fidesdpp
rm -rf node_modules package-lock.json
npm install
npm install helia @helia/json @helia/unixfs
```

### CORS errors in browser

For Kubo, configure CORS:

```bash
ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin '["*"]'
ipfs daemon
```

## Comparison: Kubo vs Helia

| Feature | Kubo | Helia |
|---------|------|-------|
| License | MIT/Apache 2.0 | MIT/Apache 2.0 |
| Deployment | Separate daemon | In-process |
| Maturity | Very mature (2015) | Newer (2023) |
| Features | Full IPFS spec | Core features |
| Network | Full participation | Limited |
| Production | Recommended | Experimental |
| Development | Good | Excellent |
| CLI Integration | Excellent | Good |

## Switching Backends

You can switch backends anytime by changing `IPFS_BACKEND`:

```bash
# Use Kubo
IPFS_BACKEND=kubo npm run dev

# Use Helia
IPFS_BACKEND=helia npm run dev
```

Both backends use the same interface, so no code changes needed!

## CLI Usage with FOSS Backends

### With Kubo

```bash
# Start Kubo first
ipfs daemon

# Use CLI
cd cli
npx tsx src/index.ts register --backend kubo --json test.json --account "//Alice"
```

### With Helia

```bash
# No daemon needed
cd cli
npx tsx src/index.ts register --backend helia --json test.json --account "//Alice"
```

## Checklist

1. Install Kubo or Helia
2. Configure `.env.local`
3. Start FIDES-DPP
4. Create a test passport with IPFS enabled
5. Verify data integrity

## Optional: Pinata Setup

If you prefer managed infrastructure, see [IPFS_SETUP.md](./IPFS_SETUP.md).

**Remember**: Pinata is optional. The project works fully with FOSS components.

## Resources

- Kubo Documentation: https://docs.ipfs.tech/install/command-line/
- Helia Documentation: https://helia.io/
- IPFS Concepts: https://docs.ipfs.tech/concepts/
- FIDES-DPP GitHub: https://github.com/giovannivanini/FIDES-DPP
