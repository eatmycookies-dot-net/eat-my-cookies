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
const WORDPRESSGDPR_ACTIONABLE_SURFACE_SELECTORS = [
  '.wpgdprc-consent-bar',
  '.wpgdprc-consent-modal',
  '.wpgdprc-consent-bar__settings',
  '.wpgdprc-consent-bar__button',
  '.wpgdprc-button',
];
const WORDPRESSGDPR_PREFERENCE_SURFACE_SELECTORS = [
  '.wpgdprc-consent-modal',
  '.wpgdprc-consent-modal__description',
  '.wpgdprc-button',
];
const WORDPRESSGDPR_OPEN_SELECTORS = [
  '.wpgdprc-consent-bar__settings',
];
const WORDPRESSGDPR_ACCEPT_SELECTORS = [
  '.wpgdprc-consent-bar__button',
];
const WOOCOMMERCE_STORE_NOTICE_ACTIONABLE_SURFACE_SELECTORS = [
  '.woocommerce-store-notice',
  '.woocommerce-store-notice__dismiss-link',
];
const BIGCOMMERCE_CATALYST_PLATFORM_SELECTOR = 'meta[name="platform"][content="bigcommerce.catalyst"]';
const BIGCOMMERCE_CATALYST_DIALOG_SELECTORS = [
  '[role="dialog"][aria-modal="true"]',
  '[role="dialog"]',
  'dialog[open]',
  '[aria-modal="true"]',
];
const MAGENTO_COOKIE_ACTIONABLE_SURFACE_SELECTORS = [
  '.message.global.cookie',
  '.cookie.message',
  '[data-role="cookie-settings"]',
];
const MAGENTO_COOKIE_ACCEPT_SELECTORS = [
  '.message.global.cookie .action.allow',
  '.message.global.cookie .action.accept',
  '.cookie.message .action.allow',
  '.cookie.message .action.accept',
];
const MAGENTO_COOKIE_REJECT_SELECTORS = [
  '.message.global.cookie .action.close',
  '.cookie.message .action.close',
  '[data-role="closeBtn"]',
];
const PANDECTES_ACTIONABLE_SURFACE_SELECTORS = [
  '#pandectes-banner',
  '.pd-cookie-banner-window',
  '#pd-cp-preferences',
  '.pd-cp-ui-save',
];
const PANDECTES_ACCEPT_SELECTORS = [
  '.cc-btn.cc-allow',
];
const PANDECTES_REJECT_SELECTORS = [
  '.cc-btn.cc-deny',
];
const PANDECTES_OPEN_SELECTORS = [
  '.cc-btn.cc-settings',
  'button[aria-controls="pd-cp-preferences"]',
];
const PANDECTES_PREFERENCE_SELECTORS = [
  '#pd-cp-preferences',
  '.pd-cp-purpose-row',
  '.pd-cp-ui-save',
];
const CONSENTMO_ACTIONABLE_SURFACE_SELECTORS = [
  'csm-cookie-consent',
];
const CONSENTMO_PREFERENCE_SELECTORS = [
  '.cookieconsent-preferences',
  '.cc-settings-panel',
  '#cookieconsent-settings',
  '.cc-category',
  '.cc-save-preferences',
  '.cc-btn-accept-selected',
];
const COMPLIANZ_ACTIONABLE_SURFACE_SELECTORS = [
  '#cmplz-cookiebanner-container',
  '.cmplz-cookiebanner',
  '.cmplz-view-preferences',
  '.cmplz-save-preferences',
  '#cmplz-statistics-optin',
  '#cmplz-preferences-optin',
  '#cmplz-marketing-optin',
];
const COMPLIANZ_ACCEPT_SELECTORS = [
  '.cmplz-btn.cmplz-accept',
  '.cmplz-accept',
];
const COMPLIANZ_REJECT_SELECTORS = [
  '.cmplz-btn.cmplz-deny',
  '.cmplz-deny',
];
const COMPLIANZ_OPEN_SELECTORS = [
  '.cmplz-view-preferences',
  '.cmplz-manage-options',
];
const COMPLIANZ_SAVE_SELECTORS = [
  '.cmplz-save-preferences',
];
const COMPLIANZ_PREFERENCE_SELECTORS = [
  '.cmplz-save-preferences',
  '.cmplz-categories',
  '.cmplz-category',
  '#cmplz-statistics-optin',
  '#cmplz-preferences-optin',
  '#cmplz-marketing-optin',
];
const BORLABS_ACTIONABLE_SURFACE_SELECTORS = [
  '#BorlabsCookieBox',
  '.show-cookie-box',
  '.cookie-box ._brlbs-btn-accept-all',
  '.cookie-box ._brlbs-btn-accept-only-essential',
  '.cookie-box ._brlbs-manage-btn>a',
  '.cookie-box ._brlbs-manage-btn',
  '#CookiePrefSave',
  '.brlbs-btn-save',
  '#CookieBoxSaveButton',
  '#borlabs-cookie-group-statistics',
  '#borlabs-cookie-group-marketing',
  '#borlabs-cookie-group-external-media',
  '#statistics',
  '#analytics',
  '#marketing',
  '#external-media',
];
const BORLABS_PREFERENCE_SELECTORS = [
  '#CookiePrefSave',
  '.brlbs-btn-save',
  '#CookieBoxSaveButton',
  '#borlabs-cookie-group-statistics',
  '#borlabs-cookie-group-marketing',
  '#borlabs-cookie-group-external-media',
  '#statistics',
  '#analytics',
  '#marketing',
  '#external-media',
];
const COOKIEINFORMATION_ACTIONABLE_SURFACE_SELECTORS = [
  '#coiOverlay',
  '#ccb-coiOverlay',
  '#coiSummery',
  '#coiConsentBanner',
  '#ccb-coiConsentBanner',
  '#coi-banner-wrapper',
  '#ccb-coi-banner-wrapper',
  '.coi-consent-summary',
  '.coi-banner__nextpage',
  '.summary-texts__show-details',
  '#ccb-show_details',
  '#show_details',
  '#declineButton',
  '#updateButton',
];
const COOKIEINFORMATION_CATEGORY_SELECTORS = [
  '#switch-cookie_cat_functional',
  '#switch-cookie_cat_statistic',
  '#switch-cookie_cat_marketing',
  '#cookie_cat_functional',
  '#cookie_cat_statistic',
  '#cookie_cat_marketing',
];
const COOKIEINFORMATION_PREFERENCE_SELECTORS = [
  ...COOKIEINFORMATION_CATEGORY_SELECTORS,
  '#coiConsentBanner #declineButton',
  '#ccb-coiConsentBanner #declineButton',
  '#coiOverlay #declineButton',
  '#ccb-coiOverlay #declineButton',
  '#ccb-declineButton',
  '#coiConsentBanner #updateButton',
  '#ccb-coiConsentBanner #updateButton',
  '#coiOverlay #updateButton',
  '#ccb-coiOverlay #updateButton',
  '#ccb-updateButton',
];
const COOKIEINFORMATION_OPEN_SELECTORS = [
  '.coi-banner__nextpage',
  '.summary-texts__show-details',
  '#ccb-show_details',
  '#show_details',
];
const COOKIEWOW_ACTIONABLE_SURFACE_SELECTORS = [
  '.cwc-banner-container',
  '.cwc-consent-summary-container',
  '.cwc-setting-button',
  '.cwc-save-setting-wrapper button',
];
const COOKIEWOW_ACCEPT_SELECTORS = [
  '.cwc-accept-button',
];
const COOKIEWOW_PREFERENCE_SELECTORS = [
  '.cwc-category-item',
  '.cwc-switch',
  '.cwc-save-setting-wrapper button',
];
const COOKIEYES_ACTIONABLE_SURFACE_SELECTORS = [
  '#cookie-law-info-bar',
  '.cky-consent-container',
  '.cky-banner-element',
  '.cky-btn-customize',
  'button[data-cky-tag="settings-button"]',
  '.cky-preference-center',
];
const COOKIEYES_PREFERENCE_SELECTORS = [
  '.cky-preference-center',
  '.cky-preference-header',
  '.cky-switch input[type="checkbox"]',
  'button[data-cky-tag="detail-save-button"]',
  '.cky-btn-preferences',
];
const COOKIEWOW_ANALYTICS_PATTERNS = [
  /\banalytics\b/i,
  /คุกกี้ในส่วนวิเคราะห์/i,
  /访问分析cookie/i,
  /トラフィック分析cookie/i,
];
const COOKIEWOW_MARKETING_PATTERNS = [
  /\bmarketing\b/i,
  /คุกกี้ในส่วนการตลาด/i,
  /营销cookie/i,
  /マーケティングcookie/i,
];
const COOKIECONTROLCIVIC_ACTIONABLE_SURFACE_SELECTORS = [
  '#ccc-notify .ccc-notify-button',
  '#ccc-content',
  '#ccc[open]',
  '#ccc-close',
  '#ccc-dismiss-button',
  '#ccc-recommended-settings',
];
const COOKIECONTROLCIVIC_PREFERENCE_SELECTORS = [
  '#ccc-recommended-settings',
  '#ccc-dismiss-button',
  '#ccc-end',
  '#cc-end',
  '#ccc-optional-categories .optional-cookie',
  '#iab-purposes .optional-cookie',
  '#iab-purpose .optional-cookie',
  '#iab-purpose .checkbox-toggle-input',
  '#iab-special-purpose-options .checkbox-toggle-input',
  '#ccc-optional-categories .checkbox-toggle-input',
  '#ccc-close',
  '#ccc-icon',
];
const COOKIECONTROLCIVIC_OPEN_SELECTORS = [
  '#ccc #ccc-notify .ccc-notify-button',
  '#ccc-notify .ccc-notify-button',
  '#ccc-icon',
];
const TRUENDO_ACTIONABLE_SURFACE_SELECTORS = [
  '#truendo_container div[class*="tru_cookie-dialog"]',
  '#truendo_container #tru_options_btn',
  '#truendo_container #truendo_fab',
  '#truendo_container [data-cy="tru-fab"]',
  '#truendo_container [data-cy="action-button-necessary"]',
  '#truendo_container [data-cy="action-button-all"]',
  '#truendo_container .tru_btn_ok--necessary',
  '#truendo_container .tru_btn_ok--all',
  '#truendo_container .tru_cookie-dialog_ok',
  '#truendo_container [data-cy="tru-panel"]',
  '#truendo_container [data-cy="tru-panel-close"]',
  '#truendo_container button.tru_title__close',
];
const TRUENDO_PREFERENCE_SELECTORS = [
  '#truendo_container [data-cy="tru-panel"]',
  '#truendo_container .tru-expand',
  '#truendo_container [role="switch"]',
  '#truendo_container input[type="checkbox"]',
  '#truendo_container [data-cy^="toggle "]',
  '#truendo_container [data-cy="tru-panel-close"]',
  '#truendo_container button.tru_title__close',
];
const CLICKIO_ACTIONABLE_SURFACE_SELECTORS = [
  '#cl-consent',
  '.cl-consent__inner',
  '.cl-consent__btn--outline',
  '.cl-consent-tabs__item',
  '.dm-button.cursor-pointer',
];
const CLICKIO_PREFERENCE_SELECTORS = [
  '.cl-consent-tabs__item',
  '.cl-consent-tabs__content',
  '.cl-consent__buttons--three-btns',
];
const COOKIESJSR_ACTIONABLE_SURFACE_SELECTORS = [
  '#cookiesjsr',
  '.cookiesjsr--app',
  '.cookiesjsr-settings',
  '.cookiesjsr-layer--actions .save',
];
const COOKIESJSR_PREFERENCE_SELECTORS = [
  '.cookiesjsr-service-group',
  '.cookiesjsr-service',
  '.cookiesjsr-switch',
  '.cookiesjsr-layer--actions .save',
];
const PRIVACYMANAGER_ACTIONABLE_SURFACE_SELECTORS = [
  '.notice-title',
  '#manageSettings',
  '#saveAndExit',
  '.mat-dialog-title.confirmationDialogTitle',
];
const PRIVACYMANAGER_PREFERENCE_SELECTORS = [
  'ul li',
  '#mat-slider',
  '#saveAndExit',
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

let _cmpsPromise = null;
function loadCMPs() {
  if (!_cmpsPromise) {
    _cmpsPromise = fetch(chrome.runtime.getURL('rules/cmps.json'))
      .then((r) => r.json())
      .then((data) => data.cmps);
  }
  return _cmpsPromise;
}

async function runDOMHandler(prefs) {
  const cmps = await loadCMPs();

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
    if (cmp.id === 'wordpressgdpr') {
      const wordpressResult = await executeWordPressGdprFlow(cmp, prefs);
      if (wordpressResult) {
        return { method: wordpressResult, cmpName: cmp.name };
      }
      continue;
    }
    if (cmp.id === 'bigcommercecatalyst') {
      const bigCommerceResult = await executeBigCommerceCatalystFlow(cmp, prefs);
      if (bigCommerceResult) {
        return { method: bigCommerceResult, cmpName: cmp.name };
      }
      continue;
    }
    if (cmp.id === 'magentocookie') {
      const magentoResult = await executeMagentoCookieFlow(cmp, prefs);
      if (magentoResult) {
        return { method: magentoResult, cmpName: cmp.name };
      }
      continue;
    }
    if (cmp.id === 'pandectes') {
      const pandectesResult = await executePandectesFlow(cmp, prefs);
      if (pandectesResult) {
        return { method: pandectesResult, cmpName: cmp.name };
      }
      continue;
    }
    if (cmp.id === 'consentmo') {
      const consentmoResult = await executeConsentmoFlow(cmp, prefs);
      if (consentmoResult) {
        return { method: consentmoResult, cmpName: cmp.name };
      }
      continue;
    }
    if (cmp.id === 'woocommercestorenotice' && !hasVisibleSelector(WOOCOMMERCE_STORE_NOTICE_ACTIONABLE_SURFACE_SELECTORS)) {
      continue;
    }
    if (cmp.id === 'complianz') {
      const complianzResult = await executeComplianzFlow(cmp, prefs);
      if (complianzResult) {
        return { method: complianzResult, cmpName: cmp.name };
      }
      continue;
    }
    if (cmp.id === 'borlabs') {
      const borlabsResult = await executeBorlabsFlow(cmp, prefs);
      if (borlabsResult) {
        return { method: borlabsResult, cmpName: cmp.name };
      }
      continue;
    }
    if (cmp.id === 'cookieinformation') {
      const cookieInformationResult = await executeCookieInformationFlow(cmp, prefs);
      if (cookieInformationResult) {
        return { method: cookieInformationResult, cmpName: cmp.name };
      }
      continue;
    }
    if (cmp.id === 'cookiewow') {
      const cookieWowResult = await executeCookieWowFlow(cmp, prefs);
      if (cookieWowResult) {
        return { method: cookieWowResult, cmpName: cmp.name };
      }
      continue;
    }
    if (cmp.id === 'cookieyes') {
      const cookieYesResult = await executeCookieYesFlow(cmp, prefs);
      if (cookieYesResult) {
        return { method: cookieYesResult, cmpName: cmp.name };
      }
      continue;
    }
    if (cmp.id === 'cookiecontrolcivic') {
      const cookieControlResult = await executeCookieControlCivicFlow(cmp, prefs);
      if (cookieControlResult) {
        return { method: cookieControlResult, cmpName: cmp.name };
      }
      continue;
    }
    if (cmp.id === 'truendo') {
      const truendoResult = await executeTruendoFlow(cmp, prefs);
      if (truendoResult) {
        return { method: truendoResult, cmpName: cmp.name };
      }
      continue;
    }
    if (cmp.id === 'clickio') {
      const clickioResult = await executeClickioFlow(cmp, prefs);
      if (clickioResult) {
        return { method: clickioResult, cmpName: cmp.name };
      }
      continue;
    }
    if (cmp.id === 'cookiesjsr') {
      const cookiesJsrResult = await executeCookiesJsrFlow(cmp, prefs);
      if (cookiesJsrResult) {
        return { method: cookiesJsrResult, cmpName: cmp.name };
      }
      continue;
    }
    if (cmp.id === 'privacymanager') {
      const privacyManagerResult = await executePrivacyManagerFlow(cmp, prefs);
      if (privacyManagerResult) {
        return { method: privacyManagerResult, cmpName: cmp.name };
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
  const settingsVisible = hasVisibleSelector([
    '#onetrust-consent-sdk',
    '#onetrust-pc-sdk',
    '.save-preference-btn-handler',
    '.category-switch-handler',
    "input[id^='ot-group-id-']",
  ]);
  if (!settingsVisible) {
    const opened = clickFirstVisible([
      '#onetrust-pc-btn-handler',
      '#ot-do-not-sell',
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
    '.category-switch-handler',
    "input[id^='ot-group-id-']",
    '.save-preference-btn-handler',
    '#onetrust-accept-btn-handler',
  ], 4000))) {
    return false;
  }

  if (!applyOneTrustCustomPreferences(prefs)) {
    return false;
  }

  await delay(250);

  if (!clickFirstVisible(oneTrustSaveSelectors(host))) {
    return false;
  }

  if (ZOOM_ONETRUST_HOSTS.has(host)) {
    scheduleZoomOneTrustCleanup();
  } else if (shouldForceOneTrustCleanup(host)) {
    scheduleHostOneTrustCleanup(host);
  }
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

async function executeWordPressGdprFlow(cmp, prefs) {
  if (!hasVisibleSelector(WORDPRESSGDPR_ACTIONABLE_SURFACE_SELECTORS)) {
    return false;
  }

  if (prefs.globalPreference === 'accept_all' && clickFirstVisible(WORDPRESSGDPR_ACCEPT_SELECTORS)) {
    if (await waitForDismissal(cmp, selectorActions(wordpressGdprDismissSelectors()), 5000)) {
      return 'dom:wordpressgdpr:accept_all';
    }
  }

  const preferencesVisible = hasVisibleSelector(WORDPRESSGDPR_PREFERENCE_SURFACE_SELECTORS);
  const opened = preferencesVisible || clickFirstVisible(WORDPRESSGDPR_OPEN_SELECTORS);
  if (!opened) return false;

  if (!(await waitForAnyVisible(WORDPRESSGDPR_PREFERENCE_SURFACE_SELECTORS, 4000))) {
    return false;
  }

  const flowPrefs = normalizeImportedFlowPrefs(prefs);
  const appliedResults = [
    await setWordPressGdprCategoryState(
      [/\bfunctional\b/i, /\bpreferences?\b/i, /\bpersonal(?:i|z)ation\b/i, /\bexperience\b/i],
      Boolean(flowPrefs.functional) || flowPrefs.uncategorized === 'accept',
    ),
    await setWordPressGdprCategoryState(
      [/\banalytics?\b/i, /\bstatistics?\b/i, /\bmeasurement\b/i, /\bperformance\b/i],
      Boolean(flowPrefs.analytics),
    ),
    await setWordPressGdprCategoryState(
      [/\bmarketing\b/i, /\badvertis(?:ing|ement)\b/i, /\btarget(?:ing)?\b/i, /\bsale of data\b/i],
      Boolean(flowPrefs.advertising) && flowPrefs.ccpaDoNotSell === false,
    ),
    await setWordPressGdprCategoryState(
      [/\bthird[-\s]?party\b/i, /\bexternal\b/i, /\bunclassified\b/i, /\bother\b/i, /\beyeota\b/i],
      flowPrefs.uncategorized === 'accept',
    ),
  ];
  const appliedCount = appliedResults.filter((value) => value !== null).length;
  if (appliedCount === 0 || appliedResults.includes(false)) return false;

  await delay(250);
  const saved = clickButtonByTextWithin(document, /save my settings|save settings|save/i);
  if (!saved) return false;
  if (!(await waitForDismissal(cmp, selectorActions(wordpressGdprDismissSelectors()), 5000))) return false;

  return prefs.globalPreference === 'custom' ? 'dom:wordpressgdpr:custom' : `dom:wordpressgdpr:${prefs.globalPreference}`;
}

function normalizeImportedFlowPrefs(prefs) {
  if (prefs.globalPreference === 'accept_all') {
    return {
      ...prefs,
      functional: true,
      analytics: true,
      advertising: true,
      uncategorized: 'accept',
      ccpaDoNotSell: false,
    };
  }

  if (prefs.globalPreference === 'reject_all') {
    return {
      ...prefs,
      functional: false,
      analytics: false,
      advertising: false,
      uncategorized: 'reject',
      ccpaDoNotSell: true,
    };
  }

  return prefs;
}

function wantsAdvertisingCategoryConsent(prefs) {
  return Boolean(prefs?.advertising);
}

async function executeBigCommerceCatalystFlow(cmp, prefs) {
  if (!hasBigCommerceCatalystActionableSurface()) {
    return false;
  }

  const payload = buildBigCommerceCatalystConsentPayload(prefs);
  const persisted = await persistBigCommerceCatalystConsent(payload);
  if (!persisted) return false;

  if (await waitForBigCommerceCatalystDismissal(1200)) {
    return bigCommerceCatalystMethodForPrefs(prefs);
  }

  if (prefs.globalPreference === 'accept_all') {
    clickBigCommerceCatalystDirectAction('accept');
  } else if (prefs.globalPreference === 'reject_all') {
    clickBigCommerceCatalystDirectAction('reject');
  }

  await delay(350);
  if (!(await waitForBigCommerceCatalystDismissal(1200))) {
    cleanupBigCommerceCatalystConsentSurface();
  }

  return bigCommerceCatalystMethodForPrefs(prefs);
}

async function executeComplianzFlow(cmp, prefs) {
  if (!hasVisibleSelector(COMPLIANZ_ACTIONABLE_SURFACE_SELECTORS)) {
    return false;
  }

  if (prefs.globalPreference === 'accept_all' && (
    clickFirstVisible(COMPLIANZ_ACCEPT_SELECTORS) ||
    clickButtonByTextWithin(document, /^(?:accept|accept all)$/i)
  )) {
    if (await waitForDismissal(cmp, selectorActions(complianzDismissSelectors()), 6000)) {
      return 'dom:complianz:accept_all';
    }
  }

  if (prefs.globalPreference === 'reject_all' && (
    clickFirstVisible(COMPLIANZ_REJECT_SELECTORS) ||
    clickButtonByTextWithin(document, /^(?:deny|reject all|reject|decline)$/i)
  )) {
    if (await waitForDismissal(cmp, selectorActions(complianzDismissSelectors()), 6000)) {
      return 'dom:complianz:reject_all';
    }
  }

  const flowPrefs = normalizeImportedFlowPrefs(prefs);
  const preferencesVisible = hasVisibleSelector(COMPLIANZ_PREFERENCE_SELECTORS);
  const opened = preferencesVisible ||
    clickFirstVisibleNative(COMPLIANZ_OPEN_SELECTORS) ||
    clickFirstVisible(COMPLIANZ_OPEN_SELECTORS) ||
    clickButtonByTextWithin(document, /view preferences|manage consent|preferences/i);
  if (!opened) return false;
  if (!(await waitForAnyVisible(COMPLIANZ_PREFERENCE_SELECTORS, 4000))) return false;

  const desiredFunctional = Boolean(flowPrefs.functional) || flowPrefs.uncategorized === 'accept';
  const desiredAnalytics = Boolean(flowPrefs.analytics);
  const desiredMarketing = Boolean(flowPrefs.advertising) && flowPrefs.ccpaDoNotSell === false;

  const appliedFunctional = await setComplianzCategoryState(
    'cmplz-preferences-optin',
    [/\bfunctional(?:ity)?\b/i, /\bpreferences?\b/i],
    desiredFunctional,
  );
  const appliedAnalytics = await setComplianzCategoryState(
    'cmplz-statistics-optin',
    [/\bstatistics?\b/i, /\banalytics?\b/i, /\bmeasurement\b/i],
    desiredAnalytics,
  );
  const appliedMarketing = await setComplianzCategoryState(
    'cmplz-marketing-optin',
    [/\bmarketing\b/i, /\badvertis(?:ing|ement)\b/i, /\btarget(?:ing)?\b/i],
    desiredMarketing,
  );
  const appliedResults = [appliedFunctional, appliedAnalytics, appliedMarketing];
  const appliedCount = appliedResults.filter((value) => value !== null).length;
  if (appliedCount === 0 || appliedResults.includes(false)) return false;

  await delay(250);
  if (!(clickFirstVisibleNative(COMPLIANZ_SAVE_SELECTORS) ||
        clickFirstVisible(COMPLIANZ_SAVE_SELECTORS) ||
        clickButtonByTextWithin(document, /save preferences|save/i))) {
    return false;
  }
  if (!(await waitForDismissal(cmp, selectorActions(complianzDismissSelectors()), 6000))) return false;

  return prefs.globalPreference === 'custom' ? 'dom:complianz:custom' : `dom:complianz:${prefs.globalPreference}`;
}

async function executeBorlabsFlow(cmp, prefs) {
  if (!hasVisibleSelector(BORLABS_ACTIONABLE_SURFACE_SELECTORS)) {
    return false;
  }

  if (prefs.globalPreference === 'accept_all' &&
      (clickFirstVisibleNative(['.cookie-box ._brlbs-btn-accept-all']) ||
       clickFirstVisible(['.cookie-box ._brlbs-btn-accept-all']))) {
    if (await waitForDismissal(cmp, selectorActions(borlabsDismissSelectors()), 5000)) {
      return 'dom:borlabs:accept_all';
    }
  }

  if (prefs.globalPreference === 'reject_all' &&
      (clickFirstVisibleNative(['.cookie-box ._brlbs-btn-accept-only-essential']) ||
       clickFirstVisible(['.cookie-box ._brlbs-btn-accept-only-essential']))) {
    if (await waitForDismissal(cmp, selectorActions(borlabsDismissSelectors()), 5000)) {
      return 'dom:borlabs:reject_all';
    }
  }

  const flowPrefs = normalizeImportedFlowPrefs(prefs);
  const preferencesVisible = hasVisibleSelector(BORLABS_PREFERENCE_SELECTORS);
  const opened = preferencesVisible ||
    clickFirstVisibleNative(['.cookie-box ._brlbs-manage-btn>a', '.cookie-box ._brlbs-manage-btn']) ||
    clickFirstVisible(['.cookie-box ._brlbs-manage-btn>a', '.cookie-box ._brlbs-manage-btn']);
  if (!opened) return false;
  if (!(await waitForAnyVisible(BORLABS_PREFERENCE_SELECTORS, 4000))) return false;

  const appliedAnalytics = await setCheckboxStateWithinContainerIds(
    ['borlabs-cookie-group-statistics', 'statistics', 'analytics'],
    Boolean(flowPrefs.analytics),
  );
  const appliedMarketing = await setCheckboxStateWithinContainerIds(
    ['borlabs-cookie-group-marketing', 'marketing'],
    wantsAdvertisingCategoryConsent(flowPrefs),
  );
  const appliedExternalMedia = await setCheckboxStateWithinContainerIds(
    ['borlabs-cookie-group-external-media', 'external-media'],
    Boolean(flowPrefs.functional) || flowPrefs.uncategorized === 'accept',
  );
  const appliedResults = [appliedAnalytics, appliedMarketing, appliedExternalMedia];
  const appliedCount = appliedResults.filter((value) => value !== null).length;
  if (appliedCount === 0 || appliedResults.includes(false)) return false;

  await delay(250);
  if (!(clickFirstVisibleNative(['#CookiePrefSave', '.brlbs-btn-save', '#CookieBoxSaveButton']) ||
        clickFirstVisible(['#CookiePrefSave', '.brlbs-btn-save', '#CookieBoxSaveButton']))) return false;
  syncBorlabsGoogleConsentCookie(flowPrefs);
  if (!(await waitForDismissal(cmp, selectorActions(borlabsDismissSelectors()), 5000))) return false;

  return prefs.globalPreference === 'custom' ? 'dom:borlabs:custom' : `dom:borlabs:${prefs.globalPreference}`;
}

async function executeCookieInformationFlow(cmp, prefs) {
  if (!hasVisibleSelector(COOKIEINFORMATION_ACTIONABLE_SURFACE_SELECTORS)) {
    return false;
  }

  if (prefs.globalPreference === 'accept_all' && clickFirstVisible([
    '#coiOverlay button.coi-banner__accept',
    '#ccb-coiOverlay button.coi-banner__accept',
    '#coiConsentBanner .bottom-bar__update-consent',
    '#ccb-coiConsentBanner .bottom-bar__update-consent',
    '#ccb-updateButton',
    '#coiConsentBanner #updateButton',
    '#coiOverlay #updateButton',
    '#updateButton',
  ])) {
    if (await waitForDismissal(cmp, selectorActions(cookieInformationDismissSelectors()), 5000)) {
      return 'dom:cookieinformation:accept_all';
    }
  }

  if (prefs.globalPreference === 'reject_all' && clickFirstVisible([
    '#ccb-coiConsentBanner #ccb-declineButton',
    '#ccb-coiOverlay #ccb-declineButton',
    '#ccb-declineButton',
    '#coiConsentBanner #declineButton',
    '#coiOverlay #declineButton',
    '#declineButton',
  ])) {
    if (await waitForDismissal(cmp, selectorActions(cookieInformationDismissSelectors()), 5000)) {
      return 'dom:cookieinformation:reject_all';
    }
  }

  const flowPrefs = normalizeImportedFlowPrefs(prefs);
  const preferencesVisible = hasVisibleSelector(COOKIEINFORMATION_CATEGORY_SELECTORS);
  const opened = preferencesVisible || clickFirstVisible(COOKIEINFORMATION_OPEN_SELECTORS);
  if (!opened) return false;
  if (!(await waitForAnyVisible(COOKIEINFORMATION_CATEGORY_SELECTORS, 4000))) return false;

  const appliedFunctional = await setCheckboxStateWithinContainerIds(
    ['switch-cookie_cat_functional', 'cookie_cat_functional'],
    Boolean(flowPrefs.functional) || flowPrefs.uncategorized === 'accept',
  );
  const appliedAnalytics = await setCheckboxStateWithinContainerIds(
    ['switch-cookie_cat_statistic', 'cookie_cat_statistic'],
    Boolean(flowPrefs.analytics),
  );
  const appliedMarketing = await setCheckboxStateWithinContainerIds(
    ['switch-cookie_cat_marketing', 'cookie_cat_marketing'],
    wantsAdvertisingCategoryConsent(flowPrefs),
  );
  const appliedResults = [appliedFunctional, appliedAnalytics, appliedMarketing];
  const appliedCount = appliedResults.filter((value) => value !== null).length;
  if (appliedCount === 0 || appliedResults.includes(false)) return false;

  await delay(250);
  if (!clickFirstVisible([
    '#ccb-coiConsentBanner #ccb-updateButton',
    '#ccb-coiOverlay #ccb-updateButton',
    '#ccb-updateButton',
    '#coiConsentBanner #updateButton',
    '#coiOverlay #updateButton',
    '#updateButton',
    '#ccb-coiConsentBanner #ccb-declineButton',
    '#ccb-coiOverlay #ccb-declineButton',
    '#ccb-declineButton',
    '#coiConsentBanner #declineButton',
    '#coiOverlay #declineButton',
    '#declineButton',
  ])) {
    return false;
  }
  if (!(await waitForDismissal(cmp, selectorActions(cookieInformationDismissSelectors()), 5000))) return false;

  return prefs.globalPreference === 'custom' ? 'dom:cookieinformation:custom' : `dom:cookieinformation:${prefs.globalPreference}`;
}

async function executeCookieWowFlow(cmp, prefs) {
  if (!hasVisibleSelector(COOKIEWOW_ACTIONABLE_SURFACE_SELECTORS)) {
    return false;
  }

  if (prefs.globalPreference === 'accept_all' && clickFirstVisible(COOKIEWOW_ACCEPT_SELECTORS)) {
    if (await waitForDismissal(cmp, selectorActions(cookieWowDismissSelectors()), 5000)) {
      return 'dom:cookiewow:accept_all';
    }
  }

  const flowPrefs = normalizeImportedFlowPrefs(prefs);
  const preferencesVisible = hasVisibleSelector(COOKIEWOW_PREFERENCE_SELECTORS);
  const opened = preferencesVisible || clickFirstVisible(['.cwc-setting-button']);
  if (!opened) return false;
  if (!(await waitForAnyVisible(COOKIEWOW_PREFERENCE_SELECTORS, 4000))) return false;

  const appliedAnalytics = await setCookieWowCategoryState(COOKIEWOW_ANALYTICS_PATTERNS, Boolean(flowPrefs.analytics));
  const appliedMarketing = await setCookieWowCategoryState(
    COOKIEWOW_MARKETING_PATTERNS,
    Boolean(flowPrefs.advertising) && flowPrefs.ccpaDoNotSell === false,
  );
  const appliedResults = [appliedAnalytics, appliedMarketing];
  const appliedCount = appliedResults.filter((value) => value !== null).length;
  if (appliedCount === 0 || appliedResults.includes(false)) return false;

  await delay(250);
  if (!clickFirstVisible(['.cwc-save-setting-wrapper button'])) return false;
  if (!(await waitForDismissal(cmp, selectorActions(cookieWowDismissSelectors()), 5000))) return false;

  return prefs.globalPreference === 'custom' ? 'dom:cookiewow:custom' : `dom:cookiewow:${prefs.globalPreference}`;
}

async function executeCookieYesFlow(cmp, prefs) {
  if (!hasVisibleSelector(COOKIEYES_ACTIONABLE_SURFACE_SELECTORS)) {
    return false;
  }

  if (prefs.globalPreference === 'accept_all' &&
      (clickFirstVisibleNative(['.cky-btn-accept', '#cookie_action_close_header']) ||
       clickFirstVisible(['.cky-btn-accept', '#cookie_action_close_header']))) {
    if (await waitForDismissal(cmp, selectorActions(cookieYesDismissSelectors()), 5000)) {
      return 'dom:cookieyes:accept_all';
    }
  }

  if (prefs.globalPreference === 'reject_all' &&
      (clickFirstVisibleNative(['.cky-btn-reject', '#cookie_action_close_header_reject']) ||
       clickFirstVisible(['.cky-btn-reject', '#cookie_action_close_header_reject']))) {
    if (await waitForDismissal(cmp, selectorActions(cookieYesDismissSelectors()), 5000)) {
      return 'dom:cookieyes:reject_all';
    }
  }

  const flowPrefs = normalizeImportedFlowPrefs(prefs);
  const preferencesVisible = hasVisibleSelector(COOKIEYES_PREFERENCE_SELECTORS);
  const opened = preferencesVisible ||
    clickFirstVisibleNative([
      '.cky-btn-customize',
      'button[data-cky-tag="settings-button"]',
      '#cky-btn-customize',
    ]) ||
    clickFirstVisible([
      '.cky-btn-customize',
      'button[data-cky-tag="settings-button"]',
      '#cky-btn-customize',
    ]);
  if (!opened) return false;
  if (!(await waitForAnyVisible(COOKIEYES_PREFERENCE_SELECTORS, 4000))) return false;

  const desiredFunctional = Boolean(flowPrefs.functional) || flowPrefs.uncategorized === 'accept';
  const desiredAnalytics = Boolean(flowPrefs.analytics);
  const desiredPerformance = Boolean(flowPrefs.analytics);
  const desiredAdvertising = wantsAdvertisingCategoryConsent(flowPrefs);
  const desiredOther = flowPrefs.uncategorized === 'accept';

  const appliedFunctional = await setCheckboxStateById('ckySwitchfunctional', desiredFunctional);
  const appliedAnalytics = await setCheckboxStateById('ckySwitchanalytics', desiredAnalytics);
  const appliedPerformance = await setCheckboxStateById('ckySwitchperformance', desiredPerformance);
  const appliedAdvertising = await setCheckboxStateById('ckySwitchadvertisement', desiredAdvertising);
  const appliedOther = await setCheckboxStateById('ckySwitchother', desiredOther);
  const appliedResults = [appliedFunctional, appliedAnalytics, appliedPerformance, appliedAdvertising, appliedOther];
  const appliedCount = appliedResults.filter((value) => value !== null).length;
  if (appliedCount === 0 || appliedResults.includes(false)) return false;

  await delay(250);
  const saved = clickFirstVisibleNative([
    'button[data-cky-tag="detail-save-button"]',
    '.cky-btn-preferences',
    '.cky-btn-accept',
  ]) || clickFirstVisible([
    'button[data-cky-tag="detail-save-button"]',
    '.cky-btn-preferences',
    '.cky-btn-accept',
  ]);
  if (!saved) return false;
  if (!(await waitForDismissal(cmp, selectorActions(cookieYesDismissSelectors()), 5000))) return false;

  return prefs.globalPreference === 'custom' ? 'dom:cookieyes:custom' : `dom:cookieyes:${prefs.globalPreference}`;
}

async function executeCookieControlCivicFlow(cmp, prefs) {
  if (!hasVisibleSelector(COOKIECONTROLCIVIC_ACTIONABLE_SURFACE_SELECTORS)) {
    return false;
  }

  const flowPrefs = normalizeImportedFlowPrefs(prefs);
  const closeBannerIfPresent = async () => {
    const closed = clickFirstVisibleNative(['#ccc-close']) ||
      clickFirstVisible(['#ccc-close']);
    if (!closed) return false;
    return waitForDismissal(cmp, selectorActions(cookieControlCivicDismissSelectors()), 5000);
  };

  if (prefs.globalPreference === 'accept_all' &&
      (clickFirstVisibleNative(['#ccc-recommended-settings']) ||
       clickButtonByTextWithinNative(document, /^(?:i accept|accept all)$/i) ||
       clickButtonByTextWithin(document, /^(?:i accept|accept all)$/i))) {
    if ((await waitForDismissal(cmp, selectorActions(cookieControlCivicDismissSelectors()), 3000)) || await closeBannerIfPresent()) {
      return 'dom:cookiecontrolcivic:accept_all';
    }
  }
  if (prefs.globalPreference === 'reject_all' &&
      (clickButtonByTextWithinNative(document, /^(?:i do not accept|reject all|decline all)$/i) ||
       clickButtonByTextWithin(document, /^(?:i do not accept|reject all|decline all)$/i))) {
    if ((await waitForDismissal(cmp, selectorActions(cookieControlCivicDismissSelectors()), 3000)) || await closeBannerIfPresent()) {
      return 'dom:cookiecontrolcivic:reject_all';
    }
  }
  const preferencesVisible = hasVisibleSelector(COOKIECONTROLCIVIC_PREFERENCE_SELECTORS);
  const opened = preferencesVisible ||
    openCookieControlCivicPreferenceCenter() ||
    clickButtonByTextWithinNative(document, /(?:cookie preferences|settings)/i) ||
    clickButtonByTextWithin(document, /(?:cookie preferences|settings)/i) ||
    clickFirstVisible(COOKIECONTROLCIVIC_OPEN_SELECTORS);
  if (!opened) return false;
  if (!(await waitForAnyVisible(COOKIECONTROLCIVIC_PREFERENCE_SELECTORS, 4000))) return false;

  const desiredFunctional = Boolean(flowPrefs.functional) || flowPrefs.uncategorized === 'accept';
  const desiredAnalytics = Boolean(flowPrefs.analytics);
  const desiredAdvertising = wantsAdvertisingCategoryConsent(flowPrefs);
  const appliedAnalytics = await setCheckboxStateInVisibleSection(
    '#ccc-optional-categories .optional-cookie, #iab-purposes .optional-cookie, #iab-purpose .optional-cookie',
    '.optional-cookie-header',
    [/\banalytical cookies\b/i, /\bmeasurement cookies\b/i, /\bstatistics\b/i],
    desiredAnalytics,
  );
  const appliedMarketing = await setCheckboxStateInVisibleSection(
    '#ccc-optional-categories .optional-cookie, #iab-purposes .optional-cookie, #iab-purpose .optional-cookie',
    '.optional-cookie-header',
    [/\bmarketing cookies\b/i, /\badvertising\b/i, /\btargeting\b/i],
    desiredAdvertising,
  );
  const appliedSocial = await setCheckboxStateInVisibleSection(
    '#ccc-optional-categories .optional-cookie, #iab-purposes .optional-cookie, #iab-purpose .optional-cookie',
    '.optional-cookie-header',
    [/\bsocial sharing cookies\b/i, /\bsocial media\b/i],
    desiredFunctional,
  );
  const appliedFunctional = await setCheckboxStateInVisibleSection(
    '#ccc-optional-categories .optional-cookie, #iab-purposes .optional-cookie, #iab-purpose .optional-cookie',
    '.optional-cookie-header',
    [/\bfunctionality cookies\b/i, /\bpersonalisation cookies\b/i, /\bpreferences\b/i],
    desiredFunctional,
  );
  const appliedOptionalInputs = await setCookieControlCivicOptionalInputs({
    functional: desiredFunctional,
    analytics: desiredAnalytics,
    advertising: desiredAdvertising,
    uncategorized: flowPrefs.uncategorized,
  });
  const appliedIabInputs = await setCookieControlCivicIabPurposeStates({
    functional: desiredFunctional,
    analytics: desiredAnalytics,
    advertising: desiredAdvertising,
  });

  const appliedResults = [appliedAnalytics, appliedMarketing, appliedSocial, appliedFunctional, appliedOptionalInputs, appliedIabInputs];
  const appliedCount = appliedResults.filter((value) => value !== null).length;
  if (appliedCount === 0 || appliedResults.includes(false)) return false;

  await delay(250);
  if (!(clickFirstVisibleNative(['#ccc-dismiss-button', '#ccc-close']) ||
        clickFirstVisible(['#ccc-dismiss-button', '#ccc-close']))) return false;
  if (!(await waitForDismissal(cmp, selectorActions(cookieControlCivicDismissSelectors()), 5000))) return false;

  return prefs.globalPreference === 'custom' ? 'dom:cookiecontrolcivic:custom' : `dom:cookiecontrolcivic:${prefs.globalPreference}`;
}

async function executeMagentoCookieFlow(cmp, prefs) {
  if (!hasVisibleSelector(MAGENTO_COOKIE_ACTIONABLE_SURFACE_SELECTORS)) {
    return false;
  }

  if (prefs.globalPreference === 'accept_all' &&
      (clickFirstVisible(MAGENTO_COOKIE_ACCEPT_SELECTORS) ||
       clickButtonByTextWithin(document, /^(?:accept|allow|ok|got it)$/i))) {
    if (await waitForDismissal(cmp, selectorActions(magentoCookieDismissSelectors()), 5000)) {
      return 'dom:magentocookie:accept_all';
    }
  }

  if (prefs.globalPreference !== 'accept_all' &&
      (clickFirstVisible(MAGENTO_COOKIE_REJECT_SELECTORS) ||
       clickButtonByTextWithin(document, /(?:reject|decline|dismiss|close|only necessary|essential only)/i))) {
    if (await waitForDismissal(cmp, selectorActions(magentoCookieDismissSelectors()), 5000)) {
      return 'dom:magentocookie:reject_all';
    }
  }

  return false;
}

async function executePandectesFlow(cmp, prefs) {
  if (!hasVisibleSelector(PANDECTES_ACTIONABLE_SURFACE_SELECTORS)) {
    return false;
  }

  if (prefs.globalPreference === 'accept_all' &&
      (clickFirstVisible(PANDECTES_ACCEPT_SELECTORS) ||
       clickButtonByTextWithin(document, /^(?:accept|accept all)$/i))) {
    if (await waitForDismissal(cmp, selectorActions(pandectesDismissSelectors()), 5000)) {
      return 'dom:pandectes:accept_all';
    }
  }

  if (prefs.globalPreference === 'reject_all' &&
      (clickFirstVisible(PANDECTES_REJECT_SELECTORS) ||
       clickButtonByTextWithin(document, /^(?:decline|reject all|reject|essential only)$/i))) {
    if (await waitForDismissal(cmp, selectorActions(pandectesDismissSelectors()), 5000)) {
      return 'dom:pandectes:reject_all';
    }
  }

  const flowPrefs = normalizeImportedFlowPrefs(prefs);
  const preferencesVisible = hasVisibleSelector(PANDECTES_PREFERENCE_SELECTORS);
  const opened = preferencesVisible ||
    clickFirstVisible(PANDECTES_OPEN_SELECTORS) ||
    clickButtonByTextWithin(document, /(?:preferences|settings|manage)/i);
  if (!opened) return false;
  if (!(await waitForAnyVisible(PANDECTES_PREFERENCE_SELECTORS, 4000))) return false;

  const appliedFunctional = await setCheckboxStateInVisibleSection(
    '.pd-cp-purpose-row',
    '.pd-cp-purpose-info, .pd-cp-bold-messaging, [class*="purpose-info"], [class*="purpose-title"]',
    [/\bfunctional(?:ity)?\b/i, /\bpreferences?\b/i, /\bpersonal(?:i|z)ation\b/i],
    Boolean(flowPrefs.functional) || flowPrefs.uncategorized === 'accept',
  );
  const appliedAnalytics = await setCheckboxStateInVisibleSection(
    '.pd-cp-purpose-row',
    '.pd-cp-purpose-info, .pd-cp-bold-messaging, [class*="purpose-info"], [class*="purpose-title"]',
    [/\bperformance\b/i, /\banalytics?\b/i, /\bstatistics?\b/i, /\bmeasurement\b/i],
    Boolean(flowPrefs.analytics),
  );
  const appliedMarketing = await setCheckboxStateInVisibleSection(
    '.pd-cp-purpose-row',
    '.pd-cp-purpose-info, .pd-cp-bold-messaging, [class*="purpose-info"], [class*="purpose-title"]',
    [/\btarget(?:ing)?\b/i, /\bmarketing\b/i, /\badvertis(?:ing|ement)\b/i],
    Boolean(flowPrefs.advertising) && flowPrefs.ccpaDoNotSell === false,
  );
  const appliedResults = [appliedFunctional, appliedAnalytics, appliedMarketing];
  const appliedCount = appliedResults.filter((value) => value !== null).length;
  if (appliedCount === 0 || appliedResults.includes(false)) return false;

  await delay(250);
  const saved = clickFirstVisible(['.pd-cp-ui-save']) ||
    clickButtonByTextWithin(document, /save preferences|save/i);
  if (!saved) return false;
  if (!(await waitForDismissal(cmp, selectorActions(pandectesDismissSelectors()), 5000))) return false;

  return platformCustomMethodForPrefs('pandectes', prefs);
}

async function executeConsentmoFlow(cmp, prefs) {
  const host = findConsentmoHost();
  const root = consentmoShadowRoot(host);
  if (!host || !root) return false;

  if (prefs.globalPreference === 'accept_all' &&
      (clickButtonByTextWithinNative(root, /^(?:accept all|allow all|accept)$/i) ||
       clickButtonByTextWithin(root, /^(?:accept all|allow all|accept)$/i))) {
    if (await waitForConsentmoDismissal(host, root, 5000)) {
      return 'dom:consentmo:accept_all';
    }
  }

  if (prefs.globalPreference === 'reject_all' &&
      (clickButtonByTextWithinNative(root, /^(?:reject all|decline all|decline|essential only)$/i) ||
       clickButtonByTextWithin(root, /^(?:reject all|decline all|decline|essential only)$/i))) {
    if (await waitForConsentmoDismissal(host, root, 5000)) {
      return 'dom:consentmo:reject_all';
    }
  }

  const flowPrefs = normalizeImportedFlowPrefs(prefs);
  const preferencesVisible = hasVisibleSelectorWithin(root, CONSENTMO_PREFERENCE_SELECTORS);
  const opened = preferencesVisible ||
    clickButtonByTextWithinNative(root, /(?:preferences|settings|manage)/i) ||
    clickButtonByTextWithin(root, /(?:preferences|settings|manage)/i);
  if (!opened) return false;
  if (!(await waitForAnyVisibleWithin(root, CONSENTMO_PREFERENCE_SELECTORS, 4000))) return false;

  const consentmoSectionSelector = [
    '.cc-category',
    '.cookie-category',
    '[data-consent-category]',
    '.cc-checkbox-container',
    '.isense-cc-checkbox-container',
  ].join(', ');
  const consentmoTitleSelector = [
    '.cc-category-title',
    '.cookie-category-title',
    '.cc-category-label',
    '[class*="category-title"]',
    'label',
    'p',
  ].join(', ');

  const appliedFunctional = await setConsentmoCategoryState(
    root,
    consentmoSectionSelector,
    consentmoTitleSelector,
    [/\bfunctional(?:ity)?\b/i, /\bpreferences?\b/i, /\bpersonal(?:i|z)ation\b/i],
    Boolean(flowPrefs.functional) || flowPrefs.uncategorized === 'accept',
    ['functionality-cookie-category-text'],
  );
  const appliedAnalytics = await setConsentmoCategoryState(
    root,
    consentmoSectionSelector,
    consentmoTitleSelector,
    [/\banalytics?\b/i, /\bperformance\b/i, /\bstatistics?\b/i, /\bmeasurement\b/i],
    Boolean(flowPrefs.analytics),
    ['analytics-cookie-category-text'],
  );
  const appliedMarketing = await setConsentmoCategoryState(
    root,
    consentmoSectionSelector,
    consentmoTitleSelector,
    [/\bmarketing\b/i, /\badvertis(?:ing|ement)\b/i, /\btarget(?:ing)?\b/i],
    Boolean(flowPrefs.advertising) && flowPrefs.ccpaDoNotSell === false,
    ['marketing-cookie-category-text'],
  );
  const appliedResults = [appliedFunctional, appliedAnalytics, appliedMarketing];
  const appliedCount = appliedResults.filter((value) => value !== null).length;
  if (appliedCount === 0 || appliedResults.includes(false)) return false;

  await delay(250);
  const saved = clickFirstVisibleWithinNative(root, [
    '.cc-btn-accept-selected',
    '.cc-save-preferences',
    '.cc-submit-consent',
    'button[aria-label="Save my choice"]',
    'button[aria-label*="Save my choice" i]',
    'button[aria-label*="Save preferences" i]',
  ]) || clickFirstVisibleWithin(root, [
    '.cc-btn-accept-selected',
    '.cc-save-preferences',
    '.cc-submit-consent',
    'button[aria-label="Save my choice"]',
    'button[aria-label*="Save my choice" i]',
    'button[aria-label*="Save preferences" i]',
  ]) || clickButtonByTextWithinNative(root, /save my choice|save preferences|save/i) ||
    clickButtonByTextWithin(root, /save my choice|save preferences|save/i);
  if (!saved) return false;
  if (!(await waitForConsentmoDismissal(host, root, 5000))) return false;

  return platformCustomMethodForPrefs('consentmo', prefs);
}

async function executeTruendoFlow(cmp, prefs) {
  if (!hasVisibleSelector(TRUENDO_ACTIONABLE_SURFACE_SELECTORS)) {
    return false;
  }

  const apiResult = await executeTruendoApiFlow(prefs);
  if (apiResult) return apiResult;

  if (prefs.globalPreference === 'accept_all' &&
      (clickFirstVisibleNative([
        '#truendo_container [data-cy="action-button-all"]',
        '#truendo_container [data-cy="banner-ack-btn"]',
        '#truendo_container .tru_btn_ok--all',
        '#truendo_container .tru_cookie-dialog_ok',
      ]) ||
       clickFirstVisible([
         '#truendo_container [data-cy="action-button-all"]',
         '#truendo_container [data-cy="banner-ack-btn"]',
         '#truendo_container .tru_btn_ok--all',
         '#truendo_container .tru_cookie-dialog_ok',
       ]))) {
    if (await waitForTruendoTransientSurfacesToClose(5000)) {
      return 'dom:truendo:accept_all';
    }
  }

  if (prefs.globalPreference === 'reject_all' &&
      (clickFirstVisibleNative([
        '#truendo_container [data-cy="action-button-necessary"]',
        '#truendo_container .tru_btn_ok--necessary',
      ]) ||
       clickFirstVisible([
         '#truendo_container [data-cy="action-button-necessary"]',
         '#truendo_container .tru_btn_ok--necessary',
       ]))) {
    if (await waitForTruendoTransientSurfacesToClose(5000)) {
      return 'dom:truendo:reject_all';
    }
  }

  const flowPrefs = normalizeImportedFlowPrefs(prefs);
  const preferencesVisible = hasVisibleSelector(TRUENDO_PREFERENCE_SELECTORS);
  const opened = preferencesVisible ||
    clickFirstVisibleNative([
      '#truendo_container #tru_options_btn',
      '#truendo_container #truendo_fab',
      '#truendo_container [data-cy="tru-fab"]',
      '#truendo_container [data-cy="cookie settings"]',
      '#truendo_container .tru_pay_button',
    ]) ||
    clickFirstVisible([
      '#truendo_container #tru_options_btn',
      '#truendo_container #truendo_fab',
      '#truendo_container [data-cy="tru-fab"]',
      '#truendo_container [data-cy="cookie settings"]',
      '#truendo_container .tru_pay_button',
    ]) ||
    clickButtonByTextWithinNative(document.querySelector('#truendo_container') ?? document, /cookie settings|options|opciones|optionen/i) ||
    clickButtonByTextWithin(document.querySelector('#truendo_container') ?? document, /cookie settings|options|opciones|optionen/i);
  if (!opened) return false;
  if (!(await waitForAnyVisible(TRUENDO_PREFERENCE_SELECTORS, 4000))) return false;

  const desiredFunctional = Boolean(flowPrefs.functional) || flowPrefs.uncategorized === 'accept';
  const desiredAnalytics = Boolean(flowPrefs.analytics);
  const desiredAdvertising = wantsAdvertisingCategoryConsent(flowPrefs);
  const desiredUncategorized = flowPrefs.uncategorized === 'accept';
  const baselineReject = clickFirstVisibleNative([
    '#truendo_container [data-cy="action-button-necessary"]',
    '#truendo_container .tru_btn_ok--necessary',
  ]) || clickFirstVisible([
    '#truendo_container [data-cy="action-button-necessary"]',
    '#truendo_container .tru_btn_ok--necessary',
  ]);
  if (baselineReject) {
    await waitForAnyVisible(TRUENDO_PREFERENCE_SELECTORS, 3000);
    await delay(250);
  }

  const appliedFunctional = await setTruendoToggleState([
    /\bfunctional\b/i,
    /\bpreferences?\b/i,
    /\bpersonal(?:i|z)ation\b/i,
    /\bsocial content\b/i,
    /\bsocial sharing\b/i,
    /\bsocial media\b/i,
  ], desiredFunctional);
  const appliedAnalytics = await setTruendoToggleState([
    /\banalytics?\b/i,
    /\bstatistics?\b/i,
    /\bmeasurement\b/i,
    /\bperformance\b/i,
  ], desiredAnalytics);
  const appliedMarketing = await setTruendoToggleState([
    /\bmarketing\b/i,
    /\badvertis(?:ing|ement)\b/i,
    /\btarget(?:ing)?\b/i,
  ], desiredAdvertising);
  const appliedSocialContent = await setCheckboxStateByDataCy('toggle social_content', desiredFunctional);
  const appliedStatistics = await setCheckboxStateByDataCy('toggle statistics', desiredAnalytics);
  const appliedResults = [appliedFunctional, appliedAnalytics, appliedMarketing, appliedSocialContent, appliedStatistics];
  const appliedCount = appliedResults.filter((value) => value !== null).length;
  if (appliedCount === 0 || appliedResults.includes(false)) {
    if (!baselineReject || desiredFunctional || desiredAnalytics || desiredAdvertising || desiredUncategorized) return false;
  }

  await delay(250);
  if (!(clickFirstVisibleNative([
    '#truendo_container [data-cy="tru-panel-close"]',
    '#truendo_container button.tru_title__close',
  ]) ||
        clickFirstVisible([
          '#truendo_container [data-cy="tru-panel-close"]',
          '#truendo_container button.tru_title__close',
        ]))) return false;
  if (!(await waitForTruendoTransientSurfacesToClose(5000))) return false;

  return prefs.globalPreference === 'custom' ? 'dom:truendo:custom' : `dom:truendo:${prefs.globalPreference}`;
}

async function executeTruendoApiFlow(prefs) {
  const truendo = window.Truendo;
  if (!truendo || typeof truendo !== 'object') return false;

  const flowPrefs = normalizeImportedFlowPrefs(prefs);
  const desiredState = buildTruendoDesiredState(flowPrefs);

  if (prefs.globalPreference === 'accept_all' && typeof truendo.acceptAllCookies === 'function') {
    try { truendo.acceptAllCookies(); } catch (_) {}
    syncTruendoConsentCookie(desiredState);
    if (await waitForTruendoConsentState(desiredState, 2500) &&
        await waitForTruendoTransientSurfacesToClose(5000)) {
      return 'dom:truendo:accept_all';
    }
  }

  if (prefs.globalPreference === 'reject_all' && typeof truendo.acceptNecessaryCookiesOnly === 'function') {
    try { truendo.acceptNecessaryCookiesOnly(); } catch (_) {}
    syncTruendoConsentCookie(desiredState);
    if (await waitForTruendoConsentState(desiredState, 2500) &&
        await waitForTruendoTransientSurfacesToClose(5000)) {
      return 'dom:truendo:reject_all';
    }
  }

  if (prefs.globalPreference !== 'custom') return false;

  const currentState = readTruendoConsentState();
  applyTruendoApiToggle(currentState, desiredState, 'preferences', 'togglePreferences');
  applyTruendoApiToggle(currentState, desiredState, 'marketing', 'toggleMarketing');
  applyTruendoApiToggle(currentState, desiredState, 'statistics', 'toggleStatistics');
  applyTruendoApiToggle(currentState, desiredState, 'social_content', 'toggleContent');
  applyTruendoApiToggle(currentState, desiredState, 'social_sharing', 'toggleSharing');
  applyTruendoApiToggle(currentState, desiredState, 'add_features', 'addFeatures');

  syncTruendoConsentCookie(desiredState);
  try { truendo.ack?.(); } catch (_) {}
  try { truendo.runUnblockService?.(); } catch (_) {}

  if (!(await waitForTruendoConsentState(desiredState, 2500))) return false;
  if (!(await waitForTruendoTransientSurfacesToClose(5000))) return false;

  return 'dom:truendo:custom';
}

async function executeClickioFlow(cmp, prefs) {
  if (!hasVisibleSelector(CLICKIO_ACTIONABLE_SURFACE_SELECTORS)) {
    return false;
  }

  if (prefs.globalPreference === 'accept_all' &&
      clickFirstVisible(['.cl-consent__btn:not(.cl-consent__btn--outline)', '.cl-consent__btn--primary'])) {
    if (await waitForDismissal(cmp, selectorActions(clickioDismissSelectors()), 5000)) {
      return 'dom:clickio:accept_all';
    }
  }

  const flowPrefs = normalizeImportedFlowPrefs(prefs);
  const preferencesVisible = hasVisibleSelector(CLICKIO_PREFERENCE_SELECTORS);
  const opened = preferencesVisible || clickFirstVisible(['.cl-consent__btn--outline']);
  if (!opened) return false;
  if (!(await waitForAnyVisible(CLICKIO_PREFERENCE_SELECTORS, 4000))) return false;

  const appliedStorage = await setCheckboxStateInVisibleSection(
    '.cl-consent-tabs__item',
    '.cl-consent-node-h4',
    [/store and\/or access information on a device/i],
    Boolean(flowPrefs.functional) || flowPrefs.uncategorized === 'accept',
  );
  const appliedAdvertising = await setCheckboxStateInVisibleSection(
    '.cl-consent-tabs__item',
    '.cl-consent-node-h4',
    [/\badvertising\b/i, /advertising performance/i, /personalised advertising/i, /basic ads/i],
    Boolean(flowPrefs.advertising) && flowPrefs.ccpaDoNotSell === false,
  );
  const appliedContent = await setCheckboxStateInVisibleSection(
    '.cl-consent-tabs__item',
    '.cl-consent-node-h4',
    [/personalised content/i, /content performance/i, /select content/i],
    Boolean(flowPrefs.functional) || flowPrefs.uncategorized === 'accept',
  );
  const appliedAnalytics = await setCheckboxStateInVisibleSection(
    '.cl-consent-tabs__item',
    '.cl-consent-node-h4',
    [/\baudiences\b/i, /\bstatistics\b/i, /market research/i, /combine data/i],
    Boolean(flowPrefs.analytics),
  );

  if (prefs.globalPreference !== 'accept_all') {
    await applyClickioAllOffAcrossTabs();
  }

  const appliedResults = [appliedStorage, appliedAdvertising, appliedContent, appliedAnalytics];
  const appliedCount = appliedResults.filter((value) => value !== null).length;
  if (appliedCount === 0 || appliedResults.includes(false)) return false;

  await delay(250);
  const saveClicked = clickFirstVisible(['.cl-consent__btn.cl-consent__btn--outline.cl-consent-node-a']) ||
    clickButtonByTextWithin(document, /(?:save settings|agree to selected|accept selected|salva impostazioni)/i);
  if (!saveClicked) return false;
  if (!(await waitForDismissal(cmp, selectorActions(clickioDismissSelectors()), 5000))) return false;

  return prefs.globalPreference === 'custom' ? 'dom:clickio:custom' : `dom:clickio:${prefs.globalPreference}`;
}

async function executeCookiesJsrFlow(cmp, prefs) {
  if (!hasVisibleSelector(COOKIESJSR_ACTIONABLE_SURFACE_SELECTORS)) {
    return false;
  }

  if (prefs.globalPreference === 'accept_all' &&
      clickFirstVisible(['.cookiesjsr-btn.allowAll', '.cookiesjsr-layer--actions .allow-all'])) {
    if (await waitForDismissal(cmp, selectorActions(cookiesJsrDismissSelectors()), 5000)) {
      return 'dom:cookiesjsr:accept_all';
    }
  }

  if (prefs.globalPreference === 'reject_all' &&
      clickFirstVisible([
        '.cookiesjsr-btn.denyAll',
        '.cookiesjsr-layer--actions .deny-all',
        '.cookiesjsr-layer--actions .decline-all',
      ])) {
    if (await waitForDismissal(cmp, selectorActions(cookiesJsrDismissSelectors()), 5000)) {
      return 'dom:cookiesjsr:reject_all';
    }
  }

  const flowPrefs = normalizeImportedFlowPrefs(prefs);
  const preferencesVisible = hasVisibleSelector(COOKIESJSR_PREFERENCE_SELECTORS);
  const opened = preferencesVisible || clickFirstVisible(['.cookiesjsr-settings']);
  if (!opened) return false;
  if (!(await waitForAnyVisible(COOKIESJSR_PREFERENCE_SELECTORS, 4000))) return false;

  const appliedFunctional = await setCookiesJsrSwitchesForServiceGroup(
    [/\bfunctional\b/i, /\bpreferences?\b/i, /\bpersonal(?:i|z)ation\b/i],
    Boolean(flowPrefs.functional) || flowPrefs.uncategorized === 'accept',
  );
  const appliedAnalytics = await setCookiesJsrSwitchesForServiceGroup(
    [/\bperformance\b/i, /\banalytics?\b/i, /\banalytical\b/i, /\bstatistics?\b/i, /\bmeasurement\b/i],
    Boolean(flowPrefs.analytics),
  );
  const appliedMarketing = await setCookiesJsrSwitchesForServiceGroup(
    [/\btracking\b/i, /\bmarketing\b/i, /\badvertis(?:ing|ement)\b/i, /\bvideo\b/i, /\bsocial\b/i, /\bmedia\b/i],
    Boolean(flowPrefs.advertising) && flowPrefs.ccpaDoNotSell === false,
  );

  const appliedResults = [appliedFunctional, appliedAnalytics, appliedMarketing];
  const appliedCount = appliedResults.filter((value) => value !== null).length;
  if (appliedCount === 0 || appliedResults.includes(false)) return false;

  await delay(250);
  if (!clickFirstVisible(['.cookiesjsr-layer--actions .save'])) return false;
  if (!(await waitForDismissal(cmp, selectorActions(cookiesJsrDismissSelectors()), 5000))) return false;

  return prefs.globalPreference === 'custom' ? 'dom:cookiesjsr:custom' : `dom:cookiesjsr:${prefs.globalPreference}`;
}

async function executePrivacyManagerFlow(cmp, prefs) {
  if (!hasVisibleSelector(PRIVACYMANAGER_ACTIONABLE_SURFACE_SELECTORS)) {
    return false;
  }

  const flowPrefs = normalizeImportedFlowPrefs(prefs);
  const preferencesVisible = hasVisibleSelector(PRIVACYMANAGER_PREFERENCE_SELECTORS);
  const opened = preferencesVisible ||
    clickFirstVisible(['#en']) ||
    clickFirstVisible(['#manageSettings']);
  if (!opened) return false;
  if (!(await waitForAnyVisible(PRIVACYMANAGER_PREFERENCE_SELECTORS, 4000))) return false;

  const appliedStorage = await setPrivacyManagerSliderState(
    [/store and\/or access information on a device/i, /informatie op een apparaat opslaan en\/of openen/i, /informationen auf einem gerät speichern/i],
    Boolean(flowPrefs.functional) || flowPrefs.uncategorized === 'accept',
  );
  const appliedAnalytics = await setPrivacyManagerSliderState(
    [/\banalytics\b/i, /\banalytik\b/i, /precise geolocation data, and identification through device scanning/i],
    Boolean(flowPrefs.analytics),
  );
  const appliedAdvertising = await setPrivacyManagerSliderState(
    [/personalised ads and content/i, /\badvertising\b/i, /\bdirect marketing\b/i, /\bsocial media\b/i, /\badvertenties\b/i, /\bwerbung\b/i],
    Boolean(flowPrefs.advertising) && flowPrefs.ccpaDoNotSell === false,
  );
  const appliedFunctional = await setPrivacyManagerSliderState(
    [/strictly necessary cookies/i, /\bfunctional\b/i, /\bfunctionele cookies\b/i, /\bfunktional\b/i],
    Boolean(flowPrefs.functional) || flowPrefs.uncategorized === 'accept',
  );
  const appliedGeo = await setPrivacyManagerSliderState(
    [/use precise geolocation data/i, /actively scan device characteristics/i, /precieze geolocatie/i],
    Boolean(flowPrefs.advertising) && flowPrefs.ccpaDoNotSell === false,
  );

  const appliedResults = [appliedStorage, appliedAnalytics, appliedAdvertising, appliedFunctional, appliedGeo];
  const appliedCount = appliedResults.filter((value) => value !== null).length;
  if (appliedCount === 0 || appliedResults.includes(false)) return false;

  await delay(250);
  if (!clickFirstVisible(['#saveAndExit'])) return false;
  await delay(250);
  clickFirstVisible(['.mat-focus-indicator.okButton.mat-raised-button.mat-button-base']);
  if (!(await waitForDismissal(cmp, selectorActions(privacyManagerDismissSelectors()), 5000))) return false;

  return prefs.globalPreference === 'custom' ? 'dom:privacymanager:custom' : `dom:privacymanager:${prefs.globalPreference}`;
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

function applyOneTrustCustomPreferences(prefs) {
  const categoryToggles = oneTrustCategoryToggles();
  if (!categoryToggles.length) return false;

  let appliedAny = false;
  for (const entry of categoryToggles) {
    const nextState = desiredOneTrustEntryState(entry, prefs);
    if (nextState === null) continue;
    appliedAny = true;
    if (Boolean(entry.toggle.checked) !== nextState) {
      forceOneTrustToggleState(entry.toggle, nextState);
    }
  }

  return appliedAny;
}

function desiredOneTrustToggleState(toggle, prefs) {
  return desiredOneTrustEntryState({
    id: toggle?.id?.replace(/^ot-group-id-/, '') ?? '',
    text: oneTrustToggleText(toggle),
  }, prefs);
}

function desiredOneTrustEntryState(entry, prefs) {
  const id = entry?.id ?? '';
  const text = entry?.text ?? '';

  if (id === 'C0002' || /performance|analytics|measurement|statistics/i.test(text)) {
    return Boolean(prefs.analytics);
  }

  if (id === 'C0003' || /functional|preference|personalization/i.test(text)) {
    return Boolean(prefs.functional);
  }

  if (
    id === 'C0004' ||
    id === 'C0005' ||
    /targeting|advertising|marketing|social media|sale of personal data|share of personal data/i.test(text)
  ) {
    return Boolean(prefs.advertising) && prefs.ccpaDoNotSell === false;
  }

  if (/do not sell|do not share|sale of personal data|share of personal data/i.test(text) || /[A-Z]+_BG/.test(id)) {
    return prefs.ccpaDoNotSell === false;
  }

  if (prefs.uncategorized === 'accept') return true;
  if (prefs.uncategorized === 'reject') return false;
  return null;
}

function oneTrustToggleText(toggle) {
  const parts = [];
  const label = findToggleLabel(toggle);
  if (label?.textContent) parts.push(label.textContent);

  const row = toggle.closest?.('.ot-cat-item, .ot-accordion-layout, .ot-host-item, .ot-pc-content, .ot-vlst-cntr');
  if (row?.textContent) parts.push(row.textContent);

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function oneTrustCategoryToggles() {
  const rows = Array.from(document.querySelectorAll(
    '#onetrust-pc-sdk [data-optanongroupid], #onetrust-banner-sdk [data-optanongroupid]'
  ));
  const entries = [];
  for (const row of rows) {
    const id = row.getAttribute('data-optanongroupid') ?? '';
    if (!id) continue;
    const toggle = row.querySelector(`input#ot-group-id-${id}, input[class*="category-switch-handler"]`);
    if (!(toggle instanceof HTMLInputElement)) continue;
    entries.push({
      id,
      text: row.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      toggle,
    });
  }
  return entries;
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

function wordpressGdprDismissSelectors() {
  return [
    '.wpgdprc-consent-bar',
    '.wpgdprc-consent-modal',
    '.wpgdprc-consent-bar__settings',
    '.wpgdprc-consent-bar__button',
    '.wpgdprc-button',
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

function complianzDismissSelectors() {
  return [
    '#cmplz-cookiebanner-container',
    '.cmplz-cookiebanner',
    '.cmplz-view-preferences',
    '.cmplz-save-preferences',
  ];
}

function borlabsDismissSelectors() {
  return [
    '#BorlabsCookieBox',
    '.show-cookie-box',
    '.cookie-box ._brlbs-btn-accept-all',
    '.cookie-box ._brlbs-btn-accept-only-essential',
    '.cookie-box ._brlbs-manage-btn>a',
    '.cookie-box ._brlbs-manage-btn',
    '#CookiePrefSave',
  ];
}

function syncBorlabsGoogleConsentCookie(prefs) {
  const payload = encodeURIComponent(JSON.stringify({
    ad_storage: wantsAdvertisingCategoryConsent(prefs) ? 'granted' : 'denied',
    ad_user_data: wantsAdvertisingCategoryConsent(prefs) ? 'granted' : 'denied',
    ad_personalization: wantsAdvertisingCategoryConsent(prefs) ? 'granted' : 'denied',
    analytics_storage: prefs.analytics ? 'granted' : 'denied',
    functionality_storage: prefs.functional ? 'granted' : 'denied',
    personalization_storage: prefs.functional ? 'granted' : 'denied',
    security_storage: 'granted',
  }));

  const parts = [
    `borlabs-cookie-gcs=${payload}`,
    'path=/',
    'max-age=31536000',
    'SameSite=Lax',
  ];
  if (location.protocol === 'https:') parts.push('Secure');
  try {
    document.cookie = parts.join('; ');
    document.dispatchEvent(new Event('borlabs-cookie-consent-saved'));
    document.dispatchEvent(new Event('borlabs-cookie-handle-unblock'));
  } catch (_) {}
}

function buildTruendoDesiredState(prefs) {
  const desiredFunctional = Boolean(prefs?.functional) || prefs?.uncategorized === 'accept';
  return {
    ack: true,
    preferences: desiredFunctional,
    marketing: wantsAdvertisingCategoryConsent(prefs),
    necessary: true,
    statistics: Boolean(prefs?.analytics),
    social_content: desiredFunctional,
    social_sharing: desiredFunctional,
    add_features: prefs?.uncategorized === 'accept',
    consent_sent: 'true',
  };
}

function readTruendoConsentState() {
  try {
    if (typeof window.Truendo?.getFullConsent === 'function') {
      const consent = window.Truendo.getFullConsent();
      if (consent && typeof consent === 'object') return consent;
    }
  } catch (_) {}

  try {
    const raw = document.cookie.split('; ').find((entry) => entry.startsWith('truendo_cmp='));
    if (!raw) return null;
    return JSON.parse(decodeURIComponent(raw.slice('truendo_cmp='.length)));
  } catch (_) {
    return null;
  }
}

function applyTruendoApiToggle(currentState, desiredState, key, methodName) {
  if (!window.Truendo || typeof window.Truendo[methodName] !== 'function') return false;
  if (typeof currentState?.[key] === 'boolean' && currentState[key] === desiredState[key]) return true;
  try {
    window.Truendo[methodName]();
    return true;
  } catch (_) {
    return false;
  }
}

function syncTruendoConsentCookie(desiredState) {
  const currentState = readTruendoConsentState() ?? {};
  const next = {
    ...currentState,
    ...desiredState,
  };
  if (!next.exp) {
    next.exp = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  }
  try {
    const parts = [
      `truendo_cmp=${encodeURIComponent(JSON.stringify(next))}`,
      'path=/',
      'max-age=31536000',
      'SameSite=Lax',
    ];
    if (location.protocol === 'https:') parts.push('Secure');
    document.cookie = parts.join('; ');
  } catch (_) {}
}

async function waitForTruendoConsentState(desiredState, timeoutMs = 2500) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const currentState = readTruendoConsentState();
    if (currentState &&
        currentState.ack === desiredState.ack &&
        currentState.preferences === desiredState.preferences &&
        currentState.marketing === desiredState.marketing &&
        currentState.necessary === desiredState.necessary &&
        currentState.statistics === desiredState.statistics &&
        currentState.social_content === desiredState.social_content &&
        currentState.social_sharing === desiredState.social_sharing &&
        currentState.add_features === desiredState.add_features) {
      return true;
    }
    await delay(100);
  }
  return false;
}

function cookieInformationDismissSelectors() {
  return [
    '#coiOverlay',
    '#ccb-coiOverlay',
    '#coiSummery',
    '#coiConsentBanner',
    '#ccb-coiConsentBanner',
    '#coi-banner-wrapper',
    '#ccb-coi-banner-wrapper',
    '.coi-consent-summary',
    ...COOKIEINFORMATION_OPEN_SELECTORS,
    '#ccb-declineButton',
    '#ccb-updateButton',
    '#declineButton',
    '#updateButton',
  ];
}

function cookieWowDismissSelectors() {
  return [
    '.cwc-banner-container',
    '.cwc-consent-summary-container',
    '.cwc-setting-button',
    '.cwc-save-setting-wrapper button',
    ...COOKIEWOW_ACCEPT_SELECTORS,
  ];
}

function cookieControlCivicDismissSelectors() {
  return [
    '#ccc-notify .ccc-notify-button',
    '#ccc-content',
    '#ccc[open]',
    '#ccc-close',
    '#ccc-dismiss-button',
    '#ccc-recommended-settings',
  ];
}

function magentoCookieDismissSelectors() {
  return [
    '.message.global.cookie',
    '.cookie.message',
    '[data-role="cookie-settings"]',
  ];
}

function truendoDismissSelectors() {
  return [
    '#truendo_container div[class*="tru_cookie-dialog"]',
    '#truendo_container .truendo_panel',
    '#truendo_container #tru_options_btn',
    '#truendo_container [data-cy="action-button-reject"]',
    '#truendo_container .tru-reject-btn',
    '#truendo_container [data-cy="action-button-save"]',
  ];
}

async function waitForTruendoTransientSurfacesToClose(timeoutMs = 5000) {
  const transientSelectors = [
    '#truendo_container div[class*="tru_cookie-dialog"]',
    '#truendo_container [data-cy="accept-only-banner"]',
    '#truendo_container [data-cy="action-button-necessary"]',
    '#truendo_container [data-cy="action-button-all"]',
    '#truendo_container .tru_btn_ok--necessary',
    '#truendo_container .tru_btn_ok--all',
    '#truendo_container .tru_cookie-dialog_ok',
    '#truendo_container [data-cy="tru-panel"]',
    '#truendo_container [data-cy="tru-panel-close"]',
    '#truendo_container button.tru_title__close',
    '#truendo_container .tru_overlay',
  ];

  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const stillVisible = transientSelectors.some((selector) =>
      Array.from(document.querySelectorAll(selector)).some((el) => isVisible(el)),
    );
    if (!stillVisible) return true;
    await delay(200);
  }
  return false;
}

function clickioDismissSelectors() {
  return [
    '#cl-consent',
    '.cl-consent__inner',
    '.cl-consent__btn--outline',
    '.cl-consent-tabs__item',
  ];
}

function cookiesJsrDismissSelectors() {
  return [
    '#cookiesjsr',
    '.cookiesjsr--app',
    '.cookiesjsr-settings',
    '.cookiesjsr-layer--actions .save',
    '.cookiesjsr-btn.denyAll',
  ];
}

function privacyManagerDismissSelectors() {
  return [
    '.notice-title',
    '#manageSettings',
    '#saveAndExit',
    '.mat-dialog-title.confirmationDialogTitle',
  ];
}

async function setCheckboxStateById(id, checked) {
  const toggle = document.getElementById(id);
  if (!(toggle instanceof HTMLInputElement)) return null;
  return setCheckboxState(toggle, checked);
}

async function setCheckboxStateWithinContainerIds(ids, checked) {
  for (const id of ids) {
    const container = document.getElementById(id);
    if (!container) continue;
    const toggle = container instanceof HTMLInputElement
      ? container
      : container.querySelector('input[type="checkbox"], input[type="radio"]');
    if (!(toggle instanceof HTMLInputElement)) continue;
    const result = await setCheckboxState(toggle, checked);
    if (result !== null) return result;
  }
  return null;
}

async function setCheckboxState(toggle, checked) {
  if (!(toggle instanceof HTMLInputElement)) return null;
  if (toggle.disabled || toggle.getAttribute('aria-disabled') === 'true') return false;

  const interactionTarget = findCheckboxInteractionTarget(toggle);
  if (!interactionTarget || (!isVisible(interactionTarget) && !isVisible(toggle))) return null;
  if (Boolean(toggle.checked) === checked) return true;

  if (dispatchSyntheticClick(interactionTarget) && (await waitForCheckboxState(toggle, checked, 700))) {
    return true;
  }

  if (dispatchNativeClick(interactionTarget) && (await waitForCheckboxState(toggle, checked, 700))) {
    return true;
  }

  if (interactionTarget !== toggle &&
      dispatchNativeClick(toggle) &&
      (await waitForCheckboxState(toggle, checked, 700))) {
    return true;
  }

  forceCheckboxState(toggle, checked);
  return waitForCheckboxState(toggle, checked, 700);
}

function findCheckboxInteractionTarget(toggle) {
  const explicitLabel = toggle.labels?.[0];
  if (explicitLabel && isVisible(explicitLabel)) return explicitLabel;
  const nestedLabel = toggle.closest?.('label');
  if (nestedLabel && isVisible(nestedLabel)) return nestedLabel;
  const siblingToggle = toggle.parentElement?.querySelector?.('.checkbox-toggle-toggle, .cky-slider, .mdc-switch, .tru_switch, .tru_switch *');
  if (siblingToggle && isVisible(siblingToggle)) return siblingToggle;
  if (isVisible(toggle)) return toggle;
  return explicitLabel || nestedLabel || toggle;
}

async function waitForCheckboxState(toggle, checked, timeoutMs = 700) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (Boolean(toggle.checked) === checked) return true;
    await delay(50);
  }
  return Boolean(toggle.checked) === checked;
}

function forceCheckboxState(toggle, checked) {
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

async function setCookieWowCategoryState(patterns, checked) {
  const item = Array.from(document.querySelectorAll('.cwc-category-item')).find((candidate) => {
    if (!isVisible(candidate)) return false;
    const title = candidate.querySelector('.cwc-category-item-title')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    return patterns.some((pattern) => pattern.test(title));
  });
  if (!item) return null;

  const toggle = item.querySelector('input[type="checkbox"]');
  if (!(toggle instanceof HTMLInputElement)) return false;
  const interactionTarget = item.querySelector('.cwc-switch') ?? findCheckboxInteractionTarget(toggle);
  if (!interactionTarget) return false;
  if (Boolean(toggle.checked) === checked) return true;

  if (dispatchSyntheticClick(interactionTarget) && (await waitForCheckboxState(toggle, checked, 700))) {
    return true;
  }

  forceCheckboxState(toggle, checked);
  return waitForCheckboxState(toggle, checked, 700);
}

async function setWordPressGdprCategoryState(patterns, checked) {
  const toggle = findWordPressGdprCategoryToggle(patterns);
  if (!(toggle instanceof HTMLInputElement)) return null;
  return setCheckboxState(toggle, checked);
}

function hasBigCommerceCatalystActionableSurface() {
  return Boolean(document.querySelector(BIGCOMMERCE_CATALYST_PLATFORM_SELECTOR)) &&
    findBigCommerceCatalystConsentRoot() !== null;
}

function findBigCommerceCatalystConsentRoot() {
  const candidates = Array.from(document.querySelectorAll(BIGCOMMERCE_CATALYST_DIALOG_SELECTORS));
  let best = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    if (!isVisible(candidate)) continue;
    const score = scoreBigCommerceCatalystConsentRoot(candidate);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return bestScore >= 3 ? best : null;
}

function scoreBigCommerceCatalystConsentRoot(root) {
  const visibleButtons = findVisibleButtonsWithin(root);
  const checkboxCount = root.querySelectorAll('input[type="checkbox"], [role="checkbox"], [aria-checked]').length;
  const text = root.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  let score = 0;

  if (visibleButtons.length >= 2) score += 2;
  if (checkboxCount >= 3) score += 3;
  if (/\bprivacy\b|\bcookies?\b/i.test(text)) score += 1;
  if (/\baccept all\b|\breject all\b|\bcustomize\b|\bsave settings\b/i.test(text)) score += 1;

  return score;
}

function findVisibleButtonsWithin(root) {
  return Array.from(root.querySelectorAll('button, a, [role="button"]')).filter((button) => isVisible(button));
}

function buildBigCommerceCatalystConsentPayload(prefs) {
  const flowPrefs = normalizeImportedFlowPrefs(prefs);
  const allow = [];
  const deny = [];
  const categories = [
    { id: 1, enabled: Boolean(flowPrefs.analytics) },
    { id: 2, enabled: Boolean(flowPrefs.functional) },
    { id: 3, enabled: Boolean(flowPrefs.advertising) && flowPrefs.ccpaDoNotSell === false },
  ];

  for (const category of categories) {
    if (category.enabled) {
      allow.push(category.id);
    } else {
      deny.push(category.id);
    }
  }

  return { allow, deny };
}

async function persistBigCommerceCatalystConsent(payload) {
  try {
    const response = await fetch('/api/storefront/consent', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    return response.ok;
  } catch (_) {
    return false;
  }
}

async function waitForBigCommerceCatalystDismissal(timeoutMs = 1200) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (!findBigCommerceCatalystConsentRoot()) return true;
    await delay(50);
  }
  return !findBigCommerceCatalystConsentRoot();
}

function clickBigCommerceCatalystDirectAction(action) {
  const root = findBigCommerceCatalystConsentRoot();
  if (!root) return false;

  const buttons = findVisibleButtonsWithin(root);
  if (buttons.length < 2) return false;

  const target = action === 'reject'
    ? buttons[0]
    : buttons[1];
  if (!target) return false;

  return dispatchSyntheticClick(target);
}

function cleanupBigCommerceCatalystConsentSurface() {
  const root = findBigCommerceCatalystConsentRoot();
  if (!root) return;

  root.remove();
  document.documentElement.style.overflow = '';
  document.body.style.overflow = '';
}

function bigCommerceCatalystMethodForPrefs(prefs) {
  if (prefs.globalPreference === 'accept_all') return 'dom:bigcommercecatalyst:accept_all';
  if (prefs.globalPreference === 'reject_all') return 'dom:bigcommercecatalyst:reject_all';
  if (prefs.ccpaDoNotSell !== false) return 'dom:bigcommercecatalyst:ccpa';
  return 'dom:bigcommercecatalyst:custom';
}

function findWordPressGdprCategoryToggle(patterns) {
  const descriptions = document.querySelectorAll('.wpgdprc-consent-modal__description');
  for (const description of descriptions) {
    if (!isVisible(description)) continue;
    const text = description.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    if (!text || !patterns.some((pattern) => pattern.test(text))) continue;

    let container = description;
    for (let depth = 0; depth < 4 && container; depth += 1) {
      const toggle = container.querySelector?.('input[type="checkbox"], input[type="radio"]');
      if (toggle instanceof HTMLInputElement) return toggle;
      container = container.parentElement;
    }
  }
  return null;
}

async function setCheckboxStateInVisibleSection(sectionSelector, titleSelector, patterns, checked) {
  return setCheckboxStateInVisibleSectionWithin(document, sectionSelector, titleSelector, patterns, checked);
}

async function setCheckboxStateInVisibleSectionWithin(root, sectionSelector, titleSelector, patterns, checked) {
  const section = findVisibleSectionByText(sectionSelector, titleSelector, patterns, root);
  if (!section) return null;
  const switchControl = section.querySelector('[role="switch"][aria-checked], button[aria-checked], [aria-checked][tabindex]');
  if (switchControl) {
    return setAriaToggleState(switchControl, checked);
  }
  const toggle = section.querySelector('input[type="checkbox"], input[type="radio"]');
  if (!(toggle instanceof HTMLInputElement)) return false;
  return setCheckboxState(toggle, checked);
}

function findVisibleSectionByText(sectionSelector, titleSelector, patterns, root = document) {
  const sections = root.querySelectorAll(sectionSelector);
  for (const section of sections) {
    if (!isVisible(section)) continue;
    const title = Array.from(section.querySelectorAll(titleSelector))
      .map((el) => el.textContent?.replace(/\s+/g, ' ').trim() ?? '')
      .join(' ');
    if (!title) continue;
    if (patterns.some((pattern) => pattern.test(title))) {
      return section;
    }
  }
  return null;
}

function platformCustomMethodForPrefs(cmpId, prefs) {
  if (prefs.globalPreference === 'accept_all') return `dom:${cmpId}:accept_all`;
  if (prefs.globalPreference === 'reject_all') return `dom:${cmpId}:reject_all`;
  return `dom:${cmpId}:custom`;
}

async function setComplianzCategoryState(id, patterns, checked) {
  const direct = await setCheckboxStateById(id, checked);
  if (direct !== null) return direct;
  return setCheckboxStateInVisibleSection(
    '.cmplz-category',
    '.cmplz-category-title, .cmplz-category-header, summary, label',
    patterns,
    checked,
  );
}

function pandectesDismissSelectors() {
  return [
    '#pandectes-banner',
    '.pd-cookie-banner-window',
    '#pd-cp-preferences',
    '.pd-cp-ui-save',
    ...PANDECTES_ACCEPT_SELECTORS,
    ...PANDECTES_REJECT_SELECTORS,
    ...PANDECTES_OPEN_SELECTORS,
  ];
}

function findConsentmoHost() {
  const hosts = Array.from(document.querySelectorAll('csm-cookie-consent'));
  for (const host of hosts) {
    const root = host.shadowRoot;
    if (!root) continue;
    if (hasVisibleSelectorWithin(root, [
      '.cookieconsent-wrapper',
      '.cookieconsent-preferences',
      '.cc-settings-panel',
      '.cc-save-preferences',
      'button',
    ])) {
      return host;
    }
  }
  return hosts.find((host) => host.shadowRoot) ?? hosts[0] ?? null;
}

function consentmoShadowRoot(host = findConsentmoHost()) {
  return host?.shadowRoot ?? null;
}

function hasVisibleSelectorWithin(root, selectors) {
  return selectors.some((selector) =>
    Array.from(root.querySelectorAll(selector)).some((el) => isVisible(el))
  );
}

async function waitForAnyVisibleWithin(root, selectors, timeoutMs = 3000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (selectors.some((selector) => firstVisibleElementWithin(root, [selector]))) return true;
    await delay(100);
  }
  return false;
}

async function waitForConsentmoDismissal(host, root, timeoutMs = 4000) {
  const started = Date.now();
  let hiddenSince = null;
  while (Date.now() - started < timeoutMs) {
    const rootVisible = Boolean(host?.isConnected && root && hasVisibleSelectorWithin(root, [
      '.cookieconsent-wrapper',
      '.cookieconsent-preferences',
      '.cc-settings-panel',
      '.cc-save-preferences',
      'button',
    ]));
    if (!host?.isConnected || !rootVisible) {
      hiddenSince ??= Date.now();
      if (Date.now() - hiddenSince >= 1200) return true;
    } else {
      hiddenSince = null;
    }
    await delay(100);
  }
  return false;
}

async function setConsentmoCategoryState(root, sectionSelector, titleSelector, patterns, checked, describedByTokens = []) {
  const describedByMatch = findConsentmoSwitchByAriaDescribedBy(root, describedByTokens);
  if (describedByMatch) {
    return setConsentmoSwitchState(describedByMatch, checked);
  }

  const section = findVisibleSectionByText(sectionSelector, titleSelector, patterns, root);
  if (!section) return null;

  const switchControl = section.querySelector('[role="switch"][aria-checked], [aria-checked][tabindex]');
  if (switchControl) {
    return setConsentmoSwitchState(switchControl, checked);
  }

  const checkbox = section.querySelector('input[type="checkbox"], input[type="radio"]');
  if (checkbox instanceof HTMLInputElement) {
    return setCheckboxState(checkbox, checked);
  }

  return false;
}

function findConsentmoSwitchByAriaDescribedBy(root, tokens = []) {
  if (!root || !tokens.length) return null;
  const controls = root.querySelectorAll('[role="switch"][aria-describedby]');
  for (const control of controls) {
    if (!isVisible(control)) continue;
    const describedBy = control.getAttribute('aria-describedby') ?? '';
    const parts = describedBy.split(/\s+/).filter(Boolean);
    if (tokens.some((token) => parts.includes(token))) {
      return control;
    }
  }
  return null;
}

async function setConsentmoSwitchState(control, checked) {
  const current = readConsentmoSwitchState(control);
  if (current === null) return false;
  if (current === checked) return true;

  const directTarget = checked
    ? control.querySelector('.accept-container, [class*="accept-container"]')
    : control.querySelector('.reject-container, [class*="reject-container"]');
  if (directTarget && isVisible(directTarget) &&
      dispatchNativeClick(directTarget) &&
      (await waitForConsentmoSwitchState(control, checked, 900))) {
    return true;
  }

  if (directTarget && isVisible(directTarget) &&
      dispatchSyntheticClick(directTarget) &&
      (await waitForConsentmoSwitchState(control, checked, 900))) {
    return true;
  }

  if (dispatchNativeClick(control) &&
      (await waitForConsentmoSwitchState(control, checked, 900))) {
    return true;
  }

  if (dispatchSyntheticClick(control) &&
      (await waitForConsentmoSwitchState(control, checked, 900))) {
    return true;
  }

  forceConsentmoSwitchState(control, checked);
  if (await waitForConsentmoSwitchState(control, checked, 900)) {
    return true;
  }

  // Consentmo can repaint the visual switch but keep the underlying checkbox model
  // unchanged. Force both layers together one more time before we give up.
  forceConsentmoCheckboxModel(control, checked);
  return waitForConsentmoSwitchState(control, checked, 1200);
}

function readConsentmoSwitchState(control) {
  if (control.getAttribute?.('aria-checked') != null) {
    return control.getAttribute('aria-checked') === 'true';
  }

  const nestedCheckbox = control.querySelector('input[type="checkbox"]');
  if (nestedCheckbox instanceof HTMLInputElement) {
    return Boolean(nestedCheckbox.checked);
  }

  const rejectContainer = control.querySelector('.reject-container, [class*="reject-container"]');
  const acceptContainer = control.querySelector('.accept-container, [class*="accept-container"]');
  if (acceptContainer?.classList?.contains('checked')) return true;
  if (rejectContainer?.classList?.contains('checked')) return false;

  return null;
}

async function waitForConsentmoSwitchState(control, checked, timeoutMs = 700) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (readConsentmoSwitchState(control) === checked) return true;
    await delay(50);
  }
  return readConsentmoSwitchState(control) === checked;
}

function forceConsentmoSwitchState(control, checked) {
  const rejectContainer = control.querySelector('.reject-container, [class*="reject-container"]');
  const acceptContainer = control.querySelector('.accept-container, [class*="accept-container"]');
  if (acceptContainer) {
    acceptContainer.classList.toggle('checked', checked);
  }
  if (rejectContainer) {
    rejectContainer.classList.toggle('checked', !checked);
  }

  if (control.getAttribute?.('aria-checked') != null) {
    control.setAttribute('aria-checked', checked ? 'true' : 'false');
  }

  forceConsentmoCheckboxModel(control, checked);

  control.dispatchEvent(new Event('input', { bubbles: true }));
  control.dispatchEvent(new Event('change', { bubbles: true }));
  control.dispatchEvent(new CustomEvent('consentmo:toggle', {
    bubbles: true,
    composed: true,
    detail: { checked },
  }));
}

function forceConsentmoCheckboxModel(control, checked) {
  const nestedCheckbox = control.querySelector('input[type="checkbox"]');
  if (!(nestedCheckbox instanceof HTMLInputElement)) return;

  forceCheckboxState(nestedCheckbox, checked);
  nestedCheckbox.setAttribute('aria-checked', checked ? 'true' : 'false');
  nestedCheckbox.dispatchEvent(new Event('click', { bubbles: true, composed: true }));
  nestedCheckbox.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  nestedCheckbox.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
}

function clickButtonByTextWithin(root, pattern) {
  const scope = root ?? document;
  const buttons = scope.querySelectorAll('button, a, [role="button"]');
  for (const button of buttons) {
    if (!isVisible(button)) continue;
    const text = button.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    if (!pattern.test(text)) continue;
    return dispatchSyntheticClick(button);
  }
  return false;
}

function clickButtonByTextWithinNative(root, pattern) {
  const scope = root ?? document;
  const buttons = scope.querySelectorAll('button, a, [role="button"]');
  for (const button of buttons) {
    if (!isVisible(button)) continue;
    const text = button.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    if (!pattern.test(text)) continue;
    return dispatchNativeClick(button);
  }
  return false;
}

async function setAllCookiesJsrSwitchesForTab(tabSelectors, checked) {
  const tabClicked = clickFirstVisible(tabSelectors);
  if (!tabClicked && !hasVisibleSelector(tabSelectors)) return null;
  await delay(150);

  const visibleServices = Array.from(document.querySelectorAll('.cookiesjsr-service')).filter((service) => isVisible(service));
  if (visibleServices.length === 0) return null;

  const results = [];
  for (const service of visibleServices) {
    const toggle = service.querySelector('.cookiesjsr-switch input[type="checkbox"], input[type="checkbox"]');
    if (!(toggle instanceof HTMLInputElement)) continue;
    results.push(await setCheckboxState(toggle, checked));
  }

  if (results.length === 0) return null;
  if (results.includes(false)) return false;
  return true;
}

async function setCookiesJsrSwitchesForServiceGroup(patterns, checked) {
  const group = findVisibleCookiesJsrServiceGroup(patterns);
  if (!group) return null;

  const tab = group.querySelector('button[role="tab"], .cookiesjsr-service-group-tab, button');
  if (tab && isVisible(tab)) {
    dispatchNativeClick(tab) || dispatchSyntheticClick(tab);
    await delay(150);
  }

  const panel = findCookiesJsrPanelForServiceGroup(group);
  if (!panel) return false;

  const services = Array.from(panel.querySelectorAll('.cookiesjsr-service')).filter((service) => isVisible(service));
  if (services.length === 0) return null;

  const results = [];
  for (const service of services) {
    const toggle = service.querySelector('.cookiesjsr-switch input[type="checkbox"], input[type="checkbox"]');
    if (!(toggle instanceof HTMLInputElement)) continue;
    results.push(await setCheckboxState(toggle, checked));
  }

  if (results.length === 0) return null;
  if (results.includes(false)) return false;
  return true;
}

function findVisibleCookiesJsrServiceGroup(patterns) {
  const groups = document.querySelectorAll('.cookiesjsr-service-group');
  for (const group of groups) {
    if (!isVisible(group)) continue;
    const tab = group.querySelector('button[role="tab"], .cookiesjsr-service-group-tab, button');
    const identity = [
      group.textContent ?? '',
      tab?.textContent ?? '',
      tab?.id ?? '',
      tab?.getAttribute?.('aria-controls') ?? '',
      group.id ?? '',
      group.className ?? '',
    ].join(' ').replace(/\s+/g, ' ').trim();
    if (patterns.some((pattern) => pattern.test(identity))) {
      return group;
    }
  }
  return null;
}

function findCookiesJsrPanelForServiceGroup(group) {
  const tab = group.querySelector('button[role="tab"], .cookiesjsr-service-group-tab, button');
  const controlsId = tab?.getAttribute?.('aria-controls');
  if (controlsId) {
    const controlled = document.getElementById(controlsId);
    if (controlled && isVisible(controlled)) return controlled;
  }

  const suffix = (group.id || tab?.id || '').replace(/^tab-/, '');
  if (suffix) {
    const panel = document.getElementById(`panel-${suffix}`);
    if (panel && isVisible(panel)) return panel;
  }

  const sibling = group.nextElementSibling;
  if (sibling && isVisible(sibling)) return sibling;

  return firstVisibleElement(['.cookiesjsr-service-group--content', '[role="tabpanel"]']);
}

function cookieYesDismissSelectors() {
  return [
    '#cookie-law-info-bar',
    '.cky-consent-container',
    '.cky-banner-element',
    '.cky-preference-center',
  ];
}

function openCookieControlCivicPreferenceCenter() {
  try {
    const controller = window.ClickControl ?? window.CookieControl;
    if (controller && typeof controller.open === 'function') {
      controller.open();
      return true;
    }
  } catch (_) {}
  return false;
}

async function setCookieControlCivicOptionalInputs(flowPrefs) {
  const toggles = Array.from(document.querySelectorAll('#ccc-optional-categories .checkbox-toggle-input'));
  if (toggles.length === 0) return null;

  const results = [];
  for (const toggle of toggles) {
    if (!(toggle instanceof HTMLInputElement)) continue;
    const section = toggle.closest('.optional-cookie');
    const text = section?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    let desired = false;
    if (/\bfunctionality\b|\bpersonalisation\b|\bpreferences?\b|\bsocial\b/i.test(text)) {
      desired = Boolean(flowPrefs.functional) || flowPrefs.uncategorized === 'accept';
    } else if (/\banalytics?\b|\bstatistics?\b|\bmeasurement\b|\bperformance\b/i.test(text)) {
      desired = Boolean(flowPrefs.analytics);
    } else if (/\bmarketing\b|\badvertis(?:ing|ement)\b|\btarget(?:ing)?\b/i.test(text)) {
      desired = Boolean(flowPrefs.advertising);
    } else {
      desired = flowPrefs.uncategorized === 'accept';
    }
    results.push(await setCheckboxState(toggle, desired));
  }

  if (results.length === 0) return null;
  if (results.includes(false)) return false;
  return true;
}

async function setCookieControlCivicIabPurposeStates(flowPrefs) {
  const toggles = Array.from(document.querySelectorAll('#iab-purpose .checkbox-toggle-input[id^="object-purpose-"], #iab-purpose input.checkbox-toggle-input[id^="purpose-"]'));
  if (toggles.length === 0) return null;

  const advertisingIds = new Set(['2', '3', '4', '5', '6', '8']);
  const analyticsIds = new Set(['7', '9', '10']);
  const functionalIds = new Set(['1']);
  const results = [];

  for (const toggle of toggles) {
    if (!(toggle instanceof HTMLInputElement)) continue;
    const match = toggle.id.match(/(?:object-purpose-|purpose-)(\d+)/);
    if (!match) continue;
    const purposeId = match[1];
    let desired = false;
    if (analyticsIds.has(purposeId)) {
      desired = Boolean(flowPrefs.analytics);
    } else if (advertisingIds.has(purposeId)) {
      desired = Boolean(flowPrefs.advertising);
    } else if (functionalIds.has(purposeId)) {
      desired = Boolean(flowPrefs.functional);
    } else {
      desired = false;
    }
    results.push(await setCheckboxState(toggle, desired));
  }

  if (results.length === 0) return null;
  if (results.includes(false)) return false;
  return true;
}

async function setCheckboxStateByDataCy(value, checked) {
  const escaped = window.CSS?.escape ? window.CSS.escape(value) : value.replace(/["\\]/g, '\\$&');
  const toggle = document.querySelector(`[data-cy="${escaped}"]`);
  if (!toggle) return null;
  const input = toggle instanceof HTMLInputElement
    ? toggle
    : toggle.querySelector?.('input[type="checkbox"], input[type="radio"]') ?? toggle.closest?.('label, div')?.querySelector?.('input[type="checkbox"], input[type="radio"]');
  if (!(input instanceof HTMLInputElement)) return false;
  return setCheckboxState(input, checked);
}

async function setTruendoToggleState(patterns, checked) {
  const groups = Array.from(document.querySelectorAll('#truendo_container [data-cy="tru-expand"], #truendo_container .tru-expand, #truendo_container .expand-section, #truendo_container [class*="tru_expand"]'));
  for (const group of groups) {
    if (!isVisible(group)) continue;
    const text = group.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    if (!text || !patterns.some((pattern) => pattern.test(text))) continue;
    const toggle = group.querySelector('input[type="checkbox"], input[type="radio"]');
    if (!(toggle instanceof HTMLInputElement)) return false;
    return setCheckboxState(toggle, checked);
  }
  return null;
}

async function setAriaToggleState(control, checked) {
  const current = readAriaToggleState(control);
  if (current === null) return false;
  if (current === checked) return true;

  if (dispatchNativeClick(control) && (await waitForAriaToggleState(control, checked, 700))) {
    return true;
  }
  if (dispatchSyntheticClick(control) && (await waitForAriaToggleState(control, checked, 700))) {
    return true;
  }

  control.setAttribute('aria-checked', checked ? 'true' : 'false');
  control.dispatchEvent(new Event('input', { bubbles: true }));
  control.dispatchEvent(new Event('change', { bubbles: true }));
  return waitForAriaToggleState(control, checked, 700);
}

function readAriaToggleState(control) {
  if (control.getAttribute?.('aria-checked') != null) {
    return control.getAttribute('aria-checked') === 'true';
  }

  const nested = control.querySelector?.('input[type="checkbox"], input[type="radio"]');
  if (nested instanceof HTMLInputElement) {
    return Boolean(nested.checked);
  }

  return null;
}

async function waitForAriaToggleState(control, checked, timeoutMs = 700) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (readAriaToggleState(control) === checked) return true;
    await delay(50);
  }
  return readAriaToggleState(control) === checked;
}

async function applyClickioAllOffAcrossTabs() {
  const tabSelectors = [
    '.cl-consent-tabs__item',
    "[title='Legitimate interest']",
    "[title='Manage partners']",
  ];

  for (const selector of tabSelectors) {
    const tab = firstVisibleElement([selector]);
    if (tab) {
      dispatchNativeClick(tab) || dispatchSyntheticClick(tab);
      await delay(150);
    }
    const allOff = firstVisibleElement([
      '.cl-consent-tabs__content.cl-consent-active [data-role="alloff"]',
      '.cl-consent-tabs__content [data-role="alloff"]',
    ]);
    if (allOff) {
      dispatchNativeClick(allOff) || dispatchSyntheticClick(allOff);
      await delay(120);
    }
  }
}

async function setPrivacyManagerSliderState(patterns, checked) {
  const row = findVisiblePrivacyManagerRow(patterns);
  if (!row) return null;

  const slider = row.querySelector('#mat-slider, [id="mat-slider"], [class*="mat-slider"]');
  if (!slider) return false;
  const state = readPrivacyManagerSliderState(slider);
  if (state === null) return false;
  if (state === checked) return true;

  if (dispatchSyntheticClick(slider) && (await waitForPrivacyManagerSliderState(slider, checked, 700))) {
    return true;
  }

  return waitForPrivacyManagerSliderState(slider, checked, 700);
}

function findVisiblePrivacyManagerRow(patterns) {
  const rows = document.querySelectorAll('ul li');
  for (const row of rows) {
    if (!isVisible(row)) continue;
    const text = Array.from(row.querySelectorAll('p'))
      .map((el) => el.textContent?.replace(/\s+/g, ' ').trim() ?? '')
      .join(' ');
    if (!text) continue;
    if (patterns.some((pattern) => pattern.test(text))) return row;
  }
  return null;
}

function readPrivacyManagerSliderState(slider) {
  const className = slider.className || '';
  if (/\bstate-true\b/.test(className)) return true;
  if (/\bstate-false\b/.test(className)) return false;
  const ariaChecked = slider.getAttribute('aria-checked');
  if (ariaChecked === 'true') return true;
  if (ariaChecked === 'false') return false;
  return null;
}

async function waitForPrivacyManagerSliderState(slider, checked, timeoutMs = 700) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (readPrivacyManagerSliderState(slider) === checked) return true;
    await delay(50);
  }
  return readPrivacyManagerSliderState(slider) === checked;
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
  ]) {
    for (const el of document.querySelectorAll(sel)) {
      if (isVisible(el)) el.remove?.();
    }
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

function clickFirstVisibleWithinNative(root, selectors) {
  if (!root) return false;
  for (const selector of selectors) {
    const el = firstVisibleElementWithin(root, [selector]);
    if (!el) continue;
    return dispatchNativeClick(el);
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
  if (!toggle) return null;
  if (toggle.id && typeof CSS?.escape === 'function') {
    const explicit = document.querySelector(`label[for="${CSS.escape(toggle.id)}"]`);
    if (explicit) return explicit;
  }
  return toggle.parentElement?.querySelector('.ot-switch-nob, .ot-tgl-cntr, .category-switch-handler') ?? null;
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
