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
/**
 * Create a DID resolver supporting both did:key and did:web
 *
 * - did:key: Self-contained DID method (legacy support)
 * - did:web: Organizational identity via HTTPS (UNTP-compliant)
 *
 * @returns Configured DID resolver
 */
export declare function createDidResolver(): Resolver;
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
export declare function createKeyDid(publicKey: Uint8Array): string;
//# sourceMappingURL=did-resolver.d.ts.map