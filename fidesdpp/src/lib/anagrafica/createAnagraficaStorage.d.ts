/**
 * Anagrafica Storage Backend Factory
 *
 * Creates appropriate AnagraficaStorage based on configuration.
 *
 * @license Apache-2.0
 */
import type { AnagraficaStorage } from './AnagraficaStorage';
/**
 * Create anagrafica storage backend
 *
 * Selects backend based on STORAGE_BACKEND environment variable:
 * - 'file' (default): File-based JSON storage
 * - 'postgres': PostgreSQL storage
 *
 * @returns AnagraficaStorage instance
 */
export declare function createAnagraficaStorage(): AnagraficaStorage;
//# sourceMappingURL=createAnagraficaStorage.d.ts.map