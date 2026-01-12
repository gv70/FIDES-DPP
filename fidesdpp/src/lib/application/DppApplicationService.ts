/**
 * DPP Application Service
 * 
 * Orchestrates VC engine, IPFS storage, and chain adapter
 * for high-level Digital Product Passport operations
 * 
 * @license Apache-2.0
 */

import type { VcEngine, PolkadotAccount } from '../vc/VcEngine';
import type { IpfsStorageBackend } from '../ipfs/IpfsStorageBackend';
import type { ChainAdapter, Granularity } from '../chain/ChainAdapter';
import type { DigitalProductPassport } from '../untp/generateDppJsonLd';
import { computeJwtHash } from '../ipfs/IpfsStorageBackend';
import { createKeyDid } from '../vc/did-resolver';
import type { AnagraficaService } from '../anagrafica/AnagraficaService';
import { getDidWebManager, IssuerStatus } from '../vc/did-web-manager';
import type { VcIssuerIdentity } from '../vc/issuer-identity';
import type {
  CreatePassportInput,
  CreatePassportResult,
  VerificationReport,
  UpdatePassportResult,
  TransactionResult,
} from './types';
import type {
  CreatePassportFormInput,
  PreparedPassportData,
  FinalizeCreatePassportInput,
  CreatePassportResult as HybridCreatePassportResult,
  PreparedPassportStore,
} from './hybrid-types';
import { preparedDataStore } from './prepared-data-store';
import crypto from 'crypto';

/**
 * Main application service for DPP operations
 * 
 * This service orchestrates the complete flow:
 * 1. Issue VC (via VcEngine)
 * 2. Store in IPFS (via IpfsStorageBackend)
 * 3. Register on-chain (via ChainAdapter)
 */
export class DppApplicationService {
  constructor(
    private vcEngine: VcEngine,
    private storage: IpfsStorageBackend,
    private chain: ChainAdapter,
    private anagraficaService?: AnagraficaService
  ) {}

  /**
   * Assert that a did:web issuer is valid and wallet is authorized
   * 
   * @throws Error if validation fails
   */
  private async assertDidWebAuthorized(
    issuerDid: string,
    walletAddress: string,
    network: string
  ): Promise<void> {
    const manager = getDidWebManager();
    
    // Check issuer exists
    const identity = await manager.getIssuerIdentity(issuerDid);
    if (!identity) {
      throw new Error(`Issuer not found: ${issuerDid}`);
    }
    
    // Check issuer is VERIFIED
    if (identity.status !== IssuerStatus.VERIFIED) {
      throw new Error(
        `Issuer ${issuerDid} is not verified (status: ${identity.status})`
      );
    }
    
    const normalizeNetwork = (raw: string): string => {
      const n = String(raw || '').trim();
      if (!n) return 'asset-hub';
      return n.replace(/^polkadot:/, '');
    };

    const targetNetwork = normalizeNetwork(network);
    const candidates = Array.from(
      new Set(
        [
          targetNetwork,
          'asset-hub',
          'westend-asset-hub',
        ].filter(Boolean)
      )
    );

    let lastError: any = null;
    for (const candidate of candidates) {
      try {
        const isAuthorized = await manager.isPolkadotAccountAuthorizedRemote(
          issuerDid,
          walletAddress,
          candidate
        );
        if (isAuthorized) {
          return;
        }
      } catch (e: any) {
        lastError = e;
      }
    }

    if (lastError) {
      throw new Error(`Authorization check unavailable: ${lastError.message || String(lastError)}`);
    }

    throw new Error(`Wallet ${walletAddress} is not authorized for ${issuerDid}`);
  }
  
  /**
   * Get StatusListManager if available (Phase 2+)
   */
  private getStatusListManager(): any {
    // Access StatusListManager from JwtVcEngine if available
    const jwtEngine = this.vcEngine as any;
    return jwtEngine.statusListManager;
  }

  /**
   * Complete flow: Create DPP, issue VC, store in IPFS, register on-chain
   * 
   * v0.2 contract stores only anchor data:
   * - CID (dataset_uri)
   * - SHA-256 hash of JWT string (payload_hash)
   * - Granularity level (ProductClass/Batch/Item)
   * - Hashed subject ID (privacy-preserving)
   * 
   * Full UNTP DPP content is in VC-JWT on IPFS.
   */
  async createPassport(
    input: CreatePassportInput,
    issuerAccount: PolkadotAccount
  ): Promise<CreatePassportResult> {
    // 1. Determine granularity (required field)
    const granularity: Granularity = input.granularity || 'Batch';

    // 2. Validate and map input to UNTP DPP model
    const dppCore = this.mapInputToDpp(input, granularity);

    // 3. Issue VC using VC engine
    const vcEnvelope = await this.vcEngine.issueDppVc(dppCore, issuerAccount);

    // 4. Store VC-JWT string in IPFS
    // Storage format: Raw JWT string (application/vc+jwt)
    // NOT a JSON wrapper like { jwt, payload }
    const vcJwt = vcEnvelope.jwt;
    
    const storageResult = await this.storage.uploadText(vcJwt, {
      name: `dpp-${granularity}-${dppCore.product.identifier}.jwt`,
      keyvalues: {
        'type': 'verifiable-credential',
        'format': 'vc+jwt',
        'granularity': granularity,
        'product-id': dppCore.product.identifier,
      },
    });

    // 5. Compute payload hash: SHA-256 of the exact JWT string bytes
    // This is NOT the IPFS CID hash, but the hash of the JWT content itself
    const payloadHash = computeJwtHash(vcJwt);

    // 6. Compute subject ID hash (privacy-preserving identifier)
    const subjectIdHash = this.computeSubjectIdHashFromDpp(dppCore, granularity);

    // 7. Register on-chain (v0.2 contract with granularity support)
    const registration = {
      datasetUri: `ipfs://${storageResult.cid}`,
      payloadHash, // SHA-256 of JWT string
      datasetType: 'application/vc+jwt',
      granularity,
      subjectIdHash, // Optional: hash of canonical subject ID
      // product and manufacturer are NOT sent to v0.2 contract
      // (they're in the VC on IPFS)
    };

    const registerResult = await this.chain.registerPassport(
      registration,
      issuerAccount
    );

    // 8. Wait for transaction confirmation
    await this.chain.waitForTransaction(registerResult.txHash);

    // 9. Index entities and product in anagrafica (if enabled)
    if (this.anagraficaService) {
      try {
        // Extract issuer DID from VC
        const issuerDid =
          (vcEnvelope.payload as any)?.iss ||
          (vcEnvelope.payload as any)?.issuer?.id ||
          createKeyDid(issuerAccount.publicKey);
        
        // Index entities (issuer, manufacturer, facility)
        await this.anagraficaService.indexDppEntities(
          registerResult.tokenId,
          dppCore,
          issuerDid
        );
        
        // Index product
        await this.anagraficaService.indexDppProduct(
          registerResult.tokenId,
          dppCore
        );
        
        console.log(`✓ Anagrafica indexed for tokenId: ${registerResult.tokenId}`);
      } catch (anagraficaError: any) {
        console.warn('Failed to index anagrafica:', anagraficaError.message);
        // Continue - anagrafica indexing is non-blocking
      }
    }

    return {
      tokenId: registerResult.tokenId,
      cid: storageResult.cid,
      vcJwt: vcEnvelope.jwt,
      txHash: registerResult.txHash,
      blockNumber: registerResult.blockNumber,
      granularity,
      subjectIdHash: subjectIdHash || '',
    };
  }

  /**
   * Read passport from chain (public method)
   */
  async readPassport(tokenId: string): Promise<any> {
    return await this.chain.readPassport(tokenId);
  }

  /**
   * Export a passport as a machine-readable bundle
   *
   * Includes the on-chain anchor + the off-chain VC-JWT retrieved from storage.
   * If a verificationKey is provided, attempts to decrypt restricted Annex III sections.
   */
  async exportPassport(
    tokenId: string,
    options?: { verificationKey?: string }
  ): Promise<{
    onChainData: any;
    dataset: {
      jwt: string;
      decoded: {
        header: any;
        payload: any;
      };
      vc: any;
      annexIII?: {
        public?: any;
        restrictedDecrypted?: any;
      };
    };
  }> {
    const onChainData = await this.chain.readPassport(tokenId);

    const cid = String(onChainData.datasetUri || '').replace('ipfs://', '');
    if (!cid) {
      throw new Error('Dataset URI not available for this passport');
    }

    const vcData = await this.storage.retrieveText(cid);
    const vcJwt = vcData.data;

    const decoded = this.vcEngine.decodeVc(vcJwt);
    const vc = decoded.payload?.vc;

    const annexIIIExport: any = {};
    const annexIII = (vc?.credentialSubject as any)?.annexIII;
    if (annexIII?.public) {
      annexIIIExport.public = annexIII.public;
    }

    if (options?.verificationKey && annexIII?.restricted?.encrypted) {
      try {
        const keyBytes = this.base64UrlDecodeBytes(options.verificationKey);
        const decrypted = this.decryptJson<any>(annexIII.restricted.encrypted, keyBytes);
        annexIIIExport.restrictedDecrypted = decrypted;
      } catch (e: any) {
        annexIIIExport.restrictedDecrypted = {
          error: e.message || 'Failed to decrypt restricted section',
        };
      }
    }

    return {
      onChainData,
      dataset: {
        jwt: vcJwt,
        decoded: {
          header: decoded.header,
          payload: decoded.payload,
        },
        vc,
        ...(Object.keys(annexIIIExport).length ? { annexIII: annexIIIExport } : {}),
      },
    };
  }

  /**
   * Complete verification flow
   */
  async verifyPassport(tokenId: string): Promise<VerificationReport> {
    // 1. Read on-chain record
    const onChainData = await this.chain.readPassport(tokenId);

    if (onChainData.status === 'Revoked') {
      return {
        valid: false,
        reason: 'Passport has been revoked on-chain',
        schemaValid: false,
        onChainData,
      };
    }

    // 2. Extract CID from dataset URI
    const cid = onChainData.datasetUri.replace('ipfs://', '');

    // 3. Retrieve VC-JWT from IPFS
    // Storage format: Raw JWT string (application/vc+jwt)
    const vcData = await this.storage.retrieveText(cid);
    const vcJwt = vcData.data;

    // 4. Verify VC
    let vcVerification;
    try {
      vcVerification = await this.vcEngine.verifyDppVc(vcJwt);
    } catch (vcError: any) {
      // Check if error is due to invalid DID format or did:web not hosted
      const errorMessage = vcError.message || '';
      const isDidWebNotFound = 
        errorMessage.includes('notFound') ||
        errorMessage.includes('Unable to resolve DID document for did:web') ||
        errorMessage.includes('fetch failed') ||
        (errorMessage.includes('did:web') && errorMessage.includes('notFound'));
      
      if (isDidWebNotFound) {
        // Extract DID from error message if possible
        const didMatch = errorMessage.match(/did:web:[^\s,]+/);
        const did = didMatch ? didMatch[0] : 'did:web:...';
        const domain = did.replace('did:web:', '');
        
        console.warn(
          `VC verification failed: did:web issuer ${did} not yet hosted. ` +
          `The DID document must be hosted at https://${domain}/.well-known/did.json`
        );
        
        // Return partial verification report with helpful message
        return {
          valid: false,
          reason: `VC signature verification failed: did:web issuer ${did} is not yet publicly accessible. ` +
            `The DID document must be hosted at https://${domain}/.well-known/did.json. ` +
            `This is expected if the issuer registered the did:web but hasn't yet published the DID document. ` +
            `Once the DID document is hosted and verified, the VC signature can be verified.`,
          hashMatches: true, // Hash can still match even if DID not resolvable
          issuerMatches: false, // Cannot verify issuer without DID document
          schemaValid: false, // Skip schema validation if VC verification failed
          onChainData,
          vcJwt,
          vcVerification: {
            verified: false,
            issuer: did,
            issuanceDate: new Date(),
            errors: [`DID document not found: ${did}`],
            warnings: ['did:web issuer not yet hosted'],
          },
        };
      }
      
      if (vcError.message?.includes('Invalid did:key format') || 
          vcError.message?.includes('Unable to resolve DID')) {
        console.error(
          'VC verification failed due to invalid DID format. ' +
          'This passport was likely created with an incorrect DID format. ' +
          'The VC must be recreated using JwtVcEngine.issueDppVc() with proper ed25519 public key.'
        );
        // Return partial verification report
        return {
          valid: false,
          reason: `VC signature verification failed: Invalid DID format. The passport VC was created with an incorrect DID format (${vcError.message}). The VC must be recreated with a proper did:key:z... DID derived from the ed25519 public key.`,
          hashMatches: false,
          issuerMatches: false,
          schemaValid: false,
          onChainData,
          vcJwt,
        };
      }
      // Re-throw other errors
      throw vcError;
    }

    // 5. Verify integrity: recompute hash of JWT string
    const recomputedHash = computeJwtHash(vcJwt);
    const hashMatches = recomputedHash === onChainData.payloadHash;

    // 6. Cross-check: Extract issuer account from chainAnchor and compare
    // Note: The VC issuer DID (did:key) is separate from the Polkadot account
    // We check the chainAnchor metadata in the VC against on-chain data
    const issuerDid = vcVerification.issuer;
    let issuerMatches = false;
    
    try {
      // Extract chainAnchor from VC payload
      const vcPayload = vcVerification.payload;
      const credentialSubject = vcPayload?.credentialSubject || vcPayload?.vc?.credentialSubject;
      const chainAnchor = credentialSubject?.chainAnchor;
      
      if (chainAnchor && chainAnchor.issuerAccount) {
        // Normalize addresses for comparison
        // On-chain issuer might be H160 (0x...) while chainAnchor might be SS58 (5...)
        const chainAnchorIssuer = this.normalizeAddress(chainAnchor.issuerAccount);
        const onChainIssuer = this.normalizeAddress(onChainData.issuer);
        
        // Compare normalized addresses
        issuerMatches = chainAnchorIssuer.toLowerCase() === onChainIssuer.toLowerCase();
      } else {
        // No chainAnchor - cannot verify issuer match
        issuerMatches = false;
      }
    } catch (error) {
      // Failed to extract chainAnchor
      issuerMatches = false;
    }

    // Extract DPP if verification succeeded
    let dpp: DigitalProductPassport | undefined;
    if (vcVerification.verified) {
      try {
        const decoded = this.vcEngine.decodeVc(vcJwt);
        dpp = this.vcEngine.extractDpp(decoded);
      } catch (error) {
        // Failed to extract DPP
      }
    }

    // 7. UNTP Schema validation (if VC includes credentialSchema)
    let schemaValid = true; // default to true if no schema reference
    let schemaValidationDetails: any = undefined;
    
    try {
      const decoded = this.vcEngine.decodeVc(vcJwt);
      const credentialSchema = decoded.payload.vc?.credentialSchema;
      
      if (credentialSchema && credentialSchema.id) {
        // VC includes schema reference - validate it
        const { validateUntpDpp } = await import('../validation/validateUntpDpp');
        
        // Validate the entire VC payload (not just credentialSubject)
        const validationResult = await validateUntpDpp(decoded.payload.vc, {
          schemaUrl: credentialSchema.id,
        });
        
        schemaValid = validationResult.valid;
        schemaValidationDetails = {
          schemaUrl: credentialSchema.id,
          schemaType: credentialSchema.type,
          schemaSha256: decoded.payload.vc.schemaSha256,
          valid: validationResult.valid,
          errors: validationResult.errors,
          schemaMeta: validationResult.schemaMeta,
        };
      }
    } catch (error: any) {
      console.warn('Schema validation failed:', error.message);
      schemaValid = false;
      schemaValidationDetails = {
        error: error.message || 'Schema validation error',
      };
    }

    return {
      valid: vcVerification.verified && hashMatches && issuerMatches && schemaValid,
      vcVerification,
      hashMatches,
      issuerMatches,
      schemaValid,
      schemaValidation: schemaValidationDetails,
      onChainData,
      vcJwt,
      dpp,
    };
  }

  /**
   * Update passport dataset
   * 
   * NOTE: Granularity is IMMUTABLE after registration.
   * This method only updates the VC-JWT on IPFS and the on-chain anchor.
   * If you need to change granularity, revoke the old passport and register a new one.
   */
  async updatePassport(
    tokenId: string,
    updatedDpp: DigitalProductPassport,
    issuerAccount: PolkadotAccount
  ): Promise<UpdatePassportResult> {
    // 1. Read on-chain data to get immutable granularity
    const onChainData = await this.chain.readPassport(tokenId);
    const granularity = onChainData.granularity; // Immutable - use existing value

    // 2. Issue new VC with updated DPP
    // Include minimal on-chain version linkage metadata inside the VC so that the VC can be
    // interpreted outside of the blockchain context (audit trail / "latest" checks).
    const currentVersion =
      typeof onChainData.version === 'number'
        ? onChainData.version
        : Number(onChainData.version || 1) || 1;
    const nextVersion = currentVersion + 1;

    const updatedDppWithChainMeta = {
      ...(updatedDpp as any),
      chainAnchor: {
        ...((updatedDpp as any)?.chainAnchor || {}),
        tokenId,
        version: nextVersion,
        previousDatasetUri: onChainData.datasetUri,
        previousPayloadHash: onChainData.payloadHash,
      },
    } as DigitalProductPassport;

    const vcEnvelope = await this.vcEngine.issueDppVc(updatedDppWithChainMeta, issuerAccount);

    // 3. Store VC-JWT string in IPFS
    const vcJwt = vcEnvelope.jwt;
    
    const storageResult = await this.storage.uploadText(vcJwt, {
      name: `dpp-${granularity}-${updatedDpp.product.identifier}-v${onChainData.version + 1}.jwt`,
      keyvalues: {
        'type': 'verifiable-credential',
        'format': 'vc+jwt',
        'granularity': granularity,
        'product-id': updatedDpp.product.identifier,
        'version': (onChainData.version + 1).toString(),
      },
    });

    // 4. Compute payload hash: SHA-256 of the exact JWT string bytes
    const payloadHash = computeJwtHash(vcJwt);

    // 5. Recompute subject ID hash (may have changed if product ID changed)
    const subjectIdHash = this.computeSubjectIdHashFromDpp(updatedDpp, granularity);

    // 6. Update on-chain (granularity is NOT passed - it's immutable)
    const updateResult = await this.chain.updateDataset(
      tokenId,
      `ipfs://${storageResult.cid}`,
      payloadHash,
      'application/vc+jwt',
      subjectIdHash,
      issuerAccount
    );

    await this.chain.waitForTransaction(updateResult.txHash);

    // 7. Update anagrafica indexing (if enabled)
    if (this.anagraficaService) {
      try {
        // Extract issuer DID from VC
        const issuerDid =
          (vcEnvelope.payload as any)?.iss ||
          (vcEnvelope.payload as any)?.issuer?.id ||
          createKeyDid(issuerAccount.publicKey);
        
        // Re-index entities and product (may have changed)
        await this.anagraficaService.indexDppEntities(
          tokenId,
          updatedDpp,
          issuerDid
        );
        
        await this.anagraficaService.indexDppProduct(
          tokenId,
          updatedDpp
        );
        
        console.log(`✓ Anagrafica updated for tokenId: ${tokenId}`);
      } catch (anagraficaError: any) {
        console.warn('Failed to update anagrafica:', anagraficaError.message);
        // Continue - anagrafica indexing is non-blocking
      }
    }

    return {
      tokenId,
      cid: storageResult.cid,
      vcJwt: vcEnvelope.jwt,
      txHash: updateResult.txHash,
    };
  }

  /**
   * Revoke passport
   * 
   * Phase 2+: Also revokes in Status List (if enabled)
   */
  async revokePassport(
    tokenId: string,
    issuerAccount: PolkadotAccount,
    reason?: string
  ): Promise<TransactionResult> {
    // 1. Revoke on-chain
    const txResult = await this.chain.revokePassport(tokenId, reason, issuerAccount);

    // 2. Phase 2+: Also revoke in Status List (if enabled)
    const statusListManager = this.getStatusListManager();
    if (statusListManager) {
      try {
        const issuerDid = (issuerAccount as any).did || createKeyDid(issuerAccount.publicKey);

        const onChain = await this.chain.readPassport(tokenId);
        const cid = String(onChain.datasetUri || '').replace('ipfs://', '');
        if (!cid) {
          throw new Error('Missing dataset URI for revoked passport');
        }

        const vcJwt = (await this.storage.retrieveText(cid)).data;
        const decoded = this.vcEngine.decodeVc(vcJwt);
        const credentialId = decoded.payload?.jti || (decoded.payload as any)?.vc?.id;
        if (!credentialId) {
          throw new Error('VC does not include a credential id (jti/id)');
        }

        const newStatusListCid = await statusListManager.revokeIndex(issuerDid, String(credentialId));
        console.log(`✓ Status List updated: ${newStatusListCid}`);
      } catch (statusError: any) {
        console.warn('Failed to update Status List:', statusError.message);
        // Continue - on-chain revocation is primary
      }
    }

    return txResult;
  }

  /**
   * Map form input to UNTP DPP structure
   * 
   * Includes granularityLevel aligned with UNTP and ESPR Article 10(1)(f).
   */
  private mapInputToDpp(input: CreatePassportInput, granularity: Granularity): DigitalProductPassport {
    // Map granularity to UNTP granularityLevel
    const granularityLevel = this.mapGranularityToUntp(granularity);
    const productIdFields = this.buildUntpProductIdFields(
      input.productId,
      input.serialNumber,
      input.batchNumber
    );

    // Use existing UNTP generator types
    const dpp: DigitalProductPassport = {
      '@type': 'DigitalProductPassport',
      granularityLevel, // UNTP field: 'productClass' | 'batch' | 'item'
      product: {
        '@type': 'Product',
        ...productIdFields,
        identifier: input.productId,
        identifierScheme: input.identifierScheme,
        name: input.productName,
        description: input.productDescription,
        batchNumber: input.batchNumber,
        serialNumber: input.serialNumber,
        productionDate: input.productionDate,
        countryOfProduction: input.countryOfProduction,
        category: input.category,
      },
    };

    // Add manufacturer if provided
    if (input.manufacturer) {
      dpp.manufacturer = {
        '@type': 'Organization',
        name: input.manufacturer.name,
        identifier: input.manufacturer.identifier,
        addressCountry: input.manufacturer.country,
        facility: input.manufacturer.facility ? {
          '@type': 'Facility',
          name: input.manufacturer.facility,
          identifier: input.manufacturer.facility_id,
        } : undefined,
      };
    }

    // Add materials if provided
    if (input.materials && input.materials.length > 0) {
      dpp.materialsProvenance = input.materials.map(m => ({
        '@type': 'Material',
        name: m.name,
        massFraction: m.massFraction,
        countryOfOrigin: m.originCountry,
        hazardous: m.hazardous,
      }));
    }

    // Add compliance claims if provided
    if (input.compliance_claims && input.compliance_claims.length > 0) {
      dpp.conformityClaim = input.compliance_claims.map(c => ({
        '@type': 'Claim',
        identifier: c.claim_id,
        description: c.description,
        referenceStandard: c.standard_ref,
        referenceRegulation: c.regulation_ref,
        evidenceLink: c.evidence_uri,
      }));
    }

    // Add traceability if provided
    if (input.traceability && input.traceability.length > 0) {
      dpp.traceabilityInformation = input.traceability.map(t => ({
        '@type': 'TraceabilityEvent',
        eventReference: t.event_ref,
        actor: t.actor,
        evidenceLink: t.evidence_uri,
      }));
    }

    return dpp;
  }

  /**
   * Compute canonical subject ID hash based on granularity
   * 
   * This creates a privacy-preserving hash of the subject identifier:
   * - ProductClass: hash of product.identifier (e.g., GTIN)
   * - Batch: hash of "product.identifier#batchNumber"
   * - Item: hash of "product.identifier#serialNumber"
   * 
   * @param dpp - Digital Product Passport
   * @param granularity - Granularity level
   * @returns SHA-256 hash as 0x... hex string, or undefined if required data is missing
   */
  private computeSubjectIdHashFromDpp(
    dpp: DigitalProductPassport,
    granularity: Granularity
  ): string | undefined {
    const productId = dpp.product?.identifier;
    
    if (!productId) {
      return undefined; // Cannot compute hash without product identifier
    }

    let canonicalSubjectId: string;

    switch (granularity) {
      case 'ProductClass':
        // Model/SKU level: just the product identifier
        canonicalSubjectId = productId;
        break;

      case 'Batch':
        // Batch level: product + batch number
        const batchNumber = dpp.product?.batchNumber;
        if (!batchNumber) {
          return undefined; // Required for Batch granularity
        }
        canonicalSubjectId = `${productId}#${batchNumber}`;
        break;

      case 'Item':
        // Item level: product + serial number
        const serialNumber = dpp.product?.serialNumber;
        if (!serialNumber) {
          return undefined; // Required for Item granularity
        }
        canonicalSubjectId = `${productId}#${serialNumber}`;
        break;

      default:
        // Unknown granularity - cannot compute
        return undefined;
    }

    // Compute SHA-256 hash using Node.js crypto
    // Note: In browser, would need Web Crypto API
    const hash = crypto.createHash('sha256')
      .update(canonicalSubjectId, 'utf-8')
      .digest('hex');
    
    return `0x${hash}`;
  }

  /**
   * Map TypeScript Granularity to UNTP granularityLevel
   * 
   * UNTP schema 0.6.0 uses: 'model', 'batch', 'item'
   */
  private mapGranularityToUntp(granularity: Granularity): 'model' | 'batch' | 'item' {
    const mapping: Record<Granularity, 'model' | 'batch' | 'item'> = {
      'ProductClass': 'model',
      'Batch': 'batch',
      'Item': 'item',
    };
    return mapping[granularity];
  }

  private buildUntpProductIdFields(
    identifier: string,
    serialNumber?: string,
    batchNumber?: string
  ): Record<string, any> {
    const trimmed = String(identifier || '').trim();
    const hash = crypto.createHash('sha256').update(trimmed, 'utf-8').digest('hex');

    const fields: Record<string, any> = {
      id: `urn:fidesdpp:product:${hash}`,
      registeredId: trimmed,
    };

    const gtinMatch = trimmed.match(/^GTIN:(\d{8,14})$/i);
    if (gtinMatch) {
      const gtin = gtinMatch[1];
      fields.id = `https://id.gs1.org/01/${gtin}`;
      fields.registeredId = gtin;
      fields.idScheme = {
        type: ['IdentifierScheme'],
        id: 'https://id.gs1.org/01',
        name: 'Global Trade Item Number (GTIN)',
      };
    }

    if (serialNumber) {
      fields.serialNumber = serialNumber;
    }

    if (batchNumber) {
      fields.batchNumber = batchNumber;
    }

    return fields;
  }

  // Hybrid flow methods (client/server two-phase create)

  // Note: preparedDataStore is now imported from shared module
  // to persist across different service instances (needed for server actions)

  /**
   * PHASE 1: Prepare passport creation (server-side, no signing)
   * 
   * This method prepares all data needed for passport creation WITHOUT
   * requiring access to private keys. Returns signable data that the
   * browser will sign using the wallet.
   * 
   * @param input - Form input from browser
   * @returns Prepared data including VC signable payload
   */
  async preparePassportCreation(
    input: CreatePassportFormInput
  ): Promise<PreparedPassportData> {
    // Generate unique correlation ID
    const preparedId = crypto.randomBytes(16).toString('hex');

    if (!input.manufacturer?.identifier) {
      throw new Error('Manufacturer identifier is required.');
    }

    this.validateAnnexIIIInput(input.annexIII);

    // 1. Determine granularity
    const granularity: Granularity = input.granularity || 'Batch';

    // 2. Map form input to UNTP DPP model
    const untpDpp = this.mapFormInputToDpp(input, granularity) as any;

    // 3. Determine issuer identity (did:web or did:key)
    // Dual-path logic: check if did:web should be used
    let issuerDid: string;
    let useDidWeb = input.useDidWeb ?? false;
    const issuerIdentity: any = null; // Store for finalize step

    if (useDidWeb && input.issuerDid) {
      // Validate did:web authorization (fail-fast)
      const network = input.network || 'asset-hub';
      await this.assertDidWebAuthorized(input.issuerDid, input.issuerAddress, network);
      
      // Use provided did:web
      issuerDid = input.issuerDid;
    } else {
      // Legacy path: Use did:key (requires ed25519 wallet)
      // Validate public key for ed25519
      const publicKeyHex = input.issuerPublicKey.replace('0x', '');
      if (publicKeyHex.length !== 64) {
        throw new Error(
          `Invalid public key length for ed25519: expected 64 hex characters (32 bytes), got ${publicKeyHex.length}. ` +
          `Legacy path requires ed25519 keys. Use did:web path for wallet-agnostic issuance.`
        );
      }
      const publicKeyBytes = Buffer.from(publicKeyHex, 'hex');
      issuerDid = createKeyDid(publicKeyBytes);
      useDidWeb = false;
    }

    const verificationKeyBytes = crypto.randomBytes(32);
    const verificationKey = this.base64UrlEncodeBytes(verificationKeyBytes);
    const renderBaseUrl = process.env.RENDER_BASE_URL || 'http://localhost:3000';
    const linkTemplate = `${renderBaseUrl.replace(/\/$/, '')}/render/{tokenId}?key=${verificationKey}`;

    const annexIII = this.buildAnnexIIIData(input, issuerDid);
    const annexIIIEncrypted = this.encryptJson(annexIII.restricted, verificationKeyBytes);

    untpDpp.annexIII = {
      schema: 'eu:regulation:2024-1781:annex-iii',
      version: '0.1',
      required: ['uniqueProductId', 'manufacturer.operatorId'],
      public: annexIII.public,
      restricted: {
        encrypted: annexIIIEncrypted,
      },
    };

    // 4. Build VC payload (unsigned) with determined issuer DID
    const vcPayload = this.buildVcPayloadWithIssuer(untpDpp, issuerDid, input.issuerAddress, input.network);

    const statusListManager = this.getStatusListManager();
    if (statusListManager?.assignIndex && vcPayload?.jti && vcPayload?.vc) {
      try {
        const statusListEntry = await statusListManager.assignIndex(issuerDid, vcPayload.jti);
        if (!vcPayload.vc['@context'].includes('https://w3id.org/vc/status-list/2021/v1')) {
          vcPayload.vc['@context'].push('https://w3id.org/vc/status-list/2021/v1');
        }
        vcPayload.vc.credentialStatus = statusListEntry;
      } catch (error: any) {
        console.warn('Failed to assign status list index:', error.message);
      }
    }

    // 5. Create JWS signing input (header.payload in base64url)
    const header = {
      alg: 'EdDSA',
      typ: 'JWT',
    };

    const headerB64 = this.base64UrlEncode(JSON.stringify(header));
    const payloadB64 = this.base64UrlEncode(JSON.stringify(vcPayload));
    const signingInput = `${headerB64}.${payloadB64}`;

    // 6. Compute subject ID hash (for preview)
    const subjectIdHash = this.computeSubjectIdHashFromDpp(untpDpp, granularity);

    // 7. Store prepared data temporarily (for finalize step)
    // Note: In production, use Redis or similar with TTL
    this.storePreparedData(preparedId, {
      input,
      untpDpp,
      vcPayload,
      createdAt: Date.now(),
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
      // Store issuer identity info for finalize step
      issuerDid,
      useDidWeb,
      issuerIdentity,
      verificationKey,
    });

    // 8. Return prepared data for browser
    return {
      preparedId,
      vcSignablePayload: {
        signingInput,
        header,
        payload: vcPayload,
      },
      chainPreview: {
        granularity,
        datasetType: 'application/vc+jwt',
        subjectIdHash,
      },
      untpPreview: {
        productId: untpDpp.product.identifier,
        productName: untpDpp.product.name,
        granularityLevel: this.mapGranularityToUntp(granularity),
      },
      verification: {
        key: verificationKey,
        linkTemplate,
      },
    };
  }

  /**
   * PHASE 2: Finalize passport creation (server-side, with signed VC)
   * 
   * This method completes passport creation using the signed VC-JWT
   * from the browser. Uploads to IPFS and registers on-chain.
   * 
   * @param input - Signed VC-JWT and correlation ID
   * @param signerAccount - Account for on-chain transaction signing
   * @returns Final result with tokenId and CID
   */
  async finalizePassportCreation(
    input: FinalizeCreatePassportInput
  ): Promise<HybridCreatePassportResult> {
    try {
      // 1. Retrieve prepared data
      const prepared = this.retrievePreparedData(input.preparedId);
      if (!prepared) {
        return {
          success: false,
          error: 'Prepared data not found or expired. Please start over.',
        };
      }

      // 2. Validate issuer matches
      if (prepared.input.issuerAddress !== input.issuerAddress) {
        return {
          success: false,
          error: 'Issuer address mismatch',
        };
      }

      // 3. Determine if we need to sign VC-JWT server-side (did:web) or use browser-signed (did:key)
      const useDidWeb = (prepared as any).useDidWeb ?? false;
      const issuerDid = (prepared as any).issuerDid;
      
      let signedVcJwt = input.signedVcJwt;
      let issuerDidWebStatus: string | undefined;
      let warning: string | undefined;
      
      if (useDidWeb && issuerDid) {
        // did:web path - strict mode, no fallback
        const manager = getDidWebManager();
        const network = prepared.input.network || 'asset-hub';
        
        // Re-validate authorization (defense-in-depth)
        try {
          await this.assertDidWebAuthorized(issuerDid, input.issuerAddress, network);
        } catch (authError: any) {
          return {
            success: false,
            error: `Authorization check failed: ${authError.message}`,
          };
        }
        
        // Get issuer identity for signing
        const issuerIdentity = await manager.getIssuerIdentity(issuerDid);
        if (!issuerIdentity) {
          return {
            success: false,
            error: `Issuer identity not found: ${issuerDid}`,
          };
        }
        
        issuerDidWebStatus = issuerIdentity.status;
        
        // Decrypt private key for signing (Version B: encrypted at rest)
        let decryptedPrivateKey: Uint8Array;
        try {
          decryptedPrivateKey = await manager.getDecryptedPrivateKeySeed(issuerDid);
        } catch (decryptError: any) {
          return {
            success: false,
            error: `Failed to decrypt private key for signing: ${decryptError.message}. ` +
                   `Ensure DIDWEB_MASTER_KEY_HEX is set correctly.`,
          };
        }
        
        // Create VcIssuerIdentity with decrypted private key for signing
        const issuerIdentityWithKey: VcIssuerIdentity = {
          ...issuerIdentity,
          signingKey: {
            ...issuerIdentity.signingKey,
            privateKey: decryptedPrivateKey,
          },
        };
        
        // Re-issue VC-JWT with server-managed key
        console.log(`[DPP Service] Issuing VC-JWT with did:web issuer: ${issuerDid}`);
        
        const jwtVcEngine = this.vcEngine as any;
        if (typeof jwtVcEngine.issueDppVcWithIdentity !== 'function') {
          return {
            success: false,
            error: 'VC engine does not support did:web issuance',
          };
        }
        
        const publicKeyBytes = input.issuerPublicKey.startsWith('0x')
          ? Buffer.from(input.issuerPublicKey.slice(2), 'hex')
          : Buffer.from(input.issuerPublicKey, 'hex');
        
        const blockchainAccount: PolkadotAccount = {
          address: input.issuerAddress,
          publicKey: new Uint8Array(publicKeyBytes),
          sign: async () => {
            throw new Error('Signing not supported for did:web chainAnchor account');
          },
          network: prepared.input.network || 'westend-asset-hub',
          keyType: 'ed25519', // Metadata only, not used for signing
        };
        
        const vcEnvelope = await jwtVcEngine.issueDppVcWithIdentity(
          prepared.untpDpp,
          issuerIdentityWithKey,
          blockchainAccount,
          { tokenId: undefined, credentialId: prepared.vcPayload?.jti }
        );
        signedVcJwt = vcEnvelope.jwt;
        console.log(`[DPP Service] VC-JWT issued successfully. Length: ${signedVcJwt.length} chars`);
      } else {
        // Legacy path: did:key - use browser-signed VC-JWT
        // Validate VC-JWT signature (optional but recommended)
        try {
          const verification = await this.vcEngine.verifyDppVc(input.signedVcJwt);
          if (!verification.verified) {
            return {
              success: false,
              error: `VC signature invalid: ${verification.errors.join(', ')}`,
            };
          }
        } catch (verifyError: any) {
          // Verification failed, but continue (signature will be checked on-chain via hash)
          console.warn('VC signature verification failed, but continuing:', verifyError.message);
        }
        signedVcJwt = input.signedVcJwt;
      }

      // 4. Upload signed VC-JWT to IPFS (use server-signed for did:web, browser-signed for did:key)
      const storageResult = await this.storage.uploadText(signedVcJwt, {
        name: `dpp-${prepared.input.granularity}-${prepared.untpDpp.product.identifier}.jwt`,
        keyvalues: {
          'type': 'verifiable-credential',
          'format': 'vc+jwt',
          'granularity': prepared.input.granularity,
          'product-id': prepared.untpDpp.product.identifier,
        },
      });

      // 5. Compute hashes (use signedVcJwt which may be server-signed for did:web or browser-signed for did:key)
      const payloadHash = computeJwtHash(signedVcJwt);
      const subjectIdHash = this.computeSubjectIdHashFromDpp(
        prepared.untpDpp,
        prepared.input.granularity
      );

      console.log(`[DPP Service] Computed hashes - payloadHash: ${payloadHash} (length: ${payloadHash?.length}), subjectIdHash: ${subjectIdHash} (length: ${subjectIdHash?.length})`);

      // 6. Register on-chain
      const registration = {
        datasetUri: `ipfs://${storageResult.cid}`,
        payloadHash,
        datasetType: 'application/vc+jwt',
        granularity: prepared.input.granularity,
        subjectIdHash,
      };
      
      console.log(`[DPP Service] Registration object:`, {
        datasetUri: registration.datasetUri,
        payloadHash: registration.payloadHash,
        payloadHashType: typeof registration.payloadHash,
        payloadHashLength: registration.payloadHash?.length,
        subjectIdHash: registration.subjectIdHash,
        subjectIdHashType: typeof registration.subjectIdHash,
        subjectIdHashLength: registration.subjectIdHash?.length,
      });

      // 6b. Return registration data for browser to sign and submit
      // Browser will use dedot to construct, sign, and submit the extrinsic
      // This ensures private keys never leave the browser
      const registrationData = {
        datasetUri: registration.datasetUri,
        payloadHash: registration.payloadHash,
        datasetType: registration.datasetType,
        granularity: registration.granularity,
        subjectIdHash: registration.subjectIdHash,
        ipfsCid: storageResult.cid,
        ...(issuerDidWebStatus && { issuerDidWebStatus }),
        ...(warning && { warning }),
        ...((prepared as any).verificationKey && { verificationKey: (prepared as any).verificationKey }),
      };

      // 7. Clean up prepared data
      this.deletePreparedData(input.preparedId);

      // 8. Return registration data (browser will sign and submit)
      return {
        success: true,
        registrationData,
        // Note: tokenId, txHash, blockNumber will be set by browser after submission
      };
    } catch (error: any) {
      console.error('Finalize passport creation error:', error);
      return {
        success: false,
        error: error.message || 'Failed to finalize passport creation',
      };
    }
  }

  // Private helpers (hybrid flow)

  private storePreparedData(id: string, data: any): void {
    preparedDataStore.set(id, data);
  }

  private retrievePreparedData(id: string): any {
    return preparedDataStore.get(id);
  }

  private deletePreparedData(id: string): void {
    preparedDataStore.delete(id);
  }

  /**
   * Map form input to UNTP DPP model
   */
  private mapFormInputToDpp(
    input: CreatePassportFormInput,
    granularity: Granularity
  ): DigitalProductPassport {
    const productIdFields = this.buildUntpProductIdFields(
      input.productId,
      input.serialNumber,
      input.batchNumber
    );

    const normalizeTraceabilityRef = (raw: string): string => {
      const v = String(raw || '').trim();
      if (!v) return v;
      if (v.startsWith('ipfs://')) return v;
      if (v.startsWith('http://') || v.startsWith('https://')) return v;
      // Best-effort: treat as CID
      return `ipfs://${v}`;
    };

    const dpp: any = {
      '@type': 'DigitalProductPassport',
      granularityLevel: this.mapGranularityToUntp(granularity),
      product: {
        '@type': 'Product',
        ...productIdFields,
        identifier: input.productId,
        name: input.productName,
        description: input.productDescription,
        batchNumber: input.batchNumber,
        serialNumber: input.serialNumber,
      },
      manufacturer: {
        '@type': 'Organization',
        name: input.manufacturer.name,
        identifier: input.manufacturer.identifier,
        country: input.manufacturer.country,
        facility: input.manufacturer.facility,
      },
    };

    if (Array.isArray(input.traceability) && input.traceability.length > 0) {
      dpp.traceabilityInformation = input.traceability
        .map((t) => ({
          '@type': 'TraceabilityEvent',
          eventReference: normalizeTraceabilityRef(t.event_ref),
          ...(t.actor ? { actor: t.actor } : {}),
          ...(t.evidence_uri ? { evidenceLink: t.evidence_uri } : {}),
        }))
        .filter((t: any) => !!t.eventReference);
    }

    return dpp as DigitalProductPassport;
  }

  /**
   * Normalize address for comparison (handles H160 and SS58 formats)
   * 
   * Converts addresses to a common format for comparison:
   * - H160 (0x...) -> keep as lowercase hex
   * - SS58 (5...) -> keep as-is (cannot convert without key derivation)
   * 
   * @param address - Address in any format (H160 or SS58)
   * @returns Normalized address string
   */
  private normalizeAddress(address: string): string {
    if (!address) return '';
    
    // If it's H160 format (starts with 0x), normalize to lowercase
    if (address.startsWith('0x')) {
      return address.toLowerCase();
    }
    
    // SS58 format - best-effort normalize to H160 for comparison with on-chain issuer (H160)
    // Asset Hub revive uses H160 accounts; when a user signs from an SS58 AccountId32,
    // the on-chain H160 corresponds to keccak256(accountId32)[12..32].
    try {
      // Lazy import to avoid bundling util-crypto into server/client accidentally.
      // This method is used server-side (verification) in the application service.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { decodeAddress, keccakAsU8a } = require('@polkadot/util-crypto');
      const bytes: Uint8Array = decodeAddress(address);
      if (bytes.length === 20) {
        return `0x${Buffer.from(bytes).toString('hex')}`.toLowerCase();
      }
      if (bytes.length === 32) {
        const hash: Uint8Array = keccakAsU8a(bytes, 256);
        const h160 = hash.slice(12);
        return `0x${Buffer.from(h160).toString('hex')}`.toLowerCase();
      }
      return address;
    } catch {
      return address;
    }
  }

  /**
   * Build VC payload with explicit issuer DID
   * 
   * Used for both did:web and did:key paths in hybrid flow.
   * 
   * @param dpp - Digital Product Passport
   * @param issuerDid - Issuer DID (did:web:... or did:key:z...)
   * @param blockchainAddress - Polkadot account address for chainAnchor
   * @param network - Network identifier
   * @returns VC payload (unsigned)
   */
  private buildVcPayloadWithIssuer(
    dpp: DigitalProductPassport,
    issuerDid: string,
    blockchainAddress: string,
    network?: string
  ): any {
    // Add chain anchor to DPP (Polkadot account as metadata)
    const dppWithChainAnchor = {
      ...dpp,
      chainAnchor: {
        '@type': 'BlockchainAnchor',
        network: `polkadot:${network || 'westend-asset-hub'}`,
        issuerAccount: blockchainAddress,
        version: 1,
        // tokenId and other fields will be added after on-chain registration
      },
    };

    const credentialId = `urn:fidesdpp:vc:${crypto.randomBytes(16).toString('hex')}`;
    const dppContextUrl =
      process.env.UNTP_DPP_CONTEXT_URL || 'https://test.uncefact.org/vocabulary/untp/dpp/0.6.0/';
    const issuedAt = new Date().toISOString();
    const issuerName =
      (dpp as any)?.manufacturer?.name ||
      (dpp as any)?.manufacturer?.legalName ||
      'Issuer';

    // Build VC-JWT payload (iss/sub/nbf/jti + vc claim)
    return {
      iss: issuerDid,
      sub: dpp.product.identifier,
      nbf: Math.floor(Date.now() / 1000),
      jti: credentialId,
      vc: {
        '@context': [
          'https://www.w3.org/ns/credentials/v2',
          dppContextUrl,
          'https://www.w3.org/2018/credentials/v1',
        ],
        type: ['VerifiableCredential', 'DigitalProductPassport'],
        id: credentialId,
        issuer: { type: ['CredentialIssuer'], id: issuerDid, name: issuerName },
        issuanceDate: issuedAt,
        validFrom: issuedAt,
        credentialSubject: dppWithChainAnchor,
        credentialSchema: {
          id: process.env.UNTP_SCHEMA_URL || 
              'https://test.uncefact.org/vocabulary/untp/dpp/untp-dpp-schema-0.6.0.json',
          type: 'JsonSchema2023',
        },
        ...(process.env.UNTP_SCHEMA_SHA256 && {
          schemaSha256: process.env.UNTP_SCHEMA_SHA256,
        }),
      },
    };
  }

  /**
   * Build VC payload without signing (legacy method)
   * 
   * @deprecated This method creates invalid DIDs. Use buildVcPayloadWithIssuer() instead.
   * This method is kept for backward compatibility but should not be used for new passports.
   */
  private buildVcPayload(
    dpp: DigitalProductPassport,
    issuerAddress: string,
    network?: string
  ): any {
    // WARNING: This creates an invalid DID format!
    // The correct way is to use createKeyDid(publicKey) from did-resolver.ts
    // This method should NOT be used for production passports.
    console.warn(
      'WARNING: buildVcPayload() creates invalid DID format. ' +
      'Use buildVcPayloadWithIssuer() or JwtVcEngine.issueDppVc() instead.'
    );
    
    // Create did:key DID from address (WRONG - this is not the correct format)
    // Correct format would be: did:key:z<base58btc-encoded-public-key>
    const issuerDid = `did:key:${issuerAddress}`;

    // Add chain anchor
    const dppWithChainAnchor = {
      ...dpp,
      chainAnchor: {
        '@type': 'BlockchainAnchor',
        network: `polkadot:${network || 'westend-asset-hub'}`,
        issuerAccount: issuerAddress,
      },
    };

    const credentialId = `urn:fidesdpp:vc:${crypto.randomBytes(16).toString('hex')}`;
    const dppContextUrl =
      process.env.UNTP_DPP_CONTEXT_URL || 'https://test.uncefact.org/vocabulary/untp/dpp/0.6.0/';
    const issuedAt = new Date().toISOString();

    // Build VC-JWT payload (iss/sub/nbf/jti + vc claim)
    return {
      iss: issuerDid,
      sub: dpp.product.identifier,
      nbf: Math.floor(Date.now() / 1000),
      jti: credentialId,
      vc: {
        '@context': [
          'https://www.w3.org/ns/credentials/v2',
          dppContextUrl,
          'https://www.w3.org/2018/credentials/v1',
        ],
        type: ['VerifiableCredential', 'DigitalProductPassport'],
        id: credentialId,
        issuer: { type: ['CredentialIssuer'], id: issuerDid, name: 'Issuer' },
        issuanceDate: issuedAt,
        validFrom: issuedAt,
        credentialSubject: dppWithChainAnchor,
      },
    };
  }

  /**
   * Base64 URL encode
   */
  private base64UrlEncode(str: string): string {
    const base64 = Buffer.from(str, 'utf-8').toString('base64');
    return base64
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  private base64UrlEncodeBytes(bytes: Uint8Array): string {
    const base64 = Buffer.from(bytes).toString('base64');
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  private base64UrlDecodeBytes(input: string): Uint8Array {
    const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    return new Uint8Array(Buffer.from(padded, 'base64'));
  }

  private encryptJson(
    value: unknown,
    key: Uint8Array,
    aad?: Uint8Array
  ): { alg: 'AES-256-GCM'; iv: string; ciphertext: string; tag: string } {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(key), iv);
    if (aad) {
      cipher.setAAD(Buffer.from(aad));
    }
    const plaintext = Buffer.from(JSON.stringify(value), 'utf-8');
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      alg: 'AES-256-GCM',
      iv: this.base64UrlEncodeBytes(iv),
      ciphertext: this.base64UrlEncodeBytes(ciphertext),
      tag: this.base64UrlEncodeBytes(tag),
    };
  }

  private decryptJson<T>(
    encrypted: { alg: 'AES-256-GCM'; iv: string; ciphertext: string; tag: string },
    key: Uint8Array,
    aad?: Uint8Array
  ): T {
    if (encrypted.alg !== 'AES-256-GCM') {
      throw new Error(`Unsupported encryption algorithm: ${encrypted.alg}`);
    }

    const iv = this.base64UrlDecodeBytes(encrypted.iv);
    const ciphertext = this.base64UrlDecodeBytes(encrypted.ciphertext);
    const tag = this.base64UrlDecodeBytes(encrypted.tag);

    const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(key), Buffer.from(iv));
    if (aad) {
      decipher.setAAD(Buffer.from(aad));
    }
    decipher.setAuthTag(Buffer.from(tag));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertext)), decipher.final()]);
    return JSON.parse(plaintext.toString('utf-8')) as T;
  }

  private validateAnnexIIIInput(
    annex: CreatePassportFormInput['annexIII'] | undefined
  ): void {
    if (!annex) return;

    if (annex.gtin) {
      const digits = annex.gtin.replace(/\s+/g, '');
      if (!/^\d{8}(\d{4}|\d{5}|\d{6})?$/.test(digits) && !/^\d{12,14}$/.test(digits)) {
        throw new Error('Invalid GTIN format.');
      }
    }

    if (annex.taricCode) {
      const code = annex.taricCode.replace(/\s+/g, '');
      if (!/^\d{10}$/.test(code)) {
        throw new Error('Invalid TARIC code format (expected 10 digits).');
      }
    }

    if (annex.importer?.eori) {
      const eori = annex.importer.eori.replace(/\s+/g, '');
      if (!/^[A-Z]{2}[A-Z0-9]{8,15}$/.test(eori)) {
        throw new Error('Invalid EORI format.');
      }
    }
  }

  private buildAnnexIIIData(
    input: CreatePassportFormInput,
    issuerDid: string
  ): {
    public: Record<string, any>;
    restricted: Record<string, any>;
  } {
    const manufacturerOperatorId = input.manufacturer.identifier;

    const publicData = {
      uniqueProductId: input.annexIII?.uniqueProductId || input.productId,
      gtin: input.annexIII?.gtin,
      taricCode: input.annexIII?.taricCode,
      manufacturer: {
        name: input.manufacturer.name,
        operatorId: manufacturerOperatorId,
      },
      issuerDid,
    };

    const restrictedData = {
      complianceDocs: input.annexIII?.complianceDocs || [],
      userInformation: input.annexIII?.userInformation || [],
      otherOperators: input.annexIII?.otherOperators || [],
      facilities: input.annexIII?.facilities || [],
      importer: input.annexIII?.importer || {},
      responsibleEconomicOperator: input.annexIII?.responsibleEconomicOperator || {},
    };

    return { public: publicData, restricted: restrictedData };
  }
}
