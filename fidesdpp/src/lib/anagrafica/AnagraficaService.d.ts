/**
 * Anagrafica Service
 *
 * Service layer for managing entity and product master data,
 * and indexing DPP relationships.
 *
 * @license Apache-2.0
 */
import type { AnagraficaStorage } from './AnagraficaStorage';
import type { Entity, Product } from './types';
import type { DigitalProductPassport } from '../untp/generateDppJsonLd';
/**
 * Service for anagrafica operations
 *
 * Provides high-level methods for:
 * - Extracting entities and products from DPPs
 * - Indexing DPP relationships
 * - Resolving entities and products by identifier
 */
export declare class AnagraficaService {
    private storage;
    constructor(storage: AnagraficaStorage);
    /**
     * Get storage instance (for testing/debugging)
     */
    getStorage(): AnagraficaStorage;
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
    indexDppEntities(tokenId: string, dpp: DigitalProductPassport, issuerDid: string): Promise<void>;
    /**
     * Extract product from DPP and save to anagrafica
     *
     * @param tokenId - DPP token ID
     * @param dpp - Digital Product Passport
     */
    indexDppProduct(tokenId: string, dpp: DigitalProductPassport): Promise<void>;
    /**
     * Resolve entity by identifier (IDR-compliant)
     *
     * @param identifier - Entity identifier (DID, business registry ID, etc.)
     * @returns Entity or null if not found
     */
    resolveEntity(identifier: string): Promise<Entity | null>;
    /**
     * Resolve product by identifier
     *
     * @param identifier - Product identifier (GTIN, custom ID, etc.)
     * @returns Product or null if not found
     */
    resolveProduct(identifier: string): Promise<Product | null>;
    /**
     * Extract issuer entity from DPP
     */
    private extractIssuer;
    /**
     * Extract manufacturer entity from DPP manufacturer
     */
    private extractManufacturer;
    /**
     * Extract facility entity from DPP facility
     */
    private extractFacility;
    /**
     * Extract product from DPP
     */
    private extractProduct;
}
//# sourceMappingURL=AnagraficaService.d.ts.map