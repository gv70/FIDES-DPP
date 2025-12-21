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

import type { 
  IpfsStorageBackend, 
  UploadResult, 
  RetrieveResult, 
  UploadMetadata,
  IpfsConfig 
} from '../IpfsStorageBackend';
import { computeJsonHashSync, computeJwtHash } from '../IpfsStorageBackend';

// Dynamic import to avoid bundling when not needed
let PinataSDK: any = null;

export class PinataBackend implements IpfsStorageBackend {
  private jwt: string;
  private gatewayUrl: string;
  private pinata: any = null;

  constructor(config?: IpfsConfig) {
    this.jwt = config?.accessToken || process.env.PINATA_JWT || '';
    this.gatewayUrl = config?.gatewayUrl || process.env.NEXT_PUBLIC_PINATA_GATEWAY_URL || '';
    
    if (!this.jwt) {
      throw new Error('Pinata JWT not configured. Set PINATA_JWT environment variable or pass accessToken in config. Alternatively, use a FOSS backend (kubo or helia).');
    }
    
    if (!this.gatewayUrl) {
      throw new Error('Pinata Gateway URL not configured. Set NEXT_PUBLIC_PINATA_GATEWAY_URL environment variable. Alternatively, use a FOSS backend (kubo or helia).');
    }
  }

  getBackendType(): string {
    return 'pinata';
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.ensureInitialized();
      // Test connection by checking gateway
      const response = await fetch(`https://${this.gatewayUrl}`, {
        method: 'HEAD',
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (this.pinata) {
      return;
    }

    try {
      if (!PinataSDK) {
        const { PinataSDK: SDK } = await import('pinata');
        PinataSDK = SDK;
      }
      
      this.pinata = new PinataSDK({
        pinataJwt: this.jwt,
        pinataGateway: this.gatewayUrl,
      });
    } catch (error) {
      throw new Error(`Failed to initialize Pinata SDK: ${error}. Make sure to install: npm install pinata`);
    }
  }

  async uploadJson(data: object, metadata?: UploadMetadata): Promise<UploadResult> {
    await this.ensureInitialized();
    
    // 1. Compute hash before upload (deterministic)
    const hash = computeJsonHashSync(data);
    
    // 2. Create JSON file
    const jsonString = JSON.stringify(data, Object.keys(data).sort());
    const blob = new Blob([jsonString], { type: 'application/json' });
    const file = new File([blob], metadata?.name || 'passport.json', { type: 'application/json' });
    
    // 3. Upload to Pinata
    const upload = await this.pinata.upload.public.file(file);
    
    // 4. Get gateway URL
    const url = await this.pinata.gateways.public.convert(upload.cid);

    return {
      cid: upload.cid,
      hash,
      gatewayUrl: url,
      size: upload.size,
    };
  }

  async retrieveJson(cid: string): Promise<RetrieveResult> {
    await this.ensureInitialized();
    
    try {
      // Retrieve via Pinata gateway
      const data = await this.pinata.gateways.public.get(cid);
      
      // Parse if string
      let parsedData: object;
      if (typeof data === 'string') {
        parsedData = JSON.parse(data);
      } else if (data instanceof Blob) {
        const text = await data.text();
        parsedData = JSON.parse(text);
      } else {
        parsedData = data;
      }
      
      // Compute hash for verification
      const hash = computeJsonHashSync(parsedData);
      
      return {
        data: parsedData,
        hash,
        cid,
      };
    } catch (error) {
      throw new Error(`Failed to retrieve CID ${cid} from Pinata: ${error}`);
    }
  }

  async uploadText(text: string, metadata?: UploadMetadata): Promise<UploadResult> {
    await this.ensureInitialized();
    
    // 1. Compute hash before upload (JWT string)
    const hash = computeJwtHash(text);
    
    // 2. Create text file
    const blob = new Blob([text], { type: 'text/plain' });
    const file = new File([blob], metadata?.name || 'data.txt', { type: 'text/plain' });
    
    // 3. Upload to Pinata
    const upload = await this.pinata.upload.public.file(file);
    
    // 4. Get gateway URL
    const url = await this.pinata.gateways.public.convert(upload.cid);

    return {
      cid: upload.cid,
      hash,
      gatewayUrl: url,
      size: upload.size,
    };
  }

  async retrieveText(cid: string): Promise<{ data: string; hash: string; cid: string }> {
    await this.ensureInitialized();
    
    try {
      // Retrieve via Pinata gateway
      const data = await this.pinata.gateways.public.get(cid);
      
      // Convert to string
      let text: string;
      if (typeof data === 'string') {
        text = data;
      } else if (data instanceof Blob) {
        text = await data.text();
      } else {
        // If it's an object, stringify it (shouldn't happen for text files)
        text = JSON.stringify(data);
      }
      
      // Compute hash for verification
      const hash = computeJwtHash(text);
      
      return {
        data: text,
        hash,
        cid,
      };
    } catch (error) {
      throw new Error(`Failed to retrieve CID ${cid} from Pinata: ${error}`);
    }
  }

  getGatewayUrl(cid: string): string {
    // Remove protocol if present
    const cleanGatewayUrl = this.gatewayUrl.replace(/^https?:\/\//, '');
    return `https://${cleanGatewayUrl}/ipfs/${cid}`;
  }
}
