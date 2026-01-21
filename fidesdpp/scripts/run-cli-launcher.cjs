#!/usr/bin/env node

/**
 * Windows-friendly CLI launcher that avoids tsx/esbuild entirely by compiling
 * the CLI with `tsc` and running the generated JS.
 *
 * Run: `npm run cli -- <command> [args...]`
 */

const { spawnSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const projectRoot = path.join(__dirname, '..');
const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('[cli] Usage: npm run cli -- <command> [args...]');
  process.exit(1);
}

const cliEntryPath = path.join(projectRoot, 'cli', 'src', 'index.ts');
const cliDistEntryPath = path.join(projectRoot, 'cli', 'dist', 'cli', 'src', 'index.js');

if (!fs.existsSync(cliEntryPath)) {
  console.error('[cli] Missing CLI entrypoint:', cliEntryPath);
  process.exit(1);
}

const env = {
  ...process.env,
  NODE_PATH: path.join(projectRoot, 'node_modules'),
};

function runNpmBuildIfNeeded() {
  if (fs.existsSync(cliDistEntryPath)) return;

  const comspec = process.env.ComSpec || 'cmd.exe';
  const npmCommand = 'npm';
  const npmArgs = ['--prefix', path.join(projectRoot, 'cli'), 'run', 'build'];

  const result =
    process.platform === 'win32'
      ? spawnSync(comspec, ['/d', '/s', '/c', [npmCommand, ...npmArgs].join(' ')], {
          stdio: 'inherit',
          cwd: projectRoot,
          env,
        })
      : spawnSync(npmCommand, npmArgs, { stdio: 'inherit', cwd: projectRoot, env });

  if (result.error) throw result.error;
  if (typeof result.status === 'number' && result.status !== 0) process.exit(result.status);
}

try {
  runNpmBuildIfNeeded();
} catch (error) {
  console.error('[cli] Build failed:', error);
  process.exit(1);
}

const child = spawn(process.execPath, [cliDistEntryPath, ...args], {
  stdio: 'inherit',
  cwd: projectRoot,
  env,
});

child.on('error', (error) => {
  console.error('[cli] Failed to start:', error);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code || 0);
});
