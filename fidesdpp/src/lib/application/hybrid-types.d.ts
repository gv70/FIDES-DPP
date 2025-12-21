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