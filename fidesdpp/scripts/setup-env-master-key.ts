#!/usr/bin/env ts-node
/**
 * Ensure `DIDWEB_MASTER_KEY_HEX` exists in `fidesdpp/.env.local`.
 *
 * Run:
 * - Generate: `npx tsx scripts/setup-env-master-key.ts`
 * - Set key: `npx tsx scripts/setup-env-master-key.ts --key <64-hex>`
 *
 * @license Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

async function main() {
  const envPath = path.join(process.cwd(), '.env.local');
  const args = process.argv.slice(2);
  
  let masterKeyHex: string | undefined;
  const keyIndex = args.indexOf('--key');
  if (keyIndex !== -1 && args[keyIndex + 1]) {
    masterKeyHex = args[keyIndex + 1];
    if (masterKeyHex.length !== 64) {
      console.error('[master-key] Invalid key length (expected 64 hex chars)');
      process.exit(1);
    }
    if (!/^[0-9a-fA-F]{64}$/.test(masterKeyHex)) {
      console.error('[master-key] Invalid key format (expected hex)');
      process.exit(1);
    }
  }

  let envContent = '';
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf-8');
  }

  const existingMatch = envContent.match(/^DIDWEB_MASTER_KEY_HEX=(.+)$/m);
  if (existingMatch) {
    const existingKey = existingMatch[1].trim();
    console.log('[master-key] DIDWEB_MASTER_KEY_HEX already set');
    console.log(`[master-key] Current value: ${existingKey.substring(0, 16)}...${existingKey.substring(48)}`);
    
    if (masterKeyHex && masterKeyHex !== existingKey) {
      console.log('[master-key] --key differs from the existing value');
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      
      const answer = await new Promise<string>((resolve) => {
        rl.question('Overwrite it? (yes/no): ', resolve);
      });
      rl.close();
      
      if (answer.toLowerCase() !== 'yes') {
        console.log('[master-key] No changes');
        return;
      }
      
      envContent = envContent.replace(
        /^DIDWEB_MASTER_KEY_HEX=.*$/m,
        `DIDWEB_MASTER_KEY_HEX=${masterKeyHex}`
      );
      fs.writeFileSync(envPath, envContent);
      console.log('[master-key] Updated DIDWEB_MASTER_KEY_HEX');
      return;
    }
    
    console.log('[master-key] No changes');
    return;
  }

  if (!masterKeyHex) {
    console.log('[master-key] Generating');
    masterKeyHex = crypto.randomBytes(32).toString('hex');
    console.log(`[master-key] Generated: ${masterKeyHex.substring(0, 16)}...${masterKeyHex.substring(48)}`);
  } else {
    console.log('[master-key] Using provided key');
  }

  const newLine = `DIDWEB_MASTER_KEY_HEX=${masterKeyHex}`;
  
  if (envContent && !envContent.endsWith('\n')) {
    envContent += '\n';
  }
  
  envContent += `\n# DID:web master key for encrypting/decrypting Ed25519 private keys\n${newLine}\n`;
  
  fs.writeFileSync(envPath, envContent);
  
  console.log('[master-key] Added DIDWEB_MASTER_KEY_HEX to .env.local');
  console.log('[master-key] Restart the dev server if needed');
}

main().catch((e) => {
  console.error('[master-key] Error:', e.message);
  if (e.stack) {
    console.error(e.stack);
  }
  process.exit(1);
});
