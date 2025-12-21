/**
 * File-based Status List Storage
 *
 * Default implementation for dev/simple deployments.
 * Stores status list state in JSON file on Docker volume.
 *
 * @license Apache-2.0
 */
import type { StatusListStorage, StatusListMapping } from './StatusListStorage';
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
export declare class FileStatusListStorage implements StatusListStorage {
    private dataPath;
    private data;
    constructor(dataPath?: string);
    /**
     * Initialize storage (load from file or create new)
     */
    private init;
    /**
     * Persist data to file (atomic write)
     */
    private persist;
    saveMapping(issuerDid: string, tokenId: string, index: number, statusListCid: string): Promise<void>;
    getMapping(tokenId: string): Promise<StatusListMapping | null>;
    getCurrentStatusListCid(issuerDid: string): Promise<string | null>;
    updateStatusListCid(issuerDid: string, newCid: string): Promise<void>;
    getMappingsForIssuer(issuerDid: string): Promise<StatusListMapping[]>;
}
//# sourceMappingURL=FileStatusListStorage.d.ts.map