/**
 * List command - List all available token IDs from a contract
 * 
 * @license Apache-2.0
 */

import { ApiPromise, WsProvider } from '@polkadot/api';
import { ContractPromise } from '@polkadot/api-contract';
import * as fs from 'fs';
import * as path from 'path';

interface ListOptions {
  contract: string;
  rpc?: string;
  max?: number;
  output?: string;
}

export async function listCommand(options: ListOptions) {
  const rpcUrl = options.rpc || 'wss://westend-asset-hub-rpc.polkadot.io';
  const contractAddress = options.contract;
  const maxIterations = options.max || 1000; // Default max 1000 token IDs to check

  if (!contractAddress) {
    console.error('Contract address is required');
    console.log('Usage: list --contract <address> [--rpc <url>] [--max <number>] [--output <file>]');
    process.exit(1);
  }

  let api: ApiPromise | null = null;
  let contract: ContractPromise | null = null;

  try {
    console.log(`Listing token IDs from contract: ${contractAddress}`);
    console.log(`Connecting to RPC: ${rpcUrl}`);

    // 1. Connect to chain
    const provider = new WsProvider(rpcUrl);
    api = await ApiPromise.create({ provider });
    console.log('Connected to chain');

    // 2. Load contract ABI
    // Try multiple possible paths
    const possiblePaths = [
      path.join(__dirname, '../../../../src/contracts/artifacts/dpp_contract/dpp_contract.json'),
      path.join(__dirname, '../../../src/contracts/artifacts/dpp_contract/dpp_contract.json'),
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
      console.error('Contract ABI not found. Tried paths:');
      possiblePaths.forEach(p => console.error(`   - ${p}`));
      throw new Error('Contract ABI not found. Please ensure the contract is compiled and the ABI exists.');
    }

    const contractMetadata = JSON.parse(fs.readFileSync(abiPath, 'utf-8'));
    console.log('Contract ABI loaded');

    // 3. Create contract instance
    contract = new ContractPromise(api, contractMetadata, contractAddress);
    console.log('Contract instance created');

    // 4. Iterate through token IDs
    console.log(`\nScanning token IDs (max: ${maxIterations})...`);
    const foundTokenIds: number[] = [];
    const batchSize = 10; // Check multiple IDs in parallel

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

              const zeroAddress = '5C4hrfjw9DjXZTzV3MwzrrAr9P1MJhSrvWGWqi1eSuyUpnhM'; // Alice
              // Use camelCase method name (dedot/typink convention)
              const result = await (contract!.query as any).getPassport(
                zeroAddress,
                { gasLimit },
                tokenId
              );

              // Check if passport exists
              const output = result.output;
              if (output && !output.isNone) {
                return { tokenId, exists: true };
              }
              return { tokenId, exists: false };
            } catch (error: any) {
              // If query fails, assume doesn't exist
              return { tokenId, exists: false };
            }
          })()
        );
      }

      const results = await Promise.all(batch);
      const found = results.filter(r => r.exists).map(r => r.tokenId);
      foundTokenIds.push(...found);

      if (found.length > 0) {
        process.stdout.write(`\rFound ${foundTokenIds.length} token ID(s): ${foundTokenIds.join(', ')}`);
      } else {
        process.stdout.write(`\rChecked IDs ${startId} to ${startId + batchSize - 1}...`);
      }

      // If we've checked a batch and found nothing, and we've already found some,
      // we might have reached the end (but continue to be safe)
      if (found.length === 0 && foundTokenIds.length > 0 && startId > 100) {
        // After checking 100+ IDs with no new finds, likely done
        // But continue a bit more to be safe
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

      // 6. Output to file if requested
      if (options.output) {
        const outputData = {
          contractAddress,
          rpcUrl,
          totalFound: foundTokenIds.length,
          tokenIds: foundTokenIds.sort((a, b) => a - b),
          scannedUpTo: maxIterations,
          timestamp: new Date().toISOString(),
        };

        fs.writeFileSync(options.output, JSON.stringify(outputData, null, 2));
        console.log(`\nResults saved to: ${options.output}`);
      }
    }

  } catch (error: any) {
    console.error(`\nError: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    if (api) {
      await api.disconnect();
      console.log('\nDisconnected from chain');
    }
  }
}
