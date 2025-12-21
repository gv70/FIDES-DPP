import { NextResponse } from 'next/server';
import { getDidWebManager } from '@/lib/vc/did-web-manager';
import 'server-only';

function isTestMode(): boolean {
  return process.env.FIDES_MODE === 'test' || process.env.TEST_MODE === '1';
}

function getSandboxDid(): string {
  const port = process.env.PORT || '3000';
  return `did:web:localhost%3A${port}`;
}

export async function GET() {
  if (!isTestMode()) {
    return new NextResponse('Not Found', { status: 404 });
  }

  const did = getSandboxDid();
  const manager = getDidWebManager();

  try {
    const didDocument = await manager.generateDidDocument(did, true);
    return NextResponse.json(didDocument, {
      headers: {
        'content-type': 'application/did+json; charset=utf-8',
        'cache-control': 'no-store',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Issuer not initialized' },
      { status: 404 }
    );
  }
}

