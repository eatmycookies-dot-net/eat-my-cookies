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
const MANUAL_CONSENT_OPEN_KEY = '__emc_manual_consent_open__';

// ── Argument parsing ──────────────────────────────────────────────────────────
const args     = process.argv.slice(2);
const headed   = args.includes('--headed');
const useVpn   = args.includes('--vpn');
const region   = argVal(args, '--region');
const cmpFilter= argVal(args, '--cmp');
const siteName = argVal(args, '--site');

function hasManifestFile(dir) {
  try {
    return fs.statSync(path.join(dir, 'manifest.json')).isFile();
  } catch (_) {
    return false;
  }
}

function resolveVpnExtensionPath(candidate) {
  if (!candidate) return null;

  if (hasManifestFile(candidate)) {
    return candidate;
  }

  let entries;
  try {
    entries = fs.readdirSync(candidate, { withFileTypes: true });
  } catch (_) {
    return null;
  }

  const versionDirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(candidate, entry.name))
    .filter(hasManifestFile)
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b), undefined, { numeric: true }));

  return versionDirs.at(-1) ?? null;
}

function discoverBundledVpnExtensionPath() {
  const candidates = [
    path.resolve(__dirname, '..', '..', 'vpn-extension', 'omghfjlpggmjjaagoclmmobgdodcjboh'),
    path.resolve(__dirname, '..', '.tmp-vpn-extension', 'omghfjlpggmjjaagoclmmobgdodcjboh'),
  ];

  for (const candidate of candidates) {
    const resolved = resolveVpnExtensionPath(candidate);
    if (resolved) return resolved;
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
const VPN_EXT_SOURCE = vpnExtArg
  ? path.resolve(vpnExtArg)
  : process.env.EMC_VPN_EXT
    ? path.resolve(process.env.EMC_VPN_EXT)
    : null;
const VPN_EXT_DIR = resolveVpnExtensionPath(VPN_EXT_SOURCE) ?? discoverBundledVpnExtensionPath();

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

// ── CMP family drift detection ──────────────────────────────────────────────
// Cheap, flow-independent signature check: does the CMP actually present on
// the live page still match what tests/sites.json's "cmp" field declares?
// This runs on every e2e invocation automatically (no separate command to
// remember) and exists because both the nytimes.com and spiegel.de August 2026
// regressions were CMP-family changes on the site's side, not code bugs — the
// existing pass/fail checks couldn't distinguish "the CMP changed out from
// under us" from "our handler has a bug", and both looked like plain failures
// (or worse, silent passes) until someone manually inspected the live page.
//
// Deliberately reuses CMPS (rules/cmps.json's own detectors) instead of a
// second hand-written signature table, so this stays in sync with the
// extension's real CMP definitions with zero duplication. Only CMPs handled
// exclusively via dedicated frame content scripts (not a rules/cmps.json
// declarative entry) need a supplemental signature here — plus Fides, which
// isn't supported yet but is worth detecting since it's the CMP nytimes.com
// switched to.
const SUPPLEMENTAL_CMP_SIGNATURES = [
  {
    id: 'appconsent',
    name: 'AppConsent',
    detectors: [
      { type: 'css_selector', value: '#appconsent' },
      { type: 'css_selector', value: "iframe[title='Consent window']" },
    ],
  },
  {
    id: 'ketch',
    name: 'Ketch',
    detectors: [
      { type: 'js_global', value: 'window.semaphore' },
      { type: 'css_selector', value: '[data-testid="ketch"], .ketch-banner' },
    ],
  },
  {
    id: 'fides',
    name: 'Fides',
    detectors: [
      { type: 'js_global', value: 'window.Fides' },
      { type: 'css_selector', value: '[id^="fides-"], [class*="fides-banner"]' },
    ],
  },
];

const DRIFT_DETECTION_CMPS = [...CMPS, ...SUPPLEMENTAL_CMP_SIGNATURES];

// "cmp" labels that describe a real unresolved state rather than naming a CMP —
// nothing to compare a live detection against.
const CMP_LABEL_IGNORE = new Set(['needs validation']);

// tests/sites.json's "cmp" field is free text for humans ("Sourcepoint (USNat)",
// "OneTrust / consent-or-pay", "AppConsent / figconsent"). Split on "/" and match
// each part against known CMP ids/names so hybrid labels resolve to every family
// they mention, not just the first.
function expectedCmpFamilyIds(site) {
  const label = (site.cmp ?? '').toLowerCase().trim();
  if (!label || CMP_LABEL_IGNORE.has(label)) return [];

  const parts = label.split('/').map((part) => part.trim()).filter(Boolean);
  const matches = new Set();
  for (const part of parts) {
    for (const cmp of DRIFT_DETECTION_CMPS) {
      const idLower = cmp.id.toLowerCase();
      const nameLower = (cmp.name ?? '').toLowerCase();
      if (part.includes(idLower) || idLower.includes(part) || part.includes(nameLower) || nameLower.includes(part)) {
        matches.add(cmp.id);
      }
    }
  }
  return [...matches];
}

async function detectActualCmpFamilies(page) {
  const detected = new Set();
  for (const frame of page.frames()) {
    let frameHits;
    try {
      frameHits = await frame.evaluate((cmps) => {
        const hits = [];
        for (const cmp of cmps) {
          for (const detector of cmp.detectors ?? []) {
            try {
              if (detector.type === 'css_selector' && document.querySelector(detector.value)) {
                hits.push(cmp.id);
                break;
              }
              if (detector.type === 'js_global') {
                const path = detector.value.replace(/^window\./, '');
                if (path.split('.').reduce((obj, key) => obj?.[key], window) !== undefined) {
                  hits.push(cmp.id);
                  break;
                }
              }
              if (detector.type === 'script_src' &&
                  Array.from(document.scripts).some((s) => s.src.includes(detector.value))) {
                hits.push(cmp.id);
                break;
              }
            } catch (_) {}
          }
        }
        return hits;
      }, DRIFT_DETECTION_CMPS);
    } catch (_) {
      frameHits = [];
    }
    frameHits.forEach((id) => detected.add(id));
  }
  return detected;
}

async function checkCmpFamilyDrift(page, site) {
  const expected = expectedCmpFamilyIds(site);
  if (!expected.length) return null; // e.g. "Needs validation" — nothing declared to compare against

  const detected = await detectActualCmpFamilies(page);
  if (!detected.size) return null; // no CMP signature observed this run — ambiguous (geo/session), not evidence of drift

  if (expected.some((id) => detected.has(id))) return null;

  return `CMP family drift: sites.json declares "${site.cmp}" but the live page matches [${[...detected].join(', ')}] instead. The site's actual CMP likely changed — re-verify which handler needs to run here before trusting any other result on this row.`;
}

// ── Results ───────────────────────────────────────────────────────────────────
const results = { pass: [], fail: [], skip: [] };

// Set once in the main IIFE right after userDataDir is computed. readStatsSnapshot's
// fallback needs this to resolve the extension ID (see resolveExtensionId) when the
// service worker isn't visible via serviceWorkers() — which can happen from the very
// start (system Chrome) or partway through a run (MV3 tearing down an inactive SW).
let currentRunProfileDir = '';

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
  // CMP family drift check — independent of whether our own bannerSelectors matched,
  // since a stale/wrong assumption about which CMP a site uses is exactly what this
  // catches. See buildDriftDetectionCmps() for why this doesn't duplicate rules/cmps.json.
  const cmpDriftIssue = await checkCmpFamilyDrift(page, site);
  if (cmpDriftIssue) {
    return { status: 'FAIL', detail: cmpDriftIssue };
  }

  if (!bannerFound) {
    await page.waitForTimeout(handleWaitMs);
    const afterStats = await readStatsSnapshot(page.context());
    const recorded = extractNewActivityForSite(beforeStats, afterStats, site);
    if (recorded) {
      const activityIssue = validateExpectedActivity(recorded, site);
      if (activityIssue) {
        return { status: 'FAIL', detail: `Handled before banner polling but ${activityIssue}` };
      }
      const forbiddenTextIssue = await validateForbiddenTextAbsent(page, site);
      if (forbiddenTextIssue) {
        return { status: 'FAIL', detail: `Handled before banner polling but ${forbiddenTextIssue}` };
      }
      if (site.requirePostRecordedBannerGone) {
        const bannerStillVisible = await anyVisible(page, site.bannerSelectors);
        if (bannerStillVisible) {
          return { status: 'FAIL', detail: await buildFailureDetail(page, site, beforeStats, `Handled before banner polling (${recorded.method ?? 'recorded action'}) but banner still visible`) };
        }
      }
      const leMondeMismatch = site.expectedLeMondePurposeStates
        ? await readLeMondePurposeStateMismatch(page, site.expectedLeMondePurposeStates)
        : null;
      if (leMondeMismatch) {
        return { status: 'FAIL', detail: `Handled before banner polling (${recorded.method ?? 'recorded action'}) but ${formatLeMondeMismatch(leMondeMismatch)}` };
      }
      if (site.verifyLeMondeManualReopenNoActivity) {
        const manualIssue = await verifyLeMondeManualReopenDoesNotRecord(page, site);
        if (manualIssue) {
          return { status: 'FAIL', detail: `Handled before banner polling but ${manualIssue}` };
        }
      }
      if (site.verifyManualConsentOpenNoActivity) {
        const manualIssue = await verifyManualConsentOpenDoesNotRecord(page, site);
        if (manualIssue) {
          return { status: 'FAIL', detail: `Handled before banner polling but ${manualIssue}` };
        }
      }
      const suffix = [
        site.expectedLeMondePurposeStates ? '; Le Monde purpose state verified' : '',
        site.verifyLeMondeManualReopenNoActivity ? '; manual reopen did not record' : '',
        site.verifyManualConsentOpenNoActivity ? '; manual consent open did not record' : '',
      ].join('');
      return {
        status: 'PASS',
        detail: `Handled before banner polling (${recorded.method ?? 'recorded action'})${suffix}`,
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
  // (some CMPs hide but don't remove the container). An empty/missing
  // consentSelectors list must never count as "gone" — that would vacuously
  // pass every site with no selectors configured, regardless of whether the
  // extension did anything at all.
  const hasConsentSelectors = Boolean(site.consentSelectors?.length);
  const consentButtonGone = hasConsentSelectors && !(await anyVisible(page, site.consentSelectors));
  if (!consentHandled && consentButtonGone) {
    consentHandled = true;
    detail = 'Consent recorded (container persists but buttons gone)';
  }

  if (!consentHandled) {
    const afterStats = await readStatsSnapshot(page.context());
    const recorded = extractNewActivityForSite(beforeStats, afterStats, site);
    if (site.allowRecordedActionPass && recorded) {
      const navigationIssue = validateNavigationExpectations(page.url(), visitedTopLevelUrls, site.navigationExpectations);
      const forbiddenTextIssue = await validateForbiddenTextAbsent(page, site);
      if (!navigationIssue && !forbiddenTextIssue) {
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
    const activityIssue = validateExpectedActivity(recorded, site);
    if (activityIssue) {
      return { status: 'FAIL', detail: activityIssue };
    }
    detail += `; activity recorded (${recorded.method ?? 'recorded action'})`;
  }

  const forbiddenTextIssue = await validateForbiddenTextAbsent(page, site);
  if (forbiddenTextIssue) {
    return { status: 'FAIL', detail: forbiddenTextIssue };
  }
  if (site.forbiddenTextAfterHandle?.length) {
    detail += '; forbidden text absent';
  }

  if (site.expectedOneTrustToggleStates) {
    const mismatch = await readOneTrustToggleStateMismatch(page, site.expectedOneTrustToggleStates);
    if (mismatch) {
      return { status: 'FAIL', detail: `Banner dismissed but toggle ${mismatch.id} expected=${mismatch.expected} actual=${mismatch.actual}` };
    }
    detail += '; toggle state verified';
  }

  if (site.expectedLeMondePurposeStates) {
    const mismatch = await readLeMondePurposeStateMismatch(page, site.expectedLeMondePurposeStates);
    if (mismatch) {
      return { status: 'FAIL', detail: `Banner dismissed${recorded ? ` (${recorded.method ?? 'recorded action'})` : ''} but ${formatLeMondeMismatch(mismatch)}` };
    }
    detail += '; Le Monde purpose state verified';
  }

  if (site.verifyLeMondeManualReopenNoActivity) {
    const manualIssue = await verifyLeMondeManualReopenDoesNotRecord(page, site);
    if (manualIssue) {
      return { status: 'FAIL', detail: manualIssue };
    }
    detail += '; manual reopen did not record';
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

  if (site.verifyManualConsentOpenNoActivity) {
    const manualIssue = await verifyManualConsentOpenDoesNotRecord(page, site);
    if (manualIssue) {
      return { status: 'FAIL', detail: manualIssue };
    }
    detail += '; manual consent open did not record';
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
  const visibleSiteSelectors = [];
  for (const selector of site.bannerSelectors ?? []) {
    if (await selectorVisible(page, selector).catch(() => false)) {
      visibleSiteSelectors.push(selector);
    }
  }
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

  return `${prefix}; recorded=${recorded ? (recorded.method ?? 'yes') : 'none'}; emcPref=${diag?.emcPref ?? 'n/a'}; privacyChoicesVisible=${diag?.privacyChoicesVisible ?? 'n/a'}; confirm=${diag?.confirmText ?? 'n/a'}; confirmVisible=${diag?.confirmVisible ?? 'n/a'}; visible=${(diag?.bannerVisible ?? []).join('|') || 'none'}; siteVisible=${visibleSiteSelectors.join('|') || 'none'}; toggles=${JSON.stringify(diag?.toggles ?? [])}`;
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

async function readLeMondePurposeStateMismatch(page, expectedStates) {
  await waitForLeMondeConsentCookie(page, 7000);
  const opened = await openLeMondeCookiePreferences(page);
  if (!opened) return { purpose: 'settings', expected: 'openable', actual: 'missing' };

  const visible = await waitForAny(page, ['[data-gdpr-params-purpose]'], 7000);
  if (!visible) return { purpose: 'settings', expected: 'visible', actual: 'hidden' };
  await page.waitForTimeout(1000);

  const snapshot = await page.evaluate(() => {
    const visibleEnough = (el) => {
      const row = el.closest('section, article, li, div') ?? el;
      const rect = row.getBoundingClientRect();
      const style = getComputedStyle(row);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const entries = Array.from(document.querySelectorAll('input[data-gdpr-params-purpose]'))
      .filter(visibleEnough)
      .map((input) => ({
        purpose: input.getAttribute('data-gdpr-params-purpose'),
        checked: Boolean(input.checked),
      }))
      .filter((entry) => Boolean(entry.purpose));
    const rawCookie = document.cookie
      .split('; ')
      .filter((part) => part.startsWith('lmd_consent='))
      .at(-1)
      ?.slice('lmd_consent='.length) ?? null;
    let cookiePurposes = null;
    try {
      cookiePurposes = rawCookie ? JSON.parse(decodeURIComponent(rawCookie))?.purposes ?? null : null;
    } catch (_) {
      cookiePurposes = null;
    }
    return {
      entries,
      cookiePurposes,
      emcRunSignature: document.documentElement.dataset.emcRunSignature ?? null,
    };
  }).catch(() => ({ entries: [], cookiePurposes: null }));

  const actualEntries = snapshot.entries ?? [];

  for (const [purpose, expected] of Object.entries(expectedStates)) {
    const controls = actualEntries.filter((entry) => entry.purpose === purpose);
    if (!controls.length) {
      return { purpose, expected: Boolean(expected), actual: 'missing', snapshot };
    }
    const mismatch = controls.find((entry) => entry.checked !== Boolean(expected));
    if (mismatch) {
      return { purpose, expected: Boolean(expected), actual: mismatch.checked, snapshot };
    }
  }
  return null;
}

async function waitForLeMondeConsentCookie(page, timeoutMs = 7000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const found = await page.evaluate(() => document.cookie.includes('lmd_consent=')).catch(() => false);
    if (found) return true;
    await page.waitForTimeout(250);
  }
  return page.evaluate(() => document.cookie.includes('lmd_consent=')).catch(() => false);
}

function formatLeMondeMismatch(mismatch) {
  const entries = (mismatch.snapshot?.entries ?? [])
    .map((entry) => `${entry.purpose}:${entry.checked ? 'on' : 'off'}`)
    .join(',');
  const cookie = mismatch.snapshot?.cookiePurposes
    ? Object.entries(mismatch.snapshot.cookiePurposes)
      .map(([purpose, enabled]) => `${purpose}:${enabled ? 'on' : 'off'}`)
      .join(',')
    : 'none';
  return `Le Monde purpose ${mismatch.purpose} expected=${mismatch.expected} actual=${mismatch.actual}; visible=${entries || 'none'}; cookie=${cookie}; run=${mismatch.snapshot?.emcRunSignature ?? 'none'}`;
}

async function verifyLeMondeManualReopenDoesNotRecord(page, site) {
  const beforeStats = await readStatsSnapshot(page.context());
  const opened = await openLeMondeCookiePreferences(page);
  if (!opened) return 'Manual Le Monde cookie preferences reopen failed';

  await page.waitForTimeout(5000);
  const afterStats = await readStatsSnapshot(page.context());
  const recorded = extractNewActivityForSite(beforeStats, afterStats, site);
  if (recorded) {
    return `Manual Le Monde cookie preferences reopen recorded unexpected activity (${recorded.method ?? 'recorded action'})`;
  }
  return null;
}

async function verifyManualConsentOpenDoesNotRecord(page, site) {
  const config = site.verifyManualConsentOpenNoActivity;
  if (!config?.selectors?.length) return 'Manual consent-open verification has no selectors';

  const beforeStats = await readStatsSnapshot(page.context());
  const clicked = await clickFirstConfiguredSelector(page, config.selectors);
  if (!clicked) return 'Manual consent-open control was not clickable';

  await page.waitForTimeout(config.waitMs ?? 5000);
  const afterStats = await readStatsSnapshot(page.context());
  const recorded = extractNewActivityForSite(beforeStats, afterStats, site);
  if (recorded) {
    return `Manual consent-open control recorded unexpected activity (${recorded.method ?? 'recorded action'})`;
  }

  if (config.expectedFinalUrlPattern) {
    const pattern = new RegExp(config.expectedFinalUrlPattern);
    if (!pattern.test(page.url())) {
      return `Manual consent-open expected URL ${config.expectedFinalUrlPattern} but got ${page.url()}`;
    }
  }

  for (const selector of config.expectedVisibleSelectors ?? []) {
    if (!(await selectorVisible(page, selector).catch(() => false))) {
      return `Manual consent-open expected visible selector ${selector}`;
    }
  }

  return null;
}

async function clickFirstConfiguredSelector(page, selectors) {
  for (const selector of selectors) {
    try {
      if (selector.startsWith('text:')) {
        await page.getByText(selector.slice(5), { exact: false }).last().click({ timeout: 3000 });
        return true;
      }
      await page.locator(selector).last().click({ timeout: 3000 });
      return true;
    } catch (_) {}
  }
  return false;
}

async function openLeMondeCookiePreferences(page) {
  if (await selectorVisible(page, '[data-gdpr-params-purpose]').catch(() => false)) return true;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
    await page.waitForTimeout(700);

    const openedByVisibleLink = await page.locator('.footer__link.gdpr-cs-parameters-link:visible, .gdpr-cs-parameters-link:visible, [data-gdpr-action="settings"]:visible')
      .last()
      .click({ timeout: 2000, force: true })
      .then(() => true)
      .catch(() => false);
    if (openedByVisibleLink) {
      await waitForAny(page, ['[data-gdpr-params-purpose]', '.gdpr-lmd-params'], 7000);
      return true;
    }
  }

  const locator = page.locator('.gdpr-cs-parameters-link, [data-gdpr-action="settings"]');
  const count = await locator.count().catch(() => 0);
  for (let i = 0; i < count; i += 1) {
      const candidate = locator.nth(i);
      if (await candidate.isVisible().catch(() => false)) {
        if (await candidate.click({ timeout: 5000, force: true }).then(() => true).catch(() => false)) {
          await waitForAny(page, ['[data-gdpr-params-purpose]', '.gdpr-lmd-params'], 7000);
          return true;
        }
      }
  }

  const textOpened = await page.getByText(/Cookie Preferences|Cookie Settings|Manage Cookies|Gestion des cookies|Param[eé]trage des cookies|Param[eé]trer les cookies/i)
    .last()
    .click({ timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  if (textOpened) {
    await waitForAny(page, ['[data-gdpr-params-purpose]', '.gdpr-lmd-params'], 7000);
    return true;
  }

  return false;
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

function validateExpectedActivity(recorded, site) {
  if (site.expectedActivityMethod && recorded?.method !== site.expectedActivityMethod) {
    return `activity method expected=${site.expectedActivityMethod} actual=${recorded?.method ?? 'none'}`;
  }

  if (site.expectedActivityMethodPrefixes?.length) {
    const actual = recorded?.method ?? '';
    const matchesFamily = site.expectedActivityMethodPrefixes.some((prefix) => actual.startsWith(prefix));
    if (!matchesFamily) {
      return `activity method expected one of [${site.expectedActivityMethodPrefixes.join(', ')}] but actual=${actual || 'none'} — this usually means the CMP-specific handler didn't fire and a weaker fallback (e.g. heuristic) caught it instead`;
    }
  }

  return null;
}

async function validateForbiddenTextAbsent(page, site) {
  const patterns = site.forbiddenTextAfterHandle ?? [];
  if (!patterns.length) return null;

  const text = await page.evaluate(() => document.body?.innerText ?? '').catch(() => '');
  const normalized = text.replace(/\s+/g, ' ').toLowerCase();
  const found = patterns.find((pattern) => new RegExp(pattern, 'i').test(normalized));
  return found ? `forbidden text still present after handling (${found})` : null;
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

function categoryPreferencesEqual(actual, expected) {
  if (!actual || !expected) return false;
  return ['functional', 'analytics', 'advertising', 'ccpaDoNotSell', 'uncategorized']
    .every((key) => actual[key] === expected[key]);
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

// Resolves the unpacked extension's chrome-extension:// ID so a page can be
// navigated there to reach chrome.storage when the extension's service worker
// isn't visible via Playwright's serviceWorkers() API. This happens whenever
// system Chrome is used (see getSystemChromeExecutable() call sites) and can
// also happen for the *original* SW instance going dormant (MV3 tears down
// inactive service workers) partway through a long-running site test — a
// respawned SW isn't guaranteed to still be the same tracked target, so any
// code relying on a single serviceWorkers() snapshot from earlier in the run
// can silently stop working. Shared by writePreferences() and
// readStatsSnapshot() so this resolution logic exists in exactly one place.
function resolveExtensionIdOnce(browser, profileDir, vpnExtId) {
  let extId =
    browser.serviceWorkers().find(w => w.url().startsWith('chrome-extension://'))?.url().match(/^chrome-extension:\/\/([^/]+)/)?.[1]
    ?? browser.pages().find(p => p.url().startsWith('chrome-extension://'))?.url().match(/^chrome-extension:\/\/([^/]+)/)?.[1];

  if (extId) return extId;

  // Read the extension ID from the browser profile's Secure Preferences.
  // Chrome assigns a deterministic ID to each unpacked extension based on its
  // path. The ID is stored in {profile}/Default/Secure Preferences under
  // extensions.settings.
  const profileDirs = [profileDir, VPN_PROFILE_DIR].filter(Boolean);
  for (const dir of profileDirs) {
    const secPrefsPath = path.join(dir, 'Default', 'Secure Preferences');
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
          return id;
        }
      }
    } catch (_) {}
  }

  return null;
}

// Chrome writes Secure Preferences asynchronously after launch — reading it
// immediately after launchPersistentContext resolves can race a genuinely
// fresh profile directory (no stale file left over from a previous run to
// paper over the timing). Poll briefly rather than accepting a single miss.
async function resolveExtensionId(browser, profileDir = '', vpnExtId = null, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let extId = resolveExtensionIdOnce(browser, profileDir, vpnExtId);
  while (!extId && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    extId = resolveExtensionIdOnce(browser, profileDir, vpnExtId);
  }
  return extId;
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
  const siteOverrides = site?.siteOverrides ?? {};

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
      const stored = await sw.evaluate(async (data) => {
        await Promise.all([
          new Promise((resolve) => chrome.storage.sync.set(data.payload, resolve)),
          new Promise((resolve) => chrome.storage.local.set({ siteOverrides: data.siteOverrides }, resolve)),
          new Promise((resolve) => chrome.storage.local.remove(data.manualConsentOpenKey, resolve)),
        ]);
        return await new Promise((resolve) => chrome.storage.sync.get(['globalPreference', 'onboardingComplete', 'categoryPreferences'], resolve));
      }, { payload, siteOverrides, manualConsentOpenKey: MANUAL_CONSENT_OPEN_KEY });
      if (stored?.globalPreference === payload.globalPreference &&
          stored?.onboardingComplete === true &&
          categoryPreferencesEqual(stored?.categoryPreferences, payload.categoryPreferences)) {
        return null;
      }
    } catch (_) {
      // SW found but evaluate failed (chrome API not ready) — fall through to page approach
    }
  }

  // Fallback: write via the extension popup page so chrome.storage is available in page context.
  // When using system Chrome via executablePath, extension SWs are not exposed via Playwright's
  // serviceWorkers() API. We resolve the extension ID from the browser profile instead.
  const swPage = await browser.newPage();
  try {
    const extId = await resolveExtensionId(browser, profileDir, vpnExtId);

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
            await new Promise((resolve) => chrome.storage.sync.set(data.payload, resolve));
            await new Promise((resolve) => chrome.storage.local.set({ siteOverrides: data.siteOverrides }, resolve));
            await new Promise((resolve) => chrome.storage.local.remove(data.manualConsentOpenKey, resolve));
            return await new Promise((resolve) => chrome.storage.sync.get(['globalPreference', 'onboardingComplete', 'categoryPreferences'], resolve));
          }, { payload, siteOverrides, manualConsentOpenKey: MANUAL_CONSENT_OPEN_KEY });
          if (stored?.globalPreference === payload.globalPreference &&
              stored?.onboardingComplete === true &&
              categoryPreferencesEqual(stored?.categoryPreferences, payload.categoryPreferences)) {
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

  // Fallback: navigate to a real extension page so chrome.storage is available in
  // page context. This mirrors writePreferences()'s fallback — a real
  // chrome-extension://<id>/... URL, not the previous 'chrome-extension://invalid/'
  // placeholder, which never becomes a real extension context, so reading
  // chrome.storage there always threw and silently fell through to returning the
  // hardcoded zero defaults regardless of what was actually in storage.
  const extId = await resolveExtensionId(browser, currentRunProfileDir, vpnExtId);
  if (!extId) return payload.stats;

  const page = await browser.newPage();
  try {
    for (const url of [
      `chrome-extension://${extId}/popup/popup.html`,
      `chrome-extension://${extId}/onboarding/onboarding.html`,
    ]) {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 8000 });
        const result = await page.evaluate((defaults) => new Promise((resolve) => chrome.storage.local.get(defaults, resolve)), payload);
        if (result?.stats) return result.stats;
      } catch (_) {}
    }
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
    if (VPN_EXT_SOURCE) {
      console.error([
        '',
        '  The configured VPN extension path is not a readable unpacked extension.',
        `  Path: ${VPN_EXT_SOURCE}`,
        '',
        '  Expected either a directory containing manifest.json or a Chrome Web Store',
        '  extension folder containing a version subdirectory with manifest.json.',
        '',
      ].join('\n'));
    }
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
  // Always launch with a real, known profile directory rather than an empty
  // string. An empty string still works (Playwright creates an ephemeral
  // profile internally), but then nothing in this script knows its real path —
  // which breaks resolveExtensionId()'s Secure Preferences fallback, the only
  // thing that works when the extension's service worker isn't visible via
  // serviceWorkers() (system Chrome from the very start, or an MV3 service
  // worker going dormant partway through a long site test).
  const userDataDir = useVpn
    ? createFreshVpnRunProfile(VPN_PROFILE_DIR)
    : fs.mkdtempSync(path.join(os.tmpdir(), 'emc-run-profile-'));
  currentRunProfileDir = userDataDir;

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
    // Prefer Chromium-based launches that expose extension service workers.
    // The system Chrome path can hide the EMC worker in VPN mode, which leaves
    // onboardingComplete unset and makes every geo-sensitive run look like a
    // site failure when the harness is actually at fault.
    const vpnCandidates = [
      { channel: 'chromium' },
      {},
      { channel: 'chrome' },
      getSystemChromeExecutable() ? { executablePath: getSystemChromeExecutable() } : null,
    ].filter(Boolean);
    for (const candidate of vpnCandidates) {
      try {
        browser = await chromium.launchPersistentContext(userDataDir, { ...launchOptions, ...candidate });
        break;
      } catch (_) {}
    }
  } else {
    // Prefer Playwright's own Chromium channel over real system Chrome. Real
    // Chrome (both raw executablePath and channel:'chrome') never exposes the
    // extension's service worker via serviceWorkers(), forcing writePreferences()
    // and readStatsSnapshot() onto their fallback path — navigating directly to
    // the extension's popup/onboarding page. Real Chrome actively blocks that
    // navigation (net::ERR_BLOCKED_BY_CLIENT — MV3 restricts direct external
    // navigation to those pages), so the fallback can never succeed either:
    // preferences never get written, onboardingComplete never becomes true, and
    // every site silently does nothing for the rest of the run. Chromium's
    // channel build doesn't have this gap, so put it first and only fall back to
    // real Chrome if Chromium isn't installed.
    const headedCandidates = [
      { channel: 'chromium' },
      getSystemChromeExecutable() ? { executablePath: getSystemChromeExecutable() } : null,
      { channel: 'chrome' },
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
  if (userDataDir) {
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch (_) {}
  }
  printSummary();

  process.exit(results.fail.length > 0 ? 1 : 0);
})();
