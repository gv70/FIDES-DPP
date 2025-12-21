/**
 * Tests for DppApplicationService
 * 
 * @license Apache-2.0
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { DppApplicationService } from '../DppApplicationService';
import type { VcEngine } from '../../vc/VcEngine';
import type { IpfsStorageBackend } from '../../ipfs/IpfsStorageBackend';
import type { ChainAdapter } from '../../chain/ChainAdapter';
import type { CreatePassportInput } from '../types';
import { computeJwtHash } from '../../ipfs/IpfsStorageBackend';

describe('DppApplicationService', () => {
  let service: DppApplicationService;
  let mockVcEngine: jest.Mocked<VcEngine>;
  let mockStorage: jest.Mocked<IpfsStorageBackend>;
  let mockChain: jest.Mocked<ChainAdapter>;

  beforeEach(() => {
    // Create mock VcEngine
    mockVcEngine = {
      issueDppVc: jest.fn(),
      verifyDppVc: jest.fn(),
      decodeVc: jest.fn(),
      extractDpp: jest.fn(),
    } as any;

    // Create mock Storage
    mockStorage = {
      uploadJson: jest.fn(),
      retrieveJson: jest.fn(),
      uploadText: jest.fn(), // For VC-JWT storage (v0.2)
      retrieveText: jest.fn(), // For VC-JWT retrieval (v0.2)
      getGatewayUrl: jest.fn(),
      isAvailable: jest.fn(),
      getBackendType: jest.fn(),
    } as any;

    // Create mock Chain Adapter
    mockChain = {
      registerPassport: jest.fn(),
      readPassport: jest.fn(),
      updateDataset: jest.fn(),
      revokePassport: jest.fn(),
      waitForTransaction: jest.fn(),
      subscribeToEvents: jest.fn(),
      hasAuthority: jest.fn(),
    } as any;

    service = new DppApplicationService(mockVcEngine, mockStorage, mockChain);
  });

  describe('createPassport', () => {
    const mockInput: CreatePassportInput = {
      granularity: 'ProductClass',
      productId: 'TEST-001',
      productName: 'Test Product',
      productDescription: 'Test Description',
      manufacturer: {
        name: 'Test Manufacturer',
        country: 'US',
      },
    };

    const mockAccount = {
      address: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
      publicKey: new Uint8Array(32),
      sign: async () => new Uint8Array(64),
      network: 'westend-asset-hub',
    };

    it('should orchestrate complete creation flow', async () => {
      // Setup mocks
      mockVcEngine.issueDppVc.mockResolvedValue({
        jwt: 'mock-jwt',
        payload: { iss: 'did:key:mock', vc: {} } as any,
        header: { alg: 'EdDSA', typ: 'JWT' },
      });

      mockStorage.uploadText.mockResolvedValue({
        cid: 'mock-cid',
        hash: '0xstoragehash',
        gatewayUrl: 'https://ipfs.io/ipfs/mock-cid',
        size: 1234,
      });

      mockChain.registerPassport.mockResolvedValue({
        tokenId: '1',
        txHash: '0xtxhash',
        blockNumber: 12345,
      });

      mockChain.waitForTransaction.mockResolvedValue();

      // Execute
      const result = await service.createPassport(mockInput, mockAccount);

      // Verify orchestration
      expect(mockVcEngine.issueDppVc).toHaveBeenCalledWith(
        expect.objectContaining({
          product: expect.objectContaining({
            identifier: 'TEST-001',
            name: 'Test Product',
          }),
        }),
        mockAccount
      );

      expect(mockStorage.uploadText).toHaveBeenCalledWith(
        'mock-jwt',
        expect.any(Object)
      );

      expect(mockChain.registerPassport).toHaveBeenCalledWith(
        expect.objectContaining({
          datasetUri: 'ipfs://mock-cid',
          payloadHash: computeJwtHash('mock-jwt'),
          datasetType: 'application/vc+jwt',
        }),
        mockAccount
      );

      expect(result.tokenId).toBe('1');
      expect(result.cid).toBe('mock-cid');
      expect(result.vcJwt).toBe('mock-jwt');
      expect(result.txHash).toBe('0xtxhash');
      expect(result.blockNumber).toBe(12345);
      expect(result.granularity).toBe('ProductClass');
      expect(typeof result.subjectIdHash).toBe('string');
    });

    it('should map input to UNTP DPP structure', async () => {
      mockVcEngine.issueDppVc.mockResolvedValue({
        jwt: 'jwt',
        payload: {} as any,
        header: {} as any,
      });
      mockStorage.uploadText.mockResolvedValue({ cid: 'cid', hash: '0xhash', gatewayUrl: 'url', size: 1 } as any);
      mockChain.registerPassport.mockResolvedValue({} as any);
      mockChain.waitForTransaction.mockResolvedValue();

      await service.createPassport(mockInput, mockAccount);

      const dppArg = mockVcEngine.issueDppVc.mock.calls[0][0];
      
      expect(dppArg['@type']).toBe('DigitalProductPassport');
      expect(dppArg.product?.['@type']).toBe('Product');
      expect(dppArg.manufacturer?.['@type']).toBe('Organization');
    });
  });

  describe('verifyPassport', () => {
    it('should verify revoked passport', async () => {
      mockChain.readPassport.mockResolvedValue({
        tokenId: '1',
        issuer: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
        datasetUri: 'ipfs://cid',
        payloadHash: '0xhash',
        status: 'Revoked',
        version: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const report = await service.verifyPassport('1');

      expect(report.valid).toBe(false);
      expect(report.reason).toContain('revoked');
      expect(mockStorage.retrieveText).not.toHaveBeenCalled();
    });

    it('should orchestrate complete verification flow', async () => {
      const mockOnChainData = {
        tokenId: '1',
        issuer: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
        datasetUri: 'ipfs://mock-cid',
        payloadHash: computeJwtHash('mock-jwt'),
        status: 'Active' as const,
        version: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      mockChain.readPassport.mockResolvedValue(mockOnChainData);

      mockStorage.retrieveText.mockResolvedValue({
        data: 'mock-jwt',
        hash: computeJwtHash('mock-jwt'),
        cid: 'mock-cid',
      } as any);

      mockVcEngine.verifyDppVc.mockResolvedValue({
        verified: true,
        issuer: 'did:key:mock',
        issuanceDate: new Date(),
        errors: [],
        warnings: [],
        payload: {
          vc: {
            credentialSubject: {
              chainAnchor: {
                issuerAccount: mockOnChainData.issuer,
              },
            },
          },
        },
      });

      mockVcEngine.decodeVc.mockReturnValue({
        jwt: 'mock-jwt',
        header: { alg: 'EdDSA', typ: 'JWT' } as any,
        payload: { vc: {} } as any,
      });
      mockVcEngine.extractDpp.mockReturnValue({
        '@type': 'DigitalProductPassport',
        product: { identifier: 'TEST-001', name: 'Test Product' },
      } as any);

      const report = await service.verifyPassport('1');

      expect(report.valid).toBe(true);
      expect(report.hashMatches).toBe(true);
      expect(report.issuerMatches).toBe(true);
    });
  });
});
