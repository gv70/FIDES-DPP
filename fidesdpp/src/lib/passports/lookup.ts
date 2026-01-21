/**
 * Passport lookup utilities (server-side)
 *
 * Resolves a passport tokenId from a canonical subject identifier by using the
 * on-chain `subject_id_hash` index (contract query: findTokenBySubjectId).
 *
 * Canonical subject identifier (must match issuance rules):
 * - ProductClass: productId
 * - Batch: productId + "#" + batchNumber
 * - Item: productId + "#" + serialNumber
 *
 * @license Apache-2.0
 */

import crypto from 'crypto';
import { DedotClient, WsProvider as DedotWsProvider } from 'dedot';
import { Contract } from 'dedot/contracts';
import { CONTRACT_ADDRESS as DEFAULT_CONTRACT_ADDRESS } from '../config';
import type { DppContractContractApi } from '../../contracts/types/dpp-contract';
import dppContractMetadata from '../../contracts/artifacts/dpp_contract/dpp_contract.json';

export type LookupGranularity = 'ProductClass' | 'Batch' | 'Item';

export function buildCanonicalSubjectId(input: {
  productId?: string;
  granularity?: LookupGranularity;
  batchNumber?: string;
  serialNumber?: string;
  canonicalSubjectId?: string;
}): string {
  const direct = String(input.canonicalSubjectId || '').trim();
  if (direct) return direct;

  const productId = String(input.productId || '').trim();
  if (!productId) return '';

  const granularity = (input.granularity || 'ProductClass') as LookupGranularity;
  if (granularity === 'ProductClass') return productId;

  if (granularity === 'Batch') {
    const batchNumber = String(input.batchNumber || '').trim();
    if (!batchNumber) return '';
    return `${productId}#${batchNumber}`;
  }

  if (granularity === 'Item') {
    const serialNumber = String(input.serialNumber || '').trim();
    if (!serialNumber) return '';
    return `${productId}#${serialNumber}`;
  }

  return '';
}

export function sha256Bytes32Utf8(text: string): Uint8Array {
  const hex = crypto.createHash('sha256').update(text, 'utf-8').digest('hex');
  const bytes = Buffer.from(hex, 'hex');
  if (bytes.length !== 32) {
    throw new Error(`Unexpected SHA-256 length: ${bytes.length} bytes`);
  }
  return new Uint8Array(bytes);
}

export function sha256Hex32Utf8(text: string): `0x${string}` {
  const hex = crypto.createHash('sha256').update(text, 'utf-8').digest('hex');
  const out = `0x${hex}` as const;
  if (out.length !== 66) {
    throw new Error(`Unexpected SHA-256 hex length: ${out.length} chars`);
  }
  return out;
}

export async function lookupTokenIdByCanonicalSubjectId(input: {
  canonicalSubjectId: string;
  contractAddress?: string;
  rpcUrl?: string;
}): Promise<string | null> {
  const canonicalSubjectId = String(input.canonicalSubjectId || '').trim();
  if (!canonicalSubjectId) return null;

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

    // Dedot expects FixedBytes<32> as a hex string "0x..." (see use-hybrid-passport).
    const subjectIdHash = sha256Hex32Utf8(canonicalSubjectId);
    const result = await (contract as any).query.findTokenBySubjectId(subjectIdHash as any, {
      caller: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY', // Alice
    } as any);

    const tokenId = result?.data != null ? String(result.data) : '';
    return tokenId ? tokenId : null;
  } finally {
    try {
      await (client as any)?.disconnect?.();
    } catch {}
  }
}
