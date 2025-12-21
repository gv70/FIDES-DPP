/**
 * PostgreSQL Status List Storage
 *
 * Production-ready implementation for persistent Status List state.
 * Suitable for high-concurrency and multi-instance deployments.
 *
 * @license Apache-2.0
 */
import type { StatusListStorage, StatusListMapping } from './StatusListStorage';
/**
 * PostgreSQL storage for Status List state
 *
 * Schema:
 * - status_list_mappings: tokenId → statusListIndex mapping
 * - status_list_versions: issuerDid → current Status List VC CID
 *
 * Suitable for:
 * - Production deployments
 * - High-concurrency scenarios
 * - Multi-instance applications (horizontal scaling)
 */
export declare class PostgresStatusListStorage implements StatusListStorage {
    private pool;
    constructor(connectionString?: string);
    saveMapping(issuerDid: string, tokenId: string, index: number, statusListCid: string): Promise<void>;
    getMapping(tokenId: string): Promise<StatusListMapping | null>;
    getCurrentStatusListCid(issuerDid: string): Promise<string | null>;
    updateStatusListCid(issuerDid: string, newCid: string): Promise<void>;
    getMappingsForIssuer(issuerDid: string): Promise<StatusListMapping[]>;
    /**
     * Close database connection pool
     *
     * Call on application shutdown.
     */
    close(): Promise<void>;
}
//# sourceMappingURL=PostgresStatusListStorage.d.ts.map