/**
 * UNTP JSON-LD Generator for Digital Product Passports
 *
 * Generates UNTP-compliant JSON-LD documents following:
 * - UN Transparency Protocol DPP specification
 * - EU Regulation 2024/1781 (ESPR)
 * - W3C Verifiable Credentials Data Model
 *
 * Mapping documented in: @reference/dpp-untp-mapping.md
 *
 * @license Apache-2.0
 */
/**
 * UNTP DPP JSON-LD structure
 * Based on UNTP working vocabularies
 */
export interface UntpDppJsonLd {
    '@context': string[];
    type: string[];
    issuer: string;
    issuanceDate: string;
    expirationDate?: string;
    credentialSubject: UntpCredentialSubject;
    credentialStatus?: CredentialStatus;
}
export interface UntpCredentialSubject {
    '@type': 'DigitalProductPassport';
    id?: string;
    /**
     * Granularity level - aligned with UNTP granularityLevel and ESPR Article 10(1)(f)
     * Values: 'productClass' | 'batch' | 'item'
     * MUST match on-chain granularity enum
     */
    granularityLevel?: 'productClass' | 'batch' | 'item';
    product: UntpProduct;
    manufacturer?: UntpOrganization;
    materialsProvenance?: UntpMaterial[];
    conformityClaim?: UntpClaim[];
    traceabilityInformation?: UntpTraceabilityEvent[];
    datasetUri?: string;
    payloadHash?: string;
}
export interface UntpProduct {
    '@type': 'Product';
    identifier: string;
    identifierScheme?: string;
    name: string;
    description?: string;
    batchNumber?: string;
    serialNumber?: string;
    productionDate?: string;
    countryOfProduction?: string;
    category?: string;
    brand?: string;
    modelNumber?: string;
    variant?: string;
    dimensions?: UntpDimension;
    netWeight?: UntpMeasure;
    grossWeight?: UntpMeasure;
    volume?: UntpMeasure;
    classification?: UntpClassification[];
}
export interface UntpOrganization {
    '@type': 'Organization';
    name: string;
    identifier?: string;
    addressCountry?: string;
    facility?: UntpFacility;
    url?: string;
}
export interface UntpFacility {
    '@type': 'Facility';
    name?: string;
    identifier?: string;
}
export interface UntpMaterial {
    '@type': 'Material';
    name: string;
    massFraction?: number;
    countryOfOrigin?: string;
    hazardous?: boolean;
}
export interface UntpMeasure {
    value: number;
    unit: string;
}
export interface UntpDimension {
    length?: UntpMeasure;
    width?: UntpMeasure;
    height?: UntpMeasure;
}
export interface UntpClassification {
    code: string;
    scheme: string;
    name?: string;
}
export interface UntpClaim {
    '@type': 'Claim';
    identifier?: string;
    description: string;
    referenceStandard?: string;
    referenceRegulation?: string;
    evidenceLink?: string;
    verifiedBy?: string;
    verificationDate?: string;
}
export interface UntpTraceabilityEvent {
    '@type': 'TraceabilityEvent';
    eventReference: string;
    actor?: string;
    evidenceLink?: string;
}
export interface CredentialStatus {
    type: string;
    status: string;
    statusReason?: string;
}
/**
 * Generate UNTP-compliant JSON-LD from FIDES-DPP passport data
 *
 * @param passportData - Raw passport data from contract/form
 * @param issuerDid - DID of the issuer (manufacturer/authority)
 * @returns UNTP JSON-LD document
 */
export declare function generateUntpDppJsonLd(passportData: any, issuerDid?: string): UntpDppJsonLd;
/**
 * Validate UNTP JSON-LD structure
 * Basic validation - full JSON Schema validation should be done separately
 */
export declare function validateUntpDppJsonLd(jsonLd: UntpDppJsonLd): {
    valid: boolean;
    errors: string[];
};
/**
 * Type alias for Digital Product Passport
 * This is the credentialSubject of a UNTP DPP VC
 */
export type DigitalProductPassport = UntpCredentialSubject;
//# sourceMappingURL=generateDppJsonLd.d.ts.map