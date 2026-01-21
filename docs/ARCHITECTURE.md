# Architecture

This document describes the current system architecture and the rationale behind key design choices.

## Goals

- Provide a verifiable on-chain reference for a Digital Product Passport.
- Keep the data model extensible to cover category-specific requirements.
- Support integrity checks, version history, and revocation.
- Avoid storing large or sensitive datasets in plaintext on-chain.

## System overview

The system is split into three layers:

- **On-chain anchor (ink! contract)**: stores dataset pointers, payload hashes, lifecycle status, and version history.
- **Off-chain payload (VC-JWT)**: stores the machine-readable DPP dataset and links to supporting documentation.
- **Applications (web + CLI)**: create, verify, export, and operate the flow using Polkadot wallets and RPC endpoints.

Additionally, the web layer exposes UNTP-aligned access patterns:

- **IDR (Identity Resolver)**: productId → RFC 9264 linkset (typed links for data + UI).
- **Render**: customer-facing HTML view for a passport.
- **DTE (Digital Traceability Events)**: supply-chain events issued by multiple actors and discoverable via the IDR.

## On-chain anchor model

The contract stores a minimal record per passport:

- `dataset_uri`: where to fetch the payload (typically IPFS).
- `payload_hash`: integrity anchor (SHA-256 of the exact VC-JWT string bytes).
- `dataset_type`: expected payload format (e.g., `application/vc+jwt`).
- `status`: technical lifecycle state (e.g., active, revoked).
- `version` + `version_history`: append-only history entries for auditability.
- `granularity` + `subject_id_hash`: lookup/index support without revealing the raw identifier.

This is designed to keep the on-chain footprint stable while allowing the payload to evolve.

## Ownership and authority

Two distinct concepts are tracked:

- **Issuer authority**: the account that registered the passport. Only the issuer can update or revoke the anchor.
- **Ownership (custody)**: an NFT-like owner that can be transferred. Ownership transfer does not change the issuer.

This enables custody transfer without weakening the audit model of who published and updated the passport dataset.

## Off-chain payload model (VC-JWT)

The payload is issued as a W3C Verifiable Credential in JWT form and stored off-chain.

Rationale:

- **Schema coverage**: richer datasets are more practical off-chain than inside a contract storage struct.
- **Interoperability**: VC payloads can be consumed outside the blockchain context, while the contract provides a verifiable anchor.
- **Update strategy**: updates create new payload versions, anchored and indexed via the contract versioning.

## Integrity and verification

The verification flow is:

1. Read the on-chain record (URI, hash, status, version).
2. Retrieve the VC-JWT from `dataset_uri`.
3. Recompute the SHA-256 hash over the VC-JWT string and compare with `payload_hash`.
4. Verify the VC signature and resolve the issuer identity (e.g., `did:web`).
5. Validate the payload structure where applicable (schema checks are handled at the application layer).

The key property is that a verifier can detect tampering of the off-chain dataset using only the on-chain anchor.

## Stable access (IDR / productId-first)

To avoid coupling UX and integrations to a tokenId (which may not exist yet), the system supports a productId-first resolver:

- `GET /idr/products/{productId}` returns an RFC 9264 linkset (`application/linkset+json`)
- Lookup can fall back to the on-chain `subject_id_hash` index, so the resolver does not depend on local indexes.
- The linkset can include typed links to:
  - the DPP VC (`untp:dpp`)
  - the customer-facing page (`alternate`)
  - related traceability event credentials (`untp:dte`)

This aligns with the UNTP expectation that identifiers resolve to machine-readable linksets and supports ESPR/CIRPASS-2 redirection patterns.

## Traceability (UNTP DTE, federated supply-chain evidence)

Supply-chain actors can issue their own events as Verifiable Credentials (VC-JWT) and publish them off-chain. The platform indexes these credentials by referenced product identifiers so that:

- the IDR can expose `untp:dte` links for a productId
- the render page can show traceability history as evidence cards/timeline entries

### Governance (Allowlist)

To prevent untrusted parties from attaching events to products, the platform supports an allowlist policy:

- manufacturers maintain `trustedSupplierDids` (off-chain metadata)
- publishing/indexing DTEs is permitted only when the DTE issuer is allowlisted for the product’s manufacturer

This implements a pragmatic “UNTP federated contributions + governance” model without requiring a contract change.

## Access tiers and confidentiality (stepwise)

The current architecture supports a stepwise approach:

- Keep the on-chain record public and minimal.
- Put sensitive or non-public data in the off-chain payload under restricted sections.
- Use encryption for restricted sections and distribute decryption material out-of-band (e.g., via a controlled verification link or an enterprise channel).

This preserves integrity and auditability while avoiding plaintext sensitive data on-chain.

## Polkadot integration (dedot / typink)

Applications use Polkadot-first libraries to reduce custom integration code:

- **dedot**: browser wallet integration for signing payloads and submitting extrinsics.
- **typink**: typed contract interaction patterns and metadata-driven calls.

The goal is to keep contract interactions consistent across web and CLI and aligned with typical Polkadot tooling.
