/**
 * VC Engine Types
 * 
 * Type definitions for Verifiable Credentials engine
 * 
 * @license Apache-2.0
 */

import type { DigitalProductPassport } from '../untp/generateDppJsonLd';

export interface VcEnvelope {
  // JWT string representation
  jwt: string;
  
  // Decoded payload (for inspection)
  payload: {
    iss: string;              // did:pkh:polkadot:...
    sub: string;              // Subject (product identifier)
    vc: {
      '@context': string[];
      type: string[];
      credentialSubject: DigitalProductPassport;
      // W3C standard schema reference
      credentialSchema?: {
        id: string;           // URL to JSON Schema (e.g., UNTP DPP schema)
        type: string;         // Schema type (e.g., 'JsonSchema2023')
      };
      // Optional schema integrity hash
      schemaSha256?: string;  // SHA-256 hash of schema for verification
    };
    nbf?: number;             // Not before (issuance date)
    exp?: number;             // Expiration date
    jti?: string;             // JWT ID (unique identifier)
  };
  
  // Decoded header
  header: {
    alg: string;              // Signing algorithm (EdDSA for Polkadot)
    typ: 'JWT';
  };
}

export interface IssueOptions {
  expirationDate?: Date;
  credentialId?: string;
  additionalContexts?: string[];
}

export interface VerifyOptions {
  checkExpiration?: boolean;
  checkRevocation?: boolean;  // Future: check on-chain revocation
  audience?: string;
}

export interface VerificationResult {
  verified: boolean;
  issuer: string;
  issuanceDate: Date;
  expirationDate?: Date;
  errors: string[];
  warnings: string[];
  payload?: any;
}

/**
 * Supported key types for VC-JWT signing
 * 
 * CRITICAL: Only ed25519 is JWS-standard for EdDSA algorithm.
 * sr25519 is NOT compatible with standard JWT libraries (did-jwt-vc).
 */
export type KeyType = 'ed25519' | 'secp256k1';

export interface PolkadotAccount {
  address: string;            // SS58 address
  publicKey: Uint8Array;      // Public key bytes (32 bytes for ed25519, 33 bytes compressed for secp256k1)
  sign: (data: Uint8Array) => Promise<Uint8Array>;  // Signing function
  network?: string;           // 'westend-asset-hub', 'polkadot', etc.
  keyType?: KeyType;          // Key type (default: 'ed25519'). MUST be ed25519 for EdDSA/did:key
}

/**
 * Decoded VC-JWT structure
 * 
 * Result of decoding a raw JWT string without verification.
 * Used for visualization and extraction purposes.
 */
export interface DecodedVcJwt {
  /** Decoded JWT header (alg, typ, etc.) */
  header: any;
  /** Decoded JWT payload (iss, sub, vc, etc.) */
  payload: any;
  /** Base64URL-encoded signature (for display only, not verified) */
  signature: string;
  /** Original raw JWT string */
  raw: string;
}

/**
 * Extracted DPP result from VC payload
 * 
 * Contains both the full VC object (for validation) and the DPP object (credentialSubject).
 */
export interface ExtractedDppResult {
  /** Full VC object for validation (includes @context, type, credentialSchema, etc.) */
  vcObject: any;
  /** UNTP DPP object (the credentialSubject) */
  dppObject: any;
}
