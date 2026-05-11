#!/usr/bin/env node
// Inspect consent banner DOM for failing sites — no extension loaded.
// Dumps button/link elements that appear inside consent containers.

const { chromium } = require('playwright');

const SITES = [
  { name: 'DW',        url: 'https://www.dw.com/en/' },
  { name: 'Le Figaro', url: 'https://www.lefigaro.fr/' },
  { name: 'Le Monde',  url: 'https://www.lemonde.fr/' },
  { name: 'Euronews',  url: 'https://www.euronews.com/' },
  { name: 'FT',        url: 'https://www.ft.com/' },
];

const CONSENT_HINTS = ['consent', 'cookie', 'gdpr', 'privacy', 'cmp', 'didomi', 'banner', 'notice', 'iub', 'figconsent', 'truste'];

(async () => {
  const browser = await chromium.launch({ headless: true });

  for (const site of SITES) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  ${site.name} — ${site.url}`);
    console.log('='.repeat(60));

    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

    try {
      await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      // Wait for JS to render consent banner
      await page.waitForTimeout(4000);

      const data = await page.evaluate((hints) => {
        // Find elements that look like consent containers
        const allEls = document.querySelectorAll('*');
        const containers = [];
        for (const el of allEls) {
          const id = (el.id || '').toLowerCase();
          const cls = (typeof el.className === 'string' ? el.className : el.className?.baseVal ?? '').toLowerCase();
          if (hints.some(h => id.includes(h) || cls.includes(h))) {
            containers.push(el);
          }
        }

        const results = [];

        // For each consent container, find clickable elements
        for (const cont of containers.slice(0, 5)) {
          const btns = cont.querySelectorAll('button, a, [role="button"], input[type="button"]');
          for (const btn of btns) {
            const text = btn.textContent?.trim().replace(/\s+/g, ' ').slice(0, 80);
            if (!text) continue;
            const rect = btn.getBoundingClientRect();
            const visible = rect.width > 0 && rect.height > 0;
            const tagName = btn.tagName.toLowerCase();
            const id = btn.id || '';
            const cls = Array.from(btn.classList).join(' ');
            const href = btn.getAttribute('href') || '';
            results.push({ text, tagName, id, cls, href, visible });
          }
        }

        // Also dump all iframes
        const iframes = Array.from(document.querySelectorAll('iframe')).map(f => ({
          src: f.src, id: f.id, cls: f.className
        }));

        // Check for consent globals
        const globals = {};
        for (const g of ['OneTrust', 'Didomi', 'Cookiebot', 'UC_UI', '__tcfapi', '__cmp', '_iub', 'figconsent', '_sp_']) {
          globals[g] = typeof window[g] !== 'undefined';
        }

        return { results, iframes, globals };
      }, CONSENT_HINTS);

      // Print clickable elements
      if (data.results.length) {
        console.log('\n  Clickable elements in consent containers:');
        const seen = new Set();
        for (const r of data.results) {
          const key = `${r.tagName}#${r.id}.${r.cls}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const sel = r.id ? `#${r.id}` : r.cls ? `.${r.cls.split(' ').join('.')}` : r.tagName;
          console.log(`    [${r.tagName}] "${r.text}" | sel: ${sel} | visible: ${r.visible}`);
        }
      } else {
        console.log('  No consent containers found yet (banner may be in iframe or not loaded)');
      }

      // Print iframes
      const consentIframes = data.iframes.filter(f =>
        CONSENT_HINTS.some(h => (f.src + f.id + f.cls).toLowerCase().includes(h))
      );
      if (consentIframes.length) {
        console.log('\n  Consent-related iframes:');
        for (const f of consentIframes) {
          console.log(`    src="${f.src}" id="${f.id}" class="${f.cls}"`);
        }
      }

      // Print globals
      console.log('\n  JS globals present:', Object.entries(data.globals).filter(([,v]) => v).map(([k]) => k).join(', ') || 'none');

    } catch (e) {
      console.log(`  ERROR: ${e.message.split('\n')[0]}`);
    } finally {
      await page.close();
    }
  }

  await browser.close();
})();
