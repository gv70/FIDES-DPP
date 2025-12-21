/**
 * File-based Status List Storage
 * 
 * Default implementation for dev/simple deployments.
 * Stores status list state in JSON file on Docker volume.
 * 
 * @license Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { StatusListStorage, StatusListMapping, StatusListVersion } from './StatusListStorage';

interface StorageData {
  mappings: Record<string, StatusListMapping>;
  versions: Record<string, StatusListVersion>;
}

/**
 * File-based storage for Status List state
 * 
 * Stores data in JSON file with atomic writes (temp + rename).
 * Suitable for:
 * - Development
 * - Single-instance deployments
 * - Low-concurrency production
 * 
 * NOT suitable for:
 * - High-concurrency production
 * - Multi-instance deployments (use PostgreSQL)
 */
export class FileStatusListStorage implements StatusListStorage {
  private dataPath: string;
  private data: StorageData | null = null;

  constructor(dataPath: string = './data/status-lists.json') {
    this.dataPath = dataPath;
  }

  /**
   * Initialize storage (load from file or create new)
   */
  private async init(): Promise<void> {
    if (this.data !== null) {
      return; // Already loaded
    }

    try {
      // Ensure data directory exists
      const dir = path.dirname(this.dataPath);
      await fs.mkdir(dir, { recursive: true });

      // Try to load existing file
      const content = await fs.readFile(this.dataPath, 'utf-8');
      this.data = JSON.parse(content);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File doesn't exist - initialize empty
        this.data = {
          mappings: {},
          versions: {},
        };
        await this.persist();
      } else {
        throw new Error(`Failed to load status list storage: ${error.message}`);
      }
    }
  }

  /**
   * Persist data to file (atomic write)
   */
  private async persist(): Promise<void> {
    if (!this.data) {
      throw new Error('Storage not initialized');
    }

    // Atomic write: write to temp file, then rename
    const tempPath = `${this.dataPath}.tmp`;
    const content = JSON.stringify(this.data, null, 2);
    
    await fs.writeFile(tempPath, content, 'utf-8');
    await fs.rename(tempPath, this.dataPath);
  }

  async saveMapping(
    issuerDid: string,
    credentialId: string,
    index: number,
    statusListCid: string
  ): Promise<void> {
    await this.init();

    const mapping: StatusListMapping = {
      credentialId,
      issuerDid,
      statusListIndex: index,
      statusListCid,
      createdAt: new Date(),
    };

    this.data!.mappings[credentialId] = mapping;
    await this.persist();
  }

  async getMapping(credentialId: string): Promise<StatusListMapping | null> {
    await this.init();
    
    const mapping = this.data!.mappings[credentialId];
    return mapping || null;
  }

  async getCurrentStatusListCid(issuerDid: string): Promise<string | null> {
    await this.init();
    
    const version = this.data!.versions[issuerDid];
    return version?.currentCid || null;
  }

  async updateStatusListCid(issuerDid: string, newCid: string): Promise<void> {
    await this.init();

    this.data!.versions[issuerDid] = {
      issuerDid,
      currentCid: newCid,
      updatedAt: new Date(),
    };

    await this.persist();
  }

  async getMappingsForIssuer(issuerDid: string): Promise<StatusListMapping[]> {
    await this.init();

    return Object.values(this.data!.mappings).filter(
      m => m.issuerDid === issuerDid
    );
  }
}


