#!/usr/bin/env ts-node
/**
 * Verify that `DIDWEB_MASTER_KEY_HEX` can decrypt the issuer signing key.
 *
 * Run: `npx tsx scripts/verify-master-key.ts [did]`
 *
 * @license Apache-2.0
 */

import { getDidWebManager } from '../src/lib/vc/did-web-manager';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function main() {
  const did = process.argv[2] || 'did:web:fidesdpp.xyz';

  console.log('[master-key] Verify decryption');
  console.log(`[master-key] DID: ${did}`);

  const masterKeyHex = process.env.DIDWEB_MASTER_KEY_HEX;
  if (!masterKeyHex) {
    console.error('[master-key] Missing env: DIDWEB_MASTER_KEY_HEX');
    process.exit(1);
  }

  if (masterKeyHex.length !== 64) {
    console.error('[master-key] Invalid DIDWEB_MASTER_KEY_HEX length');
    console.error(`[master-key] Length: ${masterKeyHex.length}`);
    process.exit(1);
  }

  console.log(`[master-key] Key preview: ${masterKeyHex.substring(0, 16)}...${masterKeyHex.substring(48)}`);

  try {
    const manager = getDidWebManager();
    
    console.log('[master-key] Loading issuer from storage');
    const identity = await manager.getIssuerIdentity(did);
    if (!identity) {
      console.error(`[master-key] Issuer not found: ${did}`);
      process.exit(1);
    }

    console.log(`[master-key] Status: ${identity.status}`);
    console.log(`[master-key] Public key: ${Buffer.from(identity.signingKey.publicKey).toString('hex').substring(0, 40)}...`);

    if (!identity.encryptedPrivateKey) {
      console.error('[master-key] Missing encrypted key on issuer record');
      process.exit(1);
    }

    console.log(`[master-key] Encrypted key IV: ${identity.encryptedPrivateKey.ivB64.substring(0, 16)}...`);

    console.log('[master-key] Decrypt');
    let decryptedSeed: Uint8Array;
    try {
      decryptedSeed = await manager.getDecryptedPrivateKeySeed(did);
      console.log('[master-key] Decrypt ok');
    } catch (decryptError: any) {
      console.error('[master-key] Decrypt failed');
      console.error(`[master-key] Error: ${decryptError.message}`);
      
      if (decryptError.message.includes('unable to authenticate data') || 
          decryptError.message.includes('Unsupported state')) {
        console.error('[master-key] The master key does not match the issuer encryption key');
      } else {
        console.error('[master-key] Unexpected decryption error');
      }
      process.exit(1);
    }

    console.log('[master-key] Verify key pair');
    
    const crypto = require('crypto');
    
    const jwk = {
      kty: 'OKP',
      crv: 'Ed25519',
      x: Buffer.from(identity.signingKey.publicKey)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, ''),
      d: Buffer.from(decryptedSeed)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, ''),
    };

    try {
      const keyObject = crypto.createPrivateKey({ format: 'jwk', key: jwk });
      
      const publicKeyFromKeyObject = keyObject.asymmetricKeyDetails?.publicKey;
      
      const testMessage = Buffer.from('test');
      const signature = crypto.sign(null, testMessage, keyObject);
      
      const publicKeyObject = crypto.createPublicKey({
        format: 'jwk',
        key: {
          kty: 'OKP',
          crv: 'Ed25519',
          x: jwk.x,
        },
      });
      
      const isValid = crypto.verify(null, testMessage, publicKeyObject, signature);
      
      if (isValid) {
        console.log('[master-key] OK');
      } else {
        console.error('[master-key] Key pair verification failed');
        process.exit(1);
      }
    } catch (keyError: any) {
      console.error('[master-key] Key pair verification error');
      console.error(`[master-key] Error: ${keyError.message}`);
      process.exit(1);
    }

  } catch (error: any) {
    console.error('[master-key] Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('[master-key] Error:', e.message);
  if (e.stack) {
    console.error(e.stack);
  }
  process.exit(1);
});
