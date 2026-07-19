#!/usr/bin/env node

const path = require('path');
const { chromium } = require('playwright');

const EXT_DIR = path.resolve(__dirname, '..');
const CANADIAN_TIRE_URL = 'https://www.canadiantire.ca/en.html';
const HANDLE_WAIT_MS = 10000;
const REOPEN_WAIT_MS = 5000;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function buildCategoryPreferences() {
  return {
    functional: true,
    analytics: false,
    advertising: false,
    ccpaDoNotSell: true,
    uncategorized: 'reject',
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
  const existing = browser.pages().find((candidate) => candidate.url().startsWith('chrome-extension://'));
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

async function writePreferences(browser) {
  const payload = {
    globalPreference: 'custom',
    onboardingComplete: true,
    showBadgeCount: true,
    categoryPreferences: buildCategoryPreferences(),
    milestonesShown: [],
  };

  const page = await browser.newPage();
  try {
    const extPage = await ensureExtensionPage(browser, page);
    await extPage.evaluate((data) => new Promise((resolve) => chrome.storage.sync.set(data, resolve)), payload);
  } finally {
    if (!page.isClosed()) await page.close();
  }
}

async function waitForVisible(page, selectors, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const selector of selectors) {
      const el = await page.$(selector).catch(() => null);
      if (el && await el.isVisible().catch(() => false)) return selector;
    }
    await page.waitForTimeout(200);
  }
  return null;
}

async function readOneTrustState(page) {
  return page.evaluate(() => {
    const isVisible = (el) => {
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };

    const rawCookie = document.cookie
      .split('; ')
      .find((part) => part.startsWith('OptanonConsent='))
      ?.slice('OptanonConsent='.length) ?? null;
    const decodedCookie = rawCookie ? decodeURIComponent(rawCookie) : '';
    const groups = decodedCookie.match(/groups=([^&]+)/)?.[1] ?? '';

    const toggleIds = ['ot-group-id-C0002', 'ot-group-id-C0003', 'ot-group-id-C0004'];
    const toggles = Object.fromEntries(toggleIds.map((id) => {
      const el = document.getElementById(id);
      return [id, el instanceof HTMLInputElement ? Boolean(el.checked) : null];
    }));

    return {
      groups,
      pcPresent: Boolean(document.querySelector('#onetrust-pc-sdk')),
      pcVisible: isVisible(document.querySelector('#onetrust-pc-sdk')),
      darkFilterVisible: isVisible(document.querySelector('.onetrust-pc-dark-filter')),
      rowPresent: Boolean(document.querySelector('.ot-sdk-row')),
      toggles,
    };
  });
}

async function reopenCookieSettings(page) {
  const alreadyVisible = await waitForVisible(page, ['#onetrust-pc-sdk'], 1000);
  if (alreadyVisible) return 'already_visible';

  const clicked = await page.evaluate(() => {
    const isVisible = (el) => {
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };

    const controls = [
      '#ot-sdk-btn',
      '#onetrust-pc-btn-handler',
      '.ot-sdk-show-settings',
      'button[aria-label*="Cookie Settings" i]',
      'button[title*="Cookie Settings" i]',
    ];
    for (const selector of controls) {
      const el = document.querySelector(selector);
      if (isVisible(el)) {
        el.click();
        return selector;
      }
    }
    return null;
  });

  if (!clicked) return null;

  const visible = await waitForVisible(page, ['#onetrust-pc-sdk', '.onetrust-pc-dark-filter'], REOPEN_WAIT_MS);
  return visible ? clicked : null;
}

function assertCustomGroups(state) {
  assert(state.groups.includes('C0002:0'), `Expected analytics off in OptanonConsent, saw: ${state.groups}`);
  assert(state.groups.includes('C0003:1'), `Expected functional on in OptanonConsent, saw: ${state.groups}`);
  assert(state.groups.includes('C0004:0'), `Expected advertising off in OptanonConsent, saw: ${state.groups}`);
}

async function waitForCustomGroups(page, timeoutMs = 15000) {
  const started = Date.now();
  let lastState = await readOneTrustState(page);
  while (Date.now() - started < timeoutMs) {
    if (
      lastState.groups.includes('C0002:0') &&
      lastState.groups.includes('C0003:1') &&
      lastState.groups.includes('C0004:0')
    ) {
      return lastState;
    }
    await page.waitForTimeout(250);
    lastState = await readOneTrustState(page);
  }
  return lastState;
}

function assertReopenedState(state) {
  assert(state.pcPresent, 'Expected OneTrust preference center DOM to remain present after handling.');
  assert(state.rowPresent, 'Expected OneTrust reusable row scaffolding to remain present after handling.');
  assert(state.pcVisible || state.darkFilterVisible, 'Expected footer Cookie Settings to reopen the OneTrust preference center.');
}

async function runScenario(browser) {
  await browser.clearCookies();
  await writePreferences(browser);

  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  try {
    await page.goto(CANADIAN_TIRE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(HANDLE_WAIT_MS);

    const before = await waitForCustomGroups(page);
    assertCustomGroups(before);
    assert(before.pcPresent, 'Expected hidden OneTrust preference-center DOM to remain after custom handling.');
    const scrollAfterHandling = await page.evaluate(() => Math.round(window.scrollY));
    assert(
      scrollAfterHandling <= 50,
      `Expected Canadian Tire handling to restore the page near the original scroll position, saw scrollY=${scrollAfterHandling}`,
    );

    const errorCountBeforeReopen = pageErrors.length;
    const reopenMethod = await reopenCookieSettings(page);
    assert(reopenMethod, 'Could not reopen Canadian Tire Cookie Settings after handling.');

    const after = await readOneTrustState(page);
    assertCustomGroups(after);
    assertReopenedState(after);
    assert(
      after.toggles['ot-group-id-C0002'] === false,
      `Expected reopened analytics/performance toggle to be off, saw ${JSON.stringify(after.toggles)}`,
    );
    assert(
      after.toggles['ot-group-id-C0003'] === true,
      `Expected reopened functional toggle to be on, saw ${JSON.stringify(after.toggles)}`,
    );
    assert(
      after.toggles['ot-group-id-C0004'] === false,
      `Expected reopened advertising/targeting toggle to be off, saw ${JSON.stringify(after.toggles)}`,
    );

    const reopenErrors = pageErrors.slice(errorCountBeforeReopen);
    assert(
      reopenErrors.length === 0,
      `Footer Cookie Settings triggered page errors after handling: ${reopenErrors.join(' | ')}`,
    );

    console.log(`PASS Canadian Tire custom reopen: ${before.groups} via ${reopenMethod}`);
  } finally {
    await page.close();
  }
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

  try {
    await runScenario(browser);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
