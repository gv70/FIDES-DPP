/**
 * Issuer Trusted Suppliers (Allowlist) API
 *
 * Stores a list of supplier DIDs that are allowed to publish DTE credentials
 * for products issued by this manufacturer (did:web issuer).
 *
 * POST /api/issuer/trusted-suppliers
 * Headers: x-issuer-admin-key: <ISSUER_ADMIN_KEY> (required outside test mode)
 * Body:
 *  - did: string (did:web:...)
 *  - trustedSupplierDids: string[] (did:web:... or did:key:...)
 *
 * @license Apache-2.0
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDidWebManager } from '@/lib/vc/did-web-manager';
import 'server-only';

function isTestMode(): boolean {
  return process.env.FIDES_MODE === 'test' || process.env.TEST_MODE === '1';
}

function requireAdminKey(request: NextRequest): string | null {
  const expected = process.env.ISSUER_ADMIN_KEY;
  if (!expected) return null;
  const provided = request.headers.get('x-issuer-admin-key') || '';
  if (provided !== expected) return 'Unauthorized';
  return null;
}

function normalizeDidList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v || '').trim()).filter(Boolean);
}

export async function POST(request: NextRequest) {
  try {
    if (!isTestMode()) {
      const authError = requireAdminKey(request);
      if (authError) {
        return NextResponse.json({ success: false, error: authError }, { status: 401 });
      }
    }

    const body = await request.json().catch(() => ({}));
    const did = String(body?.did || '').trim();
    const trustedSupplierDids = normalizeDidList(body?.trustedSupplierDids);

    if (!did || !did.startsWith('did:web:')) {
      return NextResponse.json({ success: false, error: 'Missing or invalid did:web DID' }, { status: 400 });
    }

    const manager = getDidWebManager();
    const existing = await manager.getIssuerIdentity(did);
    if (!existing) {
      return NextResponse.json({ success: false, error: `Issuer not found: ${did}` }, { status: 404 });
    }

    const updated = await manager.updateIssuerMetadata(did, {
      trustedSupplierDids,
    });

    return NextResponse.json({
      success: true,
      did,
      trustedSupplierDids: Array.isArray(updated.metadata?.trustedSupplierDids)
        ? updated.metadata?.trustedSupplierDids
        : trustedSupplierDids,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update trusted suppliers' },
      { status: 500 }
    );
  }
}

