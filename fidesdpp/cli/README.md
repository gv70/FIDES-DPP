# FIDES-DPP CLI

Command-line interface for FIDES Digital Product Passport operations.

The CLI is intentionally “CLI-Web parity” by design: it imports and executes the same application layer used by the Next.js app (`DppApplicationService`, `DidWebManager`, chain adapter, IPFS backends). If something works in the Web UI, the CLI should behave the same for the same inputs.

## Installation

The CLI is part of the main project. Install dependencies from the project root:

```bash
cd fidesdpp
npm install
```

## Usage

Run commands from `fidesdpp/` so relative paths and env loading behave consistently:

#### Via npm script

```bash
npm run cli -- <command> [options]
```

Example:
```bash
npm run cli -- issuer register --domain example.com --org "My Organization"
```

**Notes**

- The CLI loads environment variables from `fidesdpp/.env.local` (and `fidesdpp/.env`) when run from `fidesdpp/`.
- If you keep `DPP_ACCOUNT_URI` in `.env.local`, you can run commands with `--account ""` as a convenience.

## Required Environment

At minimum, configure these in `fidesdpp/.env.local`:

```bash
CONTRACT_ADDRESS=0x2b7da3eab6f9660e7bfadc5ea0076e5883b6f11f
POLKADOT_RPC_URL=wss://westend-asset-hub-rpc.polkadot.io
IPFS_BACKEND=kubo
IPFS_NODE_URL=http://127.0.0.1:5001
IPFS_GATEWAY_URL=http://127.0.0.1:8080
DPP_ACCOUNT_URI=... # optional
```

For `did:web` issuer signing (server-managed key) also set:

```bash
DIDWEB_MASTER_KEY_HEX=... # 64 hex chars (32 bytes)
```

For localhost `did:web` (HTTP, no TLS), set:

```bash
FIDES_MODE=test
```

## Commands

### Quick E2E (localhost did:web)

1) Start the app:

```bash
cd fidesdpp
FIDES_MODE=test npm run dev
```

2) Start IPFS (Kubo) separately (`ipfs daemon`) and set `IPFS_NODE_URL`/`IPFS_GATEWAY_URL` accordingly.

3) Register + authorize + verify issuer (note the URL-encoded port):

```bash
npm run cli -- issuer register --domain localhost%3A3000 --org "Fides CLI demo org"
npm run cli -- issuer authorize --domain localhost%3A3000 --account "" --key-type sr25519
npm run cli -- issuer verify --domain localhost%3A3000
```

4) Create a DPP (VC-JWT → IPFS → on-chain):

```bash
npm run cli -- create-vc --json examples/passport.example.json --account "" --key-type sr25519 --issuer-did localhost%3A3000 --json-output
```

5) Update:

```bash
npm run cli -- update --token-id <TOKEN_ID> --json examples/passport.update.example.json --account "" --key-type sr25519
```

### Issuer Management (did:web)

All issuer commands use `DidWebManager` (same as Web API), ensuring parity.

#### Register Issuer
```bash
npm run cli -- issuer register --domain example.com --org "Organization Name"
```

**Implementation**: Uses `DidWebManager.registerIssuer()` - same as `POST /api/issuer/register`

#### Export DID Document
```bash
npm run cli -- issuer export --domain example.com --out ./did.json
```

**Implementation**: Uses `DidWebManager.generateDidDocument()` - same as Web API

#### Verify Issuer
```bash
npm run cli -- issuer verify --domain example.com
```

**Implementation**: Uses `DidWebManager.verifyDidWeb()` - same as `POST /api/issuer/verify`

#### Authorize wallet address

For `did:web`, the issuer key is server-managed, but the project can enforce an allowlist of Polkadot addresses that are allowed to issue under a given issuer domain.

```bash
npm run cli -- issuer authorize --domain example.com --address <SS58_ADDRESS>
```

### Create VC
```bash
npm run cli -- create-vc --json <file> --account <keyring> [--issuer-did <did>]
```

**Implementation**: Uses `DppApplicationService.preparePassportCreation()` + `DppApplicationService.finalizePassportCreation()` and then submits `registerPassport` on-chain via the shared chain adapter.

### Verify VC
```bash
npm run cli -- verify-vc --token-id <id>
```

**Implementation**: Uses `DppApplicationService.verifyPassport()` - same as Web UI verification logic.

### Transfer custody (ownership)

Custody transfers are NFT-like ownership changes and do not change issuer authority.

```bash
npm run cli -- transfer --token-id <id> --to <destinationAddress> --account <keyring> --key-type sr25519
```

Optional: decrypt restricted sections (if you have a verification key):
```bash
npm run cli -- read --token-id <id> --ipfs --key <verificationKey>
```

## CLI-Web Parity

**Critical**: All CLI commands import and use the same application layer as the Web UI:

- **Issuer Commands**: Import `DidWebManager` from `../../../src/lib/vc/did-web-manager` (same instance used by Web API)
- **VC Commands**: Import `createDppService()` from `../../../src/lib/factory/createDppService` (same factory as Web UI)
- **Application Logic**: All commands use `DppApplicationService` methods directly (same as Web UI server actions)

This architecture ensures:
1. **Identical Behavior**: CLI and Web UI produce identical outputs for the same inputs
2. **Shared Logic**: No code duplication - single source of truth in `DppApplicationService`
3. **Testability**: Golden test (`tests/golden/cli-web-parity.test.ts`) verifies parity by testing `ApplicationService` directly

### Verification

The golden test verifies CLI-Web parity by:
1. Testing `DppApplicationService` directly (shared layer)
2. Comparing outputs from both paths
3. Ensuring identical VC-JWT generation

Run the golden test:
```bash
cd fidesdpp
RUN_GOLDEN_TEST=true npm test -- tests/golden/cli-web-parity.test.ts
```

## Known Issues
Run the CLI via `npm run cli` from `fidesdpp/` to ensure it uses the same `node_modules` as the web app.

### JSON BOM (Windows)

If you see an error like:

- `Unexpected token '﻿' ... is not valid JSON`

your JSON file likely contains a UTF-8 BOM. Save the file as UTF-8 **without** BOM and retry.

### did:web on localhost

`did:web:localhost%3A3000` normally resolves to `https://localhost:3000/...`. For local HTTP testing, set:

```bash
FIDES_MODE=test
```

### `update` input shape

The `update` command expects a `DigitalProductPassport` JSON-LD structure (with `product.identifier` / `product.name`), not the simplified `create-vc` input shape (`productId`, `productName`, ...).

### PowerShell `curl` gotcha (Windows)

In Windows PowerShell, `curl` is an alias for `Invoke-WebRequest` and does not support `-X`.
Use `curl.exe` or `Invoke-RestMethod` instead.

## Development

### Architecture

The CLI is designed to share code with the Web UI:

```
CLI Commands (cli/src/commands/)
    ↓ imports
Shared Application Layer (src/lib/application/)
    ↓ used by
Web UI Server Actions (src/app/actions/)
```

This ensures:
- Single source of truth for business logic
- CLI-Web parity by design
- Easier maintenance and testing

### Adding New Commands

1. Create command file in `cli/src/commands/`
2. Import shared services from `../../../src/lib/` (same as Web UI)
3. Register command in `cli/src/index.ts`
4. Update this README with usage examples
5. Add golden test if command affects VC generation

### Compiling CLI to JavaScript

To avoid `tsx` dependency issues (e.g. Windows policies blocking `esbuild`), compile the CLI:

```bash
cd cli
npm run build
node dist/cli/src/index.js <command> [options]
```

Note: Compilation may require TypeScript configuration adjustments for cross-directory imports.
