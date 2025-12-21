/**
 * Verify command - Verify passport integrity
 * 
 * @license Apache-2.0
 */

import { createDppService } from '../../../src/lib/factory/createDppService';

export async function verifyCommand(options: any, command: any) {
  const parentOpts = command.parent.opts();
  
  try {
    const tokenId = String(options.tokenId || '').trim();
    if (!tokenId) throw new Error('token-id is required');

    if (!process.env.CONTRACT_ADDRESS) {
      throw new Error('CONTRACT_ADDRESS environment variable not set');
    }

	    const dppService = createDppService({
	      ipfsBackend: parentOpts.backend,
	      ipfsNodeUrl: parentOpts.nodeUrl || process.env.IPFS_NODE_URL || 'http://127.0.0.1:5001',
	      ipfsGatewayUrl: parentOpts.gatewayUrl || process.env.IPFS_GATEWAY_URL || 'http://127.0.0.1:8080',
	      contractAddress: parentOpts.contract || process.env.CONTRACT_ADDRESS,
	      rpcUrl: parentOpts.rpc || process.env.POLKADOT_RPC_URL || process.env.RPC_URL || 'wss://westend-asset-hub-rpc.polkadot.io',
	      enableStatusList: false,
	      enableAnagrafica: false,
	    });

    const report = await dppService.verifyPassport(tokenId);

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    console.log(`Verification result for token ${tokenId}`);
    console.log(`Valid: ${report.valid ? 'true' : 'false'}`);
    if (!report.valid && report.reason) console.log(`Reason: ${report.reason}`);
    if (typeof report.hashMatches === 'boolean') console.log(`Hash match: ${report.hashMatches}`);
    if (typeof report.issuerMatches === 'boolean') console.log(`Issuer match: ${report.issuerMatches}`);
    if (typeof report.schemaValid === 'boolean') console.log(`Schema valid: ${report.schemaValid}`);
    if (report.onChainData) {
      console.log(`Status: ${report.onChainData.status}`);
      console.log(`Dataset URI: ${report.onChainData.datasetUri}`);
      console.log(`Version: ${report.onChainData.version}`);
    }

  } catch (error: any) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}
