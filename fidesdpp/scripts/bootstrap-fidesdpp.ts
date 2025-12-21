#!/usr/bin/env ts-node
/**
 * Bootstrap a `did:web` issuer in local storage and generate the files that must
 * be hosted under `/.well-known/`.
 *
 * Env: `DIDWEB_MASTER_KEY_HEX`
 * Run: `npx tsx scripts/bootstrap-fidesdpp.ts`
 *
 * @license Apache-2.0
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import { getDidWebManager } from '../src/lib/vc/did-web-manager';
import * as fs from 'fs';

async function main() {
  if (!process.env.DIDWEB_MASTER_KEY_HEX) {
    console.error('[bootstrap] Missing env: DIDWEB_MASTER_KEY_HEX');
    console.error('[bootstrap] Example: export DIDWEB_MASTER_KEY_HEX=\"$(openssl rand -hex 32)\"');
    process.exit(1);
  }

  const manager = getDidWebManager();

  console.log('[bootstrap] Starting');
  const identity = await manager.registerIssuer('fidesdpp.xyz', 'FIDES DPP');
  const did = identity.did;
  console.log(`[bootstrap] DID: ${did}`);
  console.log(`[bootstrap] Status: ${identity.status}`);
  console.log(`[bootstrap] Encrypted key: ${identity.encryptedPrivateKey ? 'yes' : 'no'}`);

  console.log('[bootstrap] Generating did.json');
  const didDoc = await manager.generateDidDocument(did, true);
  console.log(`[bootstrap] Service endpoint: ${didDoc.service?.[0]?.serviceEndpoint || 'n/a'}`);

  console.log('[bootstrap] Generating polkadot-accounts.json');
  const accountsDoc = await manager.generatePolkadotAccountsDocument(did);
  console.log(`[bootstrap] Networks: ${accountsDoc.accounts?.length || 0}`);

  const outDir = path.join(process.cwd(), 'out-well-known');
  fs.mkdirSync(outDir, { recursive: true });

  const didJsonPath = path.join(outDir, 'did.json');
  const accountsJsonPath = path.join(outDir, 'polkadot-accounts.json');

  fs.writeFileSync(didJsonPath, JSON.stringify(didDoc, null, 2));
  fs.writeFileSync(accountsJsonPath, JSON.stringify(accountsDoc, null, 2));

  console.log(`[bootstrap] Wrote: ${didJsonPath}`);
  console.log(`[bootstrap] Wrote: ${accountsJsonPath}`);

  const serviceEndpoint = manager.getPolkadotAccountsServiceEndpoint(did);
  console.log('[bootstrap] Publish:');
  console.log('  - /.well-known/did.json');
  console.log(`  - ${serviceEndpoint}`);
}

main().catch((e) => {
  console.error('[bootstrap] Error:', e.message);
  if (e.stack) {
    console.error(e.stack);
  }
  process.exit(1);
});
