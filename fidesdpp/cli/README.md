# FIDES-DPP CLI

Command-line interface for FIDES Digital Product Passport operations.

All CLI commands use the same `DppApplicationService` layer as the Web UI to keep CLI/Web parity.

## Installation

The CLI is part of the main project. Install dependencies from the project root:

```bash
cd fidesdpp
npm install
```

## Usage

### Via Web API (Recommended for Production)

For production use and to avoid dependency conflicts, the Web API endpoints are recommended:

- `POST /api/issuer/register` - Register did:web issuer
- `POST /api/issuer/verify` - Verify did:web issuer
- `GET /api/issuer/register?domain=example.com` - Get issuer and export did.json

These endpoints use the same `DppApplicationService` as the CLI, ensuring identical behavior.

### Via CLI Commands

The CLI commands are fully implemented and use the same `DppApplicationService` layer as the Web UI, guaranteeing CLI-Web parity.

#### Via npm script

From the project root:

```bash
npm run cli <command> [options]
```

Example:
```bash
npm run cli issuer register --domain example.com --org "My Organization"
```

## Commands

### Issuer Management (did:web)

All issuer commands use `DidWebManager` (same as Web API), ensuring parity.

#### Register Issuer
```bash
npm run cli issuer register --domain example.com --org "Organization Name"
```

**Implementation**: Uses `DidWebManager.registerIssuer()` - same as `POST /api/issuer/register`

#### Export DID Document
```bash
npm run cli issuer export --domain example.com --out ./did.json
```

**Implementation**: Uses `DidWebManager.generateDidDocument()` - same as Web API

#### Verify Issuer
```bash
npm run cli issuer verify --domain example.com
```

**Implementation**: Uses `DidWebManager.verifyDidWeb()` - same as `POST /api/issuer/verify`

### Create VC
```bash
npm run cli create-vc --json <file> --account <keyring> [--issuer-did <did>]
```

**Implementation**: Uses `DppApplicationService.preparePassportCreation()` + `DppApplicationService.finalizePassportCreation()` and then submits `registerPassport` on-chain via the shared chain adapter.

### Verify VC
```bash
npm run cli verify-vc --token-id <id>
```

**Implementation**: Uses `DppApplicationService.verifyPassport()` - same as Web UI verification logic.

Optional: decrypt restricted sections (if you have a verification key):
```bash
npm run cli read --token-id <id> --ipfs --key <verificationKey>
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

To avoid tsx dependency issues, compile the CLI:

```bash
cd cli
npm run build
node dist/index.js <command> [options]
```

Note: Compilation may require TypeScript configuration adjustments for cross-directory imports.
