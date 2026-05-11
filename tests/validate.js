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
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// ── Config ────────────────────────────────────────────────────────────────────
const EXT_DIR      = path.resolve(__dirname, '..');   // unpacked extension root
const SITES_FILE   = path.join(__dirname, 'sites.json');
const BANNER_WAIT  = 8000;   // ms to wait for banner to appear
const HANDLE_WAIT  = 6000;   // ms to wait for extension to handle it
const NAV_TIMEOUT  = 30000;
const FOLLOW_UP_WAIT = 8000;
const ACCESSIBILITY_HELP_PATH = '/help/accessibility-help';

// ── Argument parsing ──────────────────────────────────────────────────────────
const args     = process.argv.slice(2);
const headed   = args.includes('--headed');
const region   = argVal(args, '--region');
const cmpFilter= argVal(args, '--cmp');
const siteName = argVal(args, '--site');

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
  const beforeStats = await readStatsSnapshot(page.context());
  await applySiteLocale(page, site);
  const handleWaitMs = site.handleWaitMs ?? HANDLE_WAIT;

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
  const bannerFound = await waitForAny(page, site.bannerSelectors, BANNER_WAIT);
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
    return { status: 'FAIL', detail: 'Banner still visible after timeout' };
  }

  // Banner still visible — check if the consent button itself is gone
  // (some CMPs hide but don't remove the container)
  const consentButtonGone = !(await anyVisible(page, site.consentSelectors));
  if (!consentHandled && consentButtonGone) {
    consentHandled = true;
    detail = 'Consent recorded (container persists but buttons gone)';
  }

  if (!consentHandled) {
    return { status: 'FAIL', detail: 'Banner still visible after timeout' };
  }

  if (site.followUpNavigation?.enabled) {
    const followUp = await runFollowUpNavigation(page, site);
    if (!followUp.ok) {
      return { status: 'FAIL', detail: followUp.detail };
    }
    detail += `; follow-up ok (${followUp.finalUrl})`;
  }

  return { status: 'PASS', detail };
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
  if (/just a moment|security verification/i.test(title)) return true;

  return page.evaluate(() => {
    const text = document.body?.innerText ?? '';
    return /security verification|request id|cloudflare|just a moment/i.test(text);
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
      return Array.from(document.querySelectorAll('button, [role="button"], a, div, span'))
        .some((el) => isVisible(el) && (el.textContent || '').trim().toLowerCase().includes(needle));
    }, phrase);
  }

  const el = await page.$(sel);
  return Boolean(el && await el.isVisible());
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

function buildCategoryPreferences(globalPreference) {
  const accept = globalPreference === 'accept_all';
  return {
    functional: true,
    analytics: accept,
    advertising: accept,
    ccpaDoNotSell: !accept,
    uncategorized: accept ? 'accept' : 'reject',
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

async function writePreferences(browser, preference) {
  const payload = {
    globalPreference: preference,
    onboardingComplete: true,
    showBadgeCount: true,
    categoryPreferences: buildCategoryPreferences(preference),
    milestonesShown: [],
  };

  const [sw] = browser.serviceWorkers();
  if (sw) {
    await sw.evaluate((data) => new Promise((resolve) => chrome.storage.sync.set(data, resolve)), payload);
    return null;
  }

  const swPage = await browser.newPage();
  const pages = browser.pages();
  const extPage = pages.find((p) => p.url().startsWith('chrome-extension://'));
  if (extPage) {
    await extPage.evaluate((data) => new Promise((resolve) => chrome.storage.sync.set(data, resolve)), payload).catch(() => {});
  }
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

  const [sw] = browser.serviceWorkers();
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

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  console.log(`\nEat My Cookies — validation suite`);
  console.log(`Extension: ${EXT_DIR}`);
  console.log(`Sites: ${sites.length}  |  Headed: ${headed}`);

  const browser = await chromium.launchPersistentContext('', {
    headless: !headed,
    args: [
      `--disable-extensions-except=${EXT_DIR}`,
      `--load-extension=${EXT_DIR}`,
      '--no-sandbox',
    ],
    viewport: { width: 1280, height: 800 },
  });

  // Complete onboarding via the service worker so chrome.storage.sync is accessible
  let swPage = null;
  try {
    const defaultPreference = sites[0]?.preference ?? 'reject_all';
    swPage = await writePreferences(browser, defaultPreference);
  } catch (_) {}
  if (swPage) await swPage.close();

  printHeader();

  for (const site of sites) {
    const page = await browser.newPage();
    try {
      const preference = site.preference ?? 'reject_all';
      const tmpPage = await writePreferences(browser, preference).catch(() => null);
      if (tmpPage) await tmpPage.close();
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
  printSummary();

  process.exit(results.fail.length > 0 ? 1 : 0);
})();
