/**
 * DTE Index Storage
 *
 * Persists an index that links product identifiers to issued DTE credentials.
 * This enables UNTP-style discovery: given a product ID → find related DTEs.
 *
 * @license Apache-2.0
 */

export type DteProductRole =
  | 'output'
  | 'input'
  | 'epc'
  | 'parent'
  | 'child'
  | 'quantity'
  | 'unknown';

export interface DteIndexRecord {
  productId: string;
  dteCid: string;
  dteUri: string; // e.g. ipfs://<cid>
  gatewayUrl?: string;
  issuerDid: string;
  credentialId?: string;
  eventId: string;
  eventType?: string;
  eventTime?: string; // ISO 8601 (stored as timestamp in postgres)
  role: DteProductRole;
  createdAt?: string; // ISO 8601
}

export interface ListDteIndexOptions {
  limit?: number;
}

export interface DteIndexStorage {
  upsertMany(records: DteIndexRecord[]): Promise<void>;
  listByProductId(productId: string, options?: ListDteIndexOptions): Promise<DteIndexRecord[]>;
}

