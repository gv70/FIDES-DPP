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

import type { 
  IpfsStorageBackend, 
  UploadResult, 
  RetrieveResult, 
  UploadMetadata,
  IpfsConfig 
} from '../IpfsStorageBackend';
import { computeJsonHashSync, computeJwtHash } from '../IpfsStorageBackend';

export class KuboBackend implements IpfsStorageBackend {
  private nodeUrl: string;
  private gatewayUrl: string;
  private authHeader?: string;

  constructor(config?: IpfsConfig) {
    this.nodeUrl = config?.nodeUrl || process.env.IPFS_NODE_URL || 'http://127.0.0.1:5001';
    this.gatewayUrl = config?.gatewayUrl || process.env.IPFS_GATEWAY_URL || 'http://127.0.0.1:8080';
    
    // Support Basic Auth for remote nodes
    if (config?.accessToken) {
      this.authHeader = `Basic ${Buffer.from(config.accessToken).toString('base64')}`;
    }
  }

  getBackendType(): string {
    return 'kubo';
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.nodeUrl}/api/v0/version`, {
        method: 'POST',
        headers: this.authHeader ? { 'Authorization': this.authHeader } : {},
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  async uploadJson(data: object, metadata?: UploadMetadata): Promise<UploadResult> {
    // 1. Compute hash before upload (deterministic)
    const hash = computeJsonHashSync(data);
    
    // 2. Convert JSON to blob/file
    const jsonString = JSON.stringify(data, Object.keys(data).sort());
    const blob = new Blob([jsonString], { type: 'application/json' });
    
    // 3. Create multipart form data for Kubo API
    const formData = new FormData();
    const filename = metadata?.name || 'passport.json';
    formData.append('file', blob, filename);
    
    // 4. Upload to Kubo via /api/v0/add
    const addUrl = `${this.nodeUrl}/api/v0/add?pin=true&wrap-with-directory=false`;
    const headers: HeadersInit = {};
    if (this.authHeader) {
      headers['Authorization'] = this.authHeader;
    }
    
    const response = await fetch(addUrl, {
      method: 'POST',
      body: formData,
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Kubo upload failed: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    const cid = result.Hash;
    const size = parseInt(result.Size, 10);

    // 5. Optionally add metadata via IPNS or MFS (not implemented here)
    // For now, metadata is client-side only

    return {
      cid,
      hash,
      gatewayUrl: this.getGatewayUrl(cid),
      size,
    };
  }

  async retrieveJson(cid: string): Promise<RetrieveResult> {
    // Use /api/v0/cat to retrieve content
    const catUrl = `${this.nodeUrl}/api/v0/cat?arg=${encodeURIComponent(cid)}`;
    const headers: HeadersInit = {};
    if (this.authHeader) {
      headers['Authorization'] = this.authHeader;
    }

    const response = await fetch(catUrl, {
      method: 'POST',
      headers,
    });

    if (!response.ok) {
      throw new Error(`Kubo retrieval failed: ${response.status} ${await response.text()}`);
    }

    const jsonString = await response.text();
    
    try {
      const data = JSON.parse(jsonString);
      const hash = computeJsonHashSync(data);
      
      return {
        data,
        hash,
        cid,
      };
    } catch (error) {
      throw new Error(`Failed to parse JSON from CID ${cid}: ${error}`);
    }
  }

  async uploadText(text: string, metadata?: UploadMetadata): Promise<UploadResult> {
    // 1. Compute hash before upload (JWT string)
    const hash = computeJwtHash(text);
    
    // 2. Convert text to blob
    const blob = new Blob([text], { type: 'text/plain' });
    
    // 3. Prepare form data
    const formData = new FormData();
    formData.append('file', blob, metadata?.name || 'data.txt');
    
    // 4. Call /api/v0/add with pin=true to ensure content is pinned
    // CRITICAL: pin=true prevents garbage collection
    const addUrl = `${this.nodeUrl}/api/v0/add?pin=true&wrap-with-directory=false`;
    const headers: HeadersInit = {};
    if (this.authHeader) {
      headers['Authorization'] = this.authHeader;
    }

    const response = await fetch(addUrl, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Kubo text upload failed: ${response.status} ${await response.text()}`);
    }

    const result = await response.json();
    const cid = result.Hash;
    const size = parseInt(result.Size, 10);

    return {
      cid,
      hash,
      gatewayUrl: this.getGatewayUrl(cid),
      size,
    };
  }

  async retrieveText(cid: string): Promise<{ data: string; hash: string; cid: string }> {
    // Use /api/v0/cat to retrieve content
    const catUrl = `${this.nodeUrl}/api/v0/cat?arg=${encodeURIComponent(cid)}`;
    const headers: HeadersInit = {};
    if (this.authHeader) {
      headers['Authorization'] = this.authHeader;
    }

    const response = await fetch(catUrl, {
      method: 'POST',
      headers,
    });

    if (!response.ok) {
      throw new Error(`Kubo text retrieval failed: ${response.status} ${await response.text()}`);
    }

    const text = await response.text();
    const hash = computeJwtHash(text);
    
    return {
      data: text,
      hash,
      cid,
    };
  }

  getGatewayUrl(cid: string): string {
    // Remove trailing slash if present
    const cleanGatewayUrl = this.gatewayUrl.replace(/\/$/, '');
    return `${cleanGatewayUrl}/ipfs/${cid}`;
  }
}
