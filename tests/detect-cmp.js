#!/usr/bin/env node
/**
 * detect-cmp.js — automated CMP fingerprinting across a list of sites
 *
 * Launches Chrome with a VPN extension active, visits each site in SITES,
 * and fingerprints the consent management platform by checking:
 *   - <script src> tags for known CDN domains
 *   - window globals injected by CMP SDKs
 *   - DOM selectors for banner/modal elements
 *
 * Prerequisites:
 *   1. Run private/vpn-connect.js once to set up the persistent VPN profile.
 *   2. Set EMC_VPN_EXT to your unpacked VPN extension path, OR pass it as
 *      the first CLI argument.
 *
 * Usage:
 *   node tests/detect-cmp.js
 *   node tests/detect-cmp.js /path/to/browsec/3.93.2_0
 *
 * VPN connection flow:
 *   The script opens the Browsec popup and waits for you to turn the VPN on
 *   manually (if not already connected from a previous session).  It polls
 *   https://whatismyipaddress.com/ every 5 seconds, checking whether the
 *   detected country is outside the USA.  Once a non-US country is shown,
 *   it proceeds automatically.  Press Enter at any time to skip the check
 *   and proceed immediately (useful if you know the VPN is connected but
 *   the geo-check is slow or rate-limited).
 */

const { chromium } = require('playwright');
const path = require('path');
const fs   = require('fs');

// ── Config ────────────────────────────────────────────────────────────────────

const VPN_EXT_DIR = process.argv[2]
  ? path.resolve(process.argv[2])
  : process.env.EMC_VPN_EXT
    ? path.resolve(process.env.EMC_VPN_EXT)
    : null;

if (!VPN_EXT_DIR) {
  console.error([
    '',
    '  EMC_VPN_EXT is not set.',
    '  Usage:  node tests/detect-cmp.js <path-to-unpacked-extension>',
    '  Or:     export EMC_VPN_EXT=<path> and re-run.',
    '  See CONTRIBUTING.md → "Testing with a VPN" for setup instructions.',
    '',
  ].join('\n'));
  process.exit(1);
}

const VPN_EXTENSION_PATH = VPN_EXT_DIR;

const PROFILE_DIR = process.env.EMC_VPN_PROFILE
  ? path.resolve(process.env.EMC_VPN_PROFILE)
  : path.resolve(__dirname, '..', '.tmp-vpn-profile');

fs.mkdirSync(PROFILE_DIR, { recursive: true });

// Sites to check — Ketch candidates + extras discovered during research
const SITES = [
  // Confirmed Ketch customers (from ketch.com homepage)
  { name: 'LVMH',              url: 'https://www.lvmh.com' },
  { name: 'Skyscanner',        url: 'https://www.skyscanner.net' },
  { name: 'Pret A Manger',     url: 'https://www.pret.com/en-GB' },
  { name: 'Inchcape',          url: 'https://www.inchcape.com' },

  // US sites detected with Ketch from EU IP (Wappalyzer)
  { name: 'CBS News',          url: 'https://www.cbsnews.com' },
  { name: 'Fox News',          url: 'https://www.foxnews.com' },
  { name: 'TMZ',               url: 'https://www.tmz.com' },
  { name: 'Newsweek',          url: 'https://www.newsweek.com' },
  { name: 'SFGate',            url: 'https://www.sfgate.com' },

  // Didomi candidates (European, not yet in repo)
  { name: 'Sächsische Zeitung', url: 'https://www.saechsische.de' },
  { name: 'TAG24',              url: 'https://www.tag24.de' },
  { name: 'Economía Digital',   url: 'https://www.economiadigital.es' },
  { name: 'Orange',             url: 'https://www.orange.com' },
  { name: 'Free.fr',            url: 'https://www.free.fr' },
  { name: 'Europcar',           url: 'https://www.europcar.com' },
  { name: 'Harrods',            url: 'https://www.harrods.com' },
  { name: 'Michelin',           url: 'https://www.michelin.com' },
  { name: 'Volvo',              url: 'https://www.volvocars.com/en' },

  // Extra European news sites not in repo
  { name: 'Der Standard (AT)',  url: 'https://www.derstandard.at' },
  { name: 'ORF',               url: 'https://www.orf.at' },
  { name: 'NRC (NL)',          url: 'https://www.nrc.nl' },
  { name: 'De Telegraaf (NL)', url: 'https://www.telegraaf.nl' },
  { name: 'Corriere della Sera', url: 'https://www.corriere.it' },  // already in repo as Iubenda
  { name: 'The Independent',   url: 'https://www.independent.co.uk' },
  { name: 'Daily Mail',        url: 'https://www.dailymail.co.uk' },
  { name: 'Sky News',          url: 'https://news.sky.com' },
  { name: 'Marca (ES)',        url: 'https://www.marca.com' },
  { name: 'Le Monde',         url: 'https://www.lemonde.fr' },     // already in repo
];

// CMP fingerprints — scripts/globals/elements loaded by each platform
const CMP_FINGERPRINTS = [
  { name: 'Ketch',          scripts: ['ketchcdn.com'],                              globals: ['ketch', 'semaphore'],            selectors: ['#ketch-banner', '#ketch-consent-banner', '#ketch-preferences-navigation-purposes-tab'] },
  { name: 'Didomi',         scripts: ['sdk.privacy-center.org', 'didomi.io'],       globals: ['Didomi', 'didomiOnReady'],       selectors: ['#didomi-notice', '#didomi-popup', '.didomi-notice-banner'] },
  { name: 'OneTrust',       scripts: ['cdn.cookielaw.org', 'optanon'],              globals: ['OneTrust', 'OptanonWrapper'],    selectors: ['#onetrust-banner-sdk', '#onetrust-accept-btn-handler', '.optanon-alert-box-wrapper'] },
  { name: 'Sourcepoint',    scripts: ['sourcepoint.com', '_sp_'],                   globals: ['_sp_', '__tcfapi'],              selectors: ['[id^="sp_message_container"]', '[id^="sp_message_iframe"]'] },
  { name: 'TrustArc',       scripts: ['consent.trustarc.com', 'truste.com'],        globals: ['truste', 'TrustArcConsent'],     selectors: ['.truste_overlay', '#truste-consent-track'] },
  { name: 'Iubenda',        scripts: ['cdn.iubenda.com'],                           globals: ['_iub'],                         selectors: ['#iubenda-cs-banner', '.iubenda-cs-rationale'] },
  { name: 'Quantcast',      scripts: ['quantcast.mgr.consensu.org', 'quantcast'],   globals: ['__qcCmpApi'],                   selectors: ['.qc-cmp2-container', '.qc-cmp-showing'] },
  { name: 'Cookiebot',      scripts: ['cookiebot.com', 'consentcdn.com'],           globals: ['Cookiebot', 'CookieConsent'],   selectors: ['#CybotCookiebotDialog', '#CybotCookiebotDialogBody'] },
  { name: 'Usercentrics',   scripts: ['app.usercentrics.eu'],                       globals: ['usercentrics', 'UC_UI'],        selectors: ['#usercentrics-root', '.uc-banner-content'] },
  { name: 'Consentmanager', scripts: ['delivery.consentmanager.net'],               globals: ['cmp2'],                         selectors: ['#cmpbox', '.cmpbox'] },
  { name: 'AppConsent',     scripts: ['appconsent.io', 'figconsent.com'],           globals: ['ACFigConsent'],                 selectors: ['.ac-banner', '#fig-consent-banner'] },
  { name: 'Shopify',        scripts: ['shopifycloud/privacy-banner'],               globals: ['privacyBanner'],                selectors: ['#shopify-pc__banner', '.shopify-pc__banner__dialog', '#shopify-pc__prefs__dialog'] },
  { name: 'Axeptio',        scripts: ['axept.io', 'static.axept.io'],               globals: ['axeptio'],                      selectors: ['#axeptio_overlay', '#axeptio_btn'] },
  { name: 'Orestio/CMP.io', scripts: ['orestbida.github.io', 'cdn.jsdelivr.net/gh/orestbida/cookieconsent'], globals: ['CookieConsentApi'], selectors: ['#cc-main', '.cc-overlay-wrapper'] },
];

async function detectCMP(page) {
  try {
    // Check loaded scripts
    const scriptSrcs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('script[src]')).map(s => s.src)
    );

    // Check globals
    const globals = await page.evaluate((names) =>
      names.filter(n => typeof window[n] !== 'undefined'),
      CMP_FINGERPRINTS.flatMap(c => c.globals)
    );

    // Check DOM selectors
    const foundSelectors = await page.evaluate((selectors) =>
      selectors.filter(s => { try { return !!document.querySelector(s); } catch { return false; } }),
      CMP_FINGERPRINTS.flatMap(c => c.selectors)
    );

    const matches = [];
    for (const cmp of CMP_FINGERPRINTS) {
      const scriptMatch = cmp.scripts.some(s => scriptSrcs.some(src => src.includes(s)));
      const globalMatch = cmp.globals.some(g => globals.includes(g));
      const selectorMatch = cmp.selectors.some(sel => foundSelectors.includes(sel));
      if (scriptMatch || globalMatch || selectorMatch) {
        matches.push({
          name: cmp.name,
          via: [
            scriptMatch && 'script',
            globalMatch && 'global',
            selectorMatch && 'DOM',
          ].filter(Boolean).join('+'),
        });
      }
    }
    return matches;
  } catch (e) {
    return [{ name: 'ERROR', via: e.message.slice(0, 80) }];
  }
}

async function main() {
  console.log('Launching Chrome with Browsec VPN extension...\n');

  const browser = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    args: [
      `--disable-extensions-except=${VPN_EXTENSION_PATH}`,
      `--load-extension=${VPN_EXTENSION_PATH}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
    viewport: { width: 1280, height: 800 },
  });

  // Wait for extension service worker to initialise
  await new Promise(r => setTimeout(r, 3000));

  // Open the Browsec popup so the user can turn the VPN on manually
  const extId = 'omghfjlpggmjjaagoclmmobgdodcjboh';
  const vpnPage = await browser.newPage();
  await vpnPage.goto(`chrome-extension://${extId}/popup/popup.html`, { timeout: 15000 });
  console.log('==========================================================');
  console.log('  Browsec popup is open.');
  console.log('  Please turn the VPN ON and select a European server.');
  console.log('  Waiting for a European IP before continuing...');
  console.log('==========================================================\n');

  // Poll whatismyipaddress.com every 5s until the detected country is not USA.
  // We use the real browser (not fetch/curl) so the VPN proxy is exercised.
  // Pressing Enter skips the check — useful if the VPN is definitely on but
  // the geo-detection page is slow or has already been consented away.
  console.log('  (or press Enter here to skip the check and proceed now)\n');

  let confirmed = false;
  let skipped = false;

  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin });
  const enterPressed = new Promise(resolve => rl.once('line', () => { skipped = true; resolve(); }));

  for (let i = 0; i < 24 && !skipped; i++) {
    await Promise.race([new Promise(r => setTimeout(r, 5000)), enterPressed]);
    if (skipped) break;
    try {
      const checkPage = await browser.newPage();
      await checkPage.goto('https://whatismyipaddress.com/', { waitUntil: 'domcontentloaded', timeout: 15000 });
      await checkPage.waitForTimeout(2000);
      // The page shows country in a table row — grab all visible text and look for "Country"
      const country = await checkPage.evaluate(() => {
        // Try the dedicated country element first
        const rows = Array.from(document.querySelectorAll('tr, .ip-info-row, [class*="country"]'));
        for (const row of rows) {
          const txt = row.innerText || '';
          if (txt.match(/Country/i)) return txt;
        }
        // Fallback: scan full text for "Country:" line
        const full = document.body.innerText;
        const m = full.match(/Country[:\s]+(.+)/i);
        return m ? m[0] : full.slice(0, 300);
      });
      await checkPage.close();
      process.stdout.write(`\r  Location check: ${country.replace(/\n/g,' ').slice(0, 80)}   `);
      if (country && !country.match(/United States|USA/i)) {
        console.log(`\n✅ VPN confirmed — not in the USA: ${country.trim().slice(0, 60)}\n`);
        confirmed = true;
        break;
      }
    } catch (e) {
      process.stdout.write(`\r  check failed: ${e.message.slice(0,50)} — retrying...   `);
    }
  }

  rl.close();
  await vpnPage.close();
  if (skipped)            console.log('\n▶ Skipped IP check — proceeding.\n');
  if (!confirmed && !skipped) console.log('\n⚠️  Could not confirm non-US IP — proceeding anyway.\n');

  const results = [];

  for (const site of SITES) {
    const page = await browser.newPage();
    // Set Accept-Language to trigger EU/GDPR flows even without full VPN geo
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8' });

    process.stdout.write(`Checking ${site.name} (${site.url}) ... `);
    let cmps = [];
    try {
      await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      // Give consent banners 5s to render
      await page.waitForTimeout(5000);
      cmps = await detectCMP(page);
    } catch (e) {
      cmps = [{ name: 'TIMEOUT/ERROR', via: e.message.slice(0, 60) }];
    }

    const cmpStr = cmps.length ? cmps.map(c => `${c.name} (${c.via})`).join(', ') : 'None detected';
    console.log(cmpStr);
    results.push({ name: site.name, url: site.url, cmp: cmpStr });
    await page.close();
  }

  await browser.close();

  // Print summary table
  console.log('\n\n=== RESULTS ===\n');
  console.log(`${'Site'.padEnd(25)} ${'URL'.padEnd(40)} CMP`);
  console.log('-'.repeat(100));
  for (const r of results) {
    console.log(`${r.name.padEnd(25)} ${r.url.padEnd(40)} ${r.cmp}`);
  }
}

main().catch(console.error);
