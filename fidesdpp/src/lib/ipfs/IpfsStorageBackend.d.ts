/**
 * Abstract interface for IPFS storage backends
 * Ensures no hard dependency on closed-source services
 *
 * This interface allows swapping between:
 * - Kubo (self-hosted IPFS node) - FOSS primary option
 * - Helia (embedded JS IPFS) - FOSS lightweight option
 * - Pinata (via IPFS PSA) - Optional SaaS convenience
 * - Generic PSA providers (Filebase, NFT.Storage, etc.)
 *
 * @license Apache-2.0
 */
export interface UploadMetadata {
    /** Human-readable name for the content */
    name?: string;
    /** Key-value pairs for indexing and search */
    keyvalues?: Record<string, string>;
}
export interface UploadResult {
    /** IPFS CID (Content Identifier) */
    cid: string;
    /** SHA-256 hash of the content (hex with 0x prefix) */
    hash: string;
    /** Gateway URL for browser access */
    gatewayUrl: string;
    /** Size in bytes */
    size: number;
}
export interface RetrieveResult {
    /** The retrieved JSON data */
    data: object;
    /** Computed SHA-256 hash for integrity verification */
    hash: string;
    /** The CID used for retrieval */
    cid: string;
}
export interface RetrieveTextResult {
    /** The retrieved text data (e.g., JWT string) */
    data: string;
    /** Computed SHA-256 hash for integrity verification */
    hash: string;
    /** The CID used for retrieval */
    cid: string;
}
export interface IpfsConfig {
    /** Backend type: 'kubo', 'helia', 'pinata', 'psa' */
    backend?: string;
    /** Node URL (for Kubo/PSA) */
    nodeUrl?: string;
    /** Gateway URL for content retrieval */
    gatewayUrl?: string;
    /** Access token/JWT for authenticated services */
    accessToken?: string;
    /** PSA endpoint (for generic PSA backend) */
    psaEndpoint?: string;
}
/**
 * IPFS Storage Backend Interface
 *
 * All implementations must:
 * - Support FOSS-only operation (no mandatory closed-source dependencies)
 * - Use standard protocols (IPFS, HTTP, IPFS Pinning Services API)
 * - Provide hash verification for integrity
 */
export interface IpfsStorageBackend {
    /**
     * Upload JSON data to IPFS and pin it
     *
     * @param data - JSON object to upload (typically UNTP DPP JSON-LD)
     * @param metadata - Optional metadata (name, keyvalues for indexing)
     * @returns CID, hash (SHA-256), gateway URL, and size
     * @throws Error if upload fails or backend is unavailable
     */
    uploadJson(data: object, metadata?: UploadMetadata): Promise<UploadResult>;
    /**
     * Retrieve JSON data from IPFS by CID
     *
     * @param cid - IPFS CID to retrieve
     * @returns JSON data and computed hash for verification
     * @throws Error if retrieval fails or content not found
     */
    retrieveJson(cid: string): Promise<RetrieveResult>;
    /**
     * Upload raw text data to IPFS (for VC-JWT storage)
     *
     * Used for Milestone 2+ where we store raw JWT strings on IPFS.
     *
     * @param text - Raw text string to upload (e.g., JWT string)
     * @param metadata - Optional metadata (name, keyvalues for indexing)
     * @returns CID, hash (SHA-256 of text bytes), gateway URL, and size
     * @throws Error if upload fails or backend is unavailable
     */
    uploadText(text: string, metadata?: UploadMetadata): Promise<UploadResult>;
    /**
     * Retrieve raw text data from IPFS by CID
     *
     * Used for Milestone 2+ where we retrieve raw JWT strings from IPFS.
     *
     * @param cid - IPFS CID to retrieve
     * @returns Text data and computed hash for verification
     * @throws Error if retrieval fails or content not found
     */
    retrieveText(cid: string): Promise<RetrieveTextResult>;
    /**
     * Get gateway URL for a CID (for browser viewing)
     *
     * @param cid - IPFS CID
     * @returns Full HTTP(S) URL to access content via gateway
     */
    getGatewayUrl(cid: string): string;
    /**
     * Check if backend is available/configured
     *
     * @returns true if backend can be used, false otherwise
     */
    isAvailable(): Promise<boolean>;
    /**
     * Get backend type identifier
     *
     * @returns Backend type string ('kubo', 'helia', 'pinata', 'psa')
     */
    getBackendType(): string;
}
/**
 * Compute SHA-256 hash of JSON data (deterministic)
 * Uses sorted keys for consistency across implementations
 *
 * @param data - JSON object
 * @returns Hex string with 0x prefix
 */
export declare function computeJsonHash(data: object): string;
/**
 * Helper to compute hash synchronously (Node.js only)
 */
export declare function computeJsonHashSync(data: object): string;
/**
 * Compute SHA-256 hash of a JWT string
 *
 * This is used for VC-JWT storage format (Milestone 2+).
 * Hashes the UTF-8 bytes of the JWT string directly.
 *
 * Rationale:
 * - VC-JWT is stored as a raw JWT string on IPFS (not a JSON wrapper)
 * - dataset_type = "application/vc+jwt" refers to this JWT string
 * - payload_hash = SHA-256 of the JWT string bytes
 *
 * @param jwt - JWT string to hash
 * @returns Hex-encoded hash with 0x prefix
 */
export declare function computeJwtHash(jwt: string): string;
//# sourceMappingURL=IpfsStorageBackend.d.ts.map
