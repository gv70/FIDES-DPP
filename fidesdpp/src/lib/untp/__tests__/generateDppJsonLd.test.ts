/**
 * Tests for UNTP JSON-LD generator
 * 
 * @license Apache-2.0
 */

import { describe, it, expect } from '@jest/globals';
import { generateUntpDppJsonLd, validateUntpDppJsonLd } from '../generateDppJsonLd';

describe('generateUntpDppJsonLd', () => {
  const mockPassportData = {
    token_id: '1',
    product: {
      product_id: 'PROD-001',
      identifier_scheme: 'Custom',
      name: 'Test Product',
      description: 'Test Description',
      batch_number: 'BATCH-001',
      serial_number: 'SN-001',
      category: 'Electronics',
    },
    manufacturer: {
      name: 'Test Manufacturer',
      identifier: 'VAT-123456',
      country: 'US',
      facility: 'Factory 1',
      facility_id: 'FAC-001',
    },
    materials: [
      {
        name: 'Steel',
        mass_fraction: 500000, // 0.5 after conversion
        origin_country: 'CN',
        hazardous: false,
      },
    ],
    compliance_claims: [
      {
        claim_id: 'CLAIM-001',
        description: 'ISO 9001 Certified',
        standard_ref: 'ISO 9001',
      },
    ],
    status: 'Active',
    created_at: '2025-01-01T00:00:00.000Z',
  };

  describe('Basic structure', () => {
    it('should generate valid UNTP JSON-LD structure', () => {
      const jsonLd = generateUntpDppJsonLd(mockPassportData);

      expect(jsonLd['@context']).toContain('https://www.w3.org/ns/credentials/v2');
      expect(jsonLd['@context']).toContain('https://test.uncefact.org/vocabulary/untp/core/working/');
      expect(jsonLd['@context']).toContain('https://test.uncefact.org/vocabulary/untp/dpp/working/');
      
      expect(jsonLd.type).toContain('VerifiableCredential');
      expect(jsonLd.type).toContain('DigitalProductPassport');
      
      expect(jsonLd.issuer).toBeDefined();
      expect(jsonLd.issuanceDate).toBeDefined();
      expect(jsonLd.credentialSubject).toBeDefined();
    });

    it('should map credentialSubject correctly', () => {
      const jsonLd = generateUntpDppJsonLd(mockPassportData);
      const subject = jsonLd.credentialSubject;

      expect(subject['@type']).toBe('DigitalProductPassport');
      expect(subject.product).toBeDefined();
      expect(subject.manufacturer).toBeDefined();
    });
  });

  describe('Product mapping', () => {
    it('should map product fields correctly', () => {
      const jsonLd = generateUntpDppJsonLd(mockPassportData);
      const product = jsonLd.credentialSubject.product;

      expect(product['@type']).toBe('Product');
      expect(product.identifier).toBe('PROD-001');
      expect(product.name).toBe('Test Product');
      expect(product.description).toBe('Test Description');
      expect(product.batchNumber).toBe('BATCH-001');
      expect(product.serialNumber).toBe('SN-001');
    });
  });

  describe('Manufacturer mapping', () => {
    it('should map manufacturer fields correctly', () => {
      const jsonLd = generateUntpDppJsonLd(mockPassportData);
      const manufacturer = jsonLd.credentialSubject.manufacturer;

      expect(manufacturer?.['@type']).toBe('Organization');
      expect(manufacturer?.name).toBe('Test Manufacturer');
      expect(manufacturer?.identifier).toBe('VAT-123456');
      expect(manufacturer?.addressCountry).toBe('US');
      expect(manufacturer?.facility?.name).toBe('Factory 1');
    });
  });

  describe('Materials mapping', () => {
    it('should map materials with correct mass fraction conversion', () => {
      const jsonLd = generateUntpDppJsonLd(mockPassportData);
      const materials = jsonLd.credentialSubject.materialsProvenance;

      expect(materials).toHaveLength(1);
      expect(materials?.[0]['@type']).toBe('Material');
      expect(materials?.[0].name).toBe('Steel');
      expect(materials?.[0].massFraction).toBe(0.5); // 500000 / 1000000
      expect(materials?.[0].countryOfOrigin).toBe('CN');
      expect(materials?.[0].hazardous).toBe(false);
    });
  });

  describe('Compliance claims mapping', () => {
    it('should map compliance claims correctly', () => {
      const jsonLd = generateUntpDppJsonLd(mockPassportData);
      const claims = jsonLd.credentialSubject.conformityClaim;

      expect(claims).toHaveLength(1);
      expect(claims?.[0]['@type']).toBe('Claim');
      expect(claims?.[0].identifier).toBe('CLAIM-001');
      expect(claims?.[0].description).toBe('ISO 9001 Certified');
      expect(claims?.[0].referenceStandard).toBe('ISO 9001');
    });
  });

  describe('FIDES-DPP extensions', () => {
    it('should include datasetUri extension', () => {
      const dataWithUri = {
        ...mockPassportData,
        dataset_uri: 'ipfs://bafkreiabc123',
      };
      const jsonLd = generateUntpDppJsonLd(dataWithUri);

      expect(jsonLd.credentialSubject.datasetUri).toBe('ipfs://bafkreiabc123');
    });

    it('should include payloadHash extension', () => {
      const dataWithHash = {
        ...mockPassportData,
        payload_hash: '0xabc123',
      };
      const jsonLd = generateUntpDppJsonLd(dataWithHash);

      expect(jsonLd.credentialSubject.payloadHash).toBe('0xabc123');
    });
  });
});

describe('validateUntpDppJsonLd', () => {
  it('should validate correct JSON-LD', () => {
    const validJsonLd = {
      '@context': [
        'https://www.w3.org/ns/credentials/v2',
        'https://test.uncefact.org/vocabulary/untp/core/working/',
        'https://test.uncefact.org/vocabulary/untp/dpp/working/',
      ],
      type: ['VerifiableCredential', 'DigitalProductPassport'],
      issuer: 'did:example:issuer',
      issuanceDate: '2025-01-01T00:00:00.000Z',
      credentialSubject: {
        '@type': 'DigitalProductPassport',
        product: {
          '@type': 'Product',
          identifier: 'PROD-001',
          name: 'Test Product',
        },
      },
    };

    const result = validateUntpDppJsonLd(validJsonLd);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should detect missing W3C VC context', () => {
    const invalidJsonLd = {
      '@context': ['https://test.uncefact.org/vocabulary/untp/dpp/working/'],
      type: ['VerifiableCredential', 'DigitalProductPassport'],
      issuer: 'did:example:issuer',
      issuanceDate: '2025-01-01T00:00:00.000Z',
      credentialSubject: {
        '@type': 'DigitalProductPassport',
        product: {
          '@type': 'Product',
          identifier: 'PROD-001',
          name: 'Test Product',
        },
      },
    };

    const result = validateUntpDppJsonLd(invalidJsonLd);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing required W3C VC context');
  });

  it('should detect missing required fields', () => {
    const invalidJsonLd = {
      '@context': ['https://www.w3.org/ns/credentials/v2'],
      type: ['VerifiableCredential'],
      credentialSubject: {},
    } as any;

    const result = validateUntpDppJsonLd(invalidJsonLd);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
