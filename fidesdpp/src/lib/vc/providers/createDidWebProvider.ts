/**
 * DID:web Provider Factory
 * 
 * Creates appropriate DidWebProvider based on configuration.
 * 
 * @license Apache-2.0
 */

import type { DidWebProvider } from './DidWebProvider';
import { NativeDidWebManager } from './NativeDidWebManager';

/**
 * Create DID:web provider
 * 
 * Selects provider based on USE_WALT_ID_DIDWEB environment variable:
 * - false (default): NativeDidWebManager (FOSS, Node.js crypto)
 * - true: WaltIdDidWebProvider (optional, requires walt.id service)
 * 
 * @returns DidWebProvider instance
 */
export function createDidWebProvider(): DidWebProvider {
  const useWaltId = process.env.USE_WALT_ID_DIDWEB === 'true';

  if (useWaltId) {
    // Phase 2+ (optional): walt.id adapter
    try {
      const { WaltIdDidWebProvider } = require('./WaltIdDidWebProvider');
      
      // Check if walt.id service is available
      const waltIdUrl = process.env.WALT_ID_ISSUER_URL;
      if (!waltIdUrl) {
        console.warn('USE_WALT_ID_DIDWEB=true but WALT_ID_ISSUER_URL not set. Falling back to native.');
        return new NativeDidWebManager();
      }
      
      console.log('✓ Using WaltIdDidWebProvider for did:web key management');
      return new WaltIdDidWebProvider(waltIdUrl);
    } catch (error: any) {
      console.warn('Failed to load WaltIdDidWebProvider:', error.message);
      console.warn('Falling back to NativeDidWebManager');
      return new NativeDidWebManager();
    }
  }

  // Default: Native FOSS implementation
  return new NativeDidWebManager();
}

/**
 * Global singleton for backward compatibility
 * TODO: Replace with dependency injection
 */
let globalProvider: DidWebProvider | null = null;

export function getDidWebProvider(): DidWebProvider {
  if (!globalProvider) {
    globalProvider = createDidWebProvider();
  }
  return globalProvider;
}



