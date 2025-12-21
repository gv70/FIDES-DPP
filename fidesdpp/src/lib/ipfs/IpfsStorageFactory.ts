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
import { KuboBackend } from './backends/KuboBackend';
// Helia is lazy-loaded to avoid bundling node-datachannel (WebRTC) in Next.js builds
// import { HeliaBackend } from './backends/HeliaBackend';
import { PinataBackend } from './backends/PinataBackend';

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
export function createIpfsBackend(config?: IpfsConfig): IpfsStorageBackend {
  // Determine backend type
  const backendType = (config?.backend || process.env.IPFS_BACKEND || 'kubo').toLowerCase();
  
  switch (backendType) {
    case 'kubo':
      return new KuboBackend(config);
      
    case 'helia':
      // Helia is not supported in Next.js production builds due to node-datachannel/WebRTC
      // Use Kubo (FOSS) or Pinata (optional SaaS) instead
      throw new Error(
        'Helia backend is not supported in Next.js production builds (node-datachannel incompatibility). ' +
        'Please use Kubo (FOSS primary) or Pinata (optional SaaS) instead. ' +
        'Set IPFS_BACKEND=kubo in your environment.'
      );
      
    case 'pinata':
      return new PinataBackend(config);
      
    default:
      throw new Error(
        `Unknown IPFS backend: "${backendType}". ` +
        `Supported backends: kubo (FOSS primary), pinata (optional SaaS). ` +
        `Note: Helia is not supported in Next.js builds. ` +
        `Set IPFS_BACKEND environment variable or pass backend in config.`
      );
  }
}

/**
 * Check if a backend is available/configured
 * 
 * @param backendType - Backend type to check
 * @param config - Optional configuration
 * @returns true if backend is available, false otherwise
 */
export async function isBackendAvailable(
  backendType: BackendType,
  config?: IpfsConfig
): Promise<boolean> {
  try {
    const backend = createIpfsBackend({ ...config, backend: backendType });
    return await backend.isAvailable();
  } catch (error) {
    return false;
  }
}

/**
 * Get recommended backend for current environment
 * Checks availability in order: kubo -> pinata
 * Note: Helia is skipped as it's incompatible with Next.js/Turbopack builds
 * 
 * @param config - Optional configuration
 * @returns Recommended backend type
 */
export async function getRecommendedBackend(config?: IpfsConfig): Promise<BackendType> {
  // Try Kubo first (FOSS)
  if (await isBackendAvailable('kubo', config)) {
    return 'kubo';
  }
  
  // Note: Helia is not checked as it's incompatible with Next.js production builds
  
  // Fall back to Pinata if available (with warning)
  if (await isBackendAvailable('pinata', config)) {
    console.warn(
      'Using Pinata backend (optional SaaS). ' +
      'For FOSS-only operation, install and run Kubo: https://docs.ipfs.tech/install/'
    );
    return 'pinata';
  }
  
  throw new Error(
    'No IPFS backend available. Please either:\n' +
    '1. Install and run Kubo (FOSS primary): ipfs init && ipfs daemon\n' +
    '2. Configure Pinata (optional SaaS): set PINATA_JWT and PINATA_GATEWAY_URL\n' +
    'Note: Helia is not supported in Next.js production builds.'
  );
}

/**
 * Validate backend configuration
 * 
 * @param config - Configuration to validate
 * @throws Error if configuration is invalid
 */
export function validateBackendConfig(config: IpfsConfig): void {
  const backendType = config.backend || process.env.IPFS_BACKEND || 'kubo';
  
  switch (backendType) {
    case 'kubo':
      // Node URL is optional (defaults to 127.0.0.1:5001)
      break;
      
    case 'helia':
      throw new Error(
        'Helia backend is not supported in Next.js production builds. ' +
        'Please use Kubo (FOSS) or Pinata (optional SaaS) instead.'
      );
      
    case 'pinata':
      if (!config.accessToken && !process.env.PINATA_JWT) {
        throw new Error(
          'Pinata backend requires JWT. Either:\n' +
          '1. Pass accessToken in config\n' +
          '2. Set PINATA_JWT environment variable\n' +
          '3. Use Kubo backend (FOSS primary)'
        );
      }
      break;
      
    default:
      throw new Error(`Unknown backend type: ${backendType}`);
  }
}

/**
 * Get backend configuration from environment variables
 * 
 * @returns Configuration object from environment
 */
export function getBackendConfigFromEnv(): IpfsConfig {
  return {
    backend: process.env.IPFS_BACKEND || 'kubo',
    nodeUrl: process.env.IPFS_NODE_URL,
    gatewayUrl: process.env.IPFS_GATEWAY_URL || process.env.NEXT_PUBLIC_PINATA_GATEWAY_URL,
    accessToken: process.env.PINATA_JWT,
  };
}
