/**
 * PostgreSQL DTE index storage
 *
 * Production-ready persistence for indexing DTE credentials by product identifier.
 *
 * @license Apache-2.0
 */

import { Pool } from 'pg';
import type { DteIndexRecord, DteIndexStorage, ListDteIndexOptions } from './DteIndexStorage';

export class PostgresDteIndexStorage implements DteIndexStorage {
  private pool: Pool;
  private schemaInitPromise: Promise<void> | null = null;

  constructor(connectionString?: string) {
    const dbUrl = connectionString || process.env.DATABASE_URL;
    if (!dbUrl) {
      throw new Error(
        'DATABASE_URL not set. Required for PostgreSQL storage backend. ' +
          'Use STORAGE_BACKEND=file for file-based storage instead.'
      );
    }

    this.pool = new Pool({
      connectionString: dbUrl,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }

  private async ensureSchema(): Promise<void> {
    if (this.schemaInitPromise) return this.schemaInitPromise;

    this.schemaInitPromise = (async () => {
      // Safe, idempotent schema init for deployments without manual SQL application.
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS dte_event_index (
          product_id TEXT NOT NULL,
          dte_cid TEXT NOT NULL,
          dte_uri TEXT NOT NULL,
          gateway_url TEXT,
          issuer_did TEXT NOT NULL,
          credential_id TEXT,
          event_id TEXT NOT NULL,
          event_type TEXT,
          event_time TIMESTAMP,
          role TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          CONSTRAINT dte_event_index_pk PRIMARY KEY (product_id, dte_cid, event_id, role)
        );
      `);

      await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_dte_event_index_product_id ON dte_event_index(product_id);`);
      await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_dte_event_index_dte_cid ON dte_event_index(dte_cid);`);
      await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_dte_event_index_event_time ON dte_event_index(event_time DESC);`);
    })();

    return this.schemaInitPromise;
  }

  async upsertMany(records: DteIndexRecord[]): Promise<void> {
    if (!records || records.length === 0) return;
    await this.ensureSchema();

    const paramsPerRow = 10; // created_at is NOW()
    const query = `
      INSERT INTO dte_event_index
        (product_id, dte_cid, dte_uri, gateway_url, issuer_did, credential_id, event_id, event_type, event_time, role, created_at)
      VALUES
        ${records
          .map(
            (_, i) =>
              `($${i * paramsPerRow + 1}, $${i * paramsPerRow + 2}, $${i * paramsPerRow + 3}, $${i * paramsPerRow + 4}, $${i * paramsPerRow + 5}, $${i * paramsPerRow + 6}, $${i * paramsPerRow + 7}, $${i * paramsPerRow + 8}, $${i * paramsPerRow + 9}, $${i * paramsPerRow + 10}, NOW())`
          )
          .join(',\n')}
      ON CONFLICT (product_id, dte_cid, event_id, role)
      DO UPDATE SET
        dte_uri = EXCLUDED.dte_uri,
        gateway_url = EXCLUDED.gateway_url,
        issuer_did = EXCLUDED.issuer_did,
        credential_id = EXCLUDED.credential_id,
        event_type = EXCLUDED.event_type,
        event_time = EXCLUDED.event_time
    `;

    const values: any[] = [];
    for (const r of records) {
      values.push(
        r.productId,
        r.dteCid,
        r.dteUri,
        r.gatewayUrl || null,
        r.issuerDid,
        r.credentialId || null,
        r.eventId,
        r.eventType || null,
        r.eventTime ? new Date(r.eventTime) : null,
        r.role
      );
      // created_at is NOW()
    }

    await this.pool.query(query, values);
  }

  async listByProductId(productId: string, options?: ListDteIndexOptions): Promise<DteIndexRecord[]> {
    await this.ensureSchema();
    const limit = options?.limit && options.limit > 0 ? options.limit : 200;

    const query = `
      SELECT product_id, dte_cid, dte_uri, gateway_url, issuer_did, credential_id, event_id, event_type,
             event_time, role, created_at
      FROM dte_event_index
      WHERE product_id = $1
      ORDER BY event_time DESC NULLS LAST, created_at DESC
      LIMIT $2
    `;

    const result = await this.pool.query(query, [productId, limit]);

    return result.rows.map((row) => ({
      productId: row.product_id,
      dteCid: row.dte_cid,
      dteUri: row.dte_uri,
      gatewayUrl: row.gateway_url || undefined,
      issuerDid: row.issuer_did,
      credentialId: row.credential_id || undefined,
      eventId: row.event_id,
      eventType: row.event_type || undefined,
      eventTime: row.event_time ? new Date(row.event_time).toISOString() : undefined,
      role: row.role,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
    }));
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
