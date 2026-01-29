/**
 * Customer render preview (DTE)
 *
 * Creates a temporary server-side preview record so `/render/<tokenId>?previewDte=<id>`
 * can display the DTE events before they are published/indexed.
 *
 * POST /api/render/preview-dte
 * Body:
 *  - tokenId: string
 *  - events: object[]   (UNTP DTE credentialSubject array)
 *  - issuerDid?: string
 *  - issuerName?: string
 *  - ttlSeconds?: number (default 600)
 *
 * GET /api/render/preview-dte?id=<id>
 *
 * @license Apache-2.0
 */

import { NextRequest, NextResponse } from 'next/server';
import { createDtePreview, getDtePreview } from '@/lib/preview/dtePreviewStore';
import 'server-only';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const tokenId = String(body?.tokenId || '').trim();
    const events = body?.events;
    const issuerDid = body?.issuerDid ? String(body.issuerDid).trim() : undefined;
    const issuerName = body?.issuerName ? String(body.issuerName).trim() : undefined;
    const ttlSeconds = body?.ttlSeconds != null ? Number(body.ttlSeconds) : undefined;

    const rec = createDtePreview({
      tokenId,
      events: Array.isArray(events) ? events : [],
      issuerDid,
      issuerName,
      ttlSeconds,
    });

    return NextResponse.json({
      success: true,
      previewId: rec.id,
      tokenId: rec.tokenId,
      expiresAt: rec.expiresAt,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: 'Failed to create preview', message: error.message || 'Unknown error' },
      { status: 400 }
    );
  }
}

export async function GET(request: NextRequest) {
  const id = String(request.nextUrl.searchParams.get('id') || '').trim();
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const rec = getDtePreview(id);
  if (!rec) {
    return NextResponse.json({ error: 'Not found', message: 'Preview expired or does not exist' }, { status: 404 });
  }

  return NextResponse.json({
    id: rec.id,
    tokenId: rec.tokenId,
    issuerDid: rec.issuerDid || null,
    issuerName: rec.issuerName || null,
    createdAt: rec.createdAt,
    expiresAt: rec.expiresAt,
    events: rec.events,
  });
}

