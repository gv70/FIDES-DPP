/**
 * UNTP DTE Discovery API Endpoint (resolver-first)
 *
 * Returns DTE credentials related to a given product identifier.
 *
 * GET /api/untp/dte/by-product?productId=...
 *
 * @license Apache-2.0
 */

import { NextRequest, NextResponse } from 'next/server';
import { createDteIndexStorage } from '@/lib/dte/createDteIndexStorage';
import { deriveLookupAliases } from '@/lib/dte/dte-indexing';

export async function GET(request: NextRequest) {
  try {
    const productIdRaw = request.nextUrl.searchParams.get('productId') || '';
    const productId = productIdRaw.trim();
    const limitRaw = request.nextUrl.searchParams.get('limit') || '';
    const limit = limitRaw ? Math.max(1, Math.min(500, Number(limitRaw))) : 200;

    if (!productId) {
      return NextResponse.json({ error: 'productId is required' }, { status: 400 });
    }

    const storage = createDteIndexStorage();
    const candidates = deriveLookupAliases(productId);

    const all = (
      await Promise.all(
        candidates.map((id) => storage.listByProductId(id, { limit }))
      )
    ).flat();

    // Deduplicate by (productId,cid,eventId,role)
    const uniq = new Map<string, any>();
    for (const r of all) {
      uniq.set(`${r.productId}::${r.dteCid}::${r.eventId}::${r.role}`, r);
    }
    const records = Array.from(uniq.values());

    // Group by DTE CID
    const byCid = new Map<string, any>();
    for (const r of records) {
      const existing = byCid.get(r.dteCid) || {
        cid: r.dteCid,
        uri: r.dteUri,
        gatewayUrl: r.gatewayUrl || null,
        issuerDid: r.issuerDid,
        credentialId: r.credentialId || null,
        events: [] as any[],
      };
      existing.events.push({
        productId: r.productId,
        role: r.role,
        eventId: r.eventId,
        eventType: r.eventType || null,
        eventTime: r.eventTime || null,
      });
      byCid.set(r.dteCid, existing);
    }

    const dtes = Array.from(byCid.values()).sort((a, b) => {
      const at = a.events.find((e: any) => e.eventTime)?.eventTime;
      const bt = b.events.find((e: any) => e.eventTime)?.eventTime;
      return (bt ? Date.parse(bt) : 0) - (at ? Date.parse(at) : 0);
    });

    return NextResponse.json(
      {
        productId,
        candidates,
        count: dtes.length,
        dtes,
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=30',
        },
      }
    );
  } catch (error: any) {
    console.error('DTE by-product error:', error);
    return NextResponse.json(
      { error: 'Failed to lookup DTEs', message: error.message || 'Unknown error' },
      { status: 500 }
    );
  }
}

