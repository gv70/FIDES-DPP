#!/usr/bin/env ts-node
/**
 * Add an authorized Polkadot account to a `did:web` issuer and write an updated
 * `out-well-known/polkadot-accounts.json` for publishing.
 *
 * Env: `DIDWEB_MASTER_KEY_HEX`
 * Run: `npx tsx scripts/add-authorized-account.ts <wallet-address> [network]`
 *
 * @license Apache-2.0
 */

import { getDidWebManager } from '../src/lib/vc/did-web-manager';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  if (!process.env.DIDWEB_MASTER_KEY_HEX) {
    console.error('[issuer] Missing env: DIDWEB_MASTER_KEY_HEX');
    process.exit(1);
  }

  const walletAddress = process.argv[2];
  const network = process.argv[3] || 'asset-hub';
  const did = 'did:web:fidesdpp.xyz';

  if (!walletAddress) {
    console.error('[issuer] Missing arg: wallet address');
    console.error('[issuer] Usage: npx tsx scripts/add-authorized-account.ts <wallet-address> [network]');
    process.exit(1);
  }

  const manager = getDidWebManager();

  console.log('[issuer] Authorizing Polkadot account');
  console.log(`[issuer] DID: ${did}`);
  console.log(`[issuer] Wallet: ${walletAddress}`);
  console.log(`[issuer] Network: ${network}`);

  try {
    await manager.addAuthorizedPolkadotAccount(did, walletAddress, network);
    console.log('[issuer] Authorized');

    const accountsDoc = await manager.generatePolkadotAccountsDocument(did);

    const outDir = path.join(process.cwd(), 'out-well-known');
    fs.mkdirSync(outDir, { recursive: true });
    const accountsPath = path.join(outDir, 'polkadot-accounts.json');
    fs.writeFileSync(accountsPath, JSON.stringify(accountsDoc, null, 2));

    console.log('[issuer] polkadot-accounts.json:');
    console.log(JSON.stringify(accountsDoc, null, 2));
    console.log(`[issuer] Wrote: ${accountsPath}`);
  } catch (error: any) {
    console.error('[issuer] Error:', error.message);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('[issuer] Error:', e.message);
  if (e.stack) {
    console.error(e.stack);
  }
  process.exit(1);
});
