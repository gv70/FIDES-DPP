/**
 * Unit tests for Passport Verification API Route
 * 
 * @license Apache-2.0
 */

import { NextRequest } from 'next/server';

// Mock dependencies
jest.mock('@/lib/factory/createDppService');
jest.mock('@/lib/validation/validateUntpDpp');

import { createDppService } from '@/lib/factory/createDppService';
import { formatValidationErrors } from '@/lib/validation/validateUntpDpp';
import { POST, GET } from '../route';

describe('POST /api/passport/verify', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      CONTRACT_ADDRESS: '0x1234567890123456789012345678901234567890',
      POLKADOT_RPC_URL: 'wss://test-rpc.polkadot.io',
      IPFS_NODE_URL: 'http://127.0.0.1:5001',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  it('should return 400 if tokenId is missing', async () => {
    const request = new NextRequest('http://localhost:3000/api/passport/verify', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Token ID is required');
  });

  it('should return 503 if environment is not configured', async () => {
    process.env.CONTRACT_ADDRESS = '';

    const request = new NextRequest('http://localhost:3000/api/passport/verify', {
      method: 'POST',
      body: JSON.stringify({ tokenId: '1' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.error).toBe('Service not configured');
    expect(data.message).toContain('CONTRACT_ADDRESS');
  });

  it('should return proper VerificationResult structure for valid passport', async () => {
    const mockVerifyPassport = jest.fn().mockResolvedValue({
      valid: true,
      onChainData: {
        tokenId: '1',
        issuer: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
        datasetUri: 'ipfs://bafkreitest',
        payloadHash: '0x123abc...',
        datasetType: 'application/vc+jwt',
        granularity: 'Batch',
        status: 'Active',
        version: 1,
        createdAt: 12345,
        updatedAt: 12345,
      },
      vcJwt: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJkaWQ6a2V5Ono2TWsuLi4ifQ.signature',
      vcVerification: {
        verified: true,
        issuer: 'did:key:z6Mk...',
        issuanceDate: new Date('2024-01-01'),
        errors: [],
          warnings: [],
          payload: {
            vc: {
              '@context': ['https://www.w3.org/ns/credentials/v2'],
              type: ['VerifiableCredential'],
              credentialSubject: {
                '@type': 'DigitalProductPassport',
                product: { identifier: 'TEST-001', name: 'Test Product' },
              chainAnchor: {
                issuerAccount: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
              },
            },
          },
        },
      },
      hashMatches: true,
      issuerMatches: true,
      schemaValid: true,
      schemaValidation: {
        valid: true,
        schemaMeta: {
          url: 'https://test.uncefact.org/vocabulary/untp/dpp/untp-dpp-schema-0.6.1.json',
          sha256: 'abc123...',
          size: 50000,
          fetchedAt: new Date(),
        },
      },
      dpp: {
        '@type': 'DigitalProductPassport',
        product: { identifier: 'TEST-001', name: 'Test Product' },
      },
    });

    (createDppService as jest.Mock).mockReturnValue({
      verifyPassport: mockVerifyPassport,
    });

    const request = new NextRequest('http://localhost:3000/api/passport/verify', {
      method: 'POST',
      body: JSON.stringify({ tokenId: '1' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.valid).toBe(true);
    expect(data.checks.passportExists.passed).toBe(true);
    expect(data.checks.notRevoked.passed).toBe(true);
    expect(data.checks.datasetRetrieved.passed).toBe(true);
    expect(data.checks.hashMatches.passed).toBe(true);
    expect(data.checks.issuerMatches.passed).toBe(true);
    expect(data.checks.vcSignature.passed).toBe(true);
    expect(data.checks.schemaValid.passed).toBe(true);
    expect(data.onChainData).toBeDefined();
    expect(data.vcData.jwt).toBeDefined();
    expect(data.vcData.payload).toBeDefined();
    expect(data.dppData).toBeDefined();
    expect(data.schemaValidation).toBeDefined();
  });

  it('should return 404 for non-existent passport', async () => {
    const mockVerifyPassport = jest.fn().mockRejectedValue(
      new Error('Passport 999 not found')
    );

    (createDppService as jest.Mock).mockReturnValue({
      verifyPassport: mockVerifyPassport,
    });

    const request = new NextRequest('http://localhost:3000/api/passport/verify', {
      method: 'POST',
      body: JSON.stringify({ tokenId: '999' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.valid).toBe(false);
    expect(data.message).toContain('not found');
  });

  it('should decode VC payload as fallback when verification fails', async () => {
    const mockVcJwt = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.' + // header
                      'eyJpc3MiOiJkaWQ6a2V5Ono2TWsuLi4iLCJ2YyI6eyJjcmVkZW50aWFsU3ViamVjdCI6eyJwcm9kdWN0Ijp7ImlkIjoiVEVTVC0wMDEifX19fQ.' + // payload (base64url encoded)
                      'invalid-signature'; // invalid signature

    const mockVerifyPassport = jest.fn().mockResolvedValue({
      valid: false,
      onChainData: {
        tokenId: '1',
        issuer: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
        datasetUri: 'ipfs://bafkreitest',
        payloadHash: '0x123abc...',
        datasetType: 'application/vc+jwt',
        status: 'Active',
        version: 1,
        createdAt: 12345,
        updatedAt: 12345,
      },
      vcJwt: mockVcJwt,
      vcVerification: {
        verified: false,
        issuer: '',
        issuanceDate: new Date(),
        errors: ['Signature verification failed'],
        warnings: [],
        // No payload because verification failed
      },
      hashMatches: true,
      issuerMatches: false,
      schemaValid: false,
    });

    (createDppService as jest.Mock).mockReturnValue({
      verifyPassport: mockVerifyPassport,
    });

    const request = new NextRequest('http://localhost:3000/api/passport/verify', {
      method: 'POST',
      body: JSON.stringify({ tokenId: '1' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.valid).toBe(false);
    expect(data.checks.vcSignature.passed).toBe(false);
    expect(data.vcData.jwt).toBe(mockVcJwt);
    // Should have decoded payload via fallback
    expect(data.vcData.payload).toBeDefined();
  });
});

describe('GET /api/passport/verify', () => {
  it('should return health check info', async () => {
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.message).toContain('available');
    expect(data.endpoint).toBe('/api/passport/verify');
    expect(data.method).toBe('POST');
  });
});
