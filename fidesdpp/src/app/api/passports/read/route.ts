import { NextRequest, NextResponse } from 'next/server';
import { createDppService } from '@/lib/factory/createDppService';
import { CONTRACT_ADDRESS } from '@/lib/config';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tokenId, rpcUrl, contractAddress } = body;

    if (!tokenId) {
      return NextResponse.json(
        { error: 'Token ID is required' },
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

    const passport = await dppService.readPassport(tokenId.toString());

    return NextResponse.json({ success: true, passport });
  } catch (error: any) {
    if (error.message?.includes('not found')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to read passport' },
      { status: 500 }
    );
  }
}
