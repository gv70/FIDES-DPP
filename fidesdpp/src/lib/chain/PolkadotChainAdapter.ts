/**
 * Polkadot Chain Adapter for v0.2 Contract
 * 
 * Implements ChainAdapter interface for ink! v0.2 minimal anchor contract.
 * 
 * @license Apache-2.0
 */

import { ApiPromise, WsProvider } from '@polkadot/api';
import { ContractPromise } from '@polkadot/api-contract';
import type { WeightV2 } from '@polkadot/types/interfaces';
import { DedotClient, WsProvider as DedotWsProvider } from 'dedot';
import { Contract } from 'dedot/contracts';
import { decodeAddress, keccakAsU8a } from '@polkadot/util-crypto';
import { u8aToHex } from '@polkadot/util';
import type { DppContractContractApi } from '../../contracts/types/dpp-contract';
import type { DppContractDppContractV2PassportRecord } from '../../contracts/types/dpp-contract/types';
import type { 
  ChainAdapter, 
  PassportRegistration, 
  RegisterResult, 
  OnChainPassport,
  TransactionResult,
  PassportStatus,
  Granularity,
  ContractEventType,
  ContractEvent,
  Unsubscribe,
} from './ChainAdapter';
import type { PolkadotAccount } from '../vc/types';

export interface PolkadotChainAdapterConfig {
  rpcUrl: string;
  contractAddress: string;
  abiPath?: string;
  abiJson?: unknown;
}

export class PolkadotChainAdapter implements ChainAdapter {
  // Dedot client and contract for readPassport() (works on Asset Hub)
  private dedotClient?: DedotClient;
  private dedotContract?: Contract<DppContractContractApi>;
  
  // Polkadot.js API and contract for other methods (registerPassport, updateDataset, etc.)
  private api?: ApiPromise;
  private contract?: ContractPromise;
  
  constructor(private config: PolkadotChainAdapterConfig) {}
  
  /**
   * Ensure API and contract are connected (for @polkadot/api-contract methods)
   */
  private async ensureConnected(): Promise<void> {
    if (this.api && this.contract) return;
    
    // Connect to RPC
    const provider = new WsProvider(this.config.rpcUrl);
    this.api = await ApiPromise.create({ provider });
    
    // Load ABI
    const abiJson = this.loadAbiJson();
    
    // Create contract instance
    this.contract = new ContractPromise(
      this.api,
      abiJson as any,
      this.config.contractAddress
    );
  }

  /**
   * Ensure Dedot client and contract are connected (for readPassport method)
   * 
   * Uses Dedot instead of @polkadot/api-contract to support Asset Hub's reviveApi
   */
  private async ensureDedotConnected(): Promise<void> {
    if (this.dedotClient && this.dedotContract) return;
    
    // Connect to RPC using Dedot
    const provider = new DedotWsProvider(this.config.rpcUrl);
    this.dedotClient = await DedotClient.new(provider);
    
    // Load contract metadata (same file as ABI)
    const abiJson = this.loadAbiJson();
    
    // Create typed contract instance
    this.dedotContract = new Contract<DppContractContractApi>(
      this.dedotClient,
      abiJson as any,
      this.config.contractAddress as `0x${string}`
    );
  }

  private loadAbiJson(): unknown {
    if (this.config.abiJson) {
      return this.config.abiJson;
    }

    if (!this.config.abiPath) {
      throw new Error('Contract ABI not configured (abiPath or abiJson required).');
    }

    const fs = require('fs');
    const path = require('path');
    const abiPath = path.resolve(this.config.abiPath);
    return JSON.parse(fs.readFileSync(abiPath, 'utf-8'));
  }
  
  /**
   * Register a new passport on-chain
   */
  async registerPassport(
    registration: PassportRegistration,
    signerAccount: PolkadotAccount
  ): Promise<RegisterResult> {
    await this.ensureConnected();
    
    // Convert hex hash to Uint8Array[32]
    console.log(`[PolkadotChainAdapter] registerPassport - payloadHash: ${registration.payloadHash}, length: ${registration.payloadHash?.length}`);
    console.log(`[PolkadotChainAdapter] registerPassport - subjectIdHash: ${registration.subjectIdHash}, length: ${registration.subjectIdHash?.length}`);
    const payloadHashBytes = this.hexToBytes32(registration.payloadHash);
    console.log(`[PolkadotChainAdapter] registerPassport - payloadHashBytes length: ${payloadHashBytes.length} bytes`);
    
    // Optional: hash subject ID if provided
    const subjectIdHashBytes = registration.subjectIdHash 
      ? this.hexToBytes32(registration.subjectIdHash)
      : null;
    
    // Map TypeScript granularity to contract enum
    const granularityVariant = this.mapGranularityToContract(registration.granularity);
    
    // Convert strings to UTF-8 bytes (Polkadot.js expects Vec<u8> for String types in ink! contracts)
    const datasetUriBytes = new TextEncoder().encode(registration.datasetUri);
    const datasetTypeBytes = new TextEncoder().encode(registration.datasetType);
    
    console.log(`[PolkadotChainAdapter] registerPassport - datasetUri: "${registration.datasetUri}" (${datasetUriBytes.length} bytes)`);
    console.log(`[PolkadotChainAdapter] registerPassport - datasetType: "${registration.datasetType}" (${datasetTypeBytes.length} bytes)`);
    console.log(`[PolkadotChainAdapter] registerPassport - granularityVariant:`, granularityVariant);
    console.log(`[PolkadotChainAdapter] registerPassport - subjectIdHashBytes:`, subjectIdHashBytes ? `${subjectIdHashBytes.length} bytes` : 'null');
    
    // Set gas limit
    const gasLimit = this.api!.registry.createType('WeightV2', {
      refTime: 3_000_000_000,
      proofSize: 200_000,
    }) as WeightV2;
    
    console.log(`[PolkadotChainAdapter] registerPassport params`, {
      datasetUri: registration.datasetUri,
      datasetType: registration.datasetType,
      granularity: registration.granularity,
      payloadHash: this.toHex(payloadHashBytes),
      hasSubjectIdHash: Boolean(subjectIdHashBytes),
    });
    
    // Create transaction
    // Options go FIRST, then parameters
    // Pass [u8;32] as Uint8Array for required parameter (works correctly)
    // For Option<[u8;32]>, Polkadot.js may need a plain number[] array instead of Uint8Array
    const payloadHashBytesClean = new Uint8Array(Array.from(payloadHashBytes));
    const subjectIdHashArray = subjectIdHashBytes ? Array.from(subjectIdHashBytes) : null;
    
    console.log(`[PolkadotChainAdapter] After cleaning - payloadHashBytesClean.length: ${payloadHashBytesClean.length}`);
    console.log(`[PolkadotChainAdapter] After cleaning - subjectIdHashArray: ${subjectIdHashArray ? `[${subjectIdHashArray.length} items]` : 'null'}`);
    if (subjectIdHashArray) {
      console.log(`[PolkadotChainAdapter]   subjectIdHashArray first 4: [${subjectIdHashArray.slice(0, 4).join(',')}], last 4: [${subjectIdHashArray.slice(-4).join(',')}]`);
    }
    
    // Estimate required storage deposit and set a limit accordingly.
    // Some chains (revive/contracts) may treat an absent/too-low limit as 0 and fail with
    // `StorageDepositLimitExhausted`, so we try to set a sane default automatically.
    let storageDepositLimit: any = null;
    try {
      const dryRun = await (this.contract as any)!.query.registerPassport(
        signerAccount.address,
        { gasLimit, storageDepositLimit: null },
        registration.datasetUri,
        payloadHashBytesClean,
        registration.datasetType,
        granularityVariant,
        subjectIdHashArray
      );
      const sd = dryRun?.storageDeposit;
      if (sd?.isCharge) {
        storageDepositLimit = sd.asCharge;
      }
    } catch (e) {
      // Best-effort only; fall back to null.
    }

    const tx = this.contract!.tx.registerPassport(
      { gasLimit, storageDepositLimit },
      registration.datasetUri,
      payloadHashBytesClean,  // Uint8Array[32] for required [u8;32]
      registration.datasetType,
      granularityVariant,
      subjectIdHashArray,  // number[] for Option<[u8;32]> - Polkadot.js may prefer this format
    );
    
    // Sign and send
    return new Promise<RegisterResult>((resolve, reject) => {
      const pair = (signerAccount as any)?.pair;
      const send = pair
        ? tx.signAndSend(pair, async (result: any) => {
            const { status, events, dispatchError } = result || {};
            if (status.isInBlock) {
              if (dispatchError) {
                if (dispatchError.isModule) {
                  const decoded = this.api!.registry.findMetaError(dispatchError.asModule);
                  reject(new Error(`Transaction failed: ${decoded.section}.${decoded.name}: ${decoded.docs}`));
                } else {
                  reject(new Error(`Transaction failed: ${dispatchError.toString()}`));
                }
                return;
              }

              // Parse PassportRegistered event
              let tokenId: string | undefined;

              for (const { event } of events || []) {
                if (event.section === 'contracts' && event.method === 'ContractEmitted') {
                  const decoded = this.contract!.abi.decodeEvent(event.data[1] as any);
                  if (decoded.event.identifier === 'PassportRegistered') {
                    tokenId = decoded.args[0].toString();
                    break;
                  }
                }
              }

              if (!tokenId) {
                // Fallback: infer tokenId from `nextTokenId` (contract counter).
                // This is more robust across runtimes where event decoding is flaky.
                try {
                  tokenId = await this.inferLatestTokenIdFromNextTokenId(signerAccount.address);
                  console.warn(`[PolkadotChainAdapter] PassportRegistered event not decoded; inferred tokenId=${tokenId}`);
                } catch (e: any) {
                  reject(new Error('PassportRegistered event not found'));
                  return;
                }
              }

              const blockNumber = await this.api!.query.system.number();

              resolve({
                tokenId,
                txHash: status.asInBlock.toHex(),
                blockNumber: Number(blockNumber.toString()),
              });
            }
          })
        : tx.signAndSend(
            signerAccount.address,
            { signer: this.createSigner(signerAccount) },
            async ({ status, events, dispatchError }) => {
              if (status.isInBlock) {
                if (dispatchError) {
                  if (dispatchError.isModule) {
                    const decoded = this.api!.registry.findMetaError(dispatchError.asModule);
                    reject(new Error(`Transaction failed: ${decoded.section}.${decoded.name}: ${decoded.docs}`));
                  } else {
                    reject(new Error(`Transaction failed: ${dispatchError.toString()}`));
                  }
                  return;
                }

                // Parse PassportRegistered event
                let tokenId: string | undefined;

                for (const { event } of events) {
                  if (event.section === 'contracts' && event.method === 'ContractEmitted') {
                    const decoded = this.contract!.abi.decodeEvent(event.data[1] as any);
                    if (decoded.event.identifier === 'PassportRegistered') {
                      tokenId = decoded.args[0].toString();
                      break;
                    }
                  }
                }

                if (!tokenId) {
                  try {
                    tokenId = await this.inferLatestTokenIdFromNextTokenId(signerAccount.address);
                    console.warn(`[PolkadotChainAdapter] PassportRegistered event not decoded; inferred tokenId=${tokenId}`);
                  } catch (e: any) {
                    reject(new Error('PassportRegistered event not found'));
                    return;
                  }
                }

                const blockNumber = await this.api!.query.system.number();

                resolve({
                  tokenId,
                  txHash: status.asInBlock.toHex(),
                  blockNumber: Number(blockNumber.toString()),
                });
              }
            }
          );

      Promise.resolve(send).catch(reject);
    });
  }

  private async inferLatestTokenIdFromNextTokenId(caller: string): Promise<string> {
    await this.ensureDedotConnected();
    const result = await this.dedotContract!.query.nextTokenId({
      caller,
    });
    const nextTokenId = BigInt(result.data || 0);
    if (nextTokenId <= 0n) {
      throw new Error('nextTokenId is 0');
    }
    return String(nextTokenId - 1n);
  }
  
  /**
   * Read passport data from chain
   * 
   * Uses Dedot for contract queries (works on Asset Hub with reviveApi).
   * The contract returns Option<PassportRecord>:
   * - None if token_id doesn't exist
   * - Some(PassportRecord) if found
   */
  async readPassport(tokenId: string): Promise<OnChainPassport> {
    // Use Dedot instead of @polkadot/api-contract (works on Asset Hub)
    await this.ensureDedotConnected();
    
    // Use zero address (Alice) as caller for queries (standard practice)
    const zeroAddress = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY'; // Alice
    
    // Query contract using Dedot
    // With typed Contract, result.data is already Option<PassportRecord> = PassportRecord | undefined
    const result = await this.dedotContract!.query.getPassport(BigInt(tokenId), {
      caller: zeroAddress,
    });
    
    // result.data is already Option<PassportRecord> = PassportRecord | undefined
    // No need to unwrap Ok/Some - Dedot handles it automatically
    const passport: DppContractDppContractV2PassportRecord | undefined = result.data;
    
    if (!passport) {
      throw new Error(`Passport ${tokenId} not found`);
    }
    
    // Convert Dedot types to OnChainPassport format
    // Use correct field names from generated types
    const issuer = passport.issuer.toString(); // H160 -> string
    const datasetUri = passport.datasetUri; // string
    const payloadHash = this.toHex(passport.payloadHash); // FixedBytes<32> -> hex string
    const datasetType = passport.datasetType; // string
    const granularity = this.mapGranularityFromContract(passport.granularity); // enum -> Granularity
    const subjectIdHash = passport.subjectIdHash ? this.toHex(passport.subjectIdHash) : undefined; // FixedBytes<32> | undefined -> hex | undefined
    const status = this.mapStatus(passport.status); // enum -> PassportStatus
    const version = passport.version; // number
    const createdAt = passport.createdAt; // number
    const updatedAt = passport.updatedAt; // number
    
    // Build OnChainPassport
    return {
      tokenId,
      issuer,
      datasetUri,
      payloadHash,
      datasetType,
      granularity,
      subjectIdHash,
      status,
      version,
      createdAt,
      updatedAt,
    };
  }
  
  /**
   * Update dataset URI (after uploading new version to IPFS)
   * 
   * NOTE: Granularity is IMMUTABLE after registration.
   * This method only updates dataset_uri, payload_hash, dataset_type, and subject_id_hash.
   */
  async updateDataset(
    tokenId: string,
    datasetUri: string,
    payloadHash: string,
    datasetType: string,
    subjectIdHash: string | undefined,
    signerAccount: PolkadotAccount
  ): Promise<TransactionResult> {
    await this.ensureConnected();
    
    // Convert hex hash to Uint8Array[32]
    const payloadHashBytes = this.hexToBytes32(payloadHash);
    
    // Convert subjectIdHash (hex or undefined) to Option<[u8;32]>
    const subjectIdHashBytes = subjectIdHash 
      ? this.hexToBytes32(subjectIdHash)
      : null; // null maps to None in ContractPromise
    
    const gasLimit = this.api!.registry.createType('WeightV2', {
      refTime: 2_000_000_000,
      proofSize: 150_000,
    }) as WeightV2;
    
    // Call contract: update_dataset(token_id, dataset_uri, payload_hash, dataset_type, subject_id_hash)
    // Options go FIRST, then parameters
    // Pass [u8;32] as Uint8Array for required parameter
    // For Option<[u8;32]>, Polkadot.js may need a plain number[] array instead of Uint8Array
    const payloadHashBytesClean = new Uint8Array(Array.from(payloadHashBytes));
    const subjectIdHashArray = subjectIdHashBytes ? Array.from(subjectIdHashBytes) : null;
    
    let storageDepositLimit: any = null;
    try {
      const dryRun = await (this.contract as any)!.query.updateDataset(
        signerAccount.address,
        { gasLimit, storageDepositLimit: null },
        tokenId,
        datasetUri,
        payloadHashBytesClean,
        datasetType,
        subjectIdHashArray
      );
      const sd = dryRun?.storageDeposit;
      if (sd?.isCharge) {
        storageDepositLimit = sd.asCharge;
      }
    } catch (e) {
      // Best-effort only; fall back to null.
    }

    const tx = this.contract!.tx.updateDataset(
      { gasLimit, storageDepositLimit },
      tokenId,          // u128
      datasetUri,       // String
      payloadHashBytesClean, // [u8;32] as Uint8Array
      datasetType,      // String
      subjectIdHashArray, // number[] for Option<[u8;32]> - Polkadot.js may prefer this format
    );
    
    return new Promise<TransactionResult>((resolve, reject) => {
      const pair = (signerAccount as any)?.pair;
      const send = pair
        ? tx.signAndSend(pair, async (result: any) => {
            const { status, dispatchError } = result || {};
            if (status.isInBlock) {
              if (dispatchError) {
                if (dispatchError.isModule) {
                  const decoded = this.api!.registry.findMetaError(dispatchError.asModule);
                  reject(new Error(`Update failed: ${decoded.section}.${decoded.name}: ${decoded.docs}`));
                } else {
                  reject(new Error(`Update failed: ${dispatchError.toString()}`));
                }
                return;
              }

              const blockNumber = await this.api!.query.system.number();

              resolve({
                txHash: status.asInBlock.toHex(),
                blockNumber: Number(blockNumber.toString()),
              });
            }
          })
        : tx.signAndSend(
            signerAccount.address,
            { signer: this.createSigner(signerAccount) },
            async ({ status, dispatchError }) => {
              if (status.isInBlock) {
                if (dispatchError) {
                  if (dispatchError.isModule) {
                    const decoded = this.api!.registry.findMetaError(dispatchError.asModule);
                    reject(new Error(`Update failed: ${decoded.section}.${decoded.name}: ${decoded.docs}`));
                  } else {
                    reject(new Error(`Update failed: ${dispatchError.toString()}`));
                  }
                  return;
                }

                const blockNumber = await this.api!.query.system.number();

                resolve({
                  txHash: status.asInBlock.toHex(),
                  blockNumber: Number(blockNumber.toString()),
                });
              }
            }
          );

      Promise.resolve(send).catch(reject);
    });
  }
  
  /**
   * Revoke a passport
   */
  async revokePassport(
    tokenId: string,
    reason: string | undefined,
    signerAccount: PolkadotAccount
  ): Promise<TransactionResult> {
    await this.ensureConnected();
    
    const gasLimit = this.api!.registry.createType('WeightV2', {
      refTime: 2_000_000_000,
      proofSize: 150_000,
    }) as WeightV2;
    
    const tx = this.contract!.tx.revokePassport(
      { gasLimit, storageDepositLimit: null },
      tokenId,
      reason || null
    );
    
    return new Promise<TransactionResult>((resolve, reject) => {
      const pair = (signerAccount as any)?.pair;
      const send = pair
        ? tx.signAndSend(pair, async (result: any) => {
            const { status, dispatchError } = result || {};
            if (status.isInBlock) {
              if (dispatchError) {
                if (dispatchError.isModule) {
                  const decoded = this.api!.registry.findMetaError(dispatchError.asModule);
                  reject(new Error(`Revoke failed: ${decoded.section}.${decoded.name}: ${decoded.docs}`));
                } else {
                  reject(new Error(`Revoke failed: ${dispatchError.toString()}`));
                }
                return;
              }

              const blockNumber = await this.api!.query.system.number();

              resolve({
                txHash: status.asInBlock.toHex(),
                blockNumber: Number(blockNumber.toString()),
              });
            }
          })
        : tx.signAndSend(
            signerAccount.address,
            { signer: this.createSigner(signerAccount) },
            async ({ status, dispatchError }) => {
              if (status.isInBlock) {
                if (dispatchError) {
                  if (dispatchError.isModule) {
                    const decoded = this.api!.registry.findMetaError(dispatchError.asModule);
                    reject(new Error(`Revoke failed: ${decoded.section}.${decoded.name}: ${decoded.docs}`));
                  } else {
                    reject(new Error(`Revoke failed: ${dispatchError.toString()}`));
                  }
                  return;
                }

                const blockNumber = await this.api!.query.system.number();

                resolve({
                  txHash: status.asInBlock.toHex(),
                  blockNumber: Number(blockNumber.toString()),
                });
              }
            }
          );

      Promise.resolve(send).catch(reject);
    });
  }

  /**
   * Transfer custody (ownership) of a passport token.
   *
   * Note: this is an NFT-like ownership transfer and does not change issuer authority.
   */
  async transferPassport(
    tokenId: string,
    to: string,
    signerAccount: PolkadotAccount
  ): Promise<TransactionResult> {
    await this.ensureConnected();

    const tokenIdBigInt = BigInt(tokenId);
    const destination = this.toH160(to);
    const callerH160 = this.toH160(signerAccount.address);

    const gasLimit = this.api!.registry.createType('WeightV2', {
      refTime: 2_000_000_000,
      proofSize: 150_000,
    }) as WeightV2;

    // Best-effort: verify owner (more helpful error before paying fees)
    try {
      const ownerResult = await (this.contract as any)!.query.ownerOf(
        signerAccount.address,
        { gasLimit, storageDepositLimit: null },
        tokenIdBigInt
      );

      const output = ownerResult?.output;
      let owner: string | null = null;

      // Polkadot.js contract query output can be wrapped in Result/Option-like shapes.
      // Try to unwrap common patterns without relying on a specific codec type.
      if (typeof output === 'string') {
        owner = output;
      } else if (output && typeof output === 'object') {
        // Prefer toJSON() output when available (Codec wrappers)
        if (typeof (output as any).toJSON === 'function') {
          const json = (output as any).toJSON();
          if (json && typeof json === 'string') owner = json;
          if (json && typeof json === 'object') {
            if ('ok' in json && (json as any).ok) owner = String((json as any).ok);
            if ('Ok' in json && (json as any).Ok) owner = String((json as any).Ok);
          }
        }
        // ink! Result: { ok: <value> } / { err: ... }
        if ('ok' in output && (output as any).ok) owner = String((output as any).ok);
        if ('Ok' in output && (output as any).Ok) owner = String((output as any).Ok);
        // Option: { isSome, unwrap() }
        if (!owner && (output as any).isSome && typeof (output as any).unwrap === 'function') {
          owner = String((output as any).unwrap());
        }
        // Last resort
        if (!owner) owner = JSON.stringify(output);
      }

      const ownerLower = typeof owner === 'string' ? owner.toLowerCase() : '';
      const parsedOwner =
        /^0x[0-9a-f]{40}$/.test(ownerLower)
          ? ownerLower
          : /^0x[0-9a-f]{40}$/.test(ownerLower.replace(/^"|"$/g, ''))
            ? ownerLower.replace(/^"|"$/g, '')
            : null;

      // If we can't parse an H160 owner, don't block: let the contract enforce ownership.
      if (parsedOwner && parsedOwner !== callerH160.toLowerCase()) {
        throw new Error(`Only the token owner can transfer this passport. Owner: ${parsedOwner}`);
      }
    } catch (e: any) {
      throw new Error(e?.message || 'Ownership check failed');
    }

    // Some runtimes may require a storage deposit limit even for simple calls.
    // Also, dry-run gives us a better error message than a generic "ContractReverted".
    let storageDepositLimit: any = null;
    try {
      const dryRun = await (this.contract as any)!.query.transfer(
        signerAccount.address,
        { gasLimit, storageDepositLimit: null },
        destination,
        tokenIdBigInt
      );

      const result = dryRun?.result;
      const output = dryRun?.output;

      // Detect revert flags (revive/contracts returns Ok with a "revert" flag set).
      const flags =
        (result as any)?.asOk?.flags ??
        (result as any)?.ok?.flags ??
        (result as any)?.flags;
      const flagsBits =
        (flags as any)?.bits?.toNumber?.() ??
        (flags as any)?.bits?.toBn?.()?.toNumber?.() ??
        (flags as any)?.bits ??
        undefined;
      const isRevert =
        Boolean((flags as any)?.isRevert) ||
        (typeof flagsBits === 'number' ? (flagsBits & 1) === 1 : false);

      // Unwrap common ink! output shapes for Result.
      const outputJson =
        output && typeof (output as any).toJSON === 'function'
          ? (output as any).toJSON()
          : output;

      const contractErr =
        (outputJson && typeof outputJson === 'object' && (
          // ink! Result: { Ok: { Err: ... } } / { ok: { err: ... } }
          (('Ok' in (outputJson as any)) && (outputJson as any).Ok && typeof (outputJson as any).Ok === 'object' && ('Err' in (outputJson as any).Ok)) ||
          (('ok' in (outputJson as any)) && (outputJson as any).ok && typeof (outputJson as any).ok === 'object' && ('err' in (outputJson as any).ok))
        ))
          ? (
              ('Ok' in (outputJson as any) && (outputJson as any).Ok?.Err)
                ? (outputJson as any).Ok.Err
                : (outputJson as any).ok?.err
            )
          : null;

      if ((result as any)?.isErr) {
        const err = (result as any)?.asErr?.toString?.() ?? String((result as any)?.asErr ?? result);
        throw new Error(`Transfer dry-run failed: ${err}`);
      }

      if (isRevert) {
        const detail = contractErr ? String(contractErr) : (outputJson ? JSON.stringify(outputJson) : 'unknown');
        throw new Error(`Transfer reverted (dry-run): ${detail}`);
      }

      if (contractErr) {
        throw new Error(`Transfer rejected: ${String(contractErr)}`);
      }

      const sd = dryRun?.storageDeposit;
      if (sd?.isCharge) {
        storageDepositLimit = sd.asCharge;
      }
    } catch (e: any) {
      throw new Error(e?.message || 'Transfer dry-run failed');
    }

    const tx = (this.contract as any)!.tx.transfer(
      { gasLimit, storageDepositLimit },
      destination,
      tokenIdBigInt
    );

    return new Promise<TransactionResult>((resolve, reject) => {
      const pair = (signerAccount as any)?.pair;
      const send = pair
        ? tx.signAndSend(pair, async (result: any) => {
            const { status, dispatchError } = result || {};
            if (status?.isInBlock) {
              if (dispatchError) {
                if (dispatchError.isModule) {
                  const decoded = this.api!.registry.findMetaError(dispatchError.asModule);
                  reject(new Error(`Transfer failed: ${decoded.section}.${decoded.name}: ${decoded.docs}`));
                } else {
                  reject(new Error(`Transfer failed: ${dispatchError.toString()}`));
                }
                return;
              }

              const blockNumber = await this.api!.query.system.number();

              resolve({
                txHash: status.asInBlock.toHex(),
                blockNumber: Number(blockNumber.toString()),
              });
            }
          })
        : tx.signAndSend(
            signerAccount.address,
            { signer: this.createSigner(signerAccount) },
            async ({ status, dispatchError }: any) => {
              if (status?.isInBlock) {
                if (dispatchError) {
                  if (dispatchError.isModule) {
                    const decoded = this.api!.registry.findMetaError(dispatchError.asModule);
                    reject(new Error(`Transfer failed: ${decoded.section}.${decoded.name}: ${decoded.docs}`));
                  } else {
                    reject(new Error(`Transfer failed: ${dispatchError.toString()}`));
                  }
                  return;
                }

                const blockNumber = await this.api!.query.system.number();

                resolve({
                  txHash: status.asInBlock.toHex(),
                  blockNumber: Number(blockNumber.toString()),
                });
              }
            }
          );

      Promise.resolve(send).catch(reject);
    });
  }
  
  /**
   * Wait for transaction to be included in a block
   * 
   * Note: Already handled in signAndSend above
   */
  async waitForTransaction(txHash: string): Promise<void> {
    // Already handled in signAndSend callbacks above
    // This is a no-op as we wait inline
  }
  
  /**
   * Subscribe to contract events
   */
  subscribeToEvents(
    eventType: ContractEventType,
    callback: (event: ContractEvent) => void
  ): Unsubscribe {
    // TODO: Implement event subscription
    // For now, return a no-op unsubscribe function
    console.warn('Event subscription not yet implemented');
    return () => {};
  }
  
  /**
   * Check if account has authority to issue/update passports
   * 
   * In v0.2, any account can register (authority is implicit = issuer)
   */
  async hasAuthority(account: string): Promise<boolean> {
    // In v0.2, any account can register passports
    // Authority is determined by being the original issuer
    return true;
  }
  
  // Helpers
  
  /**
   * Create Polkadot.js Signer wrapper from PolkadotAccount
   * 
   * Polkadot.js expects a Signer interface with signPayload and signRaw methods
   */
  private createSigner(signerAccount: PolkadotAccount): any {
    // Helper to convert various data formats to Uint8Array
    const toUint8Array = (data: any): Uint8Array => {
      if (data instanceof Uint8Array) {
        return data;
      }
      if (data instanceof Buffer) {
        return new Uint8Array(data);
      }
      if (typeof data === 'string') {
        // Remove 0x prefix if present
        const clean = data.startsWith('0x') ? data.slice(2) : data;
        return new Uint8Array(Buffer.from(clean, 'hex'));
      }
      if (Array.isArray(data)) {
        return new Uint8Array(data);
      }
      throw new Error(`Cannot convert data to Uint8Array: ${typeof data}`);
    };

    return {
      signPayload: async (payload: any) => {
        // Polkadot.js will call this with a payload to sign
        // For contract calls, payload contains method (encoded extrinsic) and metadata
        // We need to create an ExtrinsicPayload from the payload and sign it
        
        console.log(`[PolkadotChainAdapter] signPayload called - payload has method: ${!!payload.method}`);
        
        try {
          // Create ExtrinsicPayload from the payload
          // This will encode the extrinsic with all metadata (nonce, era, etc.)
          const extrinsicPayload = this.api!.registry.createType('ExtrinsicPayload', payload, {
            version: payload.version || 4,
          });
          
          // Get the encoded payload bytes to sign
          const dataToSign = extrinsicPayload.toU8a(true); // true = include method
          
          console.log(`[PolkadotChainAdapter] signPayload - ExtrinsicPayload created, data length: ${dataToSign.length} bytes`);
          
          // Sign the encoded payload
          const signature = await signerAccount.sign(dataToSign);
          
          return { 
            id: payload.id, 
            signature: `0x${Buffer.from(signature).toString('hex')}` 
          };
        } catch (error: any) {
          console.error(`[PolkadotChainAdapter] signPayload error:`, error.message);
          console.error(`[PolkadotChainAdapter] signPayload - payload:`, JSON.stringify(payload, null, 2));
          throw error;
        }
      },
      signRaw: async (raw: { data: string }) => {
        // Polkadot.js will call this with raw data to sign
        console.log(`[PolkadotChainAdapter] signRaw called - raw.data type: ${typeof raw.data}, raw.data:`, raw.data);
        const dataToSign = toUint8Array(raw.data);
        const signature = await signerAccount.sign(dataToSign);
        return { signature: `0x${Buffer.from(signature).toString('hex')}` };
      },
    };
  }

  /**
   * Convert hex string to Uint8Array[32]
   */
  private hexToBytes32(hex: unknown): Uint8Array {
    if (!hex) {
      throw new Error('Hex value is empty or undefined');
    }

    // Allow callers to pass raw bytes directly (dedot sometimes returns FixedBytes as Uint8Array)
    if (hex instanceof Uint8Array) {
      if (hex.length !== 32) {
        throw new Error(`Invalid hash length: expected 32 bytes, got ${hex.length} bytes`);
      }
      return new Uint8Array(hex);
    }

    if (Array.isArray(hex)) {
      const bytes = Uint8Array.from(hex as any);
      if (bytes.length !== 32) {
        throw new Error(`Invalid hash length: expected 32 bytes, got ${bytes.length} bytes`);
      }
      return bytes;
    }

    const hexString =
      typeof hex === 'string'
        ? hex
        : typeof (hex as any)?.toString === 'function'
          ? (hex as any).toString()
          : '';

    if (!hexString) {
      throw new Error(`Invalid hex value type: ${typeof hex}`);
    }

    const clean = hexString.startsWith('0x') ? hexString.slice(2) : hexString;
    
    console.log(
      `[PolkadotChainAdapter] hexToBytes32 - input type: ${typeof hex}, clean length: ${clean.length}, expected: 64`
    );
    
    if (clean.length !== 64) {
      throw new Error(
        `Invalid hash length: expected 64 hex chars (32 bytes), got ${clean.length} chars (${clean.length / 2} bytes). ` +
        `Input: ${clean.substring(0, 50)}...`
      );
    }
    
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      const hexByte = clean.substring(i * 2, i * 2 + 2);
      bytes[i] = parseInt(hexByte, 16);
    }
    
    console.log(`[PolkadotChainAdapter] hexToBytes32 - converted to ${bytes.length} bytes, buffer length: ${bytes.buffer.byteLength}`);
    console.log(`[PolkadotChainAdapter] hexToBytes32 - first 4 bytes: [${Array.from(bytes.slice(0, 4)).join(',')}], last 4 bytes: [${Array.from(bytes.slice(-4)).join(',')}]`);
    return bytes;
  }
  
  /**
   * Convert Uint8Array to hex string
   */
  private bytes32ToHex(bytes: Uint8Array | number[]): string {
    const arr = Array.isArray(bytes) ? bytes : Array.from(bytes);
    return '0x' + arr.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  
  /**
   * Convert Dedot FixedBytes<32> to hex string
   * 
   * Used for payloadHash and subjectIdHash from Dedot contract queries
   */
  private toHex(val: any): string {
    if (!val) return '';
    if (typeof val === 'string') {
      return val.startsWith('0x') ? val : `0x${val}`;
    }
    // Check for Uint8Array/Array BEFORE checking for generic 'toString'
    // because Uint8Array has toString but it produces comma-separated values
    if (Array.isArray(val) || val instanceof Uint8Array) {
      return this.bytes32ToHex(val);
    }
    if (typeof val === 'object' && 'toHex' in val && typeof val.toHex === 'function') {
      return val.toHex();
    }
    if (typeof val === 'object' && 'toString' in val) {
      const str = val.toString();
      return str.startsWith('0x') ? str : `0x${str}`;
    }
    return String(val);
  }

  /**
   * Normalize hash from various formats to 0x... hex string
   */
  private normalizeHash(hash: any): string {
    if (typeof hash === 'string') {
      return hash.startsWith('0x') ? hash : `0x${hash}`;
    }
    if (Array.isArray(hash) || hash instanceof Uint8Array) {
      return this.bytes32ToHex(hash);
    }
    throw new Error(`Cannot normalize hash: ${hash}`);
  }
  
  /**
   * Map TypeScript Granularity to contract enum variant
   */
  private mapGranularityToContract(granularity: Granularity): any {
    // Polkadot.js (@polkadot/api-contract) requires enum as object: { VariantName: null }
    // Different from dedot which accepts numbers (0, 1, 2)
    const variants: Record<Granularity, any> = {
      'ProductClass': { ProductClass: null },
      'Batch': { Batch: null },
      'Item': { Item: null },
    };
    return variants[granularity];
  }
  
  /**
   * Map contract Granularity enum to TypeScript type
   */
  private mapGranularityFromContract(granularity: any): Granularity {
    if (typeof granularity === 'string') {
      return granularity as Granularity;
    }
    
    // Handle enum variants
    if (granularity.ProductClass || granularity.isProductClass) return 'ProductClass';
    if (granularity.Batch || granularity.isBatch) return 'Batch';
    if (granularity.Item || granularity.isItem) return 'Item';
    
    // Default to Batch
    return 'Batch';
  }
  
  /**
   * Map on-chain status enum to TypeScript type
   */
  private mapStatus(status: any): PassportStatus {
    if (typeof status === 'string') {
      return status as PassportStatus;
    }
    
    // Handle enum variants
    if (status.Active || status.isActive) return 'Active';
    if (status.Revoked || status.isRevoked) return 'Revoked';
    if (status.Draft || status.isDraft) return 'Draft';
    if (status.Suspended || status.isSuspended) return 'Suspended';
    if (status.Archived || status.isArchived) return 'Archived';
    
    // Default to Active
    return 'Active';
  }
  
  /**
   * Disconnect from chain (cleanup)
   */
  async disconnect(): Promise<void> {
    if (this.api) {
      await this.api.disconnect();
      this.api = undefined;
      this.contract = undefined;
    }
  }

  /**
   * Convert an address to the contract's H160 `Address` type.
   *
   * Asset Hub contracts (revive) use H160 for `Address`. When callers provide an SS58
   * address, map it to H160 using keccak256(AccountId32)[12..32].
   */
  private toH160(address: string): string {
    const raw = String(address || '').trim();
    if (!raw) throw new Error('Address is required');

    if (/^0x[0-9a-fA-F]{40}$/.test(raw)) {
      return raw.toLowerCase();
    }

    const accountId32 = decodeAddress(raw);
    if (accountId32.length === 20) {
      return u8aToHex(accountId32).toLowerCase();
    }

    if (accountId32.length !== 32) {
      throw new Error(`Unsupported address length: ${accountId32.length}`);
    }

    const hash = keccakAsU8a(accountId32, 256);
    const h160 = hash.slice(12);
    return u8aToHex(h160).toLowerCase();
  }
}
