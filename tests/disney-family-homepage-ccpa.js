#!/usr/bin/env node

const path = require('path');
const { chromium } = require('playwright');

const EXT_DIR = path.resolve(__dirname, '..');

const CASES = [
  { name: 'Disney reject_all', url: 'https://www.disney.com/', preference: 'reject_all', expected: '0' },
  { name: 'Disney accept_all + ccpa', url: 'https://www.disney.com/', preference: 'accept_all', expected: '1' },
  { name: 'ESPN reject_all', url: 'https://www.espn.com/', preference: 'reject_all', expected: '0' },
  { name: 'ESPN accept_all + ccpa', url: 'https://www.espn.com/', preference: 'accept_all', expected: '1' },
];

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
      ccpaDoNotSell: true,
      uncategorized: preference === 'accept_all' ? 'accept' : 'reject',
    },
  };
}

async function openHomepageModal(page) {
  await page.evaluate(() => {
    window.OneTrust?.ToggleInfoDisplay?.();
  });
}

async function readState(page) {
  return page.evaluate(() => {
    const ids = ['ot-group-id-BG559', 'ot-group-id-SSPD_BG', 'ot-group-id-C0004'];
    const toggle = ids.map((id) => document.getElementById(id)).find(Boolean);
    const cookie = document.cookie
      .split('; ')
      .find((part) => part.startsWith('OptanonConsent='))
      ?.slice('OptanonConsent='.length) || '';
    const groups = decodeURIComponent(cookie).match(/groups=([^&]+)/)?.[1] || '';
    return {
      toggleId: toggle?.id || null,
      checked: toggle ? !!toggle.checked : null,
      aria: toggle?.getAttribute('aria-checked') || null,
      groups,
      sdkVisible: !!document.querySelector('#onetrust-consent-sdk, #onetrust-pc-sdk'),
    };
  });
}

async function waitForExpectedState(page, expected, timeoutMs = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const state = await readState(page);
    if (state.groups.includes(`BG559:${expected}`) && String(Number(Boolean(state.checked))) === expected) {
      return state;
    }
    await page.waitForTimeout(250);
  }
  return readState(page);
}

async function main() {
  const browser = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${EXT_DIR}`,
      `--load-extension=${EXT_DIR}`,
      '--no-sandbox',
    ],
    viewport: { width: 1440, height: 980 },
  });

  try {
    await new Promise((resolve) => setTimeout(resolve, 4000));
    const extPage = browser.pages().find((page) => page.url().startsWith('chrome-extension://'));
    assert(extPage, 'Extension page did not load');

    for (const testCase of CASES) {
      await browser.clearCookies();
      await extPage.evaluate((payload) => new Promise((resolve) => chrome.storage.sync.set(payload, resolve)), preferencePayload(testCase.preference));

      const page = await browser.newPage();
      try {
        await page.goto(testCase.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(3000);
        await openHomepageModal(page);
        const state = await waitForExpectedState(page, testCase.expected);
        assert(
          state.groups.includes(`BG559:${testCase.expected}`),
          `${testCase.name} groups mismatch: ${JSON.stringify(state)}`
        );
        assert(
          String(Number(Boolean(state.checked))) === testCase.expected,
          `${testCase.name} toggle mismatch: ${JSON.stringify(state)}`
        );
        console.log(`PASS ${testCase.name}: ${state.groups}`);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
