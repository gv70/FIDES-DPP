import { NextRequest, NextResponse } from 'next/server';
import { createDppService } from '@/lib/factory/createDppService';
import { getDidWebManager } from '@/lib/vc/did-web-manager';
import { computeJwtHash } from '@/lib/ipfs/IpfsStorageBackend';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      tokenId,
      issuerDid,
      issuerAddress,
      network,
      patch,
    }: {
      tokenId: string;
      issuerDid: string;
      issuerAddress: string;
      network?: string;
      patch?: {
        productName?: string;
        productDescription?: string;
        dppPatch?: Record<string, unknown>;
      };
    } = body || {};

    if (!tokenId) {
      return NextResponse.json({ success: false, error: 'Token ID is required' }, { status: 400 });
    }
    if (!issuerDid) {
      return NextResponse.json({ success: false, error: 'Issuer DID is required' }, { status: 400 });
    }
    if (!issuerAddress) {
      return NextResponse.json({ success: false, error: 'Issuer address is required' }, { status: 400 });
    }

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
      return NextResponse.json(
        {
          success: false,
          error: `Missing required environment variables: ${missing.join(', ')}`,
        },
        { status: 503 }
      );
    }

    const dppService = createDppService({
      ipfsBackend,
      ipfsNodeUrl,
      ipfsGatewayUrl: process.env.IPFS_GATEWAY_URL,
      pinataJwt: process.env.PINATA_JWT,
      contractAddress,
      rpcUrl,
    });

    // 1) Authorize wallet for did:web issuer (fail-fast)
    const normalizeNetwork = (raw?: string): string => {
      const n = String(raw || '').trim();
      if (!n) return 'asset-hub';
      return n.replace(/^polkadot:/, '');
    };

    const didWebNetwork = normalizeNetwork(network);
    const manager = getDidWebManager();

    const candidates = Array.from(new Set([didWebNetwork, 'asset-hub', 'westend-asset-hub']));
    let authorized = false;
    let lastError: any = null;
    for (const candidate of candidates) {
      try {
        const isAuthorized = await manager.isPolkadotAccountAuthorizedRemote(
          issuerDid,
          issuerAddress,
          candidate
        );
        if (isAuthorized) {
          authorized = true;
          break;
        }
      } catch (e: any) {
        lastError = e;
      }
    }

    if (!authorized) {
      if (lastError) {
        return NextResponse.json(
          {
            success: false,
            error: `Authorization check unavailable: ${lastError.message || String(lastError)}`,
          },
          { status: 503 }
        );
      }
      return NextResponse.json(
        {
          success: false,
          error: `Wallet ${issuerAddress} is not authorized for issuer ${issuerDid}`,
          details: { networksChecked: candidates },
        },
        { status: 403 }
      );
    }

    // 2) Read current on-chain record
    const onChain = await dppService.readPassport(String(tokenId));
    const currentVersion = Number((onChain as any)?.version || 1) || 1;
    const nextVersion = currentVersion + 1;
    const currentDatasetUri = String((onChain as any)?.datasetUri || '');
    const currentPayloadHash = String((onChain as any)?.payloadHash || '');

    if (!currentDatasetUri.startsWith('ipfs://')) {
      return NextResponse.json(
        { success: false, error: 'Current datasetUri is missing or invalid' },
        { status: 400 }
      );
    }

    // 3) Retrieve and decode current VC-JWT from IPFS via the application service
    // We decode via the VC engine to extract the current credentialSubject (DPP).
    const cid = currentDatasetUri.replace('ipfs://', '');
    const vcJwt = (await (dppService as any).storage.retrieveText(cid)).data as string;
    const decoded = (dppService as any).vcEngine.decodeVc(vcJwt);
    const currentDpp = (dppService as any).vcEngine.extractDpp(decoded);

    const deepMerge = (base: any, patchObj: any): any => {
      if (!patchObj || typeof patchObj !== 'object' || Array.isArray(patchObj)) return base;
      if (!base || typeof base !== 'object' || Array.isArray(base)) return patchObj;

      const out: any = { ...base };
      for (const [key, value] of Object.entries(patchObj)) {
        if (value === undefined) continue;
        if (Array.isArray(value)) {
          out[key] = value;
          continue;
        }
        if (value && typeof value === 'object') {
          out[key] = deepMerge((base as any)[key], value);
          continue;
        }
        out[key] = value;
      }
      return out;
    };

    const currentProductIdentifier = String((currentDpp as any)?.product?.identifier || '');

    const mergedDpp = patch?.dppPatch
      ? deepMerge(currentDpp, patch.dppPatch)
      : currentDpp;

    const updatedDpp = {
      ...mergedDpp,
      product: {
        ...(mergedDpp as any).product,
        // Keep identifier stable by default (contract anchor lookup relies on it)
        ...(currentProductIdentifier ? { identifier: currentProductIdentifier } : {}),
        ...(patch?.productName ? { name: patch.productName } : {}),
        ...(patch?.productDescription !== undefined ? { description: patch.productDescription } : {}),
      },
      chainAnchor: {
        ...(mergedDpp as any)?.chainAnchor,
        tokenId: String(tokenId),
        version: nextVersion,
        previousDatasetUri: currentDatasetUri,
        previousPayloadHash: currentPayloadHash,
      },
    };

    // 4) Issue new VC-JWT with did:web identity (server-managed key), upload to IPFS
    const issuerIdentity = await manager.getIssuerIdentity(issuerDid);
    if (!issuerIdentity) {
      return NextResponse.json(
        { success: false, error: `Issuer identity not found: ${issuerDid}` },
        { status: 404 }
      );
    }

    let decryptedPrivateKey: Uint8Array;
    try {
      decryptedPrivateKey = await manager.getDecryptedPrivateKeySeed(issuerDid);
    } catch (e: any) {
      return NextResponse.json(
        {
          success: false,
          error: `Failed to decrypt issuer signing key: ${e.message || String(e)}`,
        },
        { status: 500 }
      );
    }

    const issuerIdentityWithKey = {
      ...issuerIdentity,
      signingKey: {
        ...issuerIdentity.signingKey,
        privateKey: decryptedPrivateKey,
      },
    };

    const jwtVcEngine = (dppService as any).vcEngine;
    if (typeof jwtVcEngine.issueDppVcWithIdentity !== 'function') {
      return NextResponse.json(
        { success: false, error: 'VC engine does not support did:web issuance' },
        { status: 500 }
      );
    }

    const blockchainAccount = {
      address: issuerAddress,
      publicKey: new Uint8Array(32),
      sign: async () => {
        throw new Error('Signing not supported in update prepare');
      },
      network: didWebNetwork,
      keyType: 'ed25519',
    };

    const vcEnvelope = await jwtVcEngine.issueDppVcWithIdentity(updatedDpp, issuerIdentityWithKey, blockchainAccount, {
      tokenId: String(tokenId),
      credentialId: `urn:uuid:${crypto.randomUUID()}`,
    });

    const storageResult = await (dppService as any).storage.uploadText(vcEnvelope.jwt, {
      name: `dpp-update-${tokenId}-v${nextVersion}.jwt`,
      keyvalues: {
        type: 'verifiable-credential',
        format: 'vc+jwt',
        'token-id': String(tokenId),
        version: String(nextVersion),
      },
    });

    const payloadHash = computeJwtHash(vcEnvelope.jwt);

    // Compute subjectIdHash locally (same algorithm as service)
    const granularity = String((onChain as any)?.granularity || 'Batch');
    const productId = String(updatedDpp?.product?.identifier || '');
    const batchNumber = String(updatedDpp?.product?.batchNumber || '');
    const serialNumber = String(updatedDpp?.product?.serialNumber || '');

    let canonicalSubjectId = '';
    if (granularity === 'ProductClass') canonicalSubjectId = productId;
    if (granularity === 'Batch') canonicalSubjectId = productId && batchNumber ? `${productId}#${batchNumber}` : '';
    if (granularity === 'Item') canonicalSubjectId = productId && serialNumber ? `${productId}#${serialNumber}` : '';

    const subjectIdHash =
      canonicalSubjectId && productId
        ? `0x${crypto.createHash('sha256').update(canonicalSubjectId, 'utf-8').digest('hex')}`
        : undefined;

    return NextResponse.json({
      success: true,
      updateData: {
        tokenId: String(tokenId),
        datasetUri: `ipfs://${storageResult.cid}`,
        datasetType: 'application/vc+jwt',
        payloadHash,
        subjectIdHash,
        ipfsCid: storageResult.cid,
        currentVersion,
        nextVersion,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to prepare passport update' },
      { status: 500 }
    );
  }
}
