/**
 * DPP Service Factory
 * 
 * Creates and wires DppApplicationService with all dependencies
 * 
 * @license Apache-2.0
 */

import { JwtVcEngine } from '../vc/JwtVcEngine';
import { DppApplicationService } from '../application/DppApplicationService';
import { createIpfsBackend } from '../ipfs/IpfsStorageFactory';
import { PolkadotChainAdapter } from '../chain/PolkadotChainAdapter';
import type { StatusListManager } from '../vc/StatusListManager';
import type { AnagraficaService } from '../anagrafica/AnagraficaService';

export interface DppServiceConfig {
  // IPFS config
  ipfsBackend?: 'kubo' | 'helia' | 'pinata';
  ipfsNodeUrl?: string;
  ipfsGatewayUrl?: string;
  pinataJwt?: string;
  
  // Chain config (v0.2 contract)
  contractAddress: string;
  rpcUrl: string;
  contractAbiPath?: string; // Path to dpp_contract.json
  
  // Status List config (Phase 2+)
  enableStatusList?: boolean; // Default: true

  // Anagrafica config
  enableAnagrafica?: boolean; // Default: true
}

/**
 * Create DPP service with all dependencies wired
 * 
 * FOSS-only example:
 * ```typescript
 * const service = createDppService({
 *   ipfsBackend: 'kubo',
 *   ipfsNodeUrl: 'http://127.0.0.1:5001',
 *   contractAddress: '0x...',
 *   rpcUrl: 'wss://westend-asset-hub-rpc.polkadot.io'
 * });
 * ```
 * 
 * Phase 2+ with Status List:
 * ```typescript
 * const service = createDppService({
 *   ipfsBackend: 'kubo',
 *   ipfsNodeUrl: 'http://127.0.0.1:5001',
 *   contractAddress: '0x...',
 *   rpcUrl: 'wss://westend-asset-hub-rpc.polkadot.io',
 *   enableStatusList: true  // UNTP compliance
 * });
 * ```
 * 
 * @param config - Service configuration
 * @returns Configured DppApplicationService
 */
export function createDppService(config: DppServiceConfig): DppApplicationService {
  // 1. Create storage backend (used by both IPFS and Status List)
  const storage = createIpfsBackend({
    backend: config.ipfsBackend || process.env.IPFS_BACKEND || 'kubo',
    nodeUrl: config.ipfsNodeUrl || process.env.IPFS_NODE_URL,
    gatewayUrl: config.ipfsGatewayUrl || process.env.IPFS_GATEWAY_URL,
    accessToken: config.pinataJwt || process.env.PINATA_JWT,
  });

  // 2. Create Status List Manager (Phase 2+)
  let statusListManager: StatusListManager | undefined;
  const enableStatusList = config.enableStatusList ?? (process.env.ENABLE_STATUS_LIST !== 'false');
  
  if (enableStatusList) {
    try {
      // Lazy-load to avoid pulling optional dependencies into environments that don't need them (e.g. CLI tooling).
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { createStatusListStorage } = require('../storage/createStorageBackend');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { StatusListManager } = require('../vc/StatusListManager') as typeof import('../vc/StatusListManager');

      const statusListStorage = createStatusListStorage();
      statusListManager = new StatusListManager(statusListStorage, storage);
      console.log('✓ Status List Manager initialized (UNTP compliant)');
    } catch (error: any) {
      console.warn('Status List Manager initialization failed:', error.message);
      console.warn('Continuing without Status List (VCs will not include credentialStatus)');
    }
  }

  // 3. Create VC engine with Status List support
  const vcEngine = new JwtVcEngine(statusListManager);

  // 4. Create chain adapter (v0.2 contract)
  const chainAdapter = new PolkadotChainAdapter({
    rpcUrl: config.rpcUrl || process.env.CHAIN_RPC_URL || 'ws://localhost:9944',
    contractAddress: config.contractAddress || process.env.CONTRACT_ADDRESS || '',
    abiPath: config.contractAbiPath || 
             process.env.CONTRACT_ABI_PATH || 
             './src/contracts/artifacts/dpp_contract/dpp_contract.json',
  });

  // 5. Create Anagrafica Service (optional, for entity/product indexing)
  let anagraficaService: AnagraficaService | undefined;
  const enableAnagrafica = config.enableAnagrafica ?? (process.env.ENABLE_ANAGRAFICA !== 'false');
  
  if (enableAnagrafica) {
    try {
      // Lazy-load to keep the default bundle lighter and avoid optional transitive deps for CLI use.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { createAnagraficaStorage } = require('../anagrafica/createAnagraficaStorage');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { AnagraficaService } = require('../anagrafica/AnagraficaService') as typeof import('../anagrafica/AnagraficaService');

      const anagraficaStorage = createAnagraficaStorage();
      anagraficaService = new AnagraficaService(anagraficaStorage);
      console.log('✓ Anagrafica Service initialized');
    } catch (error: any) {
      console.warn('Anagrafica Service initialization failed:', error.message);
      console.warn('Continuing without anagrafica indexing');
    }
  }

  // 6. Wire everything together
  return new DppApplicationService(vcEngine, storage, chainAdapter, anagraficaService);
}
