#!/usr/bin/env node

const http = require('http');
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const DOM_HANDLER_PATH = path.join(ROOT, 'content', 'dom-handler.js');
const CMPS = JSON.parse(fs.readFileSync(path.join(ROOT, 'rules', 'cmps.json'), 'utf8')).cmps;
const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'platform-consents');

const CASES = [
  {
    name: 'BigCommerce Catalyst accept_all',
    path: '/bigcommerce-catalyst.html',
    prefs: {
      globalPreference: 'accept_all',
      functional: true,
      analytics: true,
      advertising: true,
      ccpaDoNotSell: false,
      uncategorized: 'accept',
    },
    verify: (state, result) =>
      result?.method === 'dom:bigcommercecatalyst:accept_all' &&
      Array.isArray(state?.requests) &&
      state.requests.length === 1 &&
      JSON.stringify(state.requests[0]) === JSON.stringify({ allow: [1, 2, 3], deny: [] }) &&
      state?.bannerVisible === false,
  },
  {
    name: 'BigCommerce Catalyst reject_all',
    path: '/bigcommerce-catalyst.html',
    prefs: {
      globalPreference: 'reject_all',
      functional: false,
      analytics: false,
      advertising: false,
      ccpaDoNotSell: true,
      uncategorized: 'reject',
    },
    verify: (state, result) =>
      result?.method === 'dom:bigcommercecatalyst:reject_all' &&
      Array.isArray(state?.requests) &&
      state.requests.length === 1 &&
      JSON.stringify(state.requests[0]) === JSON.stringify({ allow: [], deny: [1, 2, 3] }) &&
      state?.bannerVisible === false,
  },
  {
    name: 'BigCommerce Catalyst custom',
    path: '/bigcommerce-catalyst.html',
    prefs: {
      globalPreference: 'custom',
      functional: true,
      analytics: false,
      advertising: true,
      ccpaDoNotSell: false,
      uncategorized: 'reject',
    },
    verify: (state, result) =>
      result?.method === 'dom:bigcommercecatalyst:custom' &&
      Array.isArray(state?.requests) &&
      state.requests.length === 1 &&
      JSON.stringify(state.requests[0]) === JSON.stringify({ allow: [2, 3], deny: [1] }) &&
      state?.bannerVisible === false,
  },
  {
    name: 'BigCommerce Catalyst ccpa',
    path: '/bigcommerce-catalyst.html',
    prefs: {
      globalPreference: 'custom',
      functional: true,
      analytics: true,
      advertising: true,
      ccpaDoNotSell: true,
      uncategorized: 'accept',
    },
    verify: (state, result) =>
      result?.method === 'dom:bigcommercecatalyst:ccpa' &&
      Array.isArray(state?.requests) &&
      state.requests.length === 1 &&
      JSON.stringify(state.requests[0]) === JSON.stringify({ allow: [1, 2], deny: [3] }) &&
      state?.bannerVisible === false,
  },
  {
    name: 'WordPress GDPR custom',
    path: '/wordpress-gdpr.html',
    prefs: {
      globalPreference: 'custom',
      functional: true,
      analytics: false,
      advertising: false,
      ccpaDoNotSell: true,
      uncategorized: 'accept',
    },
    verify: (state, result) =>
      result?.method === 'dom:wordpressgdpr:custom' &&
      state?.saved === true &&
      state?.functional === true &&
      state?.analytics === false &&
      state?.advertising === false &&
      state?.bannerVisible === false &&
      state?.modalVisible === false,
  },
  {
    name: 'WooCommerce store notice reject_all',
    path: '/woocommerce-store-notice.html',
    prefs: {
      globalPreference: 'reject_all',
      functional: false,
      analytics: false,
      advertising: false,
      ccpaDoNotSell: true,
      uncategorized: 'reject',
    },
    verify: (state, result) =>
      result?.method === 'dom:woocommercestorenotice' &&
      state?.dismissed === true &&
      state?.bannerVisible === false,
  },
  {
    name: 'Magento cookie reject_all',
    path: '/magento-cookie.html',
    prefs: {
      globalPreference: 'reject_all',
      functional: false,
      analytics: false,
      advertising: false,
      ccpaDoNotSell: true,
      uncategorized: 'reject',
    },
    verify: (state, result) =>
      result?.method === 'dom:magentocookie:reject_all' &&
      state?.choice === 'reject' &&
      state?.bannerVisible === false,
  },
  {
    name: 'Magento cookie accept_all',
    path: '/magento-cookie.html',
    prefs: {
      globalPreference: 'accept_all',
      functional: true,
      analytics: true,
      advertising: true,
      ccpaDoNotSell: false,
      uncategorized: 'accept',
    },
    verify: (state, result) =>
      result?.method === 'dom:magentocookie:accept_all' &&
      state?.choice === 'accept' &&
      state?.bannerVisible === false,
  },
  {
    name: 'Pandectes accept_all',
    path: '/pandectes.html',
    prefs: {
      globalPreference: 'accept_all',
      functional: true,
      analytics: true,
      advertising: true,
      ccpaDoNotSell: false,
      uncategorized: 'accept',
    },
    verify: (state, result) =>
      result?.method === 'dom:pandectes:accept_all' &&
      state?.mode === 'accept_all' &&
      state?.functional === true &&
      state?.analytics === true &&
      state?.advertising === true &&
      state?.bannerVisible === false,
  },
  {
    name: 'Pandectes reject_all',
    path: '/pandectes.html',
    prefs: {
      globalPreference: 'reject_all',
      functional: false,
      analytics: false,
      advertising: false,
      ccpaDoNotSell: true,
      uncategorized: 'reject',
    },
    verify: (state, result) =>
      result?.method === 'dom:pandectes:reject_all' &&
      state?.mode === 'reject_all' &&
      state?.functional === false &&
      state?.analytics === false &&
      state?.advertising === false &&
      state?.bannerVisible === false,
  },
  {
    name: 'Pandectes custom',
    path: '/pandectes.html',
    prefs: {
      globalPreference: 'custom',
      functional: true,
      analytics: true,
      advertising: false,
      ccpaDoNotSell: false,
      uncategorized: 'accept',
    },
    verify: (state, result) =>
      result?.method === 'dom:pandectes:custom' &&
      state?.mode === 'custom' &&
      state?.functional === true &&
      state?.analytics === true &&
      state?.advertising === false &&
      state?.bannerVisible === false,
  },
  {
    name: 'Pandectes ccpa',
    path: '/pandectes.html',
    prefs: {
      globalPreference: 'custom',
      functional: true,
      analytics: true,
      advertising: true,
      ccpaDoNotSell: true,
      uncategorized: 'accept',
    },
    verify: (state, result) =>
      result?.method === 'dom:pandectes:custom' &&
      state?.mode === 'custom' &&
      state?.functional === true &&
      state?.analytics === true &&
      state?.advertising === false &&
      state?.bannerVisible === false,
  },
  {
    name: 'Consentmo accept_all',
    path: '/consentmo.html',
    prefs: {
      globalPreference: 'accept_all',
      functional: true,
      analytics: true,
      advertising: true,
      ccpaDoNotSell: false,
      uncategorized: 'accept',
    },
    verify: (state, result) =>
      result?.method === 'dom:consentmo:accept_all' &&
      state?.mode === 'accept_all' &&
      state?.functional === true &&
      state?.analytics === true &&
      state?.advertising === true &&
      state?.bannerVisible === false,
  },
  {
    name: 'Consentmo reject_all',
    path: '/consentmo.html',
    prefs: {
      globalPreference: 'reject_all',
      functional: false,
      analytics: false,
      advertising: false,
      ccpaDoNotSell: true,
      uncategorized: 'reject',
    },
    verify: (state, result) =>
      result?.method === 'dom:consentmo:reject_all' &&
      state?.mode === 'reject_all' &&
      state?.functional === false &&
      state?.analytics === false &&
      state?.advertising === false &&
      state?.bannerVisible === false,
  },
  {
    name: 'Consentmo custom',
    path: '/consentmo.html',
    prefs: {
      globalPreference: 'custom',
      functional: true,
      analytics: true,
      advertising: false,
      ccpaDoNotSell: false,
      uncategorized: 'accept',
    },
    verify: (state, result) =>
      result?.method === 'dom:consentmo:custom' &&
      state?.mode === 'custom' &&
      state?.functional === true &&
      state?.analytics === true &&
      state?.advertising === false &&
      state?.bannerVisible === false,
  },
  {
    name: 'Consentmo ccpa',
    path: '/consentmo.html',
    prefs: {
      globalPreference: 'custom',
      functional: true,
      analytics: true,
      advertising: true,
      ccpaDoNotSell: true,
      uncategorized: 'accept',
    },
    verify: (state, result) =>
      result?.method === 'dom:consentmo:custom' &&
      state?.mode === 'custom' &&
      state?.functional === true &&
      state?.analytics === true &&
      state?.advertising === false &&
      state?.bannerVisible === false,
  },
  {
    name: 'Complianz accept_all',
    path: '/complianz.html',
    prefs: {
      globalPreference: 'accept_all',
      functional: true,
      analytics: true,
      advertising: true,
      ccpaDoNotSell: false,
      uncategorized: 'accept',
    },
    verify: (state, result) =>
      result?.method === 'dom:complianz:accept_all' &&
      state?.mode === 'accept_all' &&
      state?.bannerVisible === false,
  },
  {
    name: 'Complianz reject_all',
    path: '/complianz.html',
    prefs: {
      globalPreference: 'reject_all',
      functional: false,
      analytics: false,
      advertising: false,
      ccpaDoNotSell: true,
      uncategorized: 'reject',
    },
    verify: (state, result) =>
      result?.method === 'dom:complianz:reject_all' &&
      state?.mode === 'reject_all' &&
      state?.functional === false &&
      state?.analytics === false &&
      state?.advertising === false &&
      state?.bannerVisible === false,
  },
  {
    name: 'Complianz custom',
    path: '/complianz.html',
    prefs: {
      globalPreference: 'custom',
      functional: true,
      analytics: true,
      advertising: false,
      ccpaDoNotSell: true,
      uncategorized: 'reject',
    },
    verify: (state, result) =>
      result?.method === 'dom:complianz:custom' &&
      state?.mode === 'custom' &&
      state?.functional === true &&
      state?.analytics === true &&
      state?.advertising === false &&
      state?.bannerVisible === false,
  },
];

function createFixtureServer() {
  const server = http.createServer((req, res) => {
    const urlPath = req.url === '/' ? '/wordpress-gdpr.html' : req.url.split('?')[0];
    const filePath = path.join(FIXTURES_DIR, urlPath.replace(/^\/+/, ''));
    if (!filePath.startsWith(FIXTURES_DIR) || !fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(filePath, 'utf8'));
  });

  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Could not determine fixture server address'));
        return;
      }
      resolve({
        close: () => new Promise((done) => server.close(done)),
        origin: `http://127.0.0.1:${address.port}`,
      });
    });
    server.on('error', reject);
  });
}

async function runCase(browser, origin, testCase) {
  const page = await browser.newPage();
  try {
    await page.goto(`${origin}${testCase.path}`, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.addScriptTag({ path: DOM_HANDLER_PATH });
    const result = await page.evaluate(async ({ cmps, prefs }) => tryCMPs(cmps, prefs), {
      cmps: CMPS,
      prefs: testCase.prefs,
    });
    await page.waitForTimeout(500);
    const state = await page.evaluate(() => window.__fixtureState ?? null);
    if (!testCase.verify(state, result)) {
      throw new Error(`result=${JSON.stringify(result)} state=${JSON.stringify(state)}`);
    }
    console.log(`PASS  ${testCase.name}`);
  } finally {
    await page.close();
  }
}

(async () => {
  const server = await createFixtureServer();
  const browser = await chromium.launch({ headless: true });
  let failed = false;

  try {
    for (const testCase of CASES) {
      try {
        await runCase(browser, server.origin, testCase);
      } catch (error) {
        failed = true;
        console.log(`FAIL  ${testCase.name}  ${error.message}`);
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }

  if (failed) process.exit(1);
})();
