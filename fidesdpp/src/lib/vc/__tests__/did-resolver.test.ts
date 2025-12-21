/**
 * Tests for DID Resolver (did:key)
 * 
 * @license Apache-2.0
 */

import { describe, it, expect } from '@jest/globals';
import { createDidResolver, createKeyDid } from '../did-resolver';

describe('DID Resolver (did:key)', () => {
  // Sample Ed25519 public key (32 bytes)
  const testPublicKey = new Uint8Array(32).fill(1);

  describe('createKeyDid', () => {
    it('should create did:key with correct format', () => {
      const did = createKeyDid(testPublicKey);
      
      expect(did).toMatch(/^did:key:z[1-9A-HJ-NP-Za-km-z]+$/);
      expect(did).toContain('did:key:z');
    });

    it('should create consistent DIDs for same public key', () => {
      const did1 = createKeyDid(testPublicKey);
      const did2 = createKeyDid(testPublicKey);
      
      expect(did1).toBe(did2);
    });

    it('should create different DIDs for different public keys', () => {
      const publicKey1 = new Uint8Array(32).fill(1);
      const publicKey2 = new Uint8Array(32).fill(2);
      
      const did1 = createKeyDid(publicKey1);
      const did2 = createKeyDid(publicKey2);
      
      expect(did1).not.toBe(did2);
    });

    it('should handle zero-filled public key', () => {
      const zeroKey = new Uint8Array(32).fill(0);
      const did = createKeyDid(zeroKey);
      
      expect(did).toMatch(/^did:key:z[1-9A-HJ-NP-Za-km-z]+$/);
    });
  });

  describe('createDidResolver', () => {
    it('should create resolver', () => {
      const resolver = createDidResolver();
      
      expect(resolver).toBeDefined();
      expect(typeof resolver.resolve).toBe('function');
    });

    it('should resolve did:key DIDs', async () => {
      const resolver = createDidResolver();
      const did = createKeyDid(testPublicKey);
      
      const result = await resolver.resolve(did);
      
      expect(result.didDocument).toBeDefined();
      expect(result.didDocument?.id).toBe(did);
    });

    it('should return error for invalid DID', async () => {
      const resolver = createDidResolver();
      
      const result = await resolver.resolve('invalid-did');
      
      expect(result.didDocument).toBeNull();
      expect(result.didResolutionMetadata?.error).toBeDefined();
    });
  });

  describe('Base58 Encoding', () => {
    it('should encode public key consistently', () => {
      // Test that the same key always produces the same DID
      const testKeys = [
        new Uint8Array(32).fill(0),
        new Uint8Array(32).fill(1),
        new Uint8Array(32).fill(255),
      ];

      for (const key of testKeys) {
        const did1 = createKeyDid(key);
        const did2 = createKeyDid(key);
        expect(did1).toBe(did2);
      }
    });
  });
});
