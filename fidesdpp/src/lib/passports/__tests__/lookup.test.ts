/**
 * Unit tests for passport lookup helpers
 *
 * @license Apache-2.0
 */

import { describe, it, expect } from '@jest/globals';
import { buildCanonicalSubjectId, sha256Hex32Utf8 } from '../lookup';

describe('passport lookup helpers', () => {
  it('buildCanonicalSubjectId builds expected IDs', () => {
    expect(buildCanonicalSubjectId({ productId: 'GTIN:123', granularity: 'ProductClass' })).toBe('GTIN:123');
    expect(buildCanonicalSubjectId({ productId: 'GTIN:123', granularity: 'Batch', batchNumber: 'LOT-1' })).toBe(
      'GTIN:123#LOT-1'
    );
    expect(buildCanonicalSubjectId({ productId: 'GTIN:123', granularity: 'Item', serialNumber: 'SN-1' })).toBe(
      'GTIN:123#SN-1'
    );
  });

  it('sha256Hex32Utf8 returns a 32-byte hex string with 0x prefix', () => {
    const hash = sha256Hex32Utf8('GTIN:07319200123457');
    expect(hash.startsWith('0x')).toBe(true);
    expect(hash).toHaveLength(66);
    // deterministic
    expect(sha256Hex32Utf8('GTIN:07319200123457')).toBe(hash);
  });
});

