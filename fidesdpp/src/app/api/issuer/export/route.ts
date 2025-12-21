/**
 * Issuer Export API
 * 
 * Exports the hosting files for a registered issuer:
 * - DID document (did.json)
 * - Polkadot account authorization list (polkadot-accounts.json)
 * 
 * GET /api/issuer/export?domain=example.com
 * 
 * Returns: { did: string, didDocument: object, polkadotAccountsDocument: object }
 * 
 * @license Apache-2.0
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDidWebManager } from '@/lib/vc/did-web-manager';
import 'server-only';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const domainOrDid = searchParams.get('domain');

    if (!domainOrDid || typeof domainOrDid !== 'string') {
      return NextResponse.json(
        { error: 'Domain parameter is required' },
        { status: 400 }
      );
    }

    // Handle both domain (example.com) and DID (did:web:example.com) formats
    let domain: string;
    let did: string;
    
    if (domainOrDid.startsWith('did:web:')) {
      // Already a DID, extract domain
      did = domainOrDid;
      domain = domainOrDid.replace('did:web:', '').split(':')[0];
    } else {
      // Just domain, construct DID
      domain = domainOrDid;
      did = `did:web:${domain}`;
    }

    // Validate domain format
    const domainRegex = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
    if (!domainRegex.test(domain)) {
      return NextResponse.json(
        { error: `Invalid domain format: ${domain}. Expected format: example.com` },
        { status: 400 }
      );
    }

    const manager = getDidWebManager();

    // Get issuer identity
    const issuerIdentity = await manager.getIssuerIdentity(did);
    
    if (!issuerIdentity) {
      return NextResponse.json(
        { 
          error: `Issuer not found for domain: ${domain}. Please register first.`,
        },
        { status: 404 }
      );
    }

    // Generate DID document
    const didDocument = await manager.generateDidDocument(did);
    const polkadotAccountsDocument = await manager.generatePolkadotAccountsDocument(did);

    return NextResponse.json({
      success: true,
      did,
      domain,
      didDocument,
      polkadotAccountsDocument,
      instructions: {
        url: `https://${domain}/.well-known/did.json`,
        contentType: 'application/did+json',
        content: didDocument,
        note: 'Host this file at the URL above. Ensure Content-Type header is set correctly.',
      },
      polkadotAccountsInstructions: {
        url: `https://${domain}/.well-known/polkadot-accounts.json`,
        contentType: 'application/json',
        content: polkadotAccountsDocument,
        note: 'Host this file at the URL above. Update it when authorized wallets change.',
      },
    });
  } catch (error: any) {
    console.error('Issuer export error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to export issuer',
        message: error.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}
