# Getting Started

This guide provides step-by-step instructions to set up and run FIDES-DPP from a fresh clone.

## Prerequisites

| Component | Minimum Version | Notes |
|-----------|-----------------|-------|
| Node.js | 20.9.0 | Required for `fidesdpp/` |
| npm | 9.6.0 | Bundled with Node.js |
| IPFS (Kubo) | - | Required for local development (or use Docker path) |
| Docker | 24.0.0 | Optional (Docker path) |
| Docker Compose | 2.20.0 | Optional (Docker path) |

Optional (contract development):
- Rust 1.75.0+
- cargo-contract 4.1.1

## Installation

### Path A: Local development (recommended)

1. Clone repository:
```bash
git clone https://github.com/gv70/FIDES-DPP.git
cd FIDES-DPP
```

2. Start IPFS (Kubo):

```bash
bash scripts/setup-ipfs.sh
```

3. Configure the app:

```bash
cp fidesdpp/.env.example fidesdpp/.env.local
```

4. Install and run:

```bash
cd fidesdpp
npm install
npm run dev
```

5. Access:

- Web UI: http://localhost:3000
- IPFS API: http://127.0.0.1:5001
- IPFS Gateway: http://127.0.0.1:8080

### Path B: Docker (alternative)

1. Clone repository:

```bash
git clone https://github.com/gv70/FIDES-DPP.git
cd FIDES-DPP
```

2. Create environment file:

```bash
cp .env.example .env
```

3. Start services:
```bash
docker-compose up -d
```

4. Access:
- Web UI: http://localhost:3000
- IPFS API: http://127.0.0.1:5001
- IPFS Gateway: http://127.0.0.1:8080

## Configuration

### Using Existing Contract

The default configuration uses a deployed contract on Westend Asset Hub testnet:
- Address: `0x2b7da3eab6f9660e7bfadc5ea0076e5883b6f11f`
- Network: Westend Asset Hub
- RPC: `wss://westend-asset-hub-rpc.polkadot.io`

No contract deployment is required to start using the application.

### IPFS

Kubo is the default backend in both paths. For detailed setup and alternatives, see `fidesdpp/IPFS_SETUP_FOSS.md`.

### Sandbox Mode

To test without a real domain:

1. Set environment variable:
```bash
FIDES_MODE=test
```

2. Access test UI:
http://localhost:3000/test

This uses `did:web:localhost%3A3000` and serves DID documents locally.

## Verification

Check that services are running:

```bash
# Check IPFS
curl http://127.0.0.1:5001/api/v0/version
```

## Next Steps

- Review [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for system design
- See [docs/TESTING_GUIDE.md](docs/TESTING_GUIDE.md) for testing instructions
- Read `fidesdpp/cli/README.md` for CLI usage
- Check `dpp_contract/README.md` for contract development

## Troubleshooting

### IPFS daemon not running

```bash
# Start Kubo daemon
ipfs daemon
```

### Port conflicts

Check if ports 3000, 5001, or 8080 are already in use:
```bash
lsof -i :3000
lsof -i :5001
lsof -i :8080
```

### Dependencies version mismatch

Verify dependencies:
```bash
bash scripts/verify-dependencies.sh
```

### Contract connection issues

If you see RPC connection errors, set `POLKADOT_RPC_URL` to another Westend Asset Hub endpoint and restart the app.
