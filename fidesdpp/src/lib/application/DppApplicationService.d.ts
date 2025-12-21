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
import type { ChainAdapter } from '../chain/ChainAdapter';
import type { DigitalProductPassport } from '../untp/generateDppJsonLd';
import type { AnagraficaService } from '../anagrafica/AnagraficaService';
import type { CreatePassportInput, CreatePassportResult, VerificationReport, UpdatePassportResult, TransactionResult } from './types';
import type { CreatePassportFormInput, PreparedPassportData, FinalizeCreatePassportInput, CreatePassportResult as HybridCreatePassportResult } from './hybrid-types';
/**
 * Main application service for DPP operations
 *
 * This service orchestrates the complete flow:
 * 1. Issue VC (via VcEngine)
 * 2. Store in IPFS (via IpfsStorageBackend)
 * 3. Register on-chain (via ChainAdapter)
 */
export declare class DppApplicationService {
    private vcEngine;
    private storage;
    private chain;
    private anagraficaService?;
    constructor(vcEngine: VcEngine, storage: IpfsStorageBackend, chain: ChainAdapter, anagraficaService?: AnagraficaService | undefined);
    /**
     * Get StatusListManager if available (Phase 2+)
     */
    private getStatusListManager;
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
    createPassport(input: CreatePassportInput, issuerAccount: PolkadotAccount): Promise<CreatePassportResult>;
    /**
     * Read passport from chain (public method)
     */
    readPassport(tokenId: string): Promise<any>;
    /**
     * Complete verification flow
     */
    verifyPassport(tokenId: string): Promise<VerificationReport>;
    /**
     * Update passport dataset
     *
     * NOTE: Granularity is IMMUTABLE after registration.
     * This method only updates the VC-JWT on IPFS and the on-chain anchor.
     * If you need to change granularity, revoke the old passport and register a new one.
     */
    updatePassport(tokenId: string, updatedDpp: DigitalProductPassport, issuerAccount: PolkadotAccount): Promise<UpdatePassportResult>;
    /**
     * Revoke passport
     *
     * Phase 2+: Also revokes in Status List (if enabled)
     */
    revokePassport(tokenId: string, issuerAccount: PolkadotAccount, reason?: string): Promise<TransactionResult>;
    /**
     * Map form input to UNTP DPP structure
     *
     * Includes granularityLevel aligned with UNTP and ESPR Article 10(1)(f).
     */
    private mapInputToDpp;
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
    private computeSubjectIdHashFromDpp;
    /**
     * Map TypeScript Granularity to UNTP granularityLevel
     *
     * UNTP uses lowercase: 'productClass', 'batch', 'item'
     */
    private mapGranularityToUntp;
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
    preparePassportCreation(input: CreatePassportFormInput): PreparedPassportData;
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
    finalizePassportCreation(input: FinalizeCreatePassportInput, signerAccount: PolkadotAccount): Promise<HybridCreatePassportResult>;
    private storePreparedData;
    private retrievePreparedData;
    private deletePreparedData;
    /**
     * Map form input to UNTP DPP model
     */
    private mapFormInputToDpp;
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
    private normalizeAddress;
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
    private buildVcPayloadWithIssuer;
    /**
     * Build VC payload without signing (legacy method)
     *
     * @deprecated This method creates invalid DIDs. Use buildVcPayloadWithIssuer() instead.
     * This method is kept for backward compatibility but should not be used for new passports.
     */
    private buildVcPayload;
    /**
     * Base64 URL encode
     */
    private base64UrlEncode;
}
//# sourceMappingURL=DppApplicationService.d.ts.map