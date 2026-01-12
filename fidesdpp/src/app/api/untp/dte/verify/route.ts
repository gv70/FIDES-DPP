/**
 * UNTP DTE Verification API Endpoint
 *
 * Verifies a UNTP Digital Traceability Event (DTE) VC-JWT:
 * - Retrieves raw VC-JWT from IPFS (by CID) or accepts a raw `jwt`
 * - Verifies VC signature (did:key or did:web)
 * - Optionally validates against UNTP DTE JSON Schema (remote fetch)
 *
 * POST /api/untp/dte/verify
 * Body:
 *  - cid?: string
 *  - jwt?: string
 *  - expectedHash?: string (optional, 0x-prefixed SHA-256 for integrity check)
 *
 * @license Apache-2.0
 */

import { NextRequest, NextResponse } from 'next/server';
import { createIpfsBackend } from '@/lib/ipfs/IpfsStorageFactory';
import { computeJwtHash } from '@/lib/ipfs/IpfsStorageBackend';
import { JwtVcEngine } from '@/lib/vc/JwtVcEngine';
import { validateUntpDte, formatDteValidationErrors } from '@/lib/validation/validateUntpDte';
import { createDteIndexStorage } from '@/lib/dte/createDteIndexStorage';
import { buildDteIndexRecords } from '@/lib/dte/dte-indexing';

async function createOptionalStatusListManager(storage: ReturnType<typeof createIpfsBackend>) {
  const enableStatusList = process.env.ENABLE_STATUS_LIST !== 'false';
  if (!enableStatusList) return undefined;

  try {
    const { createStatusListStorage } = await import('@/lib/storage/createStorageBackend');
    const { StatusListManager } = await import('@/lib/vc/StatusListManager');
    const statusListStorage = createStatusListStorage();
    return new StatusListManager(statusListStorage, storage);
  } catch (error: any) {
    console.warn('Status List Manager initialization failed (continuing without Status List):', error.message);
    return undefined;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const cid = body?.cid ? String(body.cid).trim() : '';
    const rawJwt = body?.jwt ? String(body.jwt).trim() : '';
    const expectedHash = body?.expectedHash ? String(body.expectedHash).trim() : undefined;

    if (!cid && !rawJwt) {
      return NextResponse.json(
        { error: 'Missing input', message: 'Provide either "cid" or "jwt" in request body' },
        { status: 400 }
      );
    }

    const storage = createIpfsBackend();
    const isAvailable = await storage.isAvailable();
    if (!isAvailable) {
      return NextResponse.json(
        { error: `IPFS backend (${storage.getBackendType()}) is not available. Check configuration.` },
        { status: 503 }
      );
    }

    let jwt = rawJwt;
    let retrieved: { cid: string; hash: string } | null = null;

    if (!jwt) {
      const res = await storage.retrieveText(cid);
      jwt = res.data;
      retrieved = { cid: res.cid, hash: res.hash };
    }

    const computedHash = computeJwtHash(jwt);
    const hashMatches = expectedHash ? expectedHash.toLowerCase() === computedHash.toLowerCase() : null;

    const statusListManager = await createOptionalStatusListManager(storage);
    const vcEngine = new JwtVcEngine(statusListManager);

    const verification = await vcEngine.verifyDppVc(jwt);

    // Schema validation (best-effort): validate the VC object, if available
    let schemaValid: boolean | null = null;
    let schemaValidation: any = null;

    const vcObject = verification.payload || null;
    const schemaUrlFromVc = vcObject?.credentialSchema?.id ? String(vcObject.credentialSchema.id) : undefined;

    if (vcObject) {
      try {
        const result = await validateUntpDte(vcObject, schemaUrlFromVc ? { schemaUrl: schemaUrlFromVc } : undefined);
        schemaValid = result.valid;
        schemaValidation = {
          valid: result.valid,
          errors: result.errors,
          errorSummary: result.errors ? formatDteValidationErrors(result.errors) : undefined,
          schemaMeta: result.schemaMeta,
        };
      } catch (e: any) {
        schemaValid = null;
        schemaValidation = { warning: e?.message || String(e) };
      }
    }

    // Best-effort indexing on verify (useful if the DTE was issued externally)
    try {
      const events = Array.isArray(vcObject?.credentialSubject) ? vcObject.credentialSubject : [];
      const issuerDid = String(vcObject?.issuer?.id || vcObject?.issuer || verification.issuer || '').trim();
      const credentialId = String(vcObject?.id || '').trim() || String((vcObject as any)?.jti || '').trim();
      if (events.length > 0 && issuerDid && cid) {
        const dteIndex = createDteIndexStorage();
        const records = buildDteIndexRecords(events, {
          issuerDid,
          credentialId: credentialId || `urn:unknown:credential:${cid}`,
          dteCid: cid,
        });
        if (records.length > 0) {
          await dteIndex.upsertMany(records);
        }
      }
    } catch (e: any) {
      console.warn('[DTE verify] Indexing failed (continuing):', e?.message || String(e));
    }

    return NextResponse.json({
      valid: verification.verified && (hashMatches === null ? true : hashMatches),
      checks: {
        signature: {
          passed: verification.verified,
          message: verification.verified ? 'VC signature valid' : `VC signature invalid: ${verification.errors.join(', ')}`,
          warnings: verification.warnings,
        },
        integrity: {
          passed: hashMatches === null ? true : hashMatches,
          message:
            hashMatches === null
              ? 'No expectedHash provided (integrity check skipped)'
              : hashMatches
              ? 'JWT hash matches expectedHash'
              : 'JWT hash mismatch',
          expectedHash: expectedHash || null,
          computedHash,
        },
        schema: {
          passed: schemaValid === null ? true : schemaValid,
          message:
            schemaValid === null
              ? (schemaValidation?.warning ? 'Schema validation skipped (best-effort)' : 'No VC object available for schema validation')
              : schemaValid
              ? 'Schema validation passed'
              : 'Schema validation failed',
          schemaUrl: schemaUrlFromVc || process.env.UNTP_DTE_SCHEMA_URL || null,
        },
      },
      ipfs: retrieved
        ? {
            cid: retrieved.cid,
            uri: `ipfs://${retrieved.cid}`,
            backend: storage.getBackendType(),
            retrievedHash: retrieved.hash,
          }
        : null,
      vc: vcObject,
      schemaValidation,
    });
  } catch (error: any) {
    console.error('UNTP DTE verify error:', error);
    return NextResponse.json(
      { error: 'Failed to verify DTE', message: error.message || 'Unknown error' },
      { status: 500 }
    );
  }
}
