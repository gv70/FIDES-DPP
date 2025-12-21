/**
 * Tests for IpfsStorageFactory
 * 
 * @license Apache-2.0
 */

import { describe, it, expect } from '@jest/globals';
import { createIpfsBackend, validateBackendConfig } from '../IpfsStorageFactory';
import { KuboBackend } from '../backends/KuboBackend';
import { PinataBackend } from '../backends/PinataBackend';

describe('IpfsStorageFactory', () => {
  describe('createIpfsBackend', () => {
    it('should create KuboBackend by default', () => {
      const backend = createIpfsBackend();
      expect(backend).toBeInstanceOf(KuboBackend);
      expect(backend.getBackendType()).toBe('kubo');
    });

    it('should create KuboBackend when specified', () => {
      const backend = createIpfsBackend({ backend: 'kubo' });
      expect(backend).toBeInstanceOf(KuboBackend);
    });

    it('should throw when Helia backend is selected', () => {
      expect(() => createIpfsBackend({ backend: 'helia' })).toThrow(
        /Helia backend is not supported/
      );
    });

    it('should create PinataBackend when specified with credentials', () => {
      const backend = createIpfsBackend({
        backend: 'pinata',
        accessToken: 'test-jwt',
        gatewayUrl: 'test.mypinata.cloud',
      });
      expect(backend).toBeInstanceOf(PinataBackend);
    });

    it('should throw error for unknown backend', () => {
      expect(() => {
        createIpfsBackend({ backend: 'unknown' as any });
      }).toThrow('Unknown IPFS backend');
    });
  });

  describe('validateBackendConfig', () => {
    it('should validate Kubo config (no required fields)', () => {
      expect(() => {
        validateBackendConfig({ backend: 'kubo' });
      }).not.toThrow();
    });

    it('should throw when Helia backend is configured', () => {
      expect(() => validateBackendConfig({ backend: 'helia' })).toThrow(
        /Helia backend is not supported/
      );
    });

    it('should throw for Pinata without JWT', () => {
      expect(() => {
        validateBackendConfig({ backend: 'pinata' });
      }).toThrow('Pinata backend requires JWT');
    });

    it('should validate Pinata config with JWT', () => {
      expect(() => {
        validateBackendConfig({
          backend: 'pinata',
          accessToken: 'test-jwt',
          gatewayUrl: 'test.mypinata.cloud',
        });
      }).not.toThrow();
    });
  });
});
