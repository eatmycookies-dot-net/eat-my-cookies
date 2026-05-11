#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FRAMES_DIR = path.join(ROOT, 'icons', 'frames');
const DIST_FRAMES_DIR = path.join(ROOT, 'dist', 'icons', 'frames');
const SERVICE_WORKER = path.join(ROOT, 'background', 'service-worker.js');
const STATS_FILE = path.join(ROOT, 'utils', 'stats.js');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function fileExists(filePath) {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

function readFrameCount() {
  const source = fs.readFileSync(SERVICE_WORKER, 'utf8');
  const match = source.match(/const FRAME_COUNT = (\d+);/);
  assert(match, 'Could not find FRAME_COUNT in background/service-worker.js');
  return Number(match[1]);
}

function validateFrameDirectory(dir, label, frameCount) {
  assert(fs.existsSync(dir), `${label} directory is missing: ${dir}`);
  for (let i = 1; i <= frameCount; i++) {
    const file = path.join(dir, `frame-${i}.png`);
    assert(fileExists(file), `${label} is missing frame asset: ${file}`);
  }
}

async function validateMilestones() {
  const source = fs.readFileSync(STATS_FILE, 'utf8');
  const match = source.match(/export const MILESTONES = (\[[\s\S]*?\n\]);/);
  assert(match, 'Could not find MILESTONES in utils/stats.js');

  const milestones = Function(`return ${match[1]};`)();

  assert(Array.isArray(milestones) && milestones.length > 0, 'MILESTONES must be a non-empty array');

  const ids = new Set();
  let previousThreshold = 0;

  for (const milestone of milestones) {
    assert(typeof milestone.id === 'string' && milestone.id.length > 0, 'Every milestone must have a non-empty id');
    assert(!ids.has(milestone.id), `Duplicate milestone id found: ${milestone.id}`);
    ids.add(milestone.id);

    assert(Number.isInteger(milestone.threshold) && milestone.threshold > previousThreshold,
      `Milestone thresholds must be strictly increasing: ${milestone.id}`);
    previousThreshold = milestone.threshold;

    assert(typeof milestone.name === 'string' && milestone.name.length > 0,
      `Milestone is missing a name: ${milestone.id}`);

    assert(typeof milestone.icon === 'string' && milestone.icon.length > 0,
      `Milestone is missing an icon: ${milestone.id}`);

    const iconPath = path.resolve(ROOT, 'popup', milestone.icon);
    assert(fileExists(iconPath), `Milestone icon is missing: ${iconPath}`);
  }

  const topThreshold = milestones[milestones.length - 1].threshold;
  assert(topThreshold >= 1000000, 'Milestone ladder should extend to at least 1,000,000 handled banners');
}

async function main() {
  const frameCount = readFrameCount();
  validateFrameDirectory(FRAMES_DIR, 'Source icon frames', frameCount);
  if (fs.existsSync(DIST_FRAMES_DIR)) {
    validateFrameDirectory(DIST_FRAMES_DIR, 'Built icon frames', frameCount);
  }
  await validateMilestones();
  console.log(`Static checks passed: ${frameCount} icon frames verified and milestone ladder validated.`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
