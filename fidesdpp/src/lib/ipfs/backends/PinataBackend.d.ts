/**
 * Pinata Backend Implementation
 *
 * Optional SaaS convenience - not required
 * Uses Pinata SDK for simplified IPFS pinning
 *
 * IMPORTANT: This is an OPTIONAL backend. The project can run fully on FOSS
 * components (Kubo or Helia). Pinata is provided as a convenience for users
 * who prefer managed infrastructure.
 *
 * Migration path: Can be replaced with any IPFS Pinning Services API provider
 * or self-hosted Kubo node without code changes (via factory pattern).
 *
 * Setup:
 * 1. Create Pinata account: https://app.pinata.cloud
 * 2. Get JWT and Gateway URL
 * 3. Configure: IPFS_BACKEND=pinata, PINATA_JWT=<jwt>, PINATA_GATEWAY_URL=<gateway>
 *
 * @license Apache-2.0
 */
import type { IpfsStorageBackend, UploadResult, RetrieveResult, UploadMetadata, IpfsConfig } from '../IpfsStorageBackend';
export declare class PinataBackend implements IpfsStorageBackend {
    private jwt;
    private gatewayUrl;
    private pinata;
    constructor(config?: IpfsConfig);
    getBackendType(): string;
    isAvailable(): Promise<boolean>;
    private ensureInitialized;
    uploadJson(data: object, metadata?: UploadMetadata): Promise<UploadResult>;
    retrieveJson(cid: string): Promise<RetrieveResult>;
    uploadText(text: string, metadata?: UploadMetadata): Promise<UploadResult>;
    retrieveText(cid: string): Promise<{
        data: string;
        hash: string;
        cid: string;
    }>;
    getGatewayUrl(cid: string): string;
}
//# sourceMappingURL=PinataBackend.d.ts.map
