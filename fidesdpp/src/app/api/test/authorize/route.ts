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

function getSandboxDomainForRegister(did: string): string {
  const remainder = did.slice(8);
  return remainder.split(':')[0] || '';
}

async function ensureSandboxIssuerExists(did: string): Promise<void> {
  const manager = getDidWebManager();
  const existing = await manager.getIssuerIdentity(did);
  if (existing) return;

  const domainEncoded = getSandboxDomainForRegister(did);
  await manager.registerIssuer(domainEncoded, 'Sandbox Issuer');
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

  try {
    await ensureSandboxIssuerExists(did);
    await manager.addAuthorizedPolkadotAccount(did, address, network);
    return NextResponse.json({ success: true, did, address, network: network || 'asset-hub' });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to authorize account' },
      { status: 500 }
    );
  }
}

