/**
 * Passport lookup API
 *
 * Resolves a passport tokenId from a product identifier by using the on-chain
 * subjectIdHash index (contract query: findTokenBySubjectId).
 *
 * Canonical subject identifier (must match issuance rules):
 * - ProductClass: productId
 * - Batch: productId + "#" + batchNumber
 * - Item: productId + "#" + serialNumber
 *
 * @license Apache-2.0
 */

import { NextRequest, NextResponse } from 'next/server';
import { buildCanonicalSubjectId, lookupTokenIdByCanonicalSubjectId } from '@/lib/passports/lookup';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const canonicalSubjectId = buildCanonicalSubjectId(body || {});

    if (!canonicalSubjectId) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Missing product identifier. Provide { productId, granularity } (and batchNumber/serialNumber if needed), or { canonicalSubjectId }.',
        },
        { status: 400 }
      );
    }

    const tokenId = await lookupTokenIdByCanonicalSubjectId({
      canonicalSubjectId,
      contractAddress: body?.contractAddress,
      rpcUrl: body?.rpcUrl,
    });

    if (!tokenId) {
      return NextResponse.json(
        {
          success: true,
          found: false,
          canonicalSubjectId,
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        found: true,
        tokenId,
        canonicalSubjectId,
      },
      { status: 200 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Lookup failed' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    {
      message: 'Passport lookup API is available',
      endpoint: '/api/passports/lookup',
      method: 'POST',
      requiredBody: {
        productId: 'string',
        granularity: '"ProductClass" | "Batch" | "Item"',
        batchNumber: 'string (required if granularity=Batch)',
        serialNumber: 'string (required if granularity=Item)',
      },
    },
    { status: 200 }
  );
}
