/**
 * DTE allowlist enforcement (UNTP supply-chain contributions)
 *
 * Implements a practical governance rule: a supplier can publish DTEs for a productId
 * only if the product's issuer (manufacturer/rEO) has explicitly allowlisted the
 * supplier DID.
 *
 * @license Apache-2.0
 */

export type ResolveManufacturerDidByProductId = (productId: string) => Promise<string | null>;
export type GetTrustedSupplierDidsForManufacturerDid = (manufacturerDid: string) => Promise<string[]>;

export function normalizeDid(value: unknown): string {
  return String(value || '').trim();
}

export function normalizeDidList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values.map((v) => normalizeDid(String(v))).filter(Boolean);
}

export function isSupplierAllowed(input: {
  supplierDid: string;
  manufacturerDid: string;
  trustedSupplierDids: string[];
}): boolean {
  const supplier = normalizeDid(input.supplierDid);
  const manufacturer = normalizeDid(input.manufacturerDid);
  if (!supplier || !manufacturer) return false;
  if (supplier === manufacturer) return true;
  const allow = (input.trustedSupplierDids || []).map(normalizeDid).filter(Boolean);
  return allow.includes(supplier);
}

export async function enforceDteAllowlist(input: {
  supplierDid: string;
  productIds: string[];
  resolveManufacturerDidByProductId: ResolveManufacturerDidByProductId;
  getTrustedSupplierDidsForManufacturerDid: GetTrustedSupplierDidsForManufacturerDid;
}): Promise<void> {
  const supplierDid = normalizeDid(input.supplierDid);
  if (!supplierDid) {
    throw new Error('Missing DTE issuer (supplier DID)');
  }

  const uniqueProductIds = Array.from(
    new Set((input.productIds || []).map((p) => String(p || '').trim()).filter(Boolean))
  );
  if (uniqueProductIds.length === 0) {
    throw new Error('No product references found in DTE events');
  }

  for (const productId of uniqueProductIds) {
    const manufacturerDid = normalizeDid(await input.resolveManufacturerDidByProductId(productId));
    if (!manufacturerDid) {
      throw new Error(
        `Cannot enforce allowlist: no passport issuer found for productId ${productId}. Issue the DPP first or publish using a known product identifier.`
      );
    }

    const trustedSupplierDids = await input.getTrustedSupplierDidsForManufacturerDid(manufacturerDid);
    const allowed = isSupplierAllowed({ supplierDid, manufacturerDid, trustedSupplierDids });
    if (!allowed) {
      throw new Error(
        `Supplier ${supplierDid} is not allowlisted by manufacturer ${manufacturerDid} for productId ${productId}`
      );
    }
  }
}
