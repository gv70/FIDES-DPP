# Dependencies Register

This document lists project dependencies for license tracking and reproducible builds.

## Sources of Truth (Pinning)

- **Node.js app**: `fidesdpp/package.json`, `fidesdpp/package-lock.json`
- **Rust smart contract**: `dpp_contract/Cargo.toml`, `dpp_contract/Cargo.lock`
- **Docker images**: `docker-compose.yml`, `fidesdpp/Dockerfile`

## How to Keep This Document in Sync

1. **When adding/updating a Node.js dependency**: Run `npm install <package>` (or edit `fidesdpp/package.json`), then:
   - Add entry to appropriate section below using the template format
   - Update `THIRD_PARTY_NOTICES.md` with copyright notice and license text
   - Run `bash scripts/verify-dependencies.sh` to validate consistency
   - Update "Last Verified" timestamp above

2. **When adding/updating a Rust crate**: Update `dpp_contract/Cargo.toml`, then:
   - Run `cargo update -p <crate>` (or `cargo update`) in `dpp_contract/` to refresh `dpp_contract/Cargo.lock`
   - Update the Rust section below (include both **Cargo.toml constraint** and **Cargo.lock resolved**)
   - Update "Last Verified" timestamp

3. **When changing Docker images**: Update `docker-compose.yml` and/or `fidesdpp/Dockerfile`, then:
   - Prefer digest pins (`@sha256:...`) for production
   - Record digest and/or upstream commit (when available) in the Docker section below
   - Update "Last Verified" timestamp

4. **Verification**: Run `bash scripts/verify-dependencies.sh` regularly (in CI or before commits) to catch drift.

## Template for Adding Dependencies

When adding a new dependency, use this template:

```markdown
| Name | Source | License | Resolved Version | Allowed Range | Scope | Notes | Evidence |
|------|--------|---------|-----------------|--------------|-------|-------|----------|
| package-name | https://github.com/org/package | Apache-2.0 | 1.2.3 | none (exact) | runtime | Brief description | `fidesdpp/package-lock.json` |
```

**Required Fields**:
- **Name**: npm package name or service name
- **Source**: GitHub URL, npm URL, or official source repository
- **License**: Exact license identifier (Apache-2.0, MIT, GPL-3.0, etc.)
- **Resolved Version**: Version currently locked (npm: `package-lock.json`, rust: `Cargo.lock`, docker: tag/digest)
- **Allowed Range**: If not “none”, state the permitted range **and why** (e.g., `^3` in Cargo.toml, but locked by Cargo.lock)
- **Scope**: `runtime`, `dev`, or `build`
- **Notes**: Brief description of purpose
- **Evidence**: File path(s) / command output that allows verification

## Node.js Runtime Dependencies (Required) — `fidesdpp/`

| Name | Source | License | Resolved Version | Allowed Range | Scope | Notes | Evidence |
|------|--------|---------|-----------------|--------------|-------|-------|----------|
| did-jwt-vc | https://github.com/decentralized-identity/did-jwt-vc | Apache-2.0 | 4.0.16 | none (locked) | runtime | VC issuance/verification | `fidesdpp/package-lock.json` |
| did-resolver | https://github.com/decentralized-identity/did-resolver | Apache-2.0 | 4.1.0 | none (locked) | runtime | DID resolution (did:key, did:web) | `fidesdpp/package-lock.json` |
| dedot | https://github.com/dedotdev/dedot | MIT | 1.0.2 | none (locked) | runtime | Polkadot Asset Hub client (reviveApi compat) | `fidesdpp/package-lock.json` |
| typink | https://github.com/dedotdev/typink | MIT | 0.6.0 | none (locked) | runtime | ink! contract TypeScript bindings | `fidesdpp/package-lock.json` |
| ajv | https://github.com/ajv-validator/ajv | MIT | 8.17.1 | none (locked) | runtime | JSON Schema validation (UNTP schema) | `fidesdpp/package-lock.json` |
| ajv-formats | https://github.com/ajv-validator/ajv-formats | MIT | 3.0.1 | none (locked) | runtime | Additional formats for Ajv | `fidesdpp/package-lock.json` |
| @4sure-tech/vc-bitstring-status-lists | https://github.com/4sure-tech/vc-bitstring-status-lists | Apache-2.0 | 0.1.0 | none (locked) | runtime | W3C Bitstring Status List 2021 (native impl) | `fidesdpp/package-lock.json` |
| next | https://github.com/vercel/next.js | MIT | 16.0.8 | none (locked) | runtime | Web framework | `fidesdpp/package-lock.json` |
| react | https://github.com/facebook/react | MIT | 19.2.1 | none (locked) | runtime | UI library | `fidesdpp/package-lock.json` |
| react-dom | https://github.com/facebook/react | MIT | 19.2.1 | none (locked) | runtime | React DOM bindings | `fidesdpp/package-lock.json` |
| @polkadot/api | https://github.com/polkadot-js/api | Apache-2.0 | 16.5.4 | none (locked) | runtime | Polkadot client (legacy paths) | `fidesdpp/package-lock.json` |
| @polkadot/util-crypto | https://github.com/polkadot-js/common | Apache-2.0 | 14.0.1 | none (locked) | runtime | Cryptographic utilities | `fidesdpp/package-lock.json` |

## Node.js Runtime Dependencies (Optional / Enhancement) — `fidesdpp/`

| Name | Source | License | Resolved Version | Allowed Range | Scope | Notes | Evidence |
|------|--------|---------|-----------------|--------------|-------|-------|----------|
| pinata | https://www.npmjs.com/package/pinata | MIT | 2.5.1 | none (locked) | runtime | Optional SaaS pinning provider | `fidesdpp/package-lock.json` |
| pg | https://github.com/brianc/node-postgres | MIT | 8.16.3 | none (locked) | runtime | PostgreSQL client (anagrafica + status list) | `fidesdpp/package-lock.json` |
| @types/pg | https://github.com/DefinitelyTyped/DefinitelyTyped | MIT | 8.16.0 | none (locked) | dev | TypeScript types for `pg` | `fidesdpp/package-lock.json` |

## Node.js Build/Dev Dependencies — `fidesdpp/`

| Name | Source | License | Resolved Version | Allowed Range | Scope | Notes | Evidence |
|------|--------|---------|-----------------|--------------|-------|-------|----------|
| typescript | https://github.com/microsoft/TypeScript | Apache-2.0 | 5.9.3 | none (locked) | build | Type checking and compilation | `fidesdpp/package-lock.json` |
| tsx | https://github.com/privatenumber/tsx | MIT | 4.21.0 | none (locked) | build | TypeScript execution (CLI) | `fidesdpp/package-lock.json` |
| eslint | https://github.com/eslint/eslint | MIT | 9.39.1 | none (locked) | dev | Code linting | `fidesdpp/package-lock.json` |
| prettier | https://github.com/prettier/prettier | MIT | 3.7.4 | none (locked) | dev | Code formatting | `fidesdpp/package-lock.json` |
| tailwindcss | https://github.com/tailwindlabs/tailwindcss | MIT | 4.1.17 | none (locked) | build | CSS framework | `fidesdpp/package-lock.json` |
| jest | https://github.com/jestjs/jest | MIT | 30.2.0 | none (locked) | dev | Unit tests | `fidesdpp/package-lock.json` |

## Rust Crates (Smart Contract) — `dpp_contract/`

| Name | Source | License | Resolved Version | Allowed Range | Scope | Notes | Evidence |
|------|--------|---------|-----------------|--------------|-------|-------|----------|
| ink | https://github.com/use-ink/ink | Apache-2.0 | 6.0.0-beta | `6.0.0-beta` (pre-release; pinned intentionally) | build | Required by the contract toolchain; upgrade to stable when ink! 6 is released | `dpp_contract/Cargo.toml`, `dpp_contract/Cargo.lock` |
| parity-scale-codec | https://github.com/paritytech/parity-scale-codec | Apache-2.0 | 3.7.5 | `^3` (Cargo.toml), exact via Cargo.lock | build | SCALE encoding/decoding | `dpp_contract/Cargo.toml`, `dpp_contract/Cargo.lock` |
| scale-info | https://github.com/paritytech/scale-info | Apache-2.0 | 2.11.6 | `^2` (Cargo.toml), exact via Cargo.lock | build | Runtime type metadata | `dpp_contract/Cargo.toml`, `dpp_contract/Cargo.lock` |

## Docker Images (Local Services)

| Name | Source | License | Resolved Version | Allowed Range | Scope | Notes | Evidence |
|------|--------|---------|-----------------|--------------|-------|-------|----------|
| ipfs/kubo | https://github.com/ipfs/kubo | MIT/Apache-2.0 | `v0.31.0` (tag) | none (pinned) | runtime | **Digest pin recommended** for production; record `@sha256:...` here when available | `docker-compose.yml` |
| postgres | https://github.com/docker-library/postgres | PostgreSQL License | `16-alpine` (tag) | none (pinned) | runtime | **Digest pin recommended** for production; record `@sha256:...` here when available | `docker-compose.yml` |
| waltid/issuer-api | https://github.com/walt-id/waltid-identity | Apache-2.0 | `1.2.0` (tag) | none (pinned) | runtime | Optional (“enhanced” profile); record image digest and upstream commit when available | `docker-compose.yml` |
| node (base image) | https://github.com/nodejs/docker-node | MIT | `20.19.0-alpine` (tag) | none (pinned) | build | Used by `fidesdpp/Dockerfile`; **digest pin recommended** for production | `fidesdpp/Dockerfile` |

## Version Pinning Strategy

- **Node.js (npm)**: Locked via `fidesdpp/package-lock.json` (exact versions recorded above as “Resolved Version”)
- **Rust**: Locked via `dpp_contract/Cargo.lock`; `dpp_contract/Cargo.toml` may allow a semver range, but builds are reproducible from the lock
- **Docker**: Tags are pinned in `docker-compose.yml`; for production, replace tags with digests (`@sha256:...`) and record them in this document

## Replacement Plans (Risk Mitigation)

| Dependency | Risk Level | Replacement Plan | Effort |
|------------|------------|------------------|--------|
| walt.id | Low | Native StatusListManager (already implemented) | 0 days (exists) |
| Pinata | Low | Kubo or Helia (already implemented) | 0 days (exists) |
| did-jwt-vc | Medium | Migrate to @walt-id/credentials or native JWT lib | 5-10 days |
| dedot | Low | Revert to @polkadot/api (with reviveApi limitations) | 2 days |

## Security & Maintenance

- **Vulnerability scanning**: npm audit run in CI (GitHub Actions)
- **License scanning**: All dependencies audited for license compatibility
- **Update strategy**: Monitor security advisories, test updates in dev before prod
- **Transitive dependencies**: See “Verification Evidence” below (counts are computed from lockfiles)

## Compliance Notes

- All core runtime dependencies are Apache-2.0 or MIT (license-compatible)
- **NO proprietary SaaS** required for core functionality
- Walt.id runs **locally via Docker** (NOT external cloud service)
- **Full functionality in FOSS-only mode** (USE_WALT_ID=false, USE_WALT_ID_DIDWEB=false)
- Lockfiles committed: package-lock.json, Cargo.lock (reproducibility)
- UNTP JSON Schema (GPL-3.0) fetched at runtime, never vendored/copied into codebase

## Walt.id Integration Details

### Use Case 1: Status List Management (Optional)
- **Flag**: `USE_WALT_ID=false` (default)
- **Alternative**: Native StatusListManager with @4sure-tech/vc-bitstring-status-lists
- **Docker**: waltid-issuer service (profile: enhanced)

### Use Case 2: DID:web Key Management (Optional)
- **Flag**: `USE_WALT_ID_DIDWEB=false` (default)
- **Alternative**: NativeDidWebManager (Node.js crypto)
- **Docker**: Same waltid-issuer service

### Deployment Modes
1. **FOSS-only** (default): No walt.id, file-based storage, works offline
2. **Stateful** (--profile stateful): + PostgreSQL for persistence
3. **Enhanced** (--profile enhanced): + PostgreSQL + walt.id (all features)

## Third-Party Service Dependencies

**None**. All services run locally via Docker Compose. No external SaaS required.

## Verification Evidence

### Dependency script output

Last run: **2025-12-21**  
Command: `bash scripts/verify-dependencies.sh`

```text
Verifying dependencies match DEPENDENCIES.md...
Checking Node.js dependencies (from fidesdpp/package-lock.json)...
Checking Docker image versions...
Checking documentation completeness...
Checking Rust contract dependencies (from dpp_contract/Cargo.lock)...
OK: All dependency checks passed.
```

### Transitive dependency counts (lockfile-derived)

- **npm (fidesdpp)**: `node -e "const l=require('./fidesdpp/package-lock.json'); console.log(Object.keys(l.packages||{}).length-1)"` → **948**
- **cargo (dpp_contract)**: `rg '^\[\[package\]\]$' dpp_contract/Cargo.lock | wc -l` → **477**

### Docker digest collection (for filling this register)

After pulling a tag, capture its digest and replace the tag in `docker-compose.yml` and in the table above:

```bash
docker pull ipfs/kubo:v0.31.0
docker image inspect --format '{{index .RepoDigests 0}}' ipfs/kubo:v0.31.0
```

---

For copyright attributions and full license texts, see [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
