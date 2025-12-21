/**
 * PostgreSQL Anagrafica Storage
 * 
 * Production-ready implementation for persistent anagrafica (entity and product registry).
 * Suitable for high-concurrency and multi-instance deployments.
 * 
 * @license Apache-2.0
 */

import { Pool } from 'pg';
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
  DigitalIdentityAnchor,
} from './types';

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
export class PostgresAnagraficaStorage implements AnagraficaStorage {
  private pool: Pool;

  constructor(connectionString?: string) {
    const dbUrl = connectionString || process.env.DATABASE_URL;
    
    if (!dbUrl) {
      throw new Error(
        'DATABASE_URL not set. Required for PostgreSQL storage backend. ' +
        'Use STORAGE_BACKEND=file for file-based storage instead.'
      );
    }

    this.pool = new Pool({
      connectionString: dbUrl,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }

  // Entity operations

  async saveEntity(entity: Entity): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Insert or update entity
      const entityQuery = `
        INSERT INTO entities (
          id, entity_type, primary_identifier, identifier_scheme_id, identifier_scheme_name,
          registered_id, name, description, registration_country, organisation_website,
          idr_endpoint, verification_status, metadata, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
        ON CONFLICT (primary_identifier)
        DO UPDATE SET
          identifier_scheme_id = EXCLUDED.identifier_scheme_id,
          identifier_scheme_name = EXCLUDED.identifier_scheme_name,
          registered_id = EXCLUDED.registered_id,
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          registration_country = EXCLUDED.registration_country,
          organisation_website = EXCLUDED.organisation_website,
          idr_endpoint = EXCLUDED.idr_endpoint,
          verification_status = EXCLUDED.verification_status,
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
        RETURNING id
      `;

      const entityResult = await client.query(entityQuery, [
        entity.id,
        entity.entityType,
        entity.primaryIdentifier,
        entity.identifierSchemeId || null,
        entity.identifierSchemeName || null,
        entity.registeredId || null,
        entity.name,
        entity.description || null,
        entity.registrationCountry || null,
        entity.organisationWebsite || null,
        entity.idrEndpoint || null,
        entity.verificationStatus,
        JSON.stringify(entity.metadata || {}),
      ]);

      const entityId = entityResult.rows[0].id;

      // Save identifiers
      if (entity.identifiers && entity.identifiers.length > 0) {
        await client.query(
          'DELETE FROM entity_identifiers WHERE entity_id = $1',
          [entityId]
        );

        for (const identifier of entity.identifiers) {
          await client.query(
            `INSERT INTO entity_identifiers (entity_id, identifier, scheme_id, scheme_name, registered_id, is_primary)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (entity_id, identifier) DO NOTHING`,
            [
              entityId,
              identifier.identifier,
              identifier.schemeId || null,
              identifier.schemeName || null,
              identifier.registeredId || null,
              identifier.isPrimary,
            ]
          );
        }
      }

      // Save classifications
      if (entity.industryCategories && entity.industryCategories.length > 0) {
        await client.query(
          'DELETE FROM entity_classifications WHERE entity_id = $1',
          [entityId]
        );

        for (const classification of entity.industryCategories) {
          await client.query(
            `INSERT INTO entity_classifications (entity_id, scheme_id, scheme_name, code, name)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (entity_id, scheme_id, code) DO NOTHING`,
            [
              entityId,
              classification.schemeId,
              classification.schemeName || null,
              classification.code,
              classification.name || null,
            ]
          );
        }
      }

      // Save facility details if entity is a facility
      if (entity.entityType === 'facility' && entity.facility) {
        await this.saveFacilityDetails(client, entityId, entity.facility);
      }

      // Save DIA if present
      if (entity.digitalIdentityAnchor) {
        await this.saveDigitalIdentityAnchor(client, entityId, entity.digitalIdentityAnchor);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getEntityByIdentifier(identifier: string): Promise<Entity | null> {
    const query = `
      SELECT id FROM entities WHERE primary_identifier = $1
    `;
    const result = await this.pool.query(query, [identifier]);
    
    if (result.rows.length === 0) {
      return null;
    }

    return this.getEntityById(result.rows[0].id);
  }

  async getEntitiesByType(type: 'issuer' | 'manufacturer' | 'facility'): Promise<Entity[]> {
    const query = `
      SELECT id FROM entities WHERE entity_type = $1 ORDER BY name
    `;
    const result = await this.pool.query(query, [type]);
    
    const entities: Entity[] = [];
    for (const row of result.rows) {
      const entity = await this.getEntityById(row.id);
      if (entity) {
        entities.push(entity);
      }
    }
    
    return entities;
  }

  async getEntityById(id: string): Promise<Entity | null> {
    const query = `
      SELECT * FROM entities WHERE id = $1
    `;
    const result = await this.pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    const entity: Entity = {
      id: row.id,
      entityType: row.entity_type,
      primaryIdentifier: row.primary_identifier,
      identifierSchemeId: row.identifier_scheme_id,
      identifierSchemeName: row.identifier_scheme_name,
      registeredId: row.registered_id,
      name: row.name,
      description: row.description,
      registrationCountry: row.registration_country,
      organisationWebsite: row.organisation_website,
      idrEndpoint: row.idr_endpoint,
      verificationStatus: row.verification_status,
      metadata: row.metadata || {},
    };

    // Load identifiers
    const identifiersResult = await this.pool.query(
      'SELECT * FROM entity_identifiers WHERE entity_id = $1',
      [id]
    );
    entity.identifiers = identifiersResult.rows.map(r => ({
      identifier: r.identifier,
      schemeId: r.scheme_id,
      schemeName: r.scheme_name,
      registeredId: r.registered_id,
      isPrimary: r.is_primary,
    }));

    // Load classifications
    const classificationsResult = await this.pool.query(
      'SELECT * FROM entity_classifications WHERE entity_id = $1',
      [id]
    );
    entity.industryCategories = classificationsResult.rows.map(r => ({
      schemeId: r.scheme_id,
      schemeName: r.scheme_name,
      code: r.code,
      name: r.name,
    }));

    // Load facility details if applicable
    if (entity.entityType === 'facility') {
      entity.facility = await this.loadFacilityDetails(id);
    }

    // Load DIA if present
    const diaResult = await this.pool.query(
      'SELECT * FROM digital_identity_anchors WHERE entity_id = $1 LIMIT 1',
      [id]
    );
    if (diaResult.rows.length > 0) {
      entity.digitalIdentityAnchor = this.mapRowToDIA(diaResult.rows[0]);
    }

    return entity;
  }

  // Product operations

  async saveProduct(product: Product): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Insert or update product
      const productQuery = `
        INSERT INTO products (
          id, product_identifier, identifier_scheme_id, identifier_scheme_name,
          registered_id, name, description, produced_by_party_id, produced_at_facility_id,
          production_date, country_of_production, batch_number, serial_number, metadata,
          created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
        ON CONFLICT (product_identifier)
        DO UPDATE SET
          identifier_scheme_id = EXCLUDED.identifier_scheme_id,
          identifier_scheme_name = EXCLUDED.identifier_scheme_name,
          registered_id = EXCLUDED.registered_id,
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          produced_by_party_id = EXCLUDED.produced_by_party_id,
          produced_at_facility_id = EXCLUDED.produced_at_facility_id,
          production_date = EXCLUDED.production_date,
          country_of_production = EXCLUDED.country_of_production,
          batch_number = EXCLUDED.batch_number,
          serial_number = EXCLUDED.serial_number,
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
        RETURNING id
      `;

      const productResult = await client.query(productQuery, [
        product.id,
        product.productIdentifier,
        product.identifierSchemeId || null,
        product.identifierSchemeName || null,
        product.registeredId || null,
        product.name,
        product.description || null,
        product.producedByPartyId || null,
        product.producedAtFacilityId || null,
        product.productionDate || null,
        product.countryOfProduction || null,
        product.batchNumber || null,
        product.serialNumber || null,
        JSON.stringify(product.characteristics || {}),
      ]);

      const productId = productResult.rows[0].id;

      // Save classifications
      if (product.classifications && product.classifications.length > 0) {
        await client.query(
          'DELETE FROM product_classifications WHERE product_id = $1',
          [productId]
        );

        for (const classification of product.classifications) {
          await client.query(
            `INSERT INTO product_classifications (product_id, scheme_id, scheme_name, code, name)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (product_id, scheme_id, code) DO NOTHING`,
            [
              productId,
              classification.schemeId,
              classification.schemeName || null,
              classification.code,
              classification.name || null,
            ]
          );
        }
      }

      // Save dimensions
      if (product.dimensions) {
        await client.query(
          'DELETE FROM product_dimensions WHERE product_id = $1',
          [productId]
        );

        const dims = product.dimensions;
        await client.query(
          `INSERT INTO product_dimensions (
            product_id, length_value, length_unit, width_value, width_unit,
            height_value, height_unit, weight_value, weight_unit,
            volume_value, volume_unit
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (product_id) DO UPDATE SET
            length_value = EXCLUDED.length_value,
            length_unit = EXCLUDED.length_unit,
            width_value = EXCLUDED.width_value,
            width_unit = EXCLUDED.width_unit,
            height_value = EXCLUDED.height_value,
            height_unit = EXCLUDED.height_unit,
            weight_value = EXCLUDED.weight_value,
            weight_unit = EXCLUDED.weight_unit,
            volume_value = EXCLUDED.volume_value,
            volume_unit = EXCLUDED.volume_unit,
            updated_at = NOW()`,
          [
            productId,
            dims.length?.value || null,
            dims.length?.unit || null,
            dims.width?.value || null,
            dims.width?.unit || null,
            dims.height?.value || null,
            dims.height?.unit || null,
            dims.weight?.value || null,
            dims.weight?.unit || null,
            dims.volume?.value || null,
            dims.volume?.unit || null,
          ]
        );
      }

      // Save links
      if (product.links && product.links.length > 0) {
        await client.query(
          'DELETE FROM product_links WHERE product_id = $1',
          [productId]
        );

        for (const link of product.links) {
          await client.query(
            `INSERT INTO product_links (product_id, link_url, link_name, link_type, link_category)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (product_id, link_url, link_category) DO NOTHING`,
            [
              productId,
              link.linkUrl,
              link.linkName || null,
              link.linkType || null,
              link.category,
            ]
          );
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getProductByIdentifier(identifier: string): Promise<Product | null> {
    const query = `
      SELECT id FROM products WHERE product_identifier = $1
    `;
    const result = await this.pool.query(query, [identifier]);
    
    if (result.rows.length === 0) {
      return null;
    }

    return this.getProductById(result.rows[0].id);
  }

  async getProductById(id: string): Promise<Product | null> {
    const query = `
      SELECT * FROM products WHERE id = $1
    `;
    const result = await this.pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    const product: Product = {
      id: row.id,
      productIdentifier: row.product_identifier,
      identifierSchemeId: row.identifier_scheme_id,
      identifierSchemeName: row.identifier_scheme_name,
      registeredId: row.registered_id,
      name: row.name,
      description: row.description,
      producedByPartyId: row.produced_by_party_id,
      producedAtFacilityId: row.produced_at_facility_id,
      productionDate: row.production_date,
      countryOfProduction: row.country_of_production,
      batchNumber: row.batch_number,
      serialNumber: row.serial_number,
      characteristics: row.metadata || {},
    };

    // Load classifications
    const classificationsResult = await this.pool.query(
      'SELECT * FROM product_classifications WHERE product_id = $1',
      [id]
    );
    product.classifications = classificationsResult.rows.map(r => ({
      schemeId: r.scheme_id,
      schemeName: r.scheme_name,
      code: r.code,
      name: r.name,
    }));

    // Load dimensions
    const dimensionsResult = await this.pool.query(
      'SELECT * FROM product_dimensions WHERE product_id = $1',
      [id]
    );
    if (dimensionsResult.rows.length > 0) {
      const dimRow = dimensionsResult.rows[0];
      product.dimensions = {
        length: dimRow.length_value ? { value: dimRow.length_value, unit: dimRow.length_unit } : undefined,
        width: dimRow.width_value ? { value: dimRow.width_value, unit: dimRow.width_unit } : undefined,
        height: dimRow.height_value ? { value: dimRow.height_value, unit: dimRow.height_unit } : undefined,
        weight: dimRow.weight_value ? { value: dimRow.weight_value, unit: dimRow.weight_unit } : undefined,
        volume: dimRow.volume_value ? { value: dimRow.volume_value, unit: dimRow.volume_unit } : undefined,
      };
    }

    // Load links
    const linksResult = await this.pool.query(
      'SELECT * FROM product_links WHERE product_id = $1',
      [id]
    );
    product.links = linksResult.rows.map(r => ({
      linkUrl: r.link_url,
      linkName: r.link_name,
      linkType: r.link_type,
      category: r.link_category,
    }));

    return product;
  }

  // DPP relations operations

  async linkDppToEntity(
    tokenId: string,
    entityId: string,
    relationType: 'issuer' | 'manufacturer' | 'facility'
  ): Promise<void> {
    const query = `
      INSERT INTO dpp_entity_relations (token_id, entity_id, relation_type, extracted_from_dpp)
      VALUES ($1, $2, $3, true)
      ON CONFLICT (token_id, entity_id, relation_type) DO NOTHING
    `;
    await this.pool.query(query, [tokenId, entityId, relationType]);
  }

  async linkDppToProduct(
    tokenId: string,
    productId: string,
    granularity: 'productClass' | 'batch' | 'item',
    batchNumber?: string,
    serialNumber?: string
  ): Promise<void> {
    const query = `
      INSERT INTO dpp_product_relations (token_id, product_id, granularity_level, batch_number, serial_number, extracted_from_dpp)
      VALUES ($1, $2, $3, $4, $5, true)
      ON CONFLICT (token_id, product_id) DO UPDATE SET
        granularity_level = EXCLUDED.granularity_level,
        batch_number = EXCLUDED.batch_number,
        serial_number = EXCLUDED.serial_number
    `;
    await this.pool.query(query, [tokenId, productId, granularity, batchNumber || null, serialNumber || null]);
  }

  async getDppEntities(tokenId: string): Promise<Entity[]> {
    const query = `
      SELECT entity_id FROM dpp_entity_relations WHERE token_id = $1
    `;
    const result = await this.pool.query(query, [tokenId]);
    
    const entities: Entity[] = [];
    for (const row of result.rows) {
      const entity = await this.getEntityById(row.entity_id);
      if (entity) {
        entities.push(entity);
      }
    }
    
    return entities;
  }

  async getDppProduct(tokenId: string): Promise<Product | null> {
    const query = `
      SELECT product_id FROM dpp_product_relations WHERE token_id = $1 LIMIT 1
    `;
    const result = await this.pool.query(query, [tokenId]);
    
    if (result.rows.length === 0) {
      return null;
    }

    return this.getProductById(result.rows[0].product_id);
  }

  async getDppsForEntity(entityId: string): Promise<string[]> {
    const query = `
      SELECT token_id FROM dpp_entity_relations WHERE entity_id = $1
    `;
    const result = await this.pool.query(query, [entityId]);
    return result.rows.map(r => r.token_id);
  }

  async getDppsForProduct(productId: string): Promise<string[]> {
    const query = `
      SELECT token_id FROM dpp_product_relations WHERE product_id = $1
    `;
    const result = await this.pool.query(query, [productId]);
    return result.rows.map(r => r.token_id);
  }

  // Helpers

  private async saveFacilityDetails(
    client: any,
    facilityId: string,
    facility: FacilityDetails
  ): Promise<void> {
    // Insert or update facility
    await client.query(
      `INSERT INTO facilities (id, operated_by_party_id, country_of_operation, cadastral_boundary_uri)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET
         operated_by_party_id = EXCLUDED.operated_by_party_id,
         country_of_operation = EXCLUDED.country_of_operation,
         cadastral_boundary_uri = EXCLUDED.cadastral_boundary_uri,
         updated_at = NOW()`,
      [
        facilityId,
        facility.operatedByPartyId || null,
        facility.countryOfOperation || null,
        facility.cadastralBoundaryUri || null,
      ]
    );

    // Save process categories
    if (facility.processCategories && facility.processCategories.length > 0) {
      await client.query(
        'DELETE FROM facility_classifications WHERE facility_id = $1',
        [facilityId]
      );

      for (const classification of facility.processCategories) {
        await client.query(
          `INSERT INTO facility_classifications (facility_id, scheme_id, scheme_name, code, name)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (facility_id, scheme_id, code) DO NOTHING`,
          [
            facilityId,
            classification.schemeId,
            classification.schemeName || null,
            classification.code,
            classification.name || null,
          ]
        );
      }
    }

    // Save location information
    if (facility.locationInformation) {
      await client.query(
        'DELETE FROM facility_locations WHERE facility_id = $1',
        [facilityId]
      );

      const loc = facility.locationInformation;
      await client.query(
        `INSERT INTO facility_locations (
          facility_id, plus_code, geo_location, geo_boundary,
          street_address, postal_code, address_locality, address_region, address_country,
          is_primary
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)`,
        [
          facilityId,
          loc.plusCode || null,
          loc.geoLocation ? JSON.stringify(loc.geoLocation) : null,
          loc.geoBoundary ? JSON.stringify(loc.geoBoundary) : null,
          loc.address?.streetAddress || null,
          loc.address?.postalCode || null,
          loc.address?.addressLocality || null,
          loc.address?.addressRegion || null,
          loc.address?.addressCountry || null,
        ]
      );
    }

    // Save facility identifiers
    if (facility.facilityIdentifiers && facility.facilityIdentifiers.length > 0) {
      await client.query(
        'DELETE FROM facility_identifiers WHERE facility_id = $1',
        [facilityId]
      );

      for (const identifier of facility.facilityIdentifiers) {
        await client.query(
          `INSERT INTO facility_identifiers (facility_id, identifier, scheme_id, scheme_name, registered_id)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (facility_id, identifier) DO NOTHING`,
          [
            facilityId,
            identifier.identifier,
            identifier.schemeId || null,
            identifier.schemeName || null,
            identifier.registeredId || null,
          ]
        );
      }
    }
  }

  private async loadFacilityDetails(facilityId: string): Promise<FacilityDetails | undefined> {
    const facilityResult = await this.pool.query(
      'SELECT * FROM facilities WHERE id = $1',
      [facilityId]
    );

    if (facilityResult.rows.length === 0) {
      return undefined;
    }

    const facilityRow = facilityResult.rows[0];
    const facility: FacilityDetails = {
      operatedByPartyId: facilityRow.operated_by_party_id,
      countryOfOperation: facilityRow.country_of_operation,
      cadastralBoundaryUri: facilityRow.cadastral_boundary_uri,
    };

    // Load process categories
    const processCategoriesResult = await this.pool.query(
      'SELECT * FROM facility_classifications WHERE facility_id = $1',
      [facilityId]
    );
    facility.processCategories = processCategoriesResult.rows.map(r => ({
      schemeId: r.scheme_id,
      schemeName: r.scheme_name,
      code: r.code,
      name: r.name,
    }));

    // Load location information
    const locationResult = await this.pool.query(
      'SELECT * FROM facility_locations WHERE facility_id = $1 AND is_primary = true LIMIT 1',
      [facilityId]
    );
    if (locationResult.rows.length > 0) {
      const locRow = locationResult.rows[0];
      facility.locationInformation = {
        plusCode: locRow.plus_code,
        geoLocation: locRow.geo_location,
        geoBoundary: locRow.geo_boundary,
        address: {
          streetAddress: locRow.street_address,
          postalCode: locRow.postal_code,
          addressLocality: locRow.address_locality,
          addressRegion: locRow.address_region,
          addressCountry: locRow.address_country,
        },
      };
    }

    // Load facility identifiers
    const identifiersResult = await this.pool.query(
      'SELECT * FROM facility_identifiers WHERE facility_id = $1',
      [facilityId]
    );
    facility.facilityIdentifiers = identifiersResult.rows.map(r => ({
      identifier: r.identifier,
      schemeId: r.scheme_id,
      schemeName: r.scheme_name,
      registeredId: r.registered_id,
    }));

    return facility;
  }

  private async saveDigitalIdentityAnchor(
    client: any,
    entityId: string,
    dia: DigitalIdentityAnchor
  ): Promise<void> {
    await client.query(
      `INSERT INTO digital_identity_anchors (
        entity_id, did, registered_id, id_scheme_id, id_scheme_name,
        register_type, registration_scope_list,
        vc_id, vc_issuer, vc_issued_at, vc_valid_from, vc_valid_until
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (entity_id, did) DO UPDATE SET
        registered_id = EXCLUDED.registered_id,
        id_scheme_id = EXCLUDED.id_scheme_id,
        id_scheme_name = EXCLUDED.id_scheme_name,
        register_type = EXCLUDED.register_type,
        registration_scope_list = EXCLUDED.registration_scope_list,
        vc_id = EXCLUDED.vc_id,
        vc_issuer = EXCLUDED.vc_issuer,
        vc_issued_at = EXCLUDED.vc_issued_at,
        vc_valid_from = EXCLUDED.vc_valid_from,
        vc_valid_until = EXCLUDED.vc_valid_until,
        updated_at = NOW()`,
      [
        entityId,
        dia.did,
        dia.registeredId,
        dia.idSchemeId || null,
        dia.idSchemeName || null,
        dia.registerType || null,
        dia.registrationScopeList || null,
        dia.vcId || null,
        dia.vcIssuer || null,
        dia.vcIssuedAt || null,
        dia.vcValidFrom || null,
        dia.vcValidUntil || null,
      ]
    );
  }

  private mapRowToDIA(row: any): DigitalIdentityAnchor {
    return {
      did: row.did,
      registeredId: row.registered_id,
      idSchemeId: row.id_scheme_id,
      idSchemeName: row.id_scheme_name,
      registerType: row.register_type,
      registrationScopeList: row.registration_scope_list,
      vcId: row.vc_id,
      vcIssuer: row.vc_issuer,
      vcIssuedAt: row.vc_issued_at,
      vcValidFrom: row.vc_valid_from,
      vcValidUntil: row.vc_valid_until,
    };
  }

  /**
   * Close database connection pool
   * 
   * Call on application shutdown.
   */
  async close(): Promise<void> {
    await this.pool.end();
  }
}


