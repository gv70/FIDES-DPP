/**
 * UNTP DTE VC fetch endpoint
 *
 * Serves the raw VC-JWT for a given IPFS CID with a suitable content-type.
 * This is useful as an HTTP(S) href target in IDR linksets.
 *
 * GET /api/untp/dte/vc?cid=<cid>
 *
 * @license Apache-2.0
 */

import { NextRequest, NextResponse } from 'next/server';
import { createIpfsBackend } from '@/lib/ipfs/IpfsStorageFactory';

export async function GET(request: NextRequest) {
  try {
    const cid = (request.nextUrl.searchParams.get('cid') || '').trim();
    if (!cid) {
      return NextResponse.json({ error: 'cid is required' }, { status: 400 });
    }

    const backend = createIpfsBackend();
    const isAvailable = await backend.isAvailable();
    if (!isAvailable) {
      return NextResponse.json(
        { error: `IPFS backend (${backend.getBackendType()}) is not available. Check configuration.` },
        { status: 503 }
      );
    }

    const result = await backend.retrieveText(cid);
    return new NextResponse(result.data, {
      status: 200,
      headers: {
        'Content-Type': 'application/vc+jwt; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error: any) {
    console.error('DTE VC fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch VC', message: error.message || 'Unknown error' },
      { status: 500 }
    );
  }
}

