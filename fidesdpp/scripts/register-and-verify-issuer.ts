#!/usr/bin/env ts-node
/**
 * Register a `did:web` issuer (if missing), then verify against a published
 * `did.json` if it is reachable. Always writes fresh `did.json` and
 * `polkadot-accounts.json` under `out-well-known/`.
 *
 * Env: `DIDWEB_MASTER_KEY_HEX`
 * Run: `npx tsx scripts/register-and-verify-issuer.ts`
 *
 * @license Apache-2.0
 */

import { getDidWebManager } from '../src/lib/vc/did-web-manager';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  if (!process.env.DIDWEB_MASTER_KEY_HEX) {
    console.error('[issuer] Missing env: DIDWEB_MASTER_KEY_HEX');
    console.error('[issuer] Set it in fidesdpp/.env.local (or export it for this process)');
    process.exit(1);
  }

  const manager = getDidWebManager();
  const did = 'did:web:fidesdpp.xyz';
  const domain = 'fidesdpp.xyz';

  console.log('[issuer] Register / verify');
  console.log(`[issuer] DID: ${did}`);
  console.log(`[issuer] Domain: ${domain}`);

  try {
    let identity: any;
    const existing = await manager.getIssuerIdentity(did);
    if (existing) {
      console.log('[issuer] Found existing issuer in local storage');
      console.log(`[issuer] Status: ${existing.status}`);
      console.log(`[issuer] Public key: ${Buffer.from(existing.signingKey.publicKey).toString('hex').substring(0, 40)}...`);
      identity = existing;
    } else {
      console.log('[issuer] Registering new issuer');
      identity = await manager.registerIssuer(domain, 'FIDES DPP');
      console.log(`[issuer] Registered: ${identity.did}`);
      console.log(`[issuer] Status: ${identity.status}`);
      console.log(`[issuer] Public key: ${Buffer.from(identity.signingKey.publicKey).toString('hex').substring(0, 40)}...`);
    }

    console.log('[issuer] Checking published did.json');
    const didUrl = manager.didWebToUrl(did);
    console.log(`[issuer] URL: ${didUrl}`);
    
    let publishedDidDoc: any = null;
    try {
      const response = await fetch(didUrl);
      if (!response.ok) {
        console.log(`[issuer] did.json not reachable (HTTP ${response.status})`);
      } else {
        publishedDidDoc = await response.json();
        console.log('[issuer] did.json reachable');
      }
    } catch (error: any) {
      console.log(`[issuer] did.json not reachable (${error.message})`);
    }

    if (publishedDidDoc) {
      console.log('[issuer] Verifying against published did.json');
      const verifyResult = await manager.verifyDidWeb(did);
      
      if (verifyResult.success) {
        console.log('[issuer] Verified');
        console.log(`[issuer] Status: ${verifyResult.status}`);
      } else {
        console.log('[issuer] Verification failed');
        console.log(`[issuer] Error: ${verifyResult.error}`);
      }
    } else {
      console.log('[issuer] Skipping verification (published did.json not reachable)');
    }

    console.log('[issuer] Writing out-well-known files');
    const didDoc = await manager.generateDidDocument(did, true);
    const accountsDoc = await manager.generatePolkadotAccountsDocument(did);
    
    const outDir = path.join(process.cwd(), 'out-well-known');
    fs.mkdirSync(outDir, { recursive: true });
    
    const didPath = path.join(outDir, 'did.json');
    const accountsPath = path.join(outDir, 'polkadot-accounts.json');

    fs.writeFileSync(
      didPath,
      JSON.stringify(didDoc, null, 2)
    );
    fs.writeFileSync(
      accountsPath,
      JSON.stringify(accountsDoc, null, 2)
    );
    
    console.log(`[issuer] Wrote: ${didPath}`);
    console.log(`[issuer] Wrote: ${accountsPath}`);

    const finalIdentity = await manager.getIssuerIdentity(did);
    console.log(`[issuer] Authorized accounts: ${finalIdentity?.authorizedPolkadotAccounts?.length || 0}`);

  } catch (error: any) {
    console.error('[issuer] Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
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
