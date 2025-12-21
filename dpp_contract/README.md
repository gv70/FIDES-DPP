# FIDES Digital Product Passport Contract (v0.2)

ink! smart contract for Digital Product Passports on Polkadot Asset Hub.

The contract stores an on-chain anchor (dataset URI + payload hash + metadata). The full DPP is stored off-chain as a VC-JWT.

Authority and custody are separate:
- Issuer authority: only the original issuer can update or revoke the anchor.
- Ownership (custody): transferable via NFT-like operations. Transfers do not change the issuer.

## Build

```bash
cargo contract build --release
```

Outputs:
- `target/ink/dpp_contract.contract` - Contract bundle
- `target/ink/dpp_contract.wasm` - WASM bytecode
- `target/ink/dpp_contract.json` - Metadata

## Test

```bash
cargo test
```

Tests cover registration, reading, issuer-only updates/revocation, version history, and ownership transfers.

## Deploy

```bash
chmod +x DEPLOY_DPP.sh
./DEPLOY_DPP.sh
```

Deploys to Westend Asset Hub testnet. The script will prompt for your seed phrase and save the contract address to `.fides_dpp_contract`.

## Interact

```bash
chmod +x INTERACT_DPP.sh
./INTERACT_DPP.sh
```

Interactive menu for calling contract functions. Uses the contract address from `.fides_dpp_contract` (or prompts you to set one).

## Main Entrypoints

### Registration
- `register_passport(dataset_uri, payload_hash, dataset_type, granularity, subject_id_hash) -> Result<TokenId>` - Register a new passport anchor

### Reading
- `get_passport(token_id) -> Option<PassportRecord>` - Get the latest on-chain anchor record
- `get_version(token_id, version) -> Option<VersionHistory>` - Read one historical version
- `get_version_history(token_id) -> Vec<VersionHistory>` - Read all versions (oldest → newest)
- `get_recent_versions(token_id, limit) -> Vec<VersionHistory>` - Read the latest N versions

### Updates
- `update_dataset(token_id, dataset_uri, payload_hash, dataset_type, subject_id_hash) -> Result<()>` - Update the anchor (issuer-only). Increments `version`.

### Revocation
- `revoke_passport(token_id, reason) -> Result<()>` - Mark as revoked (issuer-only). Passport remains readable.

### Ownership (NFT-like)
- `balance_of(owner: Address) -> u128` - Token balance
- `owner_of(token_id) -> Option<Address>` - Token owner (if exists)
- `transfer(to: Address, token_id) -> Result<()>` - Transfer ownership
- `approve(to: Address, token_id) -> Result<()>` - Approve transfer
- `transfer_from(from, to, token_id) -> Result<()>` - Transfer on behalf of owner (requires approval)
- `set_approval_for_all(operator, approved) -> Result<()>` - Operator approval
- `get_approved(token_id) -> Option<Address>` - Approved account for a token
- `is_approved_for_all(owner, operator) -> bool` - Operator approval status

## Events

- `PassportRegistered` - Emitted on new passport creation
- `PassportUpdated` - Emitted on anchor updates
- `PassportRevoked` - Emitted on revocation
- `Transfer` / `Approval` / `ApprovalForAll` - Ownership transfer events

## Data Model (On-chain)

```rust
PassportRecord {
    token_id: u128,
    issuer: Address,
    dataset_uri: String,
    payload_hash: [u8; 32],
    dataset_type: String,
    version: u32,
    status: PassportStatus,
    created_at: u32,
    updated_at: u32,
    granularity: Granularity,
    subject_id_hash: Option<[u8; 32]>,
}
```

**Types:**
- `Address` - H160 (Ethereum-style address, 0x...)
- `TokenId` - u128

## Data Formats

- `dataset_uri`: expected format `ipfs://<cid>`
- `payload_hash`: SHA-256 of the VC-JWT string bytes
- `dataset_type`: expected `application/vc+jwt`

## Project Structure

```
dpp_contract/
├── lib.rs              # Contract implementation
├── Cargo.toml         # Dependencies
├── DEPLOY_DPP.sh      # Deployment script
├── INTERACT_DPP.sh    # Interactive CLI
└── README.md          # This file
```
