#!/usr/bin/env node
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const EXT_DIR = path.resolve(__dirname, '..');
const SITE_URL = 'https://www.embracepetinsurance.com/';
const args = process.argv.slice(2);
const USE_VPN = args.includes('--vpn');
const VPN_EXT_DIR = process.env.EMC_VPN_EXT ||
  '/Users/nextwave/Library/Application Support/Google/Chrome/Default/Extensions/omghfjlpggmjjaagoclmmobgdodcjboh/3.93.2_0';
const VPN_PROFILE_DIR = path.resolve(__dirname, '..', '.tmp-vpn-profile');
const BROWSER_HOME_DIR = path.resolve(
  __dirname,
  '..',
  USE_VPN ? '.tmp-browser-home-embrace-vpn' : '.tmp-browser-home-embrace-us',
);

const US_SCENARIOS = [
  {
    name: 'reject_all + ccpa off',
    preference: 'reject_all',
    categoryPreferences: {
      functional: false,
      analytics: false,
      advertising: false,
      ccpaDoNotSell: false,
      uncategorized: 'reject',
    },
    expect: {
      bannerGone: true,
      ccpa: false,
      targetedAdvertising: false,
      personalization: false,
      analytics: false,
    },
  },
  {
    name: 'accept_all + ccpa on',
    preference: 'accept_all',
    categoryPreferences: {
      functional: true,
      analytics: true,
      advertising: true,
      ccpaDoNotSell: true,
      uncategorized: 'accept',
    },
    expect: {
      bannerGone: true,
      ccpa: true,
      targetedAdvertising: false,
      personalization: true,
      analytics: true,
    },
  },
  {
    name: 'custom mixed',
    preference: 'custom',
    categoryPreferences: {
      functional: true,
      analytics: false,
      advertising: false,
      ccpaDoNotSell: true,
      uncategorized: 'reject',
    },
    expect: {
      bannerGone: true,
      ccpa: true,
      targetedAdvertising: false,
      personalization: true,
      analytics: false,
    },
  },
];

const VPN_SCENARIOS = [
  {
    name: 'reject_all + ccpa off',
    preference: 'reject_all',
    categoryPreferences: {
      functional: false,
      analytics: false,
      advertising: false,
      ccpaDoNotSell: false,
      uncategorized: 'reject',
    },
    expect: {
      bannerGone: true,
      ccpa: false,
      targetedAdvertising: false,
      personalization: false,
      analytics: false,
    },
  },
  {
    name: 'reject_all + ccpa on',
    preference: 'reject_all',
    categoryPreferences: {
      functional: false,
      analytics: false,
      advertising: false,
      ccpaDoNotSell: true,
      uncategorized: 'reject',
    },
    expect: {
      bannerGone: true,
      ccpa: true,
      targetedAdvertising: false,
      personalization: false,
      analytics: false,
    },
  },
  {
    name: 'accept_all + ccpa on',
    preference: 'accept_all',
    categoryPreferences: {
      functional: true,
      analytics: true,
      advertising: true,
      ccpaDoNotSell: true,
      uncategorized: 'accept',
    },
    expect: {
      bannerGone: true,
      ccpa: true,
      targetedAdvertising: false,
      personalization: true,
      analytics: true,
    },
  },
  {
    name: 'custom mixed',
    preference: 'custom',
    categoryPreferences: {
      functional: true,
      analytics: false,
      advertising: false,
      ccpaDoNotSell: true,
      uncategorized: 'reject',
    },
    expect: {
      bannerGone: true,
      ccpa: true,
      targetedAdvertising: false,
      personalization: true,
      analytics: false,
    },
  },
];

const SCENARIOS = USE_VPN ? VPN_SCENARIOS : US_SCENARIOS;

const OSANO_ROOT_SELECTOR = '.osano-cm-dialog, .osano-cm-window, .osano-cm-widget, .osano-cm-info-dialog, .osano-cm-info-views, .osano-cm-view';

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function launchBrowser() {
  const extPaths = USE_VPN ? [EXT_DIR, VPN_EXT_DIR] : [EXT_DIR];
  const userDataDir = USE_VPN ? VPN_PROFILE_DIR : '';
  return chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${extPaths.join(',')}`,
      `--load-extension=${extPaths.join(',')}`,
      '--no-sandbox',
    ],
    env: {
      ...process.env,
      HOME: BROWSER_HOME_DIR,
    },
    viewport: { width: 1440, height: 1100 },
  });
}

async function writePreferences(browser, scenario) {
  const payload = {
    globalPreference: scenario.preference,
    onboardingComplete: true,
    showBadgeCount: true,
    categoryPreferences: scenario.categoryPreferences,
    milestonesShown: [],
  };

  const allSws = browser.serviceWorkers();
  const vpnExtId = USE_VPN ? path.basename(path.dirname(VPN_EXT_DIR)) : null;
  const sw = allSws.find((worker) => !vpnExtId || !worker.url().includes(vpnExtId)) ?? allSws[0];
  if (sw) {
    await sw.evaluate((data) => new Promise((resolve) => chrome.storage.sync.set(data, resolve)), payload);
    return;
  }

  const page = await browser.newPage();
  try {
    const extPage = browser.pages().find((p) => p.url().startsWith('chrome-extension://'));
    if (extPage) {
      await extPage.evaluate((data) => new Promise((resolve) => chrome.storage.sync.set(data, resolve)), payload);
    }
  } finally {
    await page.close().catch(() => {});
  }
}

async function clearOriginState(page) {
  const session = await page.context().newCDPSession(page);
  await session.send('Storage.clearDataForOrigin', {
    origin: 'https://www.embracepetinsurance.com',
    storageTypes: 'all',
  }).catch(() => {});
}

async function readVisibleState(page) {
  return page.evaluate((rootSelector) => {
    const isVisible = (el) => {
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };

    const visibleRoots = [...document.querySelectorAll(rootSelector)]
      .filter((el) => isVisible(el));
    const bestRoot = visibleRoots
      .map((root) => ({
        root,
        score: root.querySelectorAll('input[type="checkbox"], [role="switch"], button[aria-checked], [aria-checked][tabindex]').length,
      }))
      .sort((a, b) => b.score - a.score)[0]?.root ?? document;

    const readToggle = (labelPattern, categories = []) => {
      const controls = bestRoot.querySelectorAll('input[type="checkbox"], [role="switch"], button[aria-checked], [aria-checked][tabindex]');
      for (const control of controls) {
        const fragments = [];
        if (control.getAttribute?.('aria-label')) fragments.push(control.getAttribute('aria-label'));
        for (const id of (control.getAttribute?.('aria-labelledby') ?? '').split(/\s+/).filter(Boolean)) {
          const labelEl = document.getElementById(id);
          if (labelEl) fragments.push(labelEl.textContent ?? '');
        }
        for (const label of Array.from(control.labels ?? [])) fragments.push(label.textContent ?? '');
        const closestLabel = control.closest?.('label');
        if (closestLabel) fragments.push(closestLabel.textContent ?? '');
        if (control.parentElement?.textContent) fragments.push(control.parentElement.textContent);
        const label = fragments.join(' ').replace(/\s+/g, ' ').trim().toLowerCase();
        const identity = [
          control.id ?? '',
          control.getAttribute?.('name') ?? '',
          control.getAttribute?.('data-category') ?? '',
          control.getAttribute?.('aria-describedby') ?? '',
          control.getAttribute?.('aria-labelledby') ?? '',
        ].join(' ').toLowerCase();
        const labelMatch = labelPattern.test(label);
        const categoryMatch = categories.some((category) => identity.includes(category));
        if (!labelMatch && !categoryMatch) continue;
        if (control instanceof HTMLInputElement) return Boolean(control.checked);
        const aria = control.getAttribute?.('aria-checked');
        return aria == null ? null : aria === 'true';
      }
      return null;
    };

    const runtimeState = (() => {
      try {
        const cm = window.Osano?.cm;
        if (!cm) return null;
        const consent = typeof cm.getConsent === 'function' ? cm.getConsent() : null;
        return {
          marketing: cm.marketing ?? consent?.marketing ?? null,
          personalization: cm.personalization ?? consent?.personalization ?? null,
          analytics: cm.analytics ?? consent?.analytics ?? null,
          optOut: cm.optOut ?? consent?.optOut ?? null,
        };
      } catch (_) {
        return null;
      }
    })();

    const ccpa = readToggle(/\bdo not sell\b|\bdo not sell or share\b|\bccpa\b/i, ['opt_out', 'ccpa', 'do_not_sell', 'sale_opt_out']);
    const targetedAdvertising = readToggle(/\btarget(?:ed|ing)? advertising\b|\badvertising\b|\bmarketing\b/i, ['advertising', 'marketing', 'targeting']);
    const personalization = readToggle(/\bpersonali[sz]ation\b|\bpreferences?\b|\bfunctional\b/i, ['personalization', 'personalisation', 'preferences', 'functional']);
    const analytics = readToggle(/\banalytics?\b|\bmeasurement\b|\bperformance\b/i, ['analytics', 'measurement', 'performance', 'statistics']);

    return {
      bannerVisible: isVisible(document.querySelector(rootSelector)),
      ccpa: ccpa ?? runtimeState?.optOut ?? null,
      targetedAdvertising: targetedAdvertising ?? runtimeState?.marketing ?? null,
      personalization: personalization ?? runtimeState?.personalization ?? null,
      analytics: analytics ?? runtimeState?.analytics ?? null,
    };
  }, OSANO_ROOT_SELECTOR);
}

async function dumpVisibleControls(page) {
  return page.evaluate((rootSelector) => {
    const isVisible = (el) => {
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };

    const visibleRoots = [...document.querySelectorAll(rootSelector)]
      .filter((el) => isVisible(el));
    const bestRoot = visibleRoots
      .map((root) => ({
        root,
        score: root.querySelectorAll('input[type="checkbox"], [role="switch"], button[aria-checked], [aria-checked][tabindex]').length,
      }))
      .sort((a, b) => b.score - a.score)[0]?.root ?? document;

    return [...bestRoot.querySelectorAll('input[type="checkbox"], [role="switch"], button[aria-checked], [aria-checked][tabindex]')].map((control) => {
      const fragments = [];
      if (control.getAttribute?.('aria-label')) fragments.push(control.getAttribute('aria-label'));
      for (const id of (control.getAttribute?.('aria-labelledby') ?? '').split(/\s+/).filter(Boolean)) {
        const labelEl = document.getElementById(id);
        if (labelEl) fragments.push(labelEl.textContent ?? '');
      }
      for (const label of Array.from(control.labels ?? [])) fragments.push(label.textContent ?? '');
      const closestLabel = control.closest?.('label');
      if (closestLabel) fragments.push(closestLabel.textContent ?? '');
      if (control.parentElement?.textContent) fragments.push(control.parentElement.textContent);
      return {
        label: fragments.join(' ').replace(/\s+/g, ' ').trim(),
        id: control.id ?? '',
        name: control.getAttribute?.('name') ?? '',
        dataCategory: control.getAttribute?.('data-category') ?? '',
        ariaDescribedBy: control.getAttribute?.('aria-describedby') ?? '',
        ariaLabelledBy: control.getAttribute?.('aria-labelledby') ?? '',
        checked: control instanceof HTMLInputElement
          ? Boolean(control.checked)
          : control.getAttribute?.('aria-checked'),
      };
    });
  }, OSANO_ROOT_SELECTOR);
}

async function readConsentArtifacts(page) {
  const cookies = await page.context().cookies(SITE_URL);
  const localState = await page.evaluate(() => ({
    localStorage: Object.fromEntries(Object.entries(localStorage).filter(([key]) => /osano|consent|cookie/i.test(key))),
    sessionStorage: Object.fromEntries(Object.entries(sessionStorage).filter(([key]) => /osano|consent|cookie/i.test(key))),
    emcPref: document.documentElement.dataset.emcPref ?? null,
    emcRunSignature: document.documentElement.dataset.emcRunSignature ?? null,
    emcOsanoDebug: document.documentElement.dataset.emcOsanoDebug ?? null,
    osanoGlobals: Object.keys(window).filter((key) => /osano/i.test(key)),
    osanoSnapshot: (() => {
      const osano = window.Osano;
      if (!osano) return null;
      const snapshot = {};
      for (const key of Object.keys(osano)) {
        const value = osano[key];
        if (value == null) {
          snapshot[key] = value;
          continue;
        }
        if (typeof value === 'function') {
          snapshot[key] = '[function]';
          continue;
        }
        if (typeof value === 'object') {
          snapshot[key] = Object.keys(value).slice(0, 20);
          continue;
        }
        snapshot[key] = value;
      }
      try {
        const cm = osano.cm;
        snapshot.__cmOwnKeys = cm ? Object.getOwnPropertyNames(cm) : [];
        snapshot.__cmProtoKeys = cm ? Object.getOwnPropertyNames(Object.getPrototypeOf(cm) ?? {}) : [];
        snapshot.__cmState = cm ? {
          marketing: cm.marketing ?? null,
          personalization: cm.personalization ?? null,
          analytics: cm.analytics ?? null,
          optOut: cm.optOut ?? null,
          consent: typeof cm.getConsent === 'function' ? cm.getConsent() : null,
        } : null;
      } catch (_) {}
      return snapshot;
    })(),
  })).catch(() => ({ localStorage: {}, sessionStorage: {} }));
  return {
    cookies: cookies
      .filter((cookie) => /osano|consent|cookie/i.test(cookie.name))
      .map(({ name, value }) => ({ name, value })),
    ...localState,
  };
}

async function openStoragePreferences(page) {
  const hasVisibleRoot = async () => page.evaluate((rootSelector) => {
    const isVisible = (el) => {
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    return [...document.querySelectorAll(rootSelector)].some((el) => isVisible(el));
  }, OSANO_ROOT_SELECTOR);

  const selectors = [
    'text=Storage Preferences',
    'text=Manage Preferences',
    '.osano-cm-link--type_manage',
    'button.osano-cm-link--type_manage',
    'button[aria-label*="Cookie Preferences" i]',
    'button[title*="Cookie Preferences" i]',
    'button[aria-label*="Privacy Choices" i]',
  ];
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.isVisible().catch(() => false)) {
      await locator.click({ timeout: 3000 }).catch(() => {});
      await delay(1200);
      if (await hasVisibleRoot()) return true;
    }
  }
  const forcedOpen = await page.evaluate(() => {
    const candidates = [...document.querySelectorAll('button, a, [role="button"]')];
    const priorities = [
      /(Storage Preferences|Manage Preferences|Cookie Preferences)/i,
      /(Privacy Choices|Do Not Sell)/i,
    ];
    for (const pattern of priorities) {
      for (const candidate of candidates) {
        const text = candidate.textContent?.replace(/\s+/g, ' ').trim() ?? '';
        const aria = candidate.getAttribute?.('aria-label') ?? '';
        const title = candidate.getAttribute?.('title') ?? '';
        const haystack = `${text} ${aria} ${title}`;
        if (!pattern.test(haystack)) continue;
        candidate.click?.();
        return true;
      }
    }
    return false;
  });
  if (forcedOpen) {
    await delay(1500);
    if (await hasVisibleRoot()) return true;
  }
  return false;
}

async function runScenario(browser, scenario) {
  const page = await browser.newPage();
  try {
    await clearOriginState(page);
    await writePreferences(browser, scenario);
    await page.goto(SITE_URL, { waitUntil: 'domcontentloaded', timeout: USE_VPN ? 90000 : 30000 });
    await delay(USE_VPN ? 12000 : 9000);

    let state = await readVisibleState(page);
    let reopened = false;
    if (state.bannerVisible || state.ccpa == null) {
      reopened = await openStoragePreferences(page);
      await delay(1500);
      state = await readVisibleState(page);
    }

    const failures = [];
    if (scenario.expect.bannerGone && state.bannerVisible) failures.push('banner still visible');
    for (const [key, expected] of Object.entries(scenario.expect)) {
      if (key === 'bannerGone') continue;
      if (state[key] !== expected) failures.push(`${key} expected=${expected} actual=${state[key]}`);
    }

    return {
      name: scenario.name,
      ok: failures.length === 0,
      state,
      reopened,
      artifacts: failures.length === 0 ? { cookies: [], localStorage: {}, sessionStorage: {} } : await readConsentArtifacts(page),
      controls: failures.length === 0 ? [] : await dumpVisibleControls(page),
      failures,
    };
  } finally {
    await page.close().catch(() => {});
  }
}

(async () => {
  if (USE_VPN && !fs.existsSync(VPN_EXT_DIR)) {
    console.error(`VPN extension not found at ${VPN_EXT_DIR}`);
    process.exit(1);
  }
  const browser = await launchBrowser();
  const results = [];
  try {
    if (USE_VPN) {
      console.log(`VPN mode: using profile at ${VPN_PROFILE_DIR}`);
      await delay(4000);
    }
    console.log(`Embrace ${USE_VPN ? 'VPN' : 'US'} headed scenarios`);
    for (const scenario of SCENARIOS) {
      const result = await runScenario(browser, scenario);
      results.push(result);
      console.log(JSON.stringify(result));
    }
  } finally {
    await browser.close().catch(() => {});
  }

  const failed = results.filter((result) => !result.ok);
  if (failed.length) {
    console.error(`Failed ${failed.length} scenario(s).`);
    process.exit(1);
  }
})();
