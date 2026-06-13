#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const PROBE_RUNS_DIR = path.resolve(process.cwd(), '.tmp-vpn-runs');
const EXT_LAUNCH_DIR = path.join(os.tmpdir(), 'emc-extension-no-spaces');

function getSystemChromeExecutable() {
  if (process.env.CHROME_EXECUTABLE) return process.env.CHROME_EXECUTABLE;
  switch (process.platform) {
    case 'darwin':  return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    case 'linux':   return '/usr/bin/google-chrome';
    case 'win32':   return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    default:        return null;
  }
}

function parseArg(name, fallback = '') {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function parseList(value, fallback = []) {
  if (!value) return fallback;
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseBoolean(value, fallback) {
  if (value === '') return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

function tryDecodeCookieValue(value) {
  if (typeof value !== 'string' || !value) return null;
  const candidates = [value];
  try {
    candidates.push(decodeURIComponent(value));
  } catch (_) {}

  for (const candidate of candidates) {
    try {
      const decoded = Buffer.from(candidate, 'base64').toString('utf8');
      if (decoded && /^[\[{]/.test(decoded.trim())) {
        JSON.parse(decoded);
        return decoded;
      }
    } catch (_) {}
  }

  for (const candidate of candidates) {
    try {
      if (/^[\[{]/.test(candidate.trim())) {
        JSON.parse(candidate);
        return candidate;
      }
    } catch (_) {}
  }

  return null;
}

function clearChromeSingletonFiles(profileDir) {
  for (const name of ['SingletonLock', 'SingletonSocket', 'SingletonCookie', 'DevToolsActivePort', 'RunningChromeVersion']) {
    try {
      fs.rmSync(path.join(profileDir, name), { force: true, recursive: true });
    } catch (_) {}
  }
}

function prepareExtensionLaunchDir(extDir) {
  try {
    fs.rmSync(EXT_LAUNCH_DIR, { force: true });
  } catch (_) {}
  try {
    fs.symlinkSync(extDir, EXT_LAUNCH_DIR);
    return EXT_LAUNCH_DIR;
  } catch (_) {
    return extDir;
  }
}

function buildCategoryPreferences(globalPreference, overrides = {}) {
  const accept = globalPreference === 'accept_all';
  return {
    functional: overrides.functional ?? true,
    analytics: overrides.analytics ?? accept,
    advertising: overrides.advertising ?? accept,
    ccpaDoNotSell: overrides.ccpaDoNotSell ?? !accept,
    uncategorized: overrides.uncategorized ?? (accept ? 'accept' : 'reject'),
  };
}

async function writePreferences(browser, payload, vpnExt) {
  const vpnExtId = vpnExt ? path.basename(path.dirname(vpnExt)) : null;
  const findOurSw = () => {
    const all = browser.serviceWorkers();
    return all.find((w) => !vpnExtId || !w.url().includes(vpnExtId)) ?? all[0] ?? null;
  };

  let sw = findOurSw();
  if (!sw) {
    const deadline = Date.now() + 4000;
    while (!sw && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      sw = findOurSw();
    }
  }
  if (sw) {
    await sw.evaluate((data) => new Promise((resolve) => chrome.storage.sync.set(data, resolve)), payload);
    return;
  }

  const pages = browser.pages();
  const extPage = pages.find((p) => p.url().startsWith('chrome-extension://'));
  if (extPage) {
    await extPage.evaluate((data) => new Promise((resolve) => chrome.storage.sync.set(data, resolve)), payload).catch(() => {});
  }
}

function createFreshVpnRunProfile(baseProfileDir) {
  fs.mkdirSync(PROBE_RUNS_DIR, { recursive: true });
  const runProfileDir = fs.mkdtempSync(path.join(PROBE_RUNS_DIR, 'probe-'));
  const transientNames = new Set([
    'SingletonLock',
    'SingletonSocket',
    'SingletonCookie',
    'DevToolsActivePort',
    'RunningChromeVersion',
  ]);

  for (const entry of fs.readdirSync(baseProfileDir)) {
    if (transientNames.has(entry)) continue;
    try {
      fs.cpSync(
        path.join(baseProfileDir, entry),
        path.join(runProfileDir, entry),
        { recursive: true, force: true },
      );
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }

  clearChromeSingletonFiles(runProfileDir);
  return runProfileDir;
}

async function main() {
  const url = parseArg('--url');
  if (!url) {
    throw new Error('Missing --url=');
  }

  const extDir = process.cwd();
  const vpnExt = parseArg('--vpn-ext');
  const profileDir = parseArg('--profile', path.join(extDir, '.tmp-vpn-profile'));
  const preference = parseArg('--preference', 'custom');
  const times = parseList(parseArg('--times', '5000,10000,15000,22000,30000,40000')).map((value) => Number(value)).filter(Number.isFinite);
  const selectors = parseList(parseArg('--selectors'));
  const ids = parseList(parseArg('--ids'));
  const cookieNames = parseList(parseArg('--cookies'));
  const payload = {
    globalPreference: preference,
    onboardingComplete: true,
    showBadgeCount: true,
    milestonesShown: [],
    categoryPreferences: buildCategoryPreferences(preference, {
      functional: parseBoolean(parseArg('--functional'), true),
      analytics: parseBoolean(parseArg('--analytics'), false),
      advertising: parseBoolean(parseArg('--advertising'), true),
      ccpaDoNotSell: parseBoolean(parseArg('--ccpaDoNotSell'), true),
      uncategorized: parseArg('--uncategorized', preference === 'accept_all' ? 'accept' : 'reject'),
    }),
  };

  clearChromeSingletonFiles(profileDir);
  const runProfileDir = createFreshVpnRunProfile(profileDir);

  const launchExtDir = prepareExtensionLaunchDir(extDir);
  const extensionArgs = [
    `--disable-extensions-except=${[vpnExt, launchExtDir].filter(Boolean).join(',')}`,
    `--load-extension=${[vpnExt, launchExtDir].filter(Boolean).join(',')}`,
  ];
  const launchOptions = {
    headless: false,
    args: extensionArgs,
  };
  const candidates = [
    getSystemChromeExecutable() ? { executablePath: getSystemChromeExecutable() } : null,
    { channel: 'chrome' },
    { channel: 'chromium' },
    {},
  ].filter(Boolean);
  let context = null;
  for (const candidate of candidates) {
    try {
      context = await chromium.launchPersistentContext(runProfileDir, { ...launchOptions, ...candidate });
      break;
    } catch (_) {}
  }
  if (!context) {
    context = await chromium.launchPersistentContext(runProfileDir, launchOptions);
  }
  const warmupPage = await context.newPage();
  await warmupPage.goto('https://example.com', { waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => {});
  await writePreferences(context, payload, vpnExt);
  await warmupPage.close().catch(() => {});

  const page = await context.newPage();
  const origin = new URL(url).origin;

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1000);
  await context.clearCookies().catch(() => {});
  const cdp = await context.newCDPSession(page);
  await cdp.send('Storage.clearDataForOrigin', {
    origin,
    storageTypes: 'all',
  }).catch(() => {});
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });

  let previous = 0;
  for (const ms of times) {
    await page.waitForTimeout(Math.max(0, ms - previous));
    previous = ms;

    const state = await page.evaluate(({ selectors, ids }) => {
      const isVisible = (el) => {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 &&
          rect.height > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          style.opacity !== '0';
      };

      const selectorState = selectors.map((selector) => {
        const el = document.querySelector(selector);
        return {
          selector,
          present: Boolean(el),
          visible: isVisible(el),
          height: el ? el.getBoundingClientRect().height : 0,
          text: el ? (el.innerText || '').trim().slice(0, 200) : '',
        };
      });

      const idState = ids.map((id) => {
        const el = document.getElementById(id);
        return {
          id,
          present: Boolean(el),
          checked: el instanceof HTMLInputElement ? Boolean(el.checked) : null,
          visible: isVisible(el),
        };
      });

      const buttons = [...document.querySelectorAll('button, a, input[type="button"], input[type="submit"]')]
        .map((el) => ({
          text: (el.innerText || el.value || '').trim(),
          id: el.id || '',
          className: typeof el.className === 'string' ? el.className : '',
          visible: isVisible(el),
        }))
        .filter((entry) => entry.visible && (entry.text || entry.id))
        .slice(0, 60);

      return {
        emcPref: document.documentElement.getAttribute('data-emc-pref'),
        emcMethod: document.documentElement.getAttribute('data-emc-method'),
        emcRun: document.documentElement.getAttribute('data-emc-run-signature'),
        selectorState,
        idState,
        buttons,
        body: document.body.innerText.slice(0, 800),
      };
    }, { selectors, ids });

    let cookies = [];
    if (cookieNames.length > 0) {
      const jar = await context.cookies(url);
      cookies = cookieNames.map((name) => {
        const match = jar.find((cookie) => cookie.name === name) ?? null;
        return match ? {
          name: match.name,
          domain: match.domain,
          path: match.path,
          sameSite: match.sameSite,
          secure: match.secure,
          value: match.value,
          decoded: tryDecodeCookieValue(match.value),
        } : {
          name,
          present: false,
        };
      });
    }

    console.log(JSON.stringify({ t: ms, ...state, cookies }));
  }

  await context.close();
  try {
    fs.rmSync(runProfileDir, { recursive: true, force: true });
  } catch (_) {}
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
