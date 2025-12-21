/**
 * Status List Manager
 *
 * Native implementation of W3C Bitstring Status List 2021.
 * Uses @4sure-tech/vc-bitstring-status-lists library (Apache 2.0, FOSS).
 *
 * UNTP Requirement: MUST implement W3C VC Bitstring Status List
 * Reference: reference/specification/VerifiableCredentials.md line 40
 *
 * @license Apache-2.0
 */
import type { StatusListStorage } from '../storage/StatusListStorage';
import type { IpfsStorageBackend } from '../ipfs/IpfsStorageBackend';
/**
 * Status List Entry for credentialStatus field
 */
export interface StatusListEntry {
    id: string;
    type: 'StatusList2021Entry';
    statusPurpose: 'revocation';
    statusListIndex: string;
    statusListCredential: string;
}
/**
 * Status List Credential (VC format)
 */
export interface StatusListCredential {
    '@context': string[];
    type: string[];
    id: string;
    issuer: string;
    issuanceDate: string;
    credentialSubject: {
        id: string;
        type: 'StatusList2021';
        statusPurpose: 'revocation';
        encodedList: string;
    };
}
/**
 * Status List Manager
 *
 * Manages W3C Bitstring Status Lists for credential revocation.
 *
 * Architecture:
 * - Uses @4sure-tech/vc-bitstring-status-lists for bitstring operations
 * - Stores state (tokenId → index mapping) via StatusListStorage
 * - Generates Status List VCs and uploads to IPFS
 * - Verifiers fetch Status List VCs from IPFS (no issuer dependency)
 *
 * Flow:
 * 1. Issue VC → assignIndex() → add credentialStatus to VC
 * 2. Revoke VC → revokeIndex() → flip bit, generate new Status List VC, upload to IPFS
 * 3. Verify VC → checkStatus() → fetch Status List VC from IPFS, check bit
 */
export declare class StatusListManager {
    private storage;
    private ipfsBackend;
    private statusLists;
    private readonly DEFAULT_SIZE;
    constructor(storage: StatusListStorage, ipfsBackend: IpfsStorageBackend);
    /**
     * Assign a status list index to a new credential
     *
     * Called during VC issuance. Returns StatusListEntry for credentialStatus field.
     *
     * @param issuerDid - Issuer DID
     * @param tokenId - Token ID (passport ID)
     * @returns StatusListEntry to add to VC
     */
    assignIndex(issuerDid: string, tokenId: string): Promise<StatusListEntry>;
    /**
     * Revoke a credential by flipping its bit in the status list
     *
     * Called during revocation. Updates Status List VC on IPFS.
     *
     * @param issuerDid - Issuer DID
     * @param tokenId - Token ID to revoke
     * @returns New Status List VC CID
     */
    revokeIndex(issuerDid: string, tokenId: string): Promise<string>;
    /**
     * Check if a credential is revoked
     *
     * Called during VC verification. Fetches Status List VC from IPFS.
     *
     * @param tokenId - Token ID to check
     * @returns true if revoked, false if valid
     */
    checkStatus(tokenId: string): Promise<boolean>;
    /**
     * Generate Status List VC (unsigned, for IPFS storage)
     *
     * Note: Status List VCs are typically NOT signed in production
     * (they're published documents, not credentials).
     *
     * @param issuerDid - Issuer DID
     * @param statusList - BitstreamStatusList instance
     * @returns Status List Credential
     */
    private generateStatusListVc;
    /**
     * Load Status List VC from IPFS
     */
    private loadStatusListVc;
    /**
     * Generate UUID v4 (for Status List ID)
     */
    private generateUuid;
}
//# sourceMappingURL=StatusListManager.d.ts.map