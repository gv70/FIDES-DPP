/**
 * UNTP Schema Loader with Caching
 * 
 * Fetches and caches UNTP DPP JSON Schema from remote URL.
 * Does NOT vendor the schema to maintain Apache 2.0 license compliance
 * (UNTP schema is GPL v3).
 * 
 * Server-side only - do not import in client components.
 * 
 * @license Apache-2.0
 */

// Server-only protection (commented for test compatibility)
// Uncomment in production builds to prevent client bundling
// import 'server-only';

import crypto from 'crypto';

/**
 * Custom error class for schema loading failures
 */
export class SchemaLoadError extends Error {
  constructor(
    public code: 'NETWORK_ERROR' | 'INVALID_JSON' | 'SHA256_MISMATCH' | 'SIZE_LIMIT_EXCEEDED' | 'TIMEOUT',
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'SchemaLoadError';
    Object.setPrototypeOf(this, SchemaLoadError.prototype);
  }
}

export interface SchemaMetadata {
  url: string;
  fetchedAt: Date;
  sha256: string;
  size: number;
}

export interface LoadSchemaResult {
  schema: unknown;
  meta: SchemaMetadata;
}

/**
 * Configuration for schema loading
 */
export interface SchemaLoaderConfig {
  /** Schema URL (default: UNTP DPP working schema) */
  url?: string;
  /** Expected SHA-256 hash for pinning (optional) */
  expectedSha256?: string;
  /** Cache TTL in milliseconds (default: 24 hours) */
  cacheTtlMs?: number;
  /** Max schema size in bytes (default: 5 MB) */
  maxSizeBytes?: number;
  /** Fetch timeout in milliseconds (default: 10 seconds) */
  timeoutMs?: number;
}

/**
 * Cached schema entry
 */
interface CachedSchema {
  schema: unknown;
  meta: SchemaMetadata;
  expiresAt: number;
}

/**
 * In-memory schema cache
 * Key: schema URL
 */
const schemaCache = new Map<string, CachedSchema>();

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<SchemaLoaderConfig> = {
  url: process.env.UNTP_SCHEMA_URL || 
       'https://test.uncefact.org/vocabulary/untp/dpp/untp-dpp-schema-0.6.0.json',
  expectedSha256: process.env.UNTP_SCHEMA_SHA256 || '',
  cacheTtlMs: parseInt(process.env.UNTP_SCHEMA_CACHE_TTL_MS || '86400000', 10), // 24 hours
  maxSizeBytes: 5 * 1024 * 1024, // 5 MB
  timeoutMs: 10_000, // 10 seconds
};

/**
 * Load UNTP schema from remote URL with caching
 * 
 * Why remote fetch? The UNTP specification is GPL v3, incompatible with Apache 2.0.
 * Fetching at runtime maintains license compliance without vendoring GPL code.
 * 
 * @param config - Optional configuration override
 * @returns Schema and metadata
 * @throws {SchemaLoadError} If schema cannot be loaded or validated
 * 
 * @example
 * ```typescript
 * try {
 *   const { schema, meta } = await loadUntpSchema();
 *   console.log(`Loaded schema from ${meta.url}, SHA-256: ${meta.sha256}`);
 * } catch (error) {
 *   if (error instanceof SchemaLoadError) {
 *     console.error(`Schema load failed: ${error.code} - ${error.message}`);
 *   }
 * }
 * ```
 */
export async function loadUntpSchema(
  config?: SchemaLoaderConfig
): Promise<LoadSchemaResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // 1. Check cache
  const cached = schemaCache.get(cfg.url);
  if (cached && Date.now() < cached.expiresAt) {
    return {
      schema: cached.schema,
      meta: cached.meta,
    };
  }

  // 2. Fetch schema
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), cfg.timeoutMs);

  try {
    let response: Response;
    try {
      response = await fetch(cfg.url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'FIDES-DPP/0.2 (Apache-2.0; UNTP-compliant)',
        },
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new SchemaLoadError(
        'NETWORK_ERROR',
        `Failed to fetch schema: HTTP ${response.status} ${response.statusText}`,
        { status: response.status, statusText: response.statusText }
      );
    }

    // 3. Check content length
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > cfg.maxSizeBytes) {
      throw new SchemaLoadError(
        'SIZE_LIMIT_EXCEEDED',
        `Schema size (${contentLength} bytes) exceeds limit (${cfg.maxSizeBytes} bytes)`,
        { size: parseInt(contentLength, 10), limit: cfg.maxSizeBytes }
      );
    }

    // 4. Read response body
    const schemaText = await response.text();

    // Check size after reading
    const actualSize = Buffer.byteLength(schemaText, 'utf8');
    if (actualSize > cfg.maxSizeBytes) {
      throw new SchemaLoadError(
        'SIZE_LIMIT_EXCEEDED',
        `Schema size (${actualSize} bytes) exceeds limit (${cfg.maxSizeBytes} bytes)`,
        { size: actualSize, limit: cfg.maxSizeBytes }
      );
    }

    // 5. Compute SHA-256
    const sha256 = crypto.createHash('sha256').update(schemaText, 'utf8').digest('hex');

    // 6. Verify SHA-256 if pinning is enabled
    if (cfg.expectedSha256 && cfg.expectedSha256.toLowerCase() !== sha256.toLowerCase()) {
      throw new SchemaLoadError(
        'SHA256_MISMATCH',
        `Schema SHA-256 mismatch. Expected: ${cfg.expectedSha256}, Got: ${sha256}`,
        { expected: cfg.expectedSha256, actual: sha256 }
      );
    }

    // 7. Parse JSON
    let schema: unknown;
    try {
      schema = JSON.parse(schemaText);
    } catch (parseError: any) {
      throw new SchemaLoadError(
        'INVALID_JSON',
        `Failed to parse schema JSON: ${parseError.message}`,
        parseError
      );
    }

    // 8. Create metadata
    const meta: SchemaMetadata = {
      url: cfg.url,
      fetchedAt: new Date(),
      sha256,
      size: actualSize,
    };

    // 9. Cache
    schemaCache.set(cfg.url, {
      schema,
      meta,
      expiresAt: Date.now() + cfg.cacheTtlMs,
    });

    return { schema, meta };

  } catch (error: any) {
    // Handle AbortController timeout
    if (error.name === 'AbortError') {
      throw new SchemaLoadError(
        'TIMEOUT',
        `Schema fetch timeout after ${cfg.timeoutMs}ms`,
        { timeoutMs: cfg.timeoutMs }
      );
    }

    // Re-throw SchemaLoadError as-is
    if (error instanceof SchemaLoadError) {
      throw error;
    }

    // Wrap other errors
    throw new SchemaLoadError(
      'NETWORK_ERROR',
      `Unexpected error loading schema: ${error.message}`,
      error
    );
  }
}

/**
 * Clear schema cache (useful for testing or forcing refresh)
 * 
 * @param url - Optional URL to clear specific entry, or clear all if omitted
 */
export function clearSchemaCache(url?: string): void {
  if (url) {
    schemaCache.delete(url);
  } else {
    schemaCache.clear();
  }
}

/**
 * Get cache statistics
 * 
 * @returns Cache statistics including entry count, URLs, and sizes
 */
export function getCacheStats(): {
  entries: number;
  urls: string[];
  sizes: Record<string, number>;
} {
  const urls = Array.from(schemaCache.keys());
  const sizes: Record<string, number> = {};
  
  urls.forEach(url => {
    const cached = schemaCache.get(url);
    if (cached) {
      sizes[url] = cached.meta.size;
    }
  });

  return {
    entries: schemaCache.size,
    urls,
    sizes,
  };
}
