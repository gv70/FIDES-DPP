# Environment Variables Configuration

Copy this configuration to `.env.local` in the `fidesdpp/` directory.

## IPFS Backend Selection (REQUIRED)

Choose your IPFS backend:

```bash
# Options: 'kubo' | 'helia' | 'pinata'
# Default: kubo (FOSS primary)
IPFS_BACKEND=kubo
```

### Backend Options

| Backend | Type | License | Setup Complexity | Production Ready |
|---------|------|---------|------------------|------------------|
| `kubo` | FOSS Self-hosted | MIT/Apache 2.0 | Medium (daemon) | Yes (recommended) |
| `helia` | FOSS Embedded | MIT/Apache 2.0 | Low (npm install) | Experimental |
| `pinata` | Optional SaaS | N/A (service) | Low (API key) | Yes (optional) |

## Kubo Configuration

If `IPFS_BACKEND=kubo`:

```bash
# Kubo RPC API endpoint (default: http://127.0.0.1:5001)
IPFS_NODE_URL=http://127.0.0.1:5001

# Kubo Gateway endpoint (default: http://127.0.0.1:8080)
IPFS_GATEWAY_URL=http://127.0.0.1:8080

# Optional: Basic Auth for remote Kubo nodes
# IPFS_NODE_AUTH=username:password
```

Note: `IPFS_NODE_URL` is required only for `kubo` (self-hosted). It is not required for `pinata` or `helia`.

**Prerequisites:**
- Install Kubo: https://dist.ipfs.tech/#kubo
- Run: `ipfs init && ipfs daemon`

## Helia Configuration

If `IPFS_BACKEND=helia`:

```bash
# Gateway for retrieval (can use public gateway)
IPFS_GATEWAY_URL=https://ipfs.io
```

**Prerequisites:**
- Install: `npm install helia @helia/json @helia/unixfs`
- No daemon needed (runs in-process)

## Pinata Configuration (OPTIONAL)

Pinata is not required for FIDES-DPP to work. For an open-source-only setup, use Kubo or Helia instead.

If `IPFS_BACKEND=pinata`:

```bash
# Pinata JWT token
PINATA_JWT=your_jwt_token_here

# Pinata Gateway domain (format: your-gateway.mypinata.cloud)
NEXT_PUBLIC_PINATA_GATEWAY_URL=your-gateway-name.mypinata.cloud
```

**Setup:**
1. Create account: https://app.pinata.cloud/register
2. Get JWT: https://app.pinata.cloud/developers/keys
3. Get Gateway: https://app.pinata.cloud/gateway

**Migration**: You can switch from Pinata to Kubo/Helia anytime by changing `IPFS_BACKEND`. All CIDs remain accessible.

## Smart Contract Configuration

```bash
# DPP Contract address on Asset Hub testnet
CONTRACT_ADDRESS=0x2b7da3eab6f9660e7bfadc5ea0076e5883b6f11f

# Polkadot RPC endpoint (RPC_URL is also accepted)
POLKADOT_RPC_URL=wss://westend-asset-hub-rpc.polkadot.io
```

## UNTP Schema & Context (Optional)

UNTP schemas are fetched at runtime to keep the repository Apache-2.0 compliant (UNTP schemas/artifacts may be GPL).

```bash
# UNTP DPP (Digital Product Passport)
UNTP_DPP_CONTEXT_URL=https://test.uncefact.org/vocabulary/untp/dpp/0.6.0/
UNTP_SCHEMA_URL=https://test.uncefact.org/vocabulary/untp/dpp/untp-dpp-schema-0.6.0.json
# Optional pinning (integrity)
UNTP_SCHEMA_SHA256=

# UNTP DTE (Digital Traceability Events)
UNTP_DTE_CONTEXT_URL=https://test.uncefact.org/vocabulary/untp/dte/0.6.0/
UNTP_DTE_SCHEMA_URL=https://test.uncefact.org/vocabulary/untp/dte/untp-dte-schema-0.6.0.json
# Optional pinning (integrity)
UNTP_DTE_SCHEMA_SHA256=

# Cache schema fetches (default: 24h)
UNTP_SCHEMA_CACHE_TTL_MS=86400000
```

## File Storage Paths (Optional)

For serverless deployments (e.g., Vercel), local writes must go to a writable
path such as `/tmp`. You can override the default `./data` locations with:

```bash
# Base directory for local JSON storage (did:web, status lists, anagrafica, dte index)
FIDES_DATA_DIR=/tmp

# Or override individual files directly
DIDWEB_DATA_PATH=/tmp/issuers.json
STATUS_LIST_DATA_PATH=/tmp/status-lists.json
ANAGRAFICA_DATA_PATH=/tmp/anagrafica.json
DTE_INDEX_DATA_PATH=/tmp/dte-index.json
```

## did:web (Issuer + Pilot Mode)

```bash
# Required for server-side VC-JWT signing when using did:web issuers.
# Must remain stable across deployments, otherwise previously-registered issuers cannot be decrypted.
DIDWEB_MASTER_KEY_HEX=

# Optional: base domain used for Pilot Mode path-based did:web identities.
# If set, pilot DIDs will be created as:
#   did:web:<DIDWEB_BASE_DOMAIN>:pilots:<pilotId>
# and resolved at:
#   https://<DIDWEB_BASE_DOMAIN>/pilots/<pilotId>/did.json
# Leave empty to default to the current request host.
DIDWEB_BASE_DOMAIN=fidesdpp.xyz

# Optional: enables local sandbox did:web endpoints:
# - GET /.well-known/did.json
# - GET /.well-known/polkadot-accounts.json
FIDES_MODE=test
```

## Complete .env.local Example

### For FOSS-Only (Kubo)

```bash
# IPFS Backend
IPFS_BACKEND=kubo
IPFS_NODE_URL=http://127.0.0.1:5001
IPFS_GATEWAY_URL=http://127.0.0.1:8080

# Smart Contract
CONTRACT_ADDRESS=0x2b7da3eab6f9660e7bfadc5ea0076e5883b6f11f
POLKADOT_RPC_URL=wss://westend-asset-hub-rpc.polkadot.io
```

### For FOSS-Only (Helia)

```bash
# IPFS Backend
IPFS_BACKEND=helia
IPFS_GATEWAY_URL=https://ipfs.io

# Smart Contract
CONTRACT_ADDRESS=0x2b7da3eab6f9660e7bfadc5ea0076e5883b6f11f
POLKADOT_RPC_URL=wss://westend-asset-hub-rpc.polkadot.io
```

### For Optional Pinata

```bash
# IPFS Backend (OPTIONAL SaaS)
IPFS_BACKEND=pinata
PINATA_JWT=your_jwt_here
NEXT_PUBLIC_PINATA_GATEWAY_URL=your-gateway.mypinata.cloud

# Smart Contract
CONTRACT_ADDRESS=0x2b7da3eab6f9660e7bfadc5ea0076e5883b6f11f
POLKADOT_RPC_URL=wss://westend-asset-hub-rpc.polkadot.io
```

## Security Notes

- **Never commit `.env.local` to version control** (it's in `.gitignore`)
- **Keep JWT tokens secure** - they provide full access to your Pinata account
- **For production**, use proper secret management (Vault, AWS Secrets Manager, etc.)
- **Gateway URLs** are public and safe to expose via `NEXT_PUBLIC_*` prefix

## Troubleshooting

### "IPFS backend not available"

- **Kubo**: Make sure daemon is running (`ipfs daemon`)
- **Helia**: Install dependencies (`npm install helia @helia/json @helia/unixfs`)
- **Pinata**: Check JWT and Gateway URL are set correctly

### "Unknown IPFS backend"

Check `IPFS_BACKEND` value is one of: `kubo`, `helia`, `pinata`

### Environment variables not loading

- Restart development server after changing `.env.local`
- Ensure file is in `fidesdpp/` directory (not root)
- Check for typos in variable names

## Open-Source-Only Mode

This configuration is designed to keep core flows working with open-source components only:

1. Open-source-first defaults (Kubo as the default backend)
2. No lock-in (backends are swappable via configuration)
3. Optional services stay optional (Pinata is supported but not required)
4. Setup docs keep the open-source path first

For more details:
- FOSS Setup: [IPFS_SETUP_FOSS.md](./IPFS_SETUP_FOSS.md)
- Optional Pinata: [IPFS_SETUP.md](./IPFS_SETUP.md)
