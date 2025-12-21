/**
 * Issuer Verification API
 * 
 * Verifies did:web issuer by fetching did.json from domain and validating public key match.
 * 
 * POST /api/issuer/verify?domain=example.com
 * 
 * Returns: { success: boolean, status: IssuerStatus, error?: string }
 * 
 * @license Apache-2.0
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDidWebManager, IssuerStatus } from '@/lib/vc/did-web-manager';
import 'server-only';

export async function POST(request: NextRequest) {
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

    // Get issuer identity by DID
    const issuerIdentity = await manager.getIssuerIdentity(did);
    
    if (!issuerIdentity) {
      return NextResponse.json(
        { 
          success: false,
          error: `Issuer not found for domain: ${domain}. Please register first.`,
          status: IssuerStatus.UNKNOWN,
        },
        { status: 404 }
      );
    }

    // Verify issuer (fetches did.json and validates public key)
    const verification = await manager.verifyDidWeb(did);

    // Get updated issuer identity to get latest status
    const updatedIssuer = await manager.getIssuerIdentity(did);

    if (verification.success) {
      return NextResponse.json({
        success: true,
        status: verification.status,
        message: 'Issuer verified successfully. did.json hosted and public key matches.',
      });
    } else {
      return NextResponse.json({
        success: false,
        status: verification.status,
        error: verification.error || 'Verification failed',
        lastError: updatedIssuer?.lastError,
        lastAttemptAt: updatedIssuer?.lastAttemptAt?.toISOString(),
      });
    }
  } catch (error: any) {
    console.error('Issuer verification error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to verify issuer',
        message: error.message || 'Unknown error',
        status: IssuerStatus.FAILED,
      },
      { status: 500 }
    );
  }
}
