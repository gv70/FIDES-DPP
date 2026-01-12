/**
 * Client-side transaction log (localStorage).
 *
 * Used to help pilot testers paste tx hashes / explorer links into surveys.
 *
 * @license Apache-2.0
 */

export type TxLogAction =
  | 'passport_create'
  | 'passport_update'
  | 'passport_revoke'
  | 'passport_transfer'
  | 'account_map'
  | 'contract_deploy'
  | 'other';

export type TxLogEntry = {
  id: string;
  createdAt: string; // ISO
  address: string; // SS58 (connected account)
  action: TxLogAction;
  tokenId?: string;
  txHash: string; // 0x...
  explorerUrl?: string;
  network?: string; // e.g. "assethub-westend"
  pilotId?: string;
  metadata?: Record<string, unknown>;
};

const STORAGE_KEY = 'fidesdpp:txlog:v1';

function nowIso(): string {
  return new Date().toISOString();
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function') {
    return String((crypto as any).randomUUID());
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeTxHash(txHash: string): string {
  const v = String(txHash || '').trim();
  if (!v) return '';
  if (v.startsWith('0x')) return v;
  // Some libs might return hex without 0x
  if (/^[0-9a-fA-F]{64,}$/.test(v)) return `0x${v}`;
  return v;
}

export function explorerUrlForTx(txHash: string, network?: string): string | undefined {
  const hash = normalizeTxHash(txHash);
  if (!hash) return undefined;

  // Default used in this project
  const net = (network || 'assethub-westend').toLowerCase();
  if (net === 'assethub-westend' || net === 'westend-asset-hub') {
    return `https://assethub-westend.subscan.io/extrinsic/${encodeURIComponent(hash)}`;
  }

  return undefined;
}

export function readTxLog(): TxLogEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as TxLogEntry[];
  } catch {
    return [];
  }
}

export function writeTxLog(items: TxLogEntry[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function clearTxLog(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export function appendTxLog(params: {
  address: string;
  action: TxLogAction;
  txHash: string;
  tokenId?: string;
  network?: string;
  pilotId?: string;
  metadata?: Record<string, unknown>;
}): TxLogEntry | null {
  if (typeof window === 'undefined') return null;
  const address = String(params.address || '').trim();
  const txHash = normalizeTxHash(params.txHash);
  if (!address || !txHash) return null;

  const existing = readTxLog();
  const already = existing.find(
    (e) =>
      String(e.address).trim() === address &&
      String(e.txHash).trim() === txHash &&
      String(e.action) === params.action &&
      String(e.tokenId || '') === String(params.tokenId || '')
  );
  if (already) return already;

  const entry: TxLogEntry = {
    id: randomId(),
    createdAt: nowIso(),
    address,
    action: params.action,
    tokenId: params.tokenId,
    txHash,
    network: params.network || 'assethub-westend',
    pilotId: params.pilotId,
    explorerUrl: explorerUrlForTx(txHash, params.network),
    metadata: params.metadata,
  };
  writeTxLog([entry, ...existing].slice(0, 200));
  return entry;
}

