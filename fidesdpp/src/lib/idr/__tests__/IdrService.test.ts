/**
 * Unit tests for IDR linkset generation
 *
 * @license Apache-2.0
 */

import { describe, it, expect, jest } from '@jest/globals';
import { IdrService } from '../IdrService';

describe('IdrService.generateLinkset', () => {
  it('returns a resolvable linkset even without tokenId', async () => {
    const idr = new IdrService('http://example.com');

    const linkset = await idr.generateLinkset('PROD-001');

    expect(linkset.anchor).toBeDefined();
    expect(linkset.self).toBeDefined();
    expect((linkset.self as any).href).toBe('http://example.com/idr/products/PROD-001?linkType=linkset');
    expect(linkset['untp:dpp']).toBeUndefined();
    expect(linkset.alternate).toBeUndefined();
  });

  it('adds untp:dte links when the DTE index is available', async () => {
    const dteIndexStorage = {
      listByProductId: jest.fn(async (productId: string) => {
        if (productId !== 'GTIN:12345678') return [];
        return [
          { dteCid: 'bafyCID1', eventType: 'TransformationEvent', eventTime: '2024-01-01T10:00:00Z' },
          { dteCid: 'bafyCID1', eventType: 'ShippingEvent', eventTime: '2024-02-01T10:00:00Z' }, // later → wins
          { dteCid: 'bafyCID2', eventType: 'ReceivingEvent', eventTime: '2024-03-01T10:00:00Z' },
        ];
      }),
    };

    const idr = new IdrService('http://example.com', undefined, dteIndexStorage);
    const linkset = await idr.generateLinkset('GTIN:12345678');

    expect(dteIndexStorage.listByProductId).toHaveBeenCalled();
    expect(linkset['untp:dte']).toBeDefined();

    const dteLinks = linkset['untp:dte'] as any[];
    expect(Array.isArray(dteLinks)).toBe(true);
    expect(dteLinks).toHaveLength(2); // unique CIDs
    expect(dteLinks.every((l) => typeof l?.href === 'string' && l.href.includes('/api/untp/dte/vc?cid='))).toBe(true);
  });

  it('encodes productId in self href', async () => {
    const idr = new IdrService('http://example.com');
    const productId = 'urn:product:SKU-ABC/123';

    const linkset = await idr.generateLinkset(productId);

    expect((linkset.self as any).href).toBe(
      `http://example.com/idr/products/${encodeURIComponent(productId)}?linkType=linkset`
    );
  });
});

