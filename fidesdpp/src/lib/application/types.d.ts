/**
 * Application Service Types
 *
 * DTOs and interfaces for the DPP application service layer
 *
 * @license Apache-2.0
 */
import type { DigitalProductPassport } from '../untp/generateDppJsonLd';
import type { VerificationResult } from '../vc/types';
import type { OnChainPassport, Granularity } from '../chain/ChainAdapter';
export interface CreatePassportInput {
    granularity: Granularity;
    productId: string;
    identifierScheme?: string;
    productName: string;
    productDescription?: string;
    batchNumber?: string;
    serialNumber?: string;
    productionDate?: string;
    countryOfProduction?: string;
    category?: string;
    manufacturer?: {
        name: string;
        identifier?: string;
        country?: string;
        facility?: string;
        facility_id?: string;
    };
    materials?: Array<{
        name: string;
        massFraction?: number;
        originCountry?: string;
        hazardous?: boolean;
    }>;
    compliance_claims?: Array<{
        claim_id?: string;
        description: string;
        standard_ref?: string;
        regulation_ref?: string;
        evidence_uri?: string;
    }>;
    traceability?: Array<{
        event_ref: string;
        actor?: string;
        evidence_uri?: string;
    }>;
}
export interface CreatePassportResult {
    tokenId: string;
    cid: string;
    vcJwt: string;
    txHash: string;
    blockNumber: number;
    granularity: Granularity;
    subjectIdHash: string;
}
export interface VerificationReport {
    valid: boolean;
    reason?: string;
    vcVerification?: VerificationResult;
    hashMatches?: boolean;
    issuerMatches?: boolean;
    schemaValid?: boolean;
    schemaValidation?: {
        schemaUrl?: string;
        schemaType?: string;
        schemaSha256?: string;
        valid: boolean;
        errors?: any[];
        schemaMeta?: any;
        error?: string;
    };
    onChainData?: OnChainPassport;
    vcJwt?: string;
    dpp?: DigitalProductPassport;
}
export interface UpdatePassportResult {
    tokenId: string;
    cid: string;
    vcJwt: string;
    txHash: string;
}
export interface TransactionResult {
    txHash: string;
    blockNumber: number;
}
//# sourceMappingURL=types.d.ts.map