/**
 * Tests for HeliaBackend
 * 
 * @license Apache-2.0
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { HeliaBackend } from '../backends/HeliaBackend';

describe('HeliaBackend', () => {
  let backend: HeliaBackend;

  beforeAll(() => {
    backend = new HeliaBackend({
      gatewayUrl: 'https://ipfs.io',
    });
  });

  afterAll(async () => {
    // Clean up Helia instance
    await backend.stop();
  });

  describe('getBackendType', () => {
    it('should return "helia"', () => {
      expect(backend.getBackendType()).toBe('helia');
    });
  });

  describe('getGatewayUrl', () => {
    it('should construct correct gateway URL', () => {
      const cid = 'bafkreidvbhs33ighmljlvr7zbv2ywwzcmp5adtf4kqvlly67cy56bdtmve';
      const url = backend.getGatewayUrl(cid);
      expect(url).toBe(`https://ipfs.io/ipfs/${cid}`);
    });
  });

  describe('isAvailable', () => {
    it('should check if Helia dependencies are installed', async () => {
      // This test checks if Helia can be initialized
      const available = await backend.isAvailable();
      
      // If dependencies are installed, should be available
      // If not, should return false (not throw error)
      expect(typeof available).toBe('boolean');
    }, 15000);
  });

  describe('uploadJson and retrieveJson', () => {
    it('should upload and retrieve JSON data with correct hash', async () => {
      // Skip if Helia not available
      const available = await backend.isAvailable();
      if (!available) {
        console.log('Helia not available - skipping integration test');
        console.log('Install with: npm install helia @helia/json @helia/unixfs');
        return;
      }

      const testData = {
        product: {
          product_id: 'TEST-002',
          name: 'Helia Test Product',
        },
        manufacturer: {
          name: 'Helia Test Manufacturer',
        },
      };

      // Upload
      const uploadResult = await backend.uploadJson(testData, {
        name: 'helia-test-passport.json',
      });

      expect(uploadResult.cid).toBeDefined();
      expect(uploadResult.hash).toMatch(/^0x[a-f0-9]{64}$/);
      expect(uploadResult.size).toBeGreaterThan(0);

      // Retrieve
      const retrieveResult = await backend.retrieveJson(uploadResult.cid);

      expect(retrieveResult.data).toEqual(testData);
      expect(retrieveResult.hash).toBe(uploadResult.hash);
      expect(retrieveResult.cid).toBe(uploadResult.cid);
    }, 30000);
  });
});
