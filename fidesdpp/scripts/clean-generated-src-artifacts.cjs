#!/usr/bin/env node
/**
 * Remove generated JS/map artifacts accidentally emitted into `src/`.
 * Keeps `.d.ts` files (contract type definitions).
 */

const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const srcRoot = path.join(projectRoot, 'src');

const removeExtensions = new Set(['.js', '.map']);

function shouldDelete(filePath) {
  if (filePath.endsWith('.js')) return true;
  if (filePath.endsWith('.js.map')) return true;
  if (filePath.endsWith('.d.ts.map')) return true;
  return false;
}

function walk(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }
    if (entry.isFile() && shouldDelete(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  }
}

if (!fs.existsSync(srcRoot)) {
  console.error(`[clean] Missing src directory: ${srcRoot}`);
  process.exit(1);
}

walk(srcRoot);
console.log('[clean] Done');
