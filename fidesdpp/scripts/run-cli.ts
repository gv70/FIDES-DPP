#!/usr/bin/env tsx
/**
 * Runs the CLI entrypoint using the workspace `node_modules`.
 *
 * Run: `npx tsx scripts/run-cli.ts <command> [args...]`
 */

import { spawn } from 'child_process';
import * as path from 'path';

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('[cli] Usage: npx tsx scripts/run-cli.ts <command> [args...]');
  process.exit(1);
}

const cliPath = path.join(__dirname, '../cli/src/index.ts');

const child = spawn('npx', ['tsx', cliPath, ...args], {
  stdio: 'inherit',
  cwd: path.join(__dirname, '..'),
  env: {
    ...process.env,
    NODE_PATH: path.join(__dirname, '../node_modules'),
  },
});

child.on('error', (error) => {
  console.error('[cli] Failed to start:', error);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code || 0);
});
