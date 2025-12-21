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

// untp-core:Party / untp-core:CredentialIssuer
export interface Entity {
  id: string;
  entityType: 'issuer' | 'manufacturer' | 'facility';
  
  // untp-core:Party properties
  primaryIdentifier: string; // untp-core:id
  identifierSchemeId?: string; // untp-core:idScheme.id
  identifierSchemeName?: string; // untp-core:idScheme.name
  registeredId?: string; // untp-core:registeredId
  name: string; // untp-core:name
  description?: string; // untp-core:description
  registrationCountry?: string; // untp-core:registrationCountry (ISO-3166)
  organisationWebsite?: string; // untp-core:organisationWebsite
  
  // Classificazioni
  industryCategories?: Classification[]; // untp-core:industryCategory
  
  // Identificatori multipli
  identifiers?: EntityIdentifier[]; // untp-core:issuerAlsoKnownAs, untp-core:partyAlsoKnownAs
  
  // IDR e verifica
  idrEndpoint?: string;
  verificationStatus: 'verified' | 'unverified' | 'pending';
  
  // Facility details (se entityType = 'facility')
  facility?: FacilityDetails;
  
  // DIA (se presente)
  digitalIdentityAnchor?: DigitalIdentityAnchor;
  
  metadata?: Record<string, any>;
}

// untp-core:Classification
export interface Classification {
  schemeId: string; // untp-core:Classification.schemeID
  schemeName?: string; // untp-core:Classification.schemeName
  code: string; // untp-core:Classification.code
  name?: string; // untp-core:Classification.name
}

// untp-core:Facility
export interface FacilityDetails {
  operatedByPartyId?: string; // untp-core:operatedByParty
  countryOfOperation?: string; // untp-core:countryOfOperation
  processCategories?: Classification[]; // untp-core:processCategory
  locationInformation?: LocationInformation; // untp-core:locationInformation
  facilityIdentifiers?: FacilityIdentifier[]; // untp-core:facilityAlsoKnownAs
  cadastralBoundaryUri?: string; // UNTP DPP-04 requirement
}

export type GeoJsonPoint = {
  type: 'Point';
  coordinates: [number, number] | [number, number, number];
};

export type GeoJsonPolygon = {
  type: 'Polygon';
  coordinates: number[][][];
};

// untp-core:Location
export interface LocationInformation {
  plusCode?: string; // untp-core:plusCode
  geoLocation?: GeoJsonPoint; // untp-core:geoLocation
  geoBoundary?: GeoJsonPolygon; // untp-core:geoBoundary
  address?: Address; // untp-core:address
}

// untp-core:Address
export interface Address {
  streetAddress?: string; // untp-core:streetAddress
  postalCode?: string; // untp-core:postalCode
  addressLocality?: string; // untp-core:addressLocality
  addressRegion?: string; // untp-core:addressRegion
  addressCountry?: string; // untp-core:addressCountry (ISO-3166)
}

// untp-core:Product
export interface Product {
  id: string;
  productIdentifier: string; // untp-core:Product.id
  identifierSchemeId?: string; // untp-core:idScheme.id
  identifierSchemeName?: string;
  registeredId?: string; // untp-core:registeredId
  name: string; // untp-core:name
  description?: string; // untp-core:description
  
  // Relazioni
  producedByPartyId?: string; // untp-core:producedByParty
  producedAtFacilityId?: string; // untp-core:producedAtFacility
  
  // Dati produzione
  productionDate?: string; // untp-core:productionDate (ISO 8601)
  countryOfProduction?: string; // untp-core:countryOfProduction (ISO-3166)
  batchNumber?: string; // untp-core:batchNumber
  serialNumber?: string; // untp-core:serialNumber
  
  // Classificazioni e dimensioni
  classifications?: Classification[]; // untp-core:productCategory
  dimensions?: ProductDimensions; // untp-core:Dimension
  links?: ProductLink[]; // untp-core:furtherInformation, untp-core:productImage
  
  // Estensioni
  characteristics?: Record<string, any>; // untp-core:characteristics (JSONB)
}

// untp-core:Dimension
export interface ProductDimensions {
  length?: Measure;
  width?: Measure;
  height?: Measure;
  weight?: Measure;
  volume?: Measure;
}

// untp-core:Measure
export interface Measure {
  value: number;
  unit: string; // UNECE Recommendation 20 (e.g., 'MTR', 'KGM', 'LTR')
}

// untp-core:Link
export interface ProductLink {
  linkUrl: string; // untp-core:Link.linkURL
  linkName?: string; // untp-core:Link.name
  linkType?: string; // untp-core:Link.linkType (URI)
  category: 'furtherInformation' | 'productImage' | 'other';
}

// untp-dia:DigitalIdentityAnchor
export interface DigitalIdentityAnchor {
  did: string; // untp-dia:id
  registeredId: string; // untp-dia:registeredId
  idSchemeId?: string; // untp-dia:idScheme.id
  idSchemeName?: string;
  registerType?: string; // untp-dia:registerType
  registrationScopeList?: string[]; // untp-dia:registrationScopeList (array di URI)
  vcId?: string;
  vcIssuer?: string;
  vcIssuedAt?: Date;
  vcValidFrom?: Date;
  vcValidUntil?: Date;
}

export interface EntityIdentifier {
  identifier: string; // untp-core:Party.id
  schemeId?: string; // untp-core:IdentifierScheme.id
  schemeName?: string;
  registeredId?: string; // untp-core:registeredId
  isPrimary: boolean;
}

export interface FacilityIdentifier {
  identifier: string; // untp-core:Facility.id
  schemeId?: string;
  schemeName?: string;
  registeredId?: string;
}


