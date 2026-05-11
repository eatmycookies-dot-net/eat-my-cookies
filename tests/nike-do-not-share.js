#!/usr/bin/env node

// E2E test for Nike's CCPA "Do Not Share My Information" page.
//
// Tests the opt-out direction (reject_all): extension should CHECK the box
// and flip ni_c to 1PA=0.
//
// Note: the opt-in direction (accept_all → unchecking) cannot be reliably
// automated because Nike's React component does not propagate the cookie
// update client-side when the change is not triggered by a real user gesture.
// The server-side preference (keyed to ni_d, an HttpOnly cookie) also persists
// across page reloads within the same browser session.

const path = require('path');
const { chromium } = require('playwright');

const EXT_DIR = path.resolve(__dirname, '..');
const NIKE_URL = 'https://www.nike.com/guest/settings/do-not-share-my-data';
const WAIT_MS = 9000;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function preferencePayload(preference) {
  return {
    globalPreference: preference,
    onboardingComplete: true,
    showBadgeCount: true,
    milestonesShown: [],
    categoryPreferences: {
      functional: true,
      analytics: preference === 'accept_all',
      advertising: preference === 'accept_all',
      ccpaDoNotSell: preference !== 'accept_all',
      uncategorized: preference === 'accept_all' ? 'accept' : 'reject',
    },
  };
}

async function waitForServiceWorker(browser, timeoutMs = 10000) {
  const existing = browser.serviceWorkers()[0];
  if (existing) return existing;
  try {
    return await browser.waitForEvent('serviceworker', { timeout: timeoutMs });
  } catch (_) {
    return browser.serviceWorkers()[0] ?? null;
  }
}

async function ensureExtensionPage(browser, page) {
  const existing = browser.pages().find((p) => p.url().startsWith('chrome-extension://'));
  if (existing) return existing;

  const sw = await waitForServiceWorker(browser, 5000);
  const extensionId = sw?.url().match(/^chrome-extension:\/\/([^/]+)/)?.[1];
  if (extensionId) {
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 10000,
    });
    return page;
  }
  return page;
}

async function writePreferences(browser, preference) {
  const payload = preferencePayload(preference);
  const page = await browser.newPage();
  try {
    const extPage = await ensureExtensionPage(browser, page);
    await extPage.evaluate(
      (data) => new Promise((resolve) => chrome.storage.sync.set(data, resolve)),
      payload,
    );
  } finally {
    if (!page.isClosed()) await page.close();
  }
}

async function readNikeState(page) {
  return page.evaluate(() => {
    const checkbox = document.getElementById('a11y-do-not-share');
    const niC = document.cookie.match(/ni_c=([^;]+)/)?.[1] ?? null;
    return {
      checkboxFound: Boolean(checkbox),
      checked: checkbox ? Boolean(checkbox.checked) : null,
      niC,
    };
  });
}

async function waitForState(page, expectChecked, cookieFlag, timeoutMs = WAIT_MS) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const state = await readNikeState(page);
    if (state.checked === expectChecked && state.niC?.includes(cookieFlag)) return state;
    await page.waitForTimeout(300);
  }
  return readNikeState(page);
}

async function main() {
  const browser = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${EXT_DIR}`,
      `--load-extension=${EXT_DIR}`,
      '--no-sandbox',
    ],
    viewport: { width: 1280, height: 800 },
  });

  const page = await browser.newPage();
  try {
    await writePreferences(browser, 'reject_all');
    await page.goto(NIKE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const state = await waitForState(page, true, '1PA=0');
    assert(state.checkboxFound, 'reject_all: #a11y-do-not-share not found');
    assert(
      state.checked === true,
      `reject_all: checkbox checked=${state.checked}, expected true. ni_c=${state.niC}`,
    );
    assert(
      state.niC?.includes('1PA=0'),
      `reject_all: ni_c "${state.niC}" does not include "1PA=0"`,
    );
    console.log(`PASS reject_all: checked=${state.checked}, ni_c=${state.niC}`);
    console.log('\nAll Nike CCPA tests passed.');
  } finally {
    await page.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
