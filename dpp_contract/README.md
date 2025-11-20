# FIDES Digital Product Passport Contract v0.1

ink! smart contract for Digital Product Passports on Polkadot Asset Hub. Each passport is represented as an NFT token, with product information, manufacturer details, and material composition stored on-chain.

The data model is designed to align with core elements of EU Regulation 2024/1781 and the UN Transparency Protocol (UNTP). It covers product identification, manufacturer information, production date/location, and basic material composition, which map to the core fields required by the regulation.

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

Tests cover the main flows: registration, reading, authority-based updates, revocation, and basic NFT operations.

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
- `register_passport(passport: DigitalProductPassport) -> Result<TokenId>` - Register full passport
- `mint_simple(product_id, product_name, description, manufacturer_name, manufacturer_id, facility, country, batch_number: String, serial_number: String) -> Result<TokenId>` - Simplified mint with minimal fields. Empty strings for batch_number/serial_number are converted to None internally.

### Reading
- `read_passport(token_id: TokenId) -> Option<DigitalProductPassport>` - Get full passport
- `get_product_info(token_id) -> Option<ProductInfo>` - Product details only
- `get_manufacturer(token_id) -> Option<Manufacturer>` - Manufacturer info only
- `get_materials(token_id) -> Vec<MaterialEntry>` - Materials list
- `get_status(token_id) -> Option<PassportStatus>` - Current status

### Updates
- `update_passport(token_id, passport) -> Result<()>` - Update passport data. Implemented and tested at contract level; CLI support planned for next milestone.

### Revocation
- `revoke_passport(token_id) -> Result<()>` - Mark as revoked and burn token. Implemented and tested at contract level; CLI support planned for next milestone.

### NFT Operations
- `balance_of(owner: Address) -> u128` - Token balance
- `owner_of(token_id) -> Option<Address>` - Token owner (if exists)
- `transfer(to: Address, token_id) -> Result<()>` - Transfer ownership
- `approve(to: Address, token_id) -> Result<()>` - Approve transfer

## Events

- `PassportRegistered` - Emitted on new passport creation
- `PassportUpdated` - Emitted on passport updates (when update_passport is used)
- `PassportRevoked` - Emitted on revocation (when revoke_passport is used)
- `Transfer` - Standard NFT transfer events

## Data Model

```rust
DigitalProductPassport {
    product: ProductInfo {
    product_id: String,
        name: String,
        description: String,
        category: String,
        batch_number: Option<String>,
        serial_number: Option<String>,
        production_date: Timestamp,
    },
    manufacturer: Manufacturer {
        name: String,
        identifier: String,  // VAT, registration number, etc
        country: String,     // ISO 3166-1 alpha-2
        facility: Option<String>,
    },
    materials: Vec<MaterialEntry>,  // see MaterialEntry below
    created_at: Timestamp,
    updated_at: Timestamp,
    status: PassportStatus,  // Active | Suspended | Revoked
}

pub struct MaterialEntry {
    pub name: String,
    pub mass_fraction: u32,  // scaled by 10^6 (0-1000000 = 0.0-1.0)
    pub origin_country: Option<String>,
    pub hazardous: bool,
}
```

**Types:**
- `Timestamp` - u64 (seconds since Unix epoch)
- `Address` - H160 (Ethereum-style address, 0x...)
- `TokenId` - u128

## Data Formats

- **Mass fractions**: Stored as integers scaled by 10^6 (0.5 = 500000, 1.0 = 1000000)
- **Countries**: ISO 3166-1 alpha-2 codes (e.g., "US", "DE", "IT")
- **Timestamps**: u64 (Unix timestamp in seconds)
- **Product IDs**: Alphanumeric strings (recommended format: "COMPANY-PRODUCT-YEAR-XXX")

## Project Structure

```
dpp_contract/
├── lib.rs              # Contract implementation
├── Cargo.toml         # Dependencies
├── DEPLOY_DPP.sh      # Deployment script
├── INTERACT_DPP.sh    # Interactive CLI
└── README.md          # This file
```
