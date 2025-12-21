/**
 * Read command - Read passport by token ID
 * 
 * @license Apache-2.0
 */

import * as fs from 'fs';
import { createDppService } from '../../../src/lib/factory/createDppService';

export async function readCommand(options: any, command: any) {
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

    const onChainData = await dppService.readPassport(tokenId);

    const payload: any = { onChainData };
    if (options.ipfs) {
      const exported = await dppService.exportPassport(tokenId, {
        ...(options.key ? { verificationKey: String(options.key) } : {}),
      });
      payload.export = exported;
    }

    const output = JSON.stringify(payload, null, 2);
    
    if (options.output) {
      fs.writeFileSync(options.output, output);
      console.log(`Written to ${options.output}`);
    } else {
      console.log('');
      console.log(output);
    }
    
  } catch (error: any) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}
