#!/usr/bin/env node

/**
 * FIDES-DPP CLI
 * 
 * Command-line interface for Digital Product Passport operations
 * Supports FOSS-only operation (Kubo, Helia) or optional Pinata backend
 * Now with Verifiable Credentials support
 * 
 * @license Apache-2.0
 */

import { Command } from 'commander';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { registerCommand } from './commands/register';
import { readCommand } from './commands/read';
import { verifyCommand } from './commands/verify';
import { updateCommand } from './commands/update';
import { revokeCommand } from './commands/revoke';
import { createVcCommand } from './commands/create-vc';
import { verifyVcCommand } from './commands/verify-vc';
import { listCommand } from './commands/list';
import { issuerRegisterCommand } from './commands/issuer-register';
import { issuerExportCommand } from './commands/issuer-export';
import { issuerVerifyCommand } from './commands/issuer-verify';

// Load environment variables
// Try multiple paths to work from both CLI directory and project root
const projectRoot = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(projectRoot, '.env.local') });
dotenv.config({ path: path.join(projectRoot, '.env') });

const program = new Command();

program
  .name('dpp-cli')
  .description('FIDES Digital Product Passport CLI - FOSS-first IPFS + Polkadot')
  .version('0.1.0');

// Backend configuration option (global)
program.option(
  '-b, --backend <type>',
  'IPFS backend: kubo (FOSS default), helia (FOSS lightweight), pinata (optional SaaS)',
  'kubo'
);

program.option(
  '--node-url <url>',
  'IPFS node URL (for Kubo)',
  process.env.IPFS_NODE_URL || 'http://127.0.0.1:5001'
);

program.option(
  '--gateway-url <url>',
  'IPFS gateway URL',
  process.env.IPFS_GATEWAY_URL || process.env.NEXT_PUBLIC_PINATA_GATEWAY_URL || 'http://127.0.0.1:8080'
);

program.option(
  '--contract <address>',
  'Contract address',
  process.env.CONTRACT_ADDRESS || '0x2b7da3eab6f9660e7bfadc5ea0076e5883b6f11f'
);

program.option(
  '--rpc <url>',
  'Polkadot RPC URL',
  process.env.POLKADOT_RPC_URL || process.env.RPC_URL || 'wss://westend-asset-hub-rpc.polkadot.io'
);

// VC Commands (new architecture)
createVcCommand(program);
verifyVcCommand(program);

// Issuer Commands (did:web management)
const issuer = program.command('issuer').description('Issuer management (did:web)');
issuerRegisterCommand(issuer);
issuerExportCommand(issuer);
issuerVerifyCommand(issuer);

// Original commands (for backward compatibility)
// Register command
program
  .command('register')
  .description('Register a new passport (uploads to IPFS + calls contract)')
  .requiredOption('-j, --json <file>', 'Passport JSON file')
  .requiredOption('-a, --account <keyring>', 'Account URI or seed phrase')
  .option('--skip-ipfs', 'Skip IPFS upload (only register on-chain)')
  .action(registerCommand);

// Read command
program
  .command('read')
  .description('Read passport data by token ID')
  .argument('[tokenId]', 'Token ID to read (positional)')
  .option('-t, --token-id <id>', 'Token ID to read')
  .option('-o, --output <file>', 'Output file (default: stdout)')
  .option('--ipfs', 'Also fetch IPFS data if dataset URI exists')
  .option('--key <verificationKey>', 'Verification key to decrypt restricted sections (optional)')
  .action((tokenIdArg, options, cmd) => {
    const tokenId = options.tokenId || tokenIdArg;
    return readCommand({ ...options, tokenId }, cmd);
  });

// Verify command
program
  .command('verify')
  .description('Verify passport integrity (fetch from IPFS and check hash)')
  .argument('[tokenId]', 'Token ID to verify (positional)')
  .option('-t, --token-id <id>', 'Token ID to verify')
  .option('--json', 'Output full report as JSON')
  .action((tokenIdArg, options, cmd) => {
    const tokenId = options.tokenId || tokenIdArg;
    return verifyCommand({ ...options, tokenId }, cmd);
  });

// Update and Revoke commands (new architecture using DppApplicationService)
updateCommand(program);
revokeCommand(program);

// List command
program
  .command('list')
  .description('List all available token IDs from a contract')
  .requiredOption('-c, --contract <address>', 'Contract address')
  .option('--rpc <url>', 'RPC URL (overrides global --rpc)')
  .option('--max <number>', 'Maximum token IDs to scan', '1000')
  .option('-o, --output <file>', 'Output JSON file with results')
  .action((options) => {
    listCommand({
      contract: options.contract,
      rpc: options.rpc || program.opts().rpc,
      max: parseInt(options.max, 10),
      output: options.output,
    });
  });

// Info command
program
  .command('info')
  .description('Show configuration and backend status')
  .action(async () => {
    console.log('FIDES-DPP CLI Configuration:');
    console.log(`  Backend: ${program.opts().backend}`);
    console.log(`  Node URL: ${program.opts().nodeUrl}`);
    console.log(`  Gateway URL: ${program.opts().gatewayUrl}`);
    console.log(`  Contract: ${program.opts().contract}`);
    console.log(`  RPC: ${program.opts().rpc}`);
    console.log('');
    console.log('This CLI works with FOSS backends (Kubo, Helia).');
    console.log('No closed-source services are required.');
  });

program.parse(process.argv);

// Show help if no command
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
