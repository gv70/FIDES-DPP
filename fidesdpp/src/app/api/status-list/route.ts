import { NextRequest, NextResponse } from 'next/server';
import { createStatusListStorage } from '@/lib/storage/createStorageBackend';
import { createIpfsBackend } from '@/lib/ipfs/IpfsStorageFactory';

export async function GET(request: NextRequest) {
  const issuer = request.nextUrl.searchParams.get('issuer')?.trim();
  if (!issuer) {
    return NextResponse.json({ error: 'Missing issuer parameter' }, { status: 400 });
  }

  const statusListStorage = createStatusListStorage();
  const ipfsBackend = createIpfsBackend({
    backend: (process.env.IPFS_BACKEND as any) || 'kubo',
    nodeUrl: process.env.IPFS_NODE_URL,
    gatewayUrl: process.env.IPFS_GATEWAY_URL,
    accessToken: process.env.PINATA_JWT,
  });

  const cid = await statusListStorage.getCurrentStatusListCid(issuer);
  if (!cid) {
    return NextResponse.json({ error: 'Status list not found' }, { status: 404 });
  }

  const statusListVc = await ipfsBackend.retrieveText(cid);
  const json = JSON.parse(statusListVc.data);

  return NextResponse.json(json, {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}

