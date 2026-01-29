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
import { enforceDteAllowlist } from '@/lib/dte/allowlist';
import { getDidWebManager } from '@/lib/vc/did-web-manager';
import { resolveTokenIdForProductClass, readIssuerH160ByTokenId } from '@/lib/passports/issuer-resolution';
import { lookupTokenIdByCanonicalSubjectId } from '@/lib/passports/lookup';
import { getTrustedSupplierDidsFromIssuer, resolveManufacturerDidByH160 } from '@/lib/issuer/trusted-suppliers';

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

    const jwtPayload = verification.payload || null;
    // did-jwt-vc returns the decoded JWT claims. The actual VC is usually under the "vc" claim.
    // However, some payloads also include top-level VC fields (issuer, credentialSubject, etc.).
    const vcObject = (jwtPayload as any)?.vc || jwtPayload || null;

    const extractEvents = (raw: any): any[] => {
      if (Array.isArray(raw)) return raw;
      if (raw && typeof raw === 'object') return Object.values(raw as any);
      return [];
    };

    const credentialSubjectRaw =
      (vcObject as any)?.credentialSubject ??
      (jwtPayload as any)?.credentialSubject ??
      (jwtPayload as any)?.vc?.credentialSubject;

    const extractedEvents = extractEvents(credentialSubjectRaw);

    const normalizedVc =
      (vcObject as any)?.credentialSubject
        ? vcObject
        : extractedEvents.length > 0
          ? { ...(vcObject as any), credentialSubject: extractedEvents }
          : vcObject;

    const schemaUrlFromVc = (normalizedVc as any)?.credentialSchema?.id
      ? String((normalizedVc as any).credentialSchema.id)
      : undefined;

    if (normalizedVc) {
      try {
        const result = await validateUntpDte(normalizedVc, schemaUrlFromVc ? { schemaUrl: schemaUrlFromVc } : undefined);
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
    let indexing: { attempted: boolean; records: number; error?: string; warning?: string } = {
      attempted: false,
      records: 0,
    };
    try {
      const events = extractedEvents;
      const issuerDid = String(
        (vcObject as any)?.issuer?.id ||
          (vcObject as any)?.issuer ||
          (jwtPayload as any)?.iss ||
          verification.issuer ||
          ''
      ).trim();
      const credentialId =
        String((vcObject as any)?.id || '').trim() ||
        String((jwtPayload as any)?.jti || '').trim() ||
        String((vcObject as any)?.jti || '').trim();
      if (issuerDid && cid) {
        indexing = { attempted: true, records: 0 };
        if (events.length === 0) {
          indexing.error = 'No DTE events found in credentialSubject';
        }

        if (events.length === 0) {
          // Nothing to index.
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
            indexing,
            vc: normalizedVc,
            schemaValidation,
          });
        }

        const dteIndex = createDteIndexStorage();
        const records = buildDteIndexRecords(events, {
          issuerDid,
          credentialId: credentialId || `urn:unknown:credential:${cid}`,
          dteCid: cid,
        });
        if (records.length > 0) {
          const referencedProductIds = Array.from(new Set(records.map((r) => r.productId)));
          const allowlistProductIds = Array.from(
            new Set(
              records
                // Governance is about who can publish events ABOUT a product.
                // Inputs/children are usually components/materials; enforcing allowlists for them
                // would require separate DPP issuance for every component, which is not required
                // to link the DTE to the finished-product passport.
                .filter((r) => r.role === 'output' || r.role === 'epc' || r.role === 'parent')
                .map((r) => r.productId)
            )
          );

          const manager = getDidWebManager();
          await manager.reload();
          const issuers = await manager.listIssuers();

          const resolveManufacturerDidByProductId = async (productId: string): Promise<string | null> => {
            const tokenId =
              (await resolveTokenIdForProductClass(productId)) ||
              // Best-effort: if the productId already includes a batch/serial suffix (e.g. "SKU#LOT"),
              // treat it as a canonical subject id and resolve directly.
              (String(productId).includes('#')
                ? await lookupTokenIdByCanonicalSubjectId({ canonicalSubjectId: String(productId) })
                : null);
            if (!tokenId) return null;
            const manufacturerIssuerH160 = await readIssuerH160ByTokenId({ tokenId });
            if (!manufacturerIssuerH160) return null;
            return resolveManufacturerDidByH160({ manufacturerIssuerH160, issuers });
          };

          const getTrustedSupplierDidsForManufacturerDid = async (manufacturerDid: string): Promise<string[]> => {
            const identity = await manager.getIssuerIdentity(manufacturerDid);
            return getTrustedSupplierDidsFromIssuer(identity);
          };

          try {
            await enforceDteAllowlist({
              supplierDid: issuerDid,
              productIds: allowlistProductIds.length > 0 ? allowlistProductIds : referencedProductIds,
              resolveManufacturerDidByProductId,
              getTrustedSupplierDidsForManufacturerDid,
            });
          } catch (allowError: any) {
            const msg = String(allowError?.message || allowError || '').trim();
            // Best-effort: in environments where product→issuer resolution is not available
            // (e.g. batch-only passports or incomplete indices), we still want verification
            // to succeed and allow indexing for UI linking.
            if (msg.includes('Cannot enforce allowlist: no passport issuer found')) {
              indexing.warning = msg;
            } else {
              throw allowError;
            }
          }

          indexing.records = records.length;
          await dteIndex.upsertMany(records);
        }
      }
    } catch (e: any) {
      console.warn('[DTE verify] Indexing failed (continuing):', e?.message || String(e));
      indexing = { attempted: true, records: indexing.records || 0, error: e?.message || String(e) };
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
      indexing,
      vc: normalizedVc,
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
