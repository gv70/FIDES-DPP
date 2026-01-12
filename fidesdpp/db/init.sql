-- FIDES-DPP Database Schema
-- Status List persistence tables
-- 
-- License: Apache-2.0

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Status List Mappings Table
-- Maps tokenId to statusListIndex for each credential
CREATE TABLE IF NOT EXISTS status_list_mappings (
  token_id TEXT PRIMARY KEY,
  issuer_did TEXT NOT NULL,
  status_list_index INTEGER NOT NULL,
  status_list_cid TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Indexes for efficient lookups
  CONSTRAINT status_list_index_positive CHECK (status_list_index >= 0)
);

CREATE INDEX IF NOT EXISTS idx_mappings_issuer_did ON status_list_mappings(issuer_did);
CREATE INDEX IF NOT EXISTS idx_mappings_created_at ON status_list_mappings(created_at DESC);

-- Status List Versions Table
-- Tracks current Status List VC CID for each issuer
CREATE TABLE IF NOT EXISTS status_list_versions (
  issuer_did TEXT PRIMARY KEY,
  current_cid TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_versions_updated_at ON status_list_versions(updated_at DESC);

-- DID:web Issuer Keys Table (optional, for persistent key management)
-- Stores Ed25519 key pairs for did:web issuers
CREATE TABLE IF NOT EXISTS didweb_issuer_keys (
  did TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  public_key_jwk JSONB NOT NULL,
  private_key_jwk JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  rotated_at TIMESTAMP,
  
  -- Key metadata
  key_id TEXT,
  algorithm TEXT DEFAULT 'Ed25519',
  
  CONSTRAINT valid_algorithm CHECK (algorithm IN ('Ed25519', 'ES256'))
);

CREATE INDEX IF NOT EXISTS idx_issuer_keys_domain ON didweb_issuer_keys(domain);
CREATE INDEX IF NOT EXISTS idx_issuer_keys_created_at ON didweb_issuer_keys(created_at DESC);

-- DID:web Issuer Identities Table (server-side signing + verification)
-- Stores issuer identity metadata and public keys (private keys are encrypted)
CREATE TABLE IF NOT EXISTS issuer_identities (
  did TEXT PRIMARY KEY,
  method TEXT NOT NULL,
  public_key BYTEA NOT NULL,
  private_key BYTEA, -- legacy plaintext field (deprecated, should be NULL)
  encrypted_private_key JSONB,
  metadata JSONB NOT NULL,
  status TEXT NOT NULL,
  last_attempt_at TIMESTAMP,
  last_error TEXT,
  authorized_polkadot_accounts JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_issuer_identities_status ON issuer_identities(status);
CREATE INDEX IF NOT EXISTS idx_issuer_identities_updated_at ON issuer_identities(updated_at DESC);

-- UNTP DTE Index Table (resolver-first traceability)
-- Links product identifiers to DTE credentials and event metadata.
CREATE TABLE IF NOT EXISTS dte_event_index (
  product_id TEXT NOT NULL,
  dte_cid TEXT NOT NULL,
  dte_uri TEXT NOT NULL,
  gateway_url TEXT,
  issuer_did TEXT NOT NULL,
  credential_id TEXT,
  event_id TEXT NOT NULL,
  event_type TEXT,
  event_time TIMESTAMP,
  role TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT dte_event_index_pk PRIMARY KEY (product_id, dte_cid, event_id, role)
);

CREATE INDEX IF NOT EXISTS idx_dte_event_index_product_id ON dte_event_index(product_id);
CREATE INDEX IF NOT EXISTS idx_dte_event_index_dte_cid ON dte_event_index(dte_cid);
CREATE INDEX IF NOT EXISTS idx_dte_event_index_event_time ON dte_event_index(event_time DESC);

-- Audit log for revocations
CREATE TABLE IF NOT EXISTS revocation_audit (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  token_id TEXT NOT NULL,
  issuer_did TEXT NOT NULL,
  revoked_at TIMESTAMP DEFAULT NOW(),
  reason TEXT,
  status_list_cid TEXT,
  tx_hash TEXT,
  
  FOREIGN KEY (token_id) REFERENCES status_list_mappings(token_id)
);

CREATE INDEX IF NOT EXISTS idx_revocation_token_id ON revocation_audit(token_id);
CREATE INDEX IF NOT EXISTS idx_revocation_issuer_did ON revocation_audit(issuer_did);
CREATE INDEX IF NOT EXISTS idx_revocation_revoked_at ON revocation_audit(revoked_at DESC);

-- Database permissions (adjust for your deployment)

-- Maintenance: Vacuum and analyze for optimal performance
VACUUM ANALYZE status_list_mappings;
VACUUM ANALYZE status_list_versions;
VACUUM ANALYZE didweb_issuer_keys;
VACUUM ANALYZE dte_event_index;
VACUUM ANALYZE revocation_audit;
