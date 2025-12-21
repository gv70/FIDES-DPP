/**
 * Issuer Registration API
 * 
 * Allows organizations to register and obtain did:web identity for VC issuance.
 * 
 * POST /api/issuer/register
 * Body: { domain: string, organizationName?: string }
 * 
 * Returns: { did: string, publicKey: string, didDocument: object }
 * 
 * @license Apache-2.0
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDidWebManager, IssuerStatus } from '@/lib/vc/did-web-manager';
import 'server-only';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { domain, organizationName } = body;

    if (!domain || typeof domain !== 'string') {
      return NextResponse.json(
        { error: 'Domain is required and must be a string' },
        { status: 400 }
      );
    }

    // Validate domain format
    const domainRegex = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
    if (!domainRegex.test(domain)) {
      return NextResponse.json(
        { error: `Invalid domain format: ${domain}. Expected format: example.com` },
        { status: 400 }
      );
    }

    // Get DID Web Manager
    const manager = getDidWebManager();

    // Register issuer (or get existing)
    const identity = await manager.registerIssuer(domain, organizationName || domain);

    // Generate DID document
    const didDocument = await manager.generateDidDocument(identity.did);
    const polkadotAccountsDocument = await manager.generatePolkadotAccountsDocument(identity.did);

    // Return response (DO NOT include private key)
    return NextResponse.json({
      success: true,
      did: identity.did,
      publicKey: Buffer.from(identity.signingKey.publicKey).toString('hex'),
      didDocument,
      polkadotAccountsDocument,
      status: identity.status, // PENDING, VERIFIED, FAILED, or UNKNOWN
      metadata: {
        domain: identity.metadata?.domain,
        organizationName: identity.metadata?.organizationName,
        registeredAt: identity.metadata?.registeredAt,
      },
      // Instructions for hosting DID document
      instructions: {
        url: `https://${domain}/.well-known/did.json`,
        content: didDocument,
        contentType: 'application/did+json',
        note: 'Host this file at the URL above to enable did:web verification. After hosting, call POST /api/issuer/verify to verify.',
      },
      polkadotAccountsInstructions: {
        url: `https://${domain}/.well-known/polkadot-accounts.json`,
        content: polkadotAccountsDocument,
        contentType: 'application/json',
        note: 'Host this file at the URL above to enable wallet authorization checks. Update it whenever you add or remove authorized wallets.',
      },
    });
  } catch (error: any) {
    console.error('Issuer registration error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to register issuer',
        message: error.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * Get issuer by domain
 * 
 * GET /api/issuer/register?domain=example.com
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const domain = searchParams.get('domain');

    if (!domain) {
      return NextResponse.json(
        { error: 'Domain parameter is required' },
        { status: 400 }
      );
    }

    const manager = getDidWebManager();
    const did = `did:web:${domain}`;
    const issuerIdentity = await manager.getIssuerIdentity(did);

    if (!issuerIdentity) {
      return NextResponse.json(
        { error: `Issuer not found for domain: ${domain}` },
        { status: 404 }
      );
    }

    // Generate DID document
    const didDocument = await manager.generateDidDocument(did);

    // Return response (DO NOT include private key)
    return NextResponse.json({
      success: true,
      did: issuerIdentity.did,
      publicKey: Buffer.from(issuerIdentity.signingKey.publicKey).toString('hex'),
      didDocument,
      status: issuerIdentity.status,
      lastError: issuerIdentity.lastError,
      lastAttemptAt: issuerIdentity.lastAttemptAt?.toISOString(),
      metadata: {
        domain: issuerIdentity.metadata?.domain,
        organizationName: issuerIdentity.metadata?.organizationName,
        registeredAt: issuerIdentity.metadata?.registeredAt?.toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Get issuer error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to get issuer',
        message: error.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}
