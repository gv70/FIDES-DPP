# FIDES-DPP Roadmap

## Milestone 1 - Smart Contract MVP
- [x] Passport registration and retrieval
- [x] Ownership and transfer primitives
- [x] Deploy to Westend Asset Hub

## Milestone 2 - Web, CLI, and Hybrid VC Flow
- [x] Hybrid architecture (on-chain anchor + off-chain VC-JWT)
- [x] IPFS integration (Kubo-first) with integrity anchoring (payload hash)
- [x] Web interface (create, list, verify, update, revoke, render)
- [x] did:web issuer management (register, export, verify)
- [x] CLI parity for core workflows (issuer, create, read, verify, update, revoke)
- [x] Sandbox test mode (local did:web without a domain)
- [x] Production-capable deployment path (Docker Compose + optional PostgreSQL storage)
- [x] ESPR annex III-aligned optional fields (off-chain payload extensions and documentation links)

## Next - Structural Enhancements (Planned)
- [ ] Expanded data coverage (ESPR annex III fields and category-specific extensions)
- [ ] Access tiers and governance (roles, permissions, delegation)
- [ ] Confidentiality hardening (key distribution/rotation, revocation-aware access)
- [ ] Verification hardening (clear supersession signals across versions, evidence links)
- [ ] Interoperability bundles (stable export format and integration surface)
- [ ] Broader automated tests and reproducible conformance scenarios
