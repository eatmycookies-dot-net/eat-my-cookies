#!/usr/bin/env node

import fs from 'fs';

const TEST_ONLY_HOSTS_NOT_IN_SUPPORT_MATRIX = new Set([
  'arstechnica.com',
  'atelevisao.com',
  'beumergroup.com',
  'childrenscommissioner.gov.uk',
  'cnn.com',
  'contentshifu.com',
  'crealogix.com',
  'danfoss.com',
  'diariomotor.com',
  'discover-drives.danfoss.com',
  'embracepetinsurance.com',
  'emeablog.msasafety.com',
  'eu.anta.com',
  'eu.renais.co.uk',
  'help.cookiewow.com',
  'help.uis.cam.ac.uk',
  'iabeurope.eu',
  'ketch.com',
  'laola1.at',
  'liveramp.com',
  'pathosense.com',
  'peterborough.gov.uk',
  'publico.pt',
  'realmaker.de',
  'sportradar.com',
  'support.theguardian.com',
  'thomsonreuters.com',
]);

function normalizeHost(host) {
  return host.replace(/^www\./, '').trim().toLowerCase();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function getTestHosts() {
  const { sites } = readJson('tests/sites.json');
  return [...new Set(sites.map((site) => normalizeHost(new URL(site.url).hostname)))].sort();
}

function getSupportMatrixHosts(text) {
  const hosts = new Set();

  for (const match of text.matchAll(/`([^`\n]+\.[a-z]{2,}(?:\.[a-z]{2,})?)`/gi)) {
    hosts.add(normalizeHost(match[1]));
  }

  for (const match of text.matchAll(/\[[^\]]+\]\((https?:\/\/[^)]+)\)/gi)) {
    try {
      hosts.add(normalizeHost(new URL(match[1]).hostname));
    } catch (_) {}
  }

  return [...hosts];
}

function getDuplicateSupportMatrixHosts(text) {
  const hosts = [];
  const lines = text.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    const cells = trimmed.split('|').slice(1, -1).map((cell) => cell.trim());
    if (!cells.length) continue;
    const firstCell = cells[0];
    if (!firstCell || firstCell === 'Site' || firstCell === 'CMP' || firstCell === 'Threshold') continue;

    const codeMatches = [...firstCell.matchAll(/`([^`\n]+\.[a-z]{2,}(?:\.[a-z]{2,})?)`/gi)];
    for (const match of codeMatches) {
      hosts.push(normalizeHost(match[1]));
    }

    const linkMatches = [...firstCell.matchAll(/\[[^\]]+\]\((https?:\/\/[^)]+)\)/gi)];
    for (const match of linkMatches) {
      try {
        hosts.push(normalizeHost(new URL(match[1]).hostname));
      } catch (_) {}
    }
  }

  const counts = new Map();
  for (const host of hosts) {
    counts.set(host, (counts.get(host) ?? 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([host, count]) => ({ host, count }))
    .sort((a, b) => a.host.localeCompare(b.host));
}

function main() {
  const supportMatrixText = readText('docs/site-support-matrix.md');
  const testHosts = getTestHosts();
  const supportMatrixHostSet = new Set(getSupportMatrixHosts(supportMatrixText));

  const findings = [];

  const duplicateHosts = getDuplicateSupportMatrixHosts(supportMatrixText);
  for (const duplicate of duplicateHosts) {
    findings.push(`docs/site-support-matrix.md lists \`${duplicate.host}\` ${duplicate.count} times. Remove duplicate status rows or duplicate host mentions.`);
  }

  const missingSupportDocs = testHosts.filter((host) => {
    if (TEST_ONLY_HOSTS_NOT_IN_SUPPORT_MATRIX.has(host)) return false;
    return !supportMatrixHostSet.has(host);
  });

  for (const host of missingSupportDocs) {
    findings.push(`tests/sites.json includes \`${host}\` but docs/site-support-matrix.md does not mention it. Add support-status documentation or explicitly treat it as test-only.`);
  }

  if (findings.length) {
    console.error('Support drift check failed.\n');
    for (const finding of findings) {
      console.error(`- ${finding}`);
    }
    console.error('\nResolve the structural drift above before pushing, or intentionally move the host into the test-only allowlist in scripts/check-support-drift.mjs.');
    process.exit(1);
  }

  console.log('Support drift check passed.');
}

main();
