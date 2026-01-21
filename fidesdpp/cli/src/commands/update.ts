/**
 * Update command - Update dataset for a passport
 * 
 * @license Apache-2.0
 */

import { Command } from 'commander';
import * as fs from 'fs';
import { createDppService } from '../../../src/lib/factory/createDppService';
import type { DigitalProductPassport } from '../../../src/lib/untp/generateDppJsonLd';
import { loadPolkadotAccount, formatAccountInfo } from '../lib/account';

export function updateCommand(program: Command) {
  program
    .command('update')
    .description('Update passport dataset (granularity is immutable)')
    .requiredOption('-t, --token-id <id>', 'Token ID to update')
    .requiredOption('-j, --json <file>', 'Updated DPP data JSON file')
    .requiredOption('-a, --account <keyring>', 'Account URI (e.g., //Alice)')
    .option('--backend <type>', 'IPFS backend: kubo, helia, pinata', 'kubo')
    .option('--key-type <type>', 'Key type: ed25519 or sr25519', 'ed25519')
    .action(async (options, command) => {
      try {
        const parentOpts = command.parent.opts();

        console.log('Updating passport dataset\n');
        console.log(`Token ID: ${options.tokenId}\n`);

        // 1. Load updated DPP data from JSON file
        console.log(`Loading updated DPP data from ${options.json}`);
        const dppDataRaw = fs.readFileSync(options.json, 'utf-8');
        const updatedDpp: DigitalProductPassport = JSON.parse(dppDataRaw);

        console.log(`Product: ${updatedDpp.product?.name}`);
        console.log(`ID: ${updatedDpp.product?.identifier}\n`);

        // 2. Load account
        console.log(`Loading account ${options.account}`);
        const account = await loadPolkadotAccount(options.account, options.keyType);
        console.log(formatAccountInfo(account));
        console.log('');

        // 3. Validate environment
        const contractAddress = parentOpts.contract || process.env.CONTRACT_ADDRESS;
        if (!contractAddress) {
          throw new Error('CONTRACT_ADDRESS environment variable not set');
        }

        // 4. Create DPP service
        console.log('Initializing DPP service');
	        const dppService = createDppService({
	          ipfsBackend: options.backend,
	          ipfsNodeUrl: process.env.IPFS_NODE_URL || 'http://127.0.0.1:5001',
	          ipfsGatewayUrl: process.env.IPFS_GATEWAY_URL || 'http://127.0.0.1:8080',
	          contractAddress,
	          rpcUrl: parentOpts.rpc || process.env.POLKADOT_RPC_URL || process.env.RPC_URL || 'wss://westend-asset-hub-rpc.polkadot.io',
	          enableStatusList: false,
	          enableAnagrafica: false,
	        });

        console.log(`Backend: ${options.backend}\n`);

        // 5. Update passport
        console.log('Issuing new VC version');
        console.log('Uploading to IPFS');
        console.log('Updating on-chain anchor\n');

        const result = await dppService.updatePassport(
          options.tokenId,
          updatedDpp,
          account
        );

        console.log('Update complete\n');
        console.log(`Token ID: ${options.tokenId}`);
        console.log(`New CID: ${result.cid}`);
        console.log(`New Dataset URI: ipfs://${result.cid}`);
        console.log(`Transaction: ${result.txHash}`);
        console.log(`VC-JWT (prefix): ${result.vcJwt.substring(0, 80)}...`);

      } catch (error: any) {
        console.error(`\nError: ${error.message}`);
        if (error.stack && process.env.DEBUG) {
          console.error('\nStack trace:', error.stack);
        }
        process.exit(1);
      }
    });
}
