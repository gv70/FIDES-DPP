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

import { BitstreamStatusList } from '@4sure-tech/vc-bitstring-status-lists';
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
 * - Stores state (credentialId → index mapping) via StatusListStorage
 * - Generates Status List VCs and uploads to IPFS
 * - Verifiers fetch Status List VCs from IPFS (no issuer dependency)
 * 
 * Flow:
 * 1. Issue VC → assignIndex() → add credentialStatus to VC
 * 2. Revoke VC → revokeIndex() → flip bit, generate new Status List VC, upload to IPFS
 * 3. Verify VC → checkStatus() → fetch Status List VC from IPFS, check bit
 */
export class StatusListManager {
  private storage: StatusListStorage;
  private ipfsBackend: IpfsStorageBackend;
  
  // In-memory cache of Status Lists (bitstrings)
  // Key: issuerDid, Value: BitstreamStatusList instance
  private statusLists: Map<string, BitstreamStatusList> = new Map();
  
  // Default status list size (131,072 credentials per list)
  private readonly DEFAULT_SIZE = 131072;

  constructor(storage: StatusListStorage, ipfsBackend: IpfsStorageBackend) {
    this.storage = storage;
    this.ipfsBackend = ipfsBackend;
  }

  /**
   * Assign a status list index to a new credential
   * 
   * Called during VC issuance. Returns StatusListEntry for credentialStatus field.
   * 
   * @param issuerDid - Issuer DID
   * @param credentialId - VC identifier (e.g., JWT jti or VC id)
   * @returns StatusListEntry to add to VC
   */
  async assignIndex(issuerDid: string, credentialId: string): Promise<StatusListEntry> {
    // 1. Get or create Status List for this issuer
    let statusList = this.statusLists.get(issuerDid);
    let statusListCid = await this.storage.getCurrentStatusListCid(issuerDid);

    if (!statusList) {
      // Create new Status List
      statusList = new BitstreamStatusList({ initialSize: this.DEFAULT_SIZE, statusSize: 1 });
      this.statusLists.set(issuerDid, statusList);
      
      // Generate and upload initial Status List VC
      const statusListVc = await this.generateStatusListVc(issuerDid, statusList);
      const uploadResult = await this.ipfsBackend.uploadText(
        JSON.stringify(statusListVc),
        { name: `status-list-${issuerDid.replace(/:/g, '-')}-v1.json` }
      );
      
      statusListCid = uploadResult.cid;
      await this.storage.updateStatusListCid(issuerDid, statusListCid);
    }

    // 2. Find next available index
    const existingMappings = await this.storage.getMappingsForIssuer(issuerDid);
    const usedIndices = new Set(existingMappings.map(m => m.statusListIndex));
    
    let nextIndex = 0;
    while (usedIndices.has(nextIndex) && nextIndex < this.DEFAULT_SIZE) {
      nextIndex++;
    }

    if (nextIndex >= this.DEFAULT_SIZE) {
      throw new Error(
        `Status List full for issuer ${issuerDid}. ` +
        `Maximum ${this.DEFAULT_SIZE} credentials per list. ` +
        `Consider creating a new issuer or implementing list rotation.`
      );
    }

    // 3. Save mapping
    await this.storage.saveMapping(issuerDid, credentialId, nextIndex, statusListCid!);

    // 4. Return Status List Entry for credentialStatus field
    const baseUrl = process.env.STATUS_LIST_BASE_URL || process.env.RENDER_BASE_URL || 'http://localhost:3000';
    const statusListUrl = `${baseUrl.replace(/\/$/, '')}/api/status-list?issuer=${encodeURIComponent(issuerDid)}`;
    
    return {
      id: `${statusListUrl}#${nextIndex}`,
      type: 'StatusList2021Entry',
      statusPurpose: 'revocation',
      statusListIndex: nextIndex.toString(),
      statusListCredential: statusListUrl,
    };
  }

  /**
   * Revoke a credential by flipping its bit in the status list
   * 
   * Called during revocation. Updates Status List VC on IPFS.
   * 
   * @param issuerDid - Issuer DID
   * @param credentialId - VC identifier to revoke
   * @returns New Status List VC CID
   */
  async revokeIndex(issuerDid: string, credentialId: string): Promise<string> {
    // 1. Get mapping
    const mapping = await this.storage.getMapping(credentialId);
    if (!mapping) {
      throw new Error(`No status list mapping found for credentialId: ${credentialId}`);
    }

    if (mapping.issuerDid !== issuerDid) {
      throw new Error(
        `Issuer mismatch: credentialId ${credentialId} belongs to ${mapping.issuerDid}, not ${issuerDid}`
      );
    }

    // 2. Get or load Status List
    let statusList = this.statusLists.get(issuerDid);
    
    if (!statusList) {
      // Load from IPFS
      const currentCid = await this.storage.getCurrentStatusListCid(issuerDid);
      if (!currentCid) {
        throw new Error(`No status list found for issuer: ${issuerDid}`);
      }
      
      const statusListVc = await this.loadStatusListVc(currentCid);
      statusList = await BitstreamStatusList.decode({
        encodedList: statusListVc.credentialSubject.encodedList,
        statusSize: 1,
      });
      
      this.statusLists.set(issuerDid, statusList);
    }

    // 3. Flip bit (set to 1 = revoked)
    statusList.setStatus(mapping.statusListIndex, 1);

    // 4. Generate new Status List VC
    const statusListVc = await this.generateStatusListVc(issuerDid, statusList);

    // 5. Upload to IPFS
    const uploadResult = await this.ipfsBackend.uploadText(
      JSON.stringify(statusListVc),
      { name: `status-list-${issuerDid.replace(/:/g, '-')}-updated.json` }
    );

    const newCid = uploadResult.cid;

    // 6. Update stored CID
    await this.storage.updateStatusListCid(issuerDid, newCid);

    // 7. Update mapping with new CID
    await this.storage.saveMapping(issuerDid, credentialId, mapping.statusListIndex, newCid);

    return newCid;
  }

  /**
   * Check if a credential is revoked
   * 
   * Called during VC verification. Fetches Status List VC from IPFS.
   * 
   * @param credentialId - VC identifier to check
   * @returns true if revoked, false if valid
   */
  async checkStatus(credentialId: string): Promise<boolean> {
    // 1. Get mapping
    const mapping = await this.storage.getMapping(credentialId);
    if (!mapping) {
      // No status list entry = not revoked (credential issued before Status List implementation)
      return false;
    }

    // 2. Fetch current Status List VC from IPFS
    const statusListVc = await this.loadStatusListVc(mapping.statusListCid);

    // 3. Decode bitstring
    const statusList = await BitstreamStatusList.decode({
      encodedList: statusListVc.credentialSubject.encodedList,
      statusSize: 1,
    });

    // 4. Check bit at index
    const status = statusList.getStatus(mapping.statusListIndex);
    
    // 0 = valid, 1 = revoked
    return status === 1;
  }

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
  private async generateStatusListVc(
    issuerDid: string,
    statusList: BitstreamStatusList
  ): Promise<StatusListCredential> {
    const encodedList = await statusList.encode();
    const statusListId = `urn:uuid:${this.generateUuid()}`;

    return {
      '@context': [
        'https://www.w3.org/ns/credentials/v2',
        'https://www.w3.org/2018/credentials/v1',
        'https://w3id.org/vc/status-list/2021/v1',
      ],
      type: ['VerifiableCredential', 'StatusList2021Credential'],
      id: statusListId,
      issuer: issuerDid,
      issuanceDate: new Date().toISOString(),
      credentialSubject: {
        id: `${statusListId}#list`,
        type: 'StatusList2021',
        statusPurpose: 'revocation',
        encodedList,
      },
    };
  }

  /**
   * Load Status List VC from IPFS
   */
  private async loadStatusListVc(cid: string): Promise<StatusListCredential> {
    const result = await this.ipfsBackend.retrieveText(cid);
    return JSON.parse(result.data);
  }

  /**
   * Generate UUID v4 (for Status List ID)
   */
  private generateUuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}

