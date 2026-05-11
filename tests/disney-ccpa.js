#!/usr/bin/env node

const path = require('path');
const { chromium } = require('playwright');

const EXT_DIR = path.resolve(__dirname, '..');
const DISNEY_URL = 'https://privacy.thewaltdisneycompany.com/en/dnssmpi/';
const HANDLE_WAIT_MS = 9000;
const MODAL_WAIT_MS = 10000;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function buildCategoryPreferences(globalPreference) {
  const accept = globalPreference === 'accept_all';
  return {
    functional: true,
    analytics: accept,
    advertising: accept,
    ccpaDoNotSell: !accept,
    uncategorized: accept ? 'accept' : 'reject',
  };
}

async function writePreferences(browser, preference) {
  const payload = {
    globalPreference: preference,
    onboardingComplete: true,
    showBadgeCount: true,
    categoryPreferences: buildCategoryPreferences(preference),
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

async function waitForVisible(page, selectors, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const selector of selectors) {
      const el = await page.$(selector).catch(() => null);
      if (el && await el.isVisible().catch(() => false)) return selector;
    }
    await page.waitForTimeout(250);
  }
  return null;
}

async function reopenDisneyChoices(page) {
  const alreadyVisible = await waitForVisible(page, [
    '#ot-group-id-SSPD_BG',
    '#onetrust-pc-sdk',
    '.save-preference-btn-handler',
  ], 1000);
  if (alreadyVisible) return 'already_visible';

  const openedViaApi = await page.evaluate(() => {
    try {
      if (typeof window.OneTrust?.ToggleInfoDisplay === 'function') {
        window.OneTrust.ToggleInfoDisplay();
        return 'toggleInfoDisplay';
      }
      if (typeof window.OneTrust?.LoadBanner === 'function') {
        window.OneTrust.LoadBanner();
        return 'loadBanner';
      }
    } catch (_) {}
    return null;
  });

  if (openedViaApi) {
    const visible = await waitForVisible(page, [
      '#onetrust-consent-sdk',
      '#onetrust-pc-sdk',
      '.category-switch-handler',
      "input[id^='ot-group-id-']",
    ], 4000);
    if (visible) return openedViaApi;
  }

  const clicked = await page.evaluate(() => {
    const isVisible = (el) => {
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const controls = [
      'a.df-privacy-compliance',
      '.df-privacy-compliance',
      '#ot-sdk-btn',
      '#onetrust-pc-btn-handler',
      'button[aria-label*="Your Choices" i]',
      'button[title*="Your Choices" i]',
      'button[aria-label*="Privacy Choices" i]',
      'button[title*="Privacy Choices" i]',
      'a[aria-label*="Your Choices" i]',
      'a[title*="Your Choices" i]',
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

  const visible = await waitForVisible(page, [
    '#ot-group-id-SSPD_BG',
    '#onetrust-consent-sdk',
    '#onetrust-pc-sdk',
    '.category-switch-handler',
    "input[id^='ot-group-id-']",
  ], 4000);
  return visible ? clicked : null;
}

async function readDisneyState(page) {
  return page.evaluate(() => {
    const isVisible = (el) => {
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };

    const toggles = Array.from(document.querySelectorAll(".category-switch-handler, input[id^='ot-group-id-']"))
      .filter((el) => isVisible(el) || el.id === 'ot-group-id-SSPD_BG')
      .map((el) => ({
        id: el.id || null,
        checked: Boolean(el.checked),
        visible: isVisible(el),
        text: (el.closest('label, li, div')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160),
      }));

    const cookieValue = document.cookie
      .split('; ')
      .find((part) => part.startsWith('OptanonConsent='))
      ?.slice('OptanonConsent='.length) ?? null;

    const decodedCookie = cookieValue ? decodeURIComponent(cookieValue) : '';
    const groupsMatch = decodedCookie.match(/groups=([^&]+)/);
    const groups = groupsMatch?.[1] ?? '';

    return {
      url: location.href,
      title: document.title,
      toggles,
      groups,
      bodyText: (document.body?.innerText || '').slice(0, 500),
    };
  });
}

function assertDisneyState(preference, state) {
  assert(state.toggles.length > 0, `No visible Disney OneTrust toggles were found after reopening. Diagnostic: ${JSON.stringify(state)}`);

  const disneyToggle = state.toggles.find((toggle) => toggle.id === 'ot-group-id-SSPD_BG');
  const c0004 = state.toggles.find((toggle) => toggle.id === 'ot-group-id-C0004');
  const target = disneyToggle ?? c0004 ?? state.toggles[0];
  const expectChecked = preference === 'accept_all';

  assert(
    target.checked === expectChecked,
    `Disney toggle mismatch for ${preference}: expected ${expectChecked ? 'ON' : 'OFF'} but saw ${target.checked ? 'ON' : 'OFF'}. Diagnostic: ${JSON.stringify(state)}`
  );

  if (state.groups) {
    const expectedGroup = state.groups.includes('SSPD_BG:')
      ? `SSPD_BG:${expectChecked ? '1' : '0'}`
      : `C0004:${expectChecked ? '1' : '0'}`;
    assert(
      state.groups.includes(expectedGroup),
      `OptanonConsent groups did not include ${expectedGroup} for ${preference}. Diagnostic: ${JSON.stringify(state)}`
    );
  }
}

async function runScenario(browser, preference) {
  await browser.clearCookies();
  await writePreferences(browser, preference);

  const page = await browser.newPage();
  try {
    await page.goto(DISNEY_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(HANDLE_WAIT_MS);

    const reopenMethod = await reopenDisneyChoices(page);
    assert(reopenMethod, `Could not reopen Disney "Your Choices" controls for ${preference}`);

    const state = await readDisneyState(page);
    assertDisneyState(preference, state);
    console.log(`PASS ${preference} via ${reopenMethod}: ${state.groups || 'groups unavailable'}`);
  } finally {
    await page.close();
  }
}

async function main() {
  const browser = await chromium.launchPersistentContext('', {
    // Chrome extensions do not consistently load in headless persistent contexts.
    // Run headed so the extension service worker and pages are available reliably.
    headless: false,
    args: [
      `--disable-extensions-except=${EXT_DIR}`,
      `--load-extension=${EXT_DIR}`,
      '--no-sandbox',
    ],
    viewport: { width: 1280, height: 800 },
  });

  try {
    await runScenario(browser, 'reject_all');
    await runScenario(browser, 'accept_all');
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
