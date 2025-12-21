/**
 * CLI Issuer Register Command
 * 
 * Registers a new did:web issuer identity.
 * Calls the same DidWebManager.registerIssuer() as Web API.
 * 
 * @license Apache-2.0
 */

import { Command } from 'commander';
import { getDidWebManager } from '../../../src/lib/vc/did-web-manager';

export function issuerRegisterCommand(issuer: Command) {
  issuer
    .command('register')
    .description('Register a new did:web issuer identity')
    .requiredOption('-d, --domain <domain>', 'Domain for did:web (e.g., example.com)')
    .option('-o, --org <name>', 'Organization name')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const manager = getDidWebManager();
        
        const domain = String(options.domain || '').trim();
        const orgName = String(options.org || '').trim() || domain;

        // Register issuer (same as Web API)
        const identity = await manager.registerIssuer(domain, orgName);

        // Generate DID document
        const didDocument = await manager.generateDidDocument(identity.did);

        if (options.json) {
          // JSON output
          console.log(JSON.stringify({
            success: true,
            did: identity.did,
            publicKey: Buffer.from(identity.signingKey.publicKey).toString('hex'),
            didDocument,
            status: identity.status,
            metadata: {
              domain: identity.metadata?.domain,
              organizationName: identity.metadata?.organizationName,
              registeredAt: identity.metadata?.registeredAt,
            },
            instructions: {
              url: `https://${domain}/.well-known/did.json`,
              contentType: 'application/did+json',
              note: 'Host the didDocument at the URL above, then run "issuer verify" to verify.',
            },
          }, null, 2));
        } else {
          // Human-readable output
          console.log('Issuer registered\n');
          console.log(`DID: ${identity.did}`);
          console.log(`Status: ${identity.status}`);
          console.log(`Public Key: ${Buffer.from(identity.signingKey.publicKey).toString('hex')}\n`);
          console.log('Next steps:');
          console.log(`1) Host the DID document at: https://${domain}/.well-known/did.json`);
          console.log(`2) Run: issuer export --domain ${domain} --out ./did.json`);
          console.log(`3) Run: issuer verify --domain ${domain}`);
        }
      } catch (error: any) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
      }
    });
}
