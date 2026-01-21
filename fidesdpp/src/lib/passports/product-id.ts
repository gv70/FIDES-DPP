/**
 * Best-effort product identifier resolution from an on-chain passport record.
 *
 * Used to display Product ID next to Passport ID without requiring anagrafica.
 *
 * @license Apache-2.0
 */

import { createIpfsBackend } from '../ipfs/IpfsStorageFactory';
import { decodeVcJwt } from '../vc/decodeVcJwt';

type CacheEntry = { value?: string; expiresAt: number };

const CACHE_TTL_MS = 15 * 60 * 1000;
const PRODUCT_ID_CACHE = new Map<string, CacheEntry>();

function getCached(key: string): string | undefined {
  const entry = PRODUCT_ID_CACHE.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    PRODUCT_ID_CACHE.delete(key);
    return undefined;
  }
  return entry.value;
}

function setCached(key: string, value: string | undefined): void {
  PRODUCT_ID_CACHE.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

function parseCidFromDatasetUri(datasetUri: string): string | null {
  const v = String(datasetUri || '').trim();
  if (!v) return null;

  if (v.startsWith('ipfs://')) {
    const cid = v.slice('ipfs://'.length).split(/[/?#]/)[0];
    return cid || null;
  }

  const idx = v.indexOf('/ipfs/');
  if (idx >= 0) {
    const after = v.slice(idx + '/ipfs/'.length);
    const cid = after.split(/[/?#]/)[0];
    return cid || null;
  }

  // Fallback: treat as raw CID if it looks like one
  if (/^(bafy|Qm)[a-zA-Z0-9]+$/.test(v)) return v;
  return null;
}

function extractProductIdFromVcJwtPayload(payload: any): string | undefined {
  const vc = payload?.vc || payload;
  const credentialSubject = vc?.credentialSubject;

  const subject =
    Array.isArray(credentialSubject) && credentialSubject.length > 0 ? credentialSubject[0] : credentialSubject;

  const product = subject?.product || subject?.credentialSubject?.product;
  const productId = String(product?.identifier || product?.id || '').trim();
  return productId || undefined;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

export async function resolveProductIdFromDatasetUri(params: {
  datasetUri: string;
  datasetType?: string;
  timeoutMs?: number;
}): Promise<string | undefined> {
  const cid = parseCidFromDatasetUri(params.datasetUri);
  if (!cid) return undefined;

  const cached = getCached(cid);
  if (cached !== undefined) return cached;

  const backend = createIpfsBackend();
  const isAvailable = await backend.isAvailable().catch(() => false);
  if (!isAvailable) {
    setCached(cid, undefined);
    return undefined;
  }

  const timeoutMs = typeof params.timeoutMs === 'number' ? params.timeoutMs : 2500;
  const datasetType = String(params.datasetType || '').toLowerCase();

  try {
    if (datasetType.includes('vc+jwt') || datasetType.includes('jwt')) {
      const result = await withTimeout(backend.retrieveText(cid), timeoutMs, 'IPFS retrieveText');
      const payload = decodeVcJwt(result.data);
      const productId = extractProductIdFromVcJwtPayload(payload);
      setCached(cid, productId);
      return productId;
    }

    const json = await withTimeout(backend.retrieveJson(cid), timeoutMs, 'IPFS retrieveJson');
    const productId =
      String((json.data as any)?.credentialSubject?.product?.identifier || (json.data as any)?.product?.identifier || '')
        .trim() || undefined;
    setCached(cid, productId);
    return productId;
  } catch {
    setCached(cid, undefined);
    return undefined;
  }
}
