/**
 * Trusted supplier allowlist helpers.
 *
 * Stores allowlist in issuer did:web metadata under `trustedSupplierDids`.
 *
 * @license Apache-2.0
 */

import type { StoredIssuerIdentity } from '../vc/did-web-manager';
import { buildIssuerDirectory, normalizeH160 } from './issuer-directory';

export function getTrustedSupplierDidsFromIssuer(identity: StoredIssuerIdentity | null): string[] {
  const raw = identity?.metadata?.trustedSupplierDids;
  if (!Array.isArray(raw)) return [];
  return raw.map((v: any) => String(v || '').trim()).filter(Boolean);
}

export function resolveManufacturerDidByH160(input: {
  manufacturerIssuerH160: string;
  issuers: StoredIssuerIdentity[];
}): string | null {
  const target = normalizeH160(input.manufacturerIssuerH160);
  if (!target) return null;

  const directory = buildIssuerDirectory(input.issuers || []);
  const hit = directory.find((e) => (e.issuerH160s || []).map(normalizeH160).includes(target));
  return hit?.did ? String(hit.did) : null;
}
