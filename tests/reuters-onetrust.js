#!/usr/bin/env node
// Verifies Reuters' footer-reopened OneTrust center reflects API-saved groups.
const path = require('path');
const { chromium } = require('playwright');

const EXT_DIR = path.resolve(__dirname, '..');
const URL = 'https://www.reuters.com/';

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
    try {
      if (await predicate()) return true;
    } catch (error) {
      if (!/Execution context was destroyed|Target page, context or browser has been closed/.test(String(error?.message ?? error))) throw error;
    }
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
      if (!(await waitFor(page, () => page.evaluate(() => document.cookie.includes('OptanonConsent='))))) {
        console.log('SKIP Reuters footer-reopen regression: no OneTrust surface/consent cookie in this live session.');
        return;
      }
      const opener = await page.evaluate(() => {
        const selectors = [
          '#onetrust-pc-btn-handler',
          '#ot-do-not-sell',
          '#ot-sdk-btn',
          'button[data-type="cmpFooterLink"]',
          'a[onclick*="ToggleInfoDisplay"]',
          'button[onclick*="ToggleInfoDisplay"]',
          '.df-privacy-compliance',
          '.ot-sdk-show-settings',
        ];
        for (const selector of selectors) {
          const el = Array.from(document.querySelectorAll(selector)).find((candidate) => {
            const style = getComputedStyle(candidate);
            const rect = candidate.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
          });
          if (!el) continue;
          return { selector, index: Array.from(document.querySelectorAll(selector)).indexOf(el) };
        }
        return null;
      });
      if (!opener) {
        console.log('SKIP Reuters footer-reopen regression: no structural OneTrust settings opener in this live session.');
        return;
      }
      await page.locator(opener.selector).nth(opener.index).click();
      assert(await waitFor(page, () => page.evaluate(() => {
        const pc = document.querySelector('#onetrust-pc-sdk');
        if (!pc) return false;
        const style = getComputedStyle(pc);
        const rect = pc.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      }), 8000), `Reuters preference center did not reopen through ${opener.selector}.`);
      const result = await page.evaluate(() => {
        const raw = decodeURIComponent(document.cookie.split('; ').find((part) => part.startsWith('OptanonConsent='))?.slice('OptanonConsent='.length) ?? '');
        const groups = Object.fromEntries((raw.match(/(?:^|&)groups=([^&]*)/)?.[1] ?? '').split(',').map((entry) => entry.split(':')).filter(([id, state]) => id && state !== undefined).map(([id, state]) => [id, state === '1']));
        const toggles = Array.from(document.querySelectorAll("input[id^='ot-group-id-']")).map((input) => [input.id.slice('ot-group-id-'.length), Boolean(input.checked)]);
        return { groups, toggles };
      });
      const comparisons = result.toggles.filter(([id]) => Object.hasOwn(result.groups, id));
      assert(comparisons.length > 0, `Reuters exposed no group-id toggles represented in OptanonConsent: ${JSON.stringify(result)}`);
      const mismatches = comparisons.filter(([id, checked]) => result.groups[id] !== checked);
      assert(mismatches.length === 0, `Reuters footer-reopened toggles diverge from persisted groups: ${JSON.stringify({ mismatches, result })}`);
      console.log(`PASS Reuters reopened OneTrust UI via ${opener.selector}: ${JSON.stringify(result)}`);
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
