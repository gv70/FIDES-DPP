/**
 * Tests for KuboBackend
 * 
 * @license Apache-2.0
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { KuboBackend } from '../backends/KuboBackend';

describe('KuboBackend', () => {
  let backend: KuboBackend;

  beforeAll(() => {
    backend = new KuboBackend({
      nodeUrl: 'http://127.0.0.1:5001',
      gatewayUrl: 'http://127.0.0.1:8080',
    });
  });

  describe('getBackendType', () => {
    it('should return "kubo"', () => {
      expect(backend.getBackendType()).toBe('kubo');
    });
  });

  describe('getGatewayUrl', () => {
    it('should construct correct gateway URL', () => {
      const cid = 'bafkreidvbhs33ighmljlvr7zbv2ywwzcmp5adtf4kqvlly67cy56bdtmve';
      const url = backend.getGatewayUrl(cid);
      expect(url).toBe(`http://127.0.0.1:8080/ipfs/${cid}`);
    });

    it('should handle trailing slash in gateway URL', () => {
      const backendWithSlash = new KuboBackend({
        nodeUrl: 'http://127.0.0.1:5001',
        gatewayUrl: 'http://127.0.0.1:8080/',
      });
      const cid = 'bafkreidvbhs33ighmljlvr7zbv2ywwzcmp5adtf4kqvlly67cy56bdtmve';
      const url = backendWithSlash.getGatewayUrl(cid);
      expect(url).toBe(`http://127.0.0.1:8080/ipfs/${cid}`);
    });
  });

  describe('isAvailable', () => {
    it('should check if Kubo node is running', async () => {
      // This test requires a running Kubo node
      // Skip if node not available
      const available = await backend.isAvailable();
      
      if (available) {
        expect(available).toBe(true);
      } else {
        console.log('Kubo node not available - skipping availability test');
        expect(available).toBe(false);
      }
    }, 10000);
  });

  describe('uploadJson and retrieveJson', () => {
    it('should upload and retrieve JSON data with correct hash', async () => {
      // Skip if node not available
      const available = await backend.isAvailable();
      if (!available) {
        console.log('Kubo node not available - skipping integration test');
        return;
      }

      const testData = {
        product: {
          product_id: 'TEST-001',
          name: 'Test Product',
        },
        manufacturer: {
          name: 'Test Manufacturer',
        },
      };

      // Upload
      const uploadResult = await backend.uploadJson(testData, {
        name: 'test-passport.json',
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
