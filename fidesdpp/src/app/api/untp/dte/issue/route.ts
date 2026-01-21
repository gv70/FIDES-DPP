/**
 * UNTP DTE Issuance API Endpoint
 *
 * Issues a UNTP Digital Traceability Event (DTE) as a VC-JWT using a did:web issuer,
 * then uploads the raw VC-JWT to IPFS (Kubo/Helia/Pinata via configured backend).
 *
 * POST /api/untp/dte/issue
 * Body:
 *  - issuerDid?: string (e.g. "did:web:fidesdpp.xyz" or "did:web:fidesdpp.xyz:pilots:abc123")
 *  - domain?: string (e.g. "fidesdpp.xyz") [legacy convenience; equivalent to issuerDid=did:web:<domain>]
 *  - events: object[] (credentialSubject array)
 *  - credentialId?: string
 *  - expirationDate?: string (ISO 8601)
 *  - additionalContexts?: string[]
 *
 * @license Apache-2.0
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createIpfsBackend } from '@/lib/ipfs/IpfsStorageFactory';
import { computeJwtHash } from '@/lib/ipfs/IpfsStorageBackend';
import { getDidWebManager, IssuerStatus } from '@/lib/vc/did-web-manager';
import { JwtVcEngine } from '@/lib/vc/JwtVcEngine';
import { createDteIndexStorage } from '@/lib/dte/createDteIndexStorage';
import { buildDteIndexRecords } from '@/lib/dte/dte-indexing';

function parseOptionalDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid expirationDate: expected ISO 8601 date string');
  }
  return date;
}

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
    const issuerDidRaw = body?.issuerDid ? String(body.issuerDid).trim() : '';
    const domain = String(body?.domain || '').trim();
    const events = body?.events;

    const did =
      issuerDidRaw && issuerDidRaw.startsWith('did:web:')
        ? issuerDidRaw
        : domain
          ? `did:web:${domain}`
          : '';

    if (!did) {
      return NextResponse.json(
        { error: 'issuerDid or domain is required' },
        { status: 400 }
      );
    }

    if (!Array.isArray(events) || events.length === 0) {
      return NextResponse.json({ error: 'Events must be a non-empty array' }, { status: 400 });
    }

    const manager = getDidWebManager();

    const issuerIdentity = await manager.getIssuerIdentity(did);
    if (!issuerIdentity) {
      return NextResponse.json(
        {
          error: 'Issuer not registered',
          message: `Issuer ${did} is not registered locally. Register it first and ensure it is available in this environment (same DIDWEB_MASTER_KEY_HEX).`,
        },
        { status: 404 }
      );
    }

    if (issuerIdentity.status !== IssuerStatus.VERIFIED) {
      return NextResponse.json(
        {
          error: 'Issuer not verified',
          message: `Issuer ${did} is ${issuerIdentity.status}. Host did.json and verify it via POST /api/issuer/verify before issuing.`,
          status: issuerIdentity.status,
        },
        { status: 409 }
      );
    }

    const storage = createIpfsBackend();
    const isAvailable = await storage.isAvailable();
    if (!isAvailable) {
      return NextResponse.json(
        {
          error: `IPFS backend (${storage.getBackendType()}) is not available. Check configuration.`,
        },
        { status: 503 }
      );
    }

    const decryptedPrivateKey = await manager.getDecryptedPrivateKeySeed(did);
    const issuerIdentityWithKey = {
      ...issuerIdentity,
      signingKey: {
        ...issuerIdentity.signingKey,
        privateKey: decryptedPrivateKey,
      },
    };

    const statusListManager = await createOptionalStatusListManager(storage);
    const vcEngine = new JwtVcEngine(statusListManager);

    const vcEnvelope = await vcEngine.issueDteVcWithIdentity(events, issuerIdentityWithKey, {
      credentialId: body?.credentialId ? String(body.credentialId) : undefined,
      expirationDate: parseOptionalDate(body?.expirationDate),
      additionalContexts: Array.isArray(body?.additionalContexts) ? body.additionalContexts.map(String) : undefined,
    });

    const upload = await storage.uploadText(vcEnvelope.jwt, {
      name: `dte-${did.replace(/[^a-zA-Z0-9.-]+/g, '_')}-${new Date().toISOString()}.jwt`,
      keyvalues: {
        type: 'verifiable-credential',
        format: 'vc+jwt',
        'untp-module': 'dte',
        issuer: did,
      },
    });

    // Resolver-first traceability: index this DTE by referenced product identifiers.
    // This enables IDR discovery without updating the DPP VC for every new event.
    const indexing: {
      attempted: boolean;
      backend: 'postgres' | 'file';
      records: number;
      error?: string;
    } = {
      attempted: true,
      backend: (process.env.STORAGE_BACKEND || '').trim()
        ? ((process.env.STORAGE_BACKEND || '').trim() === 'postgres' ? 'postgres' : 'file')
        : (process.env.DATABASE_URL ? 'postgres' : 'file'),
      records: 0,
    };

    try {
      const credentialId =
        (vcEnvelope.payload as any)?.jti ||
        (vcEnvelope.payload as any)?.vc?.id ||
        (vcEnvelope.payload as any)?.vc?.credentialId ||
        String(body?.credentialId || `urn:uuid:${crypto.randomUUID()}`);

      const records = buildDteIndexRecords(Array.isArray(events) ? events : [], {
        issuerDid: did,
        credentialId,
        dteCid: upload.cid,
        gatewayUrl: upload.gatewayUrl,
      });

      indexing.records = records.length;

      if (records.length > 0) {
        const dteIndex = createDteIndexStorage();
        await dteIndex.upsertMany(records);
      }
    } catch (indexError: any) {
      console.warn('[DTE issue] Failed to index DTE (continuing):', indexError.message);
      indexing.error = indexError?.message || String(indexError);
    }

    return NextResponse.json({
      success: true,
      issuerDid: did,
      jwt: vcEnvelope.jwt,
      payloadHash: computeJwtHash(vcEnvelope.jwt),
      ipfs: {
        cid: upload.cid,
        uri: `ipfs://${upload.cid}`,
        gatewayUrl: upload.gatewayUrl,
        backend: storage.getBackendType(),
        size: upload.size,
        hash: upload.hash,
      },
      indexing,
      vc: vcEnvelope.payload?.vc || null,
    });
  } catch (error: any) {
    console.error('UNTP DTE issue error:', error);
    return NextResponse.json(
      { error: 'Failed to issue DTE', message: error.message || 'Unknown error' },
      { status: 500 }
    );
  }
}
