/**
 * Tests for PinataBackend
 * 
 * @license Apache-2.0
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { PinataBackend } from '../backends/PinataBackend';

describe('PinataBackend', () => {
  describe('constructor', () => {
    it('should throw error if JWT not configured', () => {
      expect(() => {
        new PinataBackend({
          gatewayUrl: 'test.mypinata.cloud',
        });
      }).toThrow('Pinata JWT not configured');
    });

    it('should throw error if gateway URL not configured', () => {
      expect(() => {
        new PinataBackend({
          accessToken: 'test-jwt',
        });
      }).toThrow('Pinata Gateway URL not configured');
    });

    it('should create instance with valid configuration', () => {
      const backend = new PinataBackend({
        accessToken: 'test-jwt',
        gatewayUrl: 'test.mypinata.cloud',
      });
      expect(backend.getBackendType()).toBe('pinata');
    });
  });

  describe('getBackendType', () => {
    it('should return "pinata"', () => {
      const backend = new PinataBackend({
        accessToken: 'test-jwt',
        gatewayUrl: 'test.mypinata.cloud',
      });
      expect(backend.getBackendType()).toBe('pinata');
    });
  });

  describe('getGatewayUrl', () => {
    it('should construct correct gateway URL', () => {
      const backend = new PinataBackend({
        accessToken: 'test-jwt',
        gatewayUrl: 'test-gateway.mypinata.cloud',
      });
      const cid = 'bafkreidvbhs33ighmljlvr7zbv2ywwzcmp5adtf4kqvlly67cy56bdtmve';
      const url = backend.getGatewayUrl(cid);
      expect(url).toBe(`https://test-gateway.mypinata.cloud/ipfs/${cid}`);
    });
  });

  // Integration tests (require actual Pinata credentials)
  describe('uploadJson and retrieveJson (integration)', () => {
    it('should upload and retrieve if credentials available', async () => {
      // Only run if environment variables are set
      if (!process.env.PINATA_JWT || !process.env.NEXT_PUBLIC_PINATA_GATEWAY_URL) {
        console.log('Pinata credentials not set - skipping integration test');
        return;
      }

      const backend = new PinataBackend({
        accessToken: process.env.PINATA_JWT,
        gatewayUrl: process.env.NEXT_PUBLIC_PINATA_GATEWAY_URL,
      });

      const testData = {
        product: {
          product_id: 'TEST-003',
          name: 'Pinata Test Product',
        },
        test_timestamp: new Date().toISOString(),
      };

      // Upload
      const uploadResult = await backend.uploadJson(testData, {
        name: 'pinata-test-passport.json',
      });

      expect(uploadResult.cid).toBeDefined();
      expect(uploadResult.hash).toMatch(/^0x[a-f0-9]{64}$/);

      // Retrieve
      const retrieveResult = await backend.retrieveJson(uploadResult.cid);

      expect(retrieveResult.data).toMatchObject(testData);
      expect(retrieveResult.hash).toBe(uploadResult.hash);
    }, 30000);
  });
});
