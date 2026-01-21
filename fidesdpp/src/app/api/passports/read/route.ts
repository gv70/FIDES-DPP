import { NextRequest, NextResponse } from 'next/server';
import { createDppService } from '@/lib/factory/createDppService';
import { CONTRACT_ADDRESS } from '@/lib/config';
import { resolveProductIdFromDatasetUri } from '@/lib/passports/product-id';
import { createAnagraficaStorage } from '@/lib/anagrafica/createAnagraficaStorage';
import { AnagraficaService } from '@/lib/anagrafica/AnagraficaService';

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

    let productId: string | undefined;
    try {
      const anagraficaStorage = createAnagraficaStorage();
      const anagraficaService = new AnagraficaService(anagraficaStorage);
      const product = await anagraficaService.getStorage().getDppProduct(String(tokenId));
      productId = product?.productIdentifier || undefined;
    } catch {
      productId = undefined;
    }

    if (!productId && passport?.datasetUri) {
      const datasetUri = String(passport.datasetUri || '').trim();
      const datasetType = String(passport.datasetType || '');
      productId = await resolveProductIdFromDatasetUri({ datasetUri, datasetType });
    }

    return NextResponse.json({ success: true, passport, productId });
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
