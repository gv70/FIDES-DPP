/**
 * DPP Service Factory
 *
 * Creates and wires DppApplicationService with all dependencies
 *
 * @license Apache-2.0
 */
import { DppApplicationService } from '../application/DppApplicationService';
export interface DppServiceConfig {
    ipfsBackend?: 'kubo' | 'helia' | 'pinata';
    ipfsNodeUrl?: string;
    ipfsGatewayUrl?: string;
    pinataJwt?: string;
    contractAddress: string;
    rpcUrl: string;
    contractAbiPath?: string;
    enableStatusList?: boolean;
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
export declare function createDppService(config: DppServiceConfig): DppApplicationService;
//# sourceMappingURL=createDppService.d.ts.map
