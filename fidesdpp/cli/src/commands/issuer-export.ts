/**
 * CLI Issuer Export Command
 * 
 * Exports did.json file for a registered issuer.
 * Uses DidWebManager.generateDidDocument() (same as Web API).
 * 
 * @license Apache-2.0
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { getDidWebManager } from '../../../src/lib/vc/did-web-manager';

export function issuerExportCommand(issuer: Command) {
  issuer
    .command('export')
    .description('Export did.json file for a registered issuer')
    .requiredOption('-d, --domain <domain>', 'Domain for did:web (e.g., example.com)')
    .requiredOption('-o, --out <file>', 'Output file path (e.g., ./did.json)')
    .action(async (options) => {
      try {
        const manager = getDidWebManager();
        const domain = String(options.domain || '').trim();
        const did = domain.startsWith('did:web:') ? domain : `did:web:${domain}`;
        
        // Get issuer
        const identity = await manager.getIssuerIdentity(did);
        if (!identity) {
          console.error(`Error: Issuer not found for domain: ${domain}`);
          console.error('Run "issuer register" first.');
          process.exit(1);
        }

        // Generate DID document (same as Web API)
        const didDocument = await manager.generateDidDocument(identity.did);

        // Write to file
        const outputPath = path.resolve(options.out);
        fs.writeFileSync(outputPath, JSON.stringify(didDocument, null, 2), 'utf-8');

        console.log(`DID document exported: ${outputPath}`);
        console.log(`Next: host this file at https://${domain.replace(/^did:web:/, '')}/.well-known/did.json`);
        console.log(`Then run: issuer verify --domain ${domain.replace(/^did:web:/, '')}`);
      } catch (error: any) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
      }
    });
}
