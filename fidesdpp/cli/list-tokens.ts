#!/usr/bin/env tsx
/**
 * Standalone script to list token IDs from a DPP contract
 * 
 * Usage: tsx list-tokens.ts --contract <address> [--rpc <url>] [--max <number>]
 * 
 * @license Apache-2.0
 */

import { ApiPromise, WsProvider } from '@polkadot/api';
import { ContractPromise } from '@polkadot/api-contract';
import * as fs from 'fs';
import * as path from 'path';

const args = process.argv.slice(2);
let contractAddress: string | null = null;
let rpcUrl = 'wss://westend-asset-hub-rpc.polkadot.io';
let maxIterations = 1000;
let outputFile: string | undefined;

// Parse arguments
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--contract' || args[i] === '-c') {
    contractAddress = args[++i];
  } else if (args[i] === '--rpc' || args[i] === '-r') {
    rpcUrl = args[++i];
  } else if (args[i] === '--max' || args[i] === '-m') {
    maxIterations = parseInt(args[++i], 10);
  } else if (args[i] === '--output' || args[i] === '-o') {
    outputFile = args[++i];
  }
}

if (!contractAddress) {
  console.error('Error: contract address is required.');
  console.log('\nUsage:');
  console.log('  tsx list-tokens.ts --contract <address> [options]');
  console.log('\nOptions:');
  console.log('  --contract, -c    Contract address (required)');
  console.log('  --rpc, -r         RPC URL (default: wss://westend-asset-hub-rpc.polkadot.io)');
  console.log('  --max, -m         Maximum token IDs to scan (default: 1000)');
  console.log('  --output, -o      Output JSON file');
  process.exit(1);
}

async function main() {
  let api: ApiPromise | null = null;
  let contract: ContractPromise | null = null;

  try {
    console.log(`Listing token IDs from contract: ${contractAddress}`);
    console.log(`Connecting to RPC: ${rpcUrl}`);

    // 1. Connect to chain
    const provider = new WsProvider(rpcUrl);
    api = await ApiPromise.create({ provider });
    console.log('✓ Connected to chain');

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

    const contractMetadata = JSON.parse(fs.readFileSync(abiPath, 'utf-8'));
    console.log('✓ Contract ABI loaded');

    // 3. Create contract instance
    contract = new ContractPromise(api, contractMetadata, contractAddress);
    console.log('✓ Contract instance created');

    // 4. Iterate through token IDs
    console.log(`\nScanning token IDs (max: ${maxIterations})...`);
    const foundTokenIds: number[] = [];
    const batchSize = 10;

    for (let startId = 0; startId < maxIterations; startId += batchSize) {
      const batch: Promise<{ tokenId: number; exists: boolean }>[] = [];

      for (let i = 0; i < batchSize && startId + i < maxIterations; i++) {
        const tokenId = startId + i;
        batch.push(
          (async () => {
            try {
              const gasLimit = api!.registry.createType('WeightV2', {
                refTime: 1_000_000_000,
                proofSize: 100_000,
              });

              const zeroAddress = '5C4hrfjw9DjXZTzV3MwzrrAr9P1MJhSrvWGWqi1eSuyUpnhM';
              const result = await (contract!.query as any).getPassport(
                zeroAddress,
                { gasLimit },
                tokenId
              );

              const output = result.output;
              if (output && !output.isNone) {
                return { tokenId, exists: true };
              }
              return { tokenId, exists: false };
            } catch (error: any) {
              return { tokenId, exists: false };
            }
          })()
        );
      }

      const results = await Promise.all(batch);
      const found = results.filter(r => r.exists).map(r => r.tokenId);
      foundTokenIds.push(...found);

      if (found.length > 0) {
        process.stdout.write(`\r✓ Found ${foundTokenIds.length} token ID(s): ${foundTokenIds.join(', ')}`);
      } else {
        process.stdout.write(`\rChecked IDs ${startId} to ${startId + batchSize - 1}...`);
      }

      if (found.length === 0 && foundTokenIds.length > 0 && startId > 100) {
        if (startId > 200) {
          console.log(`\n\nNo new token IDs found after ID ${startId}. Stopping scan.`);
          break;
        }
      }
    }

    console.log('\n');

    // 5. Display results
    if (foundTokenIds.length === 0) {
      console.log('No token IDs found in this contract');
    } else {
      console.log(`\nFound ${foundTokenIds.length} token ID(s):`);
      foundTokenIds.sort((a, b) => a - b).forEach(id => {
        console.log(`   - Token ID: ${id}`);
      });

      if (outputFile) {
        const outputData = {
          contractAddress,
          rpcUrl,
          totalFound: foundTokenIds.length,
          tokenIds: foundTokenIds.sort((a, b) => a - b),
          scannedUpTo: maxIterations,
          timestamp: new Date().toISOString(),
        };

        fs.writeFileSync(outputFile, JSON.stringify(outputData, null, 2));
        console.log(`\nResults saved to: ${outputFile}`);
      }
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
