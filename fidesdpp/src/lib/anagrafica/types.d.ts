/**
 * Anagrafica Types - Allineati ai Vocabulary UNTP
 *
 * Clean Room Implementation: Based on UNTP public specifications (markdown docs),
 * not derived from GPL-licensed vocabulary.jsonld files.
 *
 * References:
 * - reference/specification/DigitalProductPassport.md
 * - reference/specification/IdentityResolver.md
 * - reference/specification/DIDMethods.md
 *
 * License: Apache-2.0
 */
export interface Entity {
    id: string;
    entityType: 'issuer' | 'manufacturer' | 'facility';
    primaryIdentifier: string;
    identifierSchemeId?: string;
    identifierSchemeName?: string;
    registeredId?: string;
    name: string;
    description?: string;
    registrationCountry?: string;
    organisationWebsite?: string;
    industryCategories?: Classification[];
    identifiers?: EntityIdentifier[];
    idrEndpoint?: string;
    verificationStatus: 'verified' | 'unverified' | 'pending';
    facility?: FacilityDetails;
    digitalIdentityAnchor?: DigitalIdentityAnchor;
    metadata?: Record<string, any>;
}
export interface Classification {
    schemeId: string;
    schemeName?: string;
    code: string;
    name?: string;
}
export interface FacilityDetails {
    operatedByPartyId?: string;
    countryOfOperation?: string;
    processCategories?: Classification[];
    locationInformation?: LocationInformation;
    facilityIdentifiers?: FacilityIdentifier[];
    cadastralBoundaryUri?: string;
}
export interface LocationInformation {
    plusCode?: string;
    geoLocation?: GeoJSON.Point;
    geoBoundary?: GeoJSON.Polygon;
    address?: Address;
}
export interface Address {
    streetAddress?: string;
    postalCode?: string;
    addressLocality?: string;
    addressRegion?: string;
    addressCountry?: string;
}
export interface Product {
    id: string;
    productIdentifier: string;
    identifierSchemeId?: string;
    identifierSchemeName?: string;
    registeredId?: string;
    name: string;
    description?: string;
    producedByPartyId?: string;
    producedAtFacilityId?: string;
    productionDate?: string;
    countryOfProduction?: string;
    batchNumber?: string;
    serialNumber?: string;
    classifications?: Classification[];
    dimensions?: ProductDimensions;
    links?: ProductLink[];
    characteristics?: Record<string, any>;
}
export interface ProductDimensions {
    length?: Measure;
    width?: Measure;
    height?: Measure;
    weight?: Measure;
    volume?: Measure;
}
export interface Measure {
    value: number;
    unit: string;
}
export interface ProductLink {
    linkUrl: string;
    linkName?: string;
    linkType?: string;
    category: 'furtherInformation' | 'productImage' | 'other';
}
export interface DigitalIdentityAnchor {
    did: string;
    registeredId: string;
    idSchemeId?: string;
    idSchemeName?: string;
    registerType?: string;
    registrationScopeList?: string[];
    vcId?: string;
    vcIssuer?: string;
    vcIssuedAt?: Date;
    vcValidFrom?: Date;
    vcValidUntil?: Date;
}
export interface EntityIdentifier {
    identifier: string;
    schemeId?: string;
    schemeName?: string;
    registeredId?: string;
    isPrimary: boolean;
}
export interface FacilityIdentifier {
    identifier: string;
    schemeId?: string;
    schemeName?: string;
    registeredId?: string;
}
//# sourceMappingURL=types.d.ts.map