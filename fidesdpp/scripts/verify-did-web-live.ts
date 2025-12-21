#!/usr/bin/env ts-node
/**
 * Verify a published `did:web` DID document against local issuer storage.
 *
 * Env: `DIDWEB_MASTER_KEY_HEX`
 * Run: `npx tsx scripts/verify-did-web-live.ts`
 *
 * @license Apache-2.0
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import { getDidWebManager } from '../src/lib/vc/did-web-manager';

async function main() {
  if (!process.env.DIDWEB_MASTER_KEY_HEX) {
    console.error('[did-web] Missing env: DIDWEB_MASTER_KEY_HEX');
    process.exit(1);
  }

  const manager = getDidWebManager();
  const did = 'did:web:fidesdpp.xyz';

  console.log('[did-web] Verify published did.json');
  console.log(`[did-web] DID: ${did}`);

  const identity = await manager.getIssuerIdentity(did);
  if (!identity) {
    console.error('[did-web] Issuer not found in local storage');
    process.exit(1);
  }

  console.log(`[did-web] Local status: ${identity.status}`);

  const didUrl = manager.didWebToUrl(did);
  console.log(`[did-web] URL: ${didUrl}`);

  try {
    const response = await fetch(didUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const liveDidDoc = await response.json();
    console.log('[did-web] did.json reachable');

    if (liveDidDoc.id !== did) {
      throw new Error(`DID mismatch: expected ${did}, got ${liveDidDoc.id}`);
    }
    console.log('[did-web] DID matches');

    if (!liveDidDoc.verificationMethod || liveDidDoc.verificationMethod.length === 0) {
      throw new Error('No verificationMethod found in live DID document');
    }
    if (!liveDidDoc.verificationMethod[0].publicKeyMultibase) {
      throw new Error('No publicKeyMultibase in verificationMethod');
    }

    console.log('[did-web] did.json structure ok');

    const serviceEndpoint = manager.extractPolkadotAccountsServiceEndpoint(liveDidDoc);
    if (serviceEndpoint) {
      try {
        const accountsResponse = await fetch(serviceEndpoint);
        if (accountsResponse.ok) {
          const accountsDoc = await accountsResponse.json();
          console.log(`[did-web] polkadot-accounts.json reachable: ${serviceEndpoint}`);
          console.log(`[did-web] Accounts: ${accountsDoc.accounts?.length || 0}`);
        } else {
          console.log(`[did-web] polkadot-accounts.json not reachable (HTTP ${accountsResponse.status})`);
        }
      } catch (error: any) {
        console.log(`[did-web] polkadot-accounts.json not reachable (${error.message})`);
      }
    } else {
      console.log('[did-web] No PolkadotAccounts service found');
    }

    console.log('[did-web] verifyDidWeb');
    const verifyResult = await manager.verifyDidWeb(did);
    
    if (verifyResult.success) {
      console.log('[did-web] Verified');
      console.log(`[did-web] Status: ${verifyResult.status}`);
    } else {
      console.log(`[did-web] Verification failed: ${verifyResult.error}`);
      process.exit(1);
    }

  } catch (error: any) {
    console.error('[did-web] Error:', error.message);
    console.error(`[did-web] URL: ${didUrl}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('[did-web] Error:', e.message);
  if (e.stack) {
    console.error(e.stack);
  }
  process.exit(1);
});
