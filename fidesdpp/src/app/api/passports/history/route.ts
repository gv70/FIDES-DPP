import { NextRequest, NextResponse } from 'next/server';
import { createDppService } from '@/lib/factory/createDppService';
import { computeJwtHash } from '@/lib/ipfs/IpfsStorageBackend';

type HistoryEntry = {
  derivedVersion: number;
  vcVersion?: number;
  datasetUri: string;
  ipfsCid?: string;
  payloadHash?: string;
  previousDatasetUri?: string;
  previousPayloadHash?: string;
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tokenId = String(searchParams.get('tokenId') || '').trim();
    const maxDepthRaw = String(searchParams.get('maxDepth') || '').trim();
    const maxDepth = Math.min(Math.max(Number(maxDepthRaw || 10) || 10, 1), 50);

    if (!tokenId) {
      return NextResponse.json({ success: false, error: 'tokenId is required' }, { status: 400 });
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
        { success: false, error: `Missing required environment variables: ${missing.join(', ')}` },
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

    const onChain = await (service as any).readPassport(String(tokenId));
    const onChainVersion = Number(onChain?.version || 1) || 1;
    const headDatasetUri = String(onChain?.datasetUri || '');

    if (!headDatasetUri || !headDatasetUri.startsWith('ipfs://')) {
      return NextResponse.json(
        { success: false, error: 'On-chain datasetUri is missing or invalid' },
        { status: 400 }
      );
    }

    const loadEntry = async (datasetUri: string): Promise<HistoryEntry> => {
      const cid = datasetUri.startsWith('ipfs://') ? datasetUri.replace('ipfs://', '') : '';
      if (!cid) {
        return { derivedVersion: 0, datasetUri };
      }

      const jwt = (await (service as any).storage.retrieveText(cid)).data as string;
      const decoded = (service as any).vcEngine.decodeVc(jwt);

      const credentialSubject =
        decoded?.payload?.vc?.credentialSubject || decoded?.payload?.credentialSubject || null;
      const chainAnchor = credentialSubject?.chainAnchor || null;

      const vcVersion =
        typeof chainAnchor?.version === 'number' ? chainAnchor.version : undefined;
      const previousDatasetUri =
        typeof chainAnchor?.previousDatasetUri === 'string' ? chainAnchor.previousDatasetUri : undefined;
      const previousPayloadHash =
        typeof chainAnchor?.previousPayloadHash === 'string' ? chainAnchor.previousPayloadHash : undefined;

      return {
        derivedVersion: 0,
        vcVersion,
        datasetUri,
        ipfsCid: cid,
        payloadHash: computeJwtHash(jwt),
        previousDatasetUri,
        previousPayloadHash,
      };
    };

    const entries: HistoryEntry[] = [];
    const seen = new Set<string>();

    let currentUri: string | undefined = headDatasetUri;
    for (let i = 0; i < maxDepth && currentUri; i++) {
      if (seen.has(currentUri)) break;
      seen.add(currentUri);

      const entry = await loadEntry(currentUri);
      entries.push(entry);
      currentUri = entry.previousDatasetUri;
    }

    // Derive version numbers even if some VCs are missing chainAnchor.version.
    // We assume the head corresponds to the current on-chain version, and walk backwards.
    const normalized = entries.map((e, index) => {
      const derivedVersion = Math.max(onChainVersion - index, 1);
      return { ...e, derivedVersion };
    });

    return NextResponse.json({
      success: true,
      tokenId: String(tokenId),
      onChainVersion,
      history: normalized,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to build passport history' },
      { status: 500 }
    );
  }
}

