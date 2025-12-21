#!/usr/bin/env tsx
/**
 * Check if a CID is pinned on IPFS
 * 
 * Usage: tsx check-ipfs-pin.ts <cid> [--node-url <url>]
 * 
 * @license Apache-2.0
 */

import * as fs from 'fs';

const args = process.argv.slice(2);
let cid: string | null = null;
let nodeUrl = process.env.IPFS_NODE_URL || 'http://127.0.0.1:5001';

// Parse arguments
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--node-url' || args[i] === '-n') {
    nodeUrl = args[++i];
  } else if (!cid) {
    cid = args[i];
  }
}

if (!cid) {
  console.error('Error: CID is required.');
  console.log('\nUsage:');
  console.log('  tsx check-ipfs-pin.ts <cid> [options]');
  console.log('\nOptions:');
  console.log('  --node-url, -n    IPFS node URL (default: http://127.0.0.1:5001)');
  console.log('\nExample:');
  console.log('  tsx check-ipfs-pin.ts bafkreitest123');
  console.log('  tsx check-ipfs-pin.ts bafkreitest123 --node-url http://127.0.0.1:5001');
  process.exit(1);
}

// TypeScript type narrowing: cid is now guaranteed to be string
const cidValue: string = cid;

async function main() {
  const cid = cidValue; // Use local const to ensure type safety
  try {
    console.log(`Checking pin status for CID: ${cid}`);
    console.log(`IPFS node: ${nodeUrl}`);

    // 1. Check if node is available
    console.log('\nChecking IPFS node availability...');
    const versionResponse = await fetch(`${nodeUrl}/api/v0/version`, {
      method: 'POST',
    });
    
    if (!versionResponse.ok) {
      throw new Error(`IPFS node not available at ${nodeUrl}. Is Kubo running?`);
    }
    
    const version = await versionResponse.json();
    console.log(`✓ IPFS node available (${version.Version})`);

    // 2. Check if CID is pinned
    console.log('\nChecking pin status...');
    const pinLsUrl = `${nodeUrl}/api/v0/pin/ls?arg=${encodeURIComponent(cid || '')}&type=recursive`;
    
    const pinResponse = await fetch(pinLsUrl, {
      method: 'POST',
    });

    if (pinResponse.ok) {
      const pinData = await pinResponse.json();
      console.log('Pinned: yes');
      console.log(`   Type: ${pinData.Keys?.[cid || '']?.Type || 'recursive'}`);
      console.log('   Status: protected from garbage collection');
    } else if (pinResponse.status === 404) {
      console.log('Pinned: no');
      console.log('Warning: this CID may be garbage collected.');
      console.log('\nPin manually:');
      console.log(`   curl -X POST "${nodeUrl}/api/v0/pin/add?arg=${cid}&recursive=true"`);
      console.log('\n   Or via IPFS CLI:');
      console.log(`   ipfs pin add ${cid}`);
    } else {
      const errorText = await pinResponse.text();
      console.log(`Could not check pin status: HTTP ${pinResponse.status}`);
      console.log(`   Response: ${errorText}`);
    }

    // 3. Try to retrieve the content (to verify it's accessible)
    console.log('\nChecking content accessibility...');
    const catUrl = `${nodeUrl}/api/v0/cat?arg=${encodeURIComponent(cid)}`;
    
    const catResponse = await fetch(catUrl, {
      method: 'POST',
    });

    if (catResponse.ok) {
      const content = await catResponse.text();
      console.log('Content accessible: yes');
      console.log(`   Size: ${content.length} bytes`);
      console.log(`   Preview: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`);
    } else {
      console.log('Content accessible: no');
      console.log(`   Status: ${catResponse.status}`);
      console.log('   Possible causes:');
      console.log(`   - CID is not pinned and was garbage collected`);
      console.log(`   - CID is on a different IPFS node`);
      console.log(`   - Network connectivity issue`);
    }

    // 4. Check pin list (all pinned CIDs)
    console.log('\nListing pinned CIDs...');
    const pinListUrl = `${nodeUrl}/api/v0/pin/ls?type=recursive`;
    
    const pinListResponse = await fetch(pinListUrl, {
      method: 'POST',
    });

    if (pinListResponse.ok) {
      const pinList = await pinListResponse.json();
      const pinnedCids = Object.keys(pinList.Keys || {});
      console.log(`✓ Found ${pinnedCids.length} pinned CID(s)`);
      
      if (pinnedCids.includes(cid)) {
        console.log('   CID is present in pin list');
      } else {
        console.log('   CID is not present in pin list');
      }
    }

  } catch (error: any) {
    console.error('\nError:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
