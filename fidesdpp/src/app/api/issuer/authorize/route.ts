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
    const address = String(body?.address || '').trim();
    const network = body?.network ? String(body.network).trim() : undefined;

    if (!did || !did.startsWith('did:web:')) {
      return NextResponse.json({ success: false, error: 'Missing or invalid did:web DID' }, { status: 400 });
    }

    if (!address) {
      return NextResponse.json({ success: false, error: 'Missing address' }, { status: 400 });
    }

    const manager = getDidWebManager();
    const existing = await manager.getIssuerIdentity(did);
    if (!existing) {
      return NextResponse.json({ success: false, error: `Issuer not found: ${did}` }, { status: 404 });
    }

    await manager.addAuthorizedPolkadotAccount(did, address, network);
    const polkadotAccountsDocument = await manager.generatePolkadotAccountsDocument(did);

    return NextResponse.json({
      success: true,
      did,
      address,
      network: network || 'asset-hub',
      polkadotAccountsDocument,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to authorize account' },
      { status: 500 }
    );
  }
}

