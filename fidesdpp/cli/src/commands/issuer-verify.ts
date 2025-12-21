/**
 * CLI Issuer Verify Command
 * 
 * Verifies did:web issuer by fetching did.json and validating public key.
 * Calls the same verification logic as Web API /api/issuer/verify.
 * 
 * @license Apache-2.0
 */

import { Command } from 'commander';
import { getDidWebManager } from '../../../src/lib/vc/did-web-manager';

export function issuerVerifyCommand(issuer: Command) {
  issuer
    .command('verify')
    .description('Verify did:web issuer by fetching did.json from domain')
    .requiredOption('-d, --domain <domain>', 'Domain for did:web (e.g., example.com)')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const manager = getDidWebManager();
        
        const domain = String(options.domain || '').trim();
        const did = domain.startsWith('did:web:') ? domain : `did:web:${domain}`;
        
        // Check if issuer is registered
        const issuerIdentity = await manager.getIssuerIdentity(did);
        if (!issuerIdentity) {
          console.error(`Error: Issuer not found for domain: ${domain}`);
          console.error('Run "issuer register" first.');
          process.exit(1);
        }

        console.log(`Verifying issuer for domain: ${domain}`);
        console.log(`   DID: ${did}`);
        console.log(`   Fetching: https://${domain.replace(/^did:web:/, '')}/.well-known/did.json\n`);

        // Verify issuer (same as Web API)
        const verification = await manager.verifyDidWeb(did);

        // Get updated issuer identity to get latest status
        const updatedIssuer = await manager.getIssuerIdentity(did);

        if (options.json) {
          // JSON output
          console.log(JSON.stringify({
            success: verification.success,
            status: verification.status,
            error: verification.error,
            lastError: updatedIssuer?.lastError,
            lastAttemptAt: updatedIssuer?.lastAttemptAt?.toISOString(),
            message: verification.success 
              ? 'Issuer verified successfully. did.json hosted and public key matches.'
              : verification.error || 'Verification failed',
          }, null, 2));
        } else {
          // Human-readable output
          if (verification.success) {
            console.log('Issuer verified');
            console.log(`   Status: ${verification.status}`);
            console.log('   did.json is hosted and public key matches.');
          } else {
            console.log('Verification failed');
            console.log(`   Status: ${verification.status}`);
            console.log(`   Error: ${verification.error || 'Unknown error'}\n`);
            if (updatedIssuer?.lastError) {
              console.log(`   Last error: ${updatedIssuer.lastError}`);
            }
            if (updatedIssuer?.lastAttemptAt) {
              console.log(`   Last attempt: ${updatedIssuer.lastAttemptAt.toISOString()}`);
            }
            console.log('\n   Troubleshooting:');
            console.log(`   1) Ensure did.json is hosted at: https://${domain.replace(/^did:web:/, '')}/.well-known/did.json`);
            console.log('   2) Verify the file is accessible (no authentication required)');
            console.log('   3) Check that the public key in did.json matches the registered key');
            console.log(`   4) Run: issuer export --domain ${domain.replace(/^did:web:/, '')} --out ./did.json`);
          }
        }
      } catch (error: any) {
        console.error(`Error: ${error.message}`);
        if (error.stack) {
          console.error(error.stack);
        }
        process.exit(1);
      }
    });
}
