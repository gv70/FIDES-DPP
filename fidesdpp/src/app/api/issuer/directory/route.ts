/**
 * Issuer Directory API
 *
 * Returns a lightweight directory of locally-registered did:web issuers,
 * including derived on-chain issuer addresses (H160) for UI display purposes.
 *
 * GET /api/issuer/directory
 *
 * @license Apache-2.0
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDidWebManager } from '@/lib/vc/did-web-manager';
import { buildIssuerDirectory } from '@/lib/issuer/issuer-directory';
import 'server-only';

export async function GET(_request: NextRequest) {
  try {
    const manager = getDidWebManager();
    // Ensure JSON-backed dev storage is current (no-op on Postgres).
    await manager.reload();
    const issuers = await manager.listIssuers();
    const directory = buildIssuerDirectory(issuers);

    return NextResponse.json({
      success: true,
      issuers: directory,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to load issuer directory' },
      { status: 500 }
    );
  }
}

