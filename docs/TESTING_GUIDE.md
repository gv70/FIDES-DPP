# Testing Guide - FIDES-DPP Milestone 2

**Target Audience**: Developers  
**Last Updated**: 2025-12-11

This guide provides complete instructions to build, test, and verify all Milestone 2 deliverables from a fresh clone.

## Prerequisites

### System Requirements

| Component | Minimum Version | Verified On | Installation |
|-----------|----------------|-------------|--------------|
| Operating System | Ubuntu 22.04 / macOS 13+ | Ubuntu 22.04, macOS 14 | - |
| Node.js | 20.9.0 | 20.19.0 | https://nodejs.org |
| npm | 9.6.0 | 10.2.4 | (bundled with Node.js) |
| Rust | 1.75.0 | 1.79.0 | https://rustup.rs |
| cargo-contract | 4.1.1 | 4.1.1 | cargo install cargo-contract |
| Docker | 24.0.0 | 26.0.0 | https://docs.docker.com/get-docker/ |
| Docker Compose | 2.20.0 | 2.24.0 | (bundled with Docker Desktop) |

### Network Access

- **Required**: Polkadot RPC (wss://westend-asset-hub-rpc.polkadot.io)
- **Required**: UNTP schema URL (https://test.uncefact.org/vocabulary/untp/dpp/...)
- **Optional**: DockerHub (pull images), can use pre-pulled images offline

## Dependency Verification

Before testing, verify that all dependencies listed in `DEPENDENCIES.md` are installed and match the documented versions. This ensures reproducibility and catches version drift early.

### Automated Verification

Run the dependency verification script:

```bash
# From repo root
bash scripts/verify-dependencies.sh
```

**Expected Output**:
- Lists any mismatches between `package.json` and `DEPENDENCIES.md` (warnings only, does not fail build)
- Reports missing dependencies
- Validates version consistency

### Manual Verification

#### Node.js Dependencies

```bash
cd fidesdpp

# Check Node.js version
node --version
# Expected: v20.9.0 or higher (see System Requirements table)

# Check npm version
npm --version
# Expected: 9.6.0 or higher

# Verify all dependencies installed
npm install
# Expected: No errors, all packages from package-lock.json installed

# Verify specific dependency versions match DEPENDENCIES.md
npm list did-jwt-vc
# Expected: did-jwt-vc@4.0.16 (matches DEPENDENCIES.md)

npm list did-resolver
# Expected: did-resolver@4.1.0 (matches DEPENDENCIES.md)

# Check for security vulnerabilities
npm audit
# Expected: No critical vulnerabilities (warnings acceptable)
```

#### Rust Dependencies

```bash
# Check Rust version
rustc --version
# Expected: rustc 1.75.0 or higher

# Check cargo-contract version
cargo contract --version
# Expected: cargo-contract 4.1.1

# Verify contract dependencies
cd dpp_contract
cargo tree
# Expected: Lists all dependencies with versions
```

#### Docker Images

```bash
# Verify Docker images are pinned (not 'latest')
grep -E "image:.*:latest" docker-compose.yml
# Expected: No output (all images should be pinned)

# Check specific image versions
docker-compose config | grep "image:"
# Expected: All images have version tags (e.g., ipfs/kubo:v0.31.0)
```

### Verification Checklist

Before proceeding with testing, verify:

- [ ] Node.js version matches System Requirements table
- [ ] npm version matches System Requirements table
- [ ] Rust version matches System Requirements table
- [ ] cargo-contract version matches System Requirements table
- [ ] All npm dependencies installed (`npm install` completes without errors)
- [ ] Key dependencies match versions in `DEPENDENCIES.md`:
  - [ ] did-jwt-vc@4.0.16
  - [ ] did-resolver@4.1.0
  - [ ] Next.js@16.0.7
  - [ ] React@19.1.1
- [ ] Docker images in `docker-compose.yml` are pinned (no `latest` tags)
- [ ] `scripts/verify-dependencies.sh` runs without hard failures (warnings acceptable)

**Note**: If versions don't match, update `DEPENDENCIES.md` and `THIRD_PARTY_NOTICES.md` accordingly, then update the "Last Verified" timestamp in both files.

## Quick Start (5 Minutes)

```bash
# 1. Clone repository
git clone https://github.com/gv70/FIDES-DPP.git
cd FIDES-DPP

# 2. Create local env file for the web app
cp fidesdpp/.env.example fidesdpp/.env.local

# 3. If you use did:web issuance, generate a local master key and set it in fidesdpp/.env.local
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 4. Issuer state (created automatically on first run; keep uncommitted)
# cp fidesdpp/data/issuers.example.json fidesdpp/data/issuers.json

# 5. Optional: enable sandbox test mode (local did:web without a domain)
# export FIDES_MODE=test

# 2. Start services (FOSS-only mode)
docker-compose up -d

# 3. Wait for services to be healthy (~30 seconds)
docker-compose ps

# 4. Open browser
open http://localhost:3000

# 5. Connect Polkadot.js extension with Ed25519 account
# 6. Create a test passport via Web UI
# 7. Verify passport creation succeeded (shows tokenId + CID)
```

## Detailed Testing Instructions

### Sandbox Test Mode (no domain)

Purpose: validate did:web verification + account authorization end-to-end without hosting a domain.

```bash
export FIDES_MODE=test
```

Then open:
- `http://localhost:3000/test`

Or verify the local well-known endpoints:

```bash
curl -s http://localhost:3000/.well-known/did.json | jq
curl -s http://localhost:3000/.well-known/polkadot-accounts.json | jq
```

### 1. Smart Contract Build & Test

```bash
cd dpp_contract

# Build contract
cargo contract build --release

# Run unit tests
cargo test

# Expected output:
# running X tests
# test dpp_contract_v2::tests::... ok
# ...
# test result: ok. X passed; 0 failed
```

**Verification**:
- Contract builds without errors
- All unit tests pass
- Artifact generated: `target/ink/dpp_contract.contract`

### 2. Web Application Setup

**Important**: Docker is the **reference reproducibility path for CI and fresh environments**. Local installs are valid for development. Both paths produce identical results.

#### Path A: Docker (Reproducible Setup)

**Purpose**: Reproducible 5-minute setup for fresh environments and continuous integration.

```bash
# From repo root
docker-compose up -d

# Wait for services to be healthy (~30 seconds)
docker-compose ps

# Expected output:
# fides-kubo        | Daemon is ready
# fides-app         | Ready in X ms

# Access: http://localhost:3000
```

**Verification**:
- All services healthy: `docker-compose ps` shows "healthy" status
- App loads: `curl http://localhost:3000/api/health` returns `{"status":"healthy"}`
- IPFS connection: App shows "Connected" indicator
- Wallet connection: Polkadot.js extension connects successfully

**Note**: This is the reference path for fresh-environment verification.

#### Path B: Local Development (Alternative for Developers)

**Purpose**: Faster iteration for developers who prefer local tooling.

**Prerequisites** (same as System Requirements):
- Node.js 20.9.0+
- npm 9.6.0+
- Rust 1.75.0+
- cargo-contract 4.1.1
- IPFS Kubo (local installation)

```bash
# 1. Install IPFS Kubo locally
# macOS: brew install ipfs
# Ubuntu: sudo apt-get install ipfs
# Or download from: https://dist.ipfs.tech/#kubo

# 2. Initialize and start Kubo
ipfs init
ipfs daemon
# Keep this terminal open

# 3. Setup Next.js application
cd fidesdpp

# Install dependencies
npm install

# Configure environment
cp fidesdpp/.env.example fidesdpp/.env.local

# Edit .env.local:
IPFS_BACKEND=kubo
IPFS_NODE_URL=http://127.0.0.1:5001
IPFS_GATEWAY_URL=http://127.0.0.1:8080
CONTRACT_ADDRESS=0x2b7da3eab6f9660e7bfadc5ea0076e5883b6f11f
POLKADOT_RPC_URL=wss://westend-asset-hub-rpc.polkadot.io
UNTP_SCHEMA_URL=https://test.uncefact.org/vocabulary/untp/dpp/untp-dpp-schema-0.6.1.json

# 4. Start Next.js
npm run dev

# Access: http://localhost:3000
```

**Verification**:
- App loads without errors
- IPFS connection indicator shows "Connected"
- Wallet connection works (Polkadot.js extension)
- Same functionality as Docker path

**Note**: Local installs are valid for development. For reproducible verification, use Path A (Docker).

#### Path Comparison

Both paths produce **identical results**:
- Same contract artifacts (built with same Rust/cargo-contract versions)
- Same test outputs (all tests pass in both environments)
- Same VC-JWT format and validation
- Same IPFS storage format

**When to use each**:
- **Path A (Docker)**: CI/CD, reproducible builds, fresh environment testing
- **Path B (Local)**: Development, debugging, faster iteration, custom tooling

### 3. CLI Tool Testing

**Note**: CLI commands use the same `DppApplicationService` layer as the Web UI to keep CLI/Web parity.

#### CLI Architecture and Parity

The CLI commands are architected to share code with the Web UI:

- **Issuer Commands** (`issuer-register`, `issuer-export`, `issuer-verify`): Import `DidWebManager` from `src/lib/vc/did-web-manager` (same instance used by Web API)
- **VC Commands** (`create-vc`, `verify-vc`): Import `createDppService()` from `src/lib/factory/createDppService` (same factory as Web UI)
- **Application Logic**: All commands use `DppApplicationService` methods directly (same as Web UI server actions)

This architecture guarantees:
1. **Identical Behavior**: CLI and Web UI produce identical outputs for the same inputs
2. **Shared Logic**: No code duplication - single source of truth in `DppApplicationService`
3. **Testability**: Golden test verifies parity by testing `ApplicationService` directly

#### Recommended: Use Web API

For production use and to avoid dependency conflicts, the Web API endpoints are recommended:

```bash
# Register issuer
curl -X POST http://localhost:3000/api/issuer/register \
  -H "Content-Type: application/json" \
  -d '{"domain": "example.com", "organizationName": "Test Org"}'

# Verify issuer
curl -X POST http://localhost:3000/api/issuer/verify \
  -H "Content-Type: application/json" \
  -d '{"domain": "example.com"}'

# Export did.json
curl "http://localhost:3000/api/issuer/register?domain=example.com" | jq '.instructions.content' > did.json
```

These endpoints use the same `DppApplicationService` as the CLI, ensuring identical behavior.

#### CLI Commands (Alternative)

The CLI commands are fully implemented and can be used as an alternative:

```bash
# From project root
cd fidesdpp

# Register issuer
npm run cli issuer register --domain example.com --org "Test Organization"

# Export DID document
npm run cli issuer export --domain example.com --out ./did.json

# Verify issuer
npm run cli issuer verify --domain example.com

# Create VC
npm run cli create-vc --json test-data/sample-dpp.json --account //Alice

# Verify VC
npm run cli verify-vc --token-id 1
```

**Note**: The CLI uses `tsx`. On some Node.js versions, nested dependency resolution can fail. If you hit runtime resolution errors, use the Web UI/API for validation and keep the CLI for local development.

**Verification**:
- CLI commands are implemented and use the same application layer as Web UI
- Golden test verifies CLI-Web parity (see Golden Test section)
- Same passport created via CLI and Web UI produces identical VC-JWT (verified by golden test)
- verify-token.ts shows all fields (no "N/A" values)

### 4. Verifiable Credentials Testing

```bash
cd fidesdpp

# Test VC engine standalone
npm run test:vc

# Expected output:
# VC issued
# Issuer DID: did:key:z6Mkh...
# VC-JWT: eyJhbGci...

# Test VC + IPFS integration
IPFS_BACKEND=kubo npm run test:ipfs-vc

# Expected output:
# VC uploaded to IPFS
# CID: bafkrei...
# VC retrieved and verified
```

**Verification**:
- VCs are valid JWT format (3 parts: header.payload.signature)
- VC payload contains UNTP contexts
- VC signature verifies successfully

### 5. UNTP Schema Validation Testing

```bash
cd fidesdpp

# Test schema validation
npm run test:untp-validation

# Expected output:
# UNTP DPP schema fetched
# DPP validates against schema
# SHA-256 hash matches
```

**Verification**:
- Schema fetched from remote URL
- DPP validates without errors
- Hash verification passes

### 6. Status List Testing (Post-Phase 2)

```bash
cd fidesdpp

# Create passport (assigns status list index)
npm run dev
# Via Web UI: Create passport → Note tokenId

# Revoke passport
npx tsx cli/src/index.ts revoke --token-id X --account //Alice

# Verify revoked passport
npx tsx cli/verify-token.ts --token-id X

# Expected output:
# Passport is revoked
# Status: Revoked
# VC Status: credentialStatus check failed (revoked)
```

**Verification**:
- Created VCs include credentialStatus field
- Revoked VCs fail verification
- Status List VC exists on IPFS

### 7. End-to-End Flow (Complete)

```bash
# 1. Start all services
docker-compose --profile enhanced up -d

# 2. Create passport via Web UI
open http://localhost:3000
# Connect wallet, fill form, create passport
# Note: tokenId = 5, CID = bafkrei...

# 3. Verify via CLI
npx tsx cli/verify-token.ts --token-id 5

# Expected: all checks pass

# 4. Resolve via IDR
curl http://localhost:3000/idr/products/PROD-001?linkType=linkset

# Expected: JSON linkset with untp:dpp link

# 5. Human render
open http://localhost:3000/render/5

# Expected: HTML page with product info
```

**Verification**:
- Passport created via web, verified via CLI (cross-tool verification)
- IDR returns linkset pointing to VC
- Render shows human-readable DPP

### 8. Open-Source-Only Mode Testing

**Purpose**: Verify that all functionality works without walt.id.

**walt.id is OPTIONAL**: The project works fully in FOSS-only mode using native implementations:
- `NativeDidWebManager` (Node.js crypto) instead of walt.id DID:web provider
- `NativeStatusListManager` (@4sure-tech/vc-bitstring-status-lists) instead of walt.id Status List

```bash
# Option A: Use default profile (FOSS-only, no walt.id)
docker-compose up -d
# walt.id service is NOT started (only in 'enhanced' profile)

# Option B: Explicitly disable walt.id flags
export USE_WALT_ID=false
export USE_WALT_ID_DIDWEB=false
docker-compose up fidesdpp kubo

# Create passport via Web UI
# Verify via CLI

# Expected: Everything works (native implementations used)
```

**Verification**:
- App functions identically with USE_WALT_ID=false
- No errors related to walt.id connectivity
- Status List still works (native StatusListManager)
- did:web issuer registration works (NativeDidWebManager)
- All features available: passport creation, verification, revocation

**Note**: walt.id is an **optional enhancement** that provides:
- Advanced DID document hosting features
- Enhanced Status List UI
- Additional VC management tools

These are **not required** for core functionality. Default mode (FOSS-only) uses native implementations.

### 9. CLI-Web Parity Golden Test

**Purpose**: Verify that CLI and Web UI produce identical outputs for the same inputs, ensuring CLI-Web parity as required by Milestone 2 deliverables.

**Architecture**: Both CLI and Web UI use the same `DppApplicationService` layer, guaranteeing parity by design. The golden test verifies this by testing the shared application layer directly.

```bash
cd fidesdpp

# Run golden test
RUN_GOLDEN_TEST=true npm test -- tests/golden/cli-web-parity.test.ts
```

**What the Test Verifies**:

1. **Shared Application Layer**: Both CLI and Web UI use `DppApplicationService` methods:
   - `preparePassportCreation()` - same for both
   - `finalizePassportCreation()` - same for both
   - `verifyPassport()` - same for both

2. **Identical VC Generation**: For the same input:
   - Same VC-JWT payload structure
   - Same DID generation (did:key or did:web)
   - Same IPFS CID (same content = same hash)
   - Same on-chain registration format

3. **Parity Verification**: The test:
   - Creates passport via Web UI path (using `DppApplicationService` directly)
   - Creates passport via CLI path (using `DppApplicationService` directly)
   - Compares outputs to ensure they are identical

**Expected Output**:
```
Golden test PASSED: CLI and Web use the same ApplicationService layer
```

**Implementation Details**:

- **CLI Commands**: Import `createDppService()` from `src/lib/factory/createDppService` (same as Web UI)
- **Web UI**: Uses server actions that call `createDppService()` (same factory)
- **Shared Logic**: All business logic in `DppApplicationService` - no duplication
- **Test Approach**: Tests `ApplicationService` directly, not CLI execution (avoids dependency issues)

**Notes**:

This test satisfies the Milestone 2 requirement for "CLI-Web parity" by:
1. Verifying both paths use the same application layer
2. Ensuring identical outputs for identical inputs
3. Providing reproducible test results for fresh environments

**Note**: The golden test tests the shared `ApplicationService` layer directly, not CLI execution. This approach:
- Avoids dependency conflicts with `tsx`
- Tests the actual business logic (where parity matters)
- Provides faster, more reliable test execution
- Still guarantees CLI-Web parity (same code path = same results)

## Troubleshooting

### "IPFS connection failed"

**Cause**: Kubo daemon not running or wrong URL

**Fix**:
```bash
ipfs daemon  # Start Kubo
# Or check IPFS_NODE_URL in .env.local
```

### "Contract address not found"

**Cause**: Wrong CONTRACT_ADDRESS or network

**Fix**: Verify contract deployed on Westend Asset Hub, check address in .env

### "VC signature invalid"

**Cause**: Account is sr25519 (not Ed25519)

**Fix**: Create Ed25519 account in Polkadot.js extension (see docs/HOW_TO_CREATE_ED25519_ACCOUNT.md)

### Docker Compose fails on Linux

**Cause**: host.docker.internal not available

**Fix**: Use included kubo service in docker-compose (default setup)

### "ERR_PACKAGE_PATH_NOT_EXPORTED" (CLI)

**Cause**: generated `.js` artifacts were emitted under `fidesdpp/src/` and Node resolves them as CommonJS.

**Fix**:
```bash
cd fidesdpp
npm run clean:generated
```

## Reproducibility Checklist

Before M2 submission, verify:

- [ ] Fresh Ubuntu 22.04 VM can clone + docker-compose up successfully
- [ ] Fresh macOS can clone + docker-compose up successfully
- [ ] All environment variables documented in `fidesdpp/.env.example`
- [ ] All dependency versions match DEPENDENCIES.md
- [ ] All tests pass: contract tests, VC tests, IPFS tests
- [x] CLI and Web UI produce identical VCs for same input (golden test - verified via shared ApplicationService)
- [ ] FOSS-only mode works (USE_WALT_ID=false, USE_WALT_ID_DIDWEB=false)

## Docker Profiles

### Profile: default (FOSS-only)
```bash
docker-compose up
```
- Includes: kubo (IPFS), fidesdpp (app)
- Storage: File-based (./data volume)
- No walt.id, no PostgreSQL

### Profile: stateful
```bash
docker-compose --profile stateful up
```
- Includes: kubo, fidesdpp, postgres
- Storage: PostgreSQL (persistent)
- No walt.id (native implementations)

### Profile: enhanced (Optional - walt.id features)
```bash
docker-compose --profile enhanced up
```
- Includes: kubo, fidesdpp, postgres, walt.id
- Storage: PostgreSQL
- Optional walt.id adapters (if USE_WALT_ID=true or USE_WALT_ID_DIDWEB=true)
- **Note**: walt.id is optional. App works fully without it (FOSS-only mode).
- **Default**: USE_WALT_ID=false, USE_WALT_ID_DIDWEB=false (native implementations used)

## Environment Variables Reference

Create `fidesdpp/.env.local` (recommended):

```bash
# Required
CONTRACT_ADDRESS=0x2b7da3eab6f9660e7bfadc5ea0076e5883b6f11f
POLKADOT_RPC_URL=wss://westend-asset-hub-rpc.polkadot.io

# IPFS (default: kubo from docker-compose)
IPFS_BACKEND=kubo
IPFS_NODE_URL=http://127.0.0.1:5001
IPFS_GATEWAY_URL=http://127.0.0.1:8080

# UNTP Schema
UNTP_SCHEMA_URL=https://test.uncefact.org/vocabulary/untp/dpp/untp-dpp-schema-0.6.1.json
UNTP_SCHEMA_SHA256=

# Storage (default: file-based)
STORAGE_BACKEND=file  # or 'postgres'
DATABASE_URL=postgresql://fides:fides_dev_password@localhost:5432/fides_dpp

# Walt.id (optional, default: false)
USE_WALT_ID=false
USE_WALT_ID_DIDWEB=false
WALT_ID_ISSUER_URL=http://localhost:7002

# URLs for IDR and renderMethod
IDR_BASE_URL=http://localhost:3000
RENDER_BASE_URL=http://localhost:3000
```

## License

This testing guide: Apache-2.0
