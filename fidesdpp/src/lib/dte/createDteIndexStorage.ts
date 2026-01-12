/**
 * DTE Index Storage Backend Factory
 *
 * Selects backend based on STORAGE_BACKEND:
 * - 'file' (default): JSON file
 * - 'postgres': PostgreSQL
 *
 * @license Apache-2.0
 */

import type { DteIndexStorage } from './DteIndexStorage';
import { FileDteIndexStorage } from './FileDteIndexStorage';
import { PostgresDteIndexStorage } from './PostgresDteIndexStorage';

export function createDteIndexStorage(): DteIndexStorage {
  const backend = process.env.STORAGE_BACKEND || 'file';

  switch (backend) {
    case 'file': {
      const dataPath = process.env.DTE_INDEX_DATA_PATH || './data/dte-index.json';
      return new FileDteIndexStorage(dataPath);
    }
    case 'postgres':
      return new PostgresDteIndexStorage(process.env.DATABASE_URL);
    default:
      console.warn(`Unknown STORAGE_BACKEND: ${backend}. Falling back to file-based DTE index storage.`);
      return new FileDteIndexStorage();
  }
}

