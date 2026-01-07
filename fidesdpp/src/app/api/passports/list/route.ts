import { NextRequest, NextResponse } from 'next/server';
import { DedotClient, WsProvider as DedotWsProvider } from 'dedot';
import { Contract } from 'dedot/contracts';
import { CONTRACT_ADDRESS as DEFAULT_CONTRACT_ADDRESS } from '@/lib/config';
import type { DppContractContractApi } from '@/contracts/types/dpp-contract';
import type { FixedBytes } from 'dedot/codecs';
import dppContractMetadata from '@/contracts/artifacts/dpp_contract/dpp_contract.json';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const DEFAULT_CALLER = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY'; // Alice

function clampInt(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function toHex(bytes: FixedBytes<32> | Uint8Array | string | unknown): string {
  if (typeof bytes === 'string') {
    const v = bytes.trim();
    if (!v) return '0x';
    return v.startsWith('0x') ? v : `0x${v}`;
  }

  if (bytes instanceof Uint8Array) {
    return `0x${Buffer.from(bytes).toString('hex')}`;
  }

  if (Array.isArray(bytes)) {
    return `0x${Buffer.from(Uint8Array.from(bytes as any)).toString('hex')}`;
  }

  try {
    const u8 = new Uint8Array(bytes as any);
    return `0x${Buffer.from(u8).toString('hex')}`;
  } catch {
    return '0x';
  }
}

export async function GET(request: NextRequest) {
  let client: DedotClient | undefined;

  try {
    const { searchParams } = new URL(request.url);
    const offset = clampInt(searchParams.get('offset'), 0, 0, Number.MAX_SAFE_INTEGER);
    const limit = clampInt(searchParams.get('limit'), DEFAULT_LIMIT, 1, MAX_LIMIT);

    const contractAddress = searchParams.get('contractAddress') || process.env.CONTRACT_ADDRESS || DEFAULT_CONTRACT_ADDRESS;
    const rpcUrl =
      searchParams.get('rpcUrl') ||
      process.env.POLKADOT_RPC_URL ||
      process.env.RPC_URL ||
      process.env.CHAIN_RPC_URL ||
      'ws://localhost:9944';

    if (!contractAddress) {
      return NextResponse.json({ success: false, error: 'Contract address not configured' }, { status: 503 });
    }

    const provider = new DedotWsProvider(rpcUrl);
    client = await DedotClient.new(provider);

    let abiJson: unknown = dppContractMetadata;
    if (process.env.CONTRACT_ABI_PATH) {
      try {
        const fs = require('fs');
        const path = require('path');
        const resolvedAbiPath = path.resolve(process.env.CONTRACT_ABI_PATH);
        abiJson = JSON.parse(fs.readFileSync(resolvedAbiPath, 'utf-8'));
      } catch (error) {
        console.warn('Failed to load CONTRACT_ABI_PATH, using bundled ABI instead.');
      }
    }

    const contract = new Contract<DppContractContractApi>(
      client,
      abiJson as any,
      contractAddress as `0x${string}`
    );

    const nextTokenIdResult = await contract.query.nextTokenId({
      caller: DEFAULT_CALLER,
    });

    const nextTokenId = Number(nextTokenIdResult.data || 0);
    const total = Math.max(0, nextTokenId);

    const start = Math.min(offset, total);
    const endExclusive = Math.min(start + limit, total);

    const items: Array<{ tokenId: string; passport: any }> = [];

    for (let token = start; token < endExclusive; token++) {
      const tokenId = String(token);
      const ownerResult = await (contract as any).query.ownerOf(BigInt(token), {
        caller: DEFAULT_CALLER,
      });
      const owner = ownerResult?.data ? String(ownerResult.data) : undefined;

      const result = await contract.query.getPassport(BigInt(token), {
        caller: DEFAULT_CALLER,
      });
      const passport = result.data;
      if (!passport) continue;

      items.push({
        tokenId,
        passport: {
          tokenId,
          owner,
          issuer: passport.issuer.toString(),
          datasetUri: passport.datasetUri,
          payloadHash: toHex(passport.payloadHash),
          datasetType: passport.datasetType,
          granularity: passport.granularity,
          subjectIdHash: passport.subjectIdHash ? toHex(passport.subjectIdHash) : undefined,
          status: passport.status,
          version: passport.version,
          createdAt: passport.createdAt,
          updatedAt: passport.updatedAt,
        },
      });
    }

    return NextResponse.json({
      success: true,
      contractAddress,
      rpcUrl,
      pagination: {
        offset: start,
        limit,
        total,
      },
      items,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Failed to list passports',
      },
      { status: 500 }
    );
  } finally {
    // Dedot disconnect is optional; keep best-effort cleanup without crashing.
    try {
      await (client as any)?.disconnect?.();
    } catch {}
  }
}
