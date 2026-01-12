/**
 * Pilot Mode: create a per-tester did:web (path-based)
 *
 * POST /api/pilot/start
 * Response:
 *  - pilotId
 *  - did (did:web:<domain>:pilots:<pilotId>)
 *  - didDocumentUrl, polkadotAccountsUrl
 *
 * @license Apache-2.0
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDidWebManager, IssuerStatus } from '@/lib/vc/did-web-manager';
import crypto from 'crypto';
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

function createPilotId(): string {
  // 16 hex chars: short, URL-safe, collision-resistant enough for pilots
  return crypto.randomBytes(8).toString('hex');
}

function getRequestHostWithPort(request: NextRequest): { hostname: string; hostWithPort: string } {
  const hostHeader = String(request.headers.get('host') || '').trim();
  if (hostHeader) {
    const hostname = hostHeader.split(':')[0];
    return { hostname, hostWithPort: hostHeader };
  }
  // Fallback: nextUrl.hostname has no port in some environments
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
    // did:web requires percent-encoding ":" when using a port (localhost dev)
    return encodeURIComponent(hostWithPort);
  }

  // Default to current host (works on custom domain and on *.vercel.app)
  return hostname;
}

function validateDomain(domain: string): string | null {
  // Allow sandbox localhost DID domains (percent-encoded host:port) in test mode
  if (isTestMode() && (domain.startsWith('localhost%3A') || domain.startsWith('127.0.0.1%3A'))) {
    return null;
  }
  const domainRegex = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
  if (!domainRegex.test(domain)) {
    return `Invalid domain format: ${domain}. Expected format: example.com`;
  }
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
    const organizationName = body?.organizationName ? String(body.organizationName).trim() : undefined;

    const domain = getPilotBaseDomain(request);
    const domainError = validateDomain(domain);
    if (domainError) {
      return NextResponse.json(
        { success: false, error: domainError, hint: 'Set DIDWEB_BASE_DOMAIN to a public domain (e.g. fidesdpp.xyz).' },
        { status: 400 }
      );
    }

    const pilotId = createPilotId();
    const did = `did:web:${domain}:pilots:${pilotId}`;

    const manager = getDidWebManager();
    const identity = await manager.registerIssuerDid(did, organizationName || `pilot-${pilotId}`, {
      status: IssuerStatus.VERIFIED,
      metadata: { pilotId, kind: 'pilot' },
    });

    const didDocumentUrl = manager.didWebToUrl(did);
    const polkadotAccountsUrl = manager.getPolkadotAccountsServiceEndpoint(did);

    return NextResponse.json({
      success: true,
      pilotId,
      did,
      status: identity.status,
      didDocumentUrl,
      polkadotAccountsUrl,
      instructions: {
        next: 'Connect your wallet and authorize it for this pilot DID to enable on-chain actions.',
      },
    });
  } catch (error: any) {
    console.error('[pilot/start] error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to start pilot' },
      { status: 500 }
    );
  }
}
