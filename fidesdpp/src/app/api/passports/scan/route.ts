import { NextRequest, NextResponse } from 'next/server';
import { createDppService } from '@/lib/factory/createDppService';
import { CONTRACT_ADDRESS } from '@/lib/config';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { startId, endId, rpcUrl, contractAddress } = body;

    if (startId === undefined || endId === undefined) {
      return NextResponse.json(
        { error: 'Start ID and End ID are required' },
        { status: 400 }
      );
    }

    const dppService = createDppService({
      contractAddress: contractAddress || CONTRACT_ADDRESS,
      rpcUrl:
        rpcUrl ||
        process.env.POLKADOT_RPC_URL ||
        process.env.RPC_URL ||
        process.env.CHAIN_RPC_URL ||
        'ws://localhost:9944',
    });

    const start = parseInt(startId, 10);
    const end = parseInt(endId, 10);
    const found: Array<{ tokenId: string; passport: any }> = [];

    // Scan token IDs
    for (let tokenId = start; tokenId <= end; tokenId++) {
      try {
        const passport = await dppService.readPassport(tokenId.toString());
        found.push({ tokenId: tokenId.toString(), passport });
      } catch (e: any) {
        // Passport doesn't exist, skip
        if (!e.message?.includes('not found')) {
          console.warn(`Error reading token ${tokenId}:`, e.message);
        }
      }
    }

    return NextResponse.json({ success: true, passports: found });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to scan passports' },
      { status: 500 }
    );
  }
}
