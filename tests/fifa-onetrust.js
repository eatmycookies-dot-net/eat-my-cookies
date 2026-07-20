#!/usr/bin/env node
// Verifies FIFA's persisted (reopened) custom preference center, not only its cookie.
const path = require('path');
const { chromium } = require('playwright');

const EXT_DIR = path.resolve(__dirname, '..');
const URL = 'https://www.fifa.com/en';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function writePreferences(browser) {
  const sw = browser.serviceWorkers()[0] ?? await browser.waitForEvent('serviceworker', { timeout: 10000 });
  const id = sw.url().match(/^chrome-extension:\/\/([^/]+)/)?.[1];
  const page = await browser.newPage();
  try {
    await page.goto(`chrome-extension://${id}/popup/popup.html`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => new Promise((resolve) => chrome.storage.sync.set({
      globalPreference: 'custom',
      onboardingComplete: true,
      categoryPreferences: {
        functional: true,
        analytics: false,
        advertising: false,
        ccpaDoNotSell: true,
        uncategorized: 'reject',
      },
    }, resolve)));
  } finally {
    await page.close();
  }
}

async function waitFor(page, predicate, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await page.waitForTimeout(150);
  }
  return false;
}

(async () => {
  const browser = await chromium.launchPersistentContext('', {
    headless: false,
    args: [`--disable-extensions-except=${EXT_DIR}`, `--load-extension=${EXT_DIR}`, '--no-sandbox'],
  });
  try {
    await writePreferences(browser);
    const page = await browser.newPage();
    try {
      await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      assert(await waitFor(page, () => page.evaluate(() => document.cookie.includes('3%3A1') || document.cookie.includes('3:1'))), 'FIFA never recorded Functional=3:1.');
      assert(await waitFor(page, () => page.evaluate(() => {
        const pc = document.querySelector('#onetrust-pc-sdk');
        if (!pc) return true;
        const style = getComputedStyle(pc);
        return style.display === 'none' || style.visibility === 'hidden';
      })), 'FIFA preference center did not close.');
      await page.evaluate(() => window.OneTrust?.ToggleInfoDisplay?.());
      assert(await waitFor(page, () => page.evaluate(() => {
        const pc = document.querySelector('#onetrust-pc-sdk');
        if (!pc) return false;
        const rect = pc.getBoundingClientRect();
        const style = getComputedStyle(pc);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      }), 8000), 'FIFA preference center did not reopen.');
      const states = await page.evaluate(() => Object.fromEntries(['2', '3', '4'].map((id) => [id, Boolean(document.getElementById(`ot-group-id-${id}`)?.checked)])));
      assert(states['2'] === false && states['3'] === true && states['4'] === false, `FIFA reopened state does not respect custom choices: ${JSON.stringify(states)}`);
      console.log(`PASS FIFA custom persisted UI: ${JSON.stringify(states)}`);
    } finally {
      await page.close();
    }
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
