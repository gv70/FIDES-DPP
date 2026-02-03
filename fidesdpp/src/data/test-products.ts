/**
 * Pre-defined Test Products
 * 
 * Sample products for testing passport creation
 * 
 * @license Apache-2.0
 */

import type { CreatePassportFormInput } from '@/lib/application/hybrid-types';

export interface TestProduct {
  id: string;
  name: string;
  description: string;
  data: CreatePassportFormInput;
}

export const testProducts: TestProduct[] = [
  {
    id: 'wood-table-batch',
    name: 'Wood Table (Batch)',
    description: 'Sustainable oak table, batch production',
    data: {
      productId: 'GTIN:0123456789012',
      productName: 'Oak Dining Table',
      productDescription: 'Handcrafted oak dining table with sustainable wood sourcing',
      granularity: 'Batch',
      batchNumber: 'BATCH-2025-001',
      manufacturer: {
        name: 'EcoFurniture Co.',
        identifier: 'VAT-IT12345678901',
        country: 'IT',
        facility: 'Milan Factory',
        facilityId: 'FAC-IT-MI-001',
      },
      annexIII: {
        facilities: [
          {
            facilityId: 'FAC-IT-MI-001',
            name: 'Milan Factory',
            country: 'IT',
            city: 'Milano',
            address: 'Via Esempio 1',
          },
        ],
      },
      issuerAddress: '', // Will be filled from wallet
      issuerPublicKey: '', // Will be filled from wallet
    },
  },
  {
    id: 'office-desk-item',
    name: 'Office Desk (Item)',
    description: 'Individual desk with serial number',
    data: {
      productId: 'GTIN:2000000000001',
      productName: 'Standing Office Desk',
      productDescription: 'Height-adjustable desk with modular frame and replaceable parts',
      granularity: 'Item',
      serialNumber: 'DESK-2025-000123',
      manufacturer: {
        name: 'Linea Arredo Srl',
        identifier: 'VAT-IT98765432109',
        country: 'IT',
        facility: 'Bergamo Assembly',
        facilityId: 'FAC-IT-BG-002',
      },
      annexIII: {
        facilities: [
          {
            facilityId: 'FAC-IT-BG-002',
            name: 'Bergamo Assembly',
            country: 'IT',
            city: 'Bergamo',
            address: 'Via Esempio 2',
          },
        ],
      },
      issuerAddress: '',
      issuerPublicKey: '',
    },
  },
  {
    id: 'sofa-product-class',
    name: 'Modular Sofa (Product Class)',
    description: 'Product class level for a modular sofa line',
    data: {
      productId: 'SKU:SOFA-MOD-3S-001',
      productName: 'Modular Sofa 3-Seater',
      productDescription: 'Modular 3-seater sofa with removable covers and replaceable cushions',
      granularity: 'ProductClass',
      manufacturer: {
        name: 'NordicWood Works',
        identifier: 'VAT-SE1234567890',
        country: 'SE',
        facility: 'Gothenburg Upholstery',
        facilityId: 'FAC-SE-GOT-003',
      },
      annexIII: {
        facilities: [
          {
            facilityId: 'FAC-SE-GOT-003',
            name: 'Gothenburg Upholstery',
            country: 'SE',
            city: 'Göteborg',
            address: 'Examplegatan 3',
          },
        ],
      },
      issuerAddress: '',
      issuerPublicKey: '',
    },
  },
  {
    id: 'wardrobe-batch',
    name: 'Wardrobe (Batch)',
    description: 'Batch tracking for a wardrobe production run',
    data: {
      productId: 'GTIN:2000000000002',
      productName: '3-Door Wardrobe',
      productDescription: 'Flat-pack wardrobe with modular shelves and standard fasteners',
      granularity: 'Batch',
      batchNumber: 'WARD-2025-Q1-042',
      manufacturer: {
        name: 'CasaLegno SpA',
        identifier: 'VAT-IT01234567890',
        country: 'IT',
        facility: 'Treviso Plant',
        facilityId: 'FAC-IT-TV-004',
      },
      annexIII: {
        facilities: [
          {
            facilityId: 'FAC-IT-TV-004',
            name: 'Treviso Plant',
            country: 'IT',
            city: 'Treviso',
            address: 'Via Esempio 4',
          },
        ],
      },
      issuerAddress: '',
      issuerPublicKey: '',
    },
  },
  {
    id: 'furniture-item',
    name: 'Chair (Item)',
    description: 'Individual chair with serial number',
    data: {
      productId: 'GTIN:5555555555555',
      productName: 'Ergonomic Office Chair',
      productDescription: 'Ergonomic office chair with recycled plastic components',
      granularity: 'Item',
      serialNumber: 'CHAIR-2025-000567',
      manufacturer: {
        name: 'ComfortWorks Furniture',
        identifier: 'VAT-UK987654321',
        country: 'GB',
        facility: 'London Workshop',
        facilityId: 'FAC-GB-LON-005',
      },
      annexIII: {
        facilities: [
          {
            facilityId: 'FAC-GB-LON-005',
            name: 'London Workshop',
            country: 'GB',
            city: 'London',
            address: 'Example Street 5',
          },
        ],
      },
      issuerAddress: '',
      issuerPublicKey: '',
    },
  },
];

/**
 * Get test product by ID
 */
export function getTestProduct(id: string): TestProduct | undefined {
  return testProducts.find((p) => p.id === id);
}

/**
 * Load product from JSON string
 */
export function loadProductFromJson(jsonString: string): CreatePassportFormInput | null {
  try {
    const data = JSON.parse(jsonString);
    
    // Validate required fields
    if (
      !data.productId ||
      !data.productName ||
      !data.granularity ||
      !data.manufacturer?.name ||
      !data.manufacturer?.identifier ||
      !data.manufacturer?.country ||
      !data.manufacturer?.facility ||
      !data.manufacturer?.facilityId
    ) {
      return null;
    }

    const firstFacility =
      Array.isArray(data.annexIII?.facilities) && data.annexIII.facilities.length > 0
        ? data.annexIII.facilities[0]
        : null;
    if (!firstFacility?.country || !firstFacility?.city || !firstFacility?.address) {
      return null;
    }
    
    const traceabilityFromJson: Array<{ event_ref: string; actor?: string; evidence_uri?: string }> | undefined =
      Array.isArray(data.traceability)
        ? data.traceability
            .map((t: any) => {
              if (typeof t === 'string') return { event_ref: t };
              if (!t || typeof t !== 'object') return null;
              const eventRef = String(t.event_ref || t.eventReference || t.ref || '').trim();
              if (!eventRef) return null;
              const actor = t.actor ? String(t.actor).trim() : undefined;
              const evidenceUri = t.evidence_uri ? String(t.evidence_uri).trim() : undefined;
              return { event_ref: eventRef, ...(actor ? { actor } : {}), ...(evidenceUri ? { evidence_uri: evidenceUri } : {}) };
            })
            .filter(Boolean)
        : Array.isArray(data.dte)
        ? data.dte.map((v: any) => ({ event_ref: String(v).trim() })).filter((t: any) => !!t.event_ref)
        : undefined;

    return {
      productId: data.productId,
      productName: data.productName,
      productDescription: data.productDescription,
      granularity: data.granularity,
      batchNumber: data.batchNumber,
      serialNumber: data.serialNumber,
      manufacturer: {
        name: data.manufacturer.name,
        identifier: data.manufacturer.identifier,
        country: data.manufacturer.country,
        facility: data.manufacturer.facility,
        facilityId: data.manufacturer.facilityId,
      },
      annexIII: data.annexIII,
      ...(traceabilityFromJson && traceabilityFromJson.length > 0 ? { traceability: traceabilityFromJson } : {}),
      issuerAddress: '', // Will be filled from wallet
      issuerPublicKey: '', // Will be filled from wallet
      useDidWeb: data.useDidWeb || false,
      issuerDid: data.issuerDid,
    };
  } catch (error) {
    console.error('Failed to parse product JSON:', error);
    return null;
  }
}

/**
 * Export product to JSON string
 */
export function exportProductToJson(data: CreatePassportFormInput): string {
  return JSON.stringify(
    {
      productId: data.productId,
      productName: data.productName,
      productDescription: data.productDescription,
      granularity: data.granularity,
      batchNumber: data.batchNumber,
      serialNumber: data.serialNumber,
      manufacturer: data.manufacturer,
      annexIII: data.annexIII,
      traceability: data.traceability,
      useDidWeb: data.useDidWeb,
      issuerDid: data.issuerDid,
    },
    null,
    2
  );
}
