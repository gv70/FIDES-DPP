/**
 * Product → issuer resolution helpers
 *
 * Used for governance decisions (e.g., DTE allowlists) where we need to
 * resolve the manufacturer/rEO for a productId.
 *
 * @license Apache-2.0
 */

import { DedotClient, WsProvider as DedotWsProvider } from 'dedot';
import { Contract } from 'dedot/contracts';
import { CONTRACT_ADDRESS as DEFAULT_CONTRACT_ADDRESS } from '../config';
import type { DppContractContractApi } from '../../contracts/types/dpp-contract';
import dppContractMetadata from '../../contracts/artifacts/dpp_contract/dpp_contract.json';
import { buildCanonicalSubjectId, lookupTokenIdByCanonicalSubjectId } from './lookup';

export async function resolveTokenIdForProductClass(productId: string): Promise<string | null> {
  const canonicalSubjectId = buildCanonicalSubjectId({ productId, granularity: 'ProductClass' });
  if (!canonicalSubjectId) return null;
  return lookupTokenIdByCanonicalSubjectId({ canonicalSubjectId });
}

export async function readIssuerH160ByTokenId(input: {
  tokenId: string;
  contractAddress?: string;
  rpcUrl?: string;
}): Promise<string | null> {
  const tokenId = String(input.tokenId || '').trim();
  if (!tokenId) return null;

  const contractAddress =
    input.contractAddress || process.env.CONTRACT_ADDRESS || DEFAULT_CONTRACT_ADDRESS;
  const rpcUrl =
    input.rpcUrl ||
    process.env.POLKADOT_RPC_URL ||
    process.env.RPC_URL ||
    process.env.CHAIN_RPC_URL ||
    'ws://localhost:9944';

  let client: DedotClient | undefined;

  try {
    const provider = new DedotWsProvider(rpcUrl);
    client = await DedotClient.new(provider);

    let abiJson: unknown = dppContractMetadata;
    if (process.env.CONTRACT_ABI_PATH) {
      try {
        const fs = require('fs');
        const path = require('path');
        const resolvedAbiPath = path.resolve(process.env.CONTRACT_ABI_PATH);
        abiJson = JSON.parse(fs.readFileSync(resolvedAbiPath, 'utf-8'));
      } catch {
        // Keep bundled ABI
      }
    }

    const contract = new Contract<DppContractContractApi>(
      client,
      abiJson as any,
      contractAddress as `0x${string}`
    );

    const result = await (contract as any).query.getPassport(BigInt(tokenId), {
      caller: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
    } as any);

    const passport = result?.data as any;
    if (!passport) return null;
    const issuer = passport?.issuer?.toString ? passport.issuer.toString() : String(passport.issuer || '');
    return issuer ? String(issuer) : null;
  } finally {
    try {
      await (client as any)?.disconnect?.();
    } catch {}
  }
}
