/**
 * VC Issuer Identity Abstraction
 * 
 * Decouples VC issuer identity from blockchain wallet keys.
 * Supports both did:web (organizational) and did:key (legacy) methods.
 * 
 * This abstraction enables:
 * - Wallet-agnostic VC issuance (any Polkadot account type)
 * - UNTP-compliant organizational identity (did:web)
 * - Backward compatibility with did:key credentials
 * 
 * @license Apache-2.0
 */

import * as crypto from 'crypto';

export type DidMethod = 'did:web' | 'did:key';

export interface VcIssuerSigningKey {
  /** Key type (always ed25519 for VC-JWT EdDSA compatibility) */
  type: 'ed25519';
  /** Public key bytes (32 bytes for ed25519) */
  publicKey: Uint8Array;
  /** Private key bytes (only for server-managed keys, e.g., did:web) */
  privateKey?: Uint8Array;
}

export interface VcIssuerIdentityMetadata {
  /** Organization name */
  organizationName?: string;
  /** Domain for did:web (e.g., "company.com") */
  domain?: string;
  /** Registration timestamp */
  registeredAt?: Date;
  /** Additional metadata */
  [key: string]: any;
}

/**
 * VC Issuer Identity
 * 
 * Represents the identity used to issue Verifiable Credentials.
 * This is separate from the blockchain wallet used for on-chain transactions.
 * 
 * For did:web: Platform-managed organizational identity with server-side signing keys.
 * For did:key: Wallet-derived identity (legacy, requires ed25519 wallet).
 */
export interface VcIssuerIdentity {
  /** DID identifier (did:web:company.com or did:key:z...) */
  did: string;
  /** Signing key for VC-JWT issuance */
  signingKey: VcIssuerSigningKey;
  /** DID method */
  method: DidMethod;
  /** Optional metadata */
  metadata?: VcIssuerIdentityMetadata;
}

/**
 * Create a signer function from VcIssuerIdentity
 * 
 * For did:web: Uses server-managed private key via crypto.sign with KeyObject
 * For did:key: Requires external signer (e.g., wallet)
 * 
 * CRITICAL: This uses crypto.sign with a KeyObject reconstructed from JWK.
 * The privateKey is the 32-byte Ed25519 seed (JWK 'd' parameter).
 * 
 * @param identity - VC issuer identity
 * @param externalSigner - Optional external signer (required for did:key)
 * @returns Signer function for VC-JWT (compatible with did-jwt-vc)
 */
export function createIssuerSigner(
  identity: VcIssuerIdentity,
  externalSigner?: (data: Uint8Array) => Promise<Uint8Array>
): (data: string | Uint8Array) => Promise<string> {
  if (identity.method === 'did:web') {
    // Server-managed key: use crypto.sign with KeyObject from JWK
    const privateKeySeed = identity.signingKey.privateKey;
    if (!privateKeySeed) {
      throw new Error('Private key required for did:web signing');
    }

    // Validate key lengths
    if (privateKeySeed.length !== 32) {
      throw new Error(
        `Invalid Ed25519 private key length: ${privateKeySeed.length}. ` +
        `Expected 32 bytes (seed).`
      );
    }
    
    console.log('[createIssuerSigner] Creating signer with crypto.sign + KeyObject from JWK');
    console.log(`[createIssuerSigner] Public key (hex): ${Buffer.from(identity.signingKey.publicKey).toString('hex')}`);
    console.log(`[createIssuerSigner] Private key seed (hex): ${Buffer.from(privateKeySeed).toString('hex').substring(0, 40)}...`);
    
    return async (data: string | Uint8Array): Promise<string> => {
      const dataBytes = typeof data === 'string' 
        ? new TextEncoder().encode(data)
        : data;
      
      // Sign using Ed25519 with crypto.sign + KeyObject
      const signature = await signEd25519(
        dataBytes,
        identity.signingKey.publicKey,
        privateKeySeed
      );
      
      return base64UrlEncode(signature);
    };
  } else {
    // did:key: requires external signer (wallet)
    if (!externalSigner) {
      throw new Error('External signer required for did:key method');
    }
    
    return async (data: string | Uint8Array): Promise<string> => {
      const dataBytes = typeof data === 'string' 
        ? new TextEncoder().encode(data)
        : data;
      const signature = await externalSigner(dataBytes);
      return base64UrlEncode(signature);
    };
  }
}

/**
 * Sign data using Ed25519 with crypto.sign + KeyObject from JWK
 * 
 * This reconstructs a KeyObject from JWK and uses crypto.sign for Ed25519 signing.
 * This is compatible with did-jwt-vc expectations.
 * 
 * @param data - Data to sign
 * @param publicKey - Ed25519 public key (32 bytes)
 * @param privateKeySeed - Ed25519 seed (32 bytes, JWK 'd' parameter)
 * @returns Ed25519 signature (64 bytes)
 */
async function signEd25519(
  data: Uint8Array,
  publicKey: Uint8Array,
  privateKeySeed: Uint8Array
): Promise<Uint8Array> {
  // Construct JWK from raw keys
  const jwk = {
    kty: 'OKP',
    crv: 'Ed25519',
    x: toBase64Url(publicKey),   // public key
    d: toBase64Url(privateKeySeed), // private key seed
  };

  // Create KeyObject from JWK
  const keyObject = crypto.createPrivateKey({ 
    key: jwk as any, 
    format: 'jwk' 
  });

  // Sign with Ed25519 (algorithm: null for Ed25519)
  const signature = crypto.sign(null, Buffer.from(data), keyObject);
  
  return new Uint8Array(signature);
}

/**
 * Convert bytes to base64url
 */
function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

/**
 * Base64URL encode (for signature encoding)
 */
function base64UrlEncode(buffer: Uint8Array): string {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}
