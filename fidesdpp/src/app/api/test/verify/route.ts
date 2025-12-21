import { NextRequest, NextResponse } from 'next/server';
import { getDidWebManager } from '@/lib/vc/did-web-manager';
import 'server-only';

function isTestMode(): boolean {
  return process.env.FIDES_MODE === 'test' || process.env.TEST_MODE === '1';
}

function getSandboxDid(): string {
  const port = process.env.PORT || '3000';
  return `did:web:localhost%3A${port}`;
}

export async function POST(request: NextRequest) {
  if (!isTestMode()) {
    return new NextResponse('Not Found', { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const address = String(body?.address || '').trim();
  const network = body?.network ? String(body.network).trim() : undefined;

  if (!address) {
    return NextResponse.json({ error: 'Missing address' }, { status: 400 });
  }

  const did = getSandboxDid();
  const manager = getDidWebManager();

  const verifyDid = await manager.verifyDidWeb(did);
  let authorized: boolean | null = null;
  let authorizedError: string | undefined;

  try {
    authorized = await manager.isPolkadotAccountAuthorizedRemote(did, address, network);
  } catch (error: any) {
    authorized = null;
    authorizedError = error.message || String(error);
  }

  return NextResponse.json({
    did,
    didVerification: verifyDid,
    authorization: {
      address,
      network: network || 'asset-hub',
      authorized,
      error: authorizedError,
    },
    ok: verifyDid.success === true && authorized === true,
  });
}

