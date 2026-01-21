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

import type { 
  IpfsStorageBackend, 
  UploadResult, 
  RetrieveResult, 
  UploadMetadata,
  IpfsConfig 
} from '../IpfsStorageBackend';
import { computeBytesHash, computeJsonHashSync, computeJwtHash } from '../IpfsStorageBackend';

// Dynamic imports to avoid bundling issues
let heliaInstance: any = null;

export class HeliaBackend implements IpfsStorageBackend {
  private gatewayUrl: string;
  private helia: any = null;
  private json: any = null;
  private unixfs: any = null;
  private initialized: boolean = false;

  constructor(config?: IpfsConfig) {
    this.gatewayUrl = config?.gatewayUrl || process.env.IPFS_GATEWAY_URL || 'https://ipfs.io';
  }

  getBackendType(): string {
    return 'helia';
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.ensureInitialized();
      return true;
    } catch (error) {
      console.error('Helia not available:', error);
      return false;
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized && this.helia) {
      return;
    }

    try {
      // Dynamic import to avoid bundling when not needed
      const { createHelia } = await import('helia');
      const { json } = await import('@helia/json');
      const { unixfs } = await import('@helia/unixfs');
      
      if (!heliaInstance) {
        heliaInstance = await createHelia();
      }
      
      this.helia = heliaInstance;
      this.json = json(this.helia);
      this.unixfs = unixfs(this.helia);
      this.initialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize Helia: ${error}. Make sure to install: npm install helia @helia/json @helia/unixfs`);
    }
  }

  async uploadJson(data: object, metadata?: UploadMetadata): Promise<UploadResult> {
    await this.ensureInitialized();
    
    // 1. Compute hash before upload (deterministic)
    const hash = computeJsonHashSync(data);
    
    // 2. Add JSON to Helia
    // Helia automatically pins content by default
    const cid = await this.json.add(data);
    
    // 3. Get size (estimate from JSON string)
    const jsonString = JSON.stringify(data, Object.keys(data).sort());
    const size = new Blob([jsonString]).size;

    return {
      cid: cid.toString(),
      hash,
      gatewayUrl: this.getGatewayUrl(cid.toString()),
      size,
    };
  }

  async retrieveJson(cid: string): Promise<RetrieveResult> {
    await this.ensureInitialized();
    
    try {
      // Parse CID string
      const { CID } = await import('multiformats/cid');
      const cidObj = CID.parse(cid);
      
      // Retrieve from Helia
      const data = await this.json.get(cidObj);
      
      // Compute hash for verification
      const hash = computeJsonHashSync(data);
      
      return {
        data,
        hash,
        cid,
      };
    } catch (error) {
      // If not found locally, try to fetch from gateway
      try {
        const gatewayUrl = this.getGatewayUrl(cid);
        const response = await fetch(gatewayUrl);
        
        if (!response.ok) {
          throw new Error(`Gateway fetch failed: ${response.status}`);
        }
        
        const data = await response.json();
        const hash = computeJsonHashSync(data);
        
        // Store in Helia for future retrievals
        await this.json.add(data);
        
        return {
          data,
          hash,
          cid,
        };
      } catch (gatewayError) {
        throw new Error(`Failed to retrieve CID ${cid}: ${error}. Gateway fallback also failed: ${gatewayError}`);
      }
    }
  }

  async uploadText(text: string, metadata?: UploadMetadata): Promise<UploadResult> {
    await this.ensureInitialized();
    
    // Compute hash before upload
    const hash = computeJwtHash(text);
    
    // Convert text to Uint8Array and upload using UnixFS
    const textEncoder = new TextEncoder();
    const bytes = textEncoder.encode(text);
    
    const addResult = await this.unixfs!.addBytes(bytes);
    const cid = addResult.toString();
    
    return {
      cid,
      hash,
      gatewayUrl: this.getGatewayUrl(cid),
      size: bytes.length,
    };
  }

  async uploadBytes(bytes: Uint8Array, metadata?: UploadMetadata): Promise<UploadResult> {
    await this.ensureInitialized();

    const hash = computeBytesHash(bytes);
    const addResult = await this.unixfs!.addBytes(bytes);
    const cid = addResult.toString();

    return {
      cid,
      hash,
      gatewayUrl: this.getGatewayUrl(cid),
      size: bytes.length,
    };
  }

  async retrieveText(cid: string): Promise<{ data: string; hash: string; cid: string }> {
    await this.ensureInitialized();
    
    try {
      // Retrieve bytes from Helia
      const bytes = await this.unixfs!.cat(cid);
      
      // Convert Uint8Array to string
      const chunks: Uint8Array[] = [];
      for await (const chunk of bytes) {
        chunks.push(chunk);
      }
      
      // Concatenate chunks
      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
      const result = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }
      
      // Decode to string
      const textDecoder = new TextDecoder();
      const text = textDecoder.decode(result);
      const hash = computeJwtHash(text);
      
      return {
        data: text,
        hash,
        cid,
      };
    } catch (error: any) {
      // If not found locally, try to fetch from gateway
      try {
        const gatewayUrl = this.getGatewayUrl(cid);
        const response = await fetch(gatewayUrl);
        
        if (!response.ok) {
          throw new Error(`Gateway fetch failed: ${response.status}`);
        }
        
        const text = await response.text();
        const hash = computeJwtHash(text);
        
        // Store in Helia for future retrievals
        const textEncoder = new TextEncoder();
        await this.unixfs!.addBytes(textEncoder.encode(text));
        
        return {
          data: text,
          hash,
          cid,
        };
      } catch (gatewayError) {
        throw new Error(`Failed to retrieve CID ${cid}: ${error}. Gateway fallback also failed: ${gatewayError}`);
      }
    }
  }

  getGatewayUrl(cid: string): string {
    // Remove trailing slash if present
    const cleanGatewayUrl = this.gatewayUrl.replace(/\/$/, '');
    // Remove protocol if present in gateway URL
    const gatewayWithoutProtocol = cleanGatewayUrl.replace(/^https?:\/\//, '');
    return `https://${gatewayWithoutProtocol}/ipfs/${cid}`;
  }

  /**
   * Stop Helia instance (cleanup)
   */
  async stop(): Promise<void> {
    if (this.helia) {
      await this.helia.stop();
      this.helia = null;
      this.json = null;
      this.initialized = false;
      heliaInstance = null;
    }
  }
}
