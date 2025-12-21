# IPFS Backend Tests

This directory contains tests for the IPFS storage backend abstraction.

## Test Structure

- `KuboBackend.test.ts` - Tests for Kubo (self-hosted) backend
- `HeliaBackend.test.ts` - Tests for Helia (embedded) backend
- `PinataBackend.test.ts` - Tests for Pinata (optional SaaS) backend
- `IpfsStorageFactory.test.ts` - Tests for backend factory and selection
- `hash-consistency.test.ts` - Tests for hash computation consistency

## Running Tests

### All tests

```bash
npm test
```

### Specific backend

```bash
npm test -- KuboBackend.test.ts
```

### Watch mode

```bash
npm test -- --watch
```

## Test Requirements

### Unit Tests

All tests in this suite are unit tests except the integration tests marked with "integration" in their description.

**Requirements**: None (mocked)

### Integration Tests

Integration tests require actual IPFS backends to be available:

#### Kubo Integration Tests

**Requirements:**
- Kubo installed: https://dist.ipfs.tech/#kubo
- Kubo daemon running: `ipfs daemon`
- Accessible at: http://127.0.0.1:5001

If Kubo is not available, these tests will be skipped.

#### Helia Integration Tests

**Requirements:**
- Helia dependencies installed: `npm install helia @helia/json @helia/unixfs`

If dependencies are missing, these tests will be skipped.

#### Pinata Integration Tests

**Requirements:**
- Environment variables set:
  - `PINATA_JWT=your_jwt`
  - `NEXT_PUBLIC_PINATA_GATEWAY_URL=your-gateway.mypinata.cloud`

If credentials are not set, these tests will be skipped.

## Test Intent

These tests verify that:

1. All backends implement the same interface
2. FOSS backends (Kubo, Helia) work without Pinata
3. Hash computation is consistent across backends
4. Backends are interchangeable at the application layer

## Test Coverage Goals

- [ ] Unit tests for all public methods
- [ ] Integration tests for each backend
- [ ] Hash consistency tests
- [ ] Error handling tests
- [ ] Configuration validation tests
- [ ] E2E tests with smart contract

## Known Issues

- Integration tests require external services (Kubo daemon, Pinata account)
- Tests are skipped gracefully if dependencies not available
- Full E2E tests with contract calls not yet implemented

## Future Improvements

- Add mock IPFS node for deterministic testing
- Add contract call mocking for E2E tests
- Add performance benchmarks
- Add load testing for concurrent uploads
