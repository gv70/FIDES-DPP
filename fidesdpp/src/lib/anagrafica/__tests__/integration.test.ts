/**
 * Integration Tests for Anagrafica + IDR
 * 
 * Tests end-to-end flow: DPP creation → Anagrafica indexing → IDR resolution
 * 
 * @license Apache-2.0
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { AnagraficaService } from '../AnagraficaService';
import { IdrService } from '../../idr/IdrService';
import type { AnagraficaStorage } from '../AnagraficaStorage';
import type { DigitalProductPassport } from '../../untp/generateDppJsonLd';

describe('Anagrafica + IDR Integration', () => {
  let anagraficaService: AnagraficaService;
  let idrService: IdrService;
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

    anagraficaService = new AnagraficaService(mockStorage);
    idrService = new IdrService(undefined, anagraficaService);
  });

  describe('DPP Indexing Flow', () => {
    const mockDpp: DigitalProductPassport = {
      '@type': 'DigitalProductPassport',
      product: {
        '@type': 'Product',
        identifier: 'GTIN-1234567890123',
        name: 'Test Product',
      },
      manufacturer: {
        '@type': 'Organization',
        name: 'Test Manufacturer',
        identifier: 'did:web:manufacturer.com',
        addressCountry: 'US',
      },
    };

    const issuerDid = 'did:web:issuer.com';
    const tokenId = '1';

    it('should index DPP and enable IDR resolution', async () => {
      // Mock storage responses
      mockStorage.getEntityByIdentifier.mockResolvedValue(null);
      mockStorage.getProductByIdentifier.mockResolvedValue(null);
      mockStorage.saveEntity.mockResolvedValue(undefined);
      mockStorage.saveProduct.mockResolvedValue(undefined);
      mockStorage.linkDppToEntity.mockResolvedValue(undefined);
      mockStorage.linkDppToProduct.mockResolvedValue(undefined);

      // Index DPP
      await anagraficaService.indexDppEntities(tokenId, mockDpp, issuerDid);
      await anagraficaService.indexDppProduct(tokenId, mockDpp);

      // Verify indexing
      expect(mockStorage.saveEntity).toHaveBeenCalled();
      expect(mockStorage.saveProduct).toHaveBeenCalled();
      expect(mockStorage.linkDppToEntity).toHaveBeenCalled();
      expect(mockStorage.linkDppToProduct).toHaveBeenCalled();
    });
  });

  describe('IDR Product Resolution', () => {
    it('should resolve product to linkset with DPPs', async () => {
      const mockProduct: any = {
        id: 'product-1',
        productIdentifier: 'GTIN-1234567890123',
        name: 'Test Product',
      };

      mockStorage.getProductByIdentifier.mockResolvedValue(mockProduct);
      mockStorage.getDppsForProduct.mockResolvedValue(['1', '2']);

      // Mock getStorage method
      jest.spyOn(anagraficaService, 'getStorage').mockReturnValue(mockStorage);

      const linkset = await idrService.resolveProductLinkset('GTIN-1234567890123');

      expect(linkset.anchor).toContain('GTIN-1234567890123');
      expect(linkset['untp:dpp']).toBeDefined();
      expect(Array.isArray(linkset['untp:dpp'])).toBe(true);
    });
  });

  describe('IDR Entity Resolution', () => {
    it('should resolve entity to linkset with DPPs', async () => {
      const mockEntity: any = {
        id: 'entity-1',
        entityType: 'manufacturer',
        primaryIdentifier: 'did:web:company.com',
        name: 'Test Company',
      };

      mockStorage.getEntityByIdentifier.mockResolvedValue(mockEntity);
      mockStorage.getDppsForEntity.mockResolvedValue(['1', '2', '3']);

      // Mock getStorage method
      jest.spyOn(anagraficaService, 'getStorage').mockReturnValue(mockStorage);

      const linkset = await idrService.resolveEntityLinkset('did:web:company.com');

      expect(linkset.anchor).toContain('did:web:company.com');
      expect(linkset['untp:dpp']).toBeDefined();
      expect(Array.isArray(linkset['untp:dpp'])).toBe(true);
    });
  });

  describe('TokenId Lookup', () => {
    it('should lookup tokenId from product identifier', async () => {
      const mockProduct: any = {
        id: 'product-1',
        productIdentifier: 'GTIN-1234567890123',
      };

      mockStorage.getProductByIdentifier.mockResolvedValue(mockProduct);
      mockStorage.getDppsForProduct.mockResolvedValue(['5']);

      // Mock getStorage method
      jest.spyOn(anagraficaService, 'getStorage').mockReturnValue(mockStorage);

      const tokenId = await idrService.lookupTokenId('GTIN-1234567890123');

      expect(tokenId).toBe('5');
    });

    it('should return null if product not found', async () => {
      mockStorage.getProductByIdentifier.mockResolvedValue(null);

      const tokenId = await idrService.lookupTokenId('unknown-id');

      expect(tokenId).toBeNull();
    });
  });
});



