import { NextResponse } from 'next/server';
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
  const origin = `http://localhost:${process.env.PORT || '3000'}`;

  return NextResponse.json({
    enabled: true,
    did,
    didDocumentUrl: `${origin}/.well-known/did.json`,
    polkadotAccountsUrl: `${origin}/.well-known/polkadot-accounts.json`,
  });
}

