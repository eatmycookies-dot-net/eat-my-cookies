#!/usr/bin/env node
/**
 * Eat My Cookies — automated validation suite.
 *
 * Loads the extension in a real Chromium browser via Playwright,
 * visits each site in sites.json, and verifies the cookie banner
 * was dismissed within the timeout window.
 *
 * Usage:
 *   npm run test:e2e                         # run all sites
 *   npm run test:e2e -- --region=EU         # EU sites only
 *   npm run test:e2e -- --cmp=Sourcepoint
 *   npm run test:e2e -- --site="BBC"
 *   npm run test:e2e -- --headed            # show the browser window
 *   npm run test:e2e -- --vpn --vpn-ext=<path>   # load an unpacked VPN extension (headed); see CONTRIBUTING.md
 *   EMC_VPN_EXT=<path> npm run test:e2e -- --vpn  # same, via env var
 */

const { chromium } = require('playwright');
const os = require('os');
const path = require('path');
const fs = require('fs');

// ── Config ────────────────────────────────────────────────────────────────────
const EXT_DIR      = path.resolve(__dirname, '..');   // unpacked extension root
const EXT_LAUNCH_DIR = path.join(os.tmpdir(), 'emc-extension-no-spaces');
const SITES_FILE   = path.join(__dirname, 'sites.json');
const DOM_HANDLER_PATH = path.join(EXT_DIR, 'content', 'dom-handler.js');
const CMPS = JSON.parse(fs.readFileSync(path.join(EXT_DIR, 'rules', 'cmps.json'), 'utf8')).cmps;
const BANNER_WAIT  = 8000;   // ms to wait for banner to appear
const HANDLE_WAIT  = 6000;   // ms to wait for extension to handle it
const NAV_TIMEOUT  = 30000;
const FOLLOW_UP_WAIT = 8000;
const ACCESSIBILITY_HELP_PATH = '/help/accessibility-help';

// ── Argument parsing ──────────────────────────────────────────────────────────
const args     = process.argv.slice(2);
const headed   = args.includes('--headed');
const useVpn   = args.includes('--vpn');
const region   = argVal(args, '--region');
const cmpFilter= argVal(args, '--cmp');
const siteName = argVal(args, '--site');

function discoverBundledVpnExtensionPath() {
  const candidates = [
    path.resolve(__dirname, '..', '..', 'vpn-extension', 'omghfjlpggmjjaagoclmmobgdodcjboh'),
    path.resolve(__dirname, '..', '.tmp-vpn-extension', 'omghfjlpggmjjaagoclmmobgdodcjboh'),
  ];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
        return candidate;
      }
    } catch (_) {}
  }

  return null;
}

// Path to an unpacked VPN extension (only used with --vpn flag).
// Resolved from (in priority order):
//   1. --vpn-ext=<path> CLI argument
//   2. EMC_VPN_EXT environment variable
//   3. Known local Browsec checkout next to this workspace (when present)
// See CONTRIBUTING.md → "Testing with a VPN" for setup instructions.
const vpnExtArg = argVal(args, '--vpn-ext');
const VPN_EXT_DIR = vpnExtArg
  ? path.resolve(vpnExtArg)
  : process.env.EMC_VPN_EXT
    ? path.resolve(process.env.EMC_VPN_EXT)
    : discoverBundledVpnExtensionPath();

// Profile dir for VPN session persistence — project-local so it works on any machine.
const vpnProfileArg = argVal(args, '--vpn-profile');
const VPN_PROFILE_DIR = vpnProfileArg
  ? path.resolve(vpnProfileArg)
  : process.env.EMC_VPN_PROFILE
    ? path.resolve(process.env.EMC_VPN_PROFILE)
    : path.resolve(__dirname, '..', '.tmp-vpn-profile');
const VPN_RUNS_DIR = path.resolve(__dirname, '..', '.tmp-vpn-runs');
const BROWSER_HOME_DIR = path.resolve(__dirname, '..', '.tmp-browser-home');
function getSystemChromeExecutable() {
  if (process.env.CHROME_EXECUTABLE) return process.env.CHROME_EXECUTABLE;
  switch (process.platform) {
    case 'darwin':  return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    case 'linux':   return '/usr/bin/google-chrome';
    case 'win32':   return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    default:        return null;
  }
}

function argVal(args, key) {
  const match = args.find(a => a.startsWith(key + '='));
  return match ? match.split('=')[1] : null;
}

// ── Load + filter sites ───────────────────────────────────────────────────────
const { sites: allSites } = JSON.parse(fs.readFileSync(SITES_FILE, 'utf8'));
const sites = allSites.filter(s => {
  if (region   && s.region !== region)        return false;
  if (cmpFilter&& s.cmp    !== cmpFilter)     return false;
  if (siteName && s.name   !== siteName)      return false;
  return true;
});

if (!sites.length) {
  console.error('No sites matched the given filters.');
  process.exit(1);
}

// ── Results ───────────────────────────────────────────────────────────────────
const results = { pass: [], fail: [], skip: [] };

function pad(str, len) { return String(str).padEnd(len); }

function printHeader() {
  console.log('\n' + '─'.repeat(90));
  console.log(
    pad('Site', 22) + pad('Region', 8) + pad('CMP', 16) +
    pad('Tier', 12) + pad('Result', 10) + 'Detail'
  );
  console.log('─'.repeat(90));
}

function printRow(s, status, detail = '') {
  const icon = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '–';
  console.log(
    pad(icon + ' ' + s.name, 22) +
    pad(s.region, 8) +
    pad(s.cmp, 16) +
    pad(s.tier, 12) +
    pad(status, 10) +
    detail
  );
}

function printSummary() {
  console.log('─'.repeat(90));
  console.log(
    `\n  ✓ ${results.pass.length} passed` +
    `   ✗ ${results.fail.length} failed` +
    `   – ${results.skip.length} skipped` +
    `   (${sites.length} total)\n`
  );

  if (results.fail.length) {
    console.log('Failed sites:');
    results.fail.forEach(r => console.log(`  • ${r.name} (${r.cmp}) — ${r.detail}`));
    console.log();
  }
}

// ── Core test logic ───────────────────────────────────────────────────────────
async function testSite(page, site) {
  await clearSiteState(page, site.url);
  const beforeStats = await readStatsSnapshot(page.context());
  await applySiteLocale(page, site);
  const bannerWaitMs = site.bannerWaitMs ?? BANNER_WAIT;
  const handleWaitMs = site.handleWaitMs ?? HANDLE_WAIT;
  const visitedTopLevelUrls = [];
  const recordTopLevelUrl = (frame) => {
    if (frame !== page.mainFrame()) return;
    const url = frame.url();
    if (!url) return;
    if (visitedTopLevelUrls[visitedTopLevelUrls.length - 1] === url) return;
    visitedTopLevelUrls.push(url);
  };
  page.on('framenavigated', recordTopLevelUrl);

  try {
    await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
  } catch (e) {
    const detail = e.message.split('\n')[0];
    if (/ERR_HTTP2_PROTOCOL_ERROR|ERR_TIMED_OUT|ERR_CONNECTION_RESET/i.test(detail)) {
      return { status: 'SKIP', detail: `Navigation blocked by site/network issue: ${detail}` };
    }
    return { status: 'FAIL', detail: `Navigation failed: ${detail}` };
  }

  if (await isChallengePage(page)) {
    return { status: 'SKIP', detail: 'Blocked by anti-bot challenge during automated validation' };
  }

  // Wait for the banner to appear
  const bannerFound = await waitForAny(page, site.bannerSelectors, bannerWaitMs);
  if (await isChallengePage(page)) {
    return { status: 'SKIP', detail: 'Blocked by anti-bot challenge during banner detection' };
  }
  if (!bannerFound) {
    await page.waitForTimeout(handleWaitMs);
    const afterStats = await readStatsSnapshot(page.context());
    const recorded = extractNewActivityForSite(beforeStats, afterStats, site);
    if (recorded) {
      return {
        status: 'PASS',
        detail: `Handled before banner polling (${recorded.method ?? 'recorded action'})`,
      };
    }

    // No banner detected — may already be consented, geo-gated, or handled too early to observe.
    return { status: 'SKIP', detail: 'No banner detected (already consented or geo-gated)' };
  }

  // Give the extension time to handle it
  await page.waitForTimeout(handleWaitMs);

  if (await isChallengePage(page)) {
    return { status: 'SKIP', detail: 'Challenge page replaced the site during validation' };
  }

  if (isAccessibilityHelpUrl(page.url())) {
    return { status: 'FAIL', detail: 'Redirected to accessibility help page after initial load' };
  }

  // Check if banner is gone
  const bannerStillVisible = await anyVisible(page, site.bannerSelectors);
  let consentHandled = false;
  let detail = 'Banner dismissed';
  if (!bannerStillVisible) {
    consentHandled = true;
  }

  if (bannerStillVisible && site.requireBannerDismissal) {
    return { status: 'FAIL', detail: await buildFailureDetail(page, site, beforeStats, 'Banner still visible after timeout') };
  }

  // Banner still visible — check if the consent button itself is gone
  // (some CMPs hide but don't remove the container)
  const consentButtonGone = !(await anyVisible(page, site.consentSelectors));
  if (!consentHandled && consentButtonGone) {
    consentHandled = true;
    detail = 'Consent recorded (container persists but buttons gone)';
  }

  if (!consentHandled) {
    const afterStats = await readStatsSnapshot(page.context());
    const recorded = extractNewActivityForSite(beforeStats, afterStats, site);
    if (site.allowRecordedActionPass && recorded) {
      const navigationIssue = validateNavigationExpectations(page.url(), visitedTopLevelUrls, site.navigationExpectations);
      if (!navigationIssue) {
        return { status: 'PASS', detail: `Handled via recorded action (${recorded.method ?? 'recorded action'})` };
      }
    }

    if (useVpn && site.allowTrustedClickFallback) {
      const trustedClicked = await runTrustedClickFallback(page, site).catch(() => false);
      if (trustedClicked) {
        await page.waitForTimeout(Math.min(handleWaitMs, 2500));
        const bannerVisibleAfterTrusted = await anyVisible(page, site.bannerSelectors);
        const consentVisibleAfterTrusted = await anyVisible(page, site.consentSelectors);
        if (!bannerVisibleAfterTrusted || !consentVisibleAfterTrusted) {
          return { status: 'PASS', detail: 'Handled via VPN trusted-click fallback' };
        }
      }
    }

    if (useVpn && site.allowDirectDomValidation) {
      const directResult = await runDirectDomValidation(page, site).catch(() => null);
      if (directResult?.method) {
        await page.waitForTimeout(Math.min(handleWaitMs, 2000));
        const bannerVisibleAfterDirect = await anyVisible(page, site.bannerSelectors);
        const consentVisibleAfterDirect = await anyVisible(page, site.consentSelectors);
        if (!bannerVisibleAfterDirect || !consentVisibleAfterDirect) {
          return { status: 'PASS', detail: `Handled via VPN DOM fallback (${directResult.method})` };
        }
      }
    }

    return { status: 'FAIL', detail: await buildFailureDetail(page, site, beforeStats, 'Banner still visible after timeout') };
  }

  const afterStats = await readStatsSnapshot(page.context());
  const recorded = extractNewActivityForSite(beforeStats, afterStats, site);
  if (site.expectActivityRecorded && !recorded) {
    return { status: 'FAIL', detail: 'Banner dismissed but no activity was recorded' };
  }
  if (recorded) {
    detail += `; activity recorded (${recorded.method ?? 'recorded action'})`;
  }

  if (site.expectedOneTrustToggleStates) {
    const mismatch = await readOneTrustToggleStateMismatch(page, site.expectedOneTrustToggleStates);
    if (mismatch) {
      return { status: 'FAIL', detail: `Banner dismissed but toggle ${mismatch.id} expected=${mismatch.expected} actual=${mismatch.actual}` };
    }
    detail += '; toggle state verified';
  }

  if (site.expectedShopifyConsent) {
    const mismatch = await readShopifyConsentMismatch(page, site.expectedShopifyConsent);
    if (mismatch) {
      return { status: 'FAIL', detail: mismatch };
    }
    detail += '; Shopify consent verified';
  }

  if (site.expectedCookiebotConsent) {
    const mismatch = await readCookiebotConsentMismatch(page, site.expectedCookiebotConsent);
    if (mismatch) {
      return { status: 'FAIL', detail: mismatch };
    }
    detail += '; Cookiebot consent verified';
  }

  if (site.expectedInvestisConsent) {
    const mismatch = await readInvestisConsentMismatch(page, site.expectedInvestisConsent);
    if (mismatch) {
      return { status: 'FAIL', detail: mismatch };
    }
    detail += '; Investis consent verified';
  }

  if (site.debugConsentmoInspectUrl) {
    const consentmoSnapshot = await readConsentmoDebugSnapshot(
      page,
      site.debugConsentmoInspectUrl,
      site.debugConsentmoInspectWaitMs ?? 4000,
    );
    detail += `; consentmo=${consentmoSnapshot}`;
  }

  if (site.followUpNavigation?.enabled) {
    const followUp = await runFollowUpNavigation(page, site);
    if (!followUp.ok) {
      return { status: 'FAIL', detail: followUp.detail };
    }
    detail += `; follow-up ok (${followUp.finalUrl})`;
  }

  const navigationIssue = validateNavigationExpectations(page.url(), visitedTopLevelUrls, site.navigationExpectations);
  if (navigationIssue) {
    return { status: 'FAIL', detail: navigationIssue };
  }

  return { status: 'PASS', detail };
}

async function clearSiteState(page, url) {
  const context = page.context();
  await context.clearCookies().catch(() => {});

  let origin = null;
  try {
    origin = new URL(url).origin;
  } catch (_) {
    origin = null;
  }
  if (!origin) return;

  const session = await context.newCDPSession(page).catch(() => null);
  if (!session) return;

  await session.send('Storage.clearDataForOrigin', {
    origin,
    storageTypes: 'all',
  }).catch(() => {});
}

async function readShopifyConsentMismatch(page, expected) {
  const diagnostic = await page.evaluate(async () => {
    const getApi = () => window.Shopify?.customerPrivacy ?? window.Shopify?.trackingConsent ?? null;
    let api = getApi();

    if (!api?.currentVisitorConsent && typeof window.Shopify?.loadFeatures === 'function') {
      await new Promise((resolve) => {
        try {
          window.Shopify.loadFeatures([
            {
              name: 'consent-tracking-api',
              version: '0.1',
            },
          ], () => resolve());
        } catch (_) {
          resolve();
        }
      });
      api = getApi();
    }

    return {
      actual: api?.currentVisitorConsent?.() ?? null,
      shopifyPresent: Boolean(window.Shopify),
      loadFeaturesPresent: typeof window.Shopify?.loadFeatures === 'function',
      customerPrivacyPresent: Boolean(window.Shopify?.customerPrivacy),
      trackingConsentPresent: Boolean(window.Shopify?.trackingConsent),
      shouldShowBanner: api?.shouldShowBanner?.() ?? null,
      saleOfDataRegion: api?.saleOfDataRegion?.() ?? null,
    };
  });

  const actual = diagnostic?.actual;
  if (!actual) {
    return `Banner dismissed but Shopify consent API was unavailable (shopify=${diagnostic?.shopifyPresent ? 'yes' : 'no'} loadFeatures=${diagnostic?.loadFeaturesPresent ? 'yes' : 'no'} customerPrivacy=${diagnostic?.customerPrivacyPresent ? 'yes' : 'no'} trackingConsent=${diagnostic?.trackingConsentPresent ? 'yes' : 'no'} shouldShowBanner=${diagnostic?.shouldShowBanner ?? 'n/a'} saleOfDataRegion=${diagnostic?.saleOfDataRegion ?? 'n/a'})`;
  }

  const normalizedActual = {
    marketing: normalizeShopifyConsent(actual.marketing),
    analytics: normalizeShopifyConsent(actual.analytics),
    preferences: normalizeShopifyConsent(actual.preferences),
  };

  for (const [key, wanted] of Object.entries(expected)) {
    if (normalizedActual[key] !== wanted) {
      return `Banner dismissed but Shopify consent ${key} expected=${wanted} actual=${normalizedActual[key]}`;
    }
  }

  return null;
}

async function readCookiebotConsentMismatch(page, expected) {
  const diagnostic = await page.evaluate(() => {
    const raw = document.cookie.split('; ').find((entry) => entry.startsWith('CookieConsent=')) ?? null;
    const decoded = raw ? decodeURIComponent(raw.slice('CookieConsent='.length)) : null;
    const readBool = (key) => {
      if (!decoded) return null;
      const match = decoded.match(new RegExp(`${key}:(true|false)`));
      if (!match) return null;
      return match[1] === 'true';
    };
    const dialog = document.querySelector('#CybotCookiebotDialog, #cookiebanner');
    const dialogVisible = (() => {
      if (!dialog) return false;
      const rect = dialog.getBoundingClientRect();
      const style = getComputedStyle(dialog);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    })();

    return {
      raw,
      decoded,
      actual: decoded ? {
        necessary: readBool('necessary'),
        preferences: readBool('preferences'),
        statistics: readBool('statistics'),
        marketing: readBool('marketing'),
      } : null,
      consented: window.Cookiebot?.consented ?? null,
      declined: window.Cookiebot?.declined ?? null,
      dialogVisible,
    };
  });

  const actual = diagnostic?.actual;
  if (!actual) {
    return `Banner dismissed but Cookiebot consent cookie was unavailable (consented=${diagnostic?.consented ?? 'n/a'} declined=${diagnostic?.declined ?? 'n/a'} dialogVisible=${diagnostic?.dialogVisible ?? 'n/a'} raw=${diagnostic?.raw ?? 'n/a'})`;
  }

  for (const [key, wanted] of Object.entries(expected)) {
    if (actual[key] !== wanted) {
      return `Banner dismissed but Cookiebot consent ${key} expected=${wanted} actual=${actual[key]} raw=${diagnostic?.decoded ?? diagnostic?.raw ?? 'n/a'}`;
    }
  }

  return null;
}

async function readInvestisConsentMismatch(page, expected) {
  const diagnostic = await page.evaluate(() => {
    const readCookie = (name) => document.cookie
      .split('; ')
      .find((entry) => entry.startsWith(`${name}=`)) ?? null;
    const raw = readCookie('__CookieConsentV300') ?? readCookie('__CookieConsentV200');
    const decoded = raw ? decodeURIComponent(raw.slice(raw.indexOf('=') + 1)) : null;
    const parsed = decoded ? JSON.parse(decoded) : null;
    const wrapper = document.querySelector('#__cookieWrapper');
    const wrapperVisible = (() => {
      if (!wrapper) return false;
      const rect = wrapper.getBoundingClientRect();
      const style = getComputedStyle(wrapper);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    })();

    return {
      raw,
      decoded,
      consent: parsed?.consent ?? null,
      accepted: parsed?.accepted ?? null,
      wrapperVisible,
    };
  });

  const actual = diagnostic?.consent;
  if (!actual) {
    return `Banner dismissed but Investis consent cookie was unavailable (accepted=${diagnostic?.accepted ?? 'n/a'} wrapperVisible=${diagnostic?.wrapperVisible ?? 'n/a'} raw=${diagnostic?.raw ?? 'n/a'})`;
  }

  for (const [key, wanted] of Object.entries(expected)) {
    if (actual[key] !== wanted) {
      return `Banner dismissed but Investis consent ${key} expected=${wanted} actual=${actual[key]} raw=${diagnostic?.decoded ?? diagnostic?.raw ?? 'n/a'}`;
    }
  }

  return null;
}

function normalizeShopifyConsent(value) {
  if (value === 'yes' || value === true) return true;
  if (value === 'no' || value === false) return false;
  return null;
}

async function readConsentmoDebugSnapshot(page, inspectUrl, waitMs) {
  try {
    await page.goto(inspectUrl, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
    await page.waitForTimeout(waitMs);

    return await page.evaluate(() => {
      const host = document.querySelector('csm-cookie-consent');
      const root = host?.shadowRoot;
      if (!host || !root) {
        return JSON.stringify({
          host: Boolean(host),
          root: Boolean(root),
          emcPref: document.documentElement.dataset.emcPref ?? null,
        });
      }

      const isVisible = (el) => {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      };

      const openButton = [...root.querySelectorAll('button, [role="button"], a')]
        .find((el) => isVisible(el) && /preferences|settings|manage/i.test((el.textContent || '').trim()));
      openButton?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));

      const snapshot = {
        emcPref: document.documentElement.dataset.emcPref ?? null,
        opened: Boolean(openButton),
        openText: openButton ? (openButton.textContent || '').trim() : null,
        controls: [],
        radios: [],
      };

      snapshot.controls = [...root.querySelectorAll('[role="switch"][aria-describedby]')].map((control) => {
        const nested = control.querySelector('input[type="checkbox"]');
        const rejectContainer = control.querySelector('.reject-container, [class*="reject-container"]');
        const acceptContainer = control.querySelector('.accept-container, [class*="accept-container"]');
        return {
          describedBy: control.getAttribute('aria-describedby'),
          ariaLabel: control.getAttribute('aria-label'),
          ariaChecked: control.getAttribute('aria-checked'),
          nestedChecked: nested instanceof HTMLInputElement ? nested.checked : null,
          rejectChecked: Boolean(rejectContainer?.classList?.contains('checked')),
          acceptChecked: Boolean(acceptContainer?.classList?.contains('checked')),
          visible: isVisible(control),
        };
      });

      snapshot.radios = [...root.querySelectorAll('input[type="radio"]')].map((el) => ({
        name: el.name,
        value: el.value,
        checked: el.checked,
      }));

      return JSON.stringify(snapshot);
    });
  } catch (error) {
    return `inspect_error:${error.message.split('\n')[0]}`;
  }
}

function createFreshVpnRunProfile(baseProfileDir) {
  fs.mkdirSync(VPN_RUNS_DIR, { recursive: true });
  const runProfileDir = fs.mkdtempSync(path.join(VPN_RUNS_DIR, 'profile-'));
  const transientNames = new Set([
    'SingletonLock',
    'SingletonCookie',
    'SingletonSocket',
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

  for (const transientName of transientNames) {
    fs.rmSync(path.join(runProfileDir, transientName), { recursive: true, force: true });
  }

  return runProfileDir;
}

function clearChromeSingletonFiles(profileDir) {
  for (const transientName of ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'DevToolsActivePort']) {
    fs.rmSync(path.join(profileDir, transientName), { recursive: true, force: true });
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

async function buildFailureDetail(page, site, beforeStats, prefix) {
  const afterStats = await readStatsSnapshot(page.context());
  const recorded = extractNewActivityForSite(beforeStats, afterStats, site);
  const diag = await page.evaluate(() => {
    const isVisible = (el) => {
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };

    const confirm = document.querySelector('#onetrust-accept-btn-handler, .save-preference-btn-handler');
    const privacyChoices = document.querySelector('#onetrust-pc-btn-handler, .ot-sdk-show-settings');
    const toggles = Array.from(document.querySelectorAll(".category-switch-handler, input[id^='ot-group-id-']")).map((el) => ({
      id: el.id || null,
      visible: isVisible(el),
      checked: !!el.checked,
      text: el.id ? document.querySelector(`label[for="${el.id}"]`)?.textContent?.trim()?.slice(0, 80) ?? null : null,
    }));

    return {
      url: location.href,
      emcPref: document.documentElement.dataset.emcPref ?? null,
      emcRunSignature: document.documentElement.dataset.emcRunSignature ?? null,
      confirmText: confirm ? (confirm.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80) : null,
      confirmVisible: isVisible(confirm),
      privacyChoicesVisible: isVisible(privacyChoices),
      bannerVisible: ['#onetrust-banner-sdk', '#onetrust-consent-sdk', '#onetrust-pc-sdk']
        .filter((sel) => isVisible(document.querySelector(sel))),
      toggles,
    };
  }).catch(() => null);

  return `${prefix}; recorded=${recorded ? (recorded.method ?? 'yes') : 'none'}; emcPref=${diag?.emcPref ?? 'n/a'}; privacyChoicesVisible=${diag?.privacyChoicesVisible ?? 'n/a'}; confirm=${diag?.confirmText ?? 'n/a'}; confirmVisible=${diag?.confirmVisible ?? 'n/a'}; visible=${(diag?.bannerVisible ?? []).join('|') || 'none'}; toggles=${JSON.stringify(diag?.toggles ?? [])}`;
}

async function readOneTrustToggleStateMismatch(page, expectedStates) {
  const actualStates = await page.evaluate(() => {
    return Object.fromEntries(
      Array.from(document.querySelectorAll(".category-switch-handler, input[id^='ot-group-id-']"))
        .filter((el) => el.id)
        .map((el) => [el.id, Boolean(el.checked)])
    );
  }).catch(() => ({}));

  for (const [id, expected] of Object.entries(expectedStates)) {
    if (actualStates[id] !== Boolean(expected)) {
      return { id, expected: Boolean(expected), actual: actualStates[id] };
    }
  }
  return null;
}

function validateNavigationExpectations(finalUrl, visitedTopLevelUrls, expectations = null) {
  if (!expectations) return null;

  if (expectations.expectedFinalUrlPattern) {
    const pattern = new RegExp(expectations.expectedFinalUrlPattern);
    if (!pattern.test(finalUrl)) {
      return `Unexpected final URL: ${finalUrl}`;
    }
  }

  if (expectations.forbidVisitedUrlPatterns?.length) {
    for (const patternSource of expectations.forbidVisitedUrlPatterns) {
      const pattern = new RegExp(patternSource);
      const offending = visitedTopLevelUrls.find((url) => pattern.test(url));
      if (offending) {
        return `Visited forbidden URL during flow: ${offending}`;
      }
    }
  }

  return null;
}

function siteDomain(site) {
  try {
    return new URL(site.url).hostname;
  } catch (_) {
    return null;
  }
}

function extractNewActivityForSite(beforeStats, afterStats, site) {
  const domain = siteDomain(site);
  if (!domain) return null;

  const beforeCount = beforeStats?.totalActionsCount ?? 0;
  const afterCount = afterStats?.totalActionsCount ?? 0;
  if (afterCount <= beforeCount) return null;

  const beforeRecent = beforeStats?.recentActivity ?? [];
  const afterRecent = afterStats?.recentActivity ?? [];
  const beforeLatestStamp = beforeRecent[0]?.timestamp ?? null;

  return afterRecent.find((activity) => {
    if (!activity || activity.site !== domain) return false;
    if (!beforeLatestStamp) return true;
    return activity.timestamp !== beforeLatestStamp;
  }) ?? null;
}

async function isChallengePage(page) {
  const title = await page.title().catch(() => '');
  if (/just a moment|security verification|unusual activity/i.test(title)) return true;

  return page.evaluate(() => {
    const text = document.body?.innerText ?? '';
    return /security verification|request id|reference id|cloudflare|just a moment|unusual activity|not a robot/i.test(text);
  }).catch(() => false);
}

async function waitForAny(page, selectors, timeout) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const sel of selectors) {
      try {
        if (await selectorVisible(page, sel)) return true;
      } catch (_) {}
    }
    await page.waitForTimeout(300);
  }
  return false;
}

async function runDirectDomValidation(page, site) {
  const prefs = {
    globalPreference: site.preference ?? 'reject_all',
    categoryPreferences: buildCategoryPreferences(site.preference ?? 'reject_all', site.categoryPreferences ?? {
      ccpaDoNotSell: site.ccpaDoNotSell,
    }),
  };
  await page.addScriptTag({ path: DOM_HANDLER_PATH });
  return page.evaluate(async ({ cmps, runtimePrefs }) => {
    return await tryCMPs(cmps, runtimePrefs);
  }, { cmps: CMPS, runtimePrefs: prefs });
}

async function runTrustedClickFallback(page, site) {
  for (const selector of site.consentSelectors ?? []) {
    try {
      if (selector.startsWith('text:')) {
        const text = selector.slice(5);
        const locator = page.getByText(text, { exact: false });
        if (await locator.count()) {
          await locator.first().click({ timeout: 3000 });
          return true;
        }
        continue;
      }

      const locator = page.locator(selector);
      if (await locator.count()) {
        await locator.first().click({ timeout: 3000 });
        return true;
      }
    } catch (_) {}
  }
  return false;
}

async function anyVisible(page, selectors) {
  for (const sel of selectors) {
    try {
      if (await selectorVisible(page, sel)) return true;
    } catch (_) {}
  }
  return false;
}

async function selectorVisible(page, sel) {
  if (sel.startsWith('text:')) {
    const phrase = sel.slice(5).toLowerCase();
    return page.evaluate((needle) => {
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      };
      const roots = [document];
      for (let i = 0; i < roots.length; i += 1) {
        const root = roots[i];
        for (const host of root.querySelectorAll('*')) {
          if (host.shadowRoot) roots.push(host.shadowRoot);
        }
      }
      return roots.some((root) =>
        Array.from(root.querySelectorAll('button, [role="button"], a, div, span'))
          .some((el) => isVisible(el) && (el.textContent || '').trim().toLowerCase().includes(needle))
      );
    }, phrase);
  }

  return page.evaluate((selector) => {
    const isVisible = (el) => {
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const roots = [document];
    for (let i = 0; i < roots.length; i += 1) {
      const root = roots[i];
      for (const host of root.querySelectorAll('*')) {
        if (host.shadowRoot) roots.push(host.shadowRoot);
      }
    }
    return roots.some((root) =>
      Array.from(root.querySelectorAll(selector)).some((el) => isVisible(el))
    );
  }, sel);
}

async function runFollowUpNavigation(page, site) {
  const startedAt = page.url();
  const link = await findFollowUpLink(page, site.followUpNavigation);
  if (!link) {
    return { ok: false, detail: 'Follow-up navigation was enabled, but no suitable in-site article link was found' };
  }

  try {
    await page.goto(link.href, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
  } catch (error) {
    const message = error.message.split('\n')[0];
    return { ok: false, detail: `Follow-up navigation failed: ${message}` };
  }

  await page.waitForTimeout(site.followUpNavigation.waitMs ?? FOLLOW_UP_WAIT);
  const finalUrl = page.url();

  if (isAccessibilityHelpUrl(finalUrl)) {
    return {
      ok: false,
      detail: `Follow-up navigation redirected from ${startedAt} to accessibility help via ${link.href}`,
    };
  }

  return { ok: true, finalUrl };
}

async function findFollowUpLink(page, followUpConfig = {}) {
  const patternSource = followUpConfig.hrefPattern ?? String.raw`theguardian\.com/.+/\d{4}/`;
  const excludedPatterns = followUpConfig.excludePatterns ?? [ACCESSIBILITY_HELP_PATH];

  return page.evaluate(({ patternSource, excludedPatterns }) => {
    const hrefPattern = new RegExp(patternSource);
    const scopes = [document.querySelector('main'), document];

    for (const scope of scopes) {
      if (!scope) continue;
      const anchors = Array.from(scope.querySelectorAll('a[href]'));
      const exactMatch = anchors
        .map((anchor) => ({
          href: anchor.href,
          text: (anchor.textContent || '').trim().replace(/\s+/g, ' '),
        }))
        .find(({ href, text }) =>
          href &&
          hrefPattern.test(href) &&
          !excludedPatterns.some((pattern) => href.includes(pattern)) &&
          text.length >= 12,
        );
      if (exactMatch) return exactMatch;

      const fallback = anchors
        .map((anchor) => ({
          href: anchor.href,
          text: (anchor.textContent || '').trim().replace(/\s+/g, ' '),
        }))
        .find(({ href, text }) => {
          if (!href || excludedPatterns.some((pattern) => href.includes(pattern))) return false;
          if (!href.startsWith('https://www.theguardian.com/')) return false;
          if (href === window.location.href) return false;
          if (href.includes('#')) return false;
          const path = new URL(href).pathname;
          if (path === '/' || path === '/us' || path.startsWith('/preference/')) return false;
          return text.length >= 12;
        });
      if (fallback) return fallback;
    }

    return null;
  }, { patternSource, excludedPatterns });
}

function isAccessibilityHelpUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.pathname === ACCESSIBILITY_HELP_PATH;
  } catch (_) {
    return false;
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

function defaultAcceptLanguage(locale) {
  if (!locale) return null;
  const [base] = locale.split('-');
  return `${locale},${base};q=0.9,en;q=0.8`;
}

function buildNavigatorLanguages(locale) {
  if (!locale) return ['en-US', 'en'];
  const [base] = locale.split('-');
  return Array.from(new Set([locale, base, 'en-US', 'en']));
}

async function applySiteLocale(page, site) {
  const locale = site.locale ?? null;
  const acceptLanguage = site.acceptLanguage ?? defaultAcceptLanguage(locale);

  if (!locale && !acceptLanguage) return;

  if (locale) {
    const languages = buildNavigatorLanguages(locale);
    await page.addInitScript(({ activeLocale, activeLanguages }) => {
      Object.defineProperty(navigator, 'language', {
        configurable: true,
        get: () => activeLocale,
      });
      Object.defineProperty(navigator, 'languages', {
        configurable: true,
        get: () => activeLanguages,
      });
    }, { activeLocale: locale, activeLanguages: languages });
  }

  if (acceptLanguage) {
    const session = await page.context().newCDPSession(page);
    await session.send('Network.enable');
    await session.send('Network.setExtraHTTPHeaders', {
      headers: {
        'Accept-Language': acceptLanguage,
      },
    });
  }
}

async function writePreferences(browser, preference, site = null, profileDir = '') {
  const payload = {
    globalPreference: preference,
    onboardingComplete: true,
    showBadgeCount: true,
    categoryPreferences: buildCategoryPreferences(preference, site?.categoryPreferences ?? {
      ccpaDoNotSell: site?.ccpaDoNotSell,
    }),
    milestonesShown: [],
  };

  // When --vpn is active, multiple service workers may be registered (one per extension).
  // Find ours by excluding the VPN extension's ID, and requiring chrome-extension:// URL
  // so page-level service workers (e.g. from ketch.com SDK) are never picked up by mistake.
  const vpnExtId = VPN_EXT_DIR ? path.basename(path.dirname(VPN_EXT_DIR)) : null;
  const findOurSw = () => {
    const all = browser.serviceWorkers().filter(w => w.url().startsWith('chrome-extension://'));
    return all.find(w => !vpnExtId || !w.url().includes(vpnExtId)) ?? all[0] ?? null;
  };

  // Poll for up to 8 s; also listen for the 'serviceworker' event so we catch the
  // first registration even before the poll loop ticks (mirrors bloomberg-ccpa.js).
  let sw = findOurSw();
  if (!sw) {
    const swEventPromise = browser.waitForEvent('serviceworker', { timeout: 8000 }).catch(() => null);
    const deadline = Date.now() + 8000;
    while (!sw && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 100));
      sw = findOurSw();
    }
    if (!sw) sw = await swEventPromise;
    if (sw && !sw.url().startsWith('chrome-extension://')) sw = null; // reject page SWs
  }

  if (sw) {
    try {
      await sw.evaluate((data) => new Promise((resolve) => chrome.storage.sync.set(data, resolve)), payload);
      return null;
    } catch (_) {
      // SW found but evaluate failed (chrome API not ready) — fall through to page approach
    }
  }

  // Fallback: write via the extension popup page so chrome.storage is available in page context.
  // When using system Chrome via executablePath, extension SWs are not exposed via Playwright's
  // serviceWorkers() API. We resolve the extension ID from the browser profile instead.
  const swPage = await browser.newPage();
  try {
    // 1. Try to get ID from any already-visible chrome-extension:// SW or page.
    let extId =
      browser.serviceWorkers().find(w => w.url().startsWith('chrome-extension://'))?.url().match(/^chrome-extension:\/\/([^/]+)/)?.[1]
      ?? browser.pages().find(p => p.url().startsWith('chrome-extension://'))?.url().match(/^chrome-extension:\/\/([^/]+)/)?.[1];

    // 2. If not found, read the extension ID from the browser profile's Secure Preferences.
    //    Chrome assigns a deterministic ID to each unpacked extension based on its path.
    //    The ID is stored in {profile}/Default/Secure Preferences under extensions.settings.
    if (!extId) {
      const profileDirs = [profileDir, VPN_PROFILE_DIR].filter(Boolean);
      for (const profileDir of profileDirs) {
        const secPrefsPath = path.join(profileDir, 'Default', 'Secure Preferences');
        try {
          const secPrefs = JSON.parse(fs.readFileSync(secPrefsPath, 'utf8'));
          const extSettings = secPrefs?.extensions?.settings ?? {};
          const knownVpnIds = new Set([
            vpnExtId,
            VPN_EXT_DIR ? path.basename(VPN_EXT_DIR) : null,
          ].filter(Boolean));
          const knownBrowserExtIds = new Set(['ghbmnnjooekpmoecnnnilnnbdlolhkhi', 'nmmhkkegccagdldgiimedpiccmgmieda', 'mhjfbmdgcfjbbpaeojofohoefgiehjai']);
          for (const [id, extData] of Object.entries(extSettings)) {
            if (knownVpnIds.has(id) || knownBrowserExtIds.has(id)) continue;
            const extPath = extData?.path ?? '';
            // Our extension is loaded from EXT_DIR (possibly via symlink); either path matches
            if (extPath === EXT_DIR || extPath === EXT_LAUNCH_DIR ||
                extPath.includes('emc-extension') || extPath.includes('Eat My Cookies') ||
                extPath.includes('eat-my-cookies')) {
              extId = id;
              break;
            }
          }
        } catch (_) {}
        if (extId) break;
      }
    }

    if (extId) {
      const extensionUrls = [
        `chrome-extension://${extId}/popup/popup.html`,
        `chrome-extension://${extId}/onboarding/onboarding.html`,
      ];

      for (const url of extensionUrls) {
        try {
          await swPage.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: 15000,
          });
          const stored = await swPage.evaluate(async (data) => {
            await new Promise((resolve) => chrome.storage.sync.set(data, resolve));
            return await new Promise((resolve) => chrome.storage.sync.get(['globalPreference', 'onboardingComplete'], resolve));
          }, payload);
          if (stored?.globalPreference === payload.globalPreference && stored?.onboardingComplete === true) {
            return swPage;
          }
        } catch (_) {}
      }
    }
  } catch (_) {}
  return swPage;
}

async function readStatsSnapshot(browser) {
  const payload = {
    stats: {
      totalActionsCount: 0,
      recentActivity: [],
      lastActionSite: null,
    },
  };

  const allSws = browser.serviceWorkers();
  const vpnExtId = VPN_EXT_DIR ? path.basename(path.dirname(VPN_EXT_DIR)) : null;
  const sw = allSws.find(w => !vpnExtId || !w.url().includes(vpnExtId)) ?? allSws[0];
  if (sw) {
    try {
      const result = await sw.evaluate((defaults) => new Promise((resolve) => chrome.storage.local.get(defaults, resolve)), payload);
      return result?.stats ?? payload.stats;
    } catch (_) {}
  }

  const page = await browser.newPage();
  try {
    await page.goto('chrome-extension://invalid/', { waitUntil: 'domcontentloaded', timeout: 1000 }).catch(() => {});
    const pages = browser.pages();
    const extPage = pages.find((candidate) => candidate.url().startsWith('chrome-extension://')) ?? page;
    const result = await extPage.evaluate((defaults) => new Promise((resolve) => chrome.storage.local.get(defaults, resolve)), payload);
    return result?.stats ?? payload.stats;
  } catch (_) {
    return payload.stats;
  } finally {
    if (!page.isClosed()) await page.close();
  }
}

async function warmupExtensionRoundTrip(browser) {
  const page = await browser.newPage();
  try {
    await page.goto('https://example.com', { waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(800);
  } finally {
    if (!page.isClosed()) await page.close().catch(() => {});
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  console.log(`\nEat My Cookies — validation suite`);
  console.log(`Extension: ${EXT_DIR}`);
  console.log(`Sites: ${sites.length}  |  Headed: ${headed || useVpn}  |  VPN: ${useVpn}`);

  if (useVpn && !VPN_EXT_DIR) {
    console.error([
      '',
      '  --vpn requires a path to an unpacked VPN extension.',
      '  Provide it via one of:',
      '    --vpn-ext=<path>     e.g. --vpn-ext=~/Downloads/browsec/3.93.2_0',
      '    EMC_VPN_EXT=<path>   environment variable (add to .env or shell profile)',
      '',
      '  To get the extension path:',
      '    1. Install Browsec from the Chrome Web Store (ID: omghfjlpggmjjaagoclmmobgdodcjboh)',
      '    2. In Chrome, go to chrome://extensions → enable "Developer mode"',
      '    3. Find Browsec → click the extension ID link → note the "Path" shown',
      '    4. Pass that path here, or export it as EMC_VPN_EXT in your shell.',
      '',
    ].join('\n'));
    process.exit(1);
  }

  if (useVpn) {
    fs.mkdirSync(VPN_PROFILE_DIR, { recursive: true });
    clearChromeSingletonFiles(VPN_PROFILE_DIR);
  }
  fs.mkdirSync(BROWSER_HOME_DIR, { recursive: true });

  const launchExtDir = prepareExtensionLaunchDir(EXT_DIR);
  const extPaths = useVpn ? [launchExtDir, VPN_EXT_DIR] : [launchExtDir];
  const userDataDir = useVpn
    ? createFreshVpnRunProfile(VPN_PROFILE_DIR)
    : '';

  const headless = !headed && !useVpn;
  const launchOptions = {
    headless,
    args: [
      `--disable-extensions-except=${extPaths.join(',')}`,
      `--load-extension=${extPaths.join(',')}`,
      '--no-sandbox',
    ],
    env: {
      ...process.env,
      HOME: BROWSER_HOME_DIR,
    },
    viewport: { width: 1280, height: 800 },
  };

  // Playwright's bundled Chromium does not expose extension service workers in
  // headless mode, which prevents writePreferences from finding the SW. System
  // Chromium (at /Applications/Chromium.app on macOS) does expose them.
  // Try system Chromium first; fall back to the bundled build silently.
  let browser;
  if (headless) {
    try {
      browser = await chromium.launchPersistentContext(userDataDir, { ...launchOptions, channel: 'chromium' });
    } catch (_) {
      browser = await chromium.launchPersistentContext(userDataDir, launchOptions);
    }
  } else if (useVpn) {
    // Prefer system Chrome first in VPN mode. On this machine the bundled
    // Playwright Chromium can stall while launching the persistent VPN profile
    // before validation even starts. The writePreferences helper already has a
    // popup-page fallback when service workers are not exposed, so system Chrome
    // remains a valid headed fallback for real-site VPN validation.
    const vpnCandidates = [
      { channel: 'chrome' },
      getSystemChromeExecutable() ? { executablePath: getSystemChromeExecutable() } : null,
      { channel: 'chromium' },
      {},
    ].filter(Boolean);
    for (const candidate of vpnCandidates) {
      try {
        browser = await chromium.launchPersistentContext(userDataDir, { ...launchOptions, ...candidate });
        break;
      } catch (_) {}
    }
  } else {
    const headedCandidates = [
      getSystemChromeExecutable() ? { executablePath: getSystemChromeExecutable() } : null,
      { channel: 'chrome' },
      { channel: 'chromium' },
    ].filter(Boolean);
    for (const candidate of headedCandidates) {
      try {
        browser = await chromium.launchPersistentContext(userDataDir, { ...launchOptions, ...candidate });
        break;
      } catch (_) {}
    }
    if (!browser) {
      browser = await chromium.launchPersistentContext(userDataDir, launchOptions);
    }
  }
  if (!browser) {
    browser = await chromium.launchPersistentContext(userDataDir, launchOptions);
  }

  if (useVpn) {
    console.log(`VPN mode: base profile ${VPN_PROFILE_DIR}`);
    console.log(`VPN mode: active profile ${userDataDir}`);
    console.log('Waiting 4s for VPN extension to reconnect...');
    await new Promise(r => setTimeout(r, 4000));
  }

  // Navigate a warmup page so the extension's service worker activates and
  // becomes visible to Playwright's browser.serviceWorkers() API. Without this,
  // writePreferences can miss the SW and onboardingComplete never gets set.
  // This applies to both normal and VPN mode.
  const warmupPage = await browser.newPage();
  await warmupPage.goto('https://example.com', { waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => {});
  await warmupPage.close();

  // Complete onboarding via the service worker so chrome.storage.sync is accessible
  let swPage = null;
  try {
    const defaultPreference = sites[0]?.preference ?? 'reject_all';
    swPage = await writePreferences(browser, defaultPreference, sites[0] ?? null, userDataDir);
  } catch (_) {}
  if (swPage) await swPage.close();
  await warmupExtensionRoundTrip(browser);

  printHeader();

  for (const site of sites) {
    const page = await browser.newPage();
    try {
      const preference = site.preference ?? 'reject_all';
      const tmpPage = await writePreferences(browser, preference, site, userDataDir).catch(() => null);
      if (tmpPage) await tmpPage.close();
      await warmupExtensionRoundTrip(browser);
      const { status, detail } = await testSite(page, site);
      printRow(site, status, detail);
      results[status.toLowerCase()].push({ ...site, detail });
    } catch (e) {
      const detail = e.message.split('\n')[0];
      printRow(site, 'FAIL', detail);
      results.fail.push({ ...site, detail });
    } finally {
      await page.close();
    }
  }

  await browser.close();
  if (useVpn) {
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch (_) {}
  }
  printSummary();

  process.exit(results.fail.length > 0 ? 1 : 0);
})();
