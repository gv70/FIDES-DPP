import { NextRequest, NextResponse } from 'next/server';
import { createDppService } from '@/lib/factory/createDppService';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tokenId, verificationKey } = body || {};

    if (!tokenId) {
      return NextResponse.json({ error: 'Token ID is required' }, { status: 400 });
    }

    const contractAddress = process.env.CONTRACT_ADDRESS;
    const rpcUrl = process.env.POLKADOT_RPC_URL || process.env.RPC_URL;
    const ipfsNodeUrl = process.env.IPFS_NODE_URL;

    if (!contractAddress || !rpcUrl || !ipfsNodeUrl) {
      const missing = [];
      if (!contractAddress) missing.push('CONTRACT_ADDRESS');
      if (!rpcUrl) missing.push('POLKADOT_RPC_URL or RPC_URL');
      if (!ipfsNodeUrl) missing.push('IPFS_NODE_URL');

      return NextResponse.json(
        { error: 'Service not configured', message: `Missing required environment variables: ${missing.join(', ')}` },
        { status: 503 }
      );
    }

    const service = createDppService({
      ipfsBackend: (process.env.IPFS_BACKEND as any) || 'kubo',
      ipfsNodeUrl,
      ipfsGatewayUrl: process.env.IPFS_GATEWAY_URL,
      pinataJwt: process.env.PINATA_JWT,
      contractAddress,
      rpcUrl,
    });

    const exported = await (service as any).exportPassport(String(tokenId), {
      ...(verificationKey && { verificationKey: String(verificationKey) }),
    });

    return NextResponse.json({ success: true, export: exported });
  } catch (error: any) {
    const message = error?.message || 'Failed to export passport';
    const is404 = message.includes('not found') || message.includes('does not exist');
    return NextResponse.json({ success: false, error: message }, { status: is404 ? 404 : 500 });
  }
}

