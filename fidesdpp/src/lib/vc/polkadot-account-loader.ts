import { Keyring } from '@polkadot/api';
import { cryptoWaitReady } from '@polkadot/util-crypto';

export type PolkadotKeyType = 'ed25519' | 'sr25519';

export type LoadedPolkadotAccount = {
  address: string;
  publicKey: Uint8Array;
  sign: (data: Uint8Array) => Promise<Uint8Array>;
};

export async function loadPolkadotAccount(
  accountUri: string,
  keyType: PolkadotKeyType = 'ed25519'
): Promise<LoadedPolkadotAccount> {
  await cryptoWaitReady();

  const keyring = new Keyring({ type: keyType });
  const pair = keyring.addFromUri(accountUri);

  return {
    address: pair.address,
    publicKey: pair.publicKey,
    sign: async (data: Uint8Array) => pair.sign(data),
  };
}

