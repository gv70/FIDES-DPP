# FIDES-DPP

FIDES is a web3 platform built on Polkadot that enables companies to issue digital product passports designed to align with [UNTP](https://opensource.unicc.org/un/unece/uncefact/spec-untp) standards and [EU Regulation 2024/1781](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1781) requirements.

The repo contains an ink! smart contract and some helper scripts for working with **Digital Product Passports (DPPs)** on Polkadot's Asset Hub.

The contract models product passports as NFT-like tokens and is intended as a concrete implementation that can be used as a starting point for more complete DPP solutions aligned with UNTP-oriented data models and recent EU regulation around product passports.

---

## Overview

The core idea:

- each **passport** is represented by a token,
- the passport data (product info, manufacturer, materials) is stored on-chain, and
- the contract exposes simple read/write functions to register and query passports.

The contract currently supports two granularities:

- **Item** – single physical product (similar to ERC721). Each passport is represented as a unique NFT token.
- **Batch** – production batch tracking via `batch_number` field in the passport data. Multiple items can share the same batch identifier.

A separate Model-level representation will be added in later milestones.

For Milestone 1, passport data is stored fully on-chain: product information (id, name, description, category, batch/serial numbers, production date), manufacturer details (name, identifier, country, facility), and material composition. Each passport is linked to an NFT token for ownership tracking.

---

## Status

This repository is work in progress.

Implemented so far:

- basic passport registration for items (with optional batch tracking via batch_number field),
- ownership tracking for passport tokens,
- read functions (by token id),
- update and revoke entrypoints implemented and tested at contract level; CLI support planned in next milestones,
- build & test pipeline for the contract.

Planned next steps:

- more complete DPP fields and schema alignment,
- better tooling around the contract (CLI / SDK).

---

## Requirements

To build and interact with the contract you will need:

- a recent stable [Rust](https://www.rust-lang.org/tools/install),
- [`cargo-contract`](https://github.com/paritytech/cargo-contract),
- access to a Polkadot Asset Hub endpoint (testnet / Westend).

---

## Quick Start

Clone the repository and build the contract:

```bash
git clone https://github.com/gv70/FIDES-DPP.git
cd FIDES-DPP

# install cargo-contract if needed
cargo install cargo-contract --force --locked

# build the DPP contract
cd dpp_contract
cargo contract build --release
```

The compiled contract will be in `dpp_contract/target/ink/dpp_contract.contract`.

### Deploying

Deploy to AssetHub testnet using the provided script:

```bash
cd dpp_contract
chmod +x DEPLOY_DPP.sh
./DEPLOY_DPP.sh
```

Or manually with cargo-contract:

```bash
cargo contract instantiate \
    --constructor new \
    --suri //Alice \
    --url wss://westend-asset-hub-rpc.polkadot.io \
    --contract target/ink/dpp_contract.contract \
    --skip-dry-run \
    --gas 250000000 \
    --proof-size 30000 \
    --storage-deposit-limit 50000000000
```

### Interacting

Use the interactive script to call contract functions:

```bash
cd dpp_contract
chmod +x INTERACT_DPP.sh
./INTERACT_DPP.sh
```

### Running Tests

```bash
cd dpp_contract
cargo test
```

---

## Usage Examples

### Registering a Product Passport

The simplest way is using the `mint_simple` helper:

```bash
cargo contract call \
  --contract <CONTRACT_ADDRESS> \
  --message mint_simple \
  --args "\"PROD-2025-001\"" "\"Wood Table\"" "\"Wood table made by Oak\"" "\"Oak Furniture Co\"" "\"MFG-001\"" "\"California\"" "\"USA\"" "\"BATCH-001\"" "\"SERIAL-123\"" \
  --suri "your seed phrase" \
  --url wss://westend-asset-hub-rpc.polkadot.io \
  --skip-dry-run \
  --gas 250000000 \
  --proof-size 30000 \
  --storage-deposit-limit 50000000000 \
  -x
```

Note: `batch_number` and `serial_number` can be empty strings `""` if not needed (they will be converted to `None` internally).

Or register a full passport with all fields:

```bash
cargo contract call \
  --contract <CONTRACT_ADDRESS> \
  --message register_passport \
  --args <PASSPORT_DATA> \
  --suri "your seed phrase" \
  --url wss://westend-asset-hub-rpc.polkadot.io \
  --skip-dry-run \
  --gas 250000000 \
  --proof-size 30000 \
  --storage-deposit-limit 50000000000 \
  -x
```

### Reading a Passport

```bash
cargo contract call \
  --contract <CONTRACT_ADDRESS> \
  --message read_passport \
  --args <TOKEN_ID> \
  --suri //Alice \
  --url wss://westend-asset-hub-rpc.polkadot.io
```

---

## Project Structure

```
FIDES-DPP/
├── dpp_contract/              # Main smart contract
│   ├── lib.rs                 # Contract implementation
│   ├── Cargo.toml             # Dependencies
│   ├── DEPLOY_DPP.sh          # Deployment script
│   ├── INTERACT_DPP.sh        # Interactive CLI
│   └── README.md              # Contract-specific docs
├── LICENSE
├── MILESTONE_1_DELIVERY.md    # Milestone delivery report
└── README.md                  # This file
```

The deployment script stores the contract address in `.fides_dpp_contract` (local file, not versioned).

---

## Architecture

The contract uses an ERC721-like approach:

- **One token = one passport** – each passport is represented as a unique NFT token
- **Batch tracking** – multiple items can share the same `batch_number` field for batch-level grouping
- **DPP-specific** extensions for update, revoke, and verification (planned)

This allows leveraging existing NFT tooling while adding DPP-specific functionality. In Milestone 1, passport data (product info, manufacturer details, materials) is stored fully on-chain. Future versions may move to a hybrid model with off-chain storage (e.g., IPFS) for larger datasets.

---

## Compliance

The data model is designed to align with core elements of EU Regulation 2024/1781 and the UN Transparency Protocol (UNTP). Currently implemented fields include product identification, manufacturer information, production date/location, and basic material composition.

---

## Contributing

Contributions are welcome! Open issues for bug reports or feature requests, submit PRs for improvements. Follow Rust formatting (`cargo fmt`) and ensure tests pass.

## Next Steps

Milestone 1 (smart contract v0.1) is complete. Planned next steps include SDK development, web interface, and IPFS integration. See [docs/ROADMAP.md](docs/ROADMAP.md) for details.

---

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

---

## Acknowledgments

- [ink!](https://use.ink/) - Smart contract framework for Polkadot
- [Polkadot](https://polkadot.network/) - Blockchain platform
- [UNTP](https://opensource.unicc.org/un/unece/uncefact/spec-untp) - United Nation Transparency Protocol
- [Parity Technologies](https://www.parity.io/) - For the ink! framework

---

**Note**: This is an early-stage project. Contract interfaces may change between versions. Use at your own risk in production environments.
