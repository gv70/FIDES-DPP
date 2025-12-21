/**
 * PostgreSQL Anagrafica Storage
 *
 * Production-ready implementation for persistent anagrafica (entity and product registry).
 * Suitable for high-concurrency and multi-instance deployments.
 *
 * @license Apache-2.0
 */
import type { AnagraficaStorage } from './AnagraficaStorage';
import type { Entity, Product } from './types';
/**
 * PostgreSQL storage for anagrafica
 *
 * Schema:
 * - entities: Entity master data
 * - entity_identifiers: Multiple identifiers per entity
 * - entity_classifications: Classifications per entity
 * - facilities: Facility details
 * - facility_locations: Location information
 * - facility_identifiers: Multiple identifiers per facility
 * - facility_classifications: Process classifications
 * - products: Product master data
 * - product_classifications: Product classifications
 * - product_dimensions: Product dimensions
 * - product_links: Product links
 * - digital_identity_anchors: DIA records
 * - dpp_entity_relations: DPP → Entity relations
 * - dpp_product_relations: DPP → Product relations
 */
export declare class PostgresAnagraficaStorage implements AnagraficaStorage {
    private pool;
    constructor(connectionString?: string);
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
    private saveFacilityDetails;
    private loadFacilityDetails;
    private saveDigitalIdentityAnchor;
    private mapRowToDIA;
    /**
     * Close database connection pool
     *
     * Call on application shutdown.
     */
    close(): Promise<void>;
}
//# sourceMappingURL=PostgresAnagraficaStorage.d.ts.map