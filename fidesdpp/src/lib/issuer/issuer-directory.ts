/**
 * Issuer directory utilities
 *
 * Builds a lookup that maps on-chain issuer addresses (H160) to business identity
 * metadata coming from the local did:web issuer registry.
 *
 * @license Apache-2.0
 */

import type { StoredIssuerIdentity } from '../vc/did-web-manager';
import { decodeAddress, keccakAsU8a } from '@polkadot/util-crypto';

export type IssuerDirectoryEntry = {
  did: string;
  domain?: string;
  organizationName?: string;
  status?: string;
  issuerH160s: string[];
  authorizedAccounts?: string[];
};

export function normalizeH160(value: string): string {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return '';
  if (!v.startsWith('0x')) return v;
  return `0x${v.slice(2).padStart(40, '0')}`;
}

export function accountToH160(address: string): string | null {
  const input = String(address || '').trim();
  if (!input) return null;

  try {
    const bytes = decodeAddress(input);
    if (bytes.length === 20) {
      return normalizeH160(`0x${Buffer.from(bytes).toString('hex')}`);
    }
    if (bytes.length === 32) {
      const hash = keccakAsU8a(bytes, 256);
      const h160 = hash.slice(12); // last 20 bytes
      return normalizeH160(`0x${Buffer.from(h160).toString('hex')}`);
    }
    return null;
  } catch {
    return null;
  }
}

export function buildIssuerDirectory(entries: StoredIssuerIdentity[]): IssuerDirectoryEntry[] {
  return entries.map((issuer) => {
    const authorizedAccounts = (issuer.authorizedPolkadotAccounts || [])
      .map((a) => String(a?.address || '').trim())
      .filter(Boolean);

    const issuerH160s = Array.from(
      new Set(
        (issuer.authorizedPolkadotAccounts || [])
          .map((a) => accountToH160(a.address))
          .filter(Boolean) as string[]
      )
    );

    return {
      did: issuer.did,
      domain: issuer.metadata?.domain,
      organizationName: issuer.metadata?.organizationName,
      status: issuer.status,
      issuerH160s,
      authorizedAccounts,
    };
  });
}
