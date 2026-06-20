#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

const cwd = process.cwd();
const hooksDir = path.join(cwd, '.git', 'hooks');

if (!fs.existsSync(hooksDir)) {
  console.error('No .git/hooks directory found. Run this from the repo root.');
  process.exit(1);
}

const scripts = [
  {
    name: 'pre-commit',
    body: `#!/bin/sh
set -e
echo "Running public repo hygiene check on staged files..."
node scripts/check-public-hygiene.mjs --staged
`,
  },
  {
    name: 'pre-push',
    body: `#!/bin/sh
set -e
echo "Running public repo hygiene check on staged files before push..."
node scripts/check-public-hygiene.mjs --staged
echo "Running support drift check before push..."
node scripts/check-support-drift.mjs
`,
  },
];

for (const script of scripts) {
  const target = path.join(hooksDir, script.name);
  fs.writeFileSync(target, script.body, 'utf8');
  fs.chmodSync(target, 0o755);
  console.log(`Installed ${script.name}`);
}
