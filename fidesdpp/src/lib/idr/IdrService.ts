/**
 * Identity Resolver (IDR) Service
 * 
 * Implements UNTP Identity Resolver specification (IETF RFC 9264 linksets).
 * Maps product identifiers to typed links (VC URL, render URL, etc.).
 * 
 * UNTP Requirement: IDR-02, IDR-06, IDR-07
 * Reference: reference/specification/IdentityResolver.md
 * 
 * @license Apache-2.0
 */

/**
 * RFC 9264 Link object
 */
export interface Link {
  href: string;
  type?: string;
  title?: string;
  hreflang?: string;
}

/**
 * RFC 9264 Linkset
 */
export interface Linkset {
  anchor: string;
  [linkRelation: string]: string | Link | Link[];
}

/**
 * IDR Response (RFC 9264 format)
 */
export interface IdrResponse {
  linkset: Linkset[];
}

/**
 * Identity Resolver Service
 * 
 * Minimal implementation for M2:
 * - Link types: untp:dpp (VC URL), alternate (render URL)
 * - Default redirect to render URL
 * - Entity and product resolution via anagrafica
 * 
 * Deferred to M3:
 * - Secondary resolvers
 * - Versioned targets
 * - Language negotiation
 * - Multiple link formats (QR, PDF, etc.)
 */
export class IdrService {
  private baseUrl: string;
  private anagraficaService?: any; // AnagraficaService (optional)

  constructor(baseUrl?: string, anagraficaService?: any) {
    this.baseUrl = baseUrl || process.env.IDR_BASE_URL || 'http://localhost:3000';
    this.anagraficaService = anagraficaService;
  }

  /**
   * Generate linkset for a product identifier
   * 
   * Maps product ID to:
   * - untp:dpp → VC URL (verifiable data)
   * - alternate → Render URL (human-readable)
   * 
   * @param productId - Product identifier (GTIN, SKU, etc.)
   * @param tokenId - Optional token ID (if known)
   * @returns RFC 9264 linkset
   */
  async generateLinkset(productId: string, tokenId?: string): Promise<Linkset> {
    // Anchor: Product identifier URN
    const anchor = this.normalizeIdentifier(productId);

    // Links
    const links: Linkset = {
      anchor,
    };

    // Link: untp:dpp (VC URL)
    if (tokenId) {
      links['untp:dpp'] = {
        href: `${this.baseUrl}/api/passport/vc/${tokenId}`,
        type: 'application/vc+jwt',
        title: 'Digital Product Passport (Verifiable Credential)',
      };
    }

    // Link: alternate (human-readable render)
    if (tokenId) {
      const renderBaseUrl = process.env.RENDER_BASE_URL || this.baseUrl;
      links['alternate'] = {
        href: `${renderBaseUrl}/render/${tokenId}`,
        type: 'text/html',
        title: 'Human-readable DPP',
      };
    }

    // Link: self (this linkset)
    links['self'] = {
      href: `${this.baseUrl}/idr/products/${productId}?linkType=linkset`,
      type: 'application/linkset+json',
      title: 'Identity Resolver Linkset',
    };

    return links;
  }

  /**
   * Resolve product identifier to default link
   * 
   * For M2: redirects to render URL (human-readable)
   * 
   * @param productId - Product identifier
   * @param tokenId - Token ID (required for redirect)
   * @returns Default link URL
   */
  async resolveDefaultLink(productId: string, tokenId: string): Promise<string> {
    const renderBaseUrl = process.env.RENDER_BASE_URL || this.baseUrl;
    return `${renderBaseUrl}/render/${tokenId}`;
  }

  /**
   * Resolve product identifier to specific link type
   * 
   * @param productId - Product identifier
   * @param linkType - Link relation type (e.g., "untp:dpp", "alternate")
   * @param tokenId - Token ID (required)
   * @returns Link URL or null if not found
   */
  async resolveLinkByType(
    productId: string,
    linkType: string,
    tokenId: string
  ): Promise<string | null> {
    const linkset = await this.generateLinkset(productId, tokenId);

    const link = linkset[linkType];
    if (!link) {
      return null;
    }

    // Extract href from Link object or use string directly
    if (typeof link === 'string') {
      return link;
    } else if (typeof link === 'object' && 'href' in link) {
      return link.href;
    } else if (Array.isArray(link) && link.length > 0) {
      return link[0].href;
    }

    return null;
  }

  /**
   * Normalize product identifier to URN format
   * 
   * Examples:
   * - "01234567890128" → "urn:epc:id:sgtin:0123456.789012.8"
   * - "SKU-12345" → "urn:product:SKU-12345"
   * 
   * For M2: Simple passthrough (defer complex URN parsing to M3)
   * 
   * @param identifier - Product identifier
   * @returns Normalized URN
   */
  private normalizeIdentifier(identifier: string): string {
    // M2: Simple URN wrapping
    // M3: Implement proper GTIN → URN:EPC conversion
    
    if (identifier.startsWith('urn:')) {
      return identifier; // Already URN format
    }

    // Wrap in generic product URN
    return `urn:product:${identifier}`;
  }

  /**
   * Lookup tokenId by product identifier
   * 
   * For M2: Uses anagrafica to lookup product → DPP relations
   * 
   * @param productId - Product identifier
   * @returns Token ID or null if not found
   */
  async lookupTokenId(productId: string): Promise<string | null> {
    if (!this.anagraficaService) {
      console.warn('AnagraficaService not available. Cannot lookup tokenId.');
      return null;
    }

    try {
      const product = await this.anagraficaService.resolveProduct(productId);
      if (!product) {
        return null;
      }

      // Get DPPs linked to this product
      const tokenIds = await this.anagraficaService.getStorage().getDppsForProduct(product.id);
      return tokenIds.length > 0 ? tokenIds[0] : null; // Return first tokenId
    } catch (error: any) {
      console.warn('Failed to lookup tokenId:', error.message);
      return null;
    }
  }

  /**
   * Resolve entity to linkset (UNTP IDR for entities)
   * 
   * Maps entity identifier (DID, business registry ID) to:
   * - self → Entity profile URL
   * - untp:dpp → List of DPPs issued by this entity
   * - alternate → Human-readable entity page
   * 
   * @param entityId - Entity identifier (DID, business registry ID, etc.)
   * @returns RFC 9264 linkset
   */
  async resolveEntityLinkset(entityId: string): Promise<Linkset> {
    const anchor = this.normalizeIdentifier(entityId);
    const links: Linkset = {
      anchor,
    };

    // Link: self (entity profile)
    links['self'] = {
      href: `${this.baseUrl}/idr/entities/${encodeURIComponent(entityId)}`,
      type: 'application/json',
      title: 'Entity Profile',
    };

    // If anagrafica is available, add links to DPPs
    if (this.anagraficaService) {
      try {
        const entity = await this.anagraficaService.resolveEntity(entityId);
        if (entity) {
          const tokenIds = await this.anagraficaService.getStorage().getDppsForEntity(entity.id);
          
          if (tokenIds.length > 0) {
            // Link: untp:dpp (list of DPPs)
            links['untp:dpp'] = tokenIds.map((tokenId: string) => ({
              href: `${this.baseUrl}/api/passport/vc/${tokenId}`,
              type: 'application/vc+jwt',
              title: `DPP Token ${tokenId}`,
            }));
          }
        }
      } catch (error: any) {
        console.warn('Failed to resolve entity for linkset:', error.message);
      }
    }

    // Link: alternate (human-readable)
    links['alternate'] = {
      href: `${this.baseUrl}/idr/entities/${encodeURIComponent(entityId)}?format=html`,
      type: 'text/html',
      title: 'Human-readable Entity Profile',
    };

    return links;
  }

  /**
   * Resolve product to linkset (UNTP IDR for products)
   * 
   * Maps product identifier to:
   * - self → Product profile URL
   * - untp:dpp → List of DPPs for this product
   * - alternate → Human-readable product page
   * 
   * @param productId - Product identifier (GTIN, custom ID, etc.)
   * @returns RFC 9264 linkset
   */
  async resolveProductLinkset(productId: string): Promise<Linkset> {
    const anchor = this.normalizeIdentifier(productId);
    const links: Linkset = {
      anchor,
    };

    // Link: self (product profile)
    links['self'] = {
      href: `${this.baseUrl}/idr/products/${encodeURIComponent(productId)}`,
      type: 'application/json',
      title: 'Product Profile',
    };

    // If anagrafica is available, add links to DPPs
    if (this.anagraficaService) {
      try {
        const product = await this.anagraficaService.resolveProduct(productId);
        if (product) {
          const tokenIds = await this.anagraficaService.getStorage().getDppsForProduct(product.id);
          
          if (tokenIds.length > 0) {
            // Link: untp:dpp (list of DPPs)
            links['untp:dpp'] = tokenIds.map((tokenId: string) => ({
              href: `${this.baseUrl}/api/passport/vc/${tokenId}`,
              type: 'application/vc+jwt',
              title: `DPP Token ${tokenId}`,
            }));

            // Link: alternate (render URL for first DPP)
            if (tokenIds.length > 0) {
              const renderBaseUrl = process.env.RENDER_BASE_URL || this.baseUrl;
              links['alternate'] = {
                href: `${renderBaseUrl}/render/${tokenIds[0]}`,
                type: 'text/html',
                title: 'Human-readable DPP',
              };
            }
          }
        }
      } catch (error: any) {
        console.warn('Failed to resolve product for linkset:', error.message);
      }
    }

    return links;
  }
}

