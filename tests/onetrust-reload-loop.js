#!/usr/bin/env node
// Deterministic, live-site-independent regression test for the OneTrust
// "reject-all reloads the page" class of bug (kpmg.com and cnbc.com, 2026-09-06).
//
// Why this exists: the real kpmg.com and cnbc.com both correctly write the rejected
// OptanonConsent cookie when their native "Reject All" control is clicked, but ALSO
// reload the page as a side effect (confirmed live by driving the real DOM directly —
// see docs/cmp-impact-map.md's KPMG/CNBC sections). If the extension clicks that
// control and doesn't survive the resulting reload correctly, it re-attempts the whole
// flow fresh on every reload, each attempt reporting a fresh "success" for the same
// site+preference+method+page URL — exactly what background/service-worker.js's
// loop-breaker (utils/loop-detection.js) exists to catch, auto-disabling the extension
// for that site after 3 identical reports within 12s.
//
// STATUS (2026-09-06, "Fifth iteration" in docs/cmp-impact-map.md): a fix that made
// plain reject_all click this native button directly (bypassing the granular
// per-category commit flow) was tried, validated against this very test, shipped —
// and still caused real auto-disable/infinite-loop regressions on both sites in actual
// use, because the reload-survival mechanism this test validated in a synthetic fixture
// did not reliably recover on the real sites. That change was reverted entirely
// (`canUseDirectRejectAll` hardcoded to `false` in cmp-api-handler.js), so plain
// reject_all no longer clicks this button on either site — it goes through the
// granular commit flow instead, which uses "Confirm My Choices" and does not reload.
// This test is kept as a standing regression guard: it should keep passing (via the
// granular path, 0 reject clicks, no reload) unless someone reintroduces a direct
// click on this reload-triggering control, in which case it exists to catch that
// again — this time by actually re-validating against the reverted, currently-shipped
// code, not by trusting a synthetic fixture's PASS as proof a compensating mechanism
// works in reality. If you ever re-attempt the direct-click optimization, do not treat
// a PASS here as sufficient — it wasn't the first time.
//
// tests/validate.js's live-site fixtures could not catch the original bug: kpmg.com's
// existing fixture only exercises custom mode (never reaches the affected reject_all
// code path), and cnbc.com is Akamai-protected against this session's automation
// tooling. This script instead serves faithful local HTML fixtures
// (tests/fixtures/onetrust-reload/) UNDER THE REAL HOSTNAMES via Playwright request
// interception, with the real unpacked extension loaded — so window.location.hostname
// genuinely matches the host-keyed logic in content/cmp-api-handler.js and
// content/main.js (ONETRUST_RELOAD_ON_SAVE_HOSTS, REJECT_RELOAD_GUARD_HOSTS), while the
// page content, reload timing, and reject-all side effects are fully controlled and
// reproducible.
//
// Usage: node tests/onetrust-reload-loop.js [--site=<name>]

const fs = require('fs');
const path = require('path');
const os = require('os');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const EXT_DIR = ROOT;
const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'onetrust-reload');
const BROWSER_HOME_DIR = path.resolve(__dirname, '..', '.tmp-browser-home-reload-loop');

const argSite = process.argv.find((a) => a.startsWith('--site='))?.slice('--site='.length) ?? null;

const CASES = [
  {
    name: 'kpmg.com reject_all (reload-on-reject)',
    hostUrl: 'https://kpmg.com/us/en.html',
    site: 'kpmg.com',
    fixtureFile: 'kpmg-onetrust-reload.html',
    expectedFinalGroups: { C0001: true, C0002: false, C0003: false, C0004: false },
  },
  {
    name: 'cnbc.com reject_all (reload-on-reject, already-guarded host)',
    hostUrl: 'https://www.cnbc.com/',
    site: 'www.cnbc.com',
    fixtureFile: 'cnbc-onetrust-reload.html',
    expectedFinalGroups: { OSSTA_BG: false },
  },
  {
    // The case the two fixtures above could NOT catch: they each reload once and then
    // settle, so they passed while production kept looping. This one never satisfies
    // the extension's post-reload verification, so before the MAX_CONSENT_ACTIONS_PER_URL
    // ceiling existed it looped without bound and tripped the background loop-breaker.
    name: 'runaway reload loop is bounded, not auto-disabled',
    hostUrl: 'https://www.cnbc.com/runaway-loop-fixture',
    site: 'www.cnbc.com',
    fixtureFile: 'runaway-onetrust-reload.html',
    runaway: true,
  },
  {
    // The user-facing requirement, stated plainly: configure once, and the site stops
    // asking. Walks several DIFFERENT URLs on one host like real browsing, and asserts
    // the banner is answered on the first page and never shown again — rather than being
    // re-dismissed (and re-counted) on every page view, which is what cnbc.com was doing.
    name: 'choice persists across page navigations (site stops asking)',
    site: 'www.cnbc.com',
    fixtureFile: 'persistence-onetrust.html',
    persistence: true,
    hostUrl: 'https://www.cnbc.com/persistence-fixture',
    navigateUrls: [
      'https://www.cnbc.com/persistence-fixture',
      'https://www.cnbc.com/persistence-fixture/page-two',
      'https://www.cnbc.com/persistence-fixture/page-three',
      'https://www.cnbc.com/persistence-fixture/page-four',
    ],
  },
  {
    // Measured on the REAL www.cnbc.com (2026-09-06): 3 page views produced 3 separate
    // cmp_api:OneTrust:ccpa actions even though OptanonConsent already carried OSSTA_BG:0
    // at t=0 of every load. The persistence fixture above could not catch that, because
    // its banner-gated shape stops the flow for a different reason. The distinguishing
    // property here is that the site is NOT asking — there is no banner in the DOM at all
    // — and the extension re-opens the hidden preference center on its own to re-apply a
    // choice that is already saved.
    name: 'already-recorded consent is left alone on later page views',
    site: 'www.cnbc.com',
    fixtureFile: 'already-consented-onetrust.html',
    alreadyConsented: true,
    hostUrl: 'https://www.cnbc.com/already-consented-fixture',
    navigateUrls: [
      'https://www.cnbc.com/already-consented-fixture',
      'https://www.cnbc.com/already-consented-fixture/page-two',
      'https://www.cnbc.com/already-consented-fixture/page-three',
      'https://www.cnbc.com/already-consented-fixture/page-four',
    ],
  },
  {
    // Live report on kpmg.com (2026-09-06): "when I switch from custom to accept all in
    // the extension, the website keeps reloading forever". Not caught by any case above,
    // because all of them run reject_all and all of them start from a site that is still
    // asking. This one starts from a choice already recorded in custom mode — so no
    // surface is ever visible and the ONLY thing that runs is syncOneTrustConsent()'s
    // silent API resync, on a host that reloads on any consent write. That resync reports
    // nothing by design, so the loop-breaker never fires and the page just reloads.
    name: 'accept_all resync does not reload a reload-on-save host forever',
    hostUrl: 'https://kpmg.com/us/en.html',
    site: 'kpmg.com',
    fixtureFile: 'accept-all-resync-reload.html',
    preference: 'accept_all',
    acceptResync: true,
  },
];

function prepareExtensionLaunchDir(extDir) {
  const launchDir = path.join(os.tmpdir(), 'emc-reload-loop-ext-link');
  try { fs.rmSync(launchDir, { force: true }); } catch (_) {}
  try {
    fs.symlinkSync(extDir, launchDir);
    return launchDir;
  } catch (_) {
    return extDir;
  }
}

async function launchWithExtension(userDataDir) {
  const launchExtDir = prepareExtensionLaunchDir(EXT_DIR);
  fs.mkdirSync(BROWSER_HOME_DIR, { recursive: true });
  const launchOptions = {
    headless: true,
    args: [
      `--disable-extensions-except=${launchExtDir}`,
      `--load-extension=${launchExtDir}`,
      '--no-sandbox',
    ],
    env: { ...process.env, HOME: BROWSER_HOME_DIR },
    viewport: { width: 1280, height: 800 },
  };
  // Headless bundled Chromium doesn't expose extension service workers; the system
  // 'chromium' channel does (same workaround tests/validate.js already relies on).
  try {
    return await chromium.launchPersistentContext(userDataDir, { ...launchOptions, channel: 'chromium' });
  } catch (_) {
    return await chromium.launchPersistentContext(userDataDir, launchOptions);
  }
}

async function findExtensionServiceWorker(browser, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  const find = () => browser.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
  let sw = find();
  while (!sw && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 150));
    sw = find();
  }
  return sw ?? null;
}

async function writePreferences(sw, preference = 'reject_all') {
  const payload = preference === 'accept_all'
    ? {
      globalPreference: 'accept_all',
      onboardingComplete: true,
      showBadgeCount: true,
      categoryPreferences: { functional: true, analytics: true, advertising: true, ccpaDoNotSell: false, uncategorized: 'accept' },
      milestonesShown: [],
    }
    : {
      globalPreference: 'reject_all',
      onboardingComplete: true,
      showBadgeCount: true,
      categoryPreferences: { functional: false, analytics: false, advertising: false, ccpaDoNotSell: true, uncategorized: 'reject' },
      milestonesShown: [],
    };
  await sw.evaluate((data) => new Promise((resolve) => {
    chrome.storage.sync.set(data, () => {
      chrome.storage.local.set({ siteOverrides: {}, unsupportedSites: {} }, resolve);
    });
  }), payload);
}

async function readUnsupportedSites(sw) {
  const result = await sw.evaluate(() => new Promise((resolve) => chrome.storage.local.get({ unsupportedSites: {} }, resolve)));
  return result?.unsupportedSites ?? {};
}

async function readRecentActivity(sw) {
  const result = await sw.evaluate(() => new Promise((resolve) => chrome.storage.local.get({ stats: { recentActivity: [] } }, resolve)));
  return result?.stats?.recentActivity ?? [];
}

async function runCase(testCase) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'emc-reload-loop-profile-'));
  const browser = await launchWithExtension(userDataDir);
  const consoleLog = [];
  try {
    const sw = await findExtensionServiceWorker(browser);
    if (!sw) throw new Error('extension service worker never appeared');
    await writePreferences(sw, testCase.preference ?? 'reject_all');

    const fixtureContent = fs.readFileSync(path.join(FIXTURES_DIR, testCase.fixtureFile), 'utf8');
    const page = await browser.newPage();
    let navCount = 0;
    let lastNavAt = Date.now();
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        navCount += 1;
        lastNavAt = Date.now();
      }
    });
    for (const routeUrl of testCase.navigateUrls ?? [testCase.hostUrl]) {
      await page.route(routeUrl, (route) => route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: fixtureContent,
      }));
    }
    if (process.env.EMC_DEBUG_CONSOLE) {
      page.on('console', (msg) => consoleLog.push(`[console:${msg.type()}] ${msg.text()}`));
    }

    await page.goto(testCase.hostUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

    if (testCase.acceptResync) {
      // Watch for a while: this loop is driven purely by reloads, so the only signal is
      // how many of them happen and whether they ever stop.
      const deadline = Date.now() + 35000;
      let state = null;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 500));
        if (page.isClosed()) break;
        try {
          state = await page.evaluate(() => window.__fixtureState);
        } catch (_) {
          continue; // mid-navigation
        }
        if (Date.now() - lastNavAt > 10000) break;
      }
      if (!state) {
        return { name: testCase.name, ok: false, detail: 'never reached a readable settled state' };
      }
      // The cookie stores groups= URL-encoded, so decode the whole field before splitting.
      const groups = Object.fromEntries(
        decodeURIComponent(state.cookie?.match(/groups=([^&]*)/)?.[1] ?? '')
          .split(',').filter(Boolean)
          .map((entry) => { const [k, v] = entry.split(':'); return [k, v === '1']; })
      );
      if (navCount > 4) {
        return {
          name: testCase.name,
          ok: false,
          detail: `${navCount} navigations — still reloading (${state.acceptCalls} Accept() call(s), ${state.consentWrites} consent write(s)); the new preference should be applied once and then recognised as already saved`,
        };
      }
      // The preference must actually take effect — "stop reloading" is not enough if the
      // switch to accept_all silently left the old custom state in place.
      const applied = ['C0002', 'C0003', 'C0004'].every((id) => groups[id] === true);
      if (!applied) {
        return {
          name: testCase.name,
          ok: false,
          detail: `settled after ${navCount} navigation(s) but accept_all was never applied — cookie groups ${JSON.stringify(groups)}`,
        };
      }
      return {
        name: testCase.name,
        ok: true,
        detail: `applied once and stopped: ${navCount} navigation(s), ${state.acceptCalls} Accept() call(s), ${state.consentWrites} consent write(s), cookie groups ${JSON.stringify(groups)}`,
      };
    }

    if (testCase.alreadyConsented) {
      await page.waitForTimeout(9000);
      for (const url of testCase.navigateUrls.slice(1)) {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(6000);
      }
      const st = await page.evaluate(() => window.__fixtureState);
      const activity = await readRecentActivity(sw);
      const reports = activity.filter((e) => (e.site === testCase.site || e.site === testCase.site.replace(/^www\./, '')));

      if (st.saveCount < 1) {
        return {
          name: testCase.name,
          ok: false,
          detail: `never applied the opt-out at all across ${st.pageViews} page views (pcOpens=${st.pcOpenCount}) — the first page view must still act`,
        };
      }
      const lateOpens = (st.openViews ?? []).filter((view) => view > 1);
      if (lateOpens.length || st.saveCount > 1) {
        return {
          name: testCase.name,
          ok: false,
          detail: `re-opened the hidden preference center on page view(s) ${lateOpens.join(', ') || '—'} and saved ${st.saveCount}x across ${st.pageViews} page views (${st.pcOpenCount} opens total, ${reports.length} reported action(s)) — consent was already recorded, so nothing should have been opened after page one`,
        };
      }
      if (reports.length > 1) {
        return {
          name: testCase.name,
          ok: false,
          detail: `${reports.length} reported actions across ${st.pageViews} page views — re-consuming an already-saved choice`,
        };
      }
      return {
        name: testCase.name,
        ok: true,
        detail: `acted once and then left it alone: ${st.pageViews} page views, opens confined to page view(s) ${(st.openViews ?? []).join(', ') || 'none'} (${st.pcOpenCount} total), ${st.saveCount} save(s), ${reports.length} reported action(s)`,
      };
    }

    if (testCase.persistence) {
      // Give the first page time to answer the banner, then browse on like a user would.
      await page.waitForTimeout(9000);
      for (const url of testCase.navigateUrls.slice(1)) {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(5000);
      }
      const st = await page.evaluate(() => window.__fixtureState);
      const activity = await readRecentActivity(sw);
      const reports = activity.filter((e) => (e.site === testCase.site || e.site === testCase.site.replace(/^www\./, '')));

      if (!st.alertBoxClosed) {
        return {
          name: testCase.name,
          ok: false,
          detail: `after ${st.pageViews} page views the choice was never recorded (no OptanonAlertBoxClosed) — the site will keep asking forever (banner shown ${st.bannerShownCount}x, ${reports.length} reported action(s))`,
        };
      }
      if (st.bannerShownCount > 1) {
        return {
          name: testCase.name,
          ok: false,
          detail: `banner re-appeared on ${st.bannerShownCount} of ${st.pageViews} page views — the choice is not sticking (reported ${reports.length}x)`,
        };
      }
      if (reports.length > 1) {
        return {
          name: testCase.name,
          ok: false,
          detail: `${reports.length} actions recorded across ${st.pageViews} page views — re-consuming on navigation instead of saving once`,
        };
      }
      return {
        name: testCase.name,
        ok: true,
        detail: `answered once and stayed answered: ${st.pageViews} page views, banner shown ${st.bannerShownCount}x, ${reports.length} recorded action(s), OptanonAlertBoxClosed set`,
      };
    }

    // Poll until either the loop-breaker fires (bug reproduced) or the page settles
    // (no navigation for 5s) with the banner/PC gone — whichever happens first.
    const deadline = Date.now() + 40000;
    let unsupported = {};
    let state = null;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 500));
      unsupported = await readUnsupportedSites(sw);
      const disabledEntry = unsupported[testCase.site] ?? unsupported[testCase.site.replace(/^www\./, '')] ?? unsupported[`www.${testCase.site}`];
      if (disabledEntry?.autoDisabled) {
        return {
          name: testCase.name,
          ok: false,
          detail: `auto-disabled after reload loop: "${disabledEntry.reason}" (navCount=${navCount})`,
        };
      }
      if (page.isClosed()) break;
      try {
        state = await page.evaluate(() => window.__fixtureState);
      } catch (_) {
        continue; // mid-navigation, try again next tick
      }
      const quiet = Date.now() - lastNavAt > 8000;
      // In the runaway case the honest end state is "we stopped acting and left the
      // banner up", so banner visibility must NOT be part of the settled condition —
      // only that the reload loop has actually stopped.
      const settled = testCase.runaway
        ? quiet
        : quiet && !state.bannerVisible && !state.pcVisible;
      if (settled) break;
    }

    if (!state) {
      return { name: testCase.name, ok: false, detail: 'never reached a readable settled state' };
    }

    if (testCase.runaway) {
      const recentActivity = await readRecentActivity(sw);
      const matching = recentActivity.filter((entry) => (entry.site === testCase.site || entry.site === testCase.site.replace(/^www\./, '')) && entry.preference === 'reject_all');
      // Reports are bounded at 2 per URL while the background auto-disables at 3
      // identical reports — staying at or below 2 is what makes the loop-breaker
      // structurally unreachable here.
      if (matching.length > 2) {
        return {
          name: testCase.name,
          ok: false,
          detail: `${matching.length} reported actions for a single URL (ceiling is 2) — the repeat guard is not holding (navCount=${navCount}, saveClicks=${state.saveClickCount})`,
        };
      }
      // navCount counts the initial load plus each reload. Attempts are bounded at 4,
      // so a bounded loop settles within a handful of cycles; a runaway one shows up
      // here as tens of navigations (measured: 42 with the guards removed).
      if (navCount > 8) {
        return {
          name: testCase.name,
          ok: false,
          detail: `${navCount} navigations — the page is still reloading in a loop (saveClicks=${state.saveClickCount}, reported=${matching.length})`,
        };
      }
      return {
        name: testCase.name,
        ok: true,
        detail: `loop bounded: ${navCount} navigation(s), ${state.saveClickCount} save click(s), ${matching.length} reported action(s), never auto-disabled (banner left visible: ${state.bannerVisible})`,
      };
    }

    const cookieGroups = Object.fromEntries(
      (state.cookie?.match(/groups=([^&]*)/)?.[1] ?? '')
        .split(',')
        .filter(Boolean)
        .map((entry) => {
          const [k, v] = entry.split(':');
          return [k, v === '1'];
        })
    );
    const groupsMatch = Object.entries(testCase.expectedFinalGroups).every(([k, v]) => cookieGroups[k] === v);
    if (!groupsMatch) {
      return {
        name: testCase.name,
        ok: false,
        detail: `final cookie groups ${JSON.stringify(cookieGroups)} don't match expected ${JSON.stringify(testCase.expectedFinalGroups)} (navCount=${navCount}, rejectClicks=${state.rejectClickCount})`,
      };
    }

    const recentActivity = await readRecentActivity(sw);
    const matchingEntries = recentActivity.filter((entry) => (entry.site === testCase.site || entry.site === testCase.site.replace(/^www\./, '')) && entry.preference === 'reject_all');

    // A reload that loses the activity report is a real, separate bug even when no
    // loop/auto-disable happens: the user's "cookies eaten" counter silently never
    // increments for a real, successful reject. Require at least one recorded entry,
    // and no more than one per navigation (a >1:1 ratio would itself indicate the
    // reload is being mis-handled as repeated fresh successes rather than recognized
    // and recovered exactly once).
    if (matchingEntries.length < 1) {
      return {
        name: testCase.name,
        ok: false,
        detail: `settled after ${navCount} navigation(s) with the correct final cookie state, but the action was never recorded (0 matching entries in stats.recentActivity) — the reload lost the success report`,
      };
    }
    if (matchingEntries.length > navCount) {
      return {
        name: testCase.name,
        ok: false,
        detail: `${matchingEntries.length} recorded activity entries across only ${navCount} navigation(s) — over-reporting relative to real page loads`,
      };
    }

    return {
      name: testCase.name,
      ok: true,
      detail: `settled after ${navCount} navigation(s), ${state.rejectClickCount} reject click(s), ${matchingEntries.length} recorded activity entr${matchingEntries.length === 1 ? 'y' : 'ies'} (method(s): ${matchingEntries.map((e) => e.method).join(', ')}), cookie groups correct, not auto-disabled`,
    };
  } finally {
    if (process.env.EMC_DEBUG_CONSOLE) {
      console.log(`--- console log for ${testCase.name} ---`);
      for (const line of consoleLog) console.log(line);
      console.log('--- end console log ---');
    }
    await browser.close().catch(() => {});
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (_) {}
  }
}

(async () => {
  const cases = argSite ? CASES.filter((c) => c.name.includes(argSite) || c.site === argSite) : CASES;
  if (!cases.length) {
    console.error(`No matching case for --site=${argSite}`);
    process.exit(1);
  }

  console.log('OneTrust reload-loop regression suite (local fixtures, real extension, real hostnames)\n');
  let failed = false;
  for (const testCase of cases) {
    try {
      const result = await runCase(testCase);
      console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${result.name}  —  ${result.detail}`);
      if (!result.ok) failed = true;
    } catch (error) {
      failed = true;
      console.log(`FAIL  ${testCase.name}  —  threw: ${error.message}`);
    }
  }
  process.exit(failed ? 1 : 0);
})();
