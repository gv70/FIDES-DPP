/**
 * DID Web Manager
 *
 * Manages organizational did:web identities and Ed25519 signing keys.
 *
 * Responsibilities:
 * - Generate did:web DIDs for organizations
 * - Create and store Ed25519 signing key pairs
 * - Map organizations to their did:web identities
 * - Provide signing function for VC-JWT issuance
 *
 * Storage: In-memory for now (TODO: migrate to database/key-value store)
 *
 * @license Apache-2.0
 */
import type { VcIssuerIdentity, VcIssuerIdentityMetadata } from './issuer-identity';
/**
 * Issuer verification status
 */
export declare enum IssuerStatus {
    /** Not registered */
    UNKNOWN = "UNKNOWN",
    /** Keys generated, did.json ready, but domain not verified */
    PENDING = "PENDING",
    /** Domain verified: did.json fetched and public key matches */
    VERIFIED = "VERIFIED",
    /** Verification failed (with error details) */
    FAILED = "FAILED"
}
/**
 * DID Web Manager
 *
 * Manages organizational did:web identities for VC issuance.
 */
export declare class DidWebManager {
    /**
     * Register a new organizational did:web identity
     *
     * @param domain - Domain for did:web (e.g., "company.com")
     * @param metadata - Optional metadata (organization name, etc.)
     * @returns Registered VC issuer identity
     */
    registerIssuer(domain: string, metadata?: VcIssuerIdentityMetadata): Promise<VcIssuerIdentity>;
    /**
     * Get issuer identity by domain
     *
     * @param domain - Domain for did:web
     * @returns VC issuer identity or undefined if not found
     */
    getIssuer(domain: string): Promise<VcIssuerIdentity | undefined>;
    /**
     * Get issuer status by domain
     *
     * @param domain - Domain for did:web
     * @returns Issuer status or UNKNOWN if not found
     */
    getIssuerStatus(domain: string): Promise<IssuerStatus>;
    /**
     * Get issuer with status information
     *
     * @param domain - Domain for did:web
     * @returns Issuer identity with status, or undefined if not found
     */
    getIssuerWithStatus(domain: string): Promise<{
        identity: VcIssuerIdentity;
        status: IssuerStatus;
        lastError?: string;
        lastAttemptAt?: Date;
    } | undefined>;
    /**
     * Get issuer identity by DID
     *
     * @param did - did:web DID
     * @returns VC issuer identity or undefined if not found
     */
    getIssuerByDid(did: string): Promise<VcIssuerIdentity | undefined>;
    /**
     * List all registered issuers
     *
     * @returns Array of registered issuer identities
     */
    listIssuers(): Promise<VcIssuerIdentity[]>;
    /**
     * Generate DID document for a did:web identity
     *
     * @param identity - VC issuer identity
     * @returns DID document following W3C did:web specification
     */
    generateDidDocument(identity: VcIssuerIdentity): any;
    /**
     * Generate Ed25519 key pair
     *
     * @returns Ed25519 key pair (public and private keys)
     */
    private generateEd25519KeyPair;
    /**
     * Decode base64url string to Uint8Array
     */
    private base64UrlDecode;
    /**
     * Convert Ed25519 public key to multibase format (base58btc with 'z' prefix)
     *
     * @param publicKey - Ed25519 public key (32 bytes)
     * @returns Multibase-encoded public key (z...)
     */
    private publicKeyToMultibase;
    /**
     * Base58 encoding (Bitcoin alphabet)
     */
    private base58Encode;
    /**
     * Verify a did:web issuer by fetching and validating the hosted did.json
     *
     * @param did - DID identifier (e.g., "did:web:company.com")
     * @returns Verification result
     */
    verifyDidWeb(did: string): Promise<{
        success: boolean;
        status: IssuerStatus;
        error?: string;
    }>;
    /**
     * Update issuer status
     *
     * @param domain - Domain for did:web
     * @param status - New status
     * @param error - Optional error message (for FAILED status)
     */
    private updateIssuerStatus;
    /**
     * Validate domain format
     *
     * @param domain - Domain string to validate
     * @returns true if valid domain format
     */
    private isValidDomain;
}
/**
 * Get or create DidWebManager instance
 *
 * @returns DidWebManager instance
 */
export declare function getDidWebManager(): DidWebManager;
//# sourceMappingURL=did-web-manager.d.ts.map
