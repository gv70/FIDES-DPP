/**
 * Unit tests for DTE allowlist enforcement
 *
 * @license Apache-2.0
 */

import { describe, it, expect } from '@jest/globals';
import { enforceDteAllowlist } from '../allowlist';

describe('enforceDteAllowlist', () => {
  it('allows supplier when allowlisted by manufacturer', async () => {
    await expect(
      enforceDteAllowlist({
        supplierDid: 'did:web:supplier.example',
        productIds: ['GTIN:123'],
        resolveManufacturerDidByProductId: async () => 'did:web:manufacturer.example',
        getTrustedSupplierDidsForManufacturerDid: async () => ['did:web:supplier.example'],
      })
    ).resolves.toBeUndefined();
  });

  it('rejects supplier when not allowlisted', async () => {
    await expect(
      enforceDteAllowlist({
        supplierDid: 'did:web:supplier.example',
        productIds: ['GTIN:123'],
        resolveManufacturerDidByProductId: async () => 'did:web:manufacturer.example',
        getTrustedSupplierDidsForManufacturerDid: async () => ['did:web:other.example'],
      })
    ).rejects.toThrow(/not allowlisted/i);
  });

  it('rejects when manufacturer cannot be resolved', async () => {
    await expect(
      enforceDteAllowlist({
        supplierDid: 'did:web:supplier.example',
        productIds: ['GTIN:123'],
        resolveManufacturerDidByProductId: async () => null,
        getTrustedSupplierDidsForManufacturerDid: async () => [],
      })
    ).rejects.toThrow(/Cannot enforce allowlist/i);
  });
});

