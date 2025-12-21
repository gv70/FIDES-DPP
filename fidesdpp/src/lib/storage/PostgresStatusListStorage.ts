/**
 * PostgreSQL Status List Storage
 * 
 * Production-ready implementation for persistent Status List state.
 * Suitable for high-concurrency and multi-instance deployments.
 * 
 * @license Apache-2.0
 */

import { Pool, PoolClient } from 'pg';
import type { StatusListStorage, StatusListMapping, StatusListVersion } from './StatusListStorage';

/**
 * PostgreSQL storage for Status List state
 * 
 * Schema:
 * - status_list_mappings: credentialId → statusListIndex mapping
 * - status_list_versions: issuerDid → current Status List VC CID
 * 
 * Suitable for:
 * - Production deployments
 * - High-concurrency scenarios
 * - Multi-instance applications (horizontal scaling)
 */
export class PostgresStatusListStorage implements StatusListStorage {
  private pool: Pool;

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

  async saveMapping(
    issuerDid: string,
    credentialId: string,
    index: number,
    statusListCid: string
  ): Promise<void> {
    const query = `
      INSERT INTO status_list_mappings (token_id, issuer_did, status_list_index, status_list_cid, created_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (token_id) 
      DO UPDATE SET 
        status_list_index = EXCLUDED.status_list_index,
        status_list_cid = EXCLUDED.status_list_cid
    `;

    await this.pool.query(query, [credentialId, issuerDid, index, statusListCid]);
  }

  async getMapping(credentialId: string): Promise<StatusListMapping | null> {
    const query = `
      SELECT token_id, issuer_did, status_list_index, status_list_cid, created_at
      FROM status_list_mappings
      WHERE token_id = $1
    `;

    const result = await this.pool.query(query, [credentialId]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      credentialId: row.token_id,
      issuerDid: row.issuer_did,
      statusListIndex: row.status_list_index,
      statusListCid: row.status_list_cid,
      createdAt: row.created_at,
    };
  }

  async getCurrentStatusListCid(issuerDid: string): Promise<string | null> {
    const query = `
      SELECT current_cid
      FROM status_list_versions
      WHERE issuer_did = $1
    `;

    const result = await this.pool.query(query, [issuerDid]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0].current_cid;
  }

  async updateStatusListCid(issuerDid: string, newCid: string): Promise<void> {
    const query = `
      INSERT INTO status_list_versions (issuer_did, current_cid, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (issuer_did)
      DO UPDATE SET 
        current_cid = EXCLUDED.current_cid,
        updated_at = EXCLUDED.updated_at
    `;

    await this.pool.query(query, [issuerDid, newCid]);
  }

  async getMappingsForIssuer(issuerDid: string): Promise<StatusListMapping[]> {
    const query = `
      SELECT token_id, issuer_did, status_list_index, status_list_cid, created_at
      FROM status_list_mappings
      WHERE issuer_did = $1
      ORDER BY created_at DESC
    `;

    const result = await this.pool.query(query, [issuerDid]);

    return result.rows.map(row => ({
      credentialId: row.token_id,
      issuerDid: row.issuer_did,
      statusListIndex: row.status_list_index,
      statusListCid: row.status_list_cid,
      createdAt: row.created_at,
    }));
  }

  /**
   * Close database connection pool
   * 
   * Call on application shutdown.
   */
  async close(): Promise<void> {
    await this.pool.end();
  }
}


