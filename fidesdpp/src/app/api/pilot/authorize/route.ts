/**
 * Pilot Mode: authorize a wallet for a per-tester did:web (path-based)
 *
 * POST /api/pilot/authorize
 * Body: { pilotId: string, address: string, signature: string, network?: string }
 *
 * The signature must be produced by signing the exact message returned by this endpoint in error responses,
 * or by following the UI flow under /pilot.
 *
 * @license Apache-2.0
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDidWebManager } from '@/lib/vc/did-web-manager';
import { signatureVerify } from '@polkadot/util-crypto';
import { hexToU8a, stringToU8a } from '@polkadot/util';
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

function buildPilotAuthMessage(params: { pilotId: string; did: string; address: string }): string {
  return [
    'FIDES-DPP Pilot Authorization',
    `pilotId: ${params.pilotId}`,
    `did: ${params.did}`,
    `address: ${params.address}`,
  ].join('\n');
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
    const pilotId = String(body?.pilotId || '').trim();
    const address = String(body?.address || '').trim();
    const signature = String(body?.signature || '').trim();
    const network = body?.network ? String(body.network).trim() : 'westend-asset-hub';

    if (!pilotId) {
      return NextResponse.json({ success: false, error: 'Missing pilotId' }, { status: 400 });
    }
    if (!address) {
      return NextResponse.json({ success: false, error: 'Missing address' }, { status: 400 });
    }
    if (!signature) {
      return NextResponse.json({ success: false, error: 'Missing signature' }, { status: 400 });
    }

    const domain = getPilotBaseDomain(request);
    const did = `did:web:${domain}:pilots:${pilotId}`;
    const message = buildPilotAuthMessage({ pilotId, did, address });

    const sigBytes = signature.startsWith('0x') ? hexToU8a(signature) : hexToU8a(`0x${signature}`);
    // Primary: signature over the raw message bytes (expected when using signRaw with `0x`-prefixed hex).
    let verify = signatureVerify(stringToU8a(message), sigBytes, address);
    // Fallback: some signers may treat non-0x data as a UTF-8 string and sign its hex representation.
    if (!verify.isValid) {
      const messageHexString = Buffer.from(message, 'utf-8').toString('hex');
      verify = signatureVerify(stringToU8a(messageHexString), sigBytes, address);
    }

    if (!verify.isValid) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid signature',
          expectedMessage: message,
          hint: 'Sign exactly this message via the /pilot UI (it uses signRaw on the injected wallet).',
        },
        { status: 400 }
      );
    }

    const manager = getDidWebManager();
    const existing = await manager.getIssuerIdentity(did);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: `Pilot issuer not found for DID: ${did}. Start the pilot first.` },
        { status: 404 }
      );
    }

    await manager.addAuthorizedPolkadotAccount(did, address, network);
    const polkadotAccountsDocument = await manager.generatePolkadotAccountsDocument(did);

    return NextResponse.json({
      success: true,
      pilotId,
      did,
      address,
      network,
      polkadotAccountsDocument,
    });
  } catch (error: any) {
    console.error('[pilot/authorize] error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to authorize pilot wallet' },
      { status: 500 }
    );
  }
}
