/**
 * Unit tests for IDR products route
 *
 * @license Apache-2.0
 */

import { NextRequest } from 'next/server';

jest.mock('../../../../../lib/anagrafica/createAnagraficaStorage', () => ({
  createAnagraficaStorage: () => {
    throw new Error('disabled');
  },
}));

jest.mock('../../../../../lib/dte/createDteIndexStorage', () => ({
  createDteIndexStorage: () => {
    throw new Error('disabled');
  },
}));

jest.mock('../../../../../lib/passports/lookup', () => {
  const actual = jest.requireActual('../../../../../lib/passports/lookup');
  return {
    ...actual,
    lookupTokenIdByCanonicalSubjectId: jest.fn(async () => null),
  };
});

import { GET } from '../route';

describe('GET /idr/products/[productId]', () => {
  it('returns linkset JSON for productId even without tokenId (Accept: application/json)', async () => {
    const request = new NextRequest('http://localhost:3000/idr/products/PROD-001', {
      method: 'GET',
      headers: {
        accept: 'application/json',
      },
    });

    const response = await GET(request, { params: Promise.resolve({ productId: 'PROD-001' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/linkset+json');
    expect(data?.linkset?.[0]?.self?.href).toBe(
      'http://localhost:3000/idr/products/PROD-001?linkType=linkset'
    );
    expect(data?.linkset?.[0]?.['untp:granularity']?.href).toBe('urn:untp:granularity:unknown');
    expect(data?.linkset?.[0]?.['untp:status']?.href).toBe('urn:untp:status:not-issued');
  });

  it('includes untp:dpp and alternate when tokenId is provided', async () => {
    const request = new NextRequest('http://localhost:3000/idr/products/PROD-002?tokenId=99&linkType=linkset', {
      method: 'GET',
      headers: {
        accept: 'application/linkset+json',
      },
    });

    const response = await GET(request, { params: Promise.resolve({ productId: 'PROD-002' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data?.linkset?.[0]?.['untp:dpp']?.href).toBe('http://localhost:3000/api/passport/vc/99');
    expect(data?.linkset?.[0]?.alternate?.href).toBe('http://localhost:3000/render/99');
    expect(data?.linkset?.[0]?.['untp:status']?.href).toBe('urn:untp:status:available');
  });

  it('supports language negotiation via ?language= and adds hreflang', async () => {
    const request = new NextRequest(
      'http://localhost:3000/idr/products/PROD-003?tokenId=1&linkType=linkset&language=it',
      {
        method: 'GET',
        headers: { accept: 'application/linkset+json' },
      }
    );

    const response = await GET(request, { params: Promise.resolve({ productId: 'PROD-003' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data?.linkset?.[0]?.self?.hreflang).toBe('it');
    expect(data?.linkset?.[0]?.alternate?.hreflang).toBe('it');
  });

  it('returns a human-friendly HTML message when no token exists (Accept: text/html)', async () => {
    const request = new NextRequest('http://localhost:3000/idr/products/PROD-004', {
      method: 'GET',
      headers: { accept: 'text/html' },
    });

    const response = await GET(request, { params: Promise.resolve({ productId: 'PROD-004' }) });
    const text = await response.text();

    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(text).toContain('Passport not available yet');
  });
});
