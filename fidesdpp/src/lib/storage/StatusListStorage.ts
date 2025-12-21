/**
 * Status List Storage Interface
 * 
 * Provides persistent storage for Status List state (issuer-side only).
 * Verifiers do NOT need this - they fetch Status List VCs from IPFS.
 * 
 * @license Apache-2.0
 */

export interface StatusListMapping {
  credentialId: string;
  issuerDid: string;
  statusListIndex: number;
  statusListCid: string;
  createdAt: Date;
}

export interface StatusListVersion {
  issuerDid: string;
  currentCid: string;
  updatedAt: Date;
}

/**
 * Storage backend for Status List state
 * 
 * Required state:
 * 1. credentialId → statusListIndex mapping (for each VC)
 * 2. issuerDid → current Status List VC CID (latest version)
 * 
 * This state is issuer-side only. Verifiers fetch Status List VCs
 * directly from IPFS using the credentialStatus.statusListCredential URL.
 */
export interface StatusListStorage {
  /**
   * Save mapping: credentialId → statusListIndex
   * 
   * @param issuerDid - Issuer DID
   * @param credentialId - VC identifier (e.g., JWT jti or VC id)
   * @param index - Index in status list bitstring
   * @param statusListCid - CID of current Status List VC
   */
  saveMapping(
    issuerDid: string,
    credentialId: string,
    index: number,
    statusListCid: string
  ): Promise<void>;

  /**
   * Get mapping for a specific credentialId
   * 
   * @param credentialId - VC identifier (e.g., JWT jti or VC id)
   * @returns Mapping or null if not found
   */
  getMapping(credentialId: string): Promise<StatusListMapping | null>;

  /**
   * Get current Status List VC CID for an issuer
   * 
   * @param issuerDid - Issuer DID
   * @returns Current CID or null if no status list exists
   */
  getCurrentStatusListCid(issuerDid: string): Promise<string | null>;

  /**
   * Update current Status List VC CID for an issuer
   * 
   * Called after generating a new Status List VC (e.g., after revocation).
   * 
   * @param issuerDid - Issuer DID
   * @param newCid - New Status List VC CID
   */
  updateStatusListCid(issuerDid: string, newCid: string): Promise<void>;

  /**
   * Get all mappings for an issuer (for debugging/admin)
   * 
   * @param issuerDid - Issuer DID
   * @returns Array of mappings
   */
  getMappingsForIssuer(issuerDid: string): Promise<StatusListMapping[]>;
}


