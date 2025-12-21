#!/usr/bin/env ts-node
/**
 * Regenerate `out-well-known/did.json` from local issuer storage.
 *
 * @license Apache-2.0
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { getDidWebManager } from '../src/lib/vc/did-web-manager';
import * as fs from 'fs';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function main() {
  const did = 'did:web:fidesdpp.xyz';
  
  console.log('[issuer] Regenerating did.json from local storage');
  
  const manager = getDidWebManager();
  
  const didDoc = await manager.generateDidDocument(did, true);
  
  const outDir = path.join(process.cwd(), 'out-well-known');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  
  const didJsonPath = path.join(outDir, 'did.json');
  fs.writeFileSync(didJsonPath, JSON.stringify(didDoc, null, 2));
  
  console.log(`[issuer] Wrote: ${didJsonPath}`);
  console.log(`[issuer] Key (multibase): ${didDoc.verificationMethod[0].publicKeyMultibase}`);
  
  const identity = await manager.getIssuerIdentity(did);
  if (identity) {
    const storedKeyHex = Buffer.from(identity.signingKey.publicKey).toString('hex');
    console.log(`[issuer] Stored key (hex): ${storedKeyHex.substring(0, 16)}...`);
  }
}

main().catch((e) => {
  console.error('[issuer] Error:', e.message);
  if (e.stack) {
    console.error(e.stack);
  }
  process.exit(1);
});
