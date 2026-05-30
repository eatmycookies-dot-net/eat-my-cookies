#!/usr/bin/env node

const path = require('path');
const { chromium } = require('playwright');

const EXT_DIR = path.resolve(__dirname, '..');
const URL = 'https://www.bloomberg.com/';
const WAIT_MS = 15000;

function assert(condition, message) {
  if (!condition) throw new Error(message);
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
    }).catch(() => {});
    return page;
  }
  await page.goto('chrome-extension://invalid/', {
    waitUntil: 'domcontentloaded',
    timeout: 1000,
  }).catch(() => {});
  return browser.pages().find((candidate) => candidate.url().startsWith('chrome-extension://')) ?? page;
}

async function writeState(browser) {
  const payload = {
    globalPreference: 'accept_all',
    onboardingComplete: true,
    showBadgeCount: true,
    milestonesShown: [],
    categoryPreferences: {
      functional: true,
      analytics: true,
      advertising: true,
      ccpaDoNotSell: true,
      uncategorized: 'accept',
    },
  };
  const writer = (data) => new Promise((resolve) => {
    chrome.storage.sync.set(data, () => {
      chrome.storage.local.set({
        siteOverrides: { 'www.bloomberg.com': { alwaysAccept: true, disabled: false } },
        unsupportedSites: {},
      }, resolve);
    });
  });

  const sw = await waitForServiceWorker(browser);
  if (sw) {
    await sw.evaluate(writer, payload);
    return;
  }

  const page = await browser.newPage();
  try {
    const extPage = await ensureExtensionPage(browser, page);
    await extPage.evaluate(writer, payload);
  } finally {
    if (!page.isClosed()) await page.close();
  }
}

async function readLocalState(browser) {
  const defaults = { siteOverrides: {}, unsupportedSites: {}, stats: { totalActionsCount: 0, recentActivity: [] } };
  const reader = (fallback) => new Promise((resolve) => {
    chrome.storage.local.get(fallback, resolve);
  });
  const sw = await waitForServiceWorker(browser);
  if (sw) return sw.evaluate(reader, defaults);
  const page = await browser.newPage();
  try {
    const extPage = await ensureExtensionPage(browser, page);
    return await extPage.evaluate(reader, defaults);
  } finally {
    if (!page.isClosed()) await page.close();
  }
}

async function readPageState(page) {
  return page.evaluate(() => {
    const isVisible = (el) => {
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };

    const sourcepointIframes = Array.from(document.querySelectorAll('iframe[id^="sp_message_iframe"], iframe[title*="SP Consent Message" i]'))
      .map((iframe) => ({
        id: iframe.id || null,
        title: iframe.title || null,
        visible: isVisible(iframe),
        rect: iframe.getBoundingClientRect().toJSON(),
      }));

    return {
      url: location.href,
      title: document.title,
      emcPref: document.documentElement.dataset.emcPref ?? null,
      bodySnippet: (document.body?.innerText || '').slice(0, 800),
      sourcepointIframes,
    };
  });
}

async function openBloombergCcpaLink(page) {
  return page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll('a, button, [role="button"]'));
    const target = candidates.find((el) => /do not sell or share my personal information/i.test((el.textContent || '').trim()));
    if (!target) return false;
    try {
      target.scrollIntoView({ block: 'center' });
    } catch (_) {}
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
    return true;
  });
}

(async () => {
  const browser = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${EXT_DIR}`,
      `--load-extension=${EXT_DIR}`,
      '--no-sandbox',
    ],
    viewport: { width: 1440, height: 1000 },
  });
  const page = await browser.newPage();
  try {
    await writeState(browser);
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(WAIT_MS);

    const openedCcpa = await openBloombergCcpaLink(page);
    assert(openedCcpa, 'Could not open Bloomberg CCPA footer flow');
    await page.waitForTimeout(12000);

    const pageState = await readPageState(page);
    const localState = await readLocalState(browser);
    const diagnostic = { pageState, localState };

    console.log(JSON.stringify(diagnostic, null, 2));

    const visibleSourcepointFrames = (pageState.sourcepointIframes || []).filter((frame) => frame.visible);
    const bloombergActivity = (localState.stats?.recentActivity || []).filter((entry) => entry.site === 'www.bloomberg.com');

    assert(visibleSourcepointFrames.length === 0, `Bloomberg CCPA Sourcepoint modal should be closed. Diagnostic: ${JSON.stringify(diagnostic, null, 2)}`);
    assert(Object.keys(localState.unsupportedSites || {}).length === 0, `Bloomberg accept-all + CCPA opt-out should not leave unsupported warning. Diagnostic: ${JSON.stringify(diagnostic, null, 2)}`);
    assert(bloombergActivity.some((entry) => String(entry.method || '').includes('bloomberg:ccpa')), `Bloomberg should record the Bloomberg CCPA action. Diagnostic: ${JSON.stringify(diagnostic, null, 2)}`);

    console.log('PASS Bloomberg CCPA flow');
  } finally {
    await page.close();
    await browser.close();
  }
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
