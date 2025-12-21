/**
 * DID:web Provider Interface
 * 
 * Abstract interface for did:web key management and DID document generation.
 * Allows swapping between native implementation and walt.id adapter.
 * 
 * @license Apache-2.0
 */

import type { VcIssuerIdentity } from '../issuer-identity';

/**
 * DID Document (simplified W3C DID Core structure)
 */
export interface DidDocument {
  '@context': string[];
  id: string;
  verificationMethod: Array<{
    id: string;
    type: string;
    controller: string;
    publicKeyJwk: any;
  }>;
  authentication: string[];
  assertionMethod: string[];
  service?: Array<{
    id: string;
    type: string;
    serviceEndpoint: string | object;
  }>;
}

/**
 * DID:web Provider Interface
 * 
 * Implementations:
 * - NativeDidWebManager (default, FOSS, Node.js crypto)
 * - WaltIdDidWebProvider (optional, behind USE_WALT_ID_DIDWEB flag)
 * 
 * Note: did:web ALWAYS requires hosting /.well-known/did.json on your domain.
 * This interface manages keys and DID document generation, NOT hosting.
 */
export interface DidWebProvider {
  /**
   * Register a new did:web issuer
   * 
   * Generates Ed25519 key pair, creates DID, stores identity.
   * 
   * @param domain - Domain name (e.g., "dpp.example.com")
   * @param metadata - Optional metadata (e.g., organization name)
   * @returns VcIssuerIdentity with did:web DID
   */
  registerIssuer(domain: string, metadata?: any): Promise<VcIssuerIdentity>;

  /**
   * Get issuer identity by DID
   * 
   * @param did - DID to lookup (e.g., "did:web:dpp.example.com")
   * @returns VcIssuerIdentity or null if not found
   */
  getIssuer(did: string): Promise<VcIssuerIdentity | null>;

  /**
   * Rotate issuer's signing key
   * 
   * Generates new Ed25519 key pair, updates DID document.
   * Old keys should be kept temporarily for verification of existing VCs.
   * 
   * @param did - DID to rotate keys for
   * @returns Updated VcIssuerIdentity with new key
   */
  rotateKey(did: string): Promise<VcIssuerIdentity>;

  /**
   * Generate DID document for hosting at /.well-known/did.json
   * 
   * @param did - DID to generate document for
   * @returns DID Document (JSON-LD format)
   */
  generateDidDocument(did: string): Promise<DidDocument>;

  /**
   * List all registered issuers (for admin/debugging)
   * 
   * @returns Array of issuer DIDs
   */
  listIssuers(): Promise<string[]>;
}



