import { NextRequest, NextResponse } from 'next/server';
import { getDidWebManager } from '@/lib/vc/did-web-manager';
import 'server-only';

function isTestMode(): boolean {
  return process.env.FIDES_MODE === 'test' || process.env.TEST_MODE === '1';
}

function getRequestHostWithPort(request: NextRequest): { hostname: string; hostWithPort: string } {
  const hostHeader = String(request.headers.get('host') || '').trim();
  if (hostHeader) {
    const hostname = hostHeader.split(':')[0];
    return { hostname, hostWithPort: hostHeader };
  }
  const hostname = request.nextUrl.hostname;
  const port = request.nextUrl.port || process.env.PORT || '3000';
  return { hostname, hostWithPort: `${hostname}:${port}` };
}

function isLocalHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

function getPilotBaseDomain(request: NextRequest): string {
  const fromEnv = String(process.env.DIDWEB_BASE_DOMAIN || '').trim();
  if (fromEnv) return fromEnv;
  const { hostname, hostWithPort } = getRequestHostWithPort(request);
  if (isLocalHost(hostname) && isTestMode()) {
    return encodeURIComponent(hostWithPort);
  }
  return hostname;
}

export async function GET(request: NextRequest, context: { params: Promise<{ pilotId: string }> }) {
  const { pilotId } = await context.params;
  const domain = getPilotBaseDomain(request);
  const did = `did:web:${domain}:pilots:${pilotId}`;
  const manager = getDidWebManager();

  try {
    const doc = await manager.generatePolkadotAccountsDocument(did);
    return NextResponse.json(doc, {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'access-control-allow-origin': '*',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Pilot issuer not initialized' },
      { status: 404 }
    );
  }
}
