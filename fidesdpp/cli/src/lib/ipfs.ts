/**
 * IPFS utilities for CLI
 * Reuses backend abstraction from web app
 * 
 * @license Apache-2.0
 */

import { createIpfsBackend } from '../../../src/lib/ipfs/IpfsStorageFactory';
import type { IpfsStorageBackend } from '../../../src/lib/ipfs/IpfsStorageBackend';

export function getIpfsBackend(options: any): IpfsStorageBackend {
  const config = {
    backend: options.backend || process.env.IPFS_BACKEND || 'kubo',
    nodeUrl: options.nodeUrl || process.env.IPFS_NODE_URL,
    gatewayUrl: options.gatewayUrl || process.env.IPFS_GATEWAY_URL,
    accessToken: process.env.PINATA_JWT,
  };

  return createIpfsBackend(config);
}

export async function checkBackendAvailability(backend: IpfsStorageBackend): Promise<void> {
  const isAvailable = await backend.isAvailable();
  
  if (!isAvailable) {
    throw new Error(
      `IPFS backend (${backend.getBackendType()}) is not available.\n` +
      getBackendHint(backend.getBackendType())
    );
  }
}

function getBackendHint(backendType: string): string {
  switch (backendType) {
    case 'kubo':
      return 'Hint: Start Kubo daemon with: ipfs daemon';
    case 'helia':
      return 'Hint: Install Helia dependencies: npm install helia @helia/json @helia/unixfs';
    case 'pinata':
      return 'Hint: Set PINATA_JWT and PINATA_GATEWAY_URL environment variables';
    default:
      return 'Check your IPFS configuration';
  }
}
