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
/**
 * Custom error class for schema loading failures
 */
export declare class SchemaLoadError extends Error {
    code: 'NETWORK_ERROR' | 'INVALID_JSON' | 'SHA256_MISMATCH' | 'SIZE_LIMIT_EXCEEDED' | 'TIMEOUT';
    details?: unknown | undefined;
    constructor(code: 'NETWORK_ERROR' | 'INVALID_JSON' | 'SHA256_MISMATCH' | 'SIZE_LIMIT_EXCEEDED' | 'TIMEOUT', message: string, details?: unknown | undefined);
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
export declare function loadUntpSchema(config?: SchemaLoaderConfig): Promise<LoadSchemaResult>;
/**
 * Clear schema cache (useful for testing or forcing refresh)
 *
 * @param url - Optional URL to clear specific entry, or clear all if omitted
 */
export declare function clearSchemaCache(url?: string): void;
/**
 * Get cache statistics
 *
 * @returns Cache statistics including entry count, URLs, and sizes
 */
export declare function getCacheStats(): {
    entries: number;
    urls: string[];
    sizes: Record<string, number>;
};
//# sourceMappingURL=untpSchema.d.ts.map