/**
 * File-based Anagrafica Storage
 * 
 * Default implementation for dev/simple deployments.
 * Stores anagrafica data in JSON file on Docker volume.
 * 
 * @license Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { AnagraficaStorage } from './AnagraficaStorage';
import type { Entity, Product } from './types';

interface StorageData {
  entities: Record<string, Entity>;
  products: Record<string, Product>;
  dppEntityRelations: Record<string, Array<{ entityId: string; relationType: string }>>;
  dppProductRelations: Record<string, { productId: string; granularity: string; batchNumber?: string; serialNumber?: string }>;
}

/**
 * File-based storage for anagrafica
 * 
 * Stores data in JSON file with atomic writes (temp + rename).
 * Suitable for:
 * - Development
 * - Single-instance deployments
 * - Low-concurrency production
 * 
 * NOT suitable for:
 * - High-concurrency production
 * - Multi-instance deployments (use PostgreSQL)
 */
export class FileAnagraficaStorage implements AnagraficaStorage {
  private dataPath: string;
  private data: StorageData | null = null;

  constructor(dataPath: string = './data/anagrafica.json') {
    this.dataPath = dataPath;
  }

  /**
   * Initialize storage (load from file or create new)
   */
  private async init(): Promise<void> {
    if (this.data !== null) {
      return; // Already loaded
    }

    try {
      // Ensure data directory exists
      const dir = path.dirname(this.dataPath);
      await fs.mkdir(dir, { recursive: true });

      // Try to load existing file
      const content = await fs.readFile(this.dataPath, 'utf-8');
      this.data = JSON.parse(content);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File doesn't exist - initialize empty
        this.data = {
          entities: {},
          products: {},
          dppEntityRelations: {},
          dppProductRelations: {},
        };
        await this.persist();
      } else {
        throw new Error(`Failed to load anagrafica storage: ${error.message}`);
      }
    }
  }

  /**
   * Persist data to file (atomic write)
   */
  private async persist(): Promise<void> {
    if (!this.data) {
      throw new Error('Storage not initialized');
    }

    // Atomic write: write to temp file, then rename
    const tempPath = `${this.dataPath}.tmp`;
    const content = JSON.stringify(this.data, null, 2);
    await fs.writeFile(tempPath, content, 'utf-8');
    await fs.rename(tempPath, this.dataPath);
  }

  // Entity operations

  async saveEntity(entity: Entity): Promise<void> {
    await this.init();
    if (!this.data) throw new Error('Storage not initialized');

    this.data.entities[entity.id] = entity;
    await this.persist();
  }

  async getEntityByIdentifier(identifier: string): Promise<Entity | null> {
    await this.init();
    if (!this.data) throw new Error('Storage not initialized');

    for (const entity of Object.values(this.data.entities)) {
      if (entity.primaryIdentifier === identifier) {
        return entity;
      }
      // Check identifiers
      if (entity.identifiers) {
        for (const ident of entity.identifiers) {
          if (ident.identifier === identifier) {
            return entity;
          }
        }
      }
    }
    return null;
  }

  async getEntitiesByType(type: 'issuer' | 'manufacturer' | 'facility'): Promise<Entity[]> {
    await this.init();
    if (!this.data) throw new Error('Storage not initialized');

    return Object.values(this.data.entities).filter(e => e.entityType === type);
  }

  async getEntityById(id: string): Promise<Entity | null> {
    await this.init();
    if (!this.data) throw new Error('Storage not initialized');

    return this.data.entities[id] || null;
  }

  // Product operations

  async saveProduct(product: Product): Promise<void> {
    await this.init();
    if (!this.data) throw new Error('Storage not initialized');

    this.data.products[product.id] = product;
    await this.persist();
  }

  async getProductByIdentifier(identifier: string): Promise<Product | null> {
    await this.init();
    if (!this.data) throw new Error('Storage not initialized');

    for (const product of Object.values(this.data.products)) {
      if (product.productIdentifier === identifier) {
        return product;
      }
    }
    return null;
  }

  async getProductById(id: string): Promise<Product | null> {
    await this.init();
    if (!this.data) throw new Error('Storage not initialized');

    return this.data.products[id] || null;
  }

  // DPP relations operations

  async linkDppToEntity(
    tokenId: string,
    entityId: string,
    relationType: 'issuer' | 'manufacturer' | 'facility'
  ): Promise<void> {
    await this.init();
    if (!this.data) throw new Error('Storage not initialized');

    if (!this.data.dppEntityRelations[tokenId]) {
      this.data.dppEntityRelations[tokenId] = [];
    }

    // Check if relation already exists
    const exists = this.data.dppEntityRelations[tokenId].some(
      r => r.entityId === entityId && r.relationType === relationType
    );

    if (!exists) {
      this.data.dppEntityRelations[tokenId].push({ entityId, relationType });
      await this.persist();
    }
  }

  async linkDppToProduct(
    tokenId: string,
    productId: string,
    granularity: 'productClass' | 'batch' | 'item',
    batchNumber?: string,
    serialNumber?: string
  ): Promise<void> {
    await this.init();
    if (!this.data) throw new Error('Storage not initialized');

    this.data.dppProductRelations[tokenId] = {
      productId,
      granularity,
      batchNumber,
      serialNumber,
    };
    await this.persist();
  }

  async getDppEntities(tokenId: string): Promise<Entity[]> {
    await this.init();
    if (!this.data) throw new Error('Storage not initialized');

    const relations = this.data.dppEntityRelations[tokenId] || [];
    const entities: Entity[] = [];

    for (const relation of relations) {
      const entity = this.data.entities[relation.entityId];
      if (entity) {
        entities.push(entity);
      }
    }

    return entities;
  }

  async getDppProduct(tokenId: string): Promise<Product | null> {
    await this.init();
    if (!this.data) throw new Error('Storage not initialized');

    const relation = this.data.dppProductRelations[tokenId];
    if (!relation) {
      return null;
    }

    return this.data.products[relation.productId] || null;
  }

  async getDppsForEntity(entityId: string): Promise<string[]> {
    await this.init();
    if (!this.data) throw new Error('Storage not initialized');

    const tokenIds: string[] = [];
    for (const [tokenId, relations] of Object.entries(this.data.dppEntityRelations)) {
      if (relations.some(r => r.entityId === entityId)) {
        tokenIds.push(tokenId);
      }
    }
    return tokenIds;
  }

  async getDppsForProduct(productId: string): Promise<string[]> {
    await this.init();
    if (!this.data) throw new Error('Storage not initialized');

    const tokenIds: string[] = [];
    for (const [tokenId, relation] of Object.entries(this.data.dppProductRelations)) {
      if (relation.productId === productId) {
        tokenIds.push(tokenId);
      }
    }
    return tokenIds;
  }
}


