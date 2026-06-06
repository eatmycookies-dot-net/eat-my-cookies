// Tier 4 — DOM selector fallback using the cmps.json database.
// Runs in ISOLATED world. Loads CMP signatures, detects which CMP is present,
// then clicks the appropriate button.

const DOM_TIMEOUT_MS = 10000;
const EXPLICIT_ONETRUST_CONTROL_HOSTS = new Set([
  'www.bbc.com',
]);
const ONETRUST_PRIVACY_CHOICES_CCPA_HOSTS = new Set([
  'www.cnbc.com',
  'www.nbcnews.com',
  'www.schwab.com',
  'schwab.com',
]);
const ONETRUST_RELOAD_ON_SAVE_HOSTS = new Set([
  'www.cnbc.com',
]);
const ONETRUST_FORCE_CLEANUP_HOSTS = new Set([
  'www.zoom.com',
  'www.thomsonreuters.com',
  'thomsonreuters.com',
]);
const ONETRUST_AGGRESSIVE_CLEANUP_HOSTS = new Set([
  'www.thomsonreuters.com',
  'thomsonreuters.com',
]);
const ONETRUST_CLEANUP_WATCH_MS = 15000;
const ONETRUST_PRIVACY_CENTER_ACCEPT_HOSTS = new Set([
  'www.thomsonreuters.com',
  'thomsonreuters.com',
  'www.schwab.com',
  'schwab.com',
]);
const ZOOM_ONETRUST_HOSTS = new Set([
  'www.zoom.com',
]);
const ONETRUST_ACTIONABLE_SURFACE_SELECTORS = [
  '#onetrust-banner-sdk',
  '#onetrust-consent-sdk',
  '#onetrust-pc-sdk',
  '.onetrust-pc-dark-filter',
  '#onetrust-pc-btn-handler',
  '#onetrust-accept-btn-handler',
  '#onetrust-reject-all-handler',
  '.ot-pc-refuse-all-handler',
  '.save-preference-btn-handler',
  '.category-switch-handler',
  "input[id^='ot-group-id-']",
];
const SHOPIFY_ACTIONABLE_SURFACE_SELECTORS = [
  '#shopify-pc__banner',
  '.shopify-pc__banner__dialog',
  '#shopify-pc__prefs__dialog',
  '.shopify-pc__prefs__dialog',
  '#shopify-pc__banner__btn-accept',
  '#shopify-pc__banner__btn-decline',
  '#shopify-pc__banner__btn-manage-prefs',
  '#shopify-pc__prefs__header-accept',
  '#shopify-pc__prefs__header-decline',
  '#shopify-pc__prefs__header-save',
  '#shopify-pc__prefs__preferences-input',
  '#shopify-pc__prefs__marketing-input',
  '#shopify-pc__prefs__analytics-input',
];
const SHOPIFY_BANNER_ACCEPT_SELECTORS = [
  '#shopify-pc__banner__btn-accept',
  'button.shopify-pc__banner__btn-accept',
];
const SHOPIFY_BANNER_DECLINE_SELECTORS = [
  '#shopify-pc__banner__btn-decline',
  'button.shopify-pc__banner__btn-decline',
];
const SHOPIFY_BANNER_MANAGE_SELECTORS = [
  '#shopify-pc__banner__btn-manage-prefs',
  'button.shopify-pc__banner__btn-manage-prefs',
  'button[aria-haspopup="dialog"].shopify-pc__banner__btn-manage-prefs',
];
const SHOPIFY_PREFS_ACCEPT_SELECTORS = [
  '#shopify-pc__prefs__header-accept',
  'button.shopify-pc__prefs__header-accept',
];
const SHOPIFY_PREFS_DECLINE_SELECTORS = [
  '#shopify-pc__prefs__header-decline',
  'button.shopify-pc__prefs__header-decline',
];
const SHOPIFY_PREFS_SAVE_SELECTORS = [
  '#shopify-pc__prefs__header-save',
  'button.shopify-pc__prefs__header-save',
];
const SHOPIFY_PREFS_CLOSE_SELECTORS = [
  '#shopify-pc__prefs__header-close',
  'button.shopify-pc__prefs__header-close',
];
const COOKIESCRIPT_ACTIONABLE_SURFACE_SELECTORS = [
  '#cookiescript_injected',
  '#cookiescript_injected_wrapper',
  '#cookiescript_checkboxes',
  '#cookiescript_manage',
  '#cookiescript_manage_wrap',
  '#cookiescript_accept',
  '#cookiescript_reject',
  '#cookiescript_save',
];
const COOKIESCRIPT_SAVE_SELECTORS = [
  '#cookiescript_save',
  'button#cookiescript_save',
  '[role="button"]#cookiescript_save',
];
const OSANO_ACTIONABLE_SURFACE_SELECTORS = [
  '.osano-cm-dialog',
  '.osano-cm-window',
  '.osano-cm-widget',
  '.osano-cm-info-dialog',
  '.osano-cm-info-views',
  '.osano-cm-view',
  '.osano-cm-buttons',
  'button.osano-cm-save',
  'button.osano-cm-denyAll',
  'button.osano-cm-accept-all',
  '.osano-cm-link--type_manage',
];
const OSANO_PREFERENCE_SURFACE_SELECTORS = [
  'button.osano-cm-save',
  '[class*="osano-cm-toggle"]',
  '[class*="osano-cm-switch"]',
  'input[aria-labelledby*="osano-cm" i]',
  '[role="switch"][aria-labelledby*="osano-cm" i]',
];
const OSANO_MANAGE_SELECTORS = [
  '.osano-cm-link--type_manage',
  'a.osano-cm-link--type_manage',
  'button.osano-cm-link--type_manage',
];
const OSANO_SAVE_SELECTORS = [
  'button.osano-cm-save',
  '.osano-cm-save',
];
const OSANO_ROOT_SELECTORS = [
  '.osano-cm-dialog',
  '.osano-cm-window',
  '.osano-cm-widget',
  '.osano-cm-info-dialog',
  '.osano-cm-info-views',
  '.osano-cm-view',
];
const SHOPIFY_STABLE_HIDDEN_MS = 1500;
const SHOPIFY_DISMISS_TIMEOUT_MS = 7000;

async function runDOMHandler(prefs) {
  const cmpsUrl = chrome.runtime.getURL('rules/cmps.json');
  const { cmps } = await fetch(cmpsUrl).then((r) => r.json());

  const immediate = await tryCMPs(cmps, prefs);
  if (immediate) return immediate;

  return new Promise((resolve) => {
    const start = Date.now();
    let done = false;
    let running = false;

    const checkOnce = async () => {
      if (done || running) return;
      running = true;
      try {
        const result = await tryCMPs(cmps, prefs);
        if (result && !done) {
          done = true;
          resolve(result);
          return;
        }
        if (Date.now() - start > DOM_TIMEOUT_MS && !done) {
          done = true;
          resolve(null);
        }
      } finally {
        running = false;
      }
    };

    for (const ms of [500, 1200, 2500, 4500, 8000]) {
      setTimeout(checkOnce, ms);
    }
    setTimeout(() => {
      if (!done) {
        done = true;
        resolve(null);
      }
    }, DOM_TIMEOUT_MS);

    if (isSPA()) {
      // SPAs generate continuous DOM mutations. Polling at fixed intervals avoids
      // observer-driven re-entry loops after we've already handled the banner.
      return;
    } else {
      const observer = new MutationObserver(async () => {
        await checkOnce();
        if (done) observer.disconnect();
      });

      observer.observe(document.body ?? document.documentElement, {
        childList: true,
        subtree: true,
      });
    }
  });
}

// Detects SPA frameworks via DOM markers visible from ISOLATED world.
// (Page globals like window.React are not accessible here.)
function isSPA() {
  if (document.getElementById('__next')) return true;          // Next.js
  if (document.querySelector('script#__NEXT_DATA__')) return true;
  if (document.getElementById('__nuxt')) return true;          // Nuxt
  if (document.querySelector('[data-v-app]')) return true;     // Vue 3
  if (document.documentElement.hasAttribute('ng-version')) return true; // Angular
  return false;
}

async function tryCMPs(cmps, prefs) {
  const host = location.hostname;

  for (const cmp of cmps) {
    if (cmp.id === 'sourcepoint') continue;
    if (!detectCMP(cmp)) continue;
    if (isCMPBlockedOnHost(cmp.id, host, prefs.globalPreference)) continue;
    if (cmp.id === 'onetrust' && shouldUseOneTrustPrivacyCenterOptOut(prefs, host)) {
      if (await executeOneTrustRejectFlow(cmp, host)) {
        return { method: `dom:${cmp.id}:ccpa`, cmpName: cmp.name };
      }
      continue;
    }
    if (cmp.id === 'onetrust' && prefs.globalPreference === 'accept_all' && shouldUseOneTrustPrivacyCenterAccept(host)) {
      if (await executeOneTrustPrivacyCenterAccept(cmp, host)) {
        return { method: `dom:${cmp.id}`, cmpName: cmp.name };
      }
      continue;
    }
    if (cmp.id === 'onetrust' && prefs.globalPreference === 'custom') {
      if (await executeOneTrustCustomFlow(cmp, prefs, host)) {
        return { method: `dom:${cmp.id}:custom`, cmpName: cmp.name };
      }
      continue;
    }
    if (cmp.id === 'onetrust' && prefs.globalPreference !== 'accept_all') {
      if (await executeOneTrustRejectFlow(cmp, host)) {
        return { method: `dom:${cmp.id}`, cmpName: cmp.name };
      }
      continue;
    }
    if (cmp.id === 'shopify') {
      if (prefs.globalPreference === 'custom') continue;
      if (await executeShopifyFlow(cmp, prefs)) {
        const suffix = prefs.globalPreference === 'custom' ? ':custom' : '';
        return { method: `dom:${cmp.id}${suffix}`, cmpName: cmp.name };
      }
      continue;
    }
    if (cmp.id === 'cookiescript' && prefs.globalPreference === 'custom') {
      if (await executeCookieScriptCustomFlow(cmp, prefs)) {
        return { method: `dom:${cmp.id}:custom`, cmpName: cmp.name };
      }
      continue;
    }
    if (cmp.id === 'osano') {
      const osanoResult = await executeOsanoFlow(cmp, prefs);
      if (osanoResult) {
        return typeof osanoResult === 'string'
          ? { method: osanoResult, cmpName: cmp.name }
          : { ...osanoResult, cmpName: cmp.name };
      }
      continue;
    }

    const method = prefs.globalPreference === 'accept_all' ? 'accept_all' : 'reject_all';
    const actions = cmp.actions?.[method];
    if (!actions) continue;
    if (await executeActions(cmp, actions)) {
      return { method: `dom:${cmp.id}`, cmpName: cmp.name };
    }
  }
  return null;
}

function shouldUseOneTrustPrivacyCenterOptOut(prefs, host = location.hostname) {
  return ONETRUST_PRIVACY_CHOICES_CCPA_HOSTS.has(host) && prefs.ccpaDoNotSell !== false;
}

function shouldUseOneTrustPrivacyCenterAccept(host = location.hostname) {
  return ONETRUST_PRIVACY_CENTER_ACCEPT_HOSTS.has(host);
}

function shouldForceOneTrustCleanup(host = location.hostname) {
  return ONETRUST_FORCE_CLEANUP_HOSTS.has(host);
}

function hasVisibleOneTrustActionableSurface() {
  return hasVisibleSelector(ONETRUST_ACTIONABLE_SURFACE_SELECTORS);
}

function hasVisibleOneTrustPrivacyChoicesEntry(host = location.hostname) {
  if (!ONETRUST_PRIVACY_CHOICES_CCPA_HOSTS.has(host)) return false;
  return hasVisibleSelector([
    '#onetrust-pc-btn-handler',
    '.ot-sdk-show-settings',
  ]);
}

function detectCMP(cmp) {
  return cmp.detectors.some((d) => {
    if (d.type === 'css_selector') return !!document.querySelector(d.value);
    if (d.type === 'js_global') {
      // Can't reach page globals from ISOLATED world — check DOM signature only
      return false;
    }
    return false;
  });
}

async function executeActions(cmp, actions) {
  for (const action of actions) {
    if (action.type === 'click') {
      const el = document.querySelector(action.selector);
      if (el && isVisible(el)) {
        dispatchSyntheticClick(el);
        if (cmp.id === 'onetrust' && shouldForceOneTrustCleanup(location.hostname)) {
          scheduleHostOneTrustCleanup(location.hostname);
        }
        if (await waitForDismissal(cmp, actions)) return true;
      }
    }
    if (action.type === 'wait') {
      // Handled by MutationObserver retry loop — skip here
    }
  }
  return false;
}

async function executeOneTrustRejectFlow(cmp, host = location.hostname) {
  if (clickFirstVisible([
    '#onetrust-reject-all-handler',
    '.ot-pc-refuse-all-handler',
    'button[aria-label*="Reject" i]',
    'button[title*="Reject" i]',
  ])) {
    if (ZOOM_ONETRUST_HOSTS.has(host)) scheduleZoomOneTrustCleanup();
    return waitForDismissal(cmp, cmp.actions?.reject_all ?? []);
  }

  const settingsVisible = hasVisibleSelector([
    '.save-preference-btn-handler',
    '.category-switch-handler',
    "input[id^='ot-group-id-']",
    '#onetrust-consent-sdk',
    '#onetrust-pc-sdk',
  ]);
  const actionableSurfaceVisible = hasVisibleOneTrustActionableSurface();
  const privacyChoicesEntryVisible = hasVisibleOneTrustPrivacyChoicesEntry(host);

  if (!settingsVisible && !actionableSurfaceVisible && !privacyChoicesEntryVisible) {
    return false;
  }

  const opened = settingsVisible || clickFirstVisible([
    '#onetrust-pc-btn-handler',
    '#ot-sdk-btn',
    '.ot-sdk-show-settings',
    'button[aria-label*="Privacy Choices" i]',
    'button[title*="Privacy Choices" i]',
    'button[aria-label*="Cookie Settings" i]',
    'button[title*="Cookie Settings" i]',
    'button[aria-label*="Manage Preferences" i]',
    'button[title*="Manage Preferences" i]',
  ]) || clickOneTrustContinueToSettings(host);

  if (!opened) {
    // USNat/CCPA direct opt-out modal: no privacy center opener exists.
    // Toggles appear directly on the notice (e.g. Disney's "Notice of Right to Opt Out").
    return executeOneTrustUSNatDirect(cmp, host);
  }

  if (!(await waitForAnyVisible([
    '.save-preference-btn-handler',
    '.category-switch-handler',
    "input[id^='ot-group-id-']",
  ], 4000))) {
    return false;
  }

  const rejectSelectors = [
    '.ot-pc-refuse-all-handler',
    '#onetrust-reject-all-handler',
    'button[aria-label*="Reject All" i]',
    'button[title*="Reject All" i]',
    'button[aria-label*="Refuse All" i]',
    'button[title*="Refuse All" i]',
  ];
  if (hasVisibleSelector(rejectSelectors)) {
    dispatchPreHandleIfOneTrustReloadsOnSave(host);
  }
  if (clickFirstVisible(rejectSelectors)) {
    return waitForDismissal(cmp, cmp.actions?.reject_all ?? []);
  }

  disableVisibleOneTrustToggles();
  await delay(250);

  const saveSelectors = oneTrustSaveSelectors(host);
  if (hasVisibleSelector(saveSelectors)) {
    dispatchPreHandleIfOneTrustReloadsOnSave(host);
  }
  if (!clickFirstVisible(saveSelectors)) {
    return false;
  }

  if (shouldForceOneTrustCleanup(host)) scheduleHostOneTrustCleanup(host);

  return waitForDismissal(cmp, cmp.actions?.reject_all ?? []);
}

async function executeOneTrustCustomFlow(cmp, prefs, host = location.hostname) {
  if (!ZOOM_ONETRUST_HOSTS.has(host)) return false;

  const settingsVisible = hasVisibleSelector([
    '#onetrust-consent-sdk',
    '#onetrust-pc-sdk',
    '#ot-group-id-C0004',
    '#ot-group-id-C0003',
    '#ot-group-id-C0002',
  ]);
  if (!settingsVisible) {
    const opened = clickFirstVisible([
      '#onetrust-pc-btn-handler',
      '#ot-do-not-sell',
      '.ot-sdk-show-settings',
      'button[aria-label*="Privacy Choices" i]',
      'button[title*="Privacy Choices" i]',
      'button[aria-label*="Cookie Settings" i]',
      'button[title*="Cookie Settings" i]',
    ]);
    if (!opened) return false;
  }

  if (!(await waitForAnyVisible([
    '#ot-group-id-C0004',
    '#ot-group-id-C0003',
    '#ot-group-id-C0002',
    '.save-preference-btn-handler',
    '#onetrust-accept-btn-handler',
  ], 4000))) {
    return false;
  }

  setOneTrustGroupStateById('ot-group-id-C0004', Boolean(prefs.advertising) && prefs.ccpaDoNotSell === false);
  setOneTrustGroupStateById('ot-group-id-C0003', Boolean(prefs.functional));
  setOneTrustGroupStateById('ot-group-id-C0002', Boolean(prefs.analytics));

  await delay(250);

  if (!clickFirstVisible(oneTrustSaveSelectors(host))) {
    return false;
  }

  scheduleZoomOneTrustCleanup();
  return waitForDismissal(cmp, cmp.actions?.reject_all ?? []);
}

async function executeOneTrustPrivacyCenterAccept(cmp, host = location.hostname) {
  const settingsVisible = hasVisibleSelector([
    '.save-preference-btn-handler',
    '.category-switch-handler',
    "input[id^='ot-group-id-']",
    '#onetrust-consent-sdk',
    '#onetrust-pc-sdk',
  ]);
  if (!settingsVisible) {
    const opened = clickFirstVisible([
      '#onetrust-pc-btn-handler',
      '#ot-sdk-btn',
      '.ot-sdk-show-settings',
      'button[aria-label*="Privacy Choices" i]',
      'button[title*="Privacy Choices" i]',
      'button[aria-label*="Cookie Settings" i]',
      'button[title*="Cookie Settings" i]',
      'button[aria-label*="Manage Preferences" i]',
      'button[title*="Manage Preferences" i]',
    ]);
    if (!opened) return false;
  }

  if (!(await waitForAnyVisible([
    '.save-preference-btn-handler',
    '#onetrust-accept-btn-handler',
    '.category-switch-handler',
    "input[id^='ot-group-id-']",
  ], 4000))) {
    return false;
  }

  enableVisibleOneTrustToggles();
  await delay(250);

  if (!clickFirstVisible(oneTrustSaveSelectors(host))) {
    return false;
  }

  if (shouldForceOneTrustCleanup(host)) scheduleHostOneTrustCleanup(host);
  return waitForDismissal(cmp, cmp.actions?.accept_all ?? []);
}

async function executeOneTrustUSNatDirect(cmp, host) {
  // Guard: only proceed when the confirm button is specifically labeled "Submit".
  // GDPR preference centers use "Confirm My Choices" and must not match here.
  const submitBtn = document.querySelector('#onetrust-accept-btn-handler');
  if (!submitBtn || !isVisible(submitBtn)) return false;
  if (!/\bsubmit\b/i.test(submitBtn.textContent?.trim() ?? '')) return false;

  const toggle = document.querySelector('.category-switch-handler, input[id^="ot-group-id-"]');
  if (!toggle || !isVisible(toggle)) return false;

  disableVisibleOneTrustToggles();
  await delay(250);

  if (!dispatchSyntheticClick(submitBtn)) return false;
  return waitForDismissal(cmp, cmp.actions?.reject_all ?? []);
}

function clickUSNatSubmitIfPresent() {
  const btn = document.querySelector('#onetrust-accept-btn-handler');
  if (!btn || !isVisible(btn)) return false;
  if (!/\bsubmit\b/i.test(btn.textContent?.trim() ?? '')) return false;
  return dispatchSyntheticClick(btn);
}

async function executeShopifyFlow(cmp, prefs) {
  if (!hasVisibleSelector(SHOPIFY_ACTIONABLE_SURFACE_SELECTORS)) {
    return false;
  }

  const bannerRoot = firstVisibleElement(['#shopify-pc__banner', '.shopify-pc__banner__dialog']);
  const prefsRoot = firstVisibleElement(['#shopify-pc__prefs__dialog', '.shopify-pc__prefs__dialog']);
  const desiredStates = {
    preferences: Boolean(prefs.functional) || prefs.uncategorized === 'accept',
    marketing: Boolean(prefs.advertising),
    analytics: Boolean(prefs.analytics),
  };
  const stateValues = Object.values(desiredStates);
  const allDesiredOn = stateValues.length > 0 && stateValues.every(Boolean);
  const allDesiredOff = stateValues.length > 0 && stateValues.every((value) => !value);

  if (allDesiredOn && (
    clickFirstVisibleWithin(bannerRoot ?? prefsRoot, [...SHOPIFY_BANNER_ACCEPT_SELECTORS, ...SHOPIFY_PREFS_ACCEPT_SELECTORS]) ||
    clickFirstVisible([...SHOPIFY_BANNER_ACCEPT_SELECTORS, ...SHOPIFY_PREFS_ACCEPT_SELECTORS]) ||
    clickShopifyButtonByText(/accept all/i, bannerRoot ?? prefsRoot)
  )) {
    return waitForShopifyDismissal(cmp);
  }

  if (allDesiredOff && (
    clickFirstVisibleWithin(bannerRoot ?? prefsRoot, [...SHOPIFY_BANNER_DECLINE_SELECTORS, ...SHOPIFY_PREFS_DECLINE_SELECTORS]) ||
    clickFirstVisible([...SHOPIFY_BANNER_DECLINE_SELECTORS, ...SHOPIFY_PREFS_DECLINE_SELECTORS]) ||
    clickShopifyButtonByText(/(?:decline|reject) all/i, bannerRoot ?? prefsRoot)
  )) {
    return waitForShopifyDismissal(cmp);
  }

  const prefsVisible = hasVisibleSelector(shopifyPreferencesSurfaceSelectors());
  const opened = prefsVisible || clickFirstVisibleWithin(bannerRoot, [
    ...SHOPIFY_BANNER_MANAGE_SELECTORS,
    'button[aria-label*="Manage" i]',
    'button[title*="Manage" i]',
  ]) || clickFirstVisible([
    ...SHOPIFY_BANNER_MANAGE_SELECTORS,
    'button[aria-label*="Manage" i]',
    'button[title*="Manage" i]',
  ]);
  if (!opened) return false;

  if (!(await waitForAnyVisible(shopifyPreferencesSurfaceSelectors(), 4000))) {
    return false;
  }

  const activePrefsRoot = firstVisibleElement(['#shopify-pc__prefs__dialog', '.shopify-pc__prefs__dialog']) ?? prefsRoot;

  if (allDesiredOn && (
    clickFirstVisibleWithin(activePrefsRoot, SHOPIFY_PREFS_ACCEPT_SELECTORS) ||
    clickFirstVisible(SHOPIFY_PREFS_ACCEPT_SELECTORS) ||
    clickShopifyButtonByText(/accept all/i, activePrefsRoot)
  )) {
    return waitForShopifyDismissal(cmp);
  }

  if (allDesiredOff && (
    clickFirstVisibleWithin(activePrefsRoot, SHOPIFY_PREFS_DECLINE_SELECTORS) ||
    clickFirstVisible(SHOPIFY_PREFS_DECLINE_SELECTORS) ||
    clickShopifyButtonByText(/(?:decline|reject) all/i, activePrefsRoot)
  )) {
    return waitForShopifyDismissal(cmp);
  }

  const appliedPreferences = await setShopifyGroupStateById(activePrefsRoot, 'shopify-pc__prefs__preferences-input', desiredStates.preferences);
  const appliedMarketing = await setShopifyGroupStateById(activePrefsRoot, 'shopify-pc__prefs__marketing-input', desiredStates.marketing);
  const appliedAnalytics = await setShopifyGroupStateById(activePrefsRoot, 'shopify-pc__prefs__analytics-input', desiredStates.analytics);

  if (!appliedPreferences || !appliedMarketing || !appliedAnalytics) {
    return false;
  }

  await delay(250);

  const saveClicked = clickFirstVisibleWithin(activePrefsRoot, [
    ...SHOPIFY_PREFS_SAVE_SELECTORS,
    'button[aria-label*="Save" i]',
    'button[title*="Save" i]',
  ]) || clickFirstVisible([
    ...SHOPIFY_PREFS_SAVE_SELECTORS,
    'button[aria-label*="Save" i]',
    'button[title*="Save" i]',
  ]) || clickShopifyButtonByText(
    /save (?:my )?choices/i,
    activePrefsRoot
  );
  if (!saveClicked) {
    return false;
  }

  return waitForShopifyDismissal(cmp);
}

async function executeCookieScriptCustomFlow(cmp, prefs) {
  if (!hasVisibleSelector(COOKIESCRIPT_ACTIONABLE_SURFACE_SELECTORS)) {
    return false;
  }

  const preferencesVisible = hasVisibleSelector(cookieScriptPreferenceSelectors());
  const opened = preferencesVisible || clickFirstVisible([
    '#cookiescript_manage',
    '#cookiescript_manage_wrap',
    'button[aria-controls="cookiescript_checkboxes"]',
    '[role="button"][aria-controls="cookiescript_checkboxes"]',
  ]);
  if (!opened) return false;

  if (!(await waitForAnyVisible(cookieScriptPreferenceSelectors(), 4000))) {
    return false;
  }

  const appliedFunctional = await setCookieScriptToggleStateById('cookiescript_category_functionality', Boolean(prefs.functional));
  const appliedPerformance = await setCookieScriptToggleStateById('cookiescript_category_performance', Boolean(prefs.analytics));
  const appliedTargeting = await setCookieScriptToggleStateById(
    'cookiescript_category_targeting',
    Boolean(prefs.advertising) && prefs.ccpaDoNotSell === false,
  );
  const appliedUnclassified = setCookieScriptSelectStateById(
    'cookiescript_category_unclassified',
    prefs.uncategorized === 'accept',
  );

  const appliedResults = [
    appliedFunctional,
    appliedPerformance,
    appliedTargeting,
    appliedUnclassified,
  ];
  const appliedCount = appliedResults.filter((value) => value !== null).length;
  if (appliedCount === 0 || appliedResults.includes(false)) {
    return false;
  }

  await delay(250);

  const saveClicked = clickFirstVisible(COOKIESCRIPT_SAVE_SELECTORS) ||
    clickCookieScriptButtonByText(/(?:save|guardar|enregistrer|speichern|salva).*(?:close|fechar|fermer|schlie(?:ss|ß)en|chiudi)?/i);
  if (!saveClicked) return false;

  return waitForDismissal(cmp, selectorActions(cookieScriptDismissSelectors()));
}

async function executeOsanoFlow(cmp, prefs) {
  if (prefs.globalPreference === 'accept_all') {
    const wantsCcpaOptOut = prefs.ccpaDoNotSell !== false;
    if (!wantsCcpaOptOut) {
      const handled = await executeOsanoDirectFlow(cmp, cmp.actions?.accept_all ?? [], 'dom:osano:accept_all');
      if (handled) return handled;
    }

    const fallbackPrefs = {
      ...prefs,
      globalPreference: 'custom',
      functional: true,
      analytics: true,
      advertising: wantsCcpaOptOut ? false : true,
      uncategorized: 'accept',
      ccpaDoNotSell: wantsCcpaOptOut,
    };
    return executeOsanoCustomFlow(cmp, fallbackPrefs, {
      methodOverride: 'dom:osano:accept_all',
    });
  }

  if (prefs.globalPreference === 'reject_all') {
    const fallbackPrefs = {
      ...prefs,
      globalPreference: 'custom',
      functional: false,
      analytics: false,
      advertising: false,
      uncategorized: 'reject',
      ccpaDoNotSell: prefs.ccpaDoNotSell !== false,
    };
    const handled = await executeOsanoCustomFlow(cmp, fallbackPrefs, {
      methodOverride: 'dom:osano:reject_all',
    });
    if (handled) return handled;

    if (hasVisibleOsanoDirectAction(cmp.actions?.reject_all ?? [], /\b(?:reject|deny)(?:\s+non-essential)?\b/i)) {
      return executeOsanoDirectFlow(cmp, cmp.actions?.reject_all ?? [], 'dom:osano:reject_all');
    }
    return null;
  }

  return executeOsanoCustomFlow(cmp, prefs);
}

function setOsanoDebug(data) {
  try {
    document.documentElement.dataset.emcOsanoDebug = JSON.stringify(data);
  } catch (_) {}
}

async function executeOsanoDirectFlow(cmp, actions, method) {
  for (const action of actions) {
    if (action.type !== 'click') continue;
    const el = firstVisibleElement([action.selector]);
    if (!el) continue;

    if (!dispatchNativeClick(el)) continue;

    await delay(250);
    if (await waitForDismissal(cmp, actions, 2000)) {
      return method;
    }

    // Osano can animate out or persist consent asynchronously after the click.
    // If the explicit Osano surface is no longer visible shortly afterwards,
    // count this as handled so stats stay aligned with the user-visible result.
    await delay(2500);
    if (!hasVisibleSelector(osanoDismissSelectors())) {
      return method;
    }

    const actionSelectors = actions
      .filter((candidate) => candidate.type === 'click' && candidate.selector)
      .map((candidate) => candidate.selector);
    if (actionSelectors.length > 0 && !hasVisibleSelector(actionSelectors)) {
      return method;
    }
  }

  return null;
}

async function executeOsanoCustomFlow(cmp, prefs, options = {}) {
  if (!hasVisibleSelector(OSANO_ACTIONABLE_SURFACE_SELECTORS)) {
    setOsanoDebug({ stage: 'no-actionable-surface', pref: prefs.globalPreference });
    return false;
  }

  const preferencesVisible = hasVisibleSelector(osanoPreferenceSelectors());
  const opened = preferencesVisible ||
    openOsanoDrawerViaRuntime() ||
    clickFirstVisibleNative(OSANO_MANAGE_SELECTORS) ||
    clickOsanoButtonByText(/(?:manage|storage preferences|cookie preferences)/i);
  if (!opened) {
    setOsanoDebug({ stage: 'open-failed', pref: prefs.globalPreference, preferencesVisible });
    return false;
  }

  if (!(await waitForAnyVisible(osanoPreferenceSelectors(), 4000))) {
    setOsanoDebug({ stage: 'preferences-timeout', pref: prefs.globalPreference });
    return false;
  }

  if (!(await waitForOsanoPreferenceControls(4000))) {
    setOsanoDebug({ stage: 'controls-timeout', pref: prefs.globalPreference });
    return false;
  }

  const wantsCcpaOptOut = prefs.ccpaDoNotSell !== false;
  const desiredStates = [
    {
      patterns: [/\bdo not sell\b/i, /\bdo not sell or share\b/i, /\bopt[\s-]?out\b/i, /\bccpa\b/i],
      categories: ['opt_out', 'ccpa', 'do_not_sell', 'sale_opt_out'],
      checked: wantsCcpaOptOut,
      method: 'dom:osano:ccpa',
    },
    {
      patterns: [/\btarget(?:ed|ing)? advertising\b/i, /\badvertising\b/i, /\bmarketing\b/i, /\bsale of personal data\b/i],
      categories: ['advertising', 'marketing', 'targeting'],
      checked: Boolean(prefs.advertising) && prefs.ccpaDoNotSell === false,
      method: 'dom:osano:custom',
    },
    {
      patterns: [/\bpersonali[sz]ation\b/i, /\bpreferences?\b/i, /\bfunctional\b/i],
      categories: ['personalization', 'personalisation', 'preferences', 'functional'],
      checked: Boolean(prefs.functional) || prefs.uncategorized === 'accept',
      method: 'dom:osano:custom',
    },
    {
      patterns: [/\banalytics?\b/i, /\bmeasurement\b/i, /\bperformance\b/i, /\bstatistics?\b/i],
      categories: ['analytics', 'measurement', 'performance', 'statistics'],
      checked: Boolean(prefs.analytics),
      method: 'dom:osano:custom',
    },
  ];

  const appliedResults = [];
  const appliedMethods = new Set();
  for (const group of desiredStates) {
    const result = await setOsanoToggleState(group.patterns, group.checked, { categories: group.categories });
    appliedResults.push(result);
    if (result !== null) {
      appliedMethods.add(group.method);
    }
  }

  const appliedCount = appliedResults.filter((value) => value !== null).length;
  if (appliedCount === 0 || appliedResults.includes(false)) {
    setOsanoDebug({
      stage: 'apply-failed',
      pref: prefs.globalPreference,
      appliedResults,
      wantsCcpaOptOut,
    });
    return false;
  }

  const ccpaControlWasVisible = appliedResults[0] !== null;

  await delay(250);

  const saveClicked = clickFirstVisibleNative(OSANO_SAVE_SELECTORS) ||
    clickOsanoButtonByText(/save/i);
  if (!saveClicked) {
    setOsanoDebug({
      stage: 'save-failed',
      pref: prefs.globalPreference,
      appliedResults,
      wantsCcpaOptOut,
    });
    return false;
  }

  const derivedMethod = appliedMethods.size === 1 && appliedMethods.has('dom:osano:ccpa')
    ? 'dom:osano:ccpa'
    : 'dom:osano:custom';
  const method = options.methodOverride ?? derivedMethod;

  await delay(300);
  if (await waitForDismissal(cmp, selectorActions(osanoDismissSelectors()), 1500)) {
    if (!ccpaControlWasVisible) {
      await handleDedicatedOsanoCcpaIfAvailable(wantsCcpaOptOut);
    }
    setOsanoDebug({
      stage: 'dismissed',
      pref: prefs.globalPreference,
      method,
      appliedResults,
      wantsCcpaOptOut,
      ccpaControlWasVisible,
    });
    return method;
  }

  // Osano can keep the drawer visible briefly after Save while it persists the
  // choice. Return success through the normal reporting path once the desired
  // state has been applied and Save was clicked, so stats update consistently.
  if (!ccpaControlWasVisible) {
    await handleDedicatedOsanoCcpaIfAvailable(wantsCcpaOptOut);
  }
  setOsanoDebug({
    stage: 'saved-persisting',
    pref: prefs.globalPreference,
    method,
    appliedResults,
    wantsCcpaOptOut,
    ccpaControlWasVisible,
  });
  return method;
}

function oneTrustSaveSelectors(host = location.hostname) {
  const selectors = [
    '.save-preference-btn-handler',
    '#onetrust-accept-btn-handler',
    'button[aria-label*="Confirm My Choice" i]',
    'button[aria-label*="Confirm My Choices" i]',
    'button[title*="Confirm My Choice" i]',
    'button[title*="Confirm My Choices" i]',
  ];

  // BBC's homepage exposes unrelated visible "Save" controls. Keep its OneTrust
  // automation scoped to explicit OneTrust classes so we never click page UI.
  if (!EXPLICIT_ONETRUST_CONTROL_HOSTS.has(host)) {
    selectors.push(
      'button[aria-label*="Save" i]',
      'button[title*="Save" i]',
    );
  }

  return selectors;
}

function dispatchPreHandleIfOneTrustReloadsOnSave(host = location.hostname) {
  if (!ONETRUST_RELOAD_ON_SAVE_HOSTS.has(host)) return;
  document.dispatchEvent(new CustomEvent('__emc_pre_handle__', {
    detail: {
      method: 'dom:onetrust:ccpa',
      preference: document.documentElement.dataset.emcPref ?? 'reject_all',
    },
  }));
}

function clickOneTrustContinueToSettings(host = location.hostname) {
  if (!ONETRUST_RELOAD_ON_SAVE_HOSTS.has(host)) return false;
  const btn = document.querySelector('#onetrust-accept-btn-handler');
  if (!btn || !isVisible(btn)) return false;
  const text = btn.textContent?.trim() ?? '';
  if (!/\bcontinue\b/i.test(text)) return false;
  return dispatchSyntheticClick(btn);
}

function setOneTrustGroupStateById(id, checked) {
  const toggle = document.getElementById(id);
  if (!toggle || toggle.disabled || toggle.getAttribute('aria-disabled') === 'true') return false;
  if (Boolean(toggle.checked) === checked) return true;
  forceOneTrustToggleState(toggle, checked);
  return true;
}

function selectorActions(selectors) {
  return selectors.map((selector) => ({ type: 'click', selector }));
}

function waitForShopifyDismissal(cmp) {
  return waitForDismissal(cmp, selectorActions(shopifyDismissSelectors()), SHOPIFY_DISMISS_TIMEOUT_MS);
}

function shopifyPreferencesSurfaceSelectors() {
  return [
    '#shopify-pc__prefs__dialog',
    '.shopify-pc__prefs__dialog',
    '#shopify-pc__prefs__header-save',
    '#shopify-pc__prefs__preferences-input',
    '#shopify-pc__prefs__marketing-input',
    '#shopify-pc__prefs__analytics-input',
  ];
}

function shopifyDismissSelectors() {
  return [
    '#shopify-pc__banner',
    '.shopify-pc__banner__dialog',
    '#shopify-pc__prefs',
    '#shopify-pc__prefs__dialog',
    '.shopify-pc__prefs__dialog',
    ...SHOPIFY_BANNER_MANAGE_SELECTORS,
    ...SHOPIFY_BANNER_ACCEPT_SELECTORS,
    ...SHOPIFY_BANNER_DECLINE_SELECTORS,
    ...SHOPIFY_PREFS_ACCEPT_SELECTORS,
    ...SHOPIFY_PREFS_DECLINE_SELECTORS,
    ...SHOPIFY_PREFS_SAVE_SELECTORS,
    ...SHOPIFY_PREFS_CLOSE_SELECTORS,
  ];
}

function cookieScriptPreferenceSelectors() {
  return [
    '#cookiescript_checkboxes',
    '#cookiescript_category_functionality',
    '#cookiescript_category_performance',
    '#cookiescript_category_targeting',
    '#cookiescript_category_unclassified',
    '#cookiescript_save',
  ];
}

function cookieScriptDismissSelectors() {
  return [
    '#cookiescript_injected',
    '#cookiescript_injected_wrapper',
    '#cookiescript_checkboxes',
    '#cookiescript_manage',
    '#cookiescript_manage_wrap',
    '#cookiescript_accept',
    '#cookiescript_reject',
    ...COOKIESCRIPT_SAVE_SELECTORS,
  ];
}

function osanoPreferenceSelectors() {
  return [
    ...OSANO_PREFERENCE_SURFACE_SELECTORS,
    ...OSANO_SAVE_SELECTORS,
  ];
}

function osanoDismissSelectors() {
  return [
    ...OSANO_ROOT_SELECTORS,
    '.osano-cm-buttons',
    ...OSANO_MANAGE_SELECTORS,
    ...OSANO_SAVE_SELECTORS,
    'button.osano-cm-denyAll',
    'button.osano-cm-accept-all',
  ];
}

async function waitForOsanoPreferenceControls(timeoutMs = 4000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const visibleRoot = activeOsanoRoot() ?? document;
    const visibleControls = Array.from(
      visibleRoot.querySelectorAll('input[type="checkbox"], [role="switch"], button[aria-checked], [aria-checked][tabindex]')
    ).filter((control) => isVisible(control) || hasVisibleToggleLabel(control));
    if (visibleControls.length >= 2) return true;
    await delay(50);
  }
  return false;
}

function activeOsanoRoot() {
  const seen = new Set();
  const candidates = [];
  for (const selector of OSANO_ROOT_SELECTORS) {
    for (const root of document.querySelectorAll(selector)) {
      if (seen.has(root) || !isVisible(root)) continue;
      seen.add(root);
      const toggleCount = root.querySelectorAll('input[type="checkbox"], [role="switch"], button[aria-checked], [aria-checked][tabindex]').length;
      const saveCount = root.querySelectorAll(OSANO_SAVE_SELECTORS.join(', ')).length;
      const manageCount = root.querySelectorAll(OSANO_MANAGE_SELECTORS.join(', ')).length;
      candidates.push({
        root,
        score: toggleCount * 10 + saveCount * 3 + manageCount,
      });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.root ?? null;
}

function clickOsanoButtonByText(pattern) {
  const button = findOsanoButtonByText(pattern);
  if (!button) return false;
  return dispatchNativeClick(button);
}

function findOsanoButtonByText(pattern) {
  const root = activeOsanoRoot() ?? document;
  const buttons = root.querySelectorAll('button, a, [role="button"]');
  for (const button of buttons) {
    if (!isVisible(button)) continue;
    const text = button.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    if (!pattern.test(text)) continue;
    return button;
  }
  return null;
}

function hasVisibleOsanoDirectAction(actions, fallbackPattern) {
  for (const action of actions) {
    if (action.type !== 'click') continue;
    if (!action.selector) continue;
    if (firstVisibleElement([action.selector])) return true;
  }
  return Boolean(findOsanoButtonByText(fallbackPattern));
}

async function handleDedicatedOsanoCcpaIfAvailable(checked) {
  if (!openOsanoDoNotSellViaRuntime()) {
    const opener = findDedicatedOsanoCcpaOpener();
    if (!opener) return null;
    if (!dispatchNativeClick(opener)) return false;
  }
  if (!(await waitForAnyVisible(osanoPreferenceSelectors(), 4000))) return false;

  const result = await setOsanoToggleState(
    [/\bdo not sell\b/i, /\bdo not sell or share\b/i, /\bopt[\s-]?out\b/i, /\bccpa\b/i],
    checked,
    { categories: ['opt_out', 'ccpa', 'do_not_sell', 'sale_opt_out'] },
  );
  if (result === false) return false;
  if (result === null) return null;

  await delay(250);
  const saveClicked = clickFirstVisibleNative(OSANO_SAVE_SELECTORS) ||
    clickOsanoButtonByText(/save/i);
  if (!saveClicked) return false;

  await delay(300);
  return true;
}

function findDedicatedOsanoCcpaOpener() {
  const candidates = document.querySelectorAll('a, button, [role="button"]');
  for (const candidate of candidates) {
    if (!isVisible(candidate)) continue;
    if (candidate.closest(OSANO_ROOT_SELECTORS.join(', '))) continue;
    const text = candidate.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    if (/(?:do not sell|do not sell or share|your privacy choices)/i.test(text)) {
      return candidate;
    }
  }
  return null;
}

function openOsanoDrawerViaRuntime() {
  const cm = window.Osano?.cm;
  if (!cm) return false;
  for (const method of ['showDrawer', 'showDialog', 'showWidget']) {
    if (typeof cm[method] !== 'function') continue;
    try {
      cm[method]();
      return true;
    } catch (_) {}
  }
  return false;
}

function openOsanoDoNotSellViaRuntime() {
  const cm = window.Osano?.cm;
  if (!cm) return false;
  for (const method of ['showDoNotSell', 'showOptOutWidget']) {
    if (typeof cm[method] !== 'function') continue;
    try {
      cm[method]();
      return true;
    } catch (_) {}
  }
  return false;
}

async function setOsanoToggleState(patterns, checked, options = {}) {
  const control = findOsanoToggleControl(patterns, options);
  if (!control) return null;

  const current = readOsanoToggleState(control);
  if (current === null) return false;
  if (current === checked) return true;

  const interactionTarget = findOsanoToggleInteractionTarget(control);
  if (interactionTarget && dispatchNativeClick(interactionTarget) &&
      (await waitForOsanoToggleState(control, checked, 700))) {
    return true;
  }

  if (interactionTarget && dispatchSyntheticClick(interactionTarget, { native: false }) &&
      (await waitForOsanoToggleState(control, checked, 700))) {
    return true;
  }

  if (!forceOsanoToggleState(control, checked)) {
    return false;
  }
  return waitForOsanoToggleState(control, checked, 700);
}

function findOsanoToggleControl(patterns, options = {}) {
  const root = activeOsanoRoot() ?? document;
  const controls = root.querySelectorAll('input[type="checkbox"], [role="switch"], button[aria-checked], [aria-checked][tabindex]');
  for (const control of controls) {
    if (!isVisible(control) && !hasVisibleToggleLabel(control)) continue;
    const label = getOsanoToggleLabel(control);
    const identity = getOsanoToggleIdentity(control);
    const labelMatches = label && patterns.some((pattern) => pattern.test(label));
    const categoryMatches = (options.categories ?? []).some((category) => identity.includes(category));
    if (labelMatches || categoryMatches) {
      return control;
    }
  }
  return null;
}

function getOsanoToggleIdentity(control) {
  const fragments = [
    control.id ?? '',
    control.getAttribute?.('name') ?? '',
    control.getAttribute?.('data-category') ?? '',
    control.getAttribute?.('aria-describedby') ?? '',
    control.getAttribute?.('aria-labelledby') ?? '',
  ];
  return fragments.join(' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

function getOsanoToggleLabel(control) {
  const fragments = [];
  const ariaLabel = control.getAttribute?.('aria-label');
  if (ariaLabel) fragments.push(ariaLabel);

  const labelledBy = control.getAttribute?.('aria-labelledby') ?? '';
  for (const id of labelledBy.split(/\s+/).filter(Boolean)) {
    const labelEl = document.getElementById(id);
    if (labelEl) fragments.push(labelEl.textContent ?? '');
  }

  for (const label of Array.from(control.labels ?? [])) {
    fragments.push(label.textContent ?? '');
  }

  const closestLabel = control.closest?.('label');
  if (closestLabel) fragments.push(closestLabel.textContent ?? '');

  const parentText = control.parentElement?.textContent;
  if (parentText) fragments.push(parentText);

  const text = fragments.join(' ').replace(/\s+/g, ' ').trim();
  return text || null;
}

function hasVisibleToggleLabel(control) {
  for (const label of Array.from(control.labels ?? [])) {
    if (isVisible(label)) return true;
  }
  const closestLabel = control.closest?.('label');
  return Boolean(closestLabel && isVisible(closestLabel));
}

function readOsanoToggleState(control) {
  if (control instanceof HTMLInputElement) {
    return Boolean(control.checked);
  }
  if (control.getAttribute?.('aria-checked') != null) {
    return control.getAttribute('aria-checked') === 'true';
  }
  return null;
}

function findOsanoToggleInteractionTarget(control) {
  const explicitLabel = control.labels?.[0];
  if (explicitLabel && isVisible(explicitLabel)) return explicitLabel;
  const closestLabel = control.closest?.('label');
  if (closestLabel && isVisible(closestLabel)) return closestLabel;
  if (isVisible(control)) return control;
  return explicitLabel || closestLabel || control;
}

async function waitForOsanoToggleState(control, checked, timeoutMs = 700) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (readOsanoToggleState(control) === checked) return true;
    await delay(50);
  }
  return readOsanoToggleState(control) === checked;
}

function forceOsanoToggleState(control, checked) {
  if (control instanceof HTMLInputElement) {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'checked'
    )?.set;
    if (nativeSetter) {
      nativeSetter.call(control, checked);
    } else {
      control.checked = checked;
    }
    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  if (control.getAttribute?.('aria-checked') != null) {
    control.setAttribute('aria-checked', checked ? 'true' : 'false');
    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  return false;
}


function clickCookieScriptButtonByText(pattern) {
  const root = firstVisibleElement(['#cookiescript_injected', '#cookiescript_injected_wrapper']) ?? document;
  const buttons = root.querySelectorAll('button, [role="button"]');
  for (const button of buttons) {
    if (!isVisible(button)) continue;
    const text = button.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    if (!pattern.test(text)) continue;
    return dispatchSyntheticClick(button);
  }
  return false;
}

function clickShopifyButtonByText(pattern, root) {
  if (!root) return false;
  const buttons = root.querySelectorAll('button, [role="button"]');
  for (const button of buttons) {
    if (!isVisible(button)) continue;
    const text = button.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    if (!pattern.test(text)) continue;
    return dispatchSyntheticClick(button);
  }
  return false;
}

async function setShopifyGroupStateById(root, id, checked) {
  const toggle = findVisibleElementById(id, root);
  if (!toggle || toggle.disabled || toggle.getAttribute('aria-disabled') === 'true') return false;
  if (Boolean(toggle.checked) === checked) return true;

  const interactionTarget = findShopifyToggleInteractionTarget(toggle);
  if (interactionTarget && dispatchSyntheticClick(interactionTarget)) {
    if (await waitForShopifyToggleState(toggle, checked, 700)) return true;
  }

  forceShopifyToggleState(toggle, checked);
  return waitForShopifyToggleState(toggle, checked, 700);
}

function findShopifyToggleInteractionTarget(toggle) {
  const nestedLabel = toggle.closest?.('label');
  if (nestedLabel && isVisible(nestedLabel)) return nestedLabel;
  const explicitLabel = toggle.labels?.[0];
  if (explicitLabel && isVisible(explicitLabel)) return explicitLabel;
  if (isVisible(toggle)) return toggle;
  return nestedLabel || explicitLabel || toggle;
}

async function waitForShopifyToggleState(toggle, checked, timeoutMs = 700) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (Boolean(toggle.checked) === checked) return true;
    await delay(50);
  }
  return Boolean(toggle.checked) === checked;
}

function forceShopifyToggleState(toggle, checked) {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'checked'
  )?.set;
  if (nativeSetter) {
    nativeSetter.call(toggle, checked);
  } else {
    toggle.checked = checked;
  }
  toggle.dispatchEvent(new Event('input', { bubbles: true }));
  toggle.dispatchEvent(new Event('change', { bubbles: true }));
}

async function setCookieScriptToggleStateById(id, checked) {
  const toggle = document.getElementById(id);
  if (!(toggle instanceof HTMLInputElement)) return null;
  if (toggle.disabled || toggle.getAttribute('aria-disabled') === 'true') return false;

  const interactionTarget = findCookieScriptToggleInteractionTarget(toggle);
  if (!interactionTarget || (!isVisible(interactionTarget) && !isVisible(toggle))) return null;
  if (Boolean(toggle.checked) === checked) return true;

  if (dispatchSyntheticClick(interactionTarget) && (await waitForCookieScriptToggleState(toggle, checked, 700))) {
    return true;
  }

  forceCookieScriptToggleState(toggle, checked);
  return waitForCookieScriptToggleState(toggle, checked, 700);
}

function findCookieScriptToggleInteractionTarget(toggle) {
  const explicitLabel = toggle.labels?.[0];
  if (explicitLabel && isVisible(explicitLabel)) return explicitLabel;
  const nestedLabel = toggle.closest?.('label');
  if (nestedLabel && isVisible(nestedLabel)) return nestedLabel;
  if (isVisible(toggle)) return toggle;
  return explicitLabel || nestedLabel || toggle;
}

async function waitForCookieScriptToggleState(toggle, checked, timeoutMs = 700) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (Boolean(toggle.checked) === checked) return true;
    await delay(50);
  }
  return Boolean(toggle.checked) === checked;
}

function forceCookieScriptToggleState(toggle, checked) {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'checked'
  )?.set;
  if (nativeSetter) {
    nativeSetter.call(toggle, checked);
  } else {
    toggle.checked = checked;
  }
  toggle.dispatchEvent(new Event('input', { bubbles: true }));
  toggle.dispatchEvent(new Event('change', { bubbles: true }));
}

function setCookieScriptSelectStateById(id, accept) {
  const select = document.getElementById(id);
  if (!(select instanceof HTMLSelectElement)) return null;
  if (select.disabled || select.getAttribute('aria-disabled') === 'true' || !isVisible(select)) return false;

  const desiredOption = Array.from(select.options).find((option) => {
    const haystack = `${option.value ?? ''} ${option.textContent ?? ''}`.toLowerCase();
    return accept ? /accept|allow|agree|yes|permit/.test(haystack) : /reject|deny|decline|disagree|no/.test(haystack);
  });
  if (!desiredOption) return false;
  if (select.value === desiredOption.value) return true;

  select.value = desiredOption.value;
  select.dispatchEvent(new Event('input', { bubbles: true }));
  select.dispatchEvent(new Event('change', { bubbles: true }));
  return select.value === desiredOption.value;
}

function scheduleZoomOneTrustCleanup() {
  cleanupZoomOneTrustArtifacts();
  try {
    setTimeout(() => cleanupZoomOneTrustArtifacts(), 1200);
    setTimeout(() => cleanupZoomOneTrustArtifacts(), 3500);
  } catch (_) {}
}

function scheduleHostOneTrustCleanup(host = location.hostname) {
  if (ZOOM_ONETRUST_HOSTS.has(host)) {
    scheduleZoomOneTrustCleanup();
    return;
  }
  cleanupGenericOneTrustArtifacts(host);
  startOneTrustCleanupWatch(host);
  try {
    setTimeout(() => cleanupGenericOneTrustArtifacts(host), 1200);
    setTimeout(() => cleanupGenericOneTrustArtifacts(host), 3500);
  } catch (_) {}
}

let oneTrustCleanupWatchTimer = null;
let oneTrustCleanupObserver = null;

function startOneTrustCleanupWatch(host = location.hostname) {
  if (!ONETRUST_AGGRESSIVE_CLEANUP_HOSTS.has(host)) return;
  cleanupGenericOneTrustArtifacts(host);
  try { oneTrustCleanupObserver?.disconnect(); } catch (_) {}
  try { clearTimeout(oneTrustCleanupWatchTimer); } catch (_) {}
  const root = document.body ?? document.documentElement;
  if (root) {
    oneTrustCleanupObserver = new MutationObserver(() => cleanupGenericOneTrustArtifacts(host));
    try {
      oneTrustCleanupObserver.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
    } catch (_) {}
  }
  try {
    oneTrustCleanupWatchTimer = setTimeout(() => {
      try { oneTrustCleanupObserver?.disconnect(); } catch (_) {}
      oneTrustCleanupObserver = null;
      oneTrustCleanupWatchTimer = null;
    }, ONETRUST_CLEANUP_WATCH_MS);
  } catch (_) {}
}

function cleanupZoomOneTrustArtifacts() {
  for (const sel of [
    '#onetrust-banner-sdk',
    '#onetrust-consent-sdk',
    '#onetrust-pc-sdk',
    '.onetrust-pc-dark-filter',
    '.ot-sdk-container',
    '.ot-sdk-row',
  ]) {
    for (const el of document.querySelectorAll(sel)) el.remove?.();
  }
  try {
    document.body?.classList?.remove('ot-overflow-hidden', 'ot-no-scroll');
    document.documentElement?.classList?.remove('ot-overflow-hidden', 'ot-no-scroll');
    if (document.body) document.body.style.overflow = '';
  } catch (_) {}
}

function cleanupGenericOneTrustArtifacts(host = location.hostname) {
  const removeHiddenToo = ONETRUST_AGGRESSIVE_CLEANUP_HOSTS.has(host);
  for (const sel of [
    '#onetrust-banner-sdk',
    '#onetrust-consent-sdk',
    '#onetrust-pc-sdk',
    '.onetrust-pc-dark-filter',
    '.ot-sdk-container',
    '.ot-sdk-row',
  ]) {
    for (const el of document.querySelectorAll(sel)) {
      if (removeHiddenToo || isVisible(el)) el.remove?.();
    }
  }
  try {
    document.body?.classList?.remove('ot-overflow-hidden', 'ot-no-scroll');
    document.documentElement?.classList?.remove('ot-overflow-hidden', 'ot-no-scroll');
    if (document.body) document.body.style.overflow = '';
  } catch (_) {}
}

function isVisible(el) {
  const rect = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
}

function clickFirstVisible(selectors) {
  for (const selector of selectors) {
    const el = firstVisibleElement([selector]);
    if (!el) continue;
    return dispatchSyntheticClick(el);
  }
  return false;
}

function clickFirstVisibleNative(selectors) {
  for (const selector of selectors) {
    const el = firstVisibleElement([selector]);
    if (!el) continue;
    return dispatchNativeClick(el);
  }
  return false;
}

function clickFirstVisibleWithin(root, selectors) {
  if (!root) return false;
  for (const selector of selectors) {
    const el = firstVisibleElementWithin(root, [selector]);
    if (!el) continue;
    return dispatchSyntheticClick(el);
  }
  return false;
}

function hasVisibleSelector(selectors) {
  return selectors.some((selector) => document.querySelectorAll(selector).length > 0 &&
    Array.from(document.querySelectorAll(selector)).some((el) => isVisible(el)));
}

function disableVisibleOneTrustToggles() {
  for (const toggle of visibleOneTrustToggles()) {
    if (!toggle.checked) continue;
    forceOneTrustToggleState(toggle, false);
  }
}

function enableVisibleOneTrustToggles() {
  for (const toggle of visibleOneTrustToggles()) {
    if (toggle.checked) continue;
    forceOneTrustToggleState(toggle, true);
  }
}

function visibleOneTrustToggles() {
  return Array.from(document.querySelectorAll(
    ".category-switch-handler, input[id^='ot-group-id-']"
  )).filter((el) =>
    isOneTrustToggleInteractable(el) &&
    !el.disabled &&
    el.getAttribute('aria-disabled') !== 'true'
  );
}

function isOneTrustToggleInteractable(toggle) {
  if (isVisible(toggle)) return true;
  const label = findToggleLabel(toggle);
  return Boolean(label && isVisible(label));
}

function findToggleLabel(toggle) {
  if (!toggle?.id || typeof CSS?.escape !== 'function') return null;
  return document.querySelector(`label[for="${CSS.escape(toggle.id)}"]`);
}

// Sets a checkbox to the desired state in a way that works with React controlled
// inputs — uses the native prototype setter to bypass React's property override,
// then fires change/input events so React's reconciler picks up the state change.
function forceOneTrustToggleState(toggle, checked) {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'checked'
  )?.set;
  if (nativeSetter) {
    nativeSetter.call(toggle, checked);
  } else {
    toggle.checked = checked;
  }
  toggle.dispatchEvent(new Event('change', { bubbles: true }));
  toggle.dispatchEvent(new Event('input', { bubbles: true }));
  const label = findToggleLabel(toggle);
  if (label) dispatchSyntheticClick(label);
}

async function waitForAnyVisible(selectors, timeoutMs = 3000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (selectors.some((selector) => firstVisibleElement([selector]))) return true;
    await delay(200);
  }
  return false;
}

async function waitForDismissal(cmp, actions, timeoutMs = 4000) {
  const selectors = [
    ...cmp.detectors.filter((d) => d.type === 'css_selector').map((d) => d.value),
    ...actions.filter((a) => a.type === 'click').map((a) => a.selector),
  ];

  const requiresStableHidden =
    (cmp.id === 'onetrust' && ZOOM_ONETRUST_HOSTS.has(location.hostname)) ||
    cmp.id === 'shopify';
  const stableHiddenMs =
    cmp.id === 'shopify'
      ? SHOPIFY_STABLE_HIDDEN_MS
      : requiresStableHidden
        ? 1200
        : 0;
  if (cmp.id === 'onetrust' && ZOOM_ONETRUST_HOSTS.has(location.hostname)) {
    timeoutMs += 2500;
  }
  const started = Date.now();
  let hiddenSince = null;
  while (Date.now() - started < timeoutMs) {
    const stillVisible = selectors.some((selector) => {
      return Array.from(document.querySelectorAll(selector)).some((el) => isVisible(el));
    });
    if (!stillVisible) {
      if (!requiresStableHidden) return true;
      hiddenSince ??= Date.now();
      if (Date.now() - hiddenSince >= stableHiddenMs) return true;
    } else {
      hiddenSince = null;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

function firstVisibleElement(selectors) {
  for (const selector of selectors) {
    for (const el of document.querySelectorAll(selector)) {
      if (isVisible(el)) return el;
    }
  }
  return null;
}

function firstVisibleElementWithin(root, selectors) {
  if (!root) return null;
  for (const selector of selectors) {
    for (const el of root.querySelectorAll(selector)) {
      if (isVisible(el)) return el;
    }
  }
  return null;
}

function findVisibleElementById(id, root = document) {
  const escapedId = typeof CSS?.escape === 'function' ? CSS.escape(id) : id;
  const matches = Array.from(root.querySelectorAll(`#${escapedId}`));
  const visibleMatch = matches.find((el) => isVisible(el));
  if (visibleMatch) return visibleMatch;
  if (root !== document) return null;
  return matches.at(-1) ?? null;
}

function isCMPBlockedOnHost(cmpId, host, preference) {
  if (preference === 'accept_all') return false;

  const blocked = {
    'www.repubblica.it': new Set(['iubenda']),
    'www.ft.com': new Set(['onetrust']),
  };

  return blocked[host]?.has(cmpId) ?? false;
}

function dispatchSyntheticClick(el, options = {}) {
  if (!el) return false;
  try { el.focus?.({ preventScroll: true }); } catch (_) {}
  const rect = el.getBoundingClientRect();
  const clientX = rect.left + Math.max(1, rect.width / 2);
  const clientY = rect.top + Math.max(1, rect.height / 2);
  const eventOptions = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    button: 0,
    buttons: 1,
    clientX,
    clientY,
  };
  for (const name of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
    const EventCtor = name.startsWith('pointer') && typeof PointerEvent === 'function' ? PointerEvent : MouseEvent;
    el.dispatchEvent(new EventCtor(name, eventOptions));
  }
  if (options.native !== false && typeof el.click === 'function') el.click();
  return true;
}

function dispatchNativeClick(el) {
  if (!el) return false;
  try { el.focus?.({ preventScroll: true }); } catch (_) {}
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  try {
    if (typeof el.click === 'function') {
      el.click();
      if (window.scrollX !== scrollX || window.scrollY !== scrollY) {
        window.scrollTo(scrollX, scrollY);
      }
      return true;
    }
  } catch (_) {}
  return dispatchSyntheticClick(el);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
