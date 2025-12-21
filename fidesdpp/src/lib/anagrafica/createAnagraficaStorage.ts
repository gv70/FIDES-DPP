/**
 * Anagrafica Storage Backend Factory
 * 
 * Creates appropriate AnagraficaStorage based on configuration.
 * 
 * @license Apache-2.0
 */

import type { AnagraficaStorage } from './AnagraficaStorage';
import { FileAnagraficaStorage } from './FileAnagraficaStorage';
import { PostgresAnagraficaStorage } from './PostgresAnagraficaStorage';

/**
 * Create anagrafica storage backend
 * 
 * Selects backend based on STORAGE_BACKEND environment variable:
 * - 'file' (default): File-based JSON storage
 * - 'postgres': PostgreSQL storage
 * 
 * @returns AnagraficaStorage instance
 */
export function createAnagraficaStorage(): AnagraficaStorage {
  const backend = process.env.STORAGE_BACKEND || 'file';

  switch (backend) {
    case 'file':
      const dataPath = process.env.ANAGRAFICA_DATA_PATH || './data/anagrafica.json';
      return new FileAnagraficaStorage(dataPath);

    case 'postgres':
      return new PostgresAnagraficaStorage(process.env.DATABASE_URL);

    default:
      console.warn(
        `Unknown STORAGE_BACKEND: ${backend}. Falling back to file-based storage.`
      );
      return new FileAnagraficaStorage();
  }
}



