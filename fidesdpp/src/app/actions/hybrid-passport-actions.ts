/**
 * Hybrid Passport Server Actions
 * 
 * Two-phase passport creation flow where signing happens in browser:
 * Phase 1: prepareCreatePassport (server prepares, no signing)
 * Phase 2: finalizeCreatePassport (server completes with signed data)
 * 
 * @license Apache-2.0
 */

'use server';

import { createDppService } from '@/lib/factory/createDppService';
import type { 
  CreatePassportFormInput, 
  PreparedPassportData,
  FinalizeCreatePassportInput,
  CreatePassportResult,
} from '@/lib/application/hybrid-types';

/**
 * PHASE 1: Prepare passport creation
 * 
 * This action runs on the server and prepares all data for passport creation
 * WITHOUT requiring private keys. Returns signable data for the browser.
 * 
 * @param input - Form data from browser
 * @returns Prepared data including VC signable payload
 */
export async function prepareCreatePassport(
  input: CreatePassportFormInput
): Promise<PreparedPassportData | { error: string }> {
  try {
    // Validate required fields
    if (!input.productId || !input.productName) {
      return { error: 'Product ID and Name are required' };
    }

    if (!input.manufacturer?.name || !input.manufacturer?.identifier) {
      return { error: 'Manufacturer name and identifier are required' };
    }

    if (!input.issuerAddress || !input.issuerPublicKey) {
      return { error: 'Issuer address and public key are required' };
    }
    
    // CRITICAL: Validate public key format and length for ed25519
    const publicKeyHex = input.issuerPublicKey.replace('0x', '');
    if (publicKeyHex.length !== 64) { // 32 bytes = 64 hex chars
      return { 
        error: `Invalid public key length: expected 64 hex characters (32 bytes for ed25519), got ${publicKeyHex.length}. ` +
               `Ensure you are using ed25519 keys, not sr25519.`
      };
    }

    // Validate granularity-specific fields
    if (input.granularity === 'Batch' && !input.batchNumber) {
      return { error: 'Batch Number is required for Batch granularity' };
    }
    if (input.granularity === 'Item' && !input.serialNumber) {
      return { error: 'Serial Number is required for Item granularity' };
    }

    // Validate did:web authorization if enabled
    if (input.useDidWeb) {
      // issuerDid is required when useDidWeb=true
      if (!input.issuerDid) {
        return { error: 'Issuer DID is required when using did:web.' };
      }

      // Validate issuer exists and is VERIFIED, and wallet is authorized
      const { getDidWebManager, IssuerStatus } = await import('@/lib/vc/did-web-manager');
      const manager = getDidWebManager();
      
      // Reload from storage to ensure we have the latest data (important for JSON storage)
      // This handles the case where the issuer was registered after the server started
      await manager.reload();
      
      const identity = await manager.getIssuerIdentity(input.issuerDid);
      if (!identity) {
        // Check if DID is accessible publicly (better error message)
        const didUrl = manager.didWebToUrl(input.issuerDid);
        try {
          const response = await fetch(didUrl);
          if (response.ok) {
            return { 
              error: `Issuer ${input.issuerDid} is published but not registered locally. ` +
                     `To sign VC-JWT server-side, you must register the issuer locally with the same master key ` +
                     `used when publishing the DID. Run: npm run bootstrap:did-web (with the original DIDWEB_MASTER_KEY_HEX).`
            };
          }
        } catch {
          // Ignore fetch errors, use generic message
        }
        return { 
          error: `Issuer not found: ${input.issuerDid}. ` +
                 `Please register the issuer first with: npm run bootstrap:did-web`
        };
      }
      
      if (identity.status !== IssuerStatus.VERIFIED) {
        return { 
          error: `Issuer not verified (status: ${identity.status}). ` +
                 `Please publish did.json and verify the issuer before issuing credentials.` 
        };
      }
      
      // Check wallet authorization (remote check via polkadot-accounts.json)
      const network = input.network || 'asset-hub';
      let isAuthorized = false;
      try {
        isAuthorized = await manager.isPolkadotAccountAuthorizedRemote(
          input.issuerDid,
          input.issuerAddress,
          network
        );
      } catch (e: any) {
        return {
          error: `Authorization check unavailable: ${e.message || String(e)}`,
        };
      }
      
      if (!isAuthorized) {
        return { 
          error: `Wallet ${input.issuerAddress} is not authorized for issuer ${input.issuerDid}. ` +
                 `Add this address to the authorized accounts list.`
        };
      }
    }

    // Create DPP service
    const dppService = createDppService({
      ipfsBackend: (process.env.IPFS_BACKEND as any) || 'kubo',
      ipfsNodeUrl: process.env.IPFS_NODE_URL,
      contractAddress: process.env.CONTRACT_ADDRESS!,
      rpcUrl: process.env.POLKADOT_RPC_URL || process.env.RPC_URL!,
    });

    // Prepare passport (no signing)
    const prepared = await dppService.preparePassportCreation(input);

    return prepared;
  } catch (error: any) {
    console.error('Prepare passport error:', error);
    return { 
      error: error.message || 'Failed to prepare passport creation' 
    };
  }
}

/**
 * PHASE 2: Finalize passport creation
 * 
 * This action runs on the server and completes passport creation using
 * the signed VC-JWT from the browser. Uploads to IPFS and registers on-chain.
 * 
 * Note: This still requires signing the on-chain transaction, which will be
 * done using a server-side account or relayer in production. For now, we'll
 * need to pass a signer account.
 * 
 * @param input - Signed VC-JWT and correlation ID
 * @returns Final result with tokenId and CID
 */
export async function finalizeCreatePassport(
  input: FinalizeCreatePassportInput
): Promise<CreatePassportResult> {
  try {
    // Validate input
    if (!input.preparedId) {
      return { 
        success: false, 
        error: 'Prepared ID is required' 
      };
    }

    if (!input.signedVcJwt) {
      return { 
        success: false, 
        error: 'Signed VC-JWT is required' 
      };
    }

    if (!input.issuerAddress || !input.issuerPublicKey) {
      return { 
        success: false, 
        error: 'Issuer address and public key are required' 
      };
    }

    // Create DPP service
    const dppService = createDppService({
      ipfsBackend: (process.env.IPFS_BACKEND as any) || 'kubo',
      ipfsNodeUrl: process.env.IPFS_NODE_URL,
      contractAddress: process.env.CONTRACT_ADDRESS!,
      rpcUrl: process.env.POLKADOT_RPC_URL || process.env.RPC_URL!,
    });

    // Finalize passport creation
    // Note: On-chain transaction signing is now done in the browser using dedot
    // The server only uploads to IPFS and prepares registration data
    const result = await dppService.finalizePassportCreation(input);

    return result;
  } catch (error: any) {
    console.error('Finalize passport error:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to finalize passport creation' 
    };
  }
}
