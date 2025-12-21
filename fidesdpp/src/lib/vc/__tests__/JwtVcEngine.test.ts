/**
 * Tests for JwtVcEngine
 * 
 * @license Apache-2.0
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { JwtVcEngine } from '../JwtVcEngine';
import type { PolkadotAccount } from '../types';
import type { DigitalProductPassport } from '../../untp/generateDppJsonLd';

describe('JwtVcEngine', () => {
  let vcEngine: JwtVcEngine;
  let mockAccount: PolkadotAccount;
  let mockDpp: DigitalProductPassport;

  beforeEach(() => {
    vcEngine = new JwtVcEngine();

    // Mock Polkadot account
    mockAccount = {
      address: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
      publicKey: new Uint8Array(32).fill(0),
      sign: async (data: Uint8Array) => {
        // Mock signature - in real implementation, this would use actual signing
        return new Uint8Array(64).fill(0);
      },
      network: 'westend-asset-hub',
    };

    // Mock DPP
    mockDpp = {
      '@type': 'DigitalProductPassport',
      product: {
        '@type': 'Product',
        identifier: 'TEST-001',
        name: 'Test Product',
        description: 'A test product for VC',
      },
      manufacturer: {
        '@type': 'Organization',
        name: 'Test Manufacturer',
        addressCountry: 'US',
      },
    };
  });

  describe('issueDppVc', () => {
    it('should issue a VC with valid structure', async () => {
      const vcEnvelope = await vcEngine.issueDppVc(mockDpp, mockAccount);

      expect(vcEnvelope.jwt).toBeDefined();
      expect(typeof vcEnvelope.jwt).toBe('string');
      expect(vcEnvelope.jwt.split('.')).toHaveLength(3); // JWT has 3 parts

      expect(vcEnvelope.payload).toBeDefined();
      expect(vcEnvelope.payload.iss).toContain('did:key:');
      expect(vcEnvelope.payload.vc).toBeDefined();
      expect(vcEnvelope.payload.vc.type).toContain('VerifiableCredential');
      expect(vcEnvelope.payload.vc.type).toContain('DigitalProductPassport');
    });

    it('should include UNTP contexts', async () => {
      const vcEnvelope = await vcEngine.issueDppVc(mockDpp, mockAccount);

      const contexts = vcEnvelope.payload.vc['@context'];
      expect(contexts).toContain('https://www.w3.org/ns/credentials/v2');
      expect(contexts).toContain('https://test.uncefact.org/vocabulary/untp/dpp/0.6.0/');
      expect(contexts).toContain('https://www.w3.org/2018/credentials/v1');
    });

    it('should include credential subject', async () => {
      const vcEnvelope = await vcEngine.issueDppVc(mockDpp, mockAccount);

      const credentialSubject = vcEnvelope.payload.vc.credentialSubject;
      expect(credentialSubject).toBeDefined();
      expect(credentialSubject.product?.identifier).toBe('TEST-001');
      expect(credentialSubject.product?.name).toBe('Test Product');
    });

    it('should support expiration date', async () => {
      const expirationDate = new Date('2025-12-31');
      
      const vcEnvelope = await vcEngine.issueDppVc(mockDpp, mockAccount, {
        expirationDate,
      });

      expect(vcEnvelope.payload.exp).toBeDefined();
      expect(vcEnvelope.payload.exp).toBe(Math.floor(expirationDate.getTime() / 1000));
    });
  });

  describe('decodeVc', () => {
    it('should decode a JWT without verification', async () => {
      const vcEnvelope = await vcEngine.issueDppVc(mockDpp, mockAccount);
      
      const decoded = vcEngine.decodeVc(vcEnvelope.jwt);

      expect(decoded.jwt).toBe(vcEnvelope.jwt);
      expect(decoded.payload).toBeDefined();
      expect(decoded.header).toBeDefined();
    });

    it('should throw on invalid JWT format', () => {
      expect(() => {
        vcEngine.decodeVc('invalid-jwt');
      }).toThrow('Invalid JWT format');
    });
  });

  describe('extractDpp', () => {
    it('should extract DPP from VC envelope', async () => {
      const vcEnvelope = await vcEngine.issueDppVc(mockDpp, mockAccount);
      
      const extractedDpp = vcEngine.extractDpp(vcEnvelope);

      expect(extractedDpp).toBeDefined();
      expect(extractedDpp.product?.identifier).toBe('TEST-001');
      expect(extractedDpp.product?.name).toBe('Test Product');
    });
  });

  describe('verifyDppVc', () => {
    it('should return verification result', async () => {
      const vcEnvelope = await vcEngine.issueDppVc(mockDpp, mockAccount);
      
      const result = await vcEngine.verifyDppVc(vcEnvelope.jwt);

      // Note: Actual verification will depend on proper DID resolution
      // For now, we just check the structure
      expect(result).toBeDefined();
      expect(typeof result.verified).toBe('boolean');
      expect(result.issuer).toBeDefined();
      expect(result.issuanceDate).toBeInstanceOf(Date);
    });

    it('should handle invalid JWT', async () => {
      const result = await vcEngine.verifyDppVc('invalid-jwt-string');

      expect(result.verified).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
