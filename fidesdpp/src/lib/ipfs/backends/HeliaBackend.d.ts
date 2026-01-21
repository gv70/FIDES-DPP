/**
 * Helia Backend Implementation
 *
 * FOSS Lightweight Option - Embedded JS IPFS implementation
 * Runs in-process (browser or Node.js), no separate daemon required
 *
 * Setup:
 * 1. Install dependencies: npm install helia @helia/json @helia/unixfs
 * 2. Configure: IPFS_BACKEND=helia
 *
 * Storage:
 * - Browser: IndexedDB
 * - Node.js: filesystem (configurable)
 *
 * FOSS-first: 100% open-source (MIT/Apache 2.0 licensed)
 *
 * @license Apache-2.0
 */
import type { IpfsStorageBackend, UploadResult, RetrieveResult, UploadMetadata, IpfsConfig } from '../IpfsStorageBackend';
export declare class HeliaBackend implements IpfsStorageBackend {
    private gatewayUrl;
    private helia;
    private json;
    private initialized;
    constructor(config?: IpfsConfig);
    getBackendType(): string;
    isAvailable(): Promise<boolean>;
    private ensureInitialized;
    uploadJson(data: object, metadata?: UploadMetadata): Promise<UploadResult>;
    retrieveJson(cid: string): Promise<RetrieveResult>;
    uploadText(text: string, metadata?: UploadMetadata): Promise<UploadResult>;
    uploadBytes(bytes: Uint8Array, metadata?: UploadMetadata): Promise<UploadResult>;
    retrieveText(cid: string): Promise<{
        data: string;
        hash: string;
        cid: string;
    }>;
    getGatewayUrl(cid: string): string;
    /**
     * Stop Helia instance (cleanup)
     */
    stop(): Promise<void>;
}
//# sourceMappingURL=HeliaBackend.d.ts.map
