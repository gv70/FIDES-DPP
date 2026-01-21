/**
 * CLI Issuer Authorize Command
 *
 * Adds an authorized Polkadot account for a did:web issuer (wallet allowlist).
 *
 * This updates local issuer storage (JSON/Postgres). For localhost sandbox flows,
 * the app serves `/.well-known/polkadot-accounts.json` from this same storage.
 *
 * @license Apache-2.0
 */

import { Command } from 'commander';
import { getDidWebManager } from '../../../src/lib/vc/did-web-manager';
import { loadPolkadotAccount } from '../lib/account';

export function issuerAuthorizeCommand(issuer: Command) {
  issuer
    .command('authorize')
    .description('Authorize a Polkadot wallet address for a did:web issuer')
    .requiredOption('-d, --domain <domain>', 'Domain for did:web (e.g., example.com, localhost%3A3000)')
    .option('--address <ss58>', 'Polkadot SS58 address to authorize')
    .option('-a, --account <keyring>', 'Account URI/seed to derive address (defaults to DPP_ACCOUNT_URI if omitted)')
    .option('--key-type <type>', 'Key type: ed25519 or sr25519 (for --account)', 'sr25519')
    .option('-n, --network <network>', 'Network identifier (default: westend-asset-hub)', 'westend-asset-hub')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const manager = getDidWebManager();

        const domain = String(options.domain || '').trim();
        const did = domain.startsWith('did:web:') ? domain : `did:web:${domain}`;

        let address = String(options.address || '').trim();
        if (!address) {
          const accountUri = String(options.account || '').trim();
          const keyType = String(options.keyType || 'sr25519').trim() as 'ed25519' | 'sr25519';
          const account = await loadPolkadotAccount(accountUri, keyType);
          address = account.address;
        }

        if (!address) {
          throw new Error('Missing address. Provide --address or --account (or set DPP_ACCOUNT_URI).');
        }

        const network = String(options.network || 'westend-asset-hub').trim();
        const updated = await manager.addAuthorizedPolkadotAccount(did, address, network);

        if (options.json) {
          console.log(
            JSON.stringify(
              {
                success: true,
                did,
                address,
                network,
                authorizedPolkadotAccounts: updated.authorizedPolkadotAccounts || [],
              },
              null,
              2
            )
          );
          return;
        }

        console.log('Wallet authorized');
        console.log(`  DID: ${did}`);
        console.log(`  Address: ${address}`);
        console.log(`  Network: ${network}`);
        console.log('');
        console.log('Next: (re)generate/host polkadot-accounts.json if you are using public HTTPS did:web.');
      } catch (error: any) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
      }
    });
}

