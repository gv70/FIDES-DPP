/**
 * DID Resolver for Verifiable Credentials
 * 
 * Supports both did:key (legacy) and did:web (UNTP-compliant) methods.
 * 
 * Note: The Polkadot account is kept separate as chain metadata.
 * It's NOT encoded as a DID. Instead, it's stored in:
 * - On-chain passport record (issuer account)
 * - chainAnchor extension in credentialSubject
 * 
 * @license Apache-2.0
 */

import { Resolver } from 'did-resolver';
import type { DIDResolver, DIDResolutionResult, ParsedDID } from 'did-resolver';

/**
 * Create a DID resolver supporting both did:key and did:web
 * 
 * - did:key: Self-contained DID method (legacy support)
 * - did:web: Organizational identity via HTTPS (UNTP-compliant)
 * 
 * @returns Configured DID resolver
 */
export function createDidResolver(): Resolver {
  return new Resolver({
    key: keyDidResolver,
    web: webDidResolver,
  });
}

/**
 * Base58 decoding (Bitcoin alphabet)
 */
function base58Decode(encoded: string): Uint8Array {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  
  if (encoded.length === 0) return new Uint8Array(0);
  
  // Convert from base58 to big integer
  let num = BigInt(0);
  for (const char of encoded) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error(`Invalid base58 character: ${char}`);
    }
    num = num * BigInt(58) + BigInt(index);
  }
  
  // Convert big integer to bytes
  const bytes: number[] = [];
  while (num > 0) {
    bytes.unshift(Number(num % BigInt(256)));
    num = num / BigInt(256);
  }
  
  // Handle leading zeros
  for (let i = 0; i < encoded.length && encoded[i] === ALPHABET[0]; i++) {
    bytes.unshift(0);
  }
  
  return new Uint8Array(bytes);
}

/**
 * Extract public key from did:key DID
 * 
 * @param did - did:key DID string (e.g., did:key:z6Mk...)
 * @returns Public key bytes (32 bytes for Ed25519)
 */
function extractPublicKeyFromDid(did: string): Uint8Array {
  // Extract base58btc-encoded part (after did:key:z)
  const encoded = did.replace('did:key:z', '');
  
  // Decode base58btc
  const decoded = base58Decode(encoded);
  
  // Check multicodec prefix (0xed01 for Ed25519)
  if (decoded.length < 2 || decoded[0] !== 0xed || decoded[1] !== 0x01) {
    throw new Error(`Invalid multicodec prefix in did:key. Expected 0xed01 (Ed25519), got ${decoded[0].toString(16)}${decoded[1].toString(16)}`);
  }
  
  // Extract public key (skip 2-byte prefix)
  const publicKey = decoded.slice(2);
  
  // Validate length (32 bytes for Ed25519)
  if (publicKey.length !== 32) {
    throw new Error(`Invalid public key length: expected 32 bytes, got ${publicKey.length}`);
  }
  
  return publicKey;
}

/**
 * Convert public key bytes to multibase format (z-prefixed base58btc)
 * 
 * This function adds the Ed25519 multicodec prefix (0xed01) before encoding,
 * which is required for did:key and did:web compatibility.
 * 
 * @param publicKey - Public key bytes (32 bytes for Ed25519)
 * @returns Multibase-encoded public key (z...)
 */
function publicKeyToMultibase(publicKey: Uint8Array): string {
  // Add Ed25519 multicodec prefix (0xed01) before encoding
  // This matches the format expected by did:key and did:web specifications
  const prefix = new Uint8Array([0xed, 0x01]);
  const combined = new Uint8Array(prefix.length + publicKey.length);
  combined.set(prefix);
  combined.set(publicKey, prefix.length);
  
  // Multibase prefix 'z' indicates base58btc encoding
  const encoded = base58Encode(combined);
  return `z${encoded}`;
}

/**
 * Extract public key from multibase-encoded string (z-prefixed base58btc)
 * 
 * This function decodes a multibase-encoded public key (e.g., from did.json)
 * and extracts the raw Ed25519 public key bytes.
 * 
 * @param multibase - Multibase-encoded public key (z...)
 * @returns Public key bytes (32 bytes for Ed25519)
 */
function extractPublicKeyFromMultibase(multibase: string): Uint8Array {
  if (!multibase.startsWith('z')) {
    throw new Error(`Invalid multibase format: expected 'z' prefix, got '${multibase[0]}'`);
  }

  // Remove 'z' prefix and decode base58btc
  const encoded = multibase.slice(1);
  const decoded = base58Decode(encoded);

  // Check multicodec prefix (0xed01 for Ed25519)
  if (decoded.length < 2 || decoded[0] !== 0xed || decoded[1] !== 0x01) {
    throw new Error(
      `Invalid multicodec prefix in multibase. Expected 0xed01 (Ed25519), got ${decoded[0].toString(16)}${decoded[1].toString(16)}`
    );
  }

  // Extract public key (skip 2-byte prefix)
  const publicKey = decoded.slice(2);

  // Validate length (32 bytes for Ed25519)
  if (publicKey.length !== 32) {
    throw new Error(`Invalid public key length: expected 32 bytes, got ${publicKey.length}`);
  }

  return publicKey;
}

/**
 * Simple did:key resolver
 * 
 * For Ed25519 keys, extracts the public key from the DID
 * and creates a DID document with verification methods.
 */
const keyDidResolver: DIDResolver = async (
  did: string,
  parsed: ParsedDID
): Promise<DIDResolutionResult> => {
  try {
    // did:key format: did:key:z<base58btc-encoded-key>
    if (!did.startsWith('did:key:z')) {
      // Provide helpful error message for common mistakes
      if (did.startsWith('did:key:') && !did.startsWith('did:key:z')) {
        throw new Error(
          `Invalid did:key format: ${did}. ` +
          `Expected format: did:key:z<base58btc-encoded-public-key>. ` +
          `This DID appears to be incorrectly formatted (possibly using an SS58 address directly). ` +
          `The correct way to create a did:key is using createKeyDid(ed25519PublicKey) from the public key bytes, ` +
          `not from an address string.`
        );
      }
      throw new Error(`Invalid did:key format: ${did}. Expected format: did:key:z<base58btc-encoded-key>`);
    }

    // Extract public key from DID
    const publicKey = extractPublicKeyFromDid(did);
    
    // Convert to multibase format for verificationMethod
    const publicKeyMultibase = publicKeyToMultibase(publicKey);

    // Create DID document with public key in verificationMethod
    // This is required for did-jwt-vc to verify signatures
    return {
      didDocument: {
        '@context': [
          'https://www.w3.org/ns/did/v1',
          'https://w3id.org/security/suites/ed25519-2020/v1',
        ],
        id: did,
        verificationMethod: [
          {
            id: `${did}#key-1`,
            type: 'Ed25519VerificationKey2020',
            controller: did,
            publicKeyMultibase: publicKeyMultibase,
            // Add publicKeyJwk for did-jwt-vc compatibility
            publicKeyJwk: {
              kty: 'OKP',
              crv: 'Ed25519',
              x: Buffer.from(publicKey).toString('base64url'),
            },
          },
        ],
        authentication: [`${did}#key-1`],
        assertionMethod: [`${did}#key-1`],
      },
      didResolutionMetadata: {},
      didDocumentMetadata: {},
    };
  } catch (error: any) {
    return {
      didDocument: null,
      didResolutionMetadata: {
        error: 'invalidDid',
        message: error.message,
      },
      didDocumentMetadata: {},
    };
  }
};

/**
 * Create a did:key DID from a public key
 * 
 * This function creates a did:key identifier from a public key.
 * The public key is encoded in the DID itself (self-contained).
 * 
 * CRITICAL: This is the ONLY way to create issuer DIDs for VC-JWT.
 * The DID is derived directly from the ed25519 public key bytes.
 * 
 * For Ed25519 keys (JWS-standard EdDSA):
 * - Format: did:key:z6Mk... (multibase + multicodec encoding)
 * - Multicodec prefix: 0xed01 (Ed25519 public key)
 * - Public key: 32 bytes
 * 
 * IMPORTANT: sr25519 is NOT supported. It's not JWS-standard and incompatible
 * with did-jwt-vc library. Only ed25519 keys work with EdDSA algorithm.
 * 
 * @param publicKey - Ed25519 public key bytes (MUST be exactly 32 bytes)
 * @returns did:key DID string
 * @throws Error if public key length is invalid
 */
export function createKeyDid(publicKey: Uint8Array): string {
  // Validate input
  if (!publicKey || !(publicKey instanceof Uint8Array)) {
    throw new Error('Public key must be a Uint8Array');
  }
  
  // Validate length (32 bytes for ed25519)
  if (publicKey.length !== 32) {
    throw new Error(
      `Invalid public key length for ed25519: expected 32 bytes, got ${publicKey.length}. ` +
      `Ensure you're using ed25519 keys, not sr25519 (which is NOT JWS-standard).`
    );
  }
  
  // Ed25519 multicodec prefix: 0xed01
  // This marks the key type in the did:key specification
  const prefix = new Uint8Array([0xed, 0x01]);
  const combined = new Uint8Array(prefix.length + publicKey.length);
  combined.set(prefix);
  combined.set(publicKey, prefix.length);
  
  // Base58btc encoding with 'z' prefix (multibase indicator for base58btc)
  const encoded = base58Encode(combined);
  return `did:key:z${encoded}`;
}

/**
 * Base58 encoding (Bitcoin alphabet)
 */
function base58Encode(bytes: Uint8Array): string {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  
  if (bytes.length === 0) return '';
  
  // Convert to big integer
  let num = BigInt(0);
  for (const byte of bytes) {
    num = num * BigInt(256) + BigInt(byte);
  }
  
  // Convert to base58
  let result = '';
  while (num > 0) {
    const remainder = num % BigInt(58);
    result = ALPHABET[Number(remainder)] + result;
    num = num / BigInt(58);
  }
  
  // Add leading zeros
  for (const byte of bytes) {
    if (byte === 0) {
      result = ALPHABET[0] + result;
    } else {
      break;
    }
  }
  
  return result;
}

/**
 * did:web resolver
 * 
 * Resolves did:web DIDs by fetching DID documents from HTTPS endpoints.
 * 
 * Format: did:web:{domain} or did:web:{domain}:{path}
 * Resolution: https://{domain}/.well-known/did.json or https://{domain}/{path}/did.json
 * 
 * This follows the W3C did:web specification:
 * https://w3c-ccg.github.io/did-method-web/
 * 
 * @param did - did:web DID string
 * @param parsed - Parsed DID components
 * @returns DID resolution result
 */
const webDidResolver: DIDResolver = async (
  did: string,
  parsed: ParsedDID
): Promise<DIDResolutionResult> => {
  try {
    // did:web format: did:web:{domain} or did:web:{domain}:{path}
    if (!did.startsWith('did:web:')) {
      throw new Error(`Invalid did:web format: ${did}. Expected format: did:web:{domain} or did:web:{domain}:{path}`);
    }

    // Extract domain and optional path from DID
    // did:web:example.com -> domain: example.com, path: undefined
    // did:web:example.com:path -> domain: example.com, path: path
    const didSuffix = did.replace('did:web:', '');
    const parts = didSuffix.split(':');
    const domainRaw = parts[0];
    const domain = decodeURIComponent(domainRaw);
    const pathParts = parts.length > 1 ? parts.slice(1) : [];

    const isTestMode = process.env.FIDES_MODE === 'test' || process.env.TEST_MODE === '1';
    const protocol = isTestMode && (domain === 'localhost' || domain.startsWith('localhost:') || domain === '127.0.0.1' || domain.startsWith('127.0.0.1:'))
      ? 'http'
      : 'https';

    // Construct DID document URL
    // If path exists: https://{domain}/{path}/did.json
    // Otherwise: https://{domain}/.well-known/did.json
    const didDocumentUrl = pathParts.length > 0
      ? `${protocol}://${domain}/${pathParts.map(p => encodeURIComponent(decodeURIComponent(p))).join('/')}/did.json`
      : `${protocol}://${domain}/.well-known/did.json`;

    // Fetch DID document from HTTPS endpoint
    // Note: In production, this should be cached and validated
    let response: Response;
    try {
      response = await fetch(didDocumentUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json, application/did+json',
        },
        // Add timeout to prevent hanging
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });
    } catch (fetchError: any) {
      // Handle network errors, timeouts, etc.
      const errorMessage = fetchError.message || 'Unknown error';
      if (errorMessage.includes('timeout') || errorMessage.includes('aborted')) {
        throw new Error(
          `Timeout while fetching DID document from ${didDocumentUrl}. ` +
          `The server may be slow or unreachable. Please try again.`
        );
      }
      throw new Error(
        `Failed to fetch DID document from ${didDocumentUrl}: ${errorMessage}`
      );
    }

    if (!response.ok) {
      throw new Error(
        `Failed to fetch DID document from ${didDocumentUrl}: HTTP ${response.status} ${response.statusText}`
      );
    }

    const didDocument = await response.json();

    // Validate DID document
    if (!didDocument || didDocument.id !== did) {
      throw new Error(
        `Invalid DID document: document ID (${didDocument?.id}) does not match requested DID (${did})`
      );
    }

    // Normalize DID document for did-jwt-vc compatibility
    // Ensure verificationMethod has publicKeyMultibase in the correct format
    // and add publicKeyJwk for better compatibility with did-jwt-vc
    console.log(`[DID Resolver] Normalizing DID document for did:web: ${did}`);
    console.log(`[DID Resolver] Original verificationMethod count: ${didDocument.verificationMethod?.length || 0}`);
    
    if (didDocument.verificationMethod && Array.isArray(didDocument.verificationMethod)) {
      for (let i = 0; i < didDocument.verificationMethod.length; i++) {
        const vm = didDocument.verificationMethod[i];
        console.log(`[DID Resolver] Processing verificationMethod[${i}]:`, {
          id: vm.id,
          type: vm.type,
          controller: vm.controller,
          hasPublicKeyMultibase: !!vm.publicKeyMultibase,
          publicKeyMultibase: vm.publicKeyMultibase?.substring(0, 30) + '...',
          hasPublicKeyJwk: !!vm.publicKeyJwk,
        });
        
        if (vm.type === 'Ed25519VerificationKey2020' && vm.publicKeyMultibase) {
          // Verify that publicKeyMultibase is valid and can be decoded
          try {
            console.log(`[DID Resolver] Extracting public key from multibase: ${vm.publicKeyMultibase.substring(0, 30)}...`);
            const publicKey = extractPublicKeyFromMultibase(vm.publicKeyMultibase);
            console.log(`[DID Resolver] Public key extracted: ${Buffer.from(publicKey).toString('hex')} (${publicKey.length} bytes)`);
            
            // Re-encode to ensure consistency (this normalizes the format)
            // Note: publicKeyToMultibase includes multicodec prefix, but we need raw key for JWK
            const normalizedMultibase = publicKeyToMultibase(publicKey);
            console.log(`[DID Resolver] Normalized multibase: ${normalizedMultibase.substring(0, 30)}...`);
            vm.publicKeyMultibase = normalizedMultibase;
            
            // CRITICAL: Add publicKeyJwk for did-jwt-vc compatibility
            // did-jwt-vc may not be able to extract public key from publicKeyMultibase directly
            // JWK format is more widely supported
            const jwk = {
              kty: 'OKP', // Octet Key Pair
              crv: 'Ed25519',
              x: Buffer.from(publicKey).toString('base64url'), // Raw 32-byte public key in base64url
            };
            
            // Always update publicKeyJwk to ensure it matches the extracted key
            vm.publicKeyJwk = jwk;
            console.log(`[DID Resolver] Set publicKeyJwk:`, {
              kty: jwk.kty,
              crv: jwk.crv,
              x: jwk.x.substring(0, 20) + '...',
              xFull: jwk.x, // Log full value for debugging
            });
            
            // CRITICAL FIX: did-jwt-vc may not support Ed25519VerificationKey2020 directly
            // Add an alternative verificationMethod with JsonWebKey2020 type for better compatibility
            // This is a workaround - we keep the original but add a compatible one
            const jwkVmId = `${did}#key-1-jwk`;
            if (!didDocument.verificationMethod.some((v: any) => v.id === jwkVmId)) {
              const jwkVm = {
                id: jwkVmId,
                type: 'JsonWebKey2020',
                controller: did,
                publicKeyJwk: jwk,
              };
              didDocument.verificationMethod.push(jwkVm);
              // Also add to assertionMethod and authentication for compatibility
              if (!didDocument.assertionMethod) {
                didDocument.assertionMethod = [];
              }
              if (!didDocument.assertionMethod.includes(jwkVmId)) {
                didDocument.assertionMethod.push(jwkVmId);
              }
              if (!didDocument.authentication) {
                didDocument.authentication = [];
              }
              if (!didDocument.authentication.includes(jwkVmId)) {
                didDocument.authentication.push(jwkVmId);
              }
              console.log(`[DID Resolver] Added JsonWebKey2020 verificationMethod for did-jwt-vc compatibility: ${jwkVmId}`);
            }
          } catch (error: any) {
            console.error(`[DID Resolver] Failed to normalize publicKeyMultibase for ${vm.id}:`, {
              error: error.message,
              stack: error.stack,
              publicKeyMultibase: vm.publicKeyMultibase?.substring(0, 30) + '...',
            });
            // Continue with original value if normalization fails
          }
        } else {
          console.log(`[DID Resolver] Skipping verificationMethod[${i}] - type: ${vm.type}, hasMultibase: ${!!vm.publicKeyMultibase}`);
        }
      }
    } else {
      console.warn(`[DID Resolver] No verificationMethod array found in DID document`);
    }
    
    console.log(`[DID Resolver] DID document normalization complete`);

    return {
      didDocument,
      didResolutionMetadata: {},
      didDocumentMetadata: {},
    };
  } catch (error: any) {
    return {
      didDocument: null,
      didResolutionMetadata: {
        error: 'notFound',
        message: error.message || `Failed to resolve did:web: ${did}`,
      },
      didDocumentMetadata: {},
    };
  }
};
