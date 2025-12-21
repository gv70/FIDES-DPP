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
 * For did:web: Uses server-managed private key
 * For did:key: Requires external signer (e.g., wallet)
 *
 * @param identity - VC issuer identity
 * @param externalSigner - Optional external signer (required for did:key)
 * @returns Signer function for VC-JWT
 */
export declare function createIssuerSigner(identity: VcIssuerIdentity, externalSigner?: (data: Uint8Array) => Promise<Uint8Array>): (data: string) => Promise<string>;
//# sourceMappingURL=issuer-identity.d.ts.map