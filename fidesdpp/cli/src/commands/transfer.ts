/**
 * Transfer command - Transfer passport custody (NFT-like ownership)
 * 
 * @license Apache-2.0
 */

import { Command } from 'commander';
import { createDppService } from '../../../src/lib/factory/createDppService';
import { loadPolkadotAccount, formatAccountInfo } from '../lib/account';

export function transferCommand(program: Command) {
  program
    .command('transfer')
    .description('Transfer passport custody (NFT-like ownership)')
    .requiredOption('-t, --token-id <id>', 'Token ID to transfer')
    .requiredOption('--to <address>', 'Destination address (SS58 or 0x... H160)')
    .requiredOption('-a, --account <keyring>', 'Account URI or seed phrase (current token owner)')
    .option('--key-type <type>', 'Key type: ed25519 or sr25519', 'ed25519')
    .action(async (options, command) => {
      try {
        const parentOpts = command.parent.opts();

        console.log('Transferring passport\n');
        console.log(`Token ID: ${options.tokenId}`);
        console.log(`To: ${options.to}\n`);

        // 1. Load account
        console.log(`Loading account ${options.account}`);
        const account = await loadPolkadotAccount(options.account, options.keyType);
        console.log(formatAccountInfo(account));
        console.log('');

        // 2. Validate environment
        const contractAddress = parentOpts.contract || process.env.CONTRACT_ADDRESS;
        if (!contractAddress) {
          throw new Error('CONTRACT_ADDRESS environment variable not set');
        }

        // 3. Create DPP service
        console.log('Initializing DPP service');
        const dppService = createDppService({
          contractAddress,
          rpcUrl: parentOpts.rpc || process.env.POLKADOT_RPC_URL || process.env.RPC_URL || 'wss://westend-asset-hub-rpc.polkadot.io',
          enableStatusList: false,
          enableAnagrafica: false,
        });
        console.log('');

        // 4. Transfer
        console.log('Calling transfer');
        const result = await dppService.transferPassport(
          options.tokenId,
          String(options.to),
          account
        );

        console.log('\nTransfer complete\n');
        console.log(`Transaction: ${result.txHash}`);
        console.log(`Block: ${result.blockNumber || 'pending'}`);

      } catch (error: any) {
        console.error(`\nError: ${error.message}`);
        if (error.stack && process.env.DEBUG) {
          console.error('\nStack trace:', error.stack);
        }
        process.exit(1);
      }
    });
}
