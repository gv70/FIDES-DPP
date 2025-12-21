/**
 * Revoke command - Revoke passport
 * 
 * @license Apache-2.0
 */

import { Command } from 'commander';
import { createDppService } from '../../../src/lib/factory/createDppService';
import { loadPolkadotAccount, formatAccountInfo } from '../lib/account';

export function revokeCommand(program: Command) {
  program
    .command('revoke')
    .description('Revoke a passport on-chain')
    .requiredOption('-t, --token-id <id>', 'Token ID to revoke')
    .requiredOption('-a, --account <keyring>', 'Account URI (e.g., //Alice)')
    .option('-r, --reason <reason>', 'Revocation reason (optional)')
    .option('--key-type <type>', 'Key type: ed25519 or sr25519', 'ed25519')
    .action(async (options) => {
      try {
        console.log('Revoking passport\n');
        console.log(`Token ID: ${options.tokenId}`);
        if (options.reason) {
          console.log(`Reason: ${options.reason}`);
        }
        console.log('');

        // 1. Load account
        console.log(`Loading account ${options.account}`);
        const account = await loadPolkadotAccount(options.account, options.keyType);
        console.log(formatAccountInfo(account));
        console.log('');

        // 2. Validate environment
        if (!process.env.CONTRACT_ADDRESS) {
          throw new Error('CONTRACT_ADDRESS environment variable not set');
        }

        // 3. Create DPP service
        console.log('Initializing DPP service');
        const dppService = createDppService({
          contractAddress: process.env.CONTRACT_ADDRESS,
          rpcUrl: process.env.POLKADOT_RPC_URL || process.env.RPC_URL || 'wss://westend-asset-hub-rpc.polkadot.io',
          enableStatusList: false,
          enableAnagrafica: false,
        });
        console.log('');

        // 4. Revoke passport
        console.log('Calling revoke_passport');
        const result = await dppService.revokePassport(
          options.tokenId,
          account,
          options.reason
        );

        console.log('\nRevocation complete\n');
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
