/**
 * Storage Backend Factory
 *
 * Creates appropriate StatusListStorage based on configuration.
 *
 * @license Apache-2.0
 */
import type { StatusListStorage } from './StatusListStorage';
/**
 * Create status list storage backend
 *
 * Selects backend based on STORAGE_BACKEND environment variable:
 * - 'file' (default): File-based JSON storage
 * - 'postgres': PostgreSQL storage
 *
 * @returns StatusListStorage instance
 */
export declare function createStatusListStorage(): StatusListStorage;
//# sourceMappingURL=createStorageBackend.d.ts.map