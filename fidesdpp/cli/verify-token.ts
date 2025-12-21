#!/usr/bin/env tsx
/**
 * Standalone script to verify a passport token ID
 * 
 * Usage: tsx verify-token.ts --contract <address> --token-id <id> [--rpc <url>]
 * 
 * @license Apache-2.0
 */

import { DedotClient, WsProvider } from 'dedot';
import { Contract } from 'dedot/contracts';
import type { DppContractContractApi } from '../src/contracts/types/dpp-contract';
import type { DppContractDppContractV2PassportRecord } from '../src/contracts/types/dpp-contract/types';
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
  console.log('  tsx verify-token.ts --contract <address> --token-id <id> [options]');
  console.log('\nOptions:');
  console.log('  --contract, -c    Contract address (required)');
  console.log('  --token-id, -t    Token ID to verify (required)');
  console.log('  --rpc, -r         RPC URL (default: wss://westend-asset-hub-rpc.polkadot.io)');
  process.exit(1);
}

async function main() {
  let client: DedotClient | null = null;

  try {
    console.log(`Verifying token ID: ${tokenId}`);
    console.log(`Contract: ${contractAddress}`);
    console.log(`RPC: ${rpcUrl}`);

    // 1. Connect to chain using dedot
    console.log('\nConnecting to chain...');
    const provider = new WsProvider(rpcUrl);
    client = await DedotClient.new(provider);
    console.log('✓ Connected to chain');

    // 2. Load contract metadata
    const possiblePaths = [
      path.join(__dirname, '../src/contracts/artifacts/dpp_contract/dpp_contract.json'),
      path.join(process.cwd(), 'src/contracts/artifacts/dpp_contract/dpp_contract.json'),
      path.join(process.cwd(), 'fidesdpp/src/contracts/artifacts/dpp_contract/dpp_contract.json'),
    ];
    
    let metadataPath: string | null = null;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        metadataPath = p;
        break;
      }
    }
    
    if (!metadataPath) {
      console.error('Error: contract metadata not found. Tried paths:');
      possiblePaths.forEach(p => console.error(`   - ${p}`));
      throw new Error('Contract metadata not found');
    }

    const contractMetadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    console.log('✓ Contract metadata loaded');

    // 3. Create contract instance using dedot with typed API
    const contract = new Contract<DppContractContractApi>(
      client,
      contractMetadata,
      contractAddress as `0x${string}`
    );
    console.log('✓ Contract instance created (typed)');

    // 4. Query getPassport
    console.log(`\nQuerying passport for token ID: ${tokenId}...`);
    
    try {
      // dedot query requires a caller address in options
      // Use a zero address (Alice) for queries (standard practice)
      const zeroAddress = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY'; // Alice
      
      // With typed Contract, result.data is already Option<PassportRecord> = PassportRecord | undefined
      const result = await contract.query.getPassport(BigInt(tokenId), {
        caller: zeroAddress,
      });
      
      console.log('\nQuery successful');
      
      // DEBUG: Log raw structure to understand what we're getting
      console.log('\nRaw result structure:');
      console.log('   result.data type:', typeof result.data);
      console.log('   result.data:', result.data);
      if (result.data) {
        console.log('   result.data keys:', Object.keys(result.data));
      }
      
      // result.data is already Option<PassportRecord> = PassportRecord | undefined
      // No need to unwrap Ok/Some - Dedot handles it automatically
      const passport: DppContractDppContractV2PassportRecord | undefined = result.data;
      
      if (!passport) {
        console.log('\nPassport not found (None)');
        console.log(`   Token ID ${tokenId} does not exist in the contract`);
      } else {
        console.log('\nPassport found');
        
        // Helper to convert Dedot types to string
        const toString = (val: any): string => {
          if (val === null || val === undefined) return 'N/A';
          if (typeof val === 'bigint') return val.toString();
          // H160 and FixedBytes have toString() method
          if (typeof val === 'object' && 'toString' in val) {
            try {
              return val.toString();
            } catch (e) {
              return String(val);
            }
          }
          return String(val);
        };
        
        // Helper to convert FixedBytes<32> to hex string
        const toHex = (val: any): string => {
          if (!val) return 'N/A';
          if (typeof val === 'string') return val;
          if (typeof val === 'object' && 'toHex' in val) {
            return val.toHex();
          }
          if (typeof val === 'object' && 'toString' in val) {
            const str = val.toString();
            // If it's already hex, return it; otherwise try toHex
            if (str.startsWith('0x')) return str;
            return `0x${str}`;
          }
          return toString(val);
        };
        
        // Use correct field names from generated types
        // Note: tokenId exists in PassportRecord according to types, but use the one passed as param for clarity
        const issuerValue = toString(passport.issuer); // H160 -> string
        const datasetUriValue = passport.datasetUri; // string
        const payloadHashValue = toHex(passport.payloadHash); // FixedBytes<32> -> hex string
        const datasetTypeValue = passport.datasetType; // string
        const statusValue = passport.status; // enum -> string
        const versionValue = passport.version.toString(); // number -> string
        const granularityValue = passport.granularity; // enum -> string
        const createdAtValue = passport.createdAt.toString(); // number -> string
        const updatedAtValue = passport.updatedAt.toString(); // number -> string
        const subjectIdHashValue = passport.subjectIdHash ? toHex(passport.subjectIdHash) : undefined; // FixedBytes<32> | undefined
        
        console.log('\nPassport record:');
        console.log(`   Token ID: ${tokenId} (from query parameter)`);
        console.log(`   Issuer: ${issuerValue}`);
        console.log(`   Dataset URI: ${datasetUriValue}`);
        
        // Extract and display IPFS CID separately
        if (datasetUriValue && datasetUriValue.startsWith('ipfs://')) {
          const cid = datasetUriValue.replace('ipfs://', '');
          console.log(`   IPFS CID: ${cid}`);
          console.log(`   IPFS Gateway: https://ipfs.io/ipfs/${cid}`);
        } else if (datasetUriValue && datasetUriValue !== 'N/A') {
          console.log(`   Dataset URI (non-IPFS): ${datasetUriValue}`);
        }
        
        console.log(`   Payload Hash: ${payloadHashValue}`);
        console.log(`   Dataset Type: ${datasetTypeValue}`);
        console.log(`   Status: ${statusValue}`);
        console.log(`   Version: ${versionValue}`);
        console.log(`   Granularity: ${granularityValue}`);
        
        if (subjectIdHashValue) {
          console.log(`   Subject ID Hash: ${subjectIdHashValue}`);
        }
        
        console.log(`   Created at block: ${createdAtValue}`);
        console.log(`   Updated at block: ${updatedAtValue}`);
      }
      
    } catch (queryError: any) {
      console.error('\nQuery failed:', queryError.message);
      if (queryError.stack) {
        console.error(queryError.stack);
      }
      throw queryError;
    }

  } catch (error: any) {
    console.error('\nError:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    if (client) {
      await client.disconnect();
      console.log('\n✓ Disconnected from chain');
    }
  }
}

main();
