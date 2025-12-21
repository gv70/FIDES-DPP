# FIDES-DPP

FIDES-DPP is a Digital Product Passport stack built on Polkadot, designed to align with [UNTP](https://opensource.unicc.org/un/unece/uncefact/spec-untp) and [EU Regulation 2024/1781](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1781).

The repo includes:
- an ink! smart contract for an on-chain anchor (dataset URI + payload hash + lifecycle/versioning),
- a Next.js app (`fidesdpp/`) for issuer setup, creation, verification, and rendering,
- a CLI (`fidesdpp/cli/`) that reuses the same application layer as the web app.

---

## Overview

The core model:

- each **passport** is a token on-chain,
- the on-chain record stores only an **anchor** (`datasetUri` + `payloadHash` + metadata),
- the full dataset is stored off-chain as a **VC-JWT** (typically on IPFS), retrieved via `datasetUri`.

The contract supports three granularities:

- **ProductClass** – model/SKU level
- **Batch** – production batch level
- **Item** – serialized item level

---

## Status

Implemented:

- on-chain anchor contract (registration, read, updates, revocation, version history),
- custody transfer (NFT-like ownership) without changing issuer authority,
- web UI for issuer setup (`did:web`), create/list/update/revoke, verification, and rendering,
- CLI parity for issuer management and passport operations,
- sandbox test mode for `did:web` flows without a domain (`FIDES_MODE=test`).

Planned next steps are tracked in [docs/ROADMAP.md](docs/ROADMAP.md).

---

## Requirements

| Component | Minimum Version | Notes |
|-----------|----------------|-------|
| Docker | 24.0.0 | Recommended setup |
| Docker Compose | 2.20.0 | Bundled with Docker Desktop |
| Node.js | 20.9.0 | For local development |
| npm | 9.6.0 | Bundled with Node.js |
| Rust | 1.75.0 | Contract development only |
| cargo-contract | 4.1.1 | Contract development only |

Network access:
- Polkadot RPC (Westend Asset Hub testnet)
- UNTP schema URLs

See [GETTING_STARTED.md](GETTING_STARTED.md) for detailed setup instructions.

---

## Quick Start

### Docker (Recommended)

```bash
git clone https://github.com/gv70/FIDES-DPP.git
cd FIDES-DPP
docker-compose up -d
```

Access:
- Web UI: http://localhost:3000
- IPFS API: http://127.0.0.1:5001
- IPFS Gateway: http://127.0.0.1:8080

### Local Development

Requires IPFS daemon running first:

```bash
# Start IPFS
ipfs init
ipfs daemon

# In separate terminal
cd fidesdpp
npm install
npm run dev
```

See [GETTING_STARTED.md](GETTING_STARTED.md) for step-by-step instructions and [fidesdpp/IPFS_SETUP_FOSS.md](fidesdpp/IPFS_SETUP_FOSS.md) for IPFS setup details.

### Contract build (optional)

For contract development only. The application uses a deployed contract by default.

```bash
cd dpp_contract
cargo contract build --release
cargo test
```

See `dpp_contract/README.md` for deployment instructions.

### Sandbox mode (no domain)

To test `did:web` flows without a domain:

```bash
# Set environment variable
FIDES_MODE=test

# Start application and access
# http://localhost:3000/test
```

Uses `did:web:localhost%3A3000` and serves `.well-known/did.json` locally.

See [GETTING_STARTED.md](GETTING_STARTED.md) for configuration details.

---

## Usage Examples

### CLI (from `fidesdpp/`)

```bash
cd fidesdpp
npm run cli -- --help
```

Issuer management:

```bash
npm run cli -- issuer register --domain example.com --org "Example Org"
npm run cli -- issuer export --domain example.com --out ./did.json
npm run cli -- issuer verify --domain example.com
```

Passport verification:

```bash
npm run cli -- verify-vc --token-id 5
```

See `fidesdpp/cli/README.md` for the full command set.

### Contract interaction (local/test)

Use the interactive helper:

```bash
cd dpp_contract
chmod +x INTERACT_DPP.sh
./INTERACT_DPP.sh
```

---

## Project Structure

```
FIDES-DPP/
├── dpp_contract/              # ink! contract (on-chain anchor)
├── fidesdpp/                  # Next.js app + CLI workspace
├── docs/                      # Architecture, testing, deployment, roadmap
├── scripts/                   # Repo-level helper scripts
├── LICENSE
├── MILESTONE_1_DELIVERY.md
├── MILESTONE_2_DELIVERY.md
└── README.md
```

---

## Architecture

Two distinct concepts are tracked:

- **Issuer authority**: the account that registered the passport. Only the issuer can update/revoke the anchor.
- **Ownership (custody)**: transferable via NFT-like operations. Transfers do not change the issuer.

The verification flow is:

1. read on-chain record (URI, hash, status, version),
2. retrieve VC-JWT from `datasetUri`,
3. recompute SHA-256 hash over the VC-JWT string and compare with `payloadHash`,
4. verify VC signature (e.g., `did:web`) at the application layer.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Compliance

The architecture keeps the on-chain layer minimal while allowing the off-chain payload to carry richer datasets and documentation links. This supports progressive coverage of category-specific requirements without storing large or sensitive data in plaintext on-chain.

---

## Contributing

Issues and pull requests are welcome. Keep changes small and focused, and include runnable steps to reproduce and test.

---

## License

This project is licensed under the Apache License 2.0. See [LICENSE](LICENSE).
