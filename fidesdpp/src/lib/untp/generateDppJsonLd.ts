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
   * Values: 'model' | 'batch' | 'item'
   *
   * Note: some internal flows still use 'productClass' as a synonym for 'model'.
   * MUST match on-chain granularity enum
   */
  granularityLevel?: 'productClass' | 'model' | 'batch' | 'item';
  product: UntpProduct;
  manufacturer?: UntpOrganization;
  materialsProvenance?: UntpMaterial[];
  conformityClaim?: UntpClaim[];
  traceabilityInformation?: UntpTraceabilityEvent[];
  // FIDES-DPP extensions
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
export function generateUntpDppJsonLd(
  passportData: any,
  issuerDid?: string
): UntpDppJsonLd {
  const now = new Date().toISOString();
  
  return {
    '@context': [
      'https://www.w3.org/ns/credentials/v2',
      'https://www.w3.org/2018/credentials/v1',
      'https://test.uncefact.org/vocabulary/untp/core/working/',
      'https://test.uncefact.org/vocabulary/untp/dpp/working/',
      'https://schema.org/',
    ],
    type: ['VerifiableCredential', 'DigitalProductPassport'],
    issuer: issuerDid || passportData.issuer || 'urn:unknown:issuer',
    issuanceDate: passportData.created_at || now,
    expirationDate: passportData.expiration_date,
    credentialSubject: {
      '@type': 'DigitalProductPassport',
      id: passportData.token_id ? `urn:fides-dpp:token:${passportData.token_id}` : undefined,
      // Granularity level - aligned with UNTP and ESPR Article 10(1)(f)
      granularityLevel: passportData.granularityLevel || passportData.granularity_level,
      product: mapProduct(passportData.product),
      manufacturer: passportData.manufacturer ? mapManufacturer(passportData.manufacturer) : undefined,
      materialsProvenance: passportData.materials?.map(mapMaterial),
      conformityClaim: passportData.compliance_claims?.map(mapClaim),
      traceabilityInformation: passportData.traceability?.map(mapTraceabilityEvent),
      // FIDES-DPP extensions (per dpp-untp-mapping.md lines 43-44)
      datasetUri: passportData.dataset_uri,
      payloadHash: passportData.payload_hash,
    },
    credentialStatus: passportData.status ? mapStatus(passportData.status, passportData.status_reason_code) : undefined,
  };
}

/**
 * Map product data to UNTP Product structure
 */
function mapProduct(product: any): UntpProduct {
  if (!product) {
    throw new Error('Product data is required for UNTP DPP');
  }

  return {
    '@type': 'Product',
    identifier: product.product_id,
    identifierScheme: mapIdentifierScheme(product.identifier_scheme),
    name: product.name,
    description: product.description,
    batchNumber: product.batch_number,
    serialNumber: product.serial_number,
    productionDate: product.production_date,
    countryOfProduction: product.country_of_production,
    category: product.category,
    brand: product.brand,
    modelNumber: product.model_number,
    variant: product.variant,
    dimensions: product.dimensions ? mapDimensions(product.dimensions) : undefined,
    netWeight: product.net_weight ? mapMeasure(product.net_weight) : undefined,
    grossWeight: product.gross_weight ? mapMeasure(product.gross_weight) : undefined,
    volume: product.volume ? mapMeasure(product.volume) : undefined,
    classification: product.classifications?.map(mapClassification),
  };
}

/**
 * Map manufacturer data to UNTP Organization structure
 */
function mapManufacturer(manufacturer: any): UntpOrganization {
  return {
    '@type': 'Organization',
    name: manufacturer.name,
    identifier: manufacturer.identifier,
    addressCountry: manufacturer.country,
    facility: manufacturer.facility ? {
      '@type': 'Facility',
      name: manufacturer.facility,
      identifier: manufacturer.facility_id,
    } : undefined,
    url: manufacturer.website,
  };
}

/**
 * Map material data to UNTP Material structure
 */
function mapMaterial(material: any): UntpMaterial {
  return {
    '@type': 'Material',
    name: material.name,
    massFraction: material.mass_fraction ? material.mass_fraction / 1000000 : undefined, // Convert from u32 scale
    countryOfOrigin: material.origin_country,
    hazardous: material.hazardous,
  };
}

/**
 * Map compliance claim to UNTP Claim structure
 */
function mapClaim(claim: any): UntpClaim {
  return {
    '@type': 'Claim',
    identifier: claim.claim_id,
    description: claim.description,
    referenceStandard: claim.standard_ref,
    referenceRegulation: claim.regulation_ref,
    evidenceLink: claim.evidence_uri,
    verifiedBy: claim.verified_by,
    verificationDate: claim.verified_at,
  };
}

/**
 * Map traceability anchor to UNTP TraceabilityEvent
 */
function mapTraceabilityEvent(event: any): UntpTraceabilityEvent {
  return {
    '@type': 'TraceabilityEvent',
    eventReference: event.event_ref,
    actor: event.actor,
    evidenceLink: event.evidence_uri,
  };
}

/**
 * Map dimensions to UNTP Dimension structure
 */
function mapDimensions(dimensions: any): UntpDimension {
  return {
    length: dimensions.length ? mapMeasure(dimensions.length) : undefined,
    width: dimensions.width ? mapMeasure(dimensions.width) : undefined,
    height: dimensions.height ? mapMeasure(dimensions.height) : undefined,
  };
}

/**
 * Map measure to UNTP Measure structure
 */
function mapMeasure(measure: any): UntpMeasure {
  return {
    value: measure.value / 1000, // Convert from scaled u32
    unit: measure.unit,
  };
}

/**
 * Map classification to UNTP Classification structure
 */
function mapClassification(classification: any): UntpClassification {
  return {
    code: classification.code,
    scheme: classification.scheme,
    name: classification.name,
  };
}

/**
 * Map identifier scheme enum to UNTP scheme URI
 */
function mapIdentifierScheme(scheme: any): string {
  if (typeof scheme === 'string') {
    return scheme;
  }
  
  // Map from contract enum
  const schemeMap: Record<string, string> = {
    'Gs1Gtin': 'https://www.gs1.org/gtin',
    'Gs1DigitalLink': 'https://id.gs1.org',
    'Uri': 'urn:uri',
    'Custom': 'urn:custom',
  };
  
  return schemeMap[scheme] || 'urn:unknown';
}

/**
 * Map status to UNTP CredentialStatus
 */
function mapStatus(status: string, statusReason?: string): CredentialStatus {
  // Map contract status to UNTP status
  const statusMap: Record<string, string> = {
    'Draft': 'draft',
    'Active': 'active',
    'Suspended': 'suspended',
    'Revoked': 'revoked',
    'Archived': 'archived',
  };
  
  return {
    type: 'StatusList2021Entry',
    status: statusMap[status] || status.toLowerCase(),
    statusReason: statusReason,
  };
}

/**
 * Validate UNTP JSON-LD structure
 * Basic validation - full JSON Schema validation should be done separately
 */
export function validateUntpDppJsonLd(jsonLd: UntpDppJsonLd): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!jsonLd['@context']?.includes('https://www.w3.org/ns/credentials/v2')) {
    errors.push('Missing required W3C VC context');
  }
  
  if (!jsonLd.type?.includes('VerifiableCredential')) {
    errors.push('Missing VerifiableCredential type');
  }
  
  if (!jsonLd.type?.includes('DigitalProductPassport')) {
    errors.push('Missing DigitalProductPassport type');
  }
  
  if (!jsonLd.issuer) {
    errors.push('Missing issuer');
  }
  
  if (!jsonLd.issuanceDate) {
    errors.push('Missing issuanceDate');
  }
  
  if (!jsonLd.credentialSubject?.product?.identifier) {
    errors.push('Missing product identifier');
  }
  
  if (!jsonLd.credentialSubject?.product?.name) {
    errors.push('Missing product name');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Type alias for Digital Product Passport
 * This is the credentialSubject of a UNTP DPP VC
 */
export type DigitalProductPassport = UntpCredentialSubject;
