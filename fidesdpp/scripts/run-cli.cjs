#!/usr/bin/env node

/**
 * Cross-platform CLI runner that avoids tsx/esbuild.
 *
 * - Compiles `fidesdpp/cli` with TypeScript (tsc)
 * - Runs the compiled JS entrypoint
 *
 * This keeps `npm run cli -- ...` working on Windows/macOS even when `tsx`
 * fails due to local security policies (esbuild EPERM).
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const cliRoot = path.join(projectRoot, 'cli');

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('[cli] Usage: npm run cli -- <command> [args...]');
  process.exit(1);
}

const tscPath = path.join(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc');
if (!fs.existsSync(tscPath)) {
  console.error('[cli] TypeScript not found. Run `npm install` in `fidesdpp/` first.');
  process.exit(1);
}

const tsconfigPath = path.join(cliRoot, 'tsconfig.json');
const distEntry = path.join(cliRoot, 'dist', 'cli', 'src', 'index.js');

function run(command, commandArgs, options) {
  const result = spawnSync(command, commandArgs, {
    stdio: 'inherit',
    cwd: projectRoot,
    env: {
      ...process.env,
      NODE_PATH: path.join(projectRoot, 'node_modules'),
    },
    ...options,
  });

  if (result.error) throw result.error;
  if (typeof result.status === 'number') process.exit(result.status);
  process.exit(0);
}

try {
  // Always compile before running to ensure we execute current sources.
  // This keeps behavior consistent across platforms and avoids stale dist.
  const build = spawnSync(process.execPath, [tscPath, '-p', tsconfigPath], {
    stdio: 'inherit',
    cwd: projectRoot,
    env: {
      ...process.env,
      NODE_PATH: path.join(projectRoot, 'node_modules'),
    },
  });
  if (build.error) throw build.error;
  if (typeof build.status === 'number' && build.status !== 0) process.exit(build.status);

  if (!fs.existsSync(distEntry)) {
    console.error('[cli] Build succeeded but entrypoint not found:', distEntry);
    process.exit(1);
  }

  run(process.execPath, [distEntry, ...args]);
} catch (error) {
  console.error('[cli] Failed to start:', error);
  process.exit(1);
}
