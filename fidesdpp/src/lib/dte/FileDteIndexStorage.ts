/**
 * File-based DTE index storage
 *
 * Suitable for development and single-instance deployments.
 * Not suitable for Vercel/multi-instance production (use Postgres).
 *
 * @license Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { DteIndexRecord, DteIndexStorage, ListDteIndexOptions } from './DteIndexStorage';

interface StorageData {
  records: DteIndexRecord[];
}

export class FileDteIndexStorage implements DteIndexStorage {
  private dataPath: string;
  private data: StorageData | null = null;

  constructor(dataPath: string = './data/dte-index.json') {
    this.dataPath = dataPath;
  }

  private async init(): Promise<void> {
    if (this.data !== null) return;

    try {
      const dir = path.dirname(this.dataPath);
      await fs.mkdir(dir, { recursive: true });

      const content = await fs.readFile(this.dataPath, 'utf-8');
      this.data = JSON.parse(content);

      if (!this.data || !Array.isArray((this.data as any).records)) {
        this.data = { records: [] };
        await this.persist();
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        this.data = { records: [] };
        await this.persist();
      } else {
        throw new Error(`Failed to load DTE index storage: ${error.message}`);
      }
    }
  }

  private async persist(): Promise<void> {
    if (!this.data) throw new Error('Storage not initialized');
    const tempPath = `${this.dataPath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(this.data, null, 2), 'utf-8');
    await fs.rename(tempPath, this.dataPath);
  }

  async upsertMany(records: DteIndexRecord[]): Promise<void> {
    await this.init();
    if (!this.data) throw new Error('Storage not initialized');

    const now = new Date().toISOString();
    const keyOf = (r: DteIndexRecord) => `${r.productId}::${r.dteCid}::${r.eventId}::${r.role}`;

    const existingByKey = new Map<string, DteIndexRecord>();
    for (const r of this.data.records) {
      existingByKey.set(keyOf(r), r);
    }

    for (const incoming of records) {
      const normalized: DteIndexRecord = {
        ...incoming,
        createdAt: incoming.createdAt || now,
      };
      const key = keyOf(normalized);
      const existing = existingByKey.get(key);
      if (existing) {
        existingByKey.set(key, { ...existing, ...normalized, createdAt: existing.createdAt || normalized.createdAt });
      } else {
        existingByKey.set(key, normalized);
      }
    }

    this.data.records = Array.from(existingByKey.values());
    await this.persist();
  }

  async listByProductId(productId: string, options?: ListDteIndexOptions): Promise<DteIndexRecord[]> {
    await this.init();
    if (!this.data) throw new Error('Storage not initialized');

    const limit = options?.limit && options.limit > 0 ? options.limit : 200;

    return this.data.records
      .filter((r) => r.productId === productId)
      .sort((a, b) => {
        const at = a.eventTime ? Date.parse(a.eventTime) : 0;
        const bt = b.eventTime ? Date.parse(b.eventTime) : 0;
        return bt - at;
      })
      .slice(0, limit);
  }
}

