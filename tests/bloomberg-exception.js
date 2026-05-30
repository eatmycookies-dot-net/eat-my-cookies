#!/usr/bin/env node

const path = require('path');
const { chromium } = require('playwright');

const EXT_DIR = path.resolve(__dirname, '..');
const URL = 'https://www.bloomberg.com/';
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

async function writeState(browser, { preference = 'reject_all', alwaysAccept = false, categoryPreferences = null } = {}) {
  const derivedCategoryPreferences = categoryPreferences ?? {
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
        siteOverrides: alwaysAccept ? { 'www.bloomberg.com': { alwaysAccept: true, disabled: false } } : {},
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
    const modal = document.getElementById('cmp-consent-modal');
    const button = document.getElementById('cmp-consent-button');
    return {
      url: location.href,
      title: document.title,
      emcPref: document.documentElement.dataset.emcPref ?? null,
      modalVisible: isVisible(modal),
      buttonVisible: isVisible(button),
      bodySnippet: (document.body?.innerText || '').slice(0, 500),
    };
  });
}

async function runScenario({ preference = 'reject_all', alwaysAccept = false, categoryPreferences = null } = {}) {
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
    await writeState(browser, { preference, alwaysAccept, categoryPreferences });
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(WAIT_MS);
    return {
      visited,
      pageState: await readPageState(page),
      localState: await readLocalState(browser),
    };
  } finally {
    await page.close();
    await browser.close();
  }
}

(async () => {
  const rejectScenario = await runScenario({ preference: 'reject_all' });
  const acceptScenario = await runScenario({ preference: 'accept_all' });
  const customAllOnScenario = await runScenario({
    preference: 'custom',
    categoryPreferences: {
      functional: true,
      analytics: true,
      advertising: true,
      ccpaDoNotSell: false,
      uncategorized: 'accept',
    },
  });
  const customAllOnWithCcpaScenario = await runScenario({
    preference: 'custom',
    categoryPreferences: {
      functional: true,
      analytics: true,
      advertising: true,
      ccpaDoNotSell: true,
      uncategorized: 'accept',
    },
  });
  const overrideScenario = await runScenario({ preference: 'reject_all', alwaysAccept: true });

  console.log('--- BLOOMBERG REJECT ---');
  console.log(JSON.stringify(rejectScenario, null, 2));
  console.log('--- BLOOMBERG ACCEPT ALL ---');
  console.log(JSON.stringify(acceptScenario, null, 2));
  console.log('--- BLOOMBERG CUSTOM ALL ON ---');
  console.log(JSON.stringify(customAllOnScenario, null, 2));
  console.log('--- BLOOMBERG CUSTOM ALL ON + CCPA OPT-OUT ---');
  console.log(JSON.stringify(customAllOnWithCcpaScenario, null, 2));
  console.log('--- BLOOMBERG OVERRIDE ---');
  console.log(JSON.stringify(overrideScenario, null, 2));

  assert(Object.keys(rejectScenario.localState.unsupportedSites || {}).length > 0, 'Bloomberg reject should record unsupported warning');
  assert(!acceptScenario.pageState.modalVisible, `Bloomberg accept_all should dismiss modal. Diagnostic: ${JSON.stringify(acceptScenario, null, 2)}`);
  assert(Object.keys(acceptScenario.localState.unsupportedSites || {}).length === 0, `Bloomberg accept_all should not leave unsupported warning. Diagnostic: ${JSON.stringify(acceptScenario, null, 2)}`);
  assert(!customAllOnScenario.pageState.modalVisible, `Bloomberg custom-all-on should dismiss modal. Diagnostic: ${JSON.stringify(customAllOnScenario, null, 2)}`);
  assert(Object.keys(customAllOnScenario.localState.unsupportedSites || {}).length === 0, `Bloomberg custom-all-on should not leave unsupported warning. Diagnostic: ${JSON.stringify(customAllOnScenario, null, 2)}`);
  assert(!customAllOnWithCcpaScenario.pageState.modalVisible, `Bloomberg custom-all-on with CCPA opt-out should dismiss modal. Diagnostic: ${JSON.stringify(customAllOnWithCcpaScenario, null, 2)}`);
  assert(Object.keys(customAllOnWithCcpaScenario.localState.unsupportedSites || {}).length === 0, `Bloomberg custom-all-on with CCPA opt-out should not leave unsupported warning. Diagnostic: ${JSON.stringify(customAllOnWithCcpaScenario, null, 2)}`);
  assert(!overrideScenario.pageState.modalVisible, `Bloomberg override should dismiss modal. Diagnostic: ${JSON.stringify(overrideScenario, null, 2)}`);
  assert(Object.keys(overrideScenario.localState.unsupportedSites || {}).length === 0, `Bloomberg override should not leave unsupported warning. Diagnostic: ${JSON.stringify(overrideScenario, null, 2)}`);

  console.log('PASS Bloomberg exception flow');
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
