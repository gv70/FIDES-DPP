/**
 * Storage Backend Factory
 * 
 * Creates appropriate StatusListStorage based on configuration.
 * 
 * @license Apache-2.0
 */

import type { StatusListStorage } from './StatusListStorage';
import { FileStatusListStorage } from './FileStatusListStorage';
import { PostgresStatusListStorage } from './PostgresStatusListStorage';

/**
 * Create status list storage backend
 * 
 * Selects backend based on STORAGE_BACKEND environment variable:
 * - 'file' (default): File-based JSON storage
 * - 'postgres': PostgreSQL storage
 * 
 * @returns StatusListStorage instance
 */
export function createStatusListStorage(): StatusListStorage {
  const backend = process.env.STORAGE_BACKEND || 'file';

  switch (backend) {
    case 'file':
      const dataPath = process.env.STATUS_LIST_DATA_PATH || './data/status-lists.json';
      return new FileStatusListStorage(dataPath);

    case 'postgres':
      return new PostgresStatusListStorage(process.env.DATABASE_URL);

    default:
      console.warn(
        `Unknown STORAGE_BACKEND: ${backend}. Falling back to file-based storage.`
      );
      return new FileStatusListStorage();
  }
}



