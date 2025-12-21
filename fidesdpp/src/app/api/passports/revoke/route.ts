import { NextRequest, NextResponse } from 'next/server';
import { createDppService } from '@/lib/factory/createDppService';
import { CONTRACT_ADDRESS } from '@/lib/config';
import { loadPolkadotAccount } from '@/lib/vc/polkadot-account-loader';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tokenId, reason, rpcUrl, contractAddress, accountUri, keyType } = body;

    if (!tokenId) {
      return NextResponse.json(
        { error: 'Token ID is required' },
        { status: 400 }
      );
    }

    if (!accountUri) {
      return NextResponse.json(
        { error: 'Account URI is required' },
        { status: 400 }
      );
    }

    const dppService = createDppService({
      contractAddress: contractAddress || CONTRACT_ADDRESS,
      rpcUrl: rpcUrl || process.env.CHAIN_RPC_URL || 'ws://localhost:9944',
    });

    // Load account from URI
    const account = await loadPolkadotAccount(accountUri, keyType || 'ed25519');

    // Revoke passport
    const result = await dppService.revokePassport(
      tokenId.toString(),
      account,
      reason
    );

    return NextResponse.json({ 
      success: true, 
      txHash: result.txHash,
      blockNumber: result.blockNumber,
    });
  } catch (error: any) {
    console.error('Revoke passport error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to revoke passport' },
      { status: 500 }
    );
  }
}

