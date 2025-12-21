-- FIDES-DPP Anagrafica Database Migration
-- Anagrafica Aziende e Prodotti - Conforme UNTP Vocabulary
-- 
-- License: Apache-2.0
-- Clean Room Implementation: Based on UNTP public specifications (markdown docs),
-- not derived from GPL-licensed vocabulary.jsonld files
--
-- References:
-- - reference/specification/DigitalProductPassport.md
-- - reference/specification/IdentityResolver.md
-- - reference/specification/DIDMethods.md

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- TABELLE ANAGRAFICA AZIENDE (untp-core:Party, untp-core:Facility)

-- entities: Entità generiche (Party/CredentialIssuer conforme untp-core:Party)
CREATE TABLE IF NOT EXISTS entities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('issuer', 'manufacturer', 'facility')),
  
  -- untp-core:Party properties (allineato a vocabulary.jsonld)
  primary_identifier TEXT NOT NULL UNIQUE, -- untp-core:id (DID, business registry ID, etc.)
  identifier_scheme_id TEXT, -- untp-core:idScheme (URI to IdentifierScheme)
  identifier_scheme_name TEXT, -- Nome dello scheme
  registered_id TEXT, -- untp-core:registeredId (alphanumeric registration number)
  name TEXT NOT NULL, -- untp-core:name
  description TEXT, -- untp-core:description
  registration_country CHAR(2), -- untp-core:registrationCountry (ISO-3166)
  organisation_website TEXT, -- untp-core:organisationWebsite
  
  -- UNTP DPP-08: Verifiable Party requirements
  idr_endpoint TEXT, -- Identity Resolver endpoint (per IDR compliance)
  verification_status TEXT CHECK (verification_status IN ('verified', 'unverified', 'pending')),
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Metadata JSONB per estensioni e dati non normalizzati
  metadata JSONB DEFAULT '{}'::jsonb
);

-- entity_classifications: Classificazioni per Party (untp-core:industryCategory)
CREATE TABLE IF NOT EXISTS entity_classifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  scheme_id TEXT NOT NULL, -- untp-core:Classification.schemeID (URI)
  scheme_name TEXT, -- untp-core:Classification.schemeName
  code TEXT NOT NULL, -- untp-core:Classification.code
  name TEXT, -- untp-core:Classification.name
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(entity_id, scheme_id, code)
);

-- entity_identifiers: Identificatori multipli (untp-core:issuerAlsoKnownAs, untp-core:partyAlsoKnownAs)
CREATE TABLE IF NOT EXISTS entity_identifiers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  identifier TEXT NOT NULL, -- untp-core:Party.id (URI/DID)
  scheme_id TEXT, -- untp-core:IdentifierScheme.id (URI to scheme, e.g., https://business.gov.au/ABN/)
  scheme_name TEXT, -- untp-core:IdentifierScheme.name
  registered_id TEXT, -- untp-core:registeredId (e.g., ABN number)
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(entity_id, identifier)
);

-- facilities: Dettagli facility (untp-core:Facility, conforme UNTP DPP-04)
CREATE TABLE IF NOT EXISTS facilities (
  id UUID PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
  
  -- untp-core:Facility properties (allineato a vocabulary.jsonld)
  operated_by_party_id UUID REFERENCES entities(id), -- untp-core:operatedByParty (FK to Party)
  country_of_operation CHAR(2), -- untp-core:countryOfOperation (ISO-3166)
  cadastral_boundary_uri TEXT, -- Link to cadastral info (UNTP DPP-04 requirement)
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- facility_classifications: Classificazioni processi (untp-core:processCategory)
CREATE TABLE IF NOT EXISTS facility_classifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  scheme_id TEXT NOT NULL, -- untp-core:Classification.schemeID
  scheme_name TEXT,
  code TEXT NOT NULL, -- untp-core:Classification.code (e.g., ISIC code)
  name TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(facility_id, scheme_id, code)
);

-- facility_locations: Informazioni geografiche (untp-core:locationInformation, untp-core:address)
CREATE TABLE IF NOT EXISTS facility_locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  
  -- untp-core:Location properties
  plus_code TEXT, -- untp-core:plusCode (Open Location Code)
  geo_location JSONB, -- untp-core:geoLocation (GeoJSON Point)
  geo_boundary JSONB, -- untp-core:geoBoundary (GeoJSON Polygon)
  
  -- untp-core:Address properties
  street_address TEXT, -- untp-core:streetAddress
  postal_code TEXT, -- untp-core:postalCode
  address_locality TEXT, -- untp-core:addressLocality (city/suburb)
  address_region TEXT, -- untp-core:addressRegion (state/province)
  address_country CHAR(2), -- untp-core:addressCountry (ISO-3166)
  
  is_primary BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- facility_identifiers: Identificatori multipli facility (untp-core:facilityAlsoKnownAs)
CREATE TABLE IF NOT EXISTS facility_identifiers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  identifier TEXT NOT NULL, -- untp-core:Facility.id (URI, e.g., GLN)
  scheme_id TEXT,
  scheme_name TEXT,
  registered_id TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(facility_id, identifier)
);

-- TABELLE ANAGRAFICA PRODOTTI (untp-core:Product)

-- products: Catalogo prodotti master (untp-core:Product, conforme UNTP DPP-01, DPP-02)
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- untp-core:Product properties (allineato a vocabulary.jsonld)
  product_identifier TEXT NOT NULL UNIQUE, -- untp-core:Product.id (URI, ideally resolvable per ISO 18975)
  identifier_scheme_id TEXT, -- untp-core:idScheme (URI to IdentifierScheme)
  identifier_scheme_name TEXT,
  registered_id TEXT, -- untp-core:registeredId (alphanumeric, e.g., GTIN)
  name TEXT NOT NULL, -- untp-core:name
  description TEXT, -- untp-core:description
  
  -- Relazioni (untp-core:producedByParty, untp-core:producedAtFacility)
  produced_by_party_id UUID REFERENCES entities(id), -- untp-core:producedByParty (FK to Party)
  produced_at_facility_id UUID REFERENCES facilities(id), -- untp-core:producedAtFacility (FK to Facility)
  
  -- Dati produzione
  production_date DATE, -- untp-core:productionDate (ISO 8601)
  country_of_production CHAR(2), -- untp-core:countryOfProduction (ISO-3166)
  
  -- Granularity (per batch/item level)
  batch_number TEXT, -- untp-core:batchNumber (se granularity = batch/item)
  serial_number TEXT, -- untp-core:serialNumber (se granularity = item)
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Metadata JSONB per estensioni (untp-core:characteristics, untp-core:productImage, etc.)
  metadata JSONB DEFAULT '{}'::jsonb
);

-- product_classifications: Classificazioni multiple (untp-core:productCategory, conforme UNTP DPP-02)
CREATE TABLE IF NOT EXISTS product_classifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  scheme_id TEXT NOT NULL, -- untp-core:Classification.schemeID (URI, e.g., UN-CPC)
  scheme_name TEXT, -- untp-core:Classification.schemeName
  code TEXT NOT NULL, -- untp-core:Classification.code
  name TEXT, -- untp-core:Classification.name
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(product_id, scheme_id, code)
);

-- product_dimensions: Dimensioni standard (untp-core:Dimension, conforme UNTP DPP-05)
CREATE TABLE IF NOT EXISTS product_dimensions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  
  -- untp-core:Dimension properties (untp-core:Measure con UNECE Recommendation 20 units)
  length_value DECIMAL, -- untp-core:Measure.value
  length_unit TEXT, -- untp-core:Measure.unit (UNECE Recommendation 20, e.g., 'MTR')
  width_value DECIMAL,
  width_unit TEXT,
  height_value DECIMAL,
  height_unit TEXT,
  weight_value DECIMAL,
  weight_unit TEXT, -- e.g., 'KGM'
  volume_value DECIMAL,
  volume_unit TEXT, -- e.g., 'LTR'
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(product_id)
);

-- product_links: Link a informazioni aggiuntive (untp-core:furtherInformation, untp-core:productImage)
CREATE TABLE IF NOT EXISTS product_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  link_url TEXT NOT NULL, -- untp-core:Link.linkURL
  link_name TEXT, -- untp-core:Link.name
  link_type TEXT, -- untp-core:Link.linkType (URI from controlled vocabulary)
  link_category TEXT CHECK (link_category IN ('furtherInformation', 'productImage', 'other')),
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(product_id, link_url, link_category)
);

-- TABELLE INDICIZZAZIONE DPP

-- dpp_entity_relations: Relazioni DPP → Entità
CREATE TABLE IF NOT EXISTS dpp_entity_relations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  token_id TEXT NOT NULL, -- FK to on-chain passport
  entity_id UUID NOT NULL REFERENCES entities(id),
  relation_type TEXT NOT NULL CHECK (relation_type IN ('issuer', 'manufacturer', 'facility')),
  extracted_from_dpp BOOLEAN DEFAULT true, -- true if extracted from DPP, false if from master data
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(token_id, entity_id, relation_type)
);

-- dpp_product_relations: Relazioni DPP → Prodotto
CREATE TABLE IF NOT EXISTS dpp_product_relations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  token_id TEXT NOT NULL,
  product_id UUID NOT NULL REFERENCES products(id),
  granularity_level TEXT CHECK (granularity_level IN ('productClass', 'batch', 'item')),
  batch_number TEXT,
  serial_number TEXT,
  extracted_from_dpp BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(token_id, product_id)
);

-- TABELLE DIGITAL IDENTITY ANCHOR (untp-dia:DigitalIdentityAnchor)

-- digital_identity_anchors: Digital Identity Anchor (untp-dia:DigitalIdentityAnchor, conforme UNTP DIA spec)
CREATE TABLE IF NOT EXISTS digital_identity_anchors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  
  -- untp-dia:RegisteredIdentity properties
  did TEXT NOT NULL, -- untp-dia:id (DID controllato dal membro)
  registered_id TEXT NOT NULL, -- untp-dia:registeredId (numero registro)
  id_scheme_id TEXT, -- untp-dia:idScheme (URI to IdentifierScheme)
  id_scheme_name TEXT,
  register_type TEXT, -- untp-dia:registerType (organisations, facilities, products, etc.)
  registration_scope_list TEXT[], -- untp-dia:registrationScopeList (array di URI)
  
  -- VC metadata
  vc_id TEXT, -- ID del VC DIA
  vc_issuer TEXT, -- Issuer del VC (trusted authority)
  vc_issued_at TIMESTAMP,
  vc_valid_from TIMESTAMP,
  vc_valid_until TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(entity_id, did),
  UNIQUE(registered_id, id_scheme_id) -- Unique within register
);

-- INDICI PER PERFORMANCE

-- Entities
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_entities_identifier ON entities(primary_identifier);
CREATE INDEX IF NOT EXISTS idx_entities_registered_id ON entities(registered_id);
CREATE INDEX IF NOT EXISTS idx_entities_country ON entities(registration_country);
CREATE INDEX IF NOT EXISTS idx_entity_identifiers_entity ON entity_identifiers(entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_identifiers_identifier ON entity_identifiers(identifier);
CREATE INDEX IF NOT EXISTS idx_entity_classifications_entity ON entity_classifications(entity_id);

-- Facilities
CREATE INDEX IF NOT EXISTS idx_facilities_operator ON facilities(operated_by_party_id);
CREATE INDEX IF NOT EXISTS idx_facilities_country ON facilities(country_of_operation);
CREATE INDEX IF NOT EXISTS idx_facility_locations_facility ON facility_locations(facility_id);
CREATE INDEX IF NOT EXISTS idx_facility_identifiers_facility ON facility_identifiers(facility_id);
CREATE INDEX IF NOT EXISTS idx_facility_classifications_facility ON facility_classifications(facility_id);

-- Products
CREATE INDEX IF NOT EXISTS idx_products_identifier ON products(product_identifier);
CREATE INDEX IF NOT EXISTS idx_products_registered_id ON products(registered_id);
CREATE INDEX IF NOT EXISTS idx_products_manufacturer ON products(produced_by_party_id);
CREATE INDEX IF NOT EXISTS idx_products_facility ON products(produced_at_facility_id);
CREATE INDEX IF NOT EXISTS idx_products_country ON products(country_of_production);
CREATE INDEX IF NOT EXISTS idx_product_classifications_product ON product_classifications(product_id);
CREATE INDEX IF NOT EXISTS idx_product_links_product ON product_links(product_id);

-- DIA
CREATE INDEX IF NOT EXISTS idx_dia_entity ON digital_identity_anchors(entity_id);
CREATE INDEX IF NOT EXISTS idx_dia_did ON digital_identity_anchors(did);
CREATE INDEX IF NOT EXISTS idx_dia_registered ON digital_identity_anchors(registered_id, id_scheme_id);

-- DPP Relations
CREATE INDEX IF NOT EXISTS idx_dpp_entity_relations_token ON dpp_entity_relations(token_id);
CREATE INDEX IF NOT EXISTS idx_dpp_entity_relations_entity ON dpp_entity_relations(entity_id);
CREATE INDEX IF NOT EXISTS idx_dpp_product_relations_token ON dpp_product_relations(token_id);
CREATE INDEX IF NOT EXISTS idx_dpp_product_relations_product ON dpp_product_relations(product_id);

-- MAINTENANCE

-- Note: VACUUM ANALYZE cannot run inside a transaction block.
-- Run manually after migration if needed:
-- VACUUM ANALYZE entities;
-- VACUUM ANALYZE entity_identifiers;
-- ... (etc)


