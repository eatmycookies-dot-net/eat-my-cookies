#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const cwd = process.cwd();
const args = new Set(process.argv.slice(2));
const stagedOnly = args.has('--staged');

const blockedPathPatterns = [
  { pattern: /^private\//, message: 'The private/ directory is local-only and should not be committed.' },
  { pattern: /^\.claude\//, message: 'Claude local settings should not be committed.' },
  { pattern: /^\.cursor\//, message: 'Cursor local settings should not be committed.' },
  { pattern: /^\.windsurf\//, message: 'Windsurf local settings should not be committed.' },
  { pattern: /^\.copilot\//, message: 'Copilot local settings should not be committed.' },
  { pattern: /^\.codeium\//, message: 'Codeium local settings should not be committed.' },
  { pattern: /^\.tabnine\//, message: 'Tabnine local settings should not be committed.' },
  { pattern: /^\.aider\//, message: 'Aider local settings should not be committed.' },
  { pattern: /^\.roo\//, message: 'Roo local settings should not be committed.' },
  { pattern: /^\.llm\//, message: 'Local LLM agent state should not be committed.' },
  { pattern: /^\.tmp-/, message: 'Temporary browser/profile artifacts should not be committed.' },
];

const blockedContentPatterns = [
  { pattern: /\/Users\/[^/\s]+\/|file:\/\/\/Users\/|\/home\/[^/\s]+\//, message: 'Contains a machine-specific absolute path.' },
  { pattern: /\b[A-Z]:\\Users\\[^\\\s]+\\/i, message: 'Contains a Windows user-specific absolute path.' },
  { pattern: /vscode:\/\//, message: 'Contains a local editor URI.' },
  { pattern: /sk-[A-Za-z0-9]{20,}/, message: 'Contains an OpenAI-style API key pattern.' },
  { pattern: /ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/, message: 'Contains a GitHub token pattern.' },
  { pattern: /AIza[0-9A-Za-z\-_]{20,}/, message: 'Contains a Google API key pattern.' },
  { pattern: /xox[baprs]-[A-Za-z0-9-]{10,}/, message: 'Contains a Slack token pattern.' },
  { pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, message: 'Contains a private key block.' },
  { pattern: /EMC_VPN_EXT\s*=\s*\/|EMC_VPN_PROFILE\s*=\s*\//, message: 'Contains a machine-specific VPN environment path.' },
];

function git(argsList) {
  return execFileSync('git', argsList, { cwd, encoding: 'utf8' });
}

function getCandidateFiles() {
  if (stagedOnly) {
    const output = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR']);
    return output.split('\n').map((line) => line.trim()).filter(Boolean);
  }

  const output = git(['ls-files']);
  return output.split('\n').map((line) => line.trim()).filter(Boolean);
}

function isTextFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const binaryExts = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.icns', '.zip', '.woff', '.woff2',
    '.ttf', '.otf', '.pdf', '.mov', '.mp4', '.webm', '.crx',
  ]);
  return !binaryExts.has(ext);
}

function readFileMaybe(filePath) {
  try {
    return fs.readFileSync(path.join(cwd, filePath), 'utf8');
  } catch (_) {
    return null;
  }
}

const candidateFiles = getCandidateFiles();
const findings = [];

for (const filePath of candidateFiles) {
  for (const rule of blockedPathPatterns) {
    if (rule.pattern.test(filePath)) {
      findings.push({ filePath, message: rule.message, kind: 'path' });
    }
  }

  if (!isTextFile(filePath)) continue;
  const text = readFileMaybe(filePath);
  if (text == null) continue;

  for (const rule of blockedContentPatterns) {
    if (rule.pattern.test(text)) {
      findings.push({ filePath, message: rule.message, kind: 'content' });
    }
  }
}

if (findings.length) {
  console.error('Public repo hygiene check failed.\n');
  for (const finding of findings) {
    console.error(`- ${finding.filePath}: ${finding.message}`);
  }
  console.error('\nFix the issues above, move local-only notes into private/, or add the right ignore rules before committing.');
  process.exit(1);
}

console.log(`Public repo hygiene check passed (${stagedOnly ? 'staged files' : 'tracked files'}).`);
