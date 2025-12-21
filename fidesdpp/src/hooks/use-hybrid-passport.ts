/**
 * Hybrid Passport Creation Hook
 * 
 * React hook for two-phase passport creation with browser-side signing
 * 
 * @license Apache-2.0
 */

'use client';

import { useState, useMemo } from 'react';
import { useTypink, useContract } from 'typink';
import { Contract } from 'dedot/contracts';
import { ContractId, deployments } from '@/contracts/deployments';
import type { DppContractContractApi } from '@/contracts/types/dpp-contract';
import type { 
  CreatePassportFormInput, 
  PreparedPassportData,
  FinalizeCreatePassportInput,
  CreatePassportResult,
  PassportRegistrationData,
} from '@/lib/application/hybrid-types';
import { prepareCreatePassport, finalizeCreatePassport } from '@/app/actions/hybrid-passport-actions';
import { toast } from 'sonner';

export type HybridFlowPhase = 'idle' | 'preparing' | 'signing' | 'finalizing' | 'complete' | 'error';

export interface UseHybridPassportReturn {
  phase: HybridFlowPhase;
  preparedData: PreparedPassportData | null;
  result: CreatePassportResult | null;
  error: string | null;
  createPassport: (input: Omit<CreatePassportFormInput, 'issuerAddress' | 'issuerPublicKey' | 'network'>) => Promise<void>;
  reset: () => void;
}

/**
 * Hook for hybrid passport creation flow
 * 
 * Usage:
 * ```tsx
 * const { createPassport, phase, result } = useHybridPassport();
 * 
 * // User fills form and submits
 * await createPassport({
 *   productId: '...',
 *   productName: '...',
 *   granularity: 'Batch',
 *   // ...
 * });
 * 
 * // Hook handles:
 * // 1. Call server to prepare
 * // 2. Sign in browser using wallet
 * // 3. Call server to finalize
 * ```
 */
export function useHybridPassport(): UseHybridPassportReturn {
  const { connectedAccount, client } = useTypink();
  
  // Create contract manually (same pattern as dpp-contract-test.tsx)
  // This ensures metadata is properly initialized
  const contract = useMemo(() => {
    if (!client) return null;
    
    try {
      const deployment = deployments.find(d => d.id === ContractId.DPP_CONTRACT);
      if (!deployment || !deployment.address) return null;
      
      return new Contract<DppContractContractApi>(
        client,
        deployment.metadata as any,
        deployment.address as `0x${string}`
      );
    } catch (e) {
      console.error('[useHybridPassport] Failed to create contract instance:', e);
      return null;
    }
  }, [client]);
  const [phase, setPhase] = useState<HybridFlowPhase>('idle');
  const [preparedData, setPreparedData] = useState<PreparedPassportData | null>(null);
  const [result, setResult] = useState<CreatePassportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setPhase('idle');
    setPreparedData(null);
    setResult(null);
    setError(null);
  };

  const createPassport = async (
    input: Omit<CreatePassportFormInput, 'issuerAddress' | 'issuerPublicKey' | 'network'>
  ) => {
    try {
      // Check wallet connection
      if (!connectedAccount) {
        throw new Error('No wallet connected. Please connect your Polkadot.js extension.');
      }

      // Phase 1: Prepare (server-side, no signing)
      setPhase('preparing');
      toast.info('Preparing passport creation...');

      // Extract public key from connected account
      // CRITICAL: Only ed25519 keys are supported for VC-JWT (EdDSA algorithm)
      // sr25519 is NOT JWS-standard and will fail verification
      
      // Check key type if available
      const keyType = (connectedAccount as any).type || (connectedAccount as any).meta?.type;
      const useDidWeb = input.useDidWeb ?? false;
      
      // Only block sr25519 for did:key path (wallet signs VC-JWT directly)
      // For did:web path, wallet only signs on-chain tx (any key type ok)
      if (!useDidWeb && keyType === 'sr25519') {
        throw new Error(
          'Sr25519 keys are NOT supported for did:key VC-JWT signing. ' +
          'Only ed25519 is compatible with EdDSA algorithm. ' +
          'Either use ed25519 keys, or use did:web path (which supports any wallet key type).'
        );
      }
      
      // Try direct access first, then decode from address if needed
      let publicKeyBytes: Uint8Array;
      const accountPublicKey = (connectedAccount as any).publicKey;
      
      if (accountPublicKey && accountPublicKey instanceof Uint8Array && accountPublicKey.length === 32) {
        publicKeyBytes = accountPublicKey;
      } else {
        // Fallback: decode from SS58 address using @polkadot/util-crypto
        // WARNING: This doesn't tell us if it's ed25519 or sr25519!
        // We rely on the keyType check above
        try {
          const { decodeAddress } = require('@polkadot/util-crypto');
          publicKeyBytes = decodeAddress(connectedAccount.address);
          if (!publicKeyBytes || publicKeyBytes.length !== 32) {
            throw new Error('Decoded public key has invalid length');
          }
        } catch (decodeError: any) {
          throw new Error(
            `Cannot extract public key from connected account: ${decodeError.message}. ` +
            'Please ensure your wallet extension is properly connected and supports ed25519 keys.'
          );
        }
      }
      
      // Final validation: ensure we have exactly 32 bytes (ed25519 requirement)
      if (publicKeyBytes.length !== 32) {
        throw new Error(
          `Invalid public key length: expected 32 bytes for ed25519, got ${publicKeyBytes.length}. ` +
          'This may indicate the account uses sr25519 keys, which are NOT supported for VC-JWT.'
        );
      }

      // Store publicKeyBytes for later use in finalize
      const issuerPublicKeyHex = `0x${Buffer.from(publicKeyBytes).toString('hex')}`;

      // Build form input with issuer info
      const formInput: CreatePassportFormInput = {
        ...input,
        issuerAddress: connectedAccount.address, // For chainAnchor (any wallet type)
        issuerPublicKey: issuerPublicKeyHex, // Required field, but not used for did:web
        network: 'westend-asset-hub',
        // did:web support
        useDidWeb: input.useDidWeb ?? false,
        issuerDid: input.issuerDid,
      };

      // Validate did:web input if enabled
      if (formInput.useDidWeb && !formInput.issuerDid) {
        throw new Error('Issuer DID is required when using did:web. Please register an issuer first.');
      }

      const prepared = await prepareCreatePassport(formInput);

      // Check for errors
      if ('error' in prepared) {
        throw new Error(prepared.error);
      }

      setPreparedData(prepared);
      toast.success('Passport prepared! Ready to sign...');

      // Phase 2: Sign (browser-side, using wallet)
      setPhase('signing');
      toast.info('Please sign the VC-JWT in your wallet...');

      // Convert signing input to bytes
      const signingInputBytes = new TextEncoder().encode(prepared.vcSignablePayload.signingInput);

      // Sign using Polkadot.js extension
      // Note: We use signRaw which returns a signature object
      let signature: Uint8Array;
      
      try {
        // Method 1: Try to get the injected signer from window.injectedWeb3
        const walletName = connectedAccount.source || 'polkadot-js';
        const injected = await (window as any).injectedWeb3?.[walletName];
        
        if (injected) {
          // Enable the extension for this account
          let signer = injected.signer;
          
          // Some wallets require enabling first
          if (injected.enable) {
            const enabled = await injected.enable();
            if (enabled && enabled.signer) {
              signer = enabled.signer;
            }
          }

          if (signer) {
            // Try signRaw first (preferred method)
            if (signer.signRaw) {
              console.log('Using signRaw method');
              const signResult = await signer.signRaw({
                address: connectedAccount.address,
                data: Buffer.from(signingInputBytes).toString('hex'),
                type: 'bytes',
              });

              // Extract signature bytes (remove 0x prefix if present)
              const sigHex = signResult.signature.replace(/^0x/, '');
              signature = Buffer.from(sigHex, 'hex');
            }
            // Fallback to signMessage if available
            else if (signer.signMessage) {
              console.log('Using signMessage method');
              const signResult = await signer.signMessage(prepared.vcSignablePayload.signingInput);
              const sigHex = signResult.signature.replace(/^0x/, '');
              signature = Buffer.from(sigHex, 'hex');
            }
            else {
              console.error('Signer methods available:', Object.keys(signer));
              throw new Error(`Wallet does not support raw signing. Available methods: ${Object.keys(signer).join(', ')}`);
            }
          } else {
            throw new Error('Wallet signer not available');
          }
        } else {
          throw new Error(`Wallet extension "${walletName}" not found in window.injectedWeb3`);
        }
      } catch (signError: any) {
        // Fallback: try using the account's sign method if available
        const accountAny = connectedAccount as any;
        if (accountAny?.sign && typeof accountAny.sign === 'function') {
          console.log('Using account.sign fallback method');
          try {
            signature = await accountAny.sign(signingInputBytes);
          } catch (fallbackError: any) {
            throw new Error(`Signing failed: ${signError.message}. Fallback also failed: ${fallbackError.message}`);
          }
        } else {
          // Provide helpful error message
          const walletName = connectedAccount.source || 'unknown';
          throw new Error(
            `Signing failed: ${signError.message}. ` +
            `Wallet "${walletName}" may not support raw signing. ` +
            `Please try using Polkadot.js extension or ensure your wallet extension is unlocked and the account is authorized.`
          );
        }
      }

      // Build signed VC-JWT: header.payload.signature
      const signatureB64 = base64UrlEncode(signature);
      const signedVcJwt = `${prepared.vcSignablePayload.signingInput}.${signatureB64}`;

      toast.success('VC-JWT signed!');

      // Phase 3: Finalize (server upload + browser on-chain submission)
      setPhase('finalizing');
      toast.info('Finalizing passport creation...');

      const finalizeInput: FinalizeCreatePassportInput = {
        preparedId: prepared.preparedId,
        signedVcJwt,
        issuerAddress: connectedAccount.address,
        issuerPublicKey: issuerPublicKeyHex, // Use the public key we extracted earlier
      };

      // 3a. Server uploads to IPFS and prepares registration data
      const finalResult = await finalizeCreatePassport(finalizeInput);

      if (!finalResult.success) {
        throw new Error(finalResult.error || 'Failed to finalize passport');
      }

      // 3b. Browser constructs, signs, and submits on-chain transaction using dedot
      if (!finalResult.registrationData) {
        throw new Error('Registration data not returned from server');
      }

      if (!contract || !connectedAccount) {
        throw new Error('Contract or account not available for on-chain submission');
      }

      toast.info('Submitting transaction to blockchain...');

      // Check contract is available
      if (!contract) {
        console.error('[useHybridPassport] Contract not available:', {
          hasClient: !!client,
          hasConnectedAccount: !!connectedAccount,
          contractType: typeof contract,
        });
        throw new Error('Contract not loaded. Please ensure the contract is deployed and the client is connected.');
      }

      if (!client) {
        throw new Error('Polkadot client not connected. Please check your RPC connection.');
      }

      // Sanity check: ensure the contract at this address matches the ABI.
      // If the address/metadata is mismatched, ink! often fails with LangError::CouldNotReadInput.
      let expectedTokenId: string | null = null;
      try {
        const nextTokenIdQuery = (contract as any).query?.nextTokenId;
        if (typeof nextTokenIdQuery !== 'function') {
          throw new Error('Contract query nextTokenId is not available.');
        }

        const caller = connectedAccount.address;
        const callerForQuery = (() => {
          try {
            const { decodeAddress } = require('@polkadot/util-crypto');
            return decodeAddress(caller);
          } catch {
            return caller;
          }
        })();

        const sanity = await nextTokenIdQuery({ caller: callerForQuery });

        if (!sanity || typeof sanity.data !== 'bigint') {
          throw new Error('Contract query nextTokenId returned an unexpected result.');
        }

        // Predict the next token id (useful fallback if event decoding fails).
        expectedTokenId = sanity.data.toString();
      } catch (sanityError: any) {
        throw new Error(
          `Contract check failed. Please verify NEXT_PUBLIC_CONTRACT_ADDRESS and contract metadata. ` +
            `Details: ${sanityError.message || String(sanityError)}`
        );
      }

      // Debug: log contract structure
      console.log('[useHybridPassport] Contract available:', {
        hasTx: !!contract.tx,
        hasRegisterPassport: !!contract.tx?.registerPassport,
        contractKeys: Object.keys(contract || {}),
      });

      const registrationData: PassportRegistrationData = finalResult.registrationData;

      // Debug: log the entire registrationData structure
      console.log('[useHybridPassport] Registration data received:', {
        hasRegistrationData: !!registrationData,
        registrationDataKeys: registrationData ? Object.keys(registrationData) : [],
        payloadHash: registrationData?.payloadHash,
        payloadHashType: typeof registrationData?.payloadHash,
        payloadHashConstructor: registrationData?.payloadHash?.constructor?.name,
        subjectIdHash: registrationData?.subjectIdHash,
        subjectIdHashType: typeof registrationData?.subjectIdHash,
        subjectIdHashConstructor: registrationData?.subjectIdHash?.constructor?.name,
      });

      // Dedot encodes ink! enums from string variants (e.g. 'Batch')
      const granularity = registrationData.granularity;

      // Normalize hex strings for dedot FixedBytes<32>
      // Based on dpp-contract-test.tsx, dedot accepts hex strings "0x..." for FixedBytes<32>
      const normalizeHex = (hex: any, paramName: string): string => {
        // Debug: log the type and value
        console.log(`[useHybridPassport] Normalizing ${paramName}:`, {
          type: typeof hex,
          isString: typeof hex === 'string',
          isNull: hex === null,
          isUndefined: hex === undefined,
          value: typeof hex === 'string' ? hex.substring(0, 20) + '...' : String(hex).substring(0, 50),
          constructor: hex?.constructor?.name,
        });

        // If already a string, validate and ensure "0x" prefix
        if (typeof hex === 'string') {
          const normalized = hex.startsWith('0x') ? hex : `0x${hex}`;
          // Validate length: 0x + 64 hex chars = 66 total
          if (normalized.length !== 66) {
            throw new Error(`Invalid ${paramName} length: expected 66 characters (0x + 64 hex), got ${normalized.length}`);
          }
          return normalized;
        }

        // If not a string, try to convert
        if (hex && typeof hex.toString === 'function') {
          const hexString = hex.toString();
          const normalized = hexString.startsWith('0x') ? hexString : `0x${hexString}`;
          if (normalized.length !== 66) {
            throw new Error(`Invalid ${paramName} length: expected 66 characters (0x + 64 hex), got ${normalized.length}`);
          }
          return normalized;
        }

        throw new Error(`Invalid ${paramName} type: expected string, got ${typeof hex} (${hex?.constructor?.name || 'unknown'})`);
      };

      let payloadHashHex: string;
      let subjectIdHashHex: string | undefined;

      try {
        payloadHashHex = normalizeHex(registrationData.payloadHash, 'payloadHash');
        subjectIdHashHex = registrationData.subjectIdHash 
          ? normalizeHex(registrationData.subjectIdHash, 'subjectIdHash')
          : undefined;
      } catch (conversionError: any) {
        console.error('[useHybridPassport] Error normalizing hashes:', conversionError);
        throw new Error(`Failed to normalize hashes: ${conversionError.message}`);
      }

      // Call contract.tx.registerPassport using dedot
      // Based on dpp-contract-test.tsx: dedot expects hex strings "0x..." for FixedBytes<32>
      // Parameters: datasetUri, payloadHash (hex string), datasetType, granularity, subjectIdHash (hex string or undefined), options (last)
      if (!contract.tx || !contract.tx.registerPassport) {
        throw new Error('Contract method registerPassport not available. Please check contract deployment and ABI.');
      }

      console.log('[useHybridPassport] Calling registerPassport with:', {
        datasetUri: registrationData.datasetUri,
        datasetUriType: typeof registrationData.datasetUri,
        payloadHashHex: payloadHashHex.substring(0, 20) + '...',
        payloadHashHexLength: payloadHashHex.length,
        payloadHashHexType: typeof payloadHashHex,
        datasetType: registrationData.datasetType,
        datasetTypeType: typeof registrationData.datasetType,
        granularity,
        granularityType: typeof granularity,
        subjectIdHashHex: subjectIdHashHex ? subjectIdHashHex.substring(0, 20) + '...' : 'undefined',
        subjectIdHashHexType: typeof subjectIdHashHex,
      });

      // Debug: check contract structure without logging (logging causes serialization errors with dedot)
      const hasRegisterPassport = typeof (contract as any)?.tx?.registerPassport === 'function';
      console.log('[useHybridPassport] Contract initialized:', {
        hasContract: !!contract,
        hasTx: !!((contract as any)?.tx),
        hasRegisterPassport,
      });
      
      // Verify registerPassport exists
      if (!hasRegisterPassport) {
        console.error('[useHybridPassport] registerPassport not found! Contract may not be properly initialized.');
        throw new Error('registerPassport method not found on contract. Contract may not be properly initialized.');
      }

      // Verify contract is fully initialized
      if (!contract || !(contract as any).tx) {
        throw new Error('Contract or contract.tx is not available');
      }

      // Verify contract has metadata (required for dedot to serialize messages)
      // Note: metadata might be a private field, so we check if the contract has the necessary methods
      const hasMetadata = !!(contract as any).metadata || 
                         (typeof (contract as any).tx?.registerPassport === 'function');
      
      if (!hasMetadata) {
        console.error('[useHybridPassport] Contract may be missing metadata!', {
          hasMetadata: !!(contract as any).metadata,
          contractKeys: Object.keys(contract || {}),
          txKeys: Object.keys((contract as any).tx || {}),
        });
        // Don't throw here - let dedot handle it, but log for debugging
      }

      // Verify registerPassport exists and is a function
      if (typeof (contract as any).tx.registerPassport !== 'function') {
        throw new Error('registerPassport is not a function on contract.tx');
      }

      console.log('[useHybridPassport] About to call registerPassport with params:', {
        datasetUri: registrationData.datasetUri,
        payloadHashHex,
        datasetType: registrationData.datasetType,
        granularity,
        subjectIdHashHex,
      });

      let tx: any;
      try {
        // Call registerPassport directly (same pattern as dpp-contract-test.tsx)
        // dedot expects FixedBytes<32> as hex strings "0x..."
        console.log('[useHybridPassport] Calling registerPassport with:', {
          datasetUri: registrationData.datasetUri,
          payloadHash: payloadHashHex,
          datasetType: registrationData.datasetType,
          granularity,
          subjectIdHash: subjectIdHashHex,
        });
        
        tx = (contract as any).tx.registerPassport(
          registrationData.datasetUri,
          payloadHashHex, // FixedBytes<32> - hex string "0x..." (dedot will convert internally)
          registrationData.datasetType,
          granularity,
          subjectIdHashHex, // FixedBytes<32> | undefined - hex string "0x..." or undefined
        );
        
        console.log('[useHybridPassport] Transaction created successfully:', {
          txType: typeof tx,
          hasSignAndSend: typeof tx?.signAndSend === 'function',
        });
      } catch (txError: any) {
        console.error('[useHybridPassport] Error creating transaction:', txError);
        throw new Error(`Failed to create transaction: ${txError.message}`);
      }

      // Sign and submit, extract tokenId from events
      let createdTokenId: string | null = null;
      let txHash: string | null = null;
      let blockNumber: number | null = null;

      await new Promise<void>((resolve, reject) => {
        tx.signAndSend(
          connectedAccount.address,
          async (progress: any) => {
            // Handle progress updates
            const status = progress.status || progress;
            const dispatchError = progress.dispatchError;
            const events = progress.events || [];

            // Extract txHash if available
            if (progress.txHash) {
              txHash = String(progress.txHash);
            } else if (status?.asInBlock) {
              txHash = String(status.asInBlock.toHex?.() || status.asInBlock);
            } else if (status?.asFinalized) {
              txHash = String(status.asFinalized.toHex?.() || status.asFinalized);
            }

            // Extract tokenId from PassportRegistered event
            // dedot events structure: events[] -> { event: { section, method, data } }
            for (const evt of events) {
              const event = evt.event || evt;
              console.log('Event received:', {
                section: event.section,
                method: event.method,
                data: event.data,
              });
              
              // Look for PassportRegistered event
              // Contract events are wrapped in contracts.ContractEmitted
              if (event.section === 'contracts' && event.method === 'ContractEmitted') {
                try {
                  // Event data structure: [contractAddress, contractEvent]
                  // contractEvent contains the decoded event from our contract
                  const contractEvent = event.data?.[1];
                  if (contractEvent) {
                    // Try to decode using contract ABI
                    const decoded = (contract as any)?.abi?.decodeEvent?.(contractEvent);
                    if (decoded?.event?.identifier === 'PassportRegistered') {
                      // token_id is the first argument
                      createdTokenId = decoded.args?.[0]?.toString() || decoded.args?.token_id?.toString() || null;
                      console.log('PassportRegistered event found. Token ID:', createdTokenId);
                      break;
                    }
                  }
                } catch (decodeError: any) {
                  console.warn('Failed to decode contract event:', decodeError.message);
                }
              }
            }

            // Check if transaction is in block or finalized
            if (status?.isInBlock || status?.isFinalized || status?.type === 'Finalized' || status?.type === 'BestChainBlockIncluded') {
              // Check for errors first
              if (dispatchError) {
                let errorMessage = 'Transaction failed';
                if (dispatchError.isModule) {
                  errorMessage = `Transaction failed: ${dispatchError.toString()}`;
                } else {
                  errorMessage = `Transaction failed: ${dispatchError.toString()}`;
                }
                reject(new Error(errorMessage));
                return;
              }

              // Get block number
              if (status?.asInBlock) {
                blockNumber = status.asInBlock.toNumber?.() || null;
              } else if (status?.asFinalized) {
                blockNumber = status.asFinalized.toNumber?.() || null;
              }

              if (!createdTokenId) {
                console.warn('Transaction included but tokenId not found in events');
                // Try to query the contract to get the latest token ID
                // For now, we'll continue without tokenId
              }

              resolve();
            }
          }
        ).catch(reject);
      });

      // 3c. Build final result with on-chain data
      const finalTokenId = createdTokenId || expectedTokenId || null;
      const completeResult: CreatePassportResult = {
        success: true,
        tokenId: finalTokenId || undefined,
        ipfsCid: registrationData.ipfsCid,
        txHash: txHash || undefined,
        blockNumber: blockNumber || undefined,
        ...(registrationData.issuerDidWebStatus && { issuerDidWebStatus: registrationData.issuerDidWebStatus }),
        ...(registrationData.warning && { warning: registrationData.warning }),
      };

      const verificationKey =
        (registrationData as any)?.verificationKey || (prepared as any)?.verification?.key;

      if (finalTokenId && verificationKey) {
        const baseUrl =
          (typeof window !== 'undefined' && window.location?.origin) ? window.location.origin : '';
        if (baseUrl) {
          completeResult.verifyUrl = `${baseUrl}/render/${encodeURIComponent(finalTokenId)}?key=${encodeURIComponent(verificationKey)}`;
        }
      }

      setResult(completeResult);
      setPhase('complete');
      
      // Show success message
      if (finalTokenId) {
        toast.success(`Passport created! Token ID: ${finalTokenId}`);
      } else {
        toast.success('Passport created! (Token ID pending)');
      }
      
      // Show warning if did:web fallback occurred
      if (registrationData.warning) {
        toast.warning(registrationData.warning, {
          duration: 10000, // Show for 10 seconds
        });
      }

    } catch (err: any) {
      console.error('Hybrid passport creation error:', err);
      setError(err.message || 'Unknown error');
      setPhase('error');
      toast.error(err.message || 'Failed to create passport');
    }
  };

  return {
    phase,
    preparedData,
    result,
    error,
    createPassport,
    reset,
  };
}

/**
 * Base64 URL encode (browser-compatible)
 */
function base64UrlEncode(bytes: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}
