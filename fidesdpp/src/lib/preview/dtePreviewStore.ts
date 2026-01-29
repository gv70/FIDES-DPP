/**
 * In-memory store for customer-view DTE previews.
 *
 * This is intentionally ephemeral: it enables showing a /render/<tokenId> page with
 * not-yet-published DTE events (preview mode) from the Traceability UI.
 *
 * @license Apache-2.0
 */

import crypto from 'crypto';
import 'server-only';

export type DtePreviewRecord = {
  id: string;
  tokenId: string;
  createdAt: number;
  expiresAt: number;
  issuerDid?: string;
  issuerName?: string;
  events: any[];
};

type Store = Map<string, DtePreviewRecord>;

const STORE_KEY = '__FIDESDPP_DTE_PREVIEW_STORE__';

function getStore(): Store {
  const g = globalThis as any;
  if (!g[STORE_KEY]) g[STORE_KEY] = new Map();
  return g[STORE_KEY] as Store;
}

function cleanup(store: Store): void {
  const now = Date.now();
  for (const [id, rec] of store.entries()) {
    if (!rec || typeof rec !== 'object') {
      store.delete(id);
      continue;
    }
    if (typeof rec.expiresAt !== 'number' || rec.expiresAt <= now) {
      store.delete(id);
    }
  }
}

export function createDtePreview(input: {
  tokenId: string;
  events: any[];
  issuerDid?: string;
  issuerName?: string;
  ttlSeconds?: number;
}): DtePreviewRecord {
  const tokenId = String(input.tokenId || '').trim();
  if (!tokenId) throw new Error('tokenId is required');

  const events = Array.isArray(input.events) ? input.events.filter((e) => e && typeof e === 'object') : [];
  if (events.length === 0) throw new Error('events must be a non-empty array');
  if (events.length > 50) throw new Error('events limit exceeded (max 50)');

  const store = getStore();
  cleanup(store);

  const ttlSecondsRaw = Number(input.ttlSeconds ?? 600);
  const ttlSeconds = Number.isFinite(ttlSecondsRaw) ? Math.min(Math.max(ttlSecondsRaw, 30), 3600) : 600;
  const now = Date.now();

  const id = crypto.randomUUID();
  const rec: DtePreviewRecord = {
    id,
    tokenId,
    createdAt: now,
    expiresAt: now + ttlSeconds * 1000,
    issuerDid: input.issuerDid ? String(input.issuerDid).trim() : undefined,
    issuerName: input.issuerName ? String(input.issuerName).trim() : undefined,
    events,
  };

  // Basic payload-size guardrail (best-effort).
  const approxBytes = Buffer.byteLength(JSON.stringify(rec.events), 'utf-8');
  if (approxBytes > 400_000) {
    throw new Error('events payload too large for preview (max ~400KB)');
  }

  store.set(id, rec);
  return rec;
}

export function getDtePreview(id: string): DtePreviewRecord | null {
  const key = String(id || '').trim();
  if (!key) return null;
  const store = getStore();
  cleanup(store);
  const rec = store.get(key) || null;
  if (!rec) return null;
  if (rec.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }
  return rec;
}

