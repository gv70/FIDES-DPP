/**
 * Anagrafica Service
 * 
 * Service layer for managing entity and product master data,
 * and indexing DPP relationships.
 * 
 * @license Apache-2.0
 */

import { randomUUID } from 'crypto';
import type { AnagraficaStorage } from './AnagraficaStorage';
import type {
  Entity,
  Product,
  Classification,
  EntityIdentifier,
  FacilityDetails,
  LocationInformation,
  Address,
  FacilityIdentifier,
  ProductDimensions,
  Measure,
  ProductLink,
} from './types';
import type { DigitalProductPassport } from '../untp/generateDppJsonLd';

/**
 * Service for anagrafica operations
 * 
 * Provides high-level methods for:
 * - Extracting entities and products from DPPs
 * - Indexing DPP relationships
 * - Resolving entities and products by identifier
 */
export class AnagraficaService {
  constructor(private storage: AnagraficaStorage) {}

  /**
   * Get storage instance (for testing/debugging)
   */
  getStorage(): AnagraficaStorage {
    return this.storage;
  }

  /**
   * Extract entities from DPP and save to anagrafica
   * 
   * Extracts:
   * - Issuer (from VC issuer)
   * - Manufacturer (from DPP manufacturer)
   * - Facility (from DPP manufacturer.facility)
   * 
   * @param tokenId - DPP token ID
   * @param dpp - Digital Product Passport
   * @param issuerDid - Issuer DID (from VC)
   */
  async indexDppEntities(
    tokenId: string,
    dpp: DigitalProductPassport,
    issuerDid: string
  ): Promise<void> {
    // Extract and save issuer
    const issuer = await this.extractIssuer(dpp, issuerDid);
    if (issuer) {
      await this.storage.saveEntity(issuer);
      await this.storage.linkDppToEntity(tokenId, issuer.id, 'issuer');
    }

    // Extract and save manufacturer
    if (dpp.manufacturer) {
      const manufacturer = await this.extractManufacturer(dpp.manufacturer);
      if (manufacturer) {
        await this.storage.saveEntity(manufacturer);
        await this.storage.linkDppToEntity(tokenId, manufacturer.id, 'manufacturer');

        // Extract and save facility if present
        if (dpp.manufacturer.facility) {
          const facility = await this.extractFacility(dpp.manufacturer.facility, manufacturer.id);
          if (facility) {
            await this.storage.saveEntity(facility);
            await this.storage.linkDppToEntity(tokenId, facility.id, 'facility');
          }
        }
      }
    }
  }

  /**
   * Extract product from DPP and save to anagrafica
   * 
   * @param tokenId - DPP token ID
   * @param dpp - Digital Product Passport
   */
  async indexDppProduct(
    tokenId: string,
    dpp: DigitalProductPassport
  ): Promise<void> {
    if (!dpp.product) {
      return; // No product data
    }

    const product = await this.extractProduct(dpp);
    if (product) {
      await this.storage.saveProduct(product);
      
      // Link to manufacturer if available
      if (dpp.manufacturer) {
        const manufacturer = await this.resolveEntity(dpp.manufacturer.identifier || dpp.manufacturer.name);
        if (manufacturer) {
          product.producedByPartyId = manufacturer.id;
          await this.storage.saveProduct(product);
        }
      }

      // Link DPP to product
      const granularity =
        dpp.granularityLevel === 'model'
          ? 'productClass'
          : dpp.granularityLevel || 'productClass';

      await this.storage.linkDppToProduct(
        tokenId,
        product.id,
        granularity,
        dpp.product.batchNumber,
        dpp.product.serialNumber
      );
    }
  }

  /**
   * Resolve entity by identifier (IDR-compliant)
   * 
   * @param identifier - Entity identifier (DID, business registry ID, etc.)
   * @returns Entity or null if not found
   */
  async resolveEntity(identifier: string): Promise<Entity | null> {
    return this.storage.getEntityByIdentifier(identifier);
  }

  /**
   * Resolve product by identifier
   * 
   * @param identifier - Product identifier (GTIN, custom ID, etc.)
   * @returns Product or null if not found
   */
  async resolveProduct(identifier: string): Promise<Product | null> {
    return this.storage.getProductByIdentifier(identifier);
  }

  // Private helpers

  /**
   * Extract issuer entity from DPP
   */
  private async extractIssuer(
    dpp: DigitalProductPassport,
    issuerDid: string
  ): Promise<Entity | null> {
    // Check if issuer already exists
    const existing = await this.storage.getEntityByIdentifier(issuerDid);
    if (existing && existing.entityType === 'issuer') {
      return existing;
    }

    // Create new issuer entity
    const entity: Entity = {
      id: existing?.id || randomUUID(),
      entityType: 'issuer',
      primaryIdentifier: issuerDid,
      identifierSchemeId: issuerDid.startsWith('did:') ? 'did' : undefined,
      name: `Issuer ${issuerDid.substring(0, 20)}...`,
      verificationStatus: 'unverified',
      metadata: {},
    };

    return entity;
  }

  /**
   * Extract manufacturer entity from DPP manufacturer
   */
  private async extractManufacturer(
    manufacturer: any
  ): Promise<Entity | null> {
    if (!manufacturer || !manufacturer.name) {
      return null;
    }

    const identifier = manufacturer.identifier || `manufacturer:${manufacturer.name}`;
    
    // Check if manufacturer already exists
    const existing = await this.storage.getEntityByIdentifier(identifier);
    if (existing && existing.entityType === 'manufacturer') {
      return existing;
    }

    // Create new manufacturer entity
    const entity: Entity = {
      id: existing?.id || randomUUID(),
      entityType: 'manufacturer',
      primaryIdentifier: identifier,
      name: manufacturer.name,
      description: manufacturer['@type'] === 'Organization' ? 'Manufacturer organization' : undefined,
      registrationCountry: manufacturer.addressCountry,
      organisationWebsite: manufacturer.url,
      verificationStatus: 'unverified',
      metadata: {
        originalData: manufacturer,
      },
    };

    return entity;
  }

  /**
   * Extract facility entity from DPP facility
   */
  private async extractFacility(
    facility: any,
    manufacturerId?: string
  ): Promise<Entity | null> {
    if (!facility) {
      return null;
    }

    const identifier = facility.identifier || facility.name || `facility:${randomUUID()}`;
    
    // Check if facility already exists
    const existing = await this.storage.getEntityByIdentifier(identifier);
    if (existing && existing.entityType === 'facility') {
      return existing;
    }

    // Create new facility entity
    const entity: Entity = {
      id: existing?.id || randomUUID(),
      entityType: 'facility',
      primaryIdentifier: identifier,
      name: facility.name || 'Unnamed Facility',
      verificationStatus: 'unverified',
      facility: {
        operatedByPartyId: manufacturerId,
        cadastralBoundaryUri: undefined,
      },
      metadata: {
        originalData: facility,
      },
    };

    return entity;
  }

  /**
   * Extract product from DPP
   */
  private async extractProduct(dpp: DigitalProductPassport): Promise<Product | null> {
    if (!dpp.product) {
      return null;
    }

    const productData = dpp.product;
    const productIdentifier = productData.identifier || `product:${randomUUID()}`;
    
    // Check if product already exists
    const existing = await this.storage.getProductByIdentifier(productIdentifier);
    if (existing) {
      return existing;
    }

    // Create new product
    const product: Product = {
      id: randomUUID(),
      productIdentifier,
      identifierSchemeId: productData.identifierScheme ? `scheme:${productData.identifierScheme}` : undefined,
      identifierSchemeName: productData.identifierScheme,
      registeredId: productData.identifier,
      name: productData.name,
      description: productData.description,
      productionDate: productData.productionDate,
      countryOfProduction: productData.countryOfProduction,
      batchNumber: productData.batchNumber,
      serialNumber: productData.serialNumber,
    };

    // Extract classifications
    if (productData.classification && Array.isArray(productData.classification)) {
      product.classifications = productData.classification.map((c: any) => ({
        schemeId: c.scheme || 'unknown',
        schemeName: c.scheme,
        code: c.code,
        name: c.name,
      }));
    }

    // Extract dimensions
    if (productData.dimensions) {
      product.dimensions = {
        length: productData.dimensions.length ? {
          value: productData.dimensions.length.value,
          unit: productData.dimensions.length.unit,
        } : undefined,
        width: productData.dimensions.width ? {
          value: productData.dimensions.width.value,
          unit: productData.dimensions.width.unit,
        } : undefined,
        height: productData.dimensions.height ? {
          value: productData.dimensions.height.value,
          unit: productData.dimensions.height.unit,
        } : undefined,
      };
    }

    // Extract weight
    if (productData.netWeight || productData.grossWeight) {
      if (!product.dimensions) {
        product.dimensions = {};
      }
      product.dimensions.weight = productData.netWeight || productData.grossWeight ? {
        value: (productData.netWeight || productData.grossWeight)!.value,
        unit: (productData.netWeight || productData.grossWeight)!.unit,
      } : undefined;
    }

    // Extract volume
    if (productData.volume) {
      if (!product.dimensions) {
        product.dimensions = {};
      }
      product.dimensions.volume = {
        value: productData.volume.value,
        unit: productData.volume.unit,
      };
    }

    // Extract characteristics (store in metadata)
    product.characteristics = {
      brand: productData.brand,
      modelNumber: productData.modelNumber,
      variant: productData.variant,
      category: productData.category,
    };

    return product;
  }
}

