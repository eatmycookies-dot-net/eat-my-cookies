#!/usr/bin/env node
/**
 * Zoom.com OneTrust custom-preference + footer-link reopen test.
 *
 * Verifies:
 *   1. The extension correctly applies custom preferences via UpdateConsent
 *      (C0002:0 analytics off, C0003:1 functional on, C0004:0 advertising off).
 *   2. After handling, clicking the footer "Cookie Settings" / "Your Privacy
 *      Choices" link reopens the OneTrust preference center without page errors.
 *      (otBannerSdk.js crashed with removeAttribute on undefined when the
 *      extension's cleanup removed .onetrust-pc-dark-filter from the DOM.)
 *
 * Run: node tests/zoom-onetrust.js
 */

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const EXT_DIR = path.resolve(__dirname, '..');
const ZOOM_URL = 'https://www.zoom.com/en/';
const HANDLE_WAIT_MS = 12000;
const REOPEN_WAIT_MS = 8000;
const USE_VPN = process.argv.includes('--vpn');
const PREFERENCE_ARG = process.argv.find((arg) => arg.startsWith('--preference='));
const PREFERENCE = PREFERENCE_ARG?.slice('--preference='.length) ?? 'custom';
const VPN_EXT_DIR = path.resolve(__dirname, '..', '..', 'vpn-extension', 'omghfjlpggmjjaagoclmmobgdodcjboh');
const VPN_PROFILE_DIR = path.resolve(EXT_DIR, '.tmp-vpn-profile');
const VPN_RUNS_DIR = path.resolve(EXT_DIR, '.tmp-vpn-runs');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function buildCategoryPreferences(preference = PREFERENCE) {
  if (preference === 'accept_all') {
    return { functional: true, analytics: true, advertising: true, ccpaDoNotSell: false, uncategorized: 'accept' };
  }
  if (preference === 'reject_all') {
    return { functional: false, analytics: false, advertising: false, ccpaDoNotSell: true, uncategorized: 'reject' };
  }
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

async function writePreferences(browser) {
  const payload = {
    globalPreference: PREFERENCE,
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
    const visible = await page.evaluate((candidateSelectors) => {
      for (const selector of candidateSelectors) {
        for (const el of document.querySelectorAll(selector)) {
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          if (rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden') {
            return selector;
          }
        }
      }
      return null;
    }, selectors).catch(() => null);
    if (visible) return visible;
    await page.waitForTimeout(200);
  }
  return null;
}

async function waitForHidden(page, selectors, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const visible = await waitForVisible(page, selectors, 1);
    if (!visible) return true;
    await page.waitForTimeout(100);
  }
  return !(await waitForVisible(page, selectors, 1));
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

    return {
      groups,
      activeGroups: typeof window.OnetrustActiveGroups === 'string' ? window.OnetrustActiveGroups : null,
      zoomFooterGuardEvents: window.__emcZoomOneTrustFooterGuardEvents ?? [],
      zoomFooterStyleChanges: window.__emcZoomOneTrustFooterStyleChanges ?? [],
      scrollY: Math.round(window.scrollY),
      pcPresent: Boolean(document.querySelector('#onetrust-pc-sdk')),
      pcVisible: isVisible(document.querySelector('#onetrust-pc-sdk')),
      pcRect: (() => {
        const rect = document.querySelector('#onetrust-pc-sdk')?.getBoundingClientRect();
        return rect ? { width: rect.width, height: rect.height } : null;
      })(),
      darkFilterPresent: Boolean(document.querySelector('.onetrust-pc-dark-filter')),
      darkFilterVisible: isVisible(document.querySelector('.onetrust-pc-dark-filter')),
      oneTrustMethods: Object.keys(window.OneTrust ?? {}).filter((key) => /toggle|close|consent|init|render/i.test(key)),
      optanonMethods: Object.keys(window.Optanon ?? {}).filter((key) => /toggle|close|consent|init|render/i.test(key)),
      emc: {
        runSignature: document.documentElement.dataset.emcRunSignature ?? null,
        preference: document.documentElement.dataset.emcPref ?? null,
        navigationType: performance.getEntriesByType('navigation')[0]?.type ?? null,
        sessionKeys: Object.fromEntries(
          Object.keys(sessionStorage)
            .filter((key) => key.startsWith('__emc_handled__'))
            .map((key) => [key, sessionStorage.getItem(key)]),
        ),
      },
      pcMarkup: (() => {
        const pc = document.querySelector('#onetrust-pc-sdk');
        if (!pc) return null;
        return {
          className: pc.className,
          style: pc.getAttribute('style'),
          parentClassName: pc.parentElement?.className ?? null,
          parentStyle: pc.parentElement?.getAttribute('style') ?? null,
        };
      })(),
    };
  });
}

async function reopenCookieSettings(page, index = 0) {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight || document.body.scrollHeight || 0));
  await page.waitForTimeout(150);

  const footerOpeners = page.locator('.ot-sdk-show-settings');
  const footerOpener = footerOpeners.nth(index);
  if (!(await footerOpener.isVisible().catch(() => false))) {
    return {
      clicked: false,
      reason: `footer_privacy_link_${index}_not_clickable`,
      diagnostics: await readZoomFooterDiagnostics(page),
    };
  }

  await footerOpener.scrollIntoViewIfNeeded();
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    const changes = [];
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        changes.push({
          id: record.target.id,
          className: String(record.target.className),
          style: record.target.getAttribute('style'),
          at: Date.now(),
        });
      }
    });
    for (const el of document.querySelectorAll('#onetrust-pc-sdk, .onetrust-pc-dark-filter')) {
      observer.observe(el, { attributes: true, attributeFilter: ['style', 'class'] });
    }
    window.__emcZoomOneTrustFooterStyleChanges = changes;
  });
  const beforeClickScrollY = await page.evaluate(() => Math.round(window.scrollY));
  const clicked = (await footerOpener.textContent())?.replace(/\s+/g, ' ').trim() || 'Zoom footer privacy link';
  const clickStartedAt = Date.now();
  await footerOpener.click();

  if (!clicked) {
    return {
      clicked: false,
      reason: 'footer_privacy_link_empty_label',
      diagnostics: await readZoomFooterDiagnostics(page),
    };
  }
  const visible = await waitForVisible(page, ['#onetrust-pc-sdk', '.onetrust-pc-dark-filter'], REOPEN_WAIT_MS);
  const after = await readOneTrustState(page);
  return {
    clicked: true,
    selector: clicked,
    beforeClickScrollY,
    afterClickScrollY: after.scrollY,
    modalVisible: Boolean(visible),
    openedAfterMs: Date.now() - clickStartedAt,
    after,
  };
}

async function readZoomFooterDiagnostics(page) {
  return page.evaluate(() => {
    const isVisible = (el) => {
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const rows = Array.from(document.querySelectorAll('[data-emc-zoom-onetrust-opener], #ot-do-not-sell, .ot-sdk-show-settings, footer a, footer button, footer [role="button"]'))
      .filter((el) => /privacy|cookie|settings|choices/i.test([el.textContent, el.id, el.className].join(' ')))
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          tag: el.tagName,
          id: el.id,
          className: String(el.className),
          href: el.getAttribute('href'),
          outerHTML: el.outerHTML.slice(0, 600),
          text: (el.textContent || '').replace(/\s+/g, ' ').trim(),
          visible: isVisible(el),
          rect: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
        };
      });
    return {
      url: location.href,
      scrollY: Math.round(window.scrollY),
      innerHeight: window.innerHeight,
      scrollHeight: document.documentElement.scrollHeight,
      overlayAttempts: window.__emcZoomOneTrustFooterOverlayAttempts ?? 0,
      overlayCount: window.__emcZoomOneTrustFooterOverlayCount ?? 0,
      overlayNodes: document.querySelectorAll('[data-emc-zoom-onetrust-opener]').length,
      rows,
    };
  });
}

async function waitForCorrectGroups(page, expectedGroups, timeoutMs = 15000) {
  const started = Date.now();
  let lastState = await readOneTrustState(page);
  while (Date.now() - started < timeoutMs) {
    if (oneTrustGroupsMatch(lastState, expectedGroups)) {
      return lastState;
    }
    await page.waitForTimeout(250);
    lastState = await readOneTrustState(page);
  }
  return lastState;
}

function oneTrustGroupsMatch(state, expectedGroups) {
  const rawGroups = state.groups ?? '';
  const activeGroups = state.activeGroups ?? '';
  return Object.entries(expectedGroups).every(([id, enabled]) => {
    const cookieToken = `${id}:${enabled ? '1' : '0'}`;
    if (rawGroups.includes(cookieToken)) return true;
    return enabled ? activeGroups.includes(id) : !activeGroups.includes(id);
  });
}

async function closeReopenedCookieSettings(page) {
  const selectors = [
    '#onetrust-pc-sdk .ot-close-icon',
    '#onetrust-pc-sdk .onetrust-close-btn-handler',
    '#onetrust-pc-sdk [aria-label="Close"]',
    '#onetrust-pc-sdk button:has-text("Close")',
    '.onetrust-close-btn-handler',
  ];
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.isVisible().catch(() => false)) {
      await locator.click({ timeout: 5000 });
      await page.waitForTimeout(1000);
      return { selector };
    }
  }
  return null;
}

async function readZoomCloseDiagnostics(page) {
  return page.evaluate(() => {
    const rows = [];
    for (const el of document.querySelectorAll('#onetrust-pc-sdk button, #onetrust-pc-sdk a, #onetrust-pc-sdk [role="button"], #onetrust-pc-sdk .ot-close-icon, #onetrust-pc-sdk .onetrust-close-btn-handler')) {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      rows.push({
        tag: el.tagName,
        id: el.id,
        className: String(el.className),
        ariaLabel: el.getAttribute('aria-label'),
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 100),
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        display: style.display,
        visibility: style.visibility,
        pointerEvents: style.pointerEvents,
      });
    }
    return rows;
  });
}

async function runScenario(browser) {
  await browser.clearCookies();
  await writePreferences(browser);

  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  try {
    await page.goto(ZOOM_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const expectedGroups = PREFERENCE === 'accept_all'
      ? { C0001: true, C0002: true, C0003: true, C0004: true }
      : PREFERENCE === 'reject_all'
        ? { C0001: true, C0002: false, C0003: false, C0004: false }
        : { C0001: true, C0002: false, C0003: true, C0004: false };
    const before = await waitForCorrectGroups(page, expectedGroups, HANDLE_WAIT_MS);
    const beforeGroups = before.activeGroups ?? before.groups;
    assert(
      oneTrustGroupsMatch(before, expectedGroups),
      `Expected ${JSON.stringify(expectedGroups)}, saw: ${JSON.stringify(before)}`,
    );
    assert(
      await waitForHidden(page, ['#onetrust-pc-sdk', '.onetrust-pc-dark-filter'], 5000),
      'Expected preference center to be visually hidden after handling.',
    );

    const errorCountBeforeReopen = pageErrors.length;
    const reopenMethod = await reopenCookieSettings(page);
    assert(
      reopenMethod?.clicked || reopenMethod?.selector === 'already_visible',
      `Could not click Zoom footer "Cookie Settings" / "Your Privacy Choices" link: ${JSON.stringify(reopenMethod)}`,
    );

    await page.waitForTimeout(2000);
    const after = await readOneTrustState(page);

    const reopenErrors = pageErrors.slice(errorCountBeforeReopen);
    assert(
      reopenErrors.length === 0,
      `Footer link triggered page errors: ${reopenErrors.join(' | ')}; state=${JSON.stringify(after)}`,
    );

    assert(
      after.pcVisible || after.darkFilterVisible,
      `Expected footer link to reopen the OneTrust preference center after clicking ${reopenMethod.selector}; beforeScroll=${reopenMethod.beforeClickScrollY}, afterScroll=${after.scrollY}, state=${JSON.stringify(after)}`,
    );
    assert(
      after.scrollY >= Math.max(0, reopenMethod.beforeClickScrollY - 100),
      `Expected Zoom footer opener not to jump to top, before=${reopenMethod.beforeClickScrollY}, after=${after.scrollY}, events=${JSON.stringify(after.zoomFooterGuardEvents)}`,
    );
    assert(
      !after.pcVisible || (after.pcRect?.height ?? 0) >= 400,
      `Expected reopened Zoom preference center to have usable height, saw ${JSON.stringify(after.pcRect)}`,
    );

    const closeMethod = await closeReopenedCookieSettings(page);
    assert(
      closeMethod,
      `Expected reopened Zoom preference center to expose a usable close control; state=${JSON.stringify(after)}, controls=${JSON.stringify(await readZoomCloseDiagnostics(page))}`,
    );
    const closed = await readOneTrustState(page);
    assert(
      !closed.pcVisible && !closed.darkFilterVisible,
      `Expected reopened Zoom preference center to close after ${closeMethod.selector}, state=${JSON.stringify(closed)}`,
    );

    const secondReopen = await reopenCookieSettings(page);
    assert(
      secondReopen?.clicked || secondReopen?.selector === 'already_visible',
      `Could not reopen Zoom OneTrust a second time: ${JSON.stringify(secondReopen)}`,
    );
    const secondState = await readOneTrustState(page);
    assert(
      secondState.pcVisible || secondState.darkFilterVisible,
      `Expected Zoom OneTrust to reopen a second time, state=${JSON.stringify(secondState)}`,
    );
    const secondClose = await closeReopenedCookieSettings(page);
    assert(secondClose, 'Expected the second Zoom OneTrust reopen to expose a usable close control.');
    const secondClosed = await readOneTrustState(page);
    assert(
      !secondClosed.pcVisible && !secondClosed.darkFilterVisible,
      `Expected the second Zoom OneTrust reopen to close, state=${JSON.stringify(secondClosed)}`,
    );

    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    assert(
      await waitForHidden(page, ['#onetrust-pc-sdk', '.onetrust-pc-dark-filter'], 5000),
      'Expected Zoom OneTrust to remain closed after a manual reload.',
    );
    const reloadStateBeforeFooterClick = await readOneTrustState(page);
    const reloadedReopen = await reopenCookieSettings(page);
    assert(
      reloadedReopen?.modalVisible,
      `Expected the first footer click after reload to reopen Zoom OneTrust: before=${JSON.stringify(reloadStateBeforeFooterClick)}, after=${JSON.stringify(reloadedReopen)}`,
    );
    assert(
      reloadedReopen.openedAfterMs < 1500,
      `Expected the first footer click after reload to open promptly, took ${reloadedReopen.openedAfterMs}ms.`,
    );
    const reloadClose = await closeReopenedCookieSettings(page);
    assert(reloadClose, 'Expected the post-reload Zoom OneTrust modal to expose a usable close control.');
    const reloadedCookieSettings = await reopenCookieSettings(page, 1);
    assert(
      reloadedCookieSettings?.modalVisible,
      `Expected Zoom Cookie Settings to reopen after reload: ${JSON.stringify(reloadedCookieSettings)}`,
    );
    assert(
      reloadedCookieSettings.openedAfterMs < 1500,
      `Expected Zoom Cookie Settings to open promptly after reload, took ${reloadedCookieSettings.openedAfterMs}ms.`,
    );
    const cookieSettingsClose = await closeReopenedCookieSettings(page);
    assert(cookieSettingsClose, 'Expected post-reload Zoom Cookie Settings to expose a usable close control.');

    console.log(`PASS Zoom ${PREFERENCE} reopen: groups=${beforeGroups} via both native footer controls`);
  } finally {
    await page.close();
  }
}

async function main() {
  if (USE_VPN && (!fs.existsSync(VPN_EXT_DIR) || !fs.existsSync(VPN_PROFILE_DIR))) {
    throw new Error('Zoom VPN test requires the configured Browsec extension and .tmp-vpn-profile.');
  }

  const userDataDir = USE_VPN
    ? (() => {
        fs.mkdirSync(VPN_RUNS_DIR, { recursive: true });
        const runDir = fs.mkdtempSync(path.join(VPN_RUNS_DIR, 'zoom-'));
        fs.cpSync(VPN_PROFILE_DIR, runDir, { recursive: true });
        return runDir;
      })()
    : '';
  const extPaths = USE_VPN ? [EXT_DIR, VPN_EXT_DIR] : [EXT_DIR];
  const browser = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${extPaths.join(',')}`,
      `--load-extension=${extPaths.join(',')}`,
      '--no-sandbox',
    ],
    viewport: { width: 1600, height: 1100 },
  });

  try {
    if (USE_VPN) await new Promise((resolve) => setTimeout(resolve, 4000));
    await runScenario(browser);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
