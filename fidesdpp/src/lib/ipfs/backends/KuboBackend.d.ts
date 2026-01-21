/**
 * Kubo (go-IPFS) Backend Implementation
 *
 * FOSS Primary Option - Uses self-hosted Kubo IPFS node
 * Communicates via Kubo HTTP RPC API (https://docs.ipfs.tech/reference/kubo/rpc/)
 *
 * Setup:
 * 1. Install Kubo: https://dist.ipfs.tech/#kubo
 * 2. Run: ipfs init && ipfs daemon
 * 3. Configure: IPFS_BACKEND=kubo, IPFS_NODE_URL=http://127.0.0.1:5001
 * 
 * FOSS-first: 100% open-source (MIT/Apache 2.0 licensed)
 * 
 * @license Apache-2.0
 */
import type { IpfsStorageBackend, UploadResult, RetrieveResult, UploadMetadata, IpfsConfig } from '../IpfsStorageBackend';
export declare class KuboBackend implements IpfsStorageBackend {
    private nodeUrl;
    private gatewayUrl;
    private authHeader?;
    constructor(config?: IpfsConfig);
    getBackendType(): string;
    isAvailable(): Promise<boolean>;
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
}
//# sourceMappingURL=KuboBackend.d.ts.map
