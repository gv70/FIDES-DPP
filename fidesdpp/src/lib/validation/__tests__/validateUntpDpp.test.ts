/**
 * UNTP DPP Validator Tests
 * 
 * Tests validation logic with mocked schema fetch
 * 
 * @license Apache-2.0
 */

import { validateUntpDpp, formatValidationErrors, clearValidatorCache } from '../validateUntpDpp';
import { clearSchemaCache } from '../untpSchema';

// Mock minimal UNTP schema for testing (Draft 2020-12 compatible)
const mockUntpSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://test.example.com/mock-untp-schema.json',
  type: 'object',
  required: ['@context', 'type', 'issuer', 'credentialSubject'],
  properties: {
    '@context': {
      type: 'array',
      minItems: 2,
      prefixItems: [
        { const: 'https://www.w3.org/ns/credentials/v2' },
        { const: 'https://test.uncefact.org/vocabulary/untp/dpp/0.6.0/' },
      ],
    },
    type: {
      type: 'array',
      contains: { const: 'VerifiableCredential' },
    },
    id: {
      type: 'string',
      format: 'uri',
    },
    issuer: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
      },
    },
    credentialSubject: {
      type: 'object',
      required: ['type', 'product'],
      properties: {
        type: { type: 'array' },
        product: {
          type: 'array',
          items: {
            type: 'object',
            required: ['name', 'id'],
            properties: {
              name: { type: 'string' },
              id: { type: 'string' },
            },
          },
        },
      },
    },
  },
};

// Mock fetch globally
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

describe('validateUntpDpp', () => {
  beforeEach(() => {
    // Clear caches before each test
    clearSchemaCache();
    clearValidatorCache();
    mockFetch.mockClear();
  });

  const validPayload = {
    '@context': [
      'https://www.w3.org/ns/credentials/v2',
      'https://test.uncefact.org/vocabulary/untp/dpp/0.6.0/',
    ],
    type: ['VerifiableCredential', 'DigitalProductPassport'],
    id: 'https://example.com/credentials/123',
    issuer: {
      id: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
      name: 'Test Issuer',
    },
    credentialSubject: {
      type: ['ProductPassport'],
      product: [
        {
          name: 'Test Product',
          id: 'https://id.gs1.org/01/09520123456788',
        },
      ],
    },
  };

  function mockSchemaResponse() {
    const schemaText = JSON.stringify(mockUntpSchema);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Map([['content-length', String(schemaText.length)]]),
      text: async () => schemaText,
    });
  }

  it('should validate a correct UNTP DPP payload', async () => {
    mockSchemaResponse();

    const result = await validateUntpDpp(validPayload);

    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined();
    expect(result.schemaMeta).toBeDefined();
    expect(result.schemaMeta.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should detect missing required fields', async () => {
    mockSchemaResponse();

    const invalidPayload = {
      '@context': ['https://www.w3.org/ns/credentials/v2'],
      type: ['VerifiableCredential'],
      // Missing: issuer, credentialSubject
    };

    const result = await validateUntpDpp(invalidPayload);

    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
    
    // Check that errors include missing fields
    const errorKeywords = result.errors!.map(e => e.keyword);
    expect(errorKeywords).toContain('required');
  });

  it('should detect invalid product structure', async () => {
    mockSchemaResponse();

    const invalidPayload = {
      ...validPayload,
      credentialSubject: {
        type: ['ProductPassport'],
        product: [
          {
            // Missing required 'name' and 'id'
            description: 'Some description',
          },
        ],
      },
    };

    const result = await validateUntpDpp(invalidPayload);

    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.some(e => e.keyword === 'required')).toBe(true);
  });

  it('should detect invalid @context', async () => {
    mockSchemaResponse();

    const invalidPayload = {
      ...validPayload,
      '@context': ['https://www.w3.org/2018/credentials/v1'], // Wrong context
    };

    const result = await validateUntpDpp(invalidPayload);

    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    // Should fail on const or minItems
    expect(result.errors!.some(e => e.keyword === 'const' || e.keyword === 'minItems')).toBe(true);
  });

  it('should detect type errors', async () => {
    mockSchemaResponse();

    const invalidPayload = {
      ...validPayload,
      issuer: 'not-an-object', // Should be object
    };

    const result = await validateUntpDpp(invalidPayload);

    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.some(e => e.keyword === 'type')).toBe(true);
  });

  it('should cache schema and validator after first validation', async () => {
    mockSchemaResponse();

    // First validation - should fetch schema
    await validateUntpDpp(validPayload);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Second validation - should use cached schema and validator
    const result = await validateUntpDpp(validPayload);
    expect(mockFetch).toHaveBeenCalledTimes(1); // Still 1 - no new fetch
    expect(result.valid).toBe(true);
  });

  it('should handle schema load errors gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    await expect(validateUntpDpp(validPayload)).rejects.toThrow('Failed to load UNTP schema');
  });

  it('should validate against custom schema URL', async () => {
    const customUrl = 'https://custom.example.com/schema.json';
    const schemaText = JSON.stringify(mockUntpSchema);
    
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Map([['content-length', String(schemaText.length)]]),
      text: async () => schemaText,
    });

    const result = await validateUntpDpp(validPayload, { schemaUrl: customUrl });

    expect(result.valid).toBe(true);
    expect(result.schemaMeta.url).toBe(customUrl);
  });
});

describe('formatValidationErrors', () => {
  it('should format required field errors', () => {
    const errors = [
      {
        instancePath: '/credentialSubject/product',
        schemaPath: '#/properties/credentialSubject/properties/product/required',
        keyword: 'required',
        message: 'must have required property "name"',
        params: { missingProperty: 'name' },
      },
    ];

    const formatted = formatValidationErrors(errors);
    expect(formatted).toContain('missing required property "name"');
    expect(formatted).toContain('/credentialSubject/product');
  });

  it('should format type errors', () => {
    const errors = [
      {
        instancePath: '/issuer',
        schemaPath: '#/properties/issuer/type',
        keyword: 'type',
        message: 'must be string',
        params: { type: 'string' },
      },
    ];

    const formatted = formatValidationErrors(errors);
    expect(formatted).toContain('invalid type');
    expect(formatted).toContain('expected string');
    expect(formatted).toContain('/issuer');
  });

  it('should format const errors', () => {
    const errors = [
      {
        instancePath: '/@context/0',
        schemaPath: '#/properties/@context/prefixItems/0/const',
        keyword: 'const',
        message: 'must be equal to constant',
        params: { allowedValue: 'https://www.w3.org/ns/credentials/v2' },
      },
    ];

    const formatted = formatValidationErrors(errors);
    expect(formatted).toContain('must be equal to constant');
    expect(formatted).toContain('https://www.w3.org/ns/credentials/v2');
  });

  it('should format enum errors', () => {
    const errors = [
      {
        instancePath: '/status',
        schemaPath: '#/properties/status/enum',
        keyword: 'enum',
        message: 'must be equal to one of the allowed values',
        params: { allowedValues: ['active', 'suspended', 'revoked'] },
      },
    ];

    const formatted = formatValidationErrors(errors);
    expect(formatted).toContain('value not in allowed values');
    expect(formatted).toContain('active, suspended, revoked');
  });

  it('should limit error count to 10', () => {
    const errors = Array.from({ length: 20 }, (_, i) => ({
      instancePath: `/field${i}`,
      schemaPath: '#/properties/field',
      keyword: 'required',
      message: 'error',
      params: { missingProperty: `field${i}` },
    }));

    const formatted = formatValidationErrors(errors);
    const lines = formatted.split('\n');
    
    expect(lines.length).toBe(11); // 10 errors + "... and X more" line
    expect(formatted).toContain('and 10 more error(s)');
  });

  it('should handle empty errors array', () => {
    const formatted = formatValidationErrors([]);
    expect(formatted).toBe('No errors');
  });

  it('should handle undefined errors', () => {
    const formatted = formatValidationErrors(undefined);
    expect(formatted).toBe('No errors');
  });

  it('should handle generic errors', () => {
    const errors = [
      {
        instancePath: '/some/path',
        schemaPath: '#/some/schema/path',
        keyword: 'customKeyword',
        message: 'Some custom validation failed',
        params: {},
      },
    ];

    const formatted = formatValidationErrors(errors);
    expect(formatted).toContain('Some custom validation failed');
    expect(formatted).toContain('/some/path');
  });
});

describe('clearValidatorCache', () => {
  it('should clear validator cache', async () => {
    const schemaText = JSON.stringify(mockUntpSchema);
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-length', String(schemaText.length)]]),
      text: async () => schemaText,
    });

    const validPayload = {
      '@context': [
        'https://www.w3.org/ns/credentials/v2',
        'https://test.uncefact.org/vocabulary/untp/dpp/0.6.0/',
      ],
      type: ['VerifiableCredential'],
      issuer: { id: 'did:key:test', name: 'Test' },
      credentialSubject: {
        type: ['ProductPassport'],
        product: [{ name: 'Test', id: 'test-id' }],
      },
    };

    // Load and compile validator
    await validateUntpDpp(validPayload);

    // Clear validator cache (but not schema cache)
    clearValidatorCache();

    // Next validation should reuse schema but recompile validator
    // This is hard to test directly, but we can verify it doesn't throw
    const result = await validateUntpDpp(validPayload);
    expect(result).toBeDefined();
  });
});
