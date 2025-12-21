#!/usr/bin/env tsx
/**
 * Query passport using @polkadot/api-contract
 * 
 * Usage: tsx query-passport.ts --contract <address> --token-id <id> [--rpc <url>]
 * 
 * @license Apache-2.0
 */

import { ApiPromise, WsProvider } from '@polkadot/api';
import { ContractPromise } from '@polkadot/api-contract';
import * as fs from 'fs';
import * as path from 'path';

const args = process.argv.slice(2);
let contractAddress: string | null = null;
let tokenId: string | null = null;
let rpcUrl = 'wss://westend-asset-hub-rpc.polkadot.io';

// Parse arguments
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--contract' || args[i] === '-c') {
    contractAddress = args[++i];
  } else if (args[i] === '--token-id' || args[i] === '-t') {
    tokenId = args[++i];
  } else if (args[i] === '--rpc' || args[i] === '-r') {
    rpcUrl = args[++i];
  }
}

if (!contractAddress || !tokenId) {
  console.error('Error: contract address and token ID are required.');
  console.log('\nUsage:');
  console.log('  tsx query-passport.ts --contract <address> --token-id <id> [options]');
  console.log('\nOptions:');
  console.log('  --contract, -c    Contract address (required)');
  console.log('  --token-id, -t     Token ID to query (required)');
  console.log('  --rpc, -r          RPC URL (default: wss://westend-asset-hub-rpc.polkadot.io)');
  process.exit(1);
}

async function main() {
  let api: ApiPromise | null = null;
  let contract: ContractPromise | null = null;

  try {
    console.log('Querying passport with @polkadot/api-contract');
    console.log(`Contract: ${contractAddress}`);
    console.log(`Token ID: ${tokenId}`);
    console.log(`RPC: ${rpcUrl}`);

    // 1. Connect to chain
    console.log('\nConnecting to chain...');
    const provider = new WsProvider(rpcUrl);
    api = await ApiPromise.create({ provider });
    console.log('✓ Connected to chain');
    console.log(`   Chain: ${api.runtimeChain}`);
    console.log(`   Node: ${api.runtimeName} v${api.runtimeVersion.specVersion}`);

    // 2. Load contract ABI
    const possiblePaths = [
      path.join(__dirname, '../src/contracts/artifacts/dpp_contract/dpp_contract.json'),
      path.join(process.cwd(), 'src/contracts/artifacts/dpp_contract/dpp_contract.json'),
      path.join(process.cwd(), 'fidesdpp/src/contracts/artifacts/dpp_contract/dpp_contract.json'),
    ];
    
    let abiPath: string | null = null;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        abiPath = p;
        break;
      }
    }
    
    if (!abiPath) {
      console.error('Error: contract ABI not found. Tried paths:');
      possiblePaths.forEach(p => console.error(`   - ${p}`));
      throw new Error('Contract ABI not found');
    }

    const abiJson = JSON.parse(fs.readFileSync(abiPath, 'utf-8'));
    console.log('✓ Contract ABI loaded');

    // 3. Create contract instance
    // NOTE: @polkadot/api-contract may fail on Asset Hub due to reviveApi incompatibility
    // If this fails, use verify-token.ts with dedot instead
    try {
      contract = new ContractPromise(api, abiJson, contractAddress);
      console.log('✓ Contract instance created');
    } catch (contractError: any) {
      if (contractError.message?.includes('reviveApi')) {
        console.error('\nError: @polkadot/api-contract is not compatible with Asset Hub reviveApi.');
        console.error('   Asset Hub uses reviveApi which @polkadot/api-contract does not support.');
        console.error('\nUse the dedot-based script instead:');
        console.error(`npx tsx cli/verify-token.ts --contract ${contractAddress} --token-id ${tokenId}`);
        throw new Error('@polkadot/api-contract incompatible with Asset Hub. Use dedot (verify-token.ts) instead.');
      }
      throw contractError;
    }

    // 4. Query getPassport
    console.log(`\nQuerying getPassport(${tokenId})...`);
    
    // Use a zero address (Alice) as caller for queries
    const callerAddress = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY'; // Alice
    
    const result = await contract.query.getPassport(
      callerAddress,
      {
        gasLimit: api.registry.createType('WeightV2', {
          refTime: 3_000_000_000,
          proofSize: 200_000,
        }),
        storageDepositLimit: null,
      },
      BigInt(tokenId)
    );

    console.log('\nQuery successful');
    console.log(`   Gas consumed: ${result.gasConsumed?.refTime?.toString() || 'N/A'}`);
    console.log(`   Gas required: ${result.gasRequired?.refTime?.toString() || 'N/A'}`);

    // DEBUG: Print raw output structure
    console.log('\nRaw output structure:');
    const output = result.output;
    try {
      console.log('   result.toHuman():', JSON.stringify(result.toHuman?.(), null, 2));
      console.log('   output?.toHuman():', output?.toHuman ? JSON.stringify(output.toHuman(), null, 2) : 'N/A (no toHuman)');
      console.log('   output?.toJSON():', output?.toJSON ? JSON.stringify(output.toJSON(), null, 2) : 'N/A (no toJSON)');
      console.log('   output type:', typeof output);
      console.log('   output constructor:', output?.constructor?.name);
      console.log('   output keys:', output ? Object.keys(output) : 'N/A');
      if (output && typeof output === 'object') {
        console.log('   output.isNone:', (output as any).isNone);
        console.log('   output.isSome:', (output as any).isSome);
        console.log('   output.Ok:', (output as any).Ok);
        console.log('   output.ok:', (output as any).ok);
        console.log('   output.Err:', (output as any).Err);
        console.log('   output.err:', (output as any).err);
      }
    } catch (e) {
      console.log('   Error printing debug info:', e);
    }

    // 5. Decode result
    // @polkadot/api-contract returns Option<T> as:
    // - { Ok: { Some: T } } if found
    // - { Ok: { None: null } } or { Ok: null } if not found
    // - { Err: Error } if query failed
    // Structure can be: result.result = { isOk: true, asOk: Option<T> }
    //                   or result.result = { Ok: { Some: T } } (JSON)
    
    if (result.result.isErr) {
      const error = result.result.asErr;
      console.log('\nContract query error:');
      
      // Try to decode error
      if (error.isModule) {
        const decoded = api.registry.findMetaError(error.asModule);
        console.log(`   Module: ${decoded.section}.${decoded.name}`);
        console.log(`   Error: ${decoded.docs.join(' ')}`);
      } else {
        console.log(`   Error: ${error.toString()}`);
      }
      
      // Try contract-specific error decoding
      try {
        const contractError = contract.abi.decodeError(error);
        console.log(`   Contract Error: ${contractError.name}`);
        console.log(`   Contract Error Docs: ${contractError.docs.join(' ')}`);
      } catch (e) {
        // Contract error decoding might not work for all errors
      }
      
      throw new Error('Contract query failed');
    }

    const okResult = result.result.asOk;
    
    // Unwrap Option<PassportRecord>
    // Structure can be:
    // - { isNone: true } or { None: null } or null
    // - { isSome: true, value: T } or { Some: T }
    // - Direct T (already unwrapped)
    
    let passport: any = null;
    let isNone = false;
    
    // Try multiple unwrap strategies
    if (!okResult) {
      isNone = true;
    } else if (okResult.isNone === true || (okResult as any).None !== undefined) {
      isNone = true;
    } else if (okResult.isSome === true && okResult.value) {
      // SCALE-encoded Option with isSome/value
      passport = okResult.value;
    } else if ((okResult as any).Some) {
      // JSON format: { Some: T }
      passport = (okResult as any).Some;
    } else if ((okResult as any).some) {
      // JSON format: { some: T }
      passport = (okResult as any).some;
    } else if ((okResult as any).value) {
      // Direct value property
      passport = (okResult as any).value;
    } else {
      // Assume it's already unwrapped
      passport = okResult;
    }
    
    if (isNone || !passport) {
      console.log('\nPassport not found (None)');
      console.log(`   Token ID ${tokenId} does not exist in the contract`);
      console.log('   Debug - okResult structure:', JSON.stringify(okResult?.toJSON?.() || okResult, null, 2));
    } else {
      console.log('\nPassport found');
      
      // Convert to JSON/human-readable if needed
      let passportData: any = passport;
      if (passport.toHuman) {
        passportData = passport.toHuman();
        console.log('   Using toHuman() format');
      } else if (passport.toJSON) {
        passportData = passport.toJSON();
        console.log('   Using toJSON() format');
      } else {
        passportData = passport;
        console.log('   Using raw format');
      }
      
      console.log('   Debug - passportData keys:', Object.keys(passportData));
      
      // Helper to convert values to string
      const toString = (val: any): string => {
        if (val === null || val === undefined) return 'N/A';
        if (typeof val === 'bigint') return val.toString();
        if (typeof val === 'object' && 'toString' in val) return val.toString();
        return String(val);
      };

      // Extract fields (handle both camelCase and snake_case)
      // Try passportData first (human-readable), then passport (raw)
      const tokenIdValue = toString(passportData.tokenId || passportData.token_id || passport.tokenId || passport.token_id || tokenId);
      const issuerValue = toString(passportData.issuer || passportData.issuerAccount || passport.issuer || passport.issuerAccount);
      const datasetUriValue = toString(passportData.datasetUri || passportData.dataset_uri || passport.datasetUri || passport.dataset_uri);
      const payloadHashValue = toString(passportData.payloadHash || passportData.payload_hash || passport.payloadHash || passport.payload_hash);
      const datasetTypeValue = toString(passportData.datasetType || passportData.dataset_type || passport.datasetType || passport.dataset_type);
      const statusValue = toString(passportData.status || passportData.passportStatus || passport.status || passport.passportStatus);
      const versionValue = toString(passportData.version || passportData.passportVersion || passport.version || passport.passportVersion);
      const granularityValue = toString(passportData.granularity || passportData.granularityLevel || passport.granularity || passport.granularityLevel);
      const subjectIdHashValue = toString(passportData.subjectIdHash || passportData.subject_id_hash || passport.subjectIdHash || passport.subject_id_hash);
      const createdAtValue = toString(passportData.createdAt || passportData.created_at || passportData.createdAtBlock || passport.createdAt || passport.created_at || passport.createdAtBlock);
      const updatedAtValue = toString(passportData.updatedAt || passportData.updated_at || passportData.updatedAtBlock || passport.updatedAt || passport.updated_at || passport.updatedAtBlock);
      
      console.log('\nPassport record:');
      console.log(`   Token ID: ${tokenIdValue}`);
      console.log(`   Issuer: ${issuerValue}`);
      console.log(`   Dataset URI: ${datasetUriValue}`);
      
      // Extract and display IPFS CID
      if (datasetUriValue && datasetUriValue.startsWith('ipfs://')) {
        const cid = datasetUriValue.replace('ipfs://', '');
        console.log(`   IPFS CID: ${cid}`);
        console.log(`   IPFS Gateway: https://ipfs.io/ipfs/${cid}`);
      }
      
      console.log(`   Payload Hash: ${payloadHashValue}`);
      console.log(`   Dataset Type: ${datasetTypeValue}`);
      console.log(`   Status: ${statusValue}`);
      console.log(`   Version: ${versionValue}`);
      console.log(`   Granularity: ${granularityValue}`);
      
      if (subjectIdHashValue && subjectIdHashValue !== 'N/A') {
        console.log(`   Subject ID Hash: ${subjectIdHashValue}`);
      }
      
      if (createdAtValue !== 'N/A') {
        console.log(`   Created at block: ${createdAtValue}`);
      }
      
      if (updatedAtValue !== 'N/A') {
        console.log(`   Updated at block: ${updatedAtValue}`);
      }
      
      // Show raw result structure for debugging
      console.log('\nRaw result structure:');
      console.log(`   passportData keys: ${Object.keys(passportData).join(', ')}`);
      console.log(`   passport keys: ${passport ? Object.keys(passport).join(', ') : 'N/A'}`);
      console.log(`   passport type: ${passport?.constructor?.name || typeof passport}`);
      console.log(`   Full passportData:`, JSON.stringify(passportData, null, 2));
    }

  } catch (error: any) {
    console.error('\nError:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    if (api) {
      await api.disconnect();
      console.log('\n✓ Disconnected from chain');
    }
  }
}

main();
