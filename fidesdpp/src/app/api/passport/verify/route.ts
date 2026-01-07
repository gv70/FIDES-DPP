/**
 * Passport Verification API Endpoint
 * 
 * Implements complete v0.2 verification flow:
 * 1. Read on-chain passport record via PolkadotChainAdapter
 * 2. Check status (not revoked)
 * 3. Retrieve VC-JWT from IPFS
 * 4. Verify JWT hash matches on-chain payload_hash
 * 5. Verify VC signature via VcEngine
 * 6. Verify issuer matches chainAnchor in VC
 * 7. Extract and validate UNTP DPP against JSON Schema
 * 
 * @license Apache-2.0
 */

import { NextRequest, NextResponse } from 'next/server';
import { createDppService } from '@/lib/factory/createDppService';
import { formatValidationErrors } from '@/lib/validation/validateUntpDpp';
import { decodeVcJwt, decodeVcJwtHeader } from '@/lib/vc/decodeVcJwt';
import { extractDppFromVc } from '@/lib/vc/extractDppFromVc';
import { computeJwtHash } from '@/lib/ipfs/IpfsStorageBackend';
import type { DigitalProductPassport } from '@/lib/untp/generateDppJsonLd';

export async function POST(request: NextRequest) {
  try {
    const { tokenId } = await request.json();

    if (!tokenId) {
      return NextResponse.json(
        { error: 'Token ID is required' },
        { status: 400 }
      );
    }

    // Validate environment configuration
    const contractAddress = process.env.CONTRACT_ADDRESS;
    const rpcUrl = process.env.POLKADOT_RPC_URL || process.env.RPC_URL;
    const ipfsBackend = (process.env.IPFS_BACKEND as any) || 'kubo';
    const ipfsNodeUrl = process.env.IPFS_NODE_URL;
    const requiresIpfsNode = ipfsBackend === 'kubo';

    if (!contractAddress || !rpcUrl || (requiresIpfsNode && !ipfsNodeUrl)) {
      const missing = [];
      if (!contractAddress) missing.push('CONTRACT_ADDRESS');
      if (!rpcUrl) missing.push('POLKADOT_RPC_URL or RPC_URL');
      if (requiresIpfsNode && !ipfsNodeUrl) missing.push('IPFS_NODE_URL');
      
      console.error('Missing environment variables:', missing);
      return NextResponse.json(
        { 
          error: 'Service not configured',
          message: `Missing required environment variables: ${missing.join(', ')}`,
          details: {
            contractAddress: contractAddress ? '✓' : '✗',
            rpcUrl: rpcUrl ? '✓' : '✗',
            ipfsNodeUrl: requiresIpfsNode ? (ipfsNodeUrl ? '✓' : '✗') : 'n/a',
          }
        },
        { status: 503 }
      );
    }

    // Create DPP service with environment config
    const service = createDppService({
      ipfsBackend,
      ipfsNodeUrl,
      ipfsGatewayUrl: process.env.IPFS_GATEWAY_URL,
      pinataJwt: process.env.PINATA_JWT,
      contractAddress,
      rpcUrl,
    });

    // Run verification
    let verificationReport;
    try {
      verificationReport = await service.verifyPassport(tokenId);
    } catch (error: any) {
      // Determine appropriate status code based on error message
      const is404 = error.message?.includes('not found') || error.message?.includes('does not exist');
      const is502 = error.message?.includes('IPFS') || error.message?.includes('fetch') || error.message?.includes('retrieve');
      const statusCode = is404 ? 404 : is502 ? 502 : 500;
      
      return NextResponse.json(
        {
          valid: false,
          error: 'Verification failed',
          message: error.message || 'Failed to verify passport',
          checks: {
            passportExists: { passed: false, message: error.message || 'Passport not found or unreachable' },
            notRevoked: { passed: false, message: 'N/A' },
            datasetRetrieved: { passed: false, message: 'N/A' },
            hashMatches: { passed: false, message: 'N/A' },
            issuerMatches: { passed: false, message: 'N/A' },
            vcSignature: { passed: false, message: 'N/A' },
            schemaValid: { passed: false, message: 'N/A' },
          },
        },
        { status: statusCode }
      );
    }

    // Extract checks from verification report
    const passportExists = !!verificationReport.onChainData;
    const notRevoked = verificationReport.onChainData?.status !== 'Revoked';
    const datasetRetrieved = !!verificationReport.vcJwt;
    const hashMatches = verificationReport.hashMatches || false;
    const issuerMatches = verificationReport.issuerMatches || false;
    const vcSignatureValid = verificationReport.vcVerification?.verified || false;

    // Use schema validation from service (if available)
    const schemaValid = verificationReport.schemaValid ?? false;
    let schemaValidation = verificationReport.schemaValidation;
    
    // If service didn't perform schema validation, set defaults
    if (!schemaValidation) {
      schemaValidation = {
        valid: false,
        errors: [{
          instancePath: '',
          schemaPath: '',
          keyword: 'no-schema-validation',
          message: 'Schema validation was not performed',
          params: {},
        }],
        schemaMeta: {
          url: process.env.UNTP_SCHEMA_URL || 'https://test.uncefact.org/vocabulary/untp/dpp/untp-dpp-schema-0.6.1.json',
          fetchedAt: new Date(),
          sha256: '',
          size: 0,
        },
      };
    }
    
    // Ensure errorSummary is present for UI
    const formattedErrors = schemaValidation.errors 
      ? formatValidationErrors(schemaValidation.errors) 
      : undefined;

    // Overall validity: required checks must pass
    const overallValid = 
      passportExists &&
      notRevoked &&
      datasetRetrieved &&
      hashMatches &&
      issuerMatches &&
      vcSignatureValid;

    // Decode VC-JWT and extract DPP for visualization
    let decodedPayload: any | null = null;
    let decodedHeader: any | null = null;
    let decodedSignature: string | null = null;
    let extractedDpp: DigitalProductPassport | null = null;
    let computedHashMatch = false;

    if (verificationReport.vcJwt) {
      try {
        // Decode JWT parts
        decodedHeader = decodeVcJwtHeader(verificationReport.vcJwt);
        decodedPayload = decodeVcJwt(verificationReport.vcJwt);
        
        // Extract signature (last part of JWT)
        const jwtParts = verificationReport.vcJwt.split('.');
        if (jwtParts.length === 3) {
          decodedSignature = jwtParts[2];
        }
        
        // Extract DPP from decoded payload (only if decode succeeded)
        if (decodedPayload) {
          try {
            extractedDpp = extractDppFromVc(decodedPayload);
          } catch (extractError: any) {
            console.warn('Failed to extract DPP from VC payload:', extractError.message);
            // Continue without extracted DPP - use service-provided DPP as fallback
          }
        }
        
        // Compute hash match (double-check integrity)
        // The service already computes this, but we verify it here for transparency
        const recomputedHash = computeJwtHash(verificationReport.vcJwt);
        computedHashMatch = recomputedHash === verificationReport.onChainData?.payloadHash;
      } catch (decodeError: any) {
        console.warn('Failed to decode VC-JWT:', decodeError.message);
        // Continue without decoded data - use service-provided payload as fallback
      }
    }

    // Use extracted DPP if available, otherwise fall back to service-provided DPP
    const dppData = extractedDpp || verificationReport.dpp;

    // Return structured response
    return NextResponse.json({
      valid: overallValid,
      checks: {
        passportExists: { 
          passed: passportExists, 
          message: passportExists ? 'Passport found on-chain' : 'Passport not found'
        },
        notRevoked: { 
          passed: notRevoked,
          message: notRevoked 
            ? 'Passport is active' 
            : 'Passport has been revoked'
        },
        datasetRetrieved: { 
          passed: datasetRetrieved,
          message: datasetRetrieved 
            ? 'VC-JWT retrieved from IPFS' 
            : 'Failed to retrieve VC-JWT from IPFS'
        },
        hashMatches: { 
          passed: hashMatches,
          message: hashMatches 
            ? 'Payload hash verified (data integrity confirmed)' 
            : 'Hash mismatch - data may have been tampered with'
        },
        issuerMatches: { 
          passed: issuerMatches,
          message: issuerMatches 
            ? 'Issuer verified (chainAnchor matches on-chain issuer)' 
            : 'Issuer mismatch - chainAnchor does not match on-chain issuer'
        },
        vcSignature: { 
          passed: vcSignatureValid,
          message: vcSignatureValid 
            ? 'VC signature valid' 
            : `VC signature invalid: ${verificationReport.vcVerification?.errors?.join(', ') || 'unknown error'}`
        },
      },
      onChainData: verificationReport.onChainData,
      vcData: {
        jwt: verificationReport.vcJwt || null,
        header: decodedHeader || null,
        payload: decodedPayload || verificationReport.vcVerification?.payload || null,
        signature: decodedSignature || null,
      },
      dppData: dppData || null,
      schemaValidation: {
        valid: schemaValidation.valid,
        errors: schemaValidation.errors,
        errorSummary: formattedErrors,
        schemaMeta: schemaValidation.schemaMeta,
      },
    });
  } catch (error: any) {
    console.error('Verification error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error.message || 'Unexpected error during verification',
      },
      { status: 500 }
    );
  }
}

// Export GET for health check (optional)
export async function GET() {
  return NextResponse.json(
    { 
      message: 'Passport verification API is available',
      endpoint: '/api/passport/verify',
      method: 'POST',
      requiredBody: { tokenId: 'string' }
    },
    { status: 200 }
  );
}
