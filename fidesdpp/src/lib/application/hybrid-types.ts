/**
 * Hybrid Flow Types
 * 
 * Types for the two-phase passport creation flow:
 * Phase 1: Server prepares (no signing)
 * Phase 2: Browser signs + Server finalizes
 * 
 * @license Apache-2.0
 */

import type { Granularity } from '../chain/ChainAdapter';

/**
 * Form input from browser (Phase 1)
 */
export interface CreatePassportFormInput {
  // Product identifiers
  productId: string;
  productName: string;
  productDescription?: string;
  
  // Granularity-specific identifiers
  granularity: Granularity;
  batchNumber?: string;
  serialNumber?: string;
  
  // Manufacturer info
  manufacturer: {
    name: string;
    identifier?: string;
    country?: string;
    facility?: string;
    facilityId?: string;
  };

  /**
   * Optional Annex III (EU 2024/1781) fields.
   *
   * These are stored off-chain in the VC payload and can be split into public vs restricted
   * sections depending on the chosen data disclosure model.
   */
  annexIII?: {
    // (b) Unique product identifier (format depends on delegated act)
    uniqueProductId?: string;

    // (c) GTIN (ISO/IEC 15459-6) or equivalent
    gtin?: string;

    // (d) Commodity codes (e.g. TARIC)
    taricCode?: string;

    // (e) Compliance documentation references
    complianceDocs?: Array<{
      type: 'declaration-of-conformity' | 'technical-documentation' | 'conformity-certificate' | 'other';
      title?: string;
      url: string;
      sha256?: string; // hex string "0x..." or plain hex
    }>;

    // (f) Manuals, instructions, warnings, safety info
    userInformation?: Array<{
      type: 'manual' | 'instructions' | 'warnings' | 'safety';
      title?: string;
      language?: string;
      url: string;
      sha256?: string;
    }>;

    // (h) Other operator identifiers (non-manufacturer)
    otherOperators?: Array<{
      role: string;
      operatorId: string;
    }>;

    // (i) Facility identifiers
    facilities?: Array<{
      facilityId: string;
      name?: string;
      country?: string;
      city?: string;
      address?: string;
    }>;

    // (j) Importer information (incl. EORI)
    importer?: {
      name?: string;
      eori?: string;
      contactEmail?: string;
      contactPhone?: string;
      addressCountry?: string;
    };

    // (k) EU responsible economic operator
    responsibleEconomicOperator?: {
      name?: string;
      operatorId?: string;
      contactEmail?: string;
      contactPhone?: string;
      addressCountry?: string;
    };

    /**
     * Optional product images (uploaded to IPFS).
     * Stored in the Annex III public section for customer-facing rendering.
     */
    productImages?: Array<{
      cid: string;
      uri: string; // ipfs://<cid>
      url: string; // gateway URL
      contentType?: string;
      name?: string;
      alt?: string;
      kind?: 'primary' | 'gallery';
    }>;
  };

  /**
   * Optional traceability anchors (DTE links).
   *
   * This maps to `traceabilityInformation` in the UNTP DPP credentialSubject.
   * Each entry should reference a DTE credential (e.g. `ipfs://<cid>`).
   */
  traceability?: Array<{
    /** Reference to the traceability event credential (URI) */
    event_ref: string;
    /** Optional actor identifier (DID/URI) */
    actor?: string;
    /** Optional evidence link (e.g. gateway URL) */
    evidence_uri?: string;
  }>;
  
  // Issuer info (from wallet)
  issuerAddress: string;
  issuerPublicKey: string; // hex-encoded
  network?: string;
  
  // Optional: did:web issuer (UNTP-compliant path)
  issuerDid?: string;              // Optional: did:web (new path)
  useDidWeb?: boolean;             // Flag: use did:web if available
}

/**
 * Prepared data returned by server (Phase 1 → Phase 2)
 */
export interface PreparedPassportData {
  // Correlation ID to link prepare → finalize
  preparedId: string;
  
  // VC signable data (to be signed in browser)
  vcSignablePayload: {
    // JWS signing input (header.payload format)
    signingInput: string;
    // Header and payload separately for inspection
    header: {
      alg: string;
      typ: string;
    };
    payload: any;
  };
  
  // On-chain data that will be used (for preview)
  chainPreview: {
    granularity: Granularity;
    datasetType: string;
    subjectIdHash?: string;
  };
  
  // UNTP DPP preview (for UI inspection)
  untpPreview: {
    productId: string;
    productName: string;
    granularityLevel: string;
  };

  // Optional: verify-link key for decrypting restricted sections (tiers)
  verification?: {
    key: string; // base64url
    linkTemplate: string; // e.g. https://host/render/{tokenId}?key=...
  };
}

/**
 * Signed data from browser (Phase 2 → Phase 3)
 */
export interface FinalizeCreatePassportInput {
  // Correlation ID from prepare step
  preparedId: string;
  
  // Signed VC-JWT from browser
  signedVcJwt: string;
  
  // Issuer info (for validation)
  issuerAddress: string;
  issuerPublicKey: string; // hex-encoded
}

/**
 * Registration data prepared by server (for browser to sign and submit)
 */
export interface PassportRegistrationData {
  datasetUri: string;
  payloadHash: string; // hex string "0x..."
  datasetType: string;
  granularity: Granularity;
  subjectIdHash?: string; // hex string "0x..." or undefined
  ipfsCid: string;
  // Progressive did:web onboarding warnings
  issuerDidWebStatus?: string; // PENDING, FAILED, UNKNOWN
  warning?: string; // Warning message if did:web fallback occurred
  // Optional: verify-link key for decrypting restricted sections (tiers)
  verificationKey?: string; // base64url
}

/**
 * Final result from server (Phase 3)
 */
export interface CreatePassportResult {
  success: boolean;
  tokenId?: string;
  ipfsCid?: string;
  txHash?: string;
  blockNumber?: number;
  error?: string;
  // Progressive did:web onboarding warnings
  issuerDidWebStatus?: string; // PENDING, FAILED, UNKNOWN
  warning?: string; // Warning message if did:web fallback occurred
  // Registration data (if browser should sign and submit)
  registrationData?: PassportRegistrationData;
  // Optional convenience fields
  verifyUrl?: string;
}

/**
 * In-memory store for prepared passport data
 * (In production, use Redis or similar)
 */
export interface PreparedPassportStore {
  [preparedId: string]: {
    input: CreatePassportFormInput;
    untpDpp: any; // DigitalProductPassport
    vcPayload: any;
    createdAt: number;
    expiresAt: number;
  };
}
