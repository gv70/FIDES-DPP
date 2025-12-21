# Milestone 2 Delivery

## Overview

This milestone delivers a working end-to-end flow for creating and verifying Digital Product Passports (DPPs) using:

- an ink! smart contract deployed on Asset Hub testnet (on-chain anchor + versioning),
- a web interface for interactive usage,
- a command-line interface (CLI) for developer workflows,
- off-chain storage for the Verifiable Credential payload (VC-JWT) with integrity verification.

The system follows the same core model introduced in Milestone 1:

- the contract acts as a verifiable on-chain anchor,
- the full DPP content is handled off-chain in a machine-readable payload.

The data model is aligned with the requirements of EU Regulation 2024/1781 and the UNTP (United Nations Transparency Protocol) work, with the aim of making product information verifiable on-chain and reusable by other tooling in the ecosystem.

## Deliverables

All deliverables are open-sourced under Apache 2.0.

### Web Interface

The web UI enables:

- creating DPP entries linked to off-chain data,
- verifying passport integrity (on-chain anchor with off-chain VC-JWT),
- issuer setup for `did:web` issuance, including hosting/export instructions for:
  - `/.well-known/did.json`
  - `/.well-known/polkadot-accounts.json`

### Command-Line Interface (CLI)

Delivers CLI commands providing equivalent capabilities for advanced users:

- create and read passport records,
- verify integrity against the on-chain anchor,
- manage issuer identity and export hosting files for `did:web`.

### Documentation

Deployment guide, configuration details, and usage instructions for both web and CLI tools.

### Outreach

Outreach to 3 partner organizations relevant to digital product passport use cases and direct pitch to 1 of them to get concrete interest in pilot participation.

## Contract Scope and Deviations

Milestone 2 builds on the deployed contract architecture and focuses on application-layer delivery:

- The contract stores dataset pointers and integrity anchors (URI plus hash), plus versioning and lifecycle status.
- The web/CLI implement the issuance plus verification flow and expose operational tooling (issuer setup, export, verification, status).

This approach intentionally prioritizes:

- verifiable integrity and versioning at the anchor layer,
- schema coverage and interoperability at the payload layer,
- clear extension points for future role models and confidentiality mechanisms.

As discussed in the first milestone review, the remaining structural elements (expanded data coverage, role/tier governance, and confidentiality hardening) are planned as follow-up work and will be delivered within the agreed project timeline.

## Deliverables Table

| Number | Deliverable | Link | Notes |
| ------ | ----------- | ---- | ----- |
| 0. | License | [LICENSE](https://github.com/gv70/FIDES-DPP/blob/main/LICENSE) | Source code is released under Apache License 2.0. |
| 1. | Smart contract v0.2 | [dpp_contract/lib.rs](https://github.com/gv70/FIDES-DPP/blob/main/dpp_contract/lib.rs) | Core DPP contract in ink! v6. Stores an on-chain anchor (dataset URI + payload hash) with lifecycle status and version history. |
| 2. | Contract tooling | [dpp_contract/DEPLOY_DPP.sh](https://github.com/gv70/FIDES-DPP/blob/main/dpp_contract/DEPLOY_DPP.sh) | Shell script for contract deployment. |
| 2. | Contract tooling | [dpp_contract/INTERACT_DPP.sh](https://github.com/gv70/FIDES-DPP/blob/main/dpp_contract/INTERACT_DPP.sh) | Interactive script to call contract entrypoints. |
| 2. | Contract tooling | [dpp_contract/README.md](https://github.com/gv70/FIDES-DPP/blob/main/dpp_contract/README.md) | Contract README covering build, deployment and interaction steps. |
| 3. | Web interface | [fidesdpp/](https://github.com/gv70/FIDES-DPP/tree/main/fidesdpp) | Web UI for issuer setup, passport creation, verification, updates and rendering. |
| 4. | CLI | [fidesdpp/cli/](https://github.com/gv70/FIDES-DPP/tree/main/fidesdpp/cli) | CLI workspace for issuer management and passport operations. |
| 4. | CLI | [fidesdpp/scripts/run-cli.ts](https://github.com/gv70/FIDES-DPP/blob/main/fidesdpp/scripts/run-cli.ts) | CLI wrapper to run commands via the workspace node_modules. |
| 4. | CLI | [fidesdpp/cli/README.md](https://github.com/gv70/FIDES-DPP/blob/main/fidesdpp/cli/README.md) | CLI usage reference and examples. |
| 5. | Local deployment stack | [docker-compose.yml](https://github.com/gv70/FIDES-DPP/blob/main/docker-compose.yml) | Reproducible local environment (app + IPFS + optional Postgres). |
| 6. | Documentation | [README.md](https://github.com/gv70/FIDES-DPP/blob/main/README.md) | Project overview and quick start. |
| 6. | Documentation | [GETTING_STARTED.md](https://github.com/gv70/FIDES-DPP/blob/main/GETTING_STARTED.md) | Onboarding guide for local development and Docker. |
| 6. | Documentation | [docs/TESTING_GUIDE.md](https://github.com/gv70/FIDES-DPP/blob/main/docs/TESTING_GUIDE.md) | End-to-end testing steps for web and CLI flows. |
| 6. | Documentation | [docs/deployment.md](https://github.com/gv70/FIDES-DPP/blob/main/docs/deployment.md) | Deployment profiles and operational notes. |
| 6. | Documentation | [docs/ARCHITECTURE.md](https://github.com/gv70/FIDES-DPP/blob/main/docs/ARCHITECTURE.md) | System architecture and design rationale. |
| 6. | Documentation | [fidesdpp/ENV_VARIABLES.md](https://github.com/gv70/FIDES-DPP/blob/main/fidesdpp/ENV_VARIABLES.md) | Environment variables reference for the web app and CLI. |
| 6. | Documentation | [fidesdpp/IPFS_SETUP_FOSS.md](https://github.com/gv70/FIDES-DPP/blob/main/fidesdpp/IPFS_SETUP_FOSS.md) | IPFS setup notes for open-source backends (Kubo/Helia). |
| 7. | Third-party notices | [THIRD_PARTY_NOTICES.md](https://github.com/gv70/FIDES-DPP/blob/main/THIRD_PARTY_NOTICES.md) | Third-party license and attribution notices. |

## Implementation Details

### Web Interface

**App**: `fidesdpp/`

**Key routes**:
- `/passports` (create/list/update/revoke flows)
- `/verification` (integrity checks and validation)
- `/administration#deploy` (contract deploy utilities)
- `/render/[tokenId]` (rendering from exported payload)

### Command-Line Interface (CLI)

The CLI provides equivalent functionality for developers or advanced users (create, read, verify).

## Deployment and Testing (Westend Asset Hub)

**Network**: Asset Hub (Westend testnet)  
**RPC**: wss://westend-asset-hub-rpc.polkadot.io  
**Contract address (H160)**: 0x2b7da3eab6f9660e7bfadc5ea0076e5883b6f11f

The contract is live and responding to queries.

Deployment transaction: https://assethub-westend.subscan.io/extrinsic/13316735-2

## Polkadot Ecosystem Framework

The web UI and CLI use Polkadot-native tooling to interact with the deployed contract and wallet accounts:

- Dedot for signing and submitting extrinsics through browser wallets,
- Typink for typed contract interaction patterns where applicable.

All code is open-sourced under Apache License 2.0. The contract compiles cleanly with ink! v6 and uses explicit result-based error handling for the main failure paths.
