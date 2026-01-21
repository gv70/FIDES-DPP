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

Windows helper (optional):

```powershell
# From the repo root (FIDES-DPP/)
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\setup-cli.ps1
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

### CLI (recommended entrypoint)

```bash
cd fidesdpp
npm run cli -- --help
```

#### Quick E2E flow (localhost, did:web)

This project is designed so the CLI reuses the same application layer as the Web UI. For an end-to-end demo with a local `did:web` issuer:

1) Start the web app (it hosts `/.well-known/did.json` in test mode):

```bash
cd fidesdpp
FIDES_MODE=test npm run dev
```

2) Start an IPFS daemon (Kubo) in another terminal (no Docker required). Note the RPC API and Gateway ports from the daemon output.

3) Configure `fidesdpp/.env.local` (not committed). Minimum variables:

- `CONTRACT_ADDRESS`
- `POLKADOT_RPC_URL` (defaults to Westend Asset Hub if omitted)
- `IPFS_NODE_URL` and `IPFS_GATEWAY_URL`
- `DIDWEB_MASTER_KEY_HEX` (required for `did:web` issuer signing)
- optional: `DPP_ACCOUNT_URI` (so you can run CLI with `--account ""`)

4) Register + authorize + verify the issuer (domain must be URL-encoded when it includes a port):

```bash
npm run cli -- issuer register --domain localhost%3A3000 --org "Fides CLI demo org"
npm run cli -- issuer authorize --domain localhost%3A3000 --account "" --key-type sr25519
npm run cli -- issuer verify --domain localhost%3A3000
```

5) Create a passport (VC-JWT → IPFS → on-chain anchor):

```bash
npm run cli -- create-vc --json ./my-create.json --account "" --key-type sr25519 --issuer-did localhost%3A3000 --json-output
```

Minimal `create-vc` input shape (`./my-create.json`):

```json
{
  "productId": "SKU-001",
  "productName": "Demo product",
  "productDescription": "Created via CLI",
  "granularity": "Batch",
  "batchNumber": "BATCH-2026-0001",
  "manufacturer": { "name": "Demo Manufacturer", "identifier": "IT-TEST-0001", "country": "IT" }
}
```

6) Read / verify:

```bash
npm run cli -- read --token-id <TOKEN_ID> --ipfs
npm run cli -- verify --token-id <TOKEN_ID>
npm run cli -- verify-vc --token-id <TOKEN_ID>
```

7) Update (new VC version → new IPFS CID → on-chain anchor update):

```bash
npm run cli -- update --token-id <TOKEN_ID> --json ./my-update.json --account "" --key-type sr25519
```

Minimal `update` input shape (`./my-update.json`) is JSON-LD *credentialSubject* (not the `create-vc` shape):

```json
{
  "@type": "DigitalProductPassport",
  "granularityLevel": "batch",
  "product": { "@type": "Product", "identifier": "SKU-001", "name": "Demo product (v2)", "batchNumber": "BATCH-2026-0001" },
  "manufacturer": { "@type": "Organization", "name": "Demo Manufacturer", "identifier": "IT-TEST-0001", "addressCountry": "IT" }
}
```

8) Transfer custody (NFT-like ownership, does not change issuer authority):

```bash
npm run cli -- transfer --token-id <TOKEN_ID> --to <SS58_ADDRESS> --account "" --key-type sr25519
```

#### Issuer management (did:web)

```bash
npm run cli -- issuer register --domain example.com --org "Example Org"
npm run cli -- issuer export --domain example.com --out ./did.json
npm run cli -- issuer verify --domain example.com
npm run cli -- issuer authorize --domain example.com --address <SS58_ADDRESS>
```

Passport verification:

```bash
npm run cli -- verify-vc --token-id 5
```

Custody transfer (NFT-like ownership):

```bash
npm run cli -- transfer --token-id 5 --to <destinationAddress> --account <keyring>
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
