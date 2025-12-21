/**
 * Tests for PostgresAnagraficaStorage
 * 
 * @license Apache-2.0
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PostgresAnagraficaStorage } from '../PostgresAnagraficaStorage';
import type { Entity, Product } from '../types';

// Mock pg module
jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    connect: jest.fn(),
    query: jest.fn(),
    end: jest.fn(),
  })),
}));

describe('PostgresAnagraficaStorage', () => {
  let storage: PostgresAnagraficaStorage;
  let mockPool: any;
  let mockClient: any;

  beforeEach(() => {
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };

    mockPool = {
      connect: jest.fn().mockResolvedValue(mockClient),
      query: jest.fn(),
      end: jest.fn(),
    };

    // Mock Pool constructor
    const { Pool } = require('pg');
    jest.mocked(Pool).mockImplementation(() => mockPool);

    storage = new PostgresAnagraficaStorage();
  });

  describe('saveEntity', () => {
    const mockEntity: Entity = {
      id: 'entity-1',
      entityType: 'manufacturer',
      primaryIdentifier: 'did:web:company.com',
      name: 'Test Company',
      verificationStatus: 'unverified',
    };

    it('should save entity with transaction', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 'entity-1' }] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 'entity-1' }] }) // INSERT entity
        .mockResolvedValueOnce({}) // COMMIT
        .mockResolvedValueOnce({}); // COMMIT

      await storage.saveEntity(mockEntity);

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO entities'), expect.any(Array));
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should rollback on error', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error('Database error')); // INSERT fails

      await expect(storage.saveEntity(mockEntity)).rejects.toThrow('Database error');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('getEntityByIdentifier', () => {
    it('should retrieve entity by identifier', async () => {
      const mockEntity: Entity = {
        id: 'entity-1',
        entityType: 'manufacturer',
        primaryIdentifier: 'did:web:company.com',
        name: 'Test Company',
        verificationStatus: 'unverified',
      };

      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'entity-1' }],
      });

      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 'entity-1',
          entity_type: 'manufacturer',
          primary_identifier: 'did:web:company.com',
          name: 'Test Company',
          verification_status: 'unverified',
        }],
      });

      mockPool.query.mockResolvedValueOnce({ rows: [] }); // identifiers
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // classifications
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // digital_identity_anchors

      const result = await storage.getEntityByIdentifier('did:web:company.com');

      expect(result).toBeDefined();
      expect(result?.primaryIdentifier).toBe('did:web:company.com');
    });

    it('should return null if entity not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await storage.getEntityByIdentifier('unknown-id');

      expect(result).toBeNull();
    });
  });

  describe('saveProduct', () => {
    const mockProduct: Product = {
      id: 'product-1',
      productIdentifier: 'GTIN-1234567890123',
      name: 'Test Product',
    };

    it('should save product with transaction', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 'product-1' }] }) // INSERT product
        .mockResolvedValueOnce({}) // COMMIT
        .mockResolvedValueOnce({}); // COMMIT

      await storage.saveProduct(mockProduct);

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO products'), expect.any(Array));
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });
  });

  describe('linkDppToEntity', () => {
    it('should link DPP to entity', async () => {
      mockPool.query.mockResolvedValueOnce({});

      await storage.linkDppToEntity('1', 'entity-1', 'manufacturer');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO dpp_entity_relations'),
        ['1', 'entity-1', 'manufacturer']
      );
    });
  });

  describe('linkDppToProduct', () => {
    it('should link DPP to product', async () => {
      mockPool.query.mockResolvedValueOnce({});

      await storage.linkDppToProduct('1', 'product-1', 'productClass');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO dpp_product_relations'),
        ['1', 'product-1', 'productClass', null, null]
      );
    });
  });
});


