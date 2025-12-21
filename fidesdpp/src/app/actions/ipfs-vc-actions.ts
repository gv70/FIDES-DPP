/**
 * IPFS VC Upload Server Action
 * 
 * Uploads a signed VC-JWT to IPFS and returns CID and hash.
 * Used in the direct contract flow (not hybrid flow).
 * 
 * @license Apache-2.0
 */

'use server';

import { createIpfsBackend } from '@/lib/ipfs/IpfsStorageFactory';
import { computeJwtHash } from '@/lib/ipfs/IpfsStorageBackend';

export interface UploadVcJwtResult {
  success: boolean;
  cid?: string;
  hash?: string; // SHA-256 hash of JWT string (0x...)
  url?: string;
  size?: number;
  error?: string;
}

/**
 * Upload signed VC-JWT to IPFS
 * 
 * This action:
 * 1. Validates the VC-JWT format
 * 2. Uploads raw JWT string to IPFS
 * 3. Computes SHA-256 hash of JWT string
 * 4. Returns CID and hash for on-chain registration
 * 
 * @param vcJwt - Signed VC-JWT string (raw JWT, not JSON wrapper)
 * @param metadata - Optional metadata for IPFS (name, keyvalues)
 * @returns Upload result with CID and hash
 */
export async function uploadVcJwtToIpfs(
  vcJwt: string,
  metadata?: {
    name?: string;
    granularity?: string;
    productId?: string;
  }
): Promise<UploadVcJwtResult> {
  try {
    // Validate VC-JWT format (basic check)
    if (!vcJwt || typeof vcJwt !== 'string') {
      return { 
        success: false, 
        error: 'VC-JWT must be a non-empty string' 
      };
    }

    // Check JWT format (should have 3 parts separated by dots)
    const parts = vcJwt.split('.');
    if (parts.length !== 3) {
      return { 
        success: false, 
        error: 'Invalid VC-JWT format. Expected format: header.payload.signature' 
      };
    }

    // Create IPFS backend
    const backend = createIpfsBackend();
    
    // Check if backend is available
    const isAvailable = await backend.isAvailable();
    if (!isAvailable) {
      return {
        success: false,
        error: `IPFS backend (${backend.getBackendType()}) is not available. Check configuration.`,
      };
    }

    // Upload raw JWT string to IPFS
    const storageResult = await backend.uploadText(vcJwt, {
      name: metadata?.name || `dpp-vc-${Date.now()}.jwt`,
      keyvalues: {
        'type': 'verifiable-credential',
        'format': 'vc+jwt',
        ...(metadata?.granularity && { 'granularity': metadata.granularity }),
        ...(metadata?.productId && { 'product-id': metadata.productId }),
      },
    });
    
    // Compute SHA-256 hash of JWT string (for on-chain payload_hash)
    const payloadHash = computeJwtHash(vcJwt);

    return {
      success: true,
      cid: storageResult.cid,
      hash: payloadHash, // SHA-256 hash (0x...)
      url: storageResult.gatewayUrl,
      size: storageResult.size,
    };
  } catch (error: any) {
    console.error('Upload VC-JWT to IPFS error:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to upload VC-JWT to IPFS' 
    };
  }
}
