/**
 * DPP VC fetch endpoint
 *
 * Serves the raw VC-JWT (application/vc+jwt) for a given on-chain tokenId.
 * This is used by the UNTP Identity Resolver linkset targets (untp:dpp).
 *
 * GET /api/passport/vc/<tokenId>
 *
 * @license Apache-2.0
 */

import { NextRequest, NextResponse } from 'next/server';
import { createDppService } from '@/lib/factory/createDppService';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ tokenId: string }> }
) {
  try {
    const { tokenId } = await context.params;
    if (!tokenId) {
      return NextResponse.json({ error: 'tokenId is required' }, { status: 400 });
    }

    const contractAddress = process.env.CONTRACT_ADDRESS;
    const rpcUrl = process.env.POLKADOT_RPC_URL || process.env.RPC_URL;

    const ipfsBackend = (process.env.IPFS_BACKEND as any) || 'kubo';
    const ipfsNodeUrl = process.env.IPFS_NODE_URL;
    const requiresIpfsNode = ipfsBackend === 'kubo';

    if (!contractAddress || !rpcUrl || (requiresIpfsNode && !ipfsNodeUrl)) {
      return NextResponse.json(
        {
          error: 'Service not configured',
          details: {
            contractAddress: contractAddress ? '✓' : '✗',
            rpcUrl: rpcUrl ? '✓' : '✗',
            ipfsNodeUrl: requiresIpfsNode ? (ipfsNodeUrl ? '✓' : '✗') : 'n/a',
          },
        },
        { status: 503 }
      );
    }

    const service = createDppService({
      ipfsBackend,
      ipfsNodeUrl,
      ipfsGatewayUrl: process.env.IPFS_GATEWAY_URL,
      pinataJwt: process.env.PINATA_JWT,
      contractAddress,
      rpcUrl,
    });

    const onChain = await service.readPassport(String(tokenId));
    const datasetUri = String((onChain as any)?.datasetUri || '');
    if (!datasetUri.startsWith('ipfs://')) {
      return NextResponse.json({ error: 'Missing datasetUri for tokenId' }, { status: 404 });
    }

    const cid = datasetUri.replace('ipfs://', '');
    const jwt = await (service as any).storage.retrieveText(cid);

    return new NextResponse(jwt.data, {
      status: 200,
      headers: {
        'Content-Type': 'application/vc+jwt; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error: any) {
    console.error('DPP VC fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch DPP VC', message: error.message || 'Unknown error' },
      { status: 500 }
    );
  }
}

