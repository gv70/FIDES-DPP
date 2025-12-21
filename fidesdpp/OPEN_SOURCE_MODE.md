# Open-Source-Only Mode

This project can run with open-source components only. Optional services are supported for convenience, but they are not required.

## Default Setup

- IPFS: Kubo (recommended) or Helia
- Storage: file-based (default)
- Chain: Polkadot Asset Hub RPC endpoint

## Optional Components

- Pinata: optional IPFS pinning service (convenience only)
- PostgreSQL: optional storage backend (useful for stateful deployments)
- walt.id: optional local service for additional VC/status-list workflows (project runs without it)

## What “Open-Source-Only” Means Here

- You can build and run the app without requiring paid services.
- You can create, store, and verify passports using local components.
- Optional services should not block core flows when they are disabled.

