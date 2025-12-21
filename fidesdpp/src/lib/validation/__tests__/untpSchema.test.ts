/**
 * UNTP Schema Loader Tests
 * 
 * Tests schema loading, caching, and error handling with mocked fetch
 * 
 * @license Apache-2.0
 */

import { loadUntpSchema, clearSchemaCache, getCacheStats, SchemaLoadError } from '../untpSchema';

// Mock minimal UNTP schema for testing
const mockUntpSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://test.example.com/mock-untp-schema.json',
  type: 'object',
  required: ['@context', 'type', 'issuer'],
  properties: {
    '@context': { type: 'array' },
    type: { type: 'array' },
    issuer: { type: 'object' },
  },
};

// Mock fetch globally
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

describe('loadUntpSchema', () => {
  const mockSchemaUrl = 'https://test.example.com/schema.json';
  
  beforeEach(() => {
    clearSchemaCache();
    mockFetch.mockClear();
    jest.clearAllTimers();
  });

  it('should load schema successfully', async () => {
    const schemaText = JSON.stringify(mockUntpSchema);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Map([['content-length', String(schemaText.length)]]),
      text: async () => schemaText,
    });

    const result = await loadUntpSchema({ url: mockSchemaUrl });

    expect(result.schema).toEqual(mockUntpSchema);
    expect(result.meta.url).toBe(mockSchemaUrl);
    expect(result.meta.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.meta.size).toBeGreaterThan(0);
    expect(result.meta.fetchedAt).toBeInstanceOf(Date);
  });

  it('should cache schema and not refetch', async () => {
    const schemaText = JSON.stringify(mockUntpSchema);
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-length', String(schemaText.length)]]),
      text: async () => schemaText,
    });

    // First call - should fetch
    await loadUntpSchema({ url: mockSchemaUrl });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Second call - should use cache
    await loadUntpSchema({ url: mockSchemaUrl });
    expect(mockFetch).toHaveBeenCalledTimes(1); // Still 1 - no new fetch

    // Verify cache stats
    const stats = getCacheStats();
    expect(stats.entries).toBe(1);
    expect(stats.urls).toContain(mockSchemaUrl);
  });

  it('should refetch after cache expires', async () => {
    const schemaText = JSON.stringify(mockUntpSchema);
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-length', String(schemaText.length)]]),
      text: async () => schemaText,
    });

    // First call with very short TTL (1ms)
    await loadUntpSchema({ url: mockSchemaUrl, cacheTtlMs: 1 });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Wait for cache to expire
    await new Promise(resolve => setTimeout(resolve, 10));

    // Second call - cache expired, should refetch
    await loadUntpSchema({ url: mockSchemaUrl, cacheTtlMs: 1 });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should throw SchemaLoadError on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network unreachable'));

    await expect(
      loadUntpSchema({ url: mockSchemaUrl })
    ).rejects.toThrow(SchemaLoadError);

    try {
      await loadUntpSchema({ url: mockSchemaUrl });
    } catch (error: any) {
      expect(error).toBeInstanceOf(SchemaLoadError);
      expect(error.code).toBe('NETWORK_ERROR');
      expect(error.message).toContain('Network unreachable');
    }
  });

  it('should throw SchemaLoadError on non-200 status', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: new Map(),
    });

    await expect(
      loadUntpSchema({ url: mockSchemaUrl })
    ).rejects.toThrow(SchemaLoadError);

    try {
      await loadUntpSchema({ url: mockSchemaUrl });
    } catch (error: any) {
      expect(error).toBeInstanceOf(SchemaLoadError);
      expect(error.code).toBe('NETWORK_ERROR');
      expect(error.message).toContain('404');
    }
  });

  it('should throw SchemaLoadError on invalid JSON', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Map(),
      text: async () => 'not valid json {{{',
    });

    await expect(
      loadUntpSchema({ url: mockSchemaUrl })
    ).rejects.toThrow(SchemaLoadError);

    try {
      await loadUntpSchema({ url: mockSchemaUrl });
    } catch (error: any) {
      expect(error).toBeInstanceOf(SchemaLoadError);
      expect(error.code).toBe('INVALID_JSON');
    }
  });

  it('should throw SchemaLoadError if size exceeds limit', async () => {
    const largeSchema = JSON.stringify({ ...mockUntpSchema, data: 'x'.repeat(10000) });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Map(),
      text: async () => largeSchema,
    });

    await expect(
      loadUntpSchema({ url: mockSchemaUrl, maxSizeBytes: 100 })
    ).rejects.toThrow(SchemaLoadError);

    try {
      await loadUntpSchema({ url: mockSchemaUrl, maxSizeBytes: 100 });
    } catch (error: any) {
      expect(error).toBeInstanceOf(SchemaLoadError);
      expect(error.code).toBe('SIZE_LIMIT_EXCEEDED');
    }
  });

  it('should throw SchemaLoadError on SHA-256 mismatch', async () => {
    const schemaText = JSON.stringify(mockUntpSchema);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Map([['content-length', String(schemaText.length)]]),
      text: async () => schemaText,
    });

    await expect(
      loadUntpSchema({ 
        url: mockSchemaUrl,
        expectedSha256: 'wrong_hash_12345'
      })
    ).rejects.toThrow(SchemaLoadError);

    try {
      await loadUntpSchema({ 
        url: mockSchemaUrl,
        expectedSha256: 'wrong_hash_12345'
      });
    } catch (error: any) {
      expect(error).toBeInstanceOf(SchemaLoadError);
      expect(error.code).toBe('SHA256_MISMATCH');
      expect(error.details).toHaveProperty('expected');
      expect(error.details).toHaveProperty('actual');
    }
  });

  it('should accept correct SHA-256 hash', async () => {
    const schemaText = JSON.stringify(mockUntpSchema);
    const crypto = require('crypto');
    const expectedHash = crypto.createHash('sha256').update(schemaText, 'utf8').digest('hex');

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Map([['content-length', String(schemaText.length)]]),
      text: async () => schemaText,
    });

    const result = await loadUntpSchema({ 
      url: mockSchemaUrl,
      expectedSha256: expectedHash
    });

    expect(result.meta.sha256).toBe(expectedHash);
  });

  it('should throw SchemaLoadError on timeout', async () => {
    // Mock a fetch that respects AbortController (rejects with AbortError)
    mockFetch.mockImplementationOnce((_url: any, init: any) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener?.('abort', () => {
          const err = new Error('Aborted');
          (err as any).name = 'AbortError';
          reject(err);
        });
      });
    });

    await expect(loadUntpSchema({
      url: mockSchemaUrl,
      timeoutMs: 100,
    })).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
  });
});

describe('clearSchemaCache', () => {
  beforeEach(() => {
    clearSchemaCache();
  });

  it('should clear entire cache when no URL provided', async () => {
    const schemaText = JSON.stringify(mockUntpSchema);
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-length', String(schemaText.length)]]),
      text: async () => schemaText,
    });

    // Load two schemas
    await loadUntpSchema({ url: 'https://example.com/schema1.json' });
    await loadUntpSchema({ url: 'https://example.com/schema2.json' });

    expect(getCacheStats().entries).toBe(2);

    // Clear all
    clearSchemaCache();

    expect(getCacheStats().entries).toBe(0);
  });

  it('should clear specific URL when provided', async () => {
    const schemaText = JSON.stringify(mockUntpSchema);
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-length', String(schemaText.length)]]),
      text: async () => schemaText,
    });

    const url1 = 'https://example.com/schema1.json';
    const url2 = 'https://example.com/schema2.json';

    // Load two schemas
    await loadUntpSchema({ url: url1 });
    await loadUntpSchema({ url: url2 });

    expect(getCacheStats().entries).toBe(2);

    // Clear only url1
    clearSchemaCache(url1);

    const stats = getCacheStats();
    expect(stats.entries).toBe(1);
    expect(stats.urls).toContain(url2);
    expect(stats.urls).not.toContain(url1);
  });
});

describe('getCacheStats', () => {
  beforeEach(() => {
    clearSchemaCache();
  });

  it('should return accurate cache statistics', async () => {
    const schemaText = JSON.stringify(mockUntpSchema);
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-length', String(schemaText.length)]]),
      text: async () => schemaText,
    });

    const url1 = 'https://example.com/schema1.json';
    const url2 = 'https://example.com/schema2.json';

    await loadUntpSchema({ url: url1 });
    await loadUntpSchema({ url: url2 });

    const stats = getCacheStats();

    expect(stats.entries).toBe(2);
    expect(stats.urls).toEqual(expect.arrayContaining([url1, url2]));
    expect(stats.sizes[url1]).toBeGreaterThan(0);
    expect(stats.sizes[url2]).toBeGreaterThan(0);
  });
});
