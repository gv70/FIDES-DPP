/**
 * CLI Verify Command with VC Integration
 * 
 * Verifies a DPP by retrieving VC from IPFS and checking signature
 * 
 * @license Apache-2.0
 */

import { Command } from 'commander';
import { createDppService } from '../../../src/lib/factory/createDppService';

export function verifyVcCommand(program: Command) {
  program
    .command('verify-vc')
    .description('Verify a DPP VC by token ID')
    .requiredOption('-t, --token-id <id>', 'Token ID to verify')
    .option('--backend <type>', 'IPFS backend', 'kubo')
    .option('--key <verificationKey>', 'Verification key to decrypt restricted sections (optional)')
    .option('--json', 'Output full report as JSON')
    .action(async (options) => {
      try {
        console.log(`Verifying passport ${options.tokenId}`);
        console.log(`Backend: ${options.backend}\n`);

	        const dppService = createDppService({
	          ipfsBackend: options.backend,
	          ipfsNodeUrl: process.env.IPFS_NODE_URL || 'http://127.0.0.1:5001',
	          ipfsGatewayUrl: process.env.IPFS_GATEWAY_URL || 'http://127.0.0.1:8080',
	          contractAddress: process.env.CONTRACT_ADDRESS || '',
	          rpcUrl: process.env.POLKADOT_RPC_URL || process.env.RPC_URL || 'wss://westend-asset-hub-rpc.polkadot.io',
	          enableStatusList: false,
	          enableAnagrafica: false,
	        });

        if (!process.env.CONTRACT_ADDRESS) {
          throw new Error('CONTRACT_ADDRESS environment variable not set');
        }

        const report = await dppService.verifyPassport(String(options.tokenId));

        if (options.json) {
          console.log(JSON.stringify(report, null, 2));
          return;
        }

        console.log('');
        console.log(`Valid: ${report.valid ? 'true' : 'false'}`);
        if (!report.valid && report.reason) console.log(`Reason: ${report.reason}`);
        if (report.onChainData) {
          console.log(`Status: ${report.onChainData.status}`);
          console.log(`Issuer (on-chain): ${report.onChainData.issuer}`);
          console.log(`Dataset URI: ${report.onChainData.datasetUri}`);
          console.log(`Version: ${report.onChainData.version}`);
        }
        if (typeof report.hashMatches === 'boolean') console.log(`Hash match: ${report.hashMatches}`);
        if (typeof report.issuerMatches === 'boolean') console.log(`Issuer match: ${report.issuerMatches}`);
        if (typeof report.schemaValid === 'boolean') console.log(`Schema valid: ${report.schemaValid}`);

      } catch (error: any) {
        console.error(`\nError: ${error.message}`);
        process.exit(1);
      }
    });
}
