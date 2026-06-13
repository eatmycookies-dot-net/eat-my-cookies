#!/usr/bin/env node
/**
 * E2E test: ketch.com — no redirect to /platform/dsr-automation,
 * and the "Your Privacy" banner is dismissed by the extension.
 *
 * Runs both US locale (no VPN) and EU locale (VPN, if --vpn passed).
 * Verifies both accept_all and reject_all preference paths.
 *
 * Usage:
 *   node tests/test-ketch.js
 *   node tests/test-ketch.js --headed
 *   node tests/test-ketch.js --vpn --vpn-ext=<path-to-unpacked-browsec>
 *   EMC_VPN_EXT=<path> node tests/test-ketch.js --vpn
 *
 * VPN setup (one-time): node tests/vpn-connect.js --vpn-ext=<path>
 * See CONTRIBUTING.md → "Testing with a VPN" for full instructions.
 *
 * NOTE: launchPersistentContext() returns a BrowserContext, not a Browser.
 * Call context.newPage() / context.serviceWorkers() directly.
 */

'use strict';

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// ── Config ─────────────────────────────────────────────────────────────────────
const EXT_DIR      = path.resolve(__dirname, '..');
// Chrome's --load-extension flag breaks on paths with spaces. Symlink to a
// space-free tmp path before launch (mirrors the validate.js approach).
const EXT_LAUNCH_DIR = path.join(require('os').tmpdir(), 'emc-extension-no-spaces');
const TEST_URL = 'https://www.ketch.com/';
const WAIT_MS  = 12000;

// Text that appears inside the "Your Privacy" Ketch banner
const BANNER_TEXT_MARKER = 'your privacy';

// ── Argument parsing ────────────────────────────────────────────────────────────
const args   = process.argv.slice(2);
const headed = args.includes('--headed');
const useVpn = args.includes('--vpn');

function argVal(argList, key) {
  const match = argList.find(a => a.startsWith(key + '='));
  return match ? match.slice(key.length + 1) : null;
}

const VPN_EXT_DIR = argVal(args, '--vpn-ext')
  ? path.resolve(argVal(args, '--vpn-ext'))
  : process.env.EMC_VPN_EXT
    ? path.resolve(process.env.EMC_VPN_EXT)
    : null;

const VPN_PROFILE_DIR = argVal(args, '--vpn-profile')
  ? path.resolve(argVal(args, '--vpn-profile'))
  : process.env.EMC_VPN_PROFILE
    ? path.resolve(process.env.EMC_VPN_PROFILE)
    : path.resolve(__dirname, '..', '.tmp-vpn-profile');

function getSystemChromeExecutable() {
  if (process.env.CHROME_EXECUTABLE) return process.env.CHROME_EXECUTABLE;
  switch (process.platform) {
    case 'darwin': return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    case 'linux':  return '/usr/bin/google-chrome';
    case 'win32':  return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    default:       return null;
  }
}

// ── Results ────────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

// ── Extension state helpers ─────────────────────────────────────────────────────
// Finds OUR extension's SW (not a VPN extension's SW, not a page SW).
// Polls up to `timeoutMs` for it to appear after extension loads.
function findOurSw(ctx) {
  const all = ctx.serviceWorkers();
  // Only extension SWs have chrome-extension:// URLs; page SWs have https:// etc.
  const extSws = all.filter(w => w.url().startsWith('chrome-extension://'));
  // Exclude the VPN extension SW if loaded alongside ours.
  const vpnId = VPN_EXT_DIR ? path.basename(path.dirname(VPN_EXT_DIR)) : null;
  return extSws.find(w => !vpnId || !w.url().includes(vpnId)) ?? extSws[0] ?? null;
}

async function waitForOurSw(ctx, timeoutMs = 6000) {
  let sw = findOurSw(ctx);
  if (sw) return sw;
  const deadline = Date.now() + timeoutMs;
  while (!sw && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 150));
    sw = findOurSw(ctx);
  }
  return sw;
}

// Write extension prefs via the SW (most reliable).
// Falls back to opening the extension popup page if SW isn't available.
async function writePreferences(ctx, globalPreference = 'accept_all') {
  const isAccept = globalPreference === 'accept_all';
  const payload = {
    globalPreference,
    onboardingComplete: true,
    showBadgeCount: true,
    milestonesShown: [],
    categoryPreferences: {
      functional: isAccept,
      analytics: isAccept,
      advertising: isAccept,
      ccpaDoNotSell: !isAccept,
      uncategorized: isAccept ? 'accept' : 'reject',
    },
  };

  const sw = await waitForOurSw(ctx);
  if (sw) {
    await sw.evaluate(
      (data) => new Promise((resolve) => chrome.storage.sync.set(data, resolve)),
      payload,
    );
    return;
  }

  // SW not found — navigate to the extension popup to write via page context.
  const tmpPage = await ctx.newPage();
  try {
    const extSws = ctx.serviceWorkers().filter(w => w.url().startsWith('chrome-extension://'));
    const firstSw = extSws[0];
    const extId = firstSw?.url().match(/^chrome-extension:\/\/([^/]+)/)?.[1];
    if (extId) {
      await tmpPage.goto(`chrome-extension://${extId}/popup/popup.html`, {
        waitUntil: 'domcontentloaded', timeout: 8000,
      }).catch(() => {});
      await tmpPage.evaluate(
        (data) => new Promise((resolve) => chrome.storage.sync.set(data, resolve)),
        payload,
      ).catch(() => {});
    }
  } finally {
    if (!tmpPage.isClosed()) await tmpPage.close();
  }
}

// ── Test runner ────────────────────────────────────────────────────────────────
async function runTest(ctx, label, { expectBannerDismissed = false } = {}) {
  console.log(`\n▶  ${label}`);

  const page = await ctx.newPage();
  const urlHistory = [];

  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) {
      urlHistory.push({ url: frame.url(), time: Date.now() });
    }
  });

  await page.goto(TEST_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(WAIT_MS);

  const finalUrl = page.url();
  const noRedirect = !finalUrl.includes('dsr-automation') && !finalUrl.includes('/platform/');

  let bannerVisible = false;
  try {
    bannerVisible = await page.evaluate((marker) => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (node.textContent.trim().toLowerCase().includes(marker)) {
          const el = node.parentElement;
          if (!el) continue;
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          if (rect.width > 0 && rect.height > 0 &&
              style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
            return true;
          }
        }
      }
      return false;
    }, BANNER_TEXT_MARKER);
  } catch (_) {}

  console.log(`   Final URL   : ${finalUrl}`);
  console.log(`   No redirect : ${noRedirect ? '✓' : '✗'}`);
  if (expectBannerDismissed) {
    console.log(`   Banner gone : ${!bannerVisible ? '✓' : '✗'}${bannerVisible ? ' ← STILL VISIBLE' : ''}`);
  }
  if (urlHistory.length > 1) {
    console.log('   Navigations:');
    urlHistory.forEach(({ url, time }, i) =>
      console.log(`     [${i}] +${time - urlHistory[0].time}ms  ${url}`)
    );
  }

  const ok = noRedirect && (!expectBannerDismissed || !bannerVisible);
  if (ok) {
    console.log('   ✅  PASS');
    passed++;
  } else {
    if (!noRedirect) console.log(`   ❌  FAIL — redirected to ${finalUrl}`);
    if (expectBannerDismissed && bannerVisible) console.log('   ❌  FAIL — banner not dismissed');
    failed++;
  }

  await page.close();
}

// ── Extension dir prep ─────────────────────────────────────────────────────────
// Returns a space-free path for --load-extension (Chrome breaks on paths with spaces).
function prepareExtDir(extDir) {
  try { fs.rmSync(EXT_LAUNCH_DIR, { force: true }); } catch (_) {}
  try {
    fs.symlinkSync(extDir, EXT_LAUNCH_DIR);
    return EXT_LAUNCH_DIR;
  } catch (_) {
    return extDir;
  }
}

// ── Browser launch ─────────────────────────────────────────────────────────────
async function launchContext(extPaths, userDataDir) {
  const launchOptions = {
    headless: !headed && !useVpn,
    args: [
      ...(extPaths.length
        ? [`--disable-extensions-except=${extPaths.join(',')}`, `--load-extension=${extPaths.join(',')}`]
        : []),
      '--no-sandbox',
    ],
    viewport: { width: 1280, height: 800 },
  };

  const executablePath = getSystemChromeExecutable();
  const candidates = [
    executablePath ? { executablePath } : null,
    { channel: 'chromium' },
    {},
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      return await chromium.launchPersistentContext(userDataDir, { ...launchOptions, ...candidate });
    } catch (_) {}
  }
  throw new Error('Could not launch any Chromium / Chrome browser');
}

// Warm up the extension's service worker by navigating a neutral page.
// Without this, the SW may not be visible to ctx.serviceWorkers() yet
// (mirrors the validate.js headless warmup strategy).
async function warmupExtension(ctx) {
  const warmupPage = await ctx.newPage();
  await warmupPage.goto('https://example.com', { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
  await warmupPage.waitForTimeout(1500);
  await warmupPage.close();
}

// ── Main ───────────────────────────────────────────────────────────────────────
(async () => {
  console.log('='.repeat(60));
  console.log('Eat My Cookies — ketch.com E2E test');
  console.log(`Extension : ${EXT_DIR}`);
  console.log(`VPN       : ${useVpn ? (VPN_EXT_DIR ?? '(none — will error)') : 'off'}`);
  console.log('Checks    : no redirect AND banner dismissed');
  console.log('='.repeat(60));

  if (useVpn && !VPN_EXT_DIR) {
    console.error([
      '',
      '  --vpn requires a path to an unpacked Browsec extension.',
      '  Provide it via:',
      '    --vpn-ext=<path>     e.g. --vpn-ext=~/Downloads/browsec/3.93.2_0',
      '    EMC_VPN_EXT=<path>   environment variable',
      '',
      '  One-time setup: node tests/vpn-connect.js --vpn-ext=<path>',
      '',
    ].join('\n'));
    process.exit(1);
  }

  if (useVpn) {
    fs.mkdirSync(VPN_PROFILE_DIR, { recursive: true });
  }

  // Symlink extension to a space-free path so Chrome's --load-extension works.
  const launchExtDir = prepareExtDir(EXT_DIR);

  // ── Baseline (no extension) ────────────────────────────────────────────────
  console.log('\n── BASELINE (no extension) ──');
  const baseCtx = await launchContext([], '');
  await runTest(baseCtx, 'No extension — baseline');
  await baseCtx.close();

  // ── US locale — accept_all ─────────────────────────────────────────────────
  console.log('\n── WITH EXTENSION — US locale, accept_all ──');
  const usAcceptCtx = await launchContext([launchExtDir], '');
  await warmupExtension(usAcceptCtx);
  await writePreferences(usAcceptCtx, 'accept_all');
  await runTest(usAcceptCtx, 'US — accept_all, run 1', { expectBannerDismissed: true });
  await runTest(usAcceptCtx, 'US — accept_all, run 2', { expectBannerDismissed: true });
  await usAcceptCtx.close();

  // ── US locale — reject_all ─────────────────────────────────────────────────
  console.log('\n── WITH EXTENSION — US locale, reject_all ──');
  const usRejectCtx = await launchContext([launchExtDir], '');
  await warmupExtension(usRejectCtx);
  await writePreferences(usRejectCtx, 'reject_all');
  await runTest(usRejectCtx, 'US — reject_all, run 1', { expectBannerDismissed: true });
  await usRejectCtx.close();

  // ── EU locale (VPN) ───────────────────────────────────────────────────────
  if (useVpn) {
    const VPN_RUNS_DIR = path.resolve(__dirname, '..', '.tmp-vpn-runs');
    fs.mkdirSync(VPN_RUNS_DIR, { recursive: true });

    console.log('\n── WITH EXTENSION — EU locale (VPN), accept_all ──');
    const euAcceptDir = fs.mkdtempSync(path.join(VPN_RUNS_DIR, 'ketch-eu-accept-'));
    fs.cpSync(VPN_PROFILE_DIR, euAcceptDir, { recursive: true });
    const euAcceptCtx = await launchContext([launchExtDir, VPN_EXT_DIR], euAcceptDir);
    console.log('   Waiting 4s for VPN extension to reconnect…');
    await new Promise(r => setTimeout(r, 4000));
    await writePreferences(euAcceptCtx, 'accept_all');
    await runTest(euAcceptCtx, 'EU — accept_all, run 1', { expectBannerDismissed: true });
    await runTest(euAcceptCtx, 'EU — accept_all, run 2', { expectBannerDismissed: true });
    await euAcceptCtx.close();

    console.log('\n── WITH EXTENSION — EU locale (VPN), reject_all ──');
    const euRejectDir = fs.mkdtempSync(path.join(VPN_RUNS_DIR, 'ketch-eu-reject-'));
    fs.cpSync(VPN_PROFILE_DIR, euRejectDir, { recursive: true });
    const euRejectCtx = await launchContext([launchExtDir, VPN_EXT_DIR], euRejectDir);
    console.log('   Waiting 4s for VPN extension to reconnect…');
    await new Promise(r => setTimeout(r, 4000));
    await writePreferences(euRejectCtx, 'reject_all');
    await runTest(euRejectCtx, 'EU — reject_all, run 1', { expectBannerDismissed: true });
    await euRejectCtx.close();
  } else {
    console.log('\n(Skipping EU locale — pass --vpn --vpn-ext=<path> to include it)');
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(60));
  process.exit(failed > 0 ? 1 : 0);
})().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
