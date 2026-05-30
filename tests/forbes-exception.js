#!/usr/bin/env node

const path = require('path');
const { chromium } = require('playwright');

const EXT_DIR = path.resolve(__dirname, '..');
const FORBES_URL = 'https://www.forbes.com/';
const WAIT_MS = 12000;

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

async function writeState(browser, { preference = 'reject_all', alwaysAccept = false } = {}) {
  const sw = await waitForServiceWorker(browser);
  const derivedCategoryPreferences = {
      functional: true,
      analytics: preference === 'accept_all',
      advertising: preference === 'accept_all',
      ccpaDoNotSell: preference !== 'accept_all',
      uncategorized: preference === 'accept_all' ? 'accept' : 'reject',
  };
  const payload = { preference, alwaysAccept, categoryPreferences: derivedCategoryPreferences };
  const writer = ({ preference, alwaysAccept, categoryPreferences }) => new Promise((resolve) => {
    chrome.storage.sync.set({
      globalPreference: preference,
      onboardingComplete: true,
      showBadgeCount: true,
      milestonesShown: [],
      categoryPreferences,
    }, () => {
      chrome.storage.local.set({
        siteOverrides: alwaysAccept ? { 'www.forbes.com': { alwaysAccept: true, disabled: false } } : {},
        unsupportedSites: {},
      }, resolve);
    });
  });

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
  const sw = await waitForServiceWorker(browser);
  const defaults = { siteOverrides: {}, unsupportedSites: {}, stats: { totalActionsCount: 0, recentActivity: [] } };
  const reader = (defaults) => new Promise((resolve) => {
    chrome.storage.local.get({
      siteOverrides: {},
      unsupportedSites: {},
      stats: { totalActionsCount: 0, recentActivity: [] },
    }, resolve);
  });
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

    const sampleNodes = Array.from(document.querySelectorAll('button, a, div, span'))
      .filter((el) => /forbes privacy center|cookie preferences|your data privacy requests|save your choices|exit/i.test((el.textContent || '').trim()))
      .slice(0, 20)
      .map((el) => ({
        tag: el.tagName,
        text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 160),
        visible: isVisible(el),
      }));

    return {
      url: location.href,
      title: document.title,
      emcPref: document.documentElement.dataset.emcPref ?? null,
      bodyHasPrivacyCenter: /Forbes Privacy Center/i.test(document.body?.innerText || ''),
      bodySnippet: (document.body?.innerText || '').slice(0, 600),
      sampleNodes,
    };
  });
}

async function runScenario({ preference = 'reject_all', alwaysAccept = false } = {}) {
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
  const visited = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) visited.push(frame.url());
  });

  try {
    await writeState(browser, { preference, alwaysAccept });
    await page.goto(FORBES_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(WAIT_MS);
    const pageState = await readPageState(page);
    const localState = await readLocalState(browser);
    return { visited, pageState, localState };
  } finally {
    await page.close();
    await browser.close();
  }
}

(async () => {
  const rejectScenario = await runScenario({ preference: 'reject_all', alwaysAccept: false });
  const acceptScenario = await runScenario({ preference: 'accept_all', alwaysAccept: false });
  const withOverride = await runScenario({ preference: 'reject_all', alwaysAccept: true });

  console.log('--- FORBES REJECT WITHOUT OVERRIDE ---');
  console.log(JSON.stringify(rejectScenario, null, 2));
  console.log('--- FORBES ACCEPT ALL ---');
  console.log(JSON.stringify(acceptScenario, null, 2));
  console.log('--- FORBES WITH ALWAYS ACCEPT OVERRIDE ---');
  console.log(JSON.stringify(withOverride, null, 2));

  assert(
    Object.keys(rejectScenario.localState.unsupportedSites || {}).length > 0,
    `Forbes reject scenario should record unsupported-site warning. Diagnostic: ${JSON.stringify(rejectScenario, null, 2)}`
  );
  assert(
    !acceptScenario.pageState.bodyHasPrivacyCenter,
    `Forbes accept_all should not land on privacy center. Diagnostic: ${JSON.stringify(acceptScenario, null, 2)}`
  );
  assert(
    Object.keys(acceptScenario.localState.unsupportedSites || {}).length === 0,
    `Forbes accept_all should not leave unsupported-site warning active. Diagnostic: ${JSON.stringify(acceptScenario, null, 2)}`
  );
  assert(
    !withOverride.pageState.bodyHasPrivacyCenter,
    `Forbes always-accept override still landed on privacy center. Diagnostic: ${JSON.stringify(withOverride, null, 2)}`
  );
  assert(
    Object.keys(withOverride.localState.unsupportedSites || {}).length === 0,
    `Forbes always-accept override left unsupported-site warning active. Diagnostic: ${JSON.stringify(withOverride.localState, null, 2)}`
  );

  console.log('PASS Forbes exception flow');
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
