/**
 * File-based Anagrafica Storage
 *
 * Default implementation for dev/simple deployments.
 * Stores anagrafica data in JSON file on Docker volume.
 *
 * @license Apache-2.0
 */
import type { AnagraficaStorage } from './AnagraficaStorage';
import type { Entity, Product } from './types';
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
export declare class FileAnagraficaStorage implements AnagraficaStorage {
    private dataPath;
    private data;
    constructor(dataPath?: string);
    /**
     * Initialize storage (load from file or create new)
     */
    private init;
    /**
     * Persist data to file (atomic write)
     */
    private persist;
    saveEntity(entity: Entity): Promise<void>;
    getEntityByIdentifier(identifier: string): Promise<Entity | null>;
    getEntitiesByType(type: 'issuer' | 'manufacturer' | 'facility'): Promise<Entity[]>;
    getEntityById(id: string): Promise<Entity | null>;
    saveProduct(product: Product): Promise<void>;
    getProductByIdentifier(identifier: string): Promise<Product | null>;
    getProductById(id: string): Promise<Product | null>;
    linkDppToEntity(tokenId: string, entityId: string, relationType: 'issuer' | 'manufacturer' | 'facility'): Promise<void>;
    linkDppToProduct(tokenId: string, productId: string, granularity: 'productClass' | 'batch' | 'item', batchNumber?: string, serialNumber?: string): Promise<void>;
    getDppEntities(tokenId: string): Promise<Entity[]>;
    getDppProduct(tokenId: string): Promise<Product | null>;
    getDppsForEntity(entityId: string): Promise<string[]>;
    getDppsForProduct(productId: string): Promise<string[]>;
}
//# sourceMappingURL=FileAnagraficaStorage.d.ts.map