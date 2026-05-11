#!/usr/bin/env node

const path = require('path');
const { chromium } = require('playwright');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const popupPath = path.resolve(__dirname, '..', 'popup', 'popup.html');
  const popupUrl = `file://${popupPath}`;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.addInitScript(() => {
    const listeners = [];
    const syncState = {
      globalPreference: 'accept_all',
      categoryPreferences: {
        functional: true,
        analytics: false,
        advertising: false,
        ccpaDoNotSell: false,
        uncategorized: 'reject',
      },
      showBadgeCount: true,
      onboardingComplete: true,
      milestonesShown: [],
      installDate: null,
    };

    const localState = {
      stats: {
        totalActionsCount: 3,
        sitesHandled: 2,
        handledSites: ['example.com', 'news.example'],
        lastActionDate: null,
        lastActionSite: null,
        recentActivity: [],
      },
      siteOverrides: {},
      unsupportedSites: {},
      pendingMilestones: [],
    };

    const clone = (value) => JSON.parse(JSON.stringify(value));
    const mergeDefaults = (defaults, state) => Object.assign({}, clone(defaults), clone(state));

    const emitChange = (areaName, changes) => {
      for (const listener of listeners) listener(changes, areaName);
    };

    window.__emcTestState = { syncState, localState };
    window.chrome = {
      runtime: {
        sendMessage: async (message) => {
          if (message.type === 'CLEAR_RECENT_ACTIVITY') {
            localState.stats.recentActivity = [];
            emitChange('local', { stats: { newValue: clone(localState.stats) } });
            return { ok: true };
          }
          if (message.type === 'SET_SITE_DISABLED' || message.type === 'CLEAR_UNSUPPORTED_SITE' || message.type === 'REMOVE_SITE_OVERRIDE' || message.type === 'CLEAR_ALL_SITE_OVERRIDES') {
            return { ok: true };
          }
          return {};
        },
      },
      tabs: {
        query: async () => [{ id: 1, url: 'https://example.com/' }],
        reload: async () => {},
        create: async () => {},
      },
      storage: {
        onChanged: {
          addListener(listener) {
            listeners.push(listener);
          },
        },
        sync: {
          async get(defaults = {}) {
            return mergeDefaults(defaults, syncState);
          },
          async set(updates) {
            Object.assign(syncState, clone(updates));
            const changes = {};
            for (const [key, value] of Object.entries(updates)) {
              changes[key] = { newValue: clone(value) };
            }
            emitChange('sync', changes);
          },
        },
        local: {
          async get(defaults = {}) {
            return mergeDefaults(defaults, localState);
          },
          async set(updates) {
            Object.assign(localState, clone(updates));
            const changes = {};
            for (const [key, value] of Object.entries(updates)) {
              changes[key] = { newValue: clone(value) };
            }
            emitChange('local', changes);
          },
        },
      },
    };
  });

  await page.goto(popupUrl, { waitUntil: 'load' });

  await page.selectOption('#pref-select', 'custom');
  await page.waitForFunction(() => !document.getElementById('settings-view').classList.contains('hidden'));
  await page.waitForFunction(() => !document.getElementById('custom-toggles').classList.contains('hidden'));

  let state = await page.evaluate(() => ({
    select: document.getElementById('pref-select').value,
    customRadio: document.querySelector('input[name="pref"][value="custom"]').checked,
    settingsHidden: document.getElementById('settings-view').classList.contains('hidden'),
    togglesHidden: document.getElementById('custom-toggles').classList.contains('hidden'),
    storedPreference: window.__emcTestState.syncState.globalPreference,
  }));

  assert(state.select === 'custom', 'Customize selection did not persist in the main select');
  assert(state.customRadio, 'Customize radio was not selected after choosing Customize');
  assert(!state.settingsHidden, 'Settings view did not open after choosing Customize');
  assert(!state.togglesHidden, 'Custom toggles did not become visible after choosing Customize');
  assert(state.storedPreference === 'custom', 'Choosing Customize did not persist globalPreference=custom');

  await page.selectOption('#pref-select', 'accept_all');
  await page.waitForTimeout(50);
  await page.check('#toggle-ccpa-do-not-sell');
  await page.waitForTimeout(50);

  state = await page.evaluate(() => ({
    storedPreference: window.__emcTestState.syncState.globalPreference,
    categoryPreferences: window.__emcTestState.syncState.categoryPreferences,
    mainCcpaToggle: document.getElementById('pref-ccpa-do-not-sell').checked,
  }));

  assert(state.storedPreference === 'accept_all', 'Changing the standalone CCPA toggle should not force Customize mode');
  assert(state.categoryPreferences.ccpaDoNotSell === true, 'Standalone CCPA toggle did not persist independently');
  assert(state.mainCcpaToggle === true, 'Main-screen CCPA toggle did not reflect the saved state');

  await page.selectOption('#pref-select', 'custom');
  await page.waitForFunction(() => !document.getElementById('custom-toggles').classList.contains('hidden'));
  await page.check('#toggle-analytics');
  await page.selectOption('#toggle-uncategorized', 'accept');
  await page.waitForTimeout(50);

  state = await page.evaluate(() => ({
    storedPreference: window.__emcTestState.syncState.globalPreference,
    categoryPreferences: window.__emcTestState.syncState.categoryPreferences,
  }));

  assert(state.storedPreference === 'custom', 'Changing custom toggles did not preserve globalPreference=custom');
  assert(state.categoryPreferences.analytics === true, 'Analytics custom setting did not persist');
  assert(state.categoryPreferences.ccpaDoNotSell === true, 'Standalone CCPA setting should carry into Customize mode');
  assert(state.categoryPreferences.uncategorized === 'accept', 'Uncategorized custom setting did not persist');

  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => document.getElementById('pref-select').value === 'custom');

  state = await page.evaluate(() => ({
    select: document.getElementById('pref-select').value,
    customRadio: document.querySelector('input[name="pref"][value="custom"]').checked,
    togglesHidden: document.getElementById('custom-toggles').classList.contains('hidden'),
    analytics: document.getElementById('toggle-analytics').checked,
    mainCcpaToggle: document.getElementById('pref-ccpa-do-not-sell').checked,
    ccpaDoNotSell: document.getElementById('toggle-ccpa-do-not-sell').checked,
    uncategorized: document.getElementById('toggle-uncategorized').value,
  }));

  assert(state.select === 'custom', 'Reloaded popup did not keep Customize selected');
  assert(state.customRadio, 'Reloaded popup did not keep the Customize radio checked');
  assert(!state.togglesHidden, 'Reloaded popup hid custom toggles unexpectedly');
  assert(state.analytics === true, 'Reloaded popup lost the saved analytics custom setting');
  assert(state.mainCcpaToggle === true, 'Reloaded popup lost the main-screen CCPA toggle state');
  assert(state.ccpaDoNotSell === true, 'Reloaded popup lost the saved CCPA do-not-sell setting');
  assert(state.uncategorized === 'accept', 'Reloaded popup lost the saved uncategorized custom setting');

  await browser.close();
  console.log('Popup customize test passed.');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
