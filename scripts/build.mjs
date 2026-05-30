#!/usr/bin/env node
/**
 * Eat My Cookies — build script.
 *
 * Copies extension files into dist/, skipping dev-only artifacts.
 * Optionally creates a .zip ready for Chrome Web Store submission.
 *
 * Usage:
 *   node scripts/build.mjs           # clean build only
 *   node scripts/build.mjs --zip     # clean build + zip into releases/
 *   node scripts/build.mjs --clean   # alias for explicit clean build
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const RELEASES = path.join(ROOT, "releases");
const BUILD_META_FILE = "build-meta.json";
const VERSION_FILE = path.join(ROOT, "version.json");
const PACKAGE_FILE = path.join(ROOT, "package.json");
const MANIFEST_FILE = path.join(ROOT, "manifest.json");
const SITES_FILE = path.join(ROOT, "tests", "sites.json");

const INCLUDE = [
  "manifest.json",
  "background",
  "content",
  "popup",
  "onboarding",
  "rules",
  "_locales",
  "utils",
  "icons",
];

const EXCLUDE_NAMES = new Set([".DS_Store", "Thumbs.db", "__pycache__"]);
const EXCLUDE_EXTS = new Set([".map", ".py", ".md"]);

function exists(targetPath) {
  return fs.existsSync(targetPath);
}

function isExcluded(name) {
  return name.startsWith(".") || EXCLUDE_NAMES.has(name) || EXCLUDE_EXTS.has(path.extname(name));
}

function ensureDir(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function copyItem(src, dest) {
  const stat = fs.statSync(src);
  const name = path.basename(src);

  if (stat.isFile()) {
    if (isExcluded(name)) {
      return 0;
    }
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
    return 1;
  }

  ensureDir(dest);
  let count = 0;
  for (const child of fs.readdirSync(src)) {
    if (isExcluded(child)) {
      continue;
    }
    count += copyItem(path.join(src, child), path.join(dest, child));
  }
  return count;
}

function dirSize(targetPath) {
  let total = 0;
  for (const entry of fs.readdirSync(targetPath, { withFileTypes: true })) {
    const entryPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      total += dirSize(entryPath);
    } else if (entry.isFile()) {
      total += fs.statSync(entryPath).size;
    }
  }
  return total;
}

function human(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
}

function readJson(targetPath) {
  return JSON.parse(fs.readFileSync(targetPath, "utf8"));
}

function validateManifest(distPath) {
  const manifest = readJson(path.join(distPath, "manifest.json"));
  const errs = [];
  if (manifest.manifest_version !== 3) errs.push("manifest_version must be 3");
  if (!manifest.name) errs.push("missing name");
  if (!manifest.version) errs.push("missing version");
  if (!manifest.description) errs.push("missing description");
  if (!manifest.icons?.["128"]) errs.push("missing 128px icon");
  if (!manifest.action?.default_popup) errs.push("missing default_popup");
  for (const contentScript of manifest.content_scripts || []) {
    for (const file of contentScript.js || []) {
      if (!exists(path.join(distPath, file))) {
        errs.push(`content script not found in dist: ${file}`);
      }
    }
  }
  const unexpectedHiddenFiles = collectFiles(distPath)
    .map((filePath) => path.relative(distPath, filePath).split(path.sep).join("/"))
    .filter((relativePath) => relativePath.split("/").some((segment) => segment.startsWith(".")));
  for (const file of unexpectedHiddenFiles) {
    errs.push(`unexpected hidden file in dist: ${file}`);
  }
  const localesRoot = path.join(distPath, "_locales");
  if (exists(localesRoot)) {
    for (const entry of fs.readdirSync(localesRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const messagesPath = path.join(localesRoot, entry.name, "messages.json");
      if (!exists(messagesPath)) {
        errs.push(`locale missing messages.json: _locales/${entry.name}/messages.json`);
      }
    }
  }
  return errs;
}

function validateVersionSync(expectedVersion) {
  const files = [
    ["package.json", readJson(PACKAGE_FILE).version],
    ["manifest.json", readJson(MANIFEST_FILE).version],
    ["tests/sites.json", readJson(SITES_FILE).version],
  ];
  return files
    .filter(([, version]) => version !== expectedVersion)
    .map(([file, version]) => `${file} version ${version} does not match version.json (${expectedVersion})`);
}

function parseArgs(argv) {
  return {
    zip: argv.includes("--zip"),
    clean: argv.includes("--clean"),
  };
}

function dosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime =
    ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    ((Math.floor(date.getSeconds() / 2)) & 0x1f);
  const dosDate =
    (((year - 1980) & 0x7f) << 9) |
    (((date.getMonth() + 1) & 0x0f) << 5) |
    (date.getDate() & 0x1f);
  return { dosTime, dosDate };
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function collectFiles(rootPath) {
  const files = [];
  const walk = (currentPath) => {
    for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
      } else if (entry.isFile()) {
        files.push(entryPath);
      }
    }
  };
  walk(rootPath);
  files.sort((a, b) => a.localeCompare(b));
  return files;
}

function createZipBuffer(rootPath, skipPaths = new Set()) {
  const files = collectFiles(rootPath).filter((filePath) => {
    const relativePath = path.relative(rootPath, filePath).split(path.sep).join("/");
    return !skipPaths.has(relativePath);
  });
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const filePath of files) {
    const relativePath = path.relative(rootPath, filePath).split(path.sep).join("/");
    const nameBuffer = Buffer.from(relativePath, "utf8");
    const data = fs.readFileSync(filePath);
    const compressed = deflateRawSync(data);
    const stat = fs.statSync(filePath);
    const { dosTime, dosDate } = dosDateTime(stat.mtime);
    const crc = crc32(data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuffer, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuffer);
    offset += localHeader.length + nameBuffer.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const localData = Buffer.concat(localParts);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(files.length, 8);
  endRecord.writeUInt16LE(files.length, 10);
  endRecord.writeUInt32LE(centralDirectory.length, 12);
  endRecord.writeUInt32LE(localData.length, 16);
  endRecord.writeUInt16LE(0, 20);

  return Buffer.concat([localData, centralDirectory, endRecord]);
}

function buildDevVersion(version, now = new Date()) {
  const iso = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `${version}-dev.${iso}`;
}

function writeBuildMeta(distPath, version) {
  const buildMeta = {
    channel: "unpacked",
    releaseVersion: version,
    displayVersion: buildDevVersion(version),
    builtAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(distPath, BUILD_META_FILE), `${JSON.stringify(buildMeta, null, 2)}\n`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const version = readJson(VERSION_FILE).version;
  console.log("\nEat My Cookies — build\n");
  console.log(`  Version : ${version}`);

  if (exists(DIST)) {
    fs.rmSync(DIST, { recursive: true, force: true });
    console.log("  Cleaned : dist/");
  }

  ensureDir(DIST);

  let totalFiles = 0;
  for (const name of INCLUDE) {
    const src = path.join(ROOT, name);
    if (!exists(src)) {
      console.log(`  WARN    : ${name} not found, skipping`);
      continue;
    }
    const count = copyItem(src, path.join(DIST, name));
    totalFiles += count;
    const label = fs.statSync(src).isDirectory() ? `${name}/` : name;
    console.log(`  Copied  : ${label.padEnd(30)} (${count} file${count === 1 ? "" : "s"})`);
  }

  writeBuildMeta(DIST, version);
  totalFiles += 1;
  console.log(`  Generated: ${BUILD_META_FILE.padEnd(29)} (1 file)`);

  const errors = validateManifest(DIST);
  errors.push(...validateVersionSync(version));
  const size = dirSize(DIST);

  console.log(`\n  Files   : ${totalFiles}`);
  console.log(`  Size    : ${human(size)}`);

  if (errors.length > 0) {
    console.log("\n  ERRORS:");
    for (const error of errors) {
      console.log(`    ✗ ${error}`);
    }
    process.exit(1);
  } else {
    console.log("  Valid   : manifest OK");
  }

  if (args.zip || args.clean) {
    const zipName = `eat-my-cookies-v${version}.zip`;
    const zipPath = path.join(RELEASES, zipName);
    ensureDir(RELEASES);
    if (exists(zipPath)) {
      console.log(`\n  ERROR   : releases/${zipName} already exists`);
      console.log("  Hint    : bump the extension version before packaging a new release.");
      console.log("            Try: npm run version:patch");
      process.exit(1);
    }
    fs.writeFileSync(zipPath, createZipBuffer(DIST, new Set([BUILD_META_FILE])));
    const zipSize = fs.statSync(zipPath).size;
    console.log(`  Zipped  : releases/${zipName} (${human(zipSize)})`);
  }

  console.log("\n  Done.\n");
}

main();
