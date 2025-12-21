/**
 * Passport Server Actions
 * 
 * Next.js server actions for DPP operations
 * Integrates with DppApplicationService
 * 
 * @license Apache-2.0
 */

'use server';

import { createDppService } from '@/lib/factory/createDppService';
import type { CreatePassportInput } from '@/lib/application/types';

/**
 * Create a new Digital Product Passport
 * 
 * This action:
 * 1. Issues a VC for the DPP
 * 2. Stores it in IPFS
 * 3. Registers it on-chain
 * 
 * @param formData - Form data from the UI
 * @returns Result with tokenId, CID, and txHash, or error
 */
export async function createPassportAction(formData: FormData) {
  try {
    // Note: In a real implementation, you would get the connected account
    // from the wallet integration (polkadot.js extension)
    // For now, this is a placeholder showing the structure
    
    // TODO: Implement getConnectedAccount() helper
    // const account = await getConnectedAccount();
    // if (!account) {
    //   return { error: 'No wallet connected' };
    // }

    // Extract form data
    const granularityValue = formData.get('granularity') as string;
    const validGranularities = ['ProductClass', 'Batch', 'Item'] as const;
    const granularity: 'ProductClass' | 'Batch' | 'Item' = 
      validGranularities.includes(granularityValue as any) 
        ? (granularityValue as 'ProductClass' | 'Batch' | 'Item')
        : 'ProductClass'; // Default to ProductClass if not provided or invalid
    
    const input: CreatePassportInput = {
      granularity,
      productId: formData.get('productId') as string,
      productName: formData.get('productName') as string,
      productDescription: formData.get('productDescription') as string || undefined,
      batchNumber: formData.get('batchNumber') as string || undefined,
      serialNumber: formData.get('serialNumber') as string || undefined,
      manufacturer: {
        name: formData.get('manufacturerName') as string,
        identifier: formData.get('manufacturerIdentifier') as string || undefined,
        country: formData.get('manufacturerCountry') as string || undefined,
      },
    };

    // Validate required fields
    if (!input.productId || !input.productName) {
      return { error: 'Product ID and Name are required' };
    }
    
    // Validate granularity-specific requirements
    if (input.granularity === 'Batch' && !input.batchNumber) {
      return { error: 'Batch number is required when granularity is Batch' };
    }
    if (input.granularity === 'Item' && !input.serialNumber) {
      return { error: 'Serial number is required when granularity is Item' };
    }

    // Create DPP service (FOSS-only mode by default)
    const dppService = createDppService({
      ipfsBackend: (process.env.IPFS_BACKEND as any) || 'kubo',
      contractAddress: process.env.CONTRACT_ADDRESS!,
      rpcUrl: process.env.RPC_URL!,
    });

    // TODO: Create passport once chain adapter is implemented
    // const result = await dppService.createPassport(input, account);

    // Placeholder response
    return {
      error: 'Chain adapter not yet implemented. VC and IPFS layers are ready.',
      info: 'The VC will be issued and stored in IPFS once chain integration is complete.',
    };

    // When implemented, return:
    // return {
    //   success: true,
    //   tokenId: result.tokenId,
    //   cid: result.cid,
    //   txHash: result.txHash,
    //   vcJwt: result.vcJwt.substring(0, 50) + '...',
    // };
  } catch (error: any) {
    console.error('Create passport error:', error);
    return {
      error: error.message || 'Failed to create passport',
    };
  }
}

/**
 * Verify a Digital Product Passport
 * 
 * This action:
 * 1. Reads on-chain data
 * 2. Retrieves VC from IPFS
 * 3. Verifies the VC
 * 4. Checks hash integrity and issuer
 * 
 * @param tokenId - Token ID to verify
 * @returns Verification report
 */
export async function verifyPassportAction(tokenId: string) {
  try {
    if (!tokenId) {
      return { error: 'Token ID is required' };
    }

    const dppService = createDppService({
      ipfsBackend: (process.env.IPFS_BACKEND as any) || 'kubo',
      contractAddress: process.env.CONTRACT_ADDRESS!,
      rpcUrl: process.env.RPC_URL!,
    });

    // TODO: Verify passport once chain adapter is implemented
    // const report = await dppService.verifyPassport(tokenId);

    // Placeholder response
    return {
      error: 'Chain adapter not yet implemented',
      info: 'Verification will work once chain integration is complete',
    };

    // When implemented, return:
    // return {
    //   success: true,
    //   report,
    // };
  } catch (error: any) {
    console.error('Verify passport error:', error);
    return {
      error: error.message || 'Failed to verify passport',
    };
  }
}

/**
 * Update passport dataset
 * 
 * @param tokenId - Token ID to update
 * @param updatedData - Updated DPP data
 * @returns Result with new CID and txHash
 */
export async function updatePassportAction(
  tokenId: string,
  updatedData: CreatePassportInput
) {
  try {
    if (!tokenId) {
      return { error: 'Token ID is required' };
    }

    // TODO: Implement once chain adapter is ready
    return {
      error: 'Chain adapter not yet implemented',
    };
  } catch (error: any) {
    console.error('Update passport error:', error);
    return {
      error: error.message || 'Failed to update passport',
    };
  }
}

/**
 * Revoke a passport
 * 
 * @param tokenId - Token ID to revoke
 * @param reason - Optional revocation reason
 * @returns Transaction result
 */
export async function revokePassportAction(
  tokenId: string,
  reason?: string
) {
  try {
    if (!tokenId) {
      return { error: 'Token ID is required' };
    }

    // TODO: Implement once chain adapter is ready
    return {
      error: 'Chain adapter not yet implemented',
    };
  } catch (error: any) {
    console.error('Revoke passport error:', error);
    return {
      error: error.message || 'Failed to revoke passport',
    };
  }
}
