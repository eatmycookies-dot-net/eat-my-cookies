#!/usr/bin/env node
const { chromium } = require('playwright');

const URL = 'https://www.zoom.com/en/';
const visible = (page, selector) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
}, selector);

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.locator('#onetrust-pc-btn-handler').click({ timeout: 10000 });
    await page.waitForTimeout(500);
    for (const [id, checked] of [['C0002', false], ['C0003', true], ['C0004', false]]) {
      const input = page.locator(`#ot-group-id-${id}`);
      if (await input.count() && (await input.isChecked()) !== checked) {
        await page.locator(`label[for="ot-group-id-${id}"]`).click();
      }
    }
    await page.locator('.save-preference-btn-handler').click({ timeout: 5000 });
    await page.waitForTimeout(1500);
    const beforeState = await page.evaluate(() => ({
      pc: document.querySelector('#onetrust-pc-sdk')?.getAttribute('style') ?? null,
      filter: document.querySelector('.onetrust-pc-dark-filter')?.getAttribute('style') ?? null,
    }));
    async function reopenFromFooter(index = 0) {
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(150);
      const opener = page.locator('.ot-sdk-show-settings').nth(index);
      const before = await page.evaluate(() => Math.round(window.scrollY));
      await opener.click({ timeout: 5000 });
      await page.waitForTimeout(1200);
      return {
        before,
        after: await page.evaluate(() => Math.round(window.scrollY)),
        pcVisible: await visible(page, '#onetrust-pc-sdk'),
        filterVisible: await visible(page, '.onetrust-pc-dark-filter'),
      };
    }

    const initialReopen = await reopenFromFooter();
    await page.locator('#onetrust-pc-sdk .ot-close-icon, #onetrust-pc-sdk .onetrust-close-btn-handler').first().click({ timeout: 5000 });
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1200);
    await page.evaluate(() => {
      document.addEventListener('click', (event) => {
        const privacyChoices = event.target?.closest?.('#ot-do-not-sell');
        if (!privacyChoices) return;
        const settings = document.querySelector('.ot-sdk-show-settings:not(#ot-do-not-sell)');
        if (!settings) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        settings.click();
      }, true);
    });
    const postReloadPrivacyChoices = await reopenFromFooter(0);
    await page.locator('#onetrust-pc-sdk .ot-close-icon, #onetrust-pc-sdk .onetrust-close-btn-handler').first().click({ timeout: 5000 });
    await page.waitForTimeout(500);
    const postReloadCookieSettings = await reopenFromFooter(1);
    console.log(JSON.stringify({
      beforeState,
      initialReopen,
      postReloadPrivacyChoices,
      postReloadCookieSettings,
      footerOpeners: await page.evaluate(() => Array.from(document.querySelectorAll('#ot-do-not-sell, .ot-sdk-show-settings')).map((el) => ({
        id: el.id,
        className: el.className,
        href: el.getAttribute('href'),
        onclick: el.getAttribute('onclick'),
        text: (el.textContent || '').replace(/\s+/g, ' ').trim(),
        outerHTML: el.outerHTML.slice(0, 800),
      }))),
      errors,
    }));
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
