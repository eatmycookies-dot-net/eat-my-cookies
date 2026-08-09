#!/usr/bin/env node
/**
 * Extension-level regression for modern Usercentrics shadow UI.
 *
 * This intentionally loads the unpacked extension in Chromium and verifies the
 * service-worker stats counter, not just the DOM handler return value.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const EXT_LAUNCH_DIR = path.join(os.tmpdir(), 'emc-extension-usercentrics-no-spaces');
const BROWSER_HOME_DIR = path.join(os.tmpdir(), 'emc-usercentrics-browser-home');
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'platform-consents', 'usercentrics-shadow.html');
const API_FIXTURE_PATH = path.join(__dirname, 'fixtures', 'platform-consents', 'usercentrics-api.html');

function statsDefaults() {
  return {
    totalActionsCount: 0,
    sitesHandled: 0,
    handledSites: [],
    lastActionDate: null,
    lastActionSite: null,
    lastActionNoticeOnly: false,
    recentActivity: [],
  };
}

function settingsFor(preference) {
  const accept = preference === 'accept_all';
  const custom = preference === 'custom';
  return {
    globalPreference: preference,
    onboardingComplete: true,
    showBadgeCount: true,
    categoryPreferences: {
      functional: true,
      analytics: accept ? true : false,
      advertising: accept ? true : false,
      ccpaDoNotSell: !accept,
      uncategorized: accept || custom ? 'accept' : 'reject',
    },
    milestonesShown: [],
  };
}

function prepareExtensionLaunchDir() {
  try {
    fs.rmSync(EXT_LAUNCH_DIR, { recursive: true, force: true });
  } catch (_) {}
  try {
    fs.symlinkSync(ROOT, EXT_LAUNCH_DIR);
    return EXT_LAUNCH_DIR;
  } catch (_) {
    return ROOT;
  }
}

function startFixtureServer() {
  const server = http.createServer((req, res) => {
    const pathName = new URL(req.url, 'http://127.0.0.1').pathname;
    const filePath = pathName.endsWith('/usercentrics-api.html') ? API_FIXTURE_PATH : FIXTURE_PATH;
    fs.readFile(filePath, (err, body) => {
      if (err) {
        res.writeHead(500, { 'content-type': 'text/plain' });
        res.end(err.message);
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(body);
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function waitForExtensionServiceWorker(context) {
  const find = () => context.serviceWorkers().find((worker) => worker.url().startsWith('chrome-extension://'));
  let worker = find();
  if (worker) return worker;

  const deadline = Date.now() + 8000;
  while (!worker && Date.now() < deadline) {
    worker = await context.waitForEvent('serviceworker', { timeout: 1000 }).catch(() => find());
  }
  if (!worker) throw new Error('Extension service worker did not register');
  return worker;
}

async function writeStorage(worker, preference) {
  await worker.evaluate(({ settings, stats }) => new Promise((resolve) => {
    chrome.storage.sync.set(settings, () => {
      chrome.storage.local.set({ stats, siteOverrides: {}, unsupportedSites: {} }, resolve);
    });
  }), {
    settings: settingsFor(preference),
    stats: statsDefaults(),
  });
  await worker.evaluate(() => new Promise((resolve) => {
    chrome.storage.local.remove('__emc_manual_consent_open__', resolve);
  }));
}

async function markManualConsentOpen(worker) {
  await worker.evaluate(() => new Promise((resolve) => {
    chrome.storage.local.set({
      __emc_manual_consent_open__: {
        site: 'leadersisland.com',
        timestamp: Date.now(),
      },
    }, resolve);
  }));
}

async function readStats(worker) {
  const result = await worker.evaluate((stats) => new Promise((resolve) => {
    chrome.storage.local.get({ stats }, resolve);
  }), statsDefaults());
  return result.stats;
}

async function waitForStatsDelta(worker, beforeTotal, expectedMethod, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  let latest = null;
  while (Date.now() < deadline) {
    latest = await readStats(worker);
    const delta = (latest.totalActionsCount ?? 0) - beforeTotal;
    const activity = latest.recentActivity?.[0] ?? {};
    if (delta === 1 && activity.method === expectedMethod) return latest;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Expected stats delta=1 method=${expectedMethod}; latest=${JSON.stringify(latest)}`);
}

async function waitForFixtureDismissed(page) {
  const deadline = Date.now() + 10000;
  let latest = null;
  while (Date.now() < deadline) {
    latest = await page.evaluate(() => window.__fixtureState ?? null).catch(() => null);
    if (latest?.bannerVisible === false) return latest;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Expected dismissed fixture state; latest=${JSON.stringify(latest)}`);
}

async function fixtureHasVisibleConsentSurface(page) {
  return page.evaluate(() => {
    const host = document.querySelector('#usercentrics-cmp-ui');
    const root = host?.shadowRoot;
    if (!root) return false;
    const dialog = root.querySelector('#uc-main-dialog');
    if (!dialog || !dialog.querySelector(
      '#accept, #more, #deny, #reject, #save, [data-testid*="accept"], [data-testid*="deny"], [data-testid*="save"], [data-action-type]:not([data-action-type="more-privacy"]), button[data-action="consent"]:not(.fingerprint)'
    )) return false;
    const rect = dialog.getBoundingClientRect();
    const style = getComputedStyle(dialog);
    return rect.width > 0 && rect.height > 0 &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      Number(style.opacity || '1') > 0 &&
      style.pointerEvents !== 'none';
  });
}

async function assertNoEarlyUsercentricsCount(page, worker, before) {
  const deadline = Date.now() + 15000;
  let sawVisibleSurface = false;
  while (Date.now() < deadline) {
    const visible = await fixtureHasVisibleConsentSurface(page);
    if (visible) {
      sawVisibleSurface = true;
      const current = await readStats(worker);
      if ((current.totalActionsCount ?? 0) !== (before.totalActionsCount ?? 0)) {
        throw new Error(`Usercentrics action was counted while the modal was still open: ${JSON.stringify(current)}`);
      }
    } else if (sawVisibleSurface) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Delayed-dismissal fixture did not transition from a visible modal to a dismissed surface');
}

async function launchContext(extensionDir, userDataDir) {
  const options = {
    headless: true,
    args: [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
      '--host-resolver-rules=MAP leadersisland.com 127.0.0.1,MAP www.leadersisland.com 127.0.0.1',
      '--no-sandbox',
    ],
    env: {
      ...process.env,
      HOME: BROWSER_HOME_DIR,
    },
    viewport: { width: 1280, height: 800 },
  };

  try {
    return await chromium.launchPersistentContext(userDataDir, { ...options, channel: 'chromium' });
  } catch (_) {
    return chromium.launchPersistentContext(userDataDir, options);
  }
}

function expectedStateFor(preference, query = '') {
  if (preference === 'accept_all') {
    return {
      method: 'dom:usercentrics:accept_all',
      action: 'accept',
      functional: true,
      analytics: true,
      advertising: true,
    };
  }
  if (preference === 'custom') {
    return {
      method: 'dom:usercentrics:custom',
      action: 'save',
      functional: !query.includes('semantic=1'),
      analytics: false,
      advertising: false,
    };
  }
  return {
    method: 'dom:usercentrics:reject_all',
    action: 'deny',
    functional: false,
    analytics: false,
    advertising: false,
  };
}

async function exercisePreference(context, worker, port, preference, query, fixture = 'usercentrics-shadow.html', host = '127.0.0.1', pathname = `/${fixture}`) {
  await writeStorage(worker, preference);
  const expected = expectedStateFor(preference, query);
  const expectedMethod = fixture === 'usercentrics-api.html' || host === 'leadersisland.com'
    ? `cmp_api:UC_UI:${preference === 'custom' ? 'custom' : preference === 'accept_all' ? 'accept_all' : 'reject_all'}`
    : expected.method;

  const before = await readStats(worker);
  const page = await context.newPage();
  const url = `http://${host}:${port}${pathname}?${query}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
  if (query.includes('event-before-dismiss')) {
    await assertNoEarlyUsercentricsCount(page, worker, before);
  }
  const state = await waitForFixtureDismissed(page);
  const after = await waitForStatsDelta(
    worker,
    before.totalActionsCount ?? 0,
    expectedMethod,
    query.includes('event-before-dismiss') ? 3000 : 10000,
  );

  if (await fixtureHasVisibleConsentSurface(page)) {
    throw new Error(`Usercentrics action was counted before the consent surface was dismissed: ${JSON.stringify(state)}`);
  }

  if (
    state.action !== expected.action ||
    state.functional !== expected.functional ||
    state.analytics !== expected.analytics ||
    state.advertising !== expected.advertising
  ) {
    throw new Error(`${preference} did not apply fixture state: ${JSON.stringify({ expected, state })}`);
  }

  return { page, state, after, expected };
}

async function exerciseManualPreference(context, worker, port, preference, action) {
  await writeStorage(worker, preference);
  await markManualConsentOpen(worker);
  const before = await readStats(worker);
  const page = await context.newPage();
  const query = `case=manual-${preference}&auto-action=${action}${preference === 'custom' ? '&semantic=1' : ''}`;
  await page.goto(`http://leadersisland.com:${port}/en/leader-toolbox/motivation-development/?${query}`, {
    waitUntil: 'domcontentloaded',
    timeout: 15000,
  });
  const state = await waitForFixtureDismissed(page);
  const after = await waitForStatsDelta(worker, before.totalActionsCount ?? 0, `cmp_api:UC_UI:${preference}`, 3000);
  if (await fixtureHasVisibleConsentSurface(page)) {
    throw new Error(`Manual Usercentrics ${preference} was counted before dismissal`);
  }
  return { page, state, after };
}

(async () => {
  const extensionDir = prepareExtensionLaunchDir();
  const server = await startFixtureServer();
  const port = server.address().port;
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'emc-usercentrics-profile-'));
  fs.mkdirSync(BROWSER_HOME_DIR, { recursive: true });

  let context;
  try {
    context = await launchContext(extensionDir, userDataDir);
    const worker = await waitForExtensionServiceWorker(context);

    const normal = await exercisePreference(context, worker, port, 'accept_all', 'case=normal-accept&persist=1', 'usercentrics-shadow.html', 'leadersisland.com');
    await normal.page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
    await waitForFixtureDismissed(normal.page);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const afterNormalReload = await readStats(worker);
    if (afterNormalReload.totalActionsCount !== normal.after.totalActionsCount) {
      throw new Error(`Normal report was counted again after reload: ${JSON.stringify(afterNormalReload)}`);
    }
    await normal.page.close();

    const customNoReload = await exercisePreference(context, worker, port, 'custom', 'case=custom-no-reload&delay=5000&fade=1&semantic=1', 'usercentrics-shadow.html', 'leadersisland.com');
    const acceptDelayedDismissal = await exercisePreference(
      context,
      worker,
      port,
      'accept_all',
      'case=accept-delayed-dismissal&event-before-dismiss=8000',
      'usercentrics-shadow.html',
      'leadersisland.com',
      '/en/podcast/',
    );
    const customDelayedDismissal = await exercisePreference(
      context,
      worker,
      port,
      'custom',
      'case=custom-delayed-dismissal&semantic=1&event-before-dismiss=8000&no-event=1',
      'usercentrics-shadow.html',
      'leadersisland.com',
      '/en/leader-toolbox/motivation-development/',
    );
    const manualAccept = await exerciseManualPreference(context, worker, port, 'accept_all', 'accept');
    const manualReject = await exerciseManualPreference(context, worker, port, 'reject_all', 'deny');
    const manualCustom = await exerciseManualPreference(context, worker, port, 'custom', 'save');
    const acceptReload = await exercisePreference(context, worker, port, 'accept_all', 'case=reload-accept&reload=1&delay=5000', 'usercentrics-shadow.html', 'leadersisland.com');
    const rejectReload = await exercisePreference(context, worker, port, 'reject_all', 'case=reload-reject&reload=1&delay=5000', 'usercentrics-shadow.html', 'leadersisland.com');
    const customReload = await exercisePreference(context, worker, port, 'custom', 'case=reload-custom&reload=1&delay=5000&semantic=1', 'usercentrics-shadow.html', 'leadersisland.com');
    const acceptApi = await exercisePreference(context, worker, port, 'accept_all', 'case=api-accept', 'usercentrics-api.html');
    const rejectApi = await exercisePreference(context, worker, port, 'reject_all', 'case=api-reject', 'usercentrics-api.html');
    const customApi = await exercisePreference(context, worker, port, 'custom', 'case=api-custom', 'usercentrics-api.html');

    for (const result of [
      customNoReload,
      acceptDelayedDismissal,
      customDelayedDismissal,
      manualAccept,
      manualReject,
      manualCustom,
      acceptReload,
      rejectReload,
      customReload,
      acceptApi,
      rejectApi,
      customApi,
    ]) {
      await result.page.close();
    }

    console.log(JSON.stringify({
      ok: true,
      normalAction: normal.state.action,
      normalCountAfterReload: afterNormalReload.totalActionsCount,
      customNoReload: {
        action: customNoReload.state.action,
        method: customNoReload.after.recentActivity[0].method,
        totalActionsCount: customNoReload.after.totalActionsCount,
      },
      acceptDelayedDismissal: {
        action: acceptDelayedDismissal.state.action,
        method: acceptDelayedDismissal.after.recentActivity[0].method,
        totalActionsCount: acceptDelayedDismissal.after.totalActionsCount,
      },
      customDelayedDismissal: {
        action: customDelayedDismissal.state.action,
        method: customDelayedDismissal.after.recentActivity[0].method,
        totalActionsCount: customDelayedDismissal.after.totalActionsCount,
      },
      manualChoices: {
        accept: manualAccept.after.recentActivity[0].method,
        reject: manualReject.after.recentActivity[0].method,
        custom: manualCustom.after.recentActivity[0].method,
      },
      acceptReload: {
        action: acceptReload.state.action,
        method: acceptReload.after.recentActivity[0].method,
        totalActionsCount: acceptReload.after.totalActionsCount,
      },
      rejectReload: {
        action: rejectReload.state.action,
        method: rejectReload.after.recentActivity[0].method,
        totalActionsCount: rejectReload.after.totalActionsCount,
      },
      customReload: {
        action: customReload.state.action,
        method: customReload.after.recentActivity[0].method,
        totalActionsCount: customReload.after.totalActionsCount,
      },
      acceptApi: {
        action: acceptApi.state.action,
        method: acceptApi.after.recentActivity[0].method,
        totalActionsCount: acceptApi.after.totalActionsCount,
      },
      rejectApi: {
        action: rejectApi.state.action,
        method: rejectApi.after.recentActivity[0].method,
        totalActionsCount: rejectApi.after.totalActionsCount,
      },
      customApi: {
        action: customApi.state.action,
        method: customApi.after.recentActivity[0].method,
        totalActionsCount: customApi.after.totalActionsCount,
      },
      lastActionSite: customApi.after.lastActionSite,
    }, null, 2));
  } finally {
    if (context) await context.close().catch(() => {});
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
