/**
 * IPFS Storage Factory
 *
 * Creates the appropriate IPFS backend based on configuration.
 * This factory pattern supports a swappable backend design:
 * - FOSS backends (Kubo, Helia) for open-source-only operation
 * - Optional SaaS backends (Pinata) for convenience
 *
 * Configuration priority:
 * 1. Explicit config parameter
 * 2. Environment variables (IPFS_BACKEND, etc.)
 * 3. Default: 'kubo' (FOSS primary)
 *
 * @license Apache-2.0
 */
import type { IpfsStorageBackend, IpfsConfig } from './IpfsStorageBackend';
export type BackendType = 'kubo' | 'helia' | 'pinata';
/**
 * Create an IPFS storage backend based on configuration
 *
 * @param config - Optional configuration (defaults to environment variables)
 * @returns Configured IPFS backend instance
 * @throws Error if backend type is unknown or configuration is invalid
 *
 * @example
 * // Use Kubo (default FOSS option)
 * const backend = createIpfsBackend();
 *
 * @example
 * // Use Helia (lightweight FOSS option)
 * const backend = createIpfsBackend({ backend: 'helia' });
 *
 * @example
 * // Use Pinata (optional SaaS)
 * const backend = createIpfsBackend({ backend: 'pinata', accessToken: 'jwt...' });
 */
export declare function createIpfsBackend(config?: IpfsConfig): IpfsStorageBackend;
/**
 * Check if a backend is available/configured
 *
 * @param backendType - Backend type to check
 * @param config - Optional configuration
 * @returns true if backend is available, false otherwise
 */
export declare function isBackendAvailable(backendType: BackendType, config?: IpfsConfig): Promise<boolean>;
/**
 * Get recommended backend for current environment
 * Checks availability in order: kubo -> pinata
 * Note: Helia is skipped as it's incompatible with Next.js/Turbopack builds
 *
 * @param config - Optional configuration
 * @returns Recommended backend type
 */
export declare function getRecommendedBackend(config?: IpfsConfig): Promise<BackendType>;
/**
 * Validate backend configuration
 *
 * @param config - Configuration to validate
 * @throws Error if configuration is invalid
 */
export declare function validateBackendConfig(config: IpfsConfig): void;
/**
 * Get backend configuration from environment variables
 *
 * @returns Configuration object from environment
 */
export declare function getBackendConfigFromEnv(): IpfsConfig;
//# sourceMappingURL=IpfsStorageFactory.d.ts.map
