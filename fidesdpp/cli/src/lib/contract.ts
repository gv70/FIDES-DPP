/**
 * Contract interaction utilities for CLI
 * 
 * @license Apache-2.0
 */

import { ApiPromise, WsProvider } from '@polkadot/api';
import { Keyring } from '@polkadot/keyring';
import { cryptoWaitReady } from '@polkadot/util-crypto';

let api: ApiPromise | null = null;

export async function getApi(rpcUrl: string): Promise<ApiPromise> {
  if (api) {
    return api;
  }

  const provider = new WsProvider(rpcUrl);
  api = await ApiPromise.create({ provider });
  
  return api;
}

export async function getAccount(accountUri: string) {
  await cryptoWaitReady();
  
  const keyring = new Keyring({ type: 'sr25519' });
  
  // Support different formats:
  // - Seed phrase
  // - //Alice (dev accounts)
  // - URI format
  try {
    return keyring.addFromUri(accountUri);
  } catch (error) {
    throw new Error(`Failed to load account: ${error}. Provide a valid seed phrase or URI like //Alice`);
  }
}

export async function disconnectApi(): Promise<void> {
  if (api) {
    await api.disconnect();
    api = null;
  }
}
