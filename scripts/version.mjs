#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const VERSION_JSON = path.join(ROOT, "version.json");
const PACKAGE_JSON = path.join(ROOT, "package.json");
const PACKAGE_LOCK_JSON = path.join(ROOT, "package-lock.json");
const MANIFEST_JSON = path.join(ROOT, "manifest.json");
const SITES_JSON = path.join(ROOT, "tests", "sites.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function isSemver(version) {
  return /^\d+\.\d+\.\d+$/.test(version);
}

function bump(version, kind) {
  const [major, minor, patch] = version.split(".").map(Number);
  if (kind === "patch") return `${major}.${minor}.${patch + 1}`;
  if (kind === "minor") return `${major}.${minor + 1}.0`;
  if (kind === "major") return `${major + 1}.0.0`;
  throw new Error(`Unsupported bump kind: ${kind}`);
}

function syncVersionFiles(version) {
  const versionConfig = readJson(VERSION_JSON);
  const pkg = readJson(PACKAGE_JSON);
  const lock = readJson(PACKAGE_LOCK_JSON);
  const manifest = readJson(MANIFEST_JSON);
  const sites = readJson(SITES_JSON);

  versionConfig.version = version;
  pkg.version = version;
  manifest.version = version;
  sites.version = version;

  if (lock.version) lock.version = version;
  if (lock.packages?.[""]?.version) lock.packages[""].version = version;

  writeJson(VERSION_JSON, versionConfig);
  writeJson(PACKAGE_JSON, pkg);
  writeJson(PACKAGE_LOCK_JSON, lock);
  writeJson(MANIFEST_JSON, manifest);
  writeJson(SITES_JSON, sites);
}

function main(argv) {
  const [mode, explicitVersion] = argv;
  if (!mode || !["patch", "minor", "major", "set", "sync"].includes(mode)) {
    console.error("Usage:");
    console.error("  node scripts/version.mjs patch");
    console.error("  node scripts/version.mjs minor");
    console.error("  node scripts/version.mjs major");
    console.error("  node scripts/version.mjs set <x.y.z>");
    console.error("  node scripts/version.mjs sync");
    process.exit(1);
  }

  const current = readJson(VERSION_JSON).version;
  if (!isSemver(current)) {
    throw new Error(`version.json must contain semver (got ${current})`);
  }

  const next =
    mode === "sync"
      ? current
      : mode === "set"
        ? explicitVersion
        : bump(current, mode);

  if (!next || !isSemver(next)) {
    throw new Error(`Invalid target version: ${String(next)}`);
  }

  syncVersionFiles(next);

  if (mode === "sync") {
    console.log(`Synchronized version files to ${next}`);
    return;
  }

  if (next === current) {
    console.log(`Version unchanged at ${current}`);
    return;
  }

  console.log(`Updated version: ${current} -> ${next}`);
}

main(process.argv.slice(2));
