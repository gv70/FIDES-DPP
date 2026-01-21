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
    productId: string;
    productName: string;
    productDescription?: string;
    granularity: Granularity;
    batchNumber?: string;
    serialNumber?: string;
    manufacturer: {
        name: string;
        identifier?: string;
        country?: string;
        facility?: string;
    };
    /**
     * Optional Annex III (EU 2024/1781) fields.
     */
    annexIII?: {
        uniqueProductId?: string;
        gtin?: string;
        taricCode?: string;
        complianceDocs?: Array<{
            type: 'declaration-of-conformity' | 'technical-documentation' | 'conformity-certificate' | 'other';
            title?: string;
            url: string;
            sha256?: string;
        }>;
        userInformation?: Array<{
            type: 'manual' | 'instructions' | 'warnings' | 'safety';
            title?: string;
            language?: string;
            url: string;
            sha256?: string;
        }>;
        otherOperators?: Array<{
            role: string;
            operatorId: string;
        }>;
        facilities?: Array<{
            facilityId: string;
            name?: string;
            country?: string;
        }>;
        importer?: {
            name?: string;
            eori?: string;
            contactEmail?: string;
            contactPhone?: string;
            addressCountry?: string;
        };
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
            uri: string;
            url: string;
            contentType?: string;
            name?: string;
            alt?: string;
            kind?: 'primary' | 'gallery';
        }>;
    };
    /**
     * Optional traceability anchors (DTE links).
     */
    traceability?: Array<{
        event_ref: string;
        actor?: string;
        evidence_uri?: string;
    }>;
    issuerAddress: string;
    issuerPublicKey: string;
    network?: string;
    issuerDid?: string;
    useDidWeb?: boolean;
}
/**
 * Prepared data returned by server (Phase 1 → Phase 2)
 */
export interface PreparedPassportData {
    preparedId: string;
    vcSignablePayload: {
        signingInput: string;
        header: {
            alg: string;
            typ: string;
        };
        payload: any;
    };
    chainPreview: {
        granularity: Granularity;
        datasetType: string;
        subjectIdHash?: string;
    };
    untpPreview: {
        productId: string;
        productName: string;
        granularityLevel: string;
    };
    verification?: {
        key: string;
        linkTemplate: string;
    };
}
/**
 * Signed data from browser (Phase 2 → Phase 3)
 */
export interface FinalizeCreatePassportInput {
    preparedId: string;
    signedVcJwt: string;
    issuerAddress: string;
    issuerPublicKey: string;
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
    issuerDidWebStatus?: string;
    warning?: string;
    registrationData?: any;
    verifyUrl?: string;
}
/**
 * In-memory store for prepared passport data
 * (In production, use Redis or similar)
 */
export interface PreparedPassportStore {
    [preparedId: string]: {
        input: CreatePassportFormInput;
        untpDpp: any;
        vcPayload: any;
        createdAt: number;
        expiresAt: number;
    };
}
//# sourceMappingURL=hybrid-types.d.ts.map
