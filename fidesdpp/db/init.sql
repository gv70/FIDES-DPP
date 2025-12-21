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
VACUUM ANALYZE revocation_audit;


