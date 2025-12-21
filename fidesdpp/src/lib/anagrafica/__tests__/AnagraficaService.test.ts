/**
 * Tests for AnagraficaService
 * 
 * @license Apache-2.0
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { AnagraficaService } from '../AnagraficaService';
import type { AnagraficaStorage } from '../AnagraficaStorage';
import type { Entity, Product, DigitalProductPassport } from '../types';

describe('AnagraficaService', () => {
  let service: AnagraficaService;
  let mockStorage: jest.Mocked<AnagraficaStorage>;

  beforeEach(() => {
    mockStorage = {
      saveEntity: jest.fn(),
      getEntityByIdentifier: jest.fn(),
      getEntitiesByType: jest.fn(),
      getEntityById: jest.fn(),
      saveProduct: jest.fn(),
      getProductByIdentifier: jest.fn(),
      getProductById: jest.fn(),
      linkDppToEntity: jest.fn(),
      linkDppToProduct: jest.fn(),
      getDppEntities: jest.fn(),
      getDppProduct: jest.fn(),
      getDppsForEntity: jest.fn(),
      getDppsForProduct: jest.fn(),
    } as any;

    service = new AnagraficaService(mockStorage);
  });

  describe('indexDppEntities', () => {
    const mockDpp: DigitalProductPassport = {
      '@type': 'DigitalProductPassport',
      product: {
        '@type': 'Product',
        identifier: 'TEST-PROD-001',
        name: 'Test Product',
      },
      manufacturer: {
        '@type': 'Organization',
        name: 'Test Manufacturer',
        identifier: 'did:web:manufacturer.com',
        addressCountry: 'US',
        facility: {
          '@type': 'Facility',
          name: 'Test Facility',
          identifier: 'facility-001',
        },
      },
    };

    const issuerDid = 'did:web:issuer.com';

    it('should extract and save issuer entity', async () => {
      mockStorage.getEntityByIdentifier.mockResolvedValue(null);
      mockStorage.saveEntity.mockResolvedValue(undefined);
      mockStorage.linkDppToEntity.mockResolvedValue(undefined);

      await service.indexDppEntities('1', mockDpp, issuerDid);

      expect(mockStorage.saveEntity).toHaveBeenCalled();
      expect(mockStorage.linkDppToEntity).toHaveBeenCalledWith('1', expect.any(String), 'issuer');
    });

    it('should extract and save manufacturer entity', async () => {
      mockStorage.getEntityByIdentifier.mockResolvedValue(null);
      mockStorage.saveEntity.mockResolvedValue(undefined);
      mockStorage.linkDppToEntity.mockResolvedValue(undefined);

      await service.indexDppEntities('1', mockDpp, issuerDid);

      // Should save manufacturer
      const saveCalls = mockStorage.saveEntity.mock.calls;
      const manufacturerCall = saveCalls.find(call => call[0].entityType === 'manufacturer');
      expect(manufacturerCall).toBeDefined();
      expect(manufacturerCall[0].name).toBe('Test Manufacturer');
    });

    it('should extract and save facility entity', async () => {
      mockStorage.getEntityByIdentifier.mockResolvedValue(null);
      mockStorage.saveEntity.mockResolvedValue(undefined);
      mockStorage.linkDppToEntity.mockResolvedValue(undefined);

      await service.indexDppEntities('1', mockDpp, issuerDid);

      // Should save facility
      const saveCalls = mockStorage.saveEntity.mock.calls;
      const facilityCall = saveCalls.find(call => call[0].entityType === 'facility');
      expect(facilityCall).toBeDefined();
    });
  });

  describe('indexDppProduct', () => {
    const mockDpp: DigitalProductPassport = {
      '@type': 'DigitalProductPassport',
      product: {
        '@type': 'Product',
        identifier: 'GTIN-1234567890123',
        name: 'Test Product',
        description: 'Test Description',
        productionDate: '2025-12-11',
        countryOfProduction: 'US',
      },
    };

    it('should extract and save product', async () => {
      mockStorage.getProductByIdentifier.mockResolvedValue(null);
      mockStorage.saveProduct.mockResolvedValue(undefined);
      mockStorage.linkDppToProduct.mockResolvedValue(undefined);

      await service.indexDppProduct('1', mockDpp);

      expect(mockStorage.saveProduct).toHaveBeenCalled();
      expect(mockStorage.linkDppToProduct).toHaveBeenCalledWith(
        '1',
        expect.any(String),
        'productClass',
        undefined,
        undefined
      );
    });

    it('should handle product with batch number', async () => {
      const dppWithBatch: DigitalProductPassport = {
        ...mockDpp,
        granularityLevel: 'batch',
        product: {
          ...mockDpp.product!,
          batchNumber: 'BATCH-001',
        },
      };

      mockStorage.getProductByIdentifier.mockResolvedValue(null);
      mockStorage.saveProduct.mockResolvedValue(undefined);
      mockStorage.linkDppToProduct.mockResolvedValue(undefined);

      await service.indexDppProduct('1', dppWithBatch);

      expect(mockStorage.linkDppToProduct).toHaveBeenCalledWith(
        '1',
        expect.any(String),
        'batch',
        'BATCH-001',
        undefined
      );
    });
  });

  describe('resolveEntity', () => {
    it('should resolve entity by identifier', async () => {
      const mockEntity: Entity = {
        id: 'entity-1',
        entityType: 'manufacturer',
        primaryIdentifier: 'did:web:company.com',
        name: 'Test Company',
        verificationStatus: 'unverified',
      };

      mockStorage.getEntityByIdentifier.mockResolvedValue(mockEntity);

      const result = await service.resolveEntity('did:web:company.com');

      expect(result).toEqual(mockEntity);
      expect(mockStorage.getEntityByIdentifier).toHaveBeenCalledWith('did:web:company.com');
    });

    it('should return null if entity not found', async () => {
      mockStorage.getEntityByIdentifier.mockResolvedValue(null);

      const result = await service.resolveEntity('unknown-id');

      expect(result).toBeNull();
    });
  });

  describe('resolveProduct', () => {
    it('should resolve product by identifier', async () => {
      const mockProduct: Product = {
        id: 'product-1',
        productIdentifier: 'GTIN-1234567890123',
        name: 'Test Product',
      };

      mockStorage.getProductByIdentifier.mockResolvedValue(mockProduct);

      const result = await service.resolveProduct('GTIN-1234567890123');

      expect(result).toEqual(mockProduct);
      expect(mockStorage.getProductByIdentifier).toHaveBeenCalledWith('GTIN-1234567890123');
    });

    it('should return null if product not found', async () => {
      mockStorage.getProductByIdentifier.mockResolvedValue(null);

      const result = await service.resolveProduct('unknown-id');

      expect(result).toBeNull();
    });
  });
});



