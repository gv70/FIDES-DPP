/**
 * Anagrafica Storage Interface
 * 
 * Provides persistent storage for entity and product master data,
 * and indexing of DPP relationships.
 * 
 * @license Apache-2.0
 */

import type { Entity, Product } from './types';

/**
 * Storage backend for anagrafica (entity and product registry)
 * 
 * Manages:
 * 1. Entity master data (issuer, manufacturer, facility)
 * 2. Product master data (catalog)
 * 3. DPP → Entity relations (for indexing)
 * 4. DPP → Product relations (for indexing)
 */
export interface AnagraficaStorage {
  // Entity operations

  /**
   * Save an entity (issuer, manufacturer, or facility)
   * 
   * @param entity - Entity to save
   */
  saveEntity(entity: Entity): Promise<void>;

  /**
   * Get entity by primary identifier (DID, business registry ID, etc.)
   * 
   * @param identifier - Primary identifier
   * @returns Entity or null if not found
   */
  getEntityByIdentifier(identifier: string): Promise<Entity | null>;

  /**
   * Get entities by type
   * 
   * @param type - Entity type (issuer, manufacturer, facility)
   * @returns Array of entities
   */
  getEntitiesByType(type: 'issuer' | 'manufacturer' | 'facility'): Promise<Entity[]>;

  /**
   * Get entity by ID
   * 
   * @param id - Entity UUID
   * @returns Entity or null if not found
   */
  getEntityById(id: string): Promise<Entity | null>;

  // Product operations

  /**
   * Save a product
   * 
   * @param product - Product to save
   */
  saveProduct(product: Product): Promise<void>;

  /**
   * Get product by identifier (GTIN, custom ID, etc.)
   * 
   * @param identifier - Product identifier
   * @returns Product or null if not found
   */
  getProductByIdentifier(identifier: string): Promise<Product | null>;

  /**
   * Get product by ID
   * 
   * @param id - Product UUID
   * @returns Product or null if not found
   */
  getProductById(id: string): Promise<Product | null>;

  // DPP relations operations

  /**
   * Link a DPP (tokenId) to an entity
   * 
   * @param tokenId - DPP token ID
   * @param entityId - Entity UUID
   * @param relationType - Type of relation (issuer, manufacturer, facility)
   */
  linkDppToEntity(
    tokenId: string,
    entityId: string,
    relationType: 'issuer' | 'manufacturer' | 'facility'
  ): Promise<void>;

  /**
   * Link a DPP (tokenId) to a product
   * 
   * @param tokenId - DPP token ID
   * @param productId - Product UUID
   * @param granularity - Granularity level (productClass, batch, item)
   * @param batchNumber - Optional batch number
   * @param serialNumber - Optional serial number
   */
  linkDppToProduct(
    tokenId: string,
    productId: string,
    granularity: 'productClass' | 'batch' | 'item',
    batchNumber?: string,
    serialNumber?: string
  ): Promise<void>;

  /**
   * Get all entities linked to a DPP
   * 
   * @param tokenId - DPP token ID
   * @returns Array of entities
   */
  getDppEntities(tokenId: string): Promise<Entity[]>;

  /**
   * Get product linked to a DPP
   * 
   * @param tokenId - DPP token ID
   * @returns Product or null if not found
   */
  getDppProduct(tokenId: string): Promise<Product | null>;

  /**
   * Get all DPPs linked to an entity
   * 
   * @param entityId - Entity UUID
   * @returns Array of token IDs
   */
  getDppsForEntity(entityId: string): Promise<string[]>;

  /**
   * Get all DPPs linked to a product
   * 
   * @param productId - Product UUID
   * @returns Array of token IDs
   */
  getDppsForProduct(productId: string): Promise<string[]>;
}


