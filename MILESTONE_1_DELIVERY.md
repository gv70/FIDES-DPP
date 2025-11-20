# Milestone Delivery :mailbox:

**The delivery follows the official [milestone delivery guidelines](https://github.com/w3f/Grants-Program/blob/master/docs/Support%20Docs/milestone-deliverables-guidelines.md).**  

- **Application:** FIDES-DPP (Digital Product Passport on Polkadot)  
- **Milestone:** 1  

## Context

This milestone delivers the initial smart contract implementation for Digital Product Passports (DPPs) on the Polkadot Asset Hub testnet.  
The ink! v6.0 contract models each DPP as an NFT-like token and exposes functions to create, read and manage passports on-chain.  
The data model is aligned with the requirements of EU Regulation 2024/1781 and the UNTP (United Nations Transparency Protocol) work, with the aim of making product information verifiable on-chain and reusable by other tooling in the ecosystem.

## Deliverables

| Number | Deliverable | Link | Notes |
| ------ | ----------- | ---- | ----- |
| 0. | Apache License 2.0 | [LICENSE](https://github.com/gv70/FIDES-DPP/blob/main/LICENSE) | Source code is released under Apache License 2.0. |
| 1. | Smart Contract v0.1 | [dpp_contract/lib.rs](https://github.com/gv70/FIDES-DPP/blob/main/dpp_contract/lib.rs) | Core DPP contract in ink! v6.0. Implements passport registration, retrieval and lifecycle management on Westend Asset Hub testnet. |
| 2. | Automation Scripts | [dpp_contract/DEPLOY_DPP.sh](https://github.com/gv70/FIDES-DPP/blob/main/dpp_contract/DEPLOY_DPP.sh), [dpp_contract/INTERACT_DPP.sh](https://github.com/gv70/FIDES-DPP/blob/main/dpp_contract/INTERACT_DPP.sh) | Shell scripts for contract deployment and interactive testing from the CLI. |
| 3. | Technical Documentation | [README.md](https://github.com/gv70/FIDES-DPP/blob/main/README.md), [dpp_contract/README.md](https://github.com/gv70/FIDES-DPP/blob/main/dpp_contract/README.md) | Concise README describing environment setup, dependencies, deployment, and verification process. Includes project overview, quick start guide, and contract-specific documentation. |

## Additional Information

The contract has been deployed on the Westend Asset Hub testnet. The following flows have been implemented and tested:

- **Registration** – `register_passport()` / `mint_simple()` to create new DPP tokens with product, manufacturer and materials information.
- **Retrieval** – `read_passport()` and query helpers (`get_product_info`, `get_manufacturer`, `get_materials`, `get_status`) to read passport data.
- **Lifecycle (contract-level)** – `update_passport()` and `revoke_passport()` entrypoints are implemented to manage passport updates and revocation (mark as revoked and burn the NFT while keeping data on-chain for audit). These are currently intended for programmatic use and covered by unit tests; richer CLI support and workflows will follow in later milestones.
- **Events** – operations emit events such as `PassportRegistered`, `PassportUpdated`, `PassportRevoked` and standard NFT `Transfer` / `Approval` events for on-chain tracking.
- **NFT integration** – standard ownership / transfer / approval functions for the passport tokens.

For this milestone, passport data is stored entirely on-chain: product details (id, name, description, category, batch/serial numbers, production date), manufacturer information (name, identifier, country, facility) and material composition are kept in contract storage. This keeps the implementation simple and fully verifiable; later milestones are expected to move towards a hybrid model where larger payloads live off-chain.

## Deployment and Testing (Westend Asset Hub)

- **Network:** Asset Hub (Westend testnet)
- **RPC:** wss://westend-asset-hub-rpc.polkadot.io
- **Contract address (H160):** 0xcd7db877d73d0c44ce9680aaa17db2e4369652b4

**Deployment transactions:**
- Code upload: block 13222570, extrinsic 0x54de...
- Instantiation: block 13222574, extrinsic 0x6294...
- Sample call (mint/test): block 13222581, extrinsic 0xc07b...

The contract is live and responding to queries. It is possible to verify it by calling any of the read-only functions (version, read_passport, etc.) using the provided scripts or direct cargo-contract calls.

All code is open-sourced under Apache License 2.0. The contract compiles cleanly with ink! v6 and uses explicit result-based error handling for the main failure paths.


