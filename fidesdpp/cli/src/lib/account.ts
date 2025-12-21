/**
 * Account management utilities for CLI
 * 
 * Provides helpers for loading Polkadot accounts from keyring URIs
 * 
 * @license Apache-2.0
 */

import { Keyring } from '@polkadot/api';
import { cryptoWaitReady } from '@polkadot/util-crypto';

export interface PolkadotAccount {
  address: string;
  publicKey: Uint8Array;
  sign: (data: Uint8Array) => Promise<Uint8Array>;
}

/**
 * Load Polkadot account from keyring URI or seed phrase
 * 
 * Supports:
 * - Dev accounts: //Alice, //Bob, //Charlie, //Dave, //Eve, //Ferdie
 * - Seed phrases: "word1 word2 ... word12"
 * - Private key URIs: 0x...
 * 
 * @param accountUri - Account URI (e.g., //Alice) or seed phrase
 * @param keyType - Key type: 'ed25519' or 'sr25519' (default: 'ed25519')
 * @returns PolkadotAccount compatible with DppApplicationService
 */
export async function loadPolkadotAccount(
  accountUri: string,
  keyType: 'ed25519' | 'sr25519' = 'ed25519'
): Promise<PolkadotAccount> {
  // Wait for crypto to be ready
  await cryptoWaitReady();

  // Create keyring with specified key type
  const keyring = new Keyring({ type: keyType });

  // Add account from URI
  const pair = keyring.addFromUri(accountUri);

  // Return account object compatible with DppApplicationService
  return {
    address: pair.address,
    publicKey: pair.publicKey,
    sign: async (data: Uint8Array): Promise<Uint8Array> => {
      return pair.sign(data);
    },
  };
}

/**
 * Validate that account uses Ed25519 keys
 * 
 * This is required for VC-JWT signing with EdDSA algorithm.
 * Sr25519 keys are not compatible with standard VC-JWT.
 * 
 * @param account - Account to validate
 * @throws Error if account is not Ed25519
 */
export function validateEd25519Account(account: PolkadotAccount): void {
  // Ed25519 public keys are 32 bytes
  if (account.publicKey.length !== 32) {
    throw new Error(
      `Invalid public key length for Ed25519: expected 32 bytes, got ${account.publicKey.length}. ` +
      `For VC-JWT signing, use --key-type ed25519 or create account with Ed25519 keys.`
    );
  }
}

/**
 * Format account info for display
 */
export function formatAccountInfo(account: PolkadotAccount): string {
  return `Address: ${account.address}\nPublic Key: 0x${Buffer.from(account.publicKey).toString('hex')}`;
}



