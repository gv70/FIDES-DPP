/**
 * UNTP DTE Publish API Endpoint (Allowlist-governed)
 *
 * Accepts an externally-issued DTE VC-JWT, verifies it, uploads it to IPFS,
 * and indexes it for resolver-first discovery (IDR untp:dte).
 *
 * Governance: allowlist enforced.
 * The DTE issuer (supplier DID) must be allowlisted by the product's manufacturer DID.
 *
 * POST /api/untp/dte/publish
 * Body:
 *  - jwt: string (VC-JWT)
 *
 * @license Apache-2.0
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createIpfsBackend } from '@/lib/ipfs/IpfsStorageFactory';
import { computeJwtHash } from '@/lib/ipfs/IpfsStorageBackend';
import { JwtVcEngine } from '@/lib/vc/JwtVcEngine';
import { createDteIndexStorage } from '@/lib/dte/createDteIndexStorage';
import { buildDteIndexRecords } from '@/lib/dte/dte-indexing';
import { enforceDteAllowlist } from '@/lib/dte/allowlist';
import { getDidWebManager } from '@/lib/vc/did-web-manager';
import { resolveTokenIdForProductClass, readIssuerH160ByTokenId } from '@/lib/passports/issuer-resolution';
import { lookupTokenIdByCanonicalSubjectId } from '@/lib/passports/lookup';
import { getTrustedSupplierDidsFromIssuer, resolveManufacturerDidByH160 } from '@/lib/issuer/trusted-suppliers';
import 'server-only';

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
    const body = await request.json().catch(() => ({}));
    const jwt = body?.jwt ? String(body.jwt).trim() : '';

    if (!jwt) {
      return NextResponse.json({ error: 'Missing input', message: 'Provide "jwt" in request body' }, { status: 400 });
    }

    const storage = createIpfsBackend();
    const isAvailable = await storage.isAvailable();
    if (!isAvailable) {
      return NextResponse.json(
        { error: `IPFS backend (${storage.getBackendType()}) is not available. Check configuration.` },
        { status: 503 }
      );
    }

    const statusListManager = await createOptionalStatusListManager(storage);
    const vcEngine = new JwtVcEngine(statusListManager);

    const verification = await vcEngine.verifyDppVc(jwt);
    if (!verification.verified) {
      return NextResponse.json(
        { error: 'Invalid DTE VC', message: verification.errors.join(', ') },
        { status: 400 }
      );
    }

    const jwtPayload: any = verification.payload || null;
    const vcObject: any = jwtPayload?.vc || jwtPayload || null;

    const credentialSubjectRaw =
      vcObject?.credentialSubject ?? jwtPayload?.credentialSubject ?? jwtPayload?.vc?.credentialSubject;
    const events = Array.isArray(credentialSubjectRaw)
      ? credentialSubjectRaw
      : credentialSubjectRaw && typeof credentialSubjectRaw === 'object'
        ? Object.values(credentialSubjectRaw)
        : [];
    const issuerDid = String(vcObject?.issuer?.id || vcObject?.issuer || jwtPayload?.iss || verification.issuer || '').trim();
    const credentialId =
      String(vcObject?.id || '').trim() ||
      String(jwtPayload?.jti || '').trim() ||
      String(vcObject?.jti || '').trim() ||
      `urn:uuid:${crypto.randomUUID()}`;

    if (!issuerDid) {
      return NextResponse.json({ error: 'Missing issuer in DTE VC' }, { status: 400 });
    }

    if (events.length === 0) {
      return NextResponse.json({ error: 'No events found', message: 'DTE VC must include credentialSubject[]' }, { status: 400 });
    }

    // Build index records first to extract the set of referenced product identifiers.
    const draftRecords = buildDteIndexRecords(events, {
      issuerDid,
      credentialId,
      dteCid: 'bafy-temp',
    });
    const referencedProductIds = Array.from(new Set(draftRecords.map((r) => r.productId)));
    const allowlistProductIds = Array.from(
      new Set(
        draftRecords
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

    // Enforce allowlist before upload/indexing.
    await enforceDteAllowlist({
      supplierDid: issuerDid,
      productIds: allowlistProductIds.length > 0 ? allowlistProductIds : referencedProductIds,
      resolveManufacturerDidByProductId,
      getTrustedSupplierDidsForManufacturerDid,
    });

    const upload = await storage.uploadText(jwt, {
      name: `dte-external-${issuerDid.replace(/[^a-zA-Z0-9.-]+/g, '_')}-${new Date().toISOString()}.jwt`,
      keyvalues: {
        type: 'verifiable-credential',
        format: 'vc+jwt',
        'untp-module': 'dte',
        issuer: issuerDid,
        publisher: 'fidesdpp',
      },
    });

    // Final indexing with the correct CID.
    const records = buildDteIndexRecords(events, {
      issuerDid,
      credentialId,
      dteCid: upload.cid,
      gatewayUrl: upload.gatewayUrl,
    });

    const dteIndex = createDteIndexStorage();
    if (records.length > 0) {
      await dteIndex.upsertMany(records);
    }

    return NextResponse.json({
      success: true,
      issuerDid,
      credentialId,
      payloadHash: computeJwtHash(jwt),
      ipfs: {
        cid: upload.cid,
        uri: `ipfs://${upload.cid}`,
        gatewayUrl: upload.gatewayUrl,
        backend: storage.getBackendType(),
        size: upload.size,
        hash: upload.hash,
      },
      indexed: {
        records: records.length,
        productIds: referencedProductIds,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to publish DTE', message: error.message || 'Unknown error' },
      { status: 500 }
    );
  }
}
