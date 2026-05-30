#!/usr/bin/env node
/**
 * vpn-connect.js — first-time Browsec VPN setup helper
 *
 * Run this ONCE to accept the Browsec Terms of Service and turn the VPN on.
 * It saves a persistent Chrome profile so detect-cmp.js and `validate.js --vpn`
 * can reuse the connected session without repeating this setup.
 *
 * Prerequisites:
 *   - Set EMC_VPN_EXT to the path of your unpacked Browsec extension, OR
 *     pass it as the first CLI argument:  node vpn-connect.js <path>
 *   - See CONTRIBUTING.md → "Testing with a VPN" for how to get the path.
 *
 * Usage:
 *   node tests/vpn-connect.js
 *   node tests/vpn-connect.js /path/to/browsec/3.93.2_0
 *
 * What it does:
 *   1. Launches Chrome with the Browsec extension loaded.
 *   2. Handles the first-run Terms of Service screen (coordinate click — see note below).
 *   3. Dismisses the "Start VPN" onboarding tooltip.
 *   4. Attempts to click the power toggle to connect.
 *   5. Saves screenshots to .tmp-vpn-profile/screenshots/ for visual verification.
 *   6. Exits — the persistent profile at .tmp-vpn-profile/ now holds the connected state.
 *
 * Note on coordinate-based clicks:
 *   Browsec's popup is a React SPA rendered into a <div class="MainContainer">.
 *   On first run, a <first-start-agree-terms-conditions> custom element overlays the
 *   entire popup and intercepts all pointer events, making Playwright's normal
 *   element-based click unreliable.  A mouse.click() at known coordinates (x:200, y:540
 *   for the Accept button in a 400×600 viewport) bypasses this reliably.
 *   The coordinates were determined by screenshot inspection — if Browsec updates its
 *   layout, re-run and inspect the saved screenshots to recalibrate.
 */

const { chromium } = require('playwright');
const path = require('path');
const fs   = require('fs');

// ── Config ────────────────────────────────────────────────────────────────────

const VPN_EXT_DIR = process.argv[2]
  ? path.resolve(process.argv[2])
  : process.env.EMC_VPN_EXT
    ? path.resolve(process.env.EMC_VPN_EXT)
    : null;

if (!VPN_EXT_DIR) {
  console.error([
    '',
    '  EMC_VPN_EXT is not set.',
    '  Usage:  node tests/vpn-connect.js <path-to-unpacked-extension>',
    '  Or:     export EMC_VPN_EXT=<path> and re-run.',
    '',
    '  See CONTRIBUTING.md → "Testing with a VPN" for setup instructions.',
    '',
  ].join('\n'));
  process.exit(1);
}

// Persistent profile dir — shared with validate.js --vpn and detect-cmp.js.
// Lives inside the project root under .tmp-vpn-profile/ (gitignored).
const PROFILE_DIR  = process.env.EMC_VPN_PROFILE
  ? path.resolve(process.env.EMC_VPN_PROFILE)
  : path.resolve(__dirname, '..', '.tmp-vpn-profile');

const SCREENSHOT_DIR = path.join(PROFILE_DIR, 'screenshots');

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

// ── Extension ID detection ────────────────────────────────────────────────────
// Chrome assigns each loaded extension an ID derived from its public key (or
// install path for unpacked extensions).  Rather than hardcoding it, we read
// it from the service worker URL that Chrome registers for every extension —
// the URL is always chrome-extension://<id>/<worker_script>.
// This works for any VPN extension, not just Browsec.
async function detectExtId(browser, timeoutMs = 10000) {
  // Service worker may already be registered by the time we get here
  const existing = browser.serviceWorkers();
  if (existing.length > 0) {
    return new URL(existing[0].url()).hostname;
  }
  // Otherwise wait for the first one to register
  const worker = await browser.waitForEvent('serviceworker', { timeout: timeoutMs });
  return new URL(worker.url()).hostname;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function shot(page, name) {
  const dest = path.join(SCREENSHOT_DIR, `${name}.png`);
  return page.screenshot({ path: dest, fullPage: true }).then(() => console.log(`  screenshot → ${dest}`));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`VPN extension: ${VPN_EXT_DIR}`);
  console.log(`Profile dir:   ${PROFILE_DIR}\n`);

  const browser = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    args: [
      `--disable-extensions-except=${VPN_EXT_DIR}`,
      `--load-extension=${VPN_EXT_DIR}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
    viewport: { width: 400, height: 600 },
  });

  console.log('Detecting VPN extension ID from service worker...');
  const EXT_ID = await detectExtId(browser).catch(() => null);
  if (!EXT_ID) {
    console.error('Could not detect extension ID — is the extension path correct?');
    await browser.close();
    process.exit(1);
  }
  console.log(`Extension ID: ${EXT_ID}\n`);

  const page = await browser.newPage();
  await page.goto(`chrome-extension://${EXT_ID}/popup/popup.html`, { timeout: 15000 });
  await page.waitForTimeout(3000);

  await shot(page, '1-initial');

  // ── Step 1: Accept Terms of Service (first-run only) ────────────────────────
  // Browsec renders a <first-start-agree-terms-conditions> element that covers
  // the popup and captures all pointer events.  The green Accept button sits at
  // roughly (200, 540) in a 400×600 viewport — use a raw mouse click.
  const firstRun = await page.$('first-start-agree-terms-conditions');
  if (firstRun) {
    console.log('First-run: accepting Terms of Service...');
    await page.mouse.click(200, 540);
    await page.waitForTimeout(3000);
    await shot(page, '2-after-accept');
  }

  // ── Step 2: Dismiss "Start VPN" onboarding tooltip ──────────────────────────
  // After terms acceptance, Browsec shows a tips overlay with a "Start VPN"
  // green button at ~(200, 298).  Clicking it both dismisses the overlay and
  // activates the VPN for the first time.
  const bodyText = await page.evaluate(() => document.body.innerText);
  if (bodyText.includes('Start VPN')) {
    console.log('Dismissing "Start VPN" onboarding tooltip...');
    const btn = await page.$('button:has-text("Start VPN")');
    if (btn) {
      await btn.click();
    } else {
      await page.mouse.click(200, 298); // coordinate fallback
    }
    await page.waitForTimeout(3000);
    await shot(page, '3-after-start-vpn');
  }

  // ── Step 3: Verify connected state ──────────────────────────────────────────
  // A connected Browsec popup shows "Your Privacy is protected" and an ON toggle.
  const finalText = await page.evaluate(() => document.body.innerText);
  const connected = finalText.includes('protected') || finalText.includes('ON');

  await shot(page, '4-final');
  console.log(`\nFinal popup text: ${finalText.replace(/\n/g, ' ').slice(0, 120)}`);

  if (connected) {
    console.log('\n✅ VPN appears connected.  Profile saved to:', PROFILE_DIR);
    console.log('   Run detect-cmp.js or validate.js --vpn to use this session.');
  } else {
    console.log('\n⚠️  Could not confirm VPN connection automatically.');
    console.log('   Check screenshot 4-final.png — if the toggle is OFF, turn it on manually');
    console.log('   while this window is open, then re-run this script.');
  }

  await browser.close();
}

main().catch(console.error);
