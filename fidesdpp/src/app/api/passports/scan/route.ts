import { NextRequest, NextResponse } from 'next/server';
import { createDppService } from '@/lib/factory/createDppService';
import { CONTRACT_ADDRESS } from '@/lib/config';
import { resolveProductIdFromDatasetUri } from '@/lib/passports/product-id';
import { createAnagraficaStorage } from '@/lib/anagrafica/createAnagraficaStorage';
import { AnagraficaService } from '@/lib/anagrafica/AnagraficaService';

async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  const queue = [...items];
  const workers = Array.from({ length: Math.max(1, limit) }).map(async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) return;
      await fn(item);
    }
  });
  await Promise.all(workers);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { startId, endId, rpcUrl, contractAddress, resolveProductId } = body;

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
    const found: Array<{ tokenId: string; passport: any; productId?: string }> = [];

    let anagraficaService: AnagraficaService | undefined;
    try {
      const anagraficaStorage = createAnagraficaStorage();
      anagraficaService = new AnagraficaService(anagraficaStorage);
    } catch {
      anagraficaService = undefined;
    }

    // Scan token IDs
    for (let tokenId = start; tokenId <= end; tokenId++) {
      try {
        const passport = await dppService.readPassport(tokenId.toString());
        let productId: string | undefined;
        if (anagraficaService) {
          try {
            const p = await anagraficaService.getStorage().getDppProduct(String(tokenId));
            productId = p?.productIdentifier || undefined;
          } catch {
            productId = undefined;
          }
        }
        found.push({ tokenId: tokenId.toString(), passport, productId });
      } catch (e: any) {
        // Passport doesn't exist, skip
        if (!e.message?.includes('not found')) {
          console.warn(`Error reading token ${tokenId}:`, e.message);
        }
      }
    }

    if (resolveProductId) {
      const missing = found.filter((it) => !it.productId && it?.passport?.datasetUri);
      if (missing.length > 0) {
        await mapWithConcurrency(missing, 5, async (it) => {
          const datasetUri = String(it?.passport?.datasetUri || '').trim();
          if (!datasetUri) return;
          const datasetType = String(it?.passport?.datasetType || '');
          const resolved = await resolveProductIdFromDatasetUri({ datasetUri, datasetType });
          if (resolved) it.productId = resolved;
        });
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
