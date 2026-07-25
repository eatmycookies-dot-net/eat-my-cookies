// Main coordinator — ISOLATED world, document_idle.
// 1. Loads user preferences from the service worker
// 2. Handles site-specific flows when a publisher needs custom logic
// 3. Dispatches prefs to MAIN world scripts (TCF interceptor, GCM injector, CMP API handler)
// 4. Falls back to DOM handler → heuristic if MAIN world didn't handle it
// 5. Reports result to service worker for stats + badge update

const site = location.hostname;
const RUN_GUARD_PREFIX = '__emc_handled__';
const FLOW_COOLDOWN_MS = 15000;
const MAIN_WORLD_FLOW_GRACE_MS = 4000;
const MAIN_WORLD_FLOW_IN_PROGRESS_TTL_MS = 12000;
const SHOPIFY_MAIN_WORLD_TIMEOUT_MS = 5000;
const ONETRUST_MAIN_WORLD_TIMEOUT_MS = 12000;
const ONETRUST_RELOAD_RETRY_SELECTORS = [
  '#onetrust-banner-sdk',
  '#onetrust-consent-sdk',
  '#onetrust-pc-sdk',
  '.save-preference-btn-handler',
  '.category-switch-handler',
  "input[id^='ot-group-id-']",
];
const REJECT_RELOAD_GUARD_HOSTS = new Set([
  'www.cnbc.com',
  'www.nbcnews.com',
  'www.thomsonreuters.com',
  'thomsonreuters.com',
]);
const PRE_HANDLE_PENDING_TTL_MS = 20000;
const DO_NOT_HANDLE_URLS = new Set([
  'https://www.theguardian.com/help/accessibility-help',
]);
const DYNAMIC_SITE_SPECIFIC_HOSTS = new Set([
  'www.bloomberg.com',
  'forbes.com',
  'www.forbes.com',
  'www.ketch.com',
  'ketch.com',
  'www.pret.com',
  'liveramp.com',
  'www.liveramp.com',
  'github.com',
]);
const CONSENTMANAGER_TOP_LEVEL_EXCLUDED_SITES = new Set([
  'www.bbc.com',
  'latimes.com',
  'www.latimes.com',
  'membership.latimes.com',
  'www.forbes.com',
  'forbes.com',
  'www.bloomberg.com',
  'www.nbcnews.com',
  'www.zoom.com',
  'www.ft.com',
  'www.theguardian.com',
]);
const DOCUMENT_START_ONLY_SITES = new Set([
  'www.bbc.com',
  'latimes.com',
  'www.latimes.com',
  'membership.latimes.com',
]);
let siteSpecificWatchStarted = false;
let siteSpecificFlowLock = null;
let shopifyWatchStarted = false;
let osanoWatchStarted = false;
let lateDomWatchStarted = false;
let bloombergCcpaBridgeInstalled = false;
let bloombergCcpaWatchToken = 0;
let bloombergCcpaManualOpenUntil = 0;
const BLOOMBERG_CCPA_MANUAL_SUPPRESS_MS = 15000;
let ketchManualOpenGuardInstalled = false;
let ketchManualOpenUntil = 0;
const KETCH_MANUAL_SUPPRESS_MS = 120000;
// Zoom footer openers are handled once in the document-start MAIN-world guard.
// Keeping this coordinator out of the click path avoids competing with Zoom's
// own OneTrust event handlers after consent has been applied.

const ACCEPT_OR_WARN_SITES = {
  'www.repubblica.it': {
    reason: 'This wall currently requires accepting cookies or choosing a paid/login path.',
    detectSelectors: [
      '#iubenda-cs-banner',
      '.iubenda-cs-content',
      '.iubenda-cs-accept-btn',
      '.iubenda-cs-reject-btn',
      '.cookiewall',
      '[class*="cookiewall__content"]',
      '#cookieWallConsentButton',
    ],
    watchSelectors: ['#iubenda-cs-banner', '.iubenda-cs-content', '.cookiewall', '[class*="cookiewall__content"]'],
    acceptSelectors: ['.iubenda-cs-accept-btn', '#iubenda-cs-accept', '#cookieWallConsentButton', 'button[data-action="close"]'],
  },
  'www.lefigaro.fr': {
    reason: 'This wall currently offers accepting cookies or a subscription-based rejection flow.',
    detectSelectors: ['#appconsent', 'iframe[title="Consent window"]', '.fig-consent-banner__button', '.fig-consent-banner__accept'],
    acceptSelectors: ['.fig-consent-banner__accept', '.button__acceptAll'],
  },
  'www.abc.es': {
    reason: 'Rejecting cookies requires a paid subscription (€3.99+/month). Accept is the only free path.',
    detectSelectors: [
      '.evolok-components-button',
      'text:aceptar y continuar',
      'text:rechazar y pagar',
      'text:para seguir navegando sin cookies',
    ],
    acceptSelectors: ['.evolok-agree-button', '#didomi-notice-agree-button', 'text:aceptar y continuar'],
  },
  'www.lavanguardia.com': {
    reason: 'Rejecting cookies requires a paid subscription. Accept is the only free path.',
    detectSelectors: [
      '.evolok-components-button',
      'text:aceptar y continuar',
      'text:rechazar y suscribirse',
    ],
    acceptSelectors: ['.evolok-agree-button', '#didomi-notice-agree-button', 'text:aceptar y continuar'],
  },
  'www.corriere.it': {
    reason: 'This wall currently offers accepting cookies or a consentless subscription path.',
    detectSelectors: [
      'text:accetta e continua',
      'text:rifiuta e abbonati',
      'text:preferenze',
      'text:accesso consentless',
    ],
    acceptSelectors: ['text:accetta e continua', 'text:accept all'],
  },
  'www.ilsole24ore.com': {
    reason: 'This wall currently offers accepting cookies or a subscription-based rejection flow.',
    detectSelectors: [
      'text:accetto',
      'text:consenti tutti',
      'text:rifiuta e abbonati',
      'text:preferenze',
    ],
    acceptSelectors: ['text:accetto', 'text:consenti tutti'],
  },
  'www.lastampa.it': {
    reason: 'This wall currently offers accepting cookies or a subscription-based rejection flow.',
    detectSelectors: [
      '#iubenda-cs-banner',
      '.iubenda-cs-content',
      '.iubenda-cs-accept-btn',
      '.iubenda-cs-reject-btn',
      'text:rifiuta e abbonati',
    ],
    watchSelectors: ['#iubenda-cs-banner', '.iubenda-cs-content'],
    acceptSelectors: [
      'button.iubenda-cs-accept-btn',
      '.iubenda-cs-accept-btn',
      'text:accetta',
    ],
  },
  'www.ilmessaggero.it': {
    reason: 'This wall currently offers accepting cookies or a subscription-based rejection flow.',
    detectSelectors: [
      '#iubenda-cs-banner',
      '.iubenda-cs-content',
      '.iubenda-cs-accept-btn',
      'text:accetta e continua',
      'text:opzioni cookie',
      'text:rifiuta e abbonati',
    ],
    watchSelectors: ['#iubenda-cs-banner', '.iubenda-cs-content'],
    acceptSelectors: [
      'button.iubenda-cs-accept-btn',
      '.iubenda-cs-accept-btn',
      'text:accetta e continua',
      'text:accetta',
    ],
  },
  'www.diariomotor.com': {
    reason: 'This Clickio wall currently offers accepting cookies or a paid consentless path. Reject/custom preferences are not available here without the subscription flow.',
    detectSelectors: [
      '#cl-consent',
      '.cl-consent__inner',
      'text:rechazar por',
      'text:gestionar opciones',
      'text:de acuerdo y cerrar',
    ],
    watchSelectors: ['#cl-consent', '.cl-consent__inner'],
    acceptSelectors: [
      '.cl-consent__btn:not(.cl-consent__btn--outline)',
      '.cl-consent__btn--primary',
      'text:de acuerdo y cerrar',
    ],
  },
  'mundokodi.com': {
    reason: 'This Clickio wall currently offers accepting cookies or a paid consentless path. Reject/custom preferences are not available here without the subscription flow.',
    detectSelectors: [
      '#cl-consent',
      '.cl-consent__inner',
      'text:rechazar y suscribirme',
      'text:gestionar opciones',
      'text:de acuerdo y cerrar',
    ],
    watchSelectors: ['#cl-consent', '.cl-consent__inner'],
    acceptSelectors: [
      '.cl-consent__btn:not(.cl-consent__btn--outline)',
      '.cl-consent__btn--primary',
      'text:de acuerdo y cerrar',
    ],
  },
};

const KETCH_SITE_CONFIGS = {
  'forbes.com': {
    siteLabel: 'Forbes',
    privacyCenterTitle: 'forbes privacy center',
    homeUrl: 'https://www.forbes.com/',
    cooldownScope: 'forbes',
    purposeTabSelectors: ['#ketch-preferences-navigation-purposes-tab', 'text:cookie preferences'],
    readySelectors: [
      '#ketch-preferences-navigation-purposes-tab',
      '#ketch-preferences-navigation-welcome-tab',
      '#behavioral_advertising',
      '#analytics',
      '#functional',
      'text:save your choices',
      'text:exit',
    ],
    settingsSelectors: [
      '#behavioral_advertising',
      '#analytics',
      '#functional',
      'text:save your choices',
    ],
    entrySelectors: [
      'text:cookie preferences',
      'text:your data privacy rights',
      'text:do-not-sell',
      'text:limit my sensitive personal information',
    ],
    categoryRules: [
      { id: 'behavioral_advertising', labels: ['behavioral advertising', 'advertising'], desired: (prefs) => Boolean(prefs.advertising) },
      { id: 'analytics', labels: ['analytics'], desired: (prefs) => Boolean(prefs.analytics) },
      { id: 'functional', labels: ['functional'], desired: (prefs) => Boolean(prefs.functional) },
    ],
    bannerWatchSelectors: [
      '#ketch-banner',
      '#ketch-consent-banner',
      '#ketch-banner-button-primary',
      '#ketch-banner-button-secondary',
      '#ketch-banner-button-tertiary',
      'button[aria-label*="Accept All" i]',
      'button[aria-label*="Reject All Non-Required" i]',
      'button[aria-label*="Manage Preferences" i]',
    ],
    bannerAcceptSelectors: [
      '#ketch-banner-button-primary',
      'button[aria-label*="Accept All" i]',
      'text:accept all',
    ],
    bannerRejectSelectors: [
      '#ketch-banner-button-secondary',
      'button[aria-label*="Reject All Non-Required" i]',
      'text:reject all non-required',
    ],
    bannerManageSelectors: [
      '#ketch-banner-button-tertiary',
      'button[aria-label*="Manage Preferences" i]',
      'button[title*="Manage Preferences" i]',
      'text:manage preferences',
    ],
    customRejectBaseline: true,
    saveSelectors: ['data-nav-action:confirm', 'text:save your choices'],
    exitSelectors: ['text:exit'],
  },
  'www.forbes.com': {
    siteLabel: 'Forbes',
    privacyCenterTitle: 'forbes privacy center',
    homeUrl: 'https://www.forbes.com/',
    cooldownScope: 'forbes',
    purposeTabSelectors: ['#ketch-preferences-navigation-purposes-tab', 'text:cookie preferences'],
    readySelectors: [
      '#ketch-preferences-navigation-purposes-tab',
      '#ketch-preferences-navigation-welcome-tab',
      '#behavioral_advertising',
      '#analytics',
      '#functional',
      'text:save your choices',
      'text:exit',
    ],
    settingsSelectors: [
      '#behavioral_advertising',
      '#analytics',
      '#functional',
      'text:save your choices',
    ],
    entrySelectors: [
      'text:cookie preferences',
      'text:your data privacy rights',
      'text:do-not-sell',
      'text:limit my sensitive personal information',
    ],
    categoryRules: [
      { id: 'behavioral_advertising', labels: ['behavioral advertising', 'advertising'], desired: (prefs) => Boolean(prefs.advertising) },
      { id: 'analytics', labels: ['analytics'], desired: (prefs) => Boolean(prefs.analytics) },
      { id: 'functional', labels: ['functional'], desired: (prefs) => Boolean(prefs.functional) },
    ],
    bannerWatchSelectors: [
      '#ketch-banner',
      '#ketch-consent-banner',
      '#ketch-banner-button-primary',
      '#ketch-banner-button-secondary',
      '#ketch-banner-button-tertiary',
      'button[aria-label*="Accept All" i]',
      'button[aria-label*="Reject All Non-Required" i]',
      'button[aria-label*="Manage Preferences" i]',
    ],
    bannerAcceptSelectors: [
      '#ketch-banner-button-primary',
      'button[aria-label*="Accept All" i]',
      'text:accept all',
    ],
    bannerRejectSelectors: [
      '#ketch-banner-button-secondary',
      'button[aria-label*="Reject All Non-Required" i]',
      'text:reject all non-required',
    ],
    bannerManageSelectors: [
      '#ketch-banner-button-tertiary',
      'button[aria-label*="Manage Preferences" i]',
      'button[title*="Manage Preferences" i]',
      'text:manage preferences',
    ],
    customRejectBaseline: true,
    saveSelectors: ['data-nav-action:confirm', 'text:save your choices'],
    exitSelectors: ['text:exit'],
  },
  'www.ketch.com': {
    siteLabel: 'Ketch',
    privacyCenterTitle: 'your privacy',
    homeUrl: 'https://www.ketch.com/',
    cooldownScope: 'ketch',
    // Prefer Ketch SDK navigation IDs; text fallbacks only fire inside the overlay
    // (the overlay sits on top of marketing content, which won't be "visible").
    purposeTabSelectors: [
      '#ketch-preferences-navigation-consents-tab',
      '#ketch-preferences-navigation-purposes-tab',
      'text:consents',
      'text:purposes',
    ],
    // IMPORTANT: do NOT use bare CSS ID selectors like #analytics here.
    // ketch.com's marketing homepage has <section id="analytics"> etc. that would
    // make isKetchPrivacyCenterPage() fire a false positive, sending the handler
    // into the privacy-center path and causing clickElement(purposeTabSelectors)
    // to navigate via a marketing-page link.
    // Also exclude #ketch-consent-banner: it's in bannerWatchSelectors for banner
    // detection, but including it here would make isKetchPrivacyCenterPage() return
    // true whenever the banner is up (body text also contains "your privacy" from
    // the banner title), short-circuiting the banner-click path entirely.
    readySelectors: [
      '#ketch-modal',
      '#ketch-preferences',
      '#ketch-preference-panel',
      'text:save choices',
    ],
    settingsSelectors: [
      'data-nav-action:confirm',
      'text:save choices',
      '#ketch-modal',
      '#ketch-preferences',
    ],
    entrySelectors: [
      'text:consents',
      'text:your privacy',
      'text:save choices',
      'text:analytics',
      'text:behavioral advertising',
      'text:personalization',
    ],
    categoryRules: [
      { id: 'behavioral_advertising', labels: ['behavioral advertising', 'advertising'], desired: (prefs) => Boolean(prefs.advertising) },
      { id: 'analytics', labels: ['analytics'], desired: (prefs) => Boolean(prefs.analytics) },
      { id: 'personalization', labels: ['personalization'], desired: (prefs) => Boolean(prefs.functional) || prefs.uncategorized === 'accept' },
    ],
    bannerWatchSelectors: [
      'text:i understand',
      'text:your preferences',
      'text:reject all',
      'text:accept all',
      'text:save choices',
      '#ketch-consent-banner',
    ],
    bannerAcceptSelectors: [
      'text:i understand',
      'text:accept all',
    ],
    bannerRejectSelectors: [
      'text:reject all',
    ],
    // ketch.com uses its own Ketch banner as a live product demo.
    // "Your preferences" navigates to a product page, so we leave bannerManageSelectors
    // empty. "I understand" and "Reject All" fire the Ketch SDK consent/reject events
    // and dismiss the banner in-place; the false-positive readySelectors that used to
    // trigger the privacy-center path (and its location.reload() fallback) have been
    // fixed (SDK container IDs only), so banner clicks are safe again.
    bannerManageSelectors: [],
    saveSelectors: ['data-nav-action:confirm', 'text:save choices'],
    // exitSelectors intentionally empty — use only generic SDK close buttons
    // (button.ketch-btn-close, data-nav-action:close). 'text:exit' on ketch.com
    // is a navigation link to /platform/dsr-automation, not a close button.
    exitSelectors: [],
    // After saving, skip the explicit exit call — let Ketch's SDK auto-dismiss.
    // exitKetchPrivacyCenter falls back to location.reload() when the exit button
    // navigates away; that reload chain is what causes the /platform/dsr-automation redirect.
    skipExitAfterSave: true,
    // Give the Ketch SDK time to auto-close the overlay after Save.
    postSaveWaitMs: 5000,
  },
  'ketch.com': {
    siteLabel: 'Ketch',
    privacyCenterTitle: 'your privacy',
    homeUrl: 'https://www.ketch.com/',
    cooldownScope: 'ketch',
    purposeTabSelectors: [
      '#ketch-preferences-navigation-consents-tab',
      '#ketch-preferences-navigation-purposes-tab',
      'text:consents',
      'text:purposes',
    ],
    // See www.ketch.com comment — #ketch-consent-banner excluded from readySelectors
    // (same false-positive risk; it belongs in bannerWatchSelectors only).
    readySelectors: [
      '#ketch-modal',
      '#ketch-preferences',
      '#ketch-preference-panel',
      'text:save choices',
    ],
    settingsSelectors: [
      'data-nav-action:confirm',
      'text:save choices',
      '#ketch-modal',
      '#ketch-preferences',
    ],
    entrySelectors: [
      'text:consents',
      'text:your privacy',
      'text:save choices',
      'text:analytics',
      'text:behavioral advertising',
      'text:personalization',
    ],
    categoryRules: [
      { id: 'behavioral_advertising', labels: ['behavioral advertising', 'advertising'], desired: (prefs) => Boolean(prefs.advertising) },
      { id: 'analytics', labels: ['analytics'], desired: (prefs) => Boolean(prefs.analytics) },
      { id: 'personalization', labels: ['personalization'], desired: (prefs) => Boolean(prefs.functional) || prefs.uncategorized === 'accept' },
    ],
    bannerWatchSelectors: [
      'text:i understand',
      'text:your preferences',
      'text:reject all',
      'text:accept all',
      'text:save choices',
      '#ketch-consent-banner',
    ],
    bannerAcceptSelectors: [
      'text:i understand',
      'text:accept all',
    ],
    bannerRejectSelectors: [
      'text:reject all',
    ],
    // Same as www.ketch.com — "Your preferences" navigates, so bannerManageSelectors is
    // empty. "I understand" / "Reject All" dismiss the banner via Ketch SDK events.
    bannerManageSelectors: [],
    saveSelectors: ['data-nav-action:confirm', 'text:save choices'],
    exitSelectors: [],
    skipExitAfterSave: true,
    postSaveWaitMs: 5000,
  },
  'www.therealreal.com': {
    siteLabel: 'The RealReal',
    // No banner — Ketch is embedded inline on /customer-privacy only.
    // The config ensures the handler is invoked by hostname lookup without
    // needing isKetchSite() to return true (it won't on the main site).
    privacyCenterTitle: '',
    homeUrl: 'https://www.therealreal.com/',
    cooldownScope: 'therealreal',
    purposeTabSelectors: ['text:purposes', 'text:your preferences', 'text:cookie preferences'],
    readySelectors: [
      '#ketch-modal',
      '#ketch-purposes-modal',
      '#ketch-preferences',
      '#ketch-preference-panel',
      '[id*="purpose-list-switch-container"]',
      '[class*="purposeList"]',
    ],
    settingsSelectors: [
      '#ketch-modal',
      '#ketch-purposes-modal',
      '#ketch-preferences',
      '#ketch-preference-panel',
      '[id*="purpose-list-switch-container"]',
    ],
    entrySelectors: [
      'text:your privacy choices',
      'text:do not sell or share my personal information',
      'text:do not sell my personal information',
      'text:privacy preferences',
    ],
    categoryRules: [
      { id: 'analytics', labels: ['analytics', 'performance', 'measurement'], desired: (prefs) => Boolean(prefs.analytics) },
      { id: 'behavioral_advertising', labels: ['behavioral advertising', 'advertising', 'targeting', 'behavioral ads'], desired: (prefs) => Boolean(prefs.advertising) },
      { id: 'functionality', labels: ['functionality', 'functional', 'personalization'], desired: (prefs) => Boolean(prefs.functional) },
    ],
    // No banner — any banner selectors would cause false positives on main-site pages.
    bannerWatchSelectors: [],
    bannerAcceptSelectors: [],
    bannerRejectSelectors: [],
    bannerManageSelectors: [],
    saveSelectors: ['data-nav-action:confirm', 'text:save choices', 'text:save your choices', 'text:confirm', 'text:save', 'button.ketch-btn-save', 'button[type="submit"]'],
    exitSelectors: [],
  },
  'therealreal.com': {
    siteLabel: 'The RealReal',
    privacyCenterTitle: '',
    homeUrl: 'https://www.therealreal.com/',
    cooldownScope: 'therealreal',
    purposeTabSelectors: ['text:purposes', 'text:your preferences', 'text:cookie preferences'],
    readySelectors: [
      '#ketch-modal',
      '#ketch-purposes-modal',
      '#ketch-preferences',
      '#ketch-preference-panel',
      '[id*="purpose-list-switch-container"]',
      '[class*="purposeList"]',
    ],
    settingsSelectors: [
      '#ketch-modal',
      '#ketch-purposes-modal',
      '#ketch-preferences',
      '#ketch-preference-panel',
      '[id*="purpose-list-switch-container"]',
    ],
    entrySelectors: [
      'text:your privacy choices',
      'text:do not sell or share my personal information',
      'text:do not sell my personal information',
      'text:privacy preferences',
    ],
    categoryRules: [
      { id: 'analytics', labels: ['analytics', 'performance', 'measurement'], desired: (prefs) => Boolean(prefs.analytics) },
      { id: 'behavioral_advertising', labels: ['behavioral advertising', 'advertising', 'targeting', 'behavioral ads'], desired: (prefs) => Boolean(prefs.advertising) },
      { id: 'functionality', labels: ['functionality', 'functional', 'personalization'], desired: (prefs) => Boolean(prefs.functional) },
    ],
    bannerWatchSelectors: [],
    bannerAcceptSelectors: [],
    bannerRejectSelectors: [],
    bannerManageSelectors: [],
    saveSelectors: ['data-nav-action:confirm', 'text:save choices', 'text:save your choices', 'text:confirm', 'text:save', 'button.ketch-btn-save', 'button[type="submit"]'],
    exitSelectors: [],
  },
  'www.pret.com': {
    siteLabel: 'Pret A Manger',
    privacyCenterTitle: 'privacy preference center',
    homeUrl: 'https://www.pret.com/en-GB',
    cooldownScope: 'pret',
    purposeTabSelectors: ['text:purposes', 'text:functionality'],
    readySelectors: [
      '#functionality',
      '#analytics',
      '#behavioral_advertising',
    ],
    settingsSelectors: [
      '#functionality',
      '#analytics',
      '#behavioral_advertising',
    ],
    entrySelectors: [
      '#ketch-banner-button-secondary',
      'text:cookies settings',
    ],
    categoryRules: [
      { id: 'functionality', labels: ['functionality'], desired: (prefs) => Boolean(prefs.functional) },
      { id: 'analytics', labels: ['analytics', 'performance'], desired: (prefs) => Boolean(prefs.analytics) },
      { id: 'behavioral_advertising', labels: ['behavioral advertising', 'targeting', 'advertising'], desired: (prefs) => Boolean(prefs.advertising) },
    ],
    bannerWatchSelectors: [
      '#ketch-banner',
      '#ketch-consent-banner',
      '#ketch-banner-button-primary',
      '#ketch-banner-button-secondary',
    ],
    bannerAcceptSelectors: [
      '#ketch-banner-button-primary',
      '[class*="acceptAllButton"]',
    ],
    // No direct Reject All on the banner — only Customize Settings (#ketch-banner-button-secondary).
    // Clicking it opens the privacy center; once inside the class pattern clicks the modal's Reject All.
    bannerRejectSelectors: [
      '#ketch-banner-button-secondary',
      '[class*="rejectAllButton"]',
    ],
    bannerManageSelectors: [
      '#ketch-banner-button-secondary',
    ],
    saveSelectors: ['data-nav-action:confirm', 'button[type="submit"]', 'text:save choices', 'text:confirm'],
    exitSelectors: [],
  },
  'liveramp.com': {
    siteLabel: 'LiveRamp',
    privacyCenterTitle: 'settings',
    homeUrl: 'https://liveramp.com/',
    cooldownScope: 'liveramp',
    purposeTabSelectors: ['text:vendors', 'text:purposes', 'text:cookie preference'],
    readySelectors: [
      '#ketch-banner-button-primary',
      '#ketch-banner-button-secondary',
      '#ketch-banner-button-tertiary',
      'text:configure settings',
      'text:confirm',
      '[id*="purpose-list-switch-container"]',
      '[class*="purposeList"]',
    ],
    settingsSelectors: [
      'text:confirm',
      '[id*="purpose-list-switch-container"]',
      '[class*="purposeList"]',
      'text:vendors',
    ],
    entrySelectors: [
      '#ketch-banner-button-primary',
      'text:configure settings',
      'text:privacy settings',
    ],
    categoryRules: [
      { id: 'analytics', labels: ['analytics', 'statistics', 'measure content performance', 'measure advertising performance', 'understand audiences'], desired: (prefs) => Boolean(prefs.analytics) },
      { id: 'behavioral_advertising', labels: ['advertising', 'create profiles for personalised advertising', 'use profiles to select personalised advertising', 'use limited data to select advertising'], desired: (prefs) => Boolean(prefs.advertising) },
      { id: 'functionality', labels: ['functional', 'functionality', 'personalise content', 'store and/or access information on a device'], desired: (prefs) => Boolean(prefs.functional) },
    ],
    bannerWatchSelectors: [
      '#ketch-banner',
      '#ketch-consent-banner',
      '#ketch-banner-button-primary',
      '#ketch-banner-button-secondary',
      '#ketch-banner-button-tertiary',
      'text:configure settings',
      'text:reject all',
      'text:accept all',
    ],
    bannerAcceptSelectors: [
      '#ketch-banner-button-tertiary',
      'button[aria-label*="Accept All" i]',
      'text:accept all',
    ],
    bannerRejectSelectors: [
      '#ketch-banner-button-secondary',
      'button[aria-label*="Reject All" i]',
      'text:reject all',
    ],
    bannerManageSelectors: [
      '#ketch-banner-button-primary',
      'button[aria-label*="Configure Settings" i]',
      'text:configure settings',
    ],
    consentCookieName: '_ketch_consent_v1_',
    customRejectBaseline: true,
    saveSelectors: ['data-nav-action:confirm', 'text:confirm', 'text:save', 'button[type="submit"]'],
    exitSelectors: ['data-nav-action:close', 'data-nav-action:back', 'button.ketch-btn-close', 'button[aria-label*="Close" i]', 'text:close'],
    postSaveWaitMs: 5000,
    skipExitAfterSave: true,
  },
  'www.liveramp.com': {
    siteLabel: 'LiveRamp',
    privacyCenterTitle: 'settings',
    homeUrl: 'https://www.liveramp.com/',
    cooldownScope: 'liveramp',
    purposeTabSelectors: ['text:vendors', 'text:purposes', 'text:cookie preference'],
    readySelectors: [
      '#ketch-banner-button-primary',
      '#ketch-banner-button-secondary',
      '#ketch-banner-button-tertiary',
      'text:configure settings',
      'text:confirm',
      '[id*="purpose-list-switch-container"]',
      '[class*="purposeList"]',
    ],
    settingsSelectors: [
      'text:confirm',
      '[id*="purpose-list-switch-container"]',
      '[class*="purposeList"]',
      'text:vendors',
    ],
    entrySelectors: [
      '#ketch-banner-button-primary',
      'text:configure settings',
      'text:privacy settings',
    ],
    categoryRules: [
      { id: 'analytics', labels: ['analytics', 'statistics', 'measure content performance', 'measure advertising performance', 'understand audiences'], desired: (prefs) => Boolean(prefs.analytics) },
      { id: 'behavioral_advertising', labels: ['advertising', 'create profiles for personalised advertising', 'use profiles to select personalised advertising', 'use limited data to select advertising'], desired: (prefs) => Boolean(prefs.advertising) },
      { id: 'functionality', labels: ['functional', 'functionality', 'personalise content', 'store and/or access information on a device'], desired: (prefs) => Boolean(prefs.functional) },
    ],
    bannerWatchSelectors: [
      '#ketch-banner',
      '#ketch-consent-banner',
      '#ketch-banner-button-primary',
      '#ketch-banner-button-secondary',
      '#ketch-banner-button-tertiary',
      'text:configure settings',
      'text:reject all',
      'text:accept all',
    ],
    bannerAcceptSelectors: [
      '#ketch-banner-button-tertiary',
      'button[aria-label*="Accept All" i]',
      'text:accept all',
    ],
    bannerRejectSelectors: [
      '#ketch-banner-button-secondary',
      'button[aria-label*="Reject All" i]',
      'text:reject all',
    ],
    bannerManageSelectors: [
      '#ketch-banner-button-primary',
      'button[aria-label*="Configure Settings" i]',
      'text:configure settings',
    ],
    consentCookieName: '_ketch_consent_v1_',
    customRejectBaseline: true,
    saveSelectors: ['data-nav-action:confirm', 'text:confirm', 'text:save', 'button[type="submit"]'],
    exitSelectors: ['data-nav-action:close', 'data-nav-action:back', 'button.ketch-btn-close', 'button[aria-label*="Close" i]', 'text:close'],
    postSaveWaitMs: 5000,
    skipExitAfterSave: true,
  },
};

// Fallback config for any Ketch site not listed in KETCH_SITE_CONFIGS.
// privacyCenterTitle is empty so isKetchPrivacyCenterPage skips the text check
// and relies purely on DOM selectors.
const KETCH_GENERIC_CONFIG = {
  siteLabel: 'Ketch',
  privacyCenterTitle: '',
  homeUrl: null,
  cooldownScope: site,
  purposeTabSelectors: ['text:purposes'],
  // Ketch deployments use different IDs for their privacy center.
  // Pret uses #ketch-modal; Clear Eyes uses #ketch-preferences.
  // [id*="purpose-list-switch-container"] covers both patterns.
  readySelectors: [
    '#ketch-modal',
    '#ketch-purposes-modal',
    '#ketch-preferences',
    '#ketch-preference-panel',
    '[id*="purpose-list-switch-container"]',
    '[class*="purposeList"]',
  ],
  settingsSelectors: [
    '#ketch-modal',
    '#ketch-purposes-modal',
    '#ketch-preferences',
    '#ketch-preference-panel',
    '[id*="purpose-list-switch-container"]',
  ],
  entrySelectors: [
    'text:your privacy choices',
    'text:cookie preferences',
    'text:manage preferences',
    'text:customize settings',
    'text:configure settings',
  ],
  categoryRules: [
    { id: 'analytics', labels: ['analytics', 'performance', 'measurement', 'research'], desired: (prefs) => Boolean(prefs.analytics) },
    { id: 'behavioral_advertising', labels: ['behavioral advertising', 'advertising', 'targeting', 'behavioral ads', 'ad personalization'], desired: (prefs) => Boolean(prefs.advertising) },
    { id: 'functionality', labels: ['functionality', 'functional', 'personalization'], desired: (prefs) => Boolean(prefs.functional) },
  ],
  bannerWatchSelectors: [
    '#ketch-banner',
    '#ketch-consent-banner',
    '#ketch-banner-button-primary',
    '#ketch-banner-button-secondary',
    '#ketch-banner-button-tertiary',
  ],
  // Ketch publishers configure button order independently — e.g. Clear Eyes puts
  // "Manage Preferences" in primary and "Accept All" in tertiary, while OLLY puts
  // "Accept All" in primary and "Reject All" in tertiary. Positional IDs therefore
  // cannot reliably identify semantic intent across deployments. Class-based selectors
  // (acceptAllButton / rejectAllButton) work for older Ketch SDK builds; text-based
  // selectors are the only reliable cross-site signal for the newer Tailwind SDK.
  bannerAcceptSelectors: [
    '[class*="acceptAllButton"]',
    'text:accept all',
    'text:i understand',  // Ketch USNat "I Understand" = accept/acknowledge
  ],
  bannerRejectSelectors: [
    '[class*="rejectAllButton"]',
    'text:reject all',        // also matches "Reject All Non-Essential" via includes()
    'text:do not sell',       // also matches "Do Not Sell or Share My Personal Information"
    'text:opt out',           // some Ketch USNat deployments use "Opt Out"
  ],
  bannerManageSelectors: [
    '[class*="managePreferencesButton"]',
    'text:manage preferences',
    'text:configure settings',
    'text:customize settings',
    'text:customize',
  ],
  // data-nav-action:confirm is a language-agnostic structural selector: Ketch SDK
  // encodes {"action":"confirm"} in the save button's data-nav attribute (base64 JSON).
  // Older Ketch SDK builds use button.ketch-btn-save or text-based button labels.
  // button[type="submit"] is last — other modal buttons may also carry that type.
  saveSelectors: [
    'data-nav-action:confirm',
    'button.ketch-btn-save',
    'text:save choices',
    'text:save your choices',
    'text:confirm',
    'text:save',
    'button[type="submit"]',
  ],
  exitSelectors: [],
};

const MAIN_WORLD_ONLY_SITES = new Set([
  'www.theguardian.com',
  'support.theguardian.com',
  // OneTrust USNat "Notice of Right to Opt Out" sites.
  // These show a Submit-button modal that Tier 2 handles via OneTrust.RejectAll() API.
  // Tier 4 (dom-handler) would click Submit with no API prep, ignoring ccpaDoNotSell.
  'www.disney.com',
  'www.espn.com',
  'www.hulu.com',
  'www.nike.com',
  'privacy.thewaltdisneycompany.com',
  'truendo.com',
  // Zoom's OneTrust preference center must have a single owner. Its native save
  // flow runs in MAIN world; the isolated DOM fallback can leave stale UI state.
  'www.zoom.com',
]);

const DISNEY_FAMILY_USNAT_HOSTS = new Set([
  'www.disney.com',
  'www.espn.com',
  'www.hulu.com',
]);

let latestRunId = 0;
let currentRunSignature = null;
let currentMainWorldFlow = null;

document.addEventListener('__emc_pre_handle__', (event) => {
  const detail = event?.detail ?? {};
  const signature = currentRunSignature ?? document.documentElement.dataset.emcRunSignature ?? document.documentElement.dataset.emcPref ?? '';
  const preference = detail.preference ?? document.documentElement.dataset.emcPref ?? 'reject_all';
  currentMainWorldFlow = {
    signature,
    method: detail.method ?? '',
    timestamp: Date.now(),
  };
  persistPendingPreHandleAction(signature, detail.method, preference, detail.expectedGroups ?? null);
  startFlowCooldown(runCooldownScope(signature));
});

bootstrap();

async function bootstrap(force = false) {
  if (DOCUMENT_START_ONLY_SITES.has(site)) return;
  if (shouldSkipCurrentUrl()) return;
  const runId = ++latestRunId;
  const settings = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
  if (!settings?.onboardingComplete) return;

  const siteOverrides = await chrome.runtime.sendMessage({ type: 'GET_SITE_OVERRIDES', domain: site }) ?? {};
  if (siteOverrides.disabled) return;
  const prefs = resolvePrefs(settings, siteOverrides);
  currentRunSignature = prefsRunSignature(prefs);
  document.documentElement.dataset.emcRunSignature = currentRunSignature;
  document.documentElement.dataset.emcConsentScrollX = String(window.scrollX || 0);
  document.documentElement.dataset.emcConsentScrollY = String(window.scrollY || 0);
  scheduleShopifyWatch(prefs);
  scheduleOsanoWatch(prefs);
  scheduleLateDomWatch(prefs);
  const flushedPendingPreHandleAction = await flushPendingPreHandleAction(currentRunSignature);
  if (!force && flushedPendingPreHandleAction) return;
  const cooldownScope = runCooldownScope(currentRunSignature);
  if (!force &&
      isFlowCoolingDown(cooldownScope) &&
      !shouldRetryOneTrustAfterReload(currentRunSignature)) return;
  if (!force && wasHandledForCurrentPage(currentRunSignature)) return;
  if (runId !== latestRunId) return;

  if (site === 'www.ft.com') {
    // FT is handled exclusively inside its Sourcepoint iframe.
    // Do not let page-level fallbacks interact with FT's subscription / marketing
    // overlays, which can look button-like but are not consent controls.
    document.documentElement.dataset.emcPref = prefs.globalPreference;
    document.dispatchEvent(new CustomEvent('__emc_prefs__', { detail: prefs }));
    trackFTOutcome(prefs);
    return;
  }

  if (await handleSiteSpecificFlow(siteOverrides, prefs)) return;
  if (await handleShopifyBanner(prefs)) return;
  scheduleDynamicSiteSpecificWatch();
  if (runId !== latestRunId) return;

  const preferShopifyMainWorld = shouldUseShopifyMainWorldOnly(prefs);
  const mainWorldTimeoutMs = preferShopifyMainWorld
    ? SHOPIFY_MAIN_WORLD_TIMEOUT_MS
    : shouldUseExtendedOneTrustMainWorldTimeout()
      ? ONETRUST_MAIN_WORLD_TIMEOUT_MS
      : 3000;
  const mainWorldResultPromise = waitForMainWorldResult(
    mainWorldTimeoutMs,
    preferShopifyMainWorld ? prefs : null,
  );

  document.documentElement.dataset.emcPref = prefs.globalPreference;
  document.dispatchEvent(new CustomEvent('__emc_prefs__', { detail: prefs }));

  const mainWorldResult = await mainWorldResultPromise;
  if (mainWorldResult) {
    return reportAction(mainWorldResult.method, prefs.globalPreference);
  }

  const mainWorldGraceResult = await waitForMainWorldGraceResult(currentRunSignature);
  if (mainWorldGraceResult) {
    return reportAction(mainWorldGraceResult.method, prefs.globalPreference);
  }

  // The MAIN world handler may still be running — OneTrust PC flows (open panel, apply
  // prefs, settle, dismiss) can easily exceed the 3-second window. Install a secondary
  // listener so those late-finishing handlers still get counted when __emc_handled__
  // arrives after the initial window. The listener self-removes after 30 seconds and
  // checks wasHandledForCurrentPage to avoid double-counting if the DOM handler
  // also handles the page.
  scheduleLateMainWorldReport(runId, prefs);

  if (DISNEY_FAMILY_USNAT_HOSTS.has(site)) {
    const retried = await retryDisneyFamilyUsNatMainWorld(prefs);
    if (retried) return;
  }

  if (MAIN_WORLD_ONLY_SITES.has(site)) {
    return;
  }

  const domResult = await runDOMHandler(prefs);
  if (domResult?.preHandled) {
    return;
  }
  if (domResult) {
    return reportDomResult(domResult, prefs);
  }

  if (prefs.globalPreference !== 'custom') {
    const heuristicResult = runHeuristic(prefs);
    if (heuristicResult) {
      return reportAction(heuristicResult.method, prefs.globalPreference);
    }
  }

  if (force) {
    showToast('No cookie dialog matched on this page.');
  }
}

function shouldSkipCurrentUrl() {
  try {
    return DO_NOT_HANDLE_URLS.has(`${location.origin}${location.pathname}`);
  } catch (_) {
    return false;
  }
}

function scheduleDynamicSiteSpecificWatch() {
  if (siteSpecificWatchStarted) return;
  if (!DYNAMIC_SITE_SPECIFIC_HOSTS.has(site) && !isKetchSite()) {
    // Ketch banners often render 1–3 s after document_idle (lazy JS evaluation).
    // Schedule cheap DOM-only retries so the watcher starts before the
    // extension's handling window closes — isKetchSite() is sync/free.
    for (const ms of [1000, 2500, 5000]) {
      setTimeout(() => {
        if (!siteSpecificWatchStarted && isKetchSite()) scheduleDynamicSiteSpecificWatch();
      }, ms);
    }
    return;
  }
  siteSpecificWatchStarted = true;
  const keepWatchingAfterHandle = site === 'forbes.com' || site === 'www.forbes.com' || site === 'www.ketch.com' || site === 'ketch.com';
  const watchDurationMs = keepWatchingAfterHandle ? 120000 : 15000;

  let settled = false;
  let running = false;
  const stop = () => {
    settled = true;
    observer?.disconnect();
  };

  const tryHandle = async () => {
    if (settled || running) return;
    running = true;
    try {
      const settings = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      if (!settings?.onboardingComplete) return;
      const siteOverrides = await chrome.runtime.sendMessage({ type: 'GET_SITE_OVERRIDES', domain: site }) ?? {};
      if (siteOverrides.disabled) {
        stop();
        return;
      }
      const prefs = resolvePrefs(settings, siteOverrides);
      document.documentElement.dataset.emcPref = prefs.globalPreference;
      document.dispatchEvent(new CustomEvent('__emc_prefs__', { detail: prefs }));
      if (wasHandledForCurrentPage(prefsRunSignature(prefs))) return;
      const handled = await handleSiteSpecificFlow(siteOverrides, prefs);
      if (handled && !keepWatchingAfterHandle) stop();
    } finally {
      running = false;
    }
  };

  const observer = new MutationObserver(() => {
    void tryHandle();
  });

  try {
    observer.observe(document.body ?? document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
    });
  } catch (_) {
    siteSpecificWatchStarted = false;
    return;
  }

  for (const ms of [500, 1500, 3000, 5000, 8000, 12000]) {
    setTimeout(() => { void tryHandle(); }, ms);
  }
  setTimeout(() => {
    observer.disconnect();
    settled = true;
  }, watchDurationMs);
}

async function handleSiteSpecificFlow(siteOverrides, prefs) {
  if (site === 'www.lemonde.fr') {
    return handleLeMonde(prefs, siteOverrides);
  }
  const ketchConfig = getKetchSiteConfig(site);
  if (ketchConfig) {
    return handleKetchPrivacyCenter(siteOverrides, prefs, ketchConfig);
  }
  if (site === 'www.bloomberg.com') {
    ensureBloombergCcpaBridge(prefs);
    return handleBloombergTermsGate(siteOverrides, prefs);
  }
  if (site === 'www.dw.com') {
    return handleDW(prefs);
  }
  if (hasTopLevelConsentManagerSurface()) {
    return handleDW(prefs);
  }
  if (site === 'www.ft.com') {
    return handleFT(siteOverrides, prefs);
  }
  if (site === 'www.euronews.com') {
    return handleEuronews(prefs);
  }
  if (site === 'privacy.thewaltdisneycompany.com') {
    return handleDisneyPrivacyCenter(prefs);
  }
  if (site === 'www.canadiantire.ca') {
    return handleCanadianTireOneTrust(prefs);
  }
  if (site === 'github.com') {
    return handleGitHub(prefs, siteOverrides);
  }

  const config = ACCEPT_OR_WARN_SITES[site];
  if (!config) return false;

  const visible = await waitForSiteSelectors(config.detectSelectors, 4000);
  if (!visible) return false;

  const canAutoAccept = prefs.globalPreference === 'accept_all' || siteOverrides.alwaysAccept;
  if (canAutoAccept) {
    const accepted = await clickAndWaitRetry(
      config.acceptSelectors,
      config.watchSelectors ?? config.detectSelectors,
      7000,
      3
    );
    if (accepted) {
      await chrome.runtime.sendMessage({ type: 'CLEAR_UNSUPPORTED_SITE', domain: site });
      await reportAction(siteOverrides.alwaysAccept ? 'site_override:accept_all' : 'site_specific:accept_all', 'accept_all');
      return true;
    }
  }

  await chrome.runtime.sendMessage({
    type: 'REPORT_UNSUPPORTED_SITE',
    site,
    reason: config.reason,
    allowAcceptOverride: true,
  });
  return true;
}

async function handleShopifyBanner(prefs) {
  if (!hasVisibleShopifySurface()) return false;

  const dialog = findVisibleShopifyPrefsDialog();
  const banner = findVisibleShopifyBanner();

  if (prefs?.globalPreference === 'accept_all') {
    const accepted = clickShopifyButton(
      banner,
      ['#shopify-pc__banner__btn-accept', '#privacy-banner-accept-button'],
      ['accept']
    ) || clickShopifyButton(
      dialog,
      ['#shopify-pc__prefs__header-accept', '#privacy-preferences-accept-all-button'],
      ['accept all']
    );
    if (!accepted) return false;
    if (!(await waitForSelectorsToDisappear(shopifyWatchSelectors(), 7000))) return false;
    await reportAction('site_specific:shopify:accept_all', prefs.globalPreference);
    return true;
  }

  if (prefs?.globalPreference === 'reject_all') {
    const rejected = clickShopifyButton(
      banner,
      ['#shopify-pc__banner__btn-decline', '#privacy-banner-decline-button'],
      ['decline']
    ) || clickShopifyButton(
      dialog,
      ['#shopify-pc__prefs__header-decline', '#privacy-preferences-decline-all-button'],
      ['decline all', 'reject all']
    );
    if (!rejected) return false;
    if (!(await waitForSelectorsToDisappear(shopifyWatchSelectors(), 7000))) return false;
    await reportAction('site_specific:shopify:reject_all', prefs.globalPreference);
    return true;
  }

  if (prefs?.globalPreference !== 'custom') return false;

  const desiredStates = {
    preferences: Boolean(prefs.functional) || prefs.uncategorized === 'accept',
    marketing: Boolean(prefs.advertising),
    analytics: Boolean(prefs.analytics),
  };
  const allDesiredOn = Object.values(desiredStates).every(Boolean);
  const allDesiredOff = Object.values(desiredStates).every((value) => !value);

  if (allDesiredOn) {
    if (clickShopifyButton(dialog, ['#shopify-pc__prefs__header-accept', '#privacy-preferences-accept-all-button'], ['accept all']) ||
      clickShopifyButton(banner, ['#shopify-pc__banner__btn-accept', '#privacy-banner-accept-button'], ['accept'])) {
      if (await waitForSelectorsToDisappear(shopifyWatchSelectors(), 7000)) {
        await reportAction('site_specific:shopify:accept_all', prefs.globalPreference);
        return true;
      }
    }
  }

  if (allDesiredOff) {
    if (clickShopifyButton(dialog, ['#shopify-pc__prefs__header-decline', '#privacy-preferences-decline-all-button'], ['decline all', 'reject all']) ||
      clickShopifyButton(banner, ['#shopify-pc__banner__btn-decline', '#privacy-banner-decline-button'], ['decline'])) {
      if (await waitForSelectorsToDisappear(shopifyWatchSelectors(), 7000)) {
        await reportAction('site_specific:shopify:reject_all', prefs.globalPreference);
        return true;
      }
    }
  }

  let activeDialog = dialog;
  if (!activeDialog) {
    const opened = clickShopifyButton(
      banner,
      ['#shopify-pc__banner__btn-manage-prefs', '#privacy-banner-manage-preferences-button'],
      ['manage preferences', 'manage']
    );
    if (!opened) return false;
    const visible = await waitForSiteSelectors(['#shopify-pc__prefs__dialog', '.shopify-pc__prefs__dialog', '#privacy-preferences-modal'], 5000);
    if (!visible) return false;
    activeDialog = findVisibleShopifyPrefsDialog();
    if (!activeDialog) return false;
  }

  const appliedPreferences = applyShopifyGroupState(activeDialog, {
    ids: ['shopify-pc__prefs__preferences-input'],
    labels: [/personalization/i, /preferences/i, /functional/i],
  }, desiredStates.preferences);
  const appliedMarketing = applyShopifyGroupState(activeDialog, {
    ids: ['shopify-pc__prefs__marketing-input'],
    labels: [/marketing/i, /advertising/i],
  }, desiredStates.marketing);
  const appliedAnalytics = applyShopifyGroupState(activeDialog, {
    ids: ['shopify-pc__prefs__analytics-input'],
    labels: [/analytics/i, /performance/i],
  }, desiredStates.analytics);
  if (!appliedPreferences || !appliedMarketing || !appliedAnalytics) return false;

  await new Promise((resolve) => setTimeout(resolve, 250));

  const saved = clickShopifyButton(activeDialog, ['#shopify-pc__prefs__header-save', '#privacy-preferences-save-button'], ['save my choices', 'save choices', 'save']);
  if (!saved) return false;
  if (!(await waitForSelectorsToDisappear(shopifyWatchSelectors(), 7000))) return false;

  await reportAction('site_specific:shopify:custom', prefs.globalPreference);
  return true;
}

function scheduleShopifyWatch(prefs) {
  if (prefs?.globalPreference !== 'custom' || shopifyWatchStarted) return;
  shopifyWatchStarted = true;
  let stopped = false;
  let running = false;

  const stop = () => {
    stopped = true;
    try { observer?.disconnect(); } catch (_) {}
  };

  const tryHandle = async () => {
    if (stopped || running) return;
    if (currentRunSignature && wasHandledForCurrentPage(currentRunSignature)) {
      stop();
      return;
    }
    running = true;
    try {
      const handled = await handleShopifyBanner(prefs);
      if (handled) stop();
    } finally {
      running = false;
    }
  };

  const observer = new MutationObserver(() => {
    void tryHandle();
  });

  try {
    observer.observe(document.body ?? document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
    });
  } catch (_) {
    shopifyWatchStarted = false;
    return;
  }

  for (const ms of [300, 800, 1600, 3000, 5000, 8000, 12000]) {
    setTimeout(() => { void tryHandle(); }, ms);
  }
  setTimeout(() => stop(), 15000);
}

function scheduleOsanoWatch(prefs) {
  if (osanoWatchStarted) return;
  osanoWatchStarted = true;
  let stopped = false;
  let running = false;

  const stop = () => {
    stopped = true;
    try { observer?.disconnect(); } catch (_) {}
  };

  const tryHandle = async () => {
    if (stopped || running) return;
    if (currentRunSignature && wasHandledForCurrentPage(currentRunSignature)) {
      stop();
      return;
    }
    if (!hasVisibleOsanoSurface()) return;

    running = true;
    try {
      const result = await runDOMHandler(prefs);
      if (!result) return;
      if (result.preHandled) {
        stop();
        return;
      }
      await reportDomResult(result, prefs);
      stop();
    } finally {
      running = false;
    }
  };

  const observer = new MutationObserver(() => {
    void tryHandle();
  });

  try {
    observer.observe(document.body ?? document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
    });
  } catch (_) {
    osanoWatchStarted = false;
    return;
  }

  for (const ms of [300, 800, 1600, 3000, 5000, 8000, 12000, 20000, 30000]) {
    setTimeout(() => { void tryHandle(); }, ms);
  }
  setTimeout(() => stop(), 45000);
}

function scheduleLateDomWatch(prefs) {
  if (lateDomWatchStarted) return;
  if (MAIN_WORLD_ONLY_SITES.has(site)) return;
  lateDomWatchStarted = true;
  let stopped = false;
  let running = false;

  const stop = () => {
    stopped = true;
    try { observer?.disconnect(); } catch (_) {}
  };

  const tryHandle = async () => {
    if (stopped || running) return;
    if (currentRunSignature && wasHandledForCurrentPage(currentRunSignature)) {
      stop();
      return;
    }

    running = true;
    try {
      if (await handleSiteSpecificFlow({}, prefs)) {
        stop();
        return;
      }

      const result = await runDOMHandler(prefs);
      if (!result) return;
      if (result.preHandled) {
        stop();
        return;
      }
      await reportDomResult(result, prefs);
      stop();
    } finally {
      running = false;
    }
  };

  const observer = new MutationObserver(() => {
    void tryHandle();
  });

  try {
    observer.observe(document.body ?? document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
    });
  } catch (_) {
    lateDomWatchStarted = false;
    return;
  }

  for (const ms of [500, 1500, 3000, 5000, 8000, 12000, 16000, 22000, 30000]) {
    setTimeout(() => { void tryHandle(); }, ms);
  }
  setTimeout(() => stop(), 35000);
}

function hasVisibleOsanoSurface() {
  return [
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
  ].some((selector) => hasVisibleSelectorOnPage(selector));
}

function hasVisibleSelectorOnPage(selector) {
  return Array.from(document.querySelectorAll(selector)).some((el) => isVisibleForWatch(el));
}

function isVisibleForWatch(el) {
  const rect = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
}

async function handleForbesPrivacyCenter(siteOverrides, prefs) {
  return handleKetchPrivacyCenter(siteOverrides, prefs, getKetchSiteConfig('www.forbes.com'));
}

function isEffectivelyAcceptAllPrefs(prefs) {
  return Boolean(
    prefs &&
    prefs.functional === true &&
    prefs.analytics === true &&
    prefs.advertising === true &&
    prefs.ccpaDoNotSell === false
  );
}

function isBloombergCookieAcceptAligned(prefs) {
  return Boolean(
    prefs &&
    prefs.functional === true &&
    prefs.analytics === true &&
    prefs.advertising === true &&
    prefs.uncategorized === 'accept'
  );
}

function getKetchSiteConfig(host = site) {
  return KETCH_SITE_CONFIGS[host] ?? (isKetchSite() ? KETCH_GENERIC_CONFIG : null);
}

function isKetchSite() {
  if (document.querySelector('#ketch-banner, #ketch-consent-banner, #ketch-modal, #ketch-purposes-modal, #ketch-preferences, #ketch-preference-panel, [id^="ketch-banner-button"]')) return true;
  if (Array.isArray(window.semaphore) && document.querySelector('script[src*="ketch"]')) return true;
  return false;
}

async function handleKetchPrivacyCenter(siteOverrides, prefs, config, options = {}) {
  if (!config) return false;

  ensureKetchManualOpenGuard(config);

  const prefersAcceptAll = isEffectivelyAcceptAllPrefs(prefs);
  const interactionLockScope = `ketch:${config.cooldownScope}:${prefs.globalPreference}`;
  const { bypassLock = false } = options;
  if (!bypassLock && isSiteSpecificFlowLocked(interactionLockScope)) return true;

  if (config.cooldownScope === 'liveramp') {
    return handleLiveRampKetch(siteOverrides, prefs, config);
  }

  const onPrivacyCenterPage = isKetchPrivacyCenterPage(config);
  if (!onPrivacyCenterPage) {
    if (isKetchBannerVisible(config)) {
      // Some sites (e.g. ketch.com itself) use their Ketch banner as a product demo
      // where every banner button navigates to a product page rather than dismissing
      // in-place. For these sites we skip all banner interaction and only handle the
      // full privacy center overlay when it is directly visible on the page.
      if (config.skipBannerInteraction) return false;
      startSiteSpecificFlowLock(interactionLockScope);
      if (siteOverrides.alwaysAccept || prefs.globalPreference === 'accept_all') {
        const accepted = await clickAndWaitRetry(
          config.bannerAcceptSelectors,
          config.bannerWatchSelectors,
          7000,
          2,
        );
        if (!accepted) return false;
        await chrome.runtime.sendMessage({ type: 'CLEAR_UNSUPPORTED_SITE', domain: site });
        await reportAction(siteOverrides.alwaysAccept ? 'site_override:accept_all' : 'site_specific:ketch:accept_all', 'accept_all');
        return true;
      }

      if (prefs.globalPreference === 'reject_all') {
        const rejected = await clickKetchBannerActionAndWait(
          config.bannerRejectSelectors,
          config.bannerWatchSelectors,
          config.settingsSelectors,
          7000,
          2,
        );
        if (!rejected) return false;
        if (isKetchPrivacyCenterPage(config) || await waitForSiteSelectors(config.settingsSelectors, 1200)) {
          return handleKetchPrivacyCenter(siteOverrides, prefs, config, { bypassLock: true });
        }
        await chrome.runtime.sendMessage({ type: 'CLEAR_UNSUPPORTED_SITE', domain: site });
        await reportAction('site_specific:ketch:reject_all', 'reject_all');
        return true;
      }

      const opened = clickElement(config.bannerManageSelectors);
      if (!opened) return false;
      const openedCenter = await waitForSiteSelectors(config.settingsSelectors, 5000);
      if (!openedCenter) return false;
    } else {
      if (!hasVisibleKetchPrivacyCenterEntry(config)) return false;

      // Before falling back to unsupported-site reporting, give the banner one
      // more chance to render — EU geo regions can show a full Ketch banner
      // (Accept / Reject / Manage) that takes a few extra seconds to load.
      // The dynamic watcher keeps retrying for sites in DYNAMIC_SITE_SPECIFIC_HOSTS,
      // so if the banner appears later it will be handled correctly.
      if (DYNAMIC_SITE_SPECIFIC_HOSTS.has(site)) {
        const bannerLate = await waitForSiteSelectors(config.bannerWatchSelectors, 6000);
        if (bannerLate) {
          // Banner now visible — re-enter so the banner branch handles it
          return handleKetchPrivacyCenter(siteOverrides, prefs, config, { bypassLock: true });
        }
        // Banner still not visible after extra wait — the watcher will keep
        // retrying, so return false here rather than prematurely warning the user.
        return false;
      }

      if (prefs.globalPreference === 'reject_all') {
        const rejected = await clickKetchBannerActionAndWait(
          config.bannerRejectSelectors,
          config.bannerWatchSelectors,
          config.settingsSelectors,
          7000,
          2,
        );
        if (rejected) {
          if (isKetchPrivacyCenterPage(config) || await waitForSiteSelectors(config.settingsSelectors, 1200)) {
            return handleKetchPrivacyCenter(siteOverrides, prefs, config, { bypassLock: true });
          }
          await chrome.runtime.sendMessage({ type: 'CLEAR_UNSUPPORTED_SITE', domain: site });
          await reportAction('site_specific:ketch:reject_all', 'reject_all');
          return true;
        }
      }
      if (prefs.globalPreference === 'custom') {
        const opened = clickElement(config.bannerManageSelectors);
        if (opened) {
          const openedCenter = await waitForSiteSelectors(config.settingsSelectors, 5000);
          if (openedCenter) {
            return handleKetchPrivacyCenter(siteOverrides, prefs, config, { bypassLock: true });
          }
        }
      }
      if (prefersAcceptAll) {
        await chrome.runtime.sendMessage({ type: 'CLEAR_UNSUPPORTED_SITE', domain: site });
        return true;
      }
      await chrome.runtime.sendMessage({
        type: 'REPORT_UNSUPPORTED_SITE',
        site,
        reason: `${config.siteLabel} appears to be offering an accept-only/privacy-center flow for this location. Reject/custom preferences are not being applied automatically on this visit. If you want this warning to stop here, switch this site to Accept All.`,
        allowAcceptOverride: true,
      });
      return true;
    }
  }

  // User manually opened the privacy center via a footer link — don't auto-apply or close it.
  // bypassLock means the extension itself opened the panel (from banner flow); don't suppress that.
  if (!bypassLock && Date.now() < ketchManualOpenUntil) return true;
  const visible = await waitForSiteSelectors(config.readySelectors, 4000);
  if (!visible) return false;
  if (siteOverrides.alwaysAccept && isFlowCoolingDown(config.cooldownScope)) return true;
  startSiteSpecificFlowLock(interactionLockScope);

  clickElement(config.purposeTabSelectors);

  const ready = await waitForSiteSelectors(config.settingsSelectors, 3000);
  if (!ready) return false;

  const outcome = await applyKetchPreferences(config, prefs);
  if (outcome === 'locked') {
    if (prefersAcceptAll && isKetchAcceptOnlyState(config)) {
      await chrome.runtime.sendMessage({ type: 'CLEAR_UNSUPPORTED_SITE', domain: site });
      return true;
    }
    await chrome.runtime.sendMessage({
      type: 'REPORT_UNSUPPORTED_SITE',
      site,
      reason: `${config.siteLabel} opened its Ketch privacy center, but the available cookie controls are locked on this visit and could not be changed safely.`,
      allowAcceptOverride: true,
    });
    return true;
  }
  // No configurable controls found (e.g. essential-services-only panel). Save current
  // state to confirm consent with the SDK, then exit — do not warn the user.
  if (outcome === 'missing') {
    startFlowCooldown(config.cooldownScope);
    clickElement(config.saveSelectors);
    await new Promise((resolve) => setTimeout(resolve, config.postSaveWaitMs ?? 2000));
    if (!config.skipExitAfterSave) await exitKetchPrivacyCenter(config);
    await chrome.runtime.sendMessage({ type: 'CLEAR_UNSUPPORTED_SITE', domain: site });
    await reportAction('site_specific:ketch:essential_only', prefs.globalPreference);
    return true;
  }
  if (outcome !== 'applied') return false;

  startFlowCooldown(config.cooldownScope);
  if (shouldUseDirectKetchCookieFlow(config)) {
    await handleKetchViaConsentCookie(siteOverrides, prefs, config, { persistOnly: true });
  }
  if (!clickElement(config.saveSelectors)) return false;
  const postSaveWaitMs = config.postSaveWaitMs ?? 2000;
  await new Promise((resolve) => setTimeout(resolve, postSaveWaitMs));
  if (config.skipExitAfterSave) {
    const dismissed = await waitForSelectorsToDisappear(config.bannerWatchSelectors, postSaveWaitMs);
    if (!dismissed && isKetchPrivacyCenterPage(config)) return false;
  } else if (!(await exitKetchPrivacyCenter(config))) {
    return false;
  }
  await chrome.runtime.sendMessage({ type: 'CLEAR_UNSUPPORTED_SITE', domain: site });
  await reportAction(
    siteOverrides.alwaysAccept ? 'site_override:accept_all' : 'site_specific:ketch:save',
    siteOverrides.alwaysAccept ? 'accept_all' : prefs.globalPreference,
  );
  return true;
}

async function handleLiveRampKetch(siteOverrides, prefs, config) {
  if (!config) return false;

  const interactionLockScope = `ketch:${config.cooldownScope}:${prefs.globalPreference}`;
  const onPrivacyCenterPage = isKetchPrivacyCenterPage(config);
  const bannerVisible = isKetchBannerVisible(config);
  if (!bannerVisible && !onPrivacyCenterPage) return false;

  startSiteSpecificFlowLock(interactionLockScope);

  // Helper: write consent cookies as belt-and-suspenders after the SDK button click.
  // We do NOT call suppressLiveRampBanner() — manipulating Ketch's DOM elements fires
  // Ketch's MutationObserver, which runs heavy synchronous SDK code and freezes the page.
  const persistCookiesOnly = () =>
    handleKetchViaConsentCookie(siteOverrides, prefs, config, { persistOnly: true });

  // For accept_all / reject_all: click the Ketch banner button so that Ketch's own SDK
  // records consent for ALL configured purposes (not just our 3 hardcoded ones).
  // Clicking does not freeze the page — the previous freeze came solely from
  // suppressLiveRampBanner() DOM manipulation. After the click Ketch writes its full
  // consent cookie; our supplementary cookie write is only belt-and-suspenders.
  if (siteOverrides.alwaysAccept || prefs.globalPreference === 'accept_all') {
    const accepted = await clickAndWaitRetry(
      config.bannerAcceptSelectors,
      config.bannerWatchSelectors,
      7000,
      2,
    );
    if (!accepted) return false;
    await persistCookiesOnly();
    startFlowCooldown(config.cooldownScope);
    await chrome.runtime.sendMessage({ type: 'CLEAR_UNSUPPORTED_SITE', domain: site });
    await reportAction(
      siteOverrides.alwaysAccept ? 'site_override:accept_all' : 'site_specific:ketch:accept_all',
      'accept_all',
    );
    return true;
  }

  if (prefs.globalPreference === 'reject_all') {
    const rejected = await clickAndWaitRetry(
      config.bannerRejectSelectors,
      config.bannerWatchSelectors,
      7000,
      2,
    );
    if (!rejected) return false;
    await persistCookiesOnly();
    startFlowCooldown(config.cooldownScope);
    await chrome.runtime.sendMessage({ type: 'CLEAR_UNSUPPORTED_SITE', domain: site });
    await reportAction('site_specific:ketch:reject_all', 'reject_all');
    return true;
  }

  // Fast path: if existing consent already matches our prefs from a prior session,
  // no UI interaction needed — the SDK state is already correct.
  if (liveRampConsentMatches(prefs)) {
    startFlowCooldown(config.cooldownScope);
    await chrome.runtime.sendMessage({ type: 'CLEAR_UNSUPPORTED_SITE', domain: site });
    await reportAction('site_specific:ketch:cookie', prefs.globalPreference);
    return true;
  }

  // EU/GDPR banners expose a "Configure Settings" panel. Use the UI flow so Ketch's
  // own SDK records all required purposes — our 3-purpose cookie write is insufficient
  // for EU consent and triggers a reload loop if applied directly.
  // Use a direct settings-panel check rather than isKetchPrivacyCenterPage() — that
  // function uses readySelectors which include the banner button IDs, causing it to
  // return true when only the first-level banner is visible (before Configure Settings
  // has been clicked), which would incorrectly skip the panel-open step.
  const settingsPanelVisible = config.settingsSelectors.some((sel) => isSelectorVisible(sel));
  const opened = settingsPanelVisible || clickElement(config.bannerManageSelectors);
  if (opened) {
    clickElement(config.purposeTabSelectors);
    const ready = await waitForSiteSelectors(config.settingsSelectors, 5000);
    if (ready) {
      const outcome = await applyKetchPreferences(config, prefs);
      if (outcome === 'applied') {
        await handleKetchViaConsentCookie(siteOverrides, prefs, config, { persistOnly: true });
        startFlowCooldown(config.cooldownScope);
        if (!clickElement(config.saveSelectors)) return false;
        const dismissed = await waitForSelectorsToDisappear(config.bannerWatchSelectors, config.postSaveWaitMs ?? 5000);
        if (!dismissed) return false;
        await chrome.runtime.sendMessage({ type: 'CLEAR_UNSUPPORTED_SITE', domain: site });
        await reportAction('site_specific:ketch:save', prefs.globalPreference);
        return true;
      }
    }
  }

  // US/CCPA mode: no settings panel accessible — write cookies and reload.
  // Our 3-purpose cookie satisfies Ketch's US configuration and the banner stays gone.
  const customPersisted = await handleKetchViaConsentCookie(siteOverrides, prefs, config, { persistOnly: true });
  if (customPersisted) {
    startFlowCooldown(config.cooldownScope);
    await chrome.runtime.sendMessage({ type: 'CLEAR_UNSUPPORTED_SITE', domain: site });
    await reportAction('site_specific:ketch:cookie', prefs.globalPreference);
    setTimeout(() => { try { location.reload(); } catch (_) {} }, 50);
    return true;
  }

  return false;
}

function isKetchPrivacyCenterPage(config) {
  if (!config) return false;
  if (config.privacyCenterTitle) {
    const bodyText = (document.body?.innerText || '').toLowerCase();
    if (!bodyText.includes(config.privacyCenterTitle)) return false;
  }
  const saveButton = queryElement(config.saveSelectors[0]);
  const exitButton = queryElement(config.exitSelectors[0]);

  return Boolean(
    config.readySelectors.some((selector) => isSelectorVisible(selector)) ||
    isSelectorVisible('button.ketch-btn-save') ||
    isSelectorVisible('button.ketch-btn-close') ||
    (saveButton && isVisible(saveButton)) ||
    (exitButton && isVisible(exitButton))
  );
}

function isKetchBannerVisible(config) {
  if (!config) return false;
  const selectors = [
    ...(config.bannerWatchSelectors ?? []),
    ...(config.bannerAcceptSelectors ?? []),
    ...(config.bannerRejectSelectors ?? []),
    ...(config.bannerManageSelectors ?? []),
  ];
  return selectors.some((selector) => {
    const el = queryElement(selector);
    return el && isVisible(el);
  });
}

function hasVisibleKetchPrivacyCenterEntry(config) {
  if (!config) return false;
  return config.entrySelectors.some((selector) => {
    const el = queryElement(selector);
    return el && isVisible(el);
  });
}

function isKetchAcceptOnlyState(config) {
  const ids = (config?.categoryRules ?? []).map((rule) => rule.id);
  let present = 0;
  let allChecked = true;
  for (const rule of config?.categoryRules ?? []) {
    const control = findKetchCategoryControl(rule);
    if (!control) continue;
    present += 1;
    if (!readKetchToggleState(control)) allChecked = false;
  }
  if (present > 0) return allChecked;

  const text = (document.body?.innerText || '').toLowerCase();
  const alwaysActiveMatches = (text.match(/always active/g) || []).length;
  return alwaysActiveMatches >= 3;
}

async function applyKetchPreferences(config, prefs) {
  if (!config) return 'missing';
  const desiredStates = Object.fromEntries(
    (config.categoryRules ?? []).map((rule) => [rule.id, Boolean(rule.desired(prefs))]),
  );
  const mutableRules = (config.categoryRules ?? []).filter((rule) => {
    const control = findKetchCategoryControl(rule);
    return control && !isKetchToggleDisabled(control);
  });
  const allDesiredOn = mutableRules.length > 0 && mutableRules.every((rule) => desiredStates[rule.id] === true);
  const allDesiredOff = mutableRules.length > 0 && mutableRules.every((rule) => desiredStates[rule.id] === false);

  if (allDesiredOn && clickElement(config.bannerAcceptSelectors)) {
    return 'applied';
  }
  if (allDesiredOff && clickElement(config.bannerRejectSelectors)) {
    return 'applied';
  }

  let usedRejectBaseline = false;
  const shouldUseRejectBaseline = Boolean(
    config.customRejectBaseline &&
    prefs?.globalPreference === 'custom' &&
    mutableRules.length > 0 &&
    !allDesiredOn &&
    !allDesiredOff
  );
  if (shouldUseRejectBaseline && clickElement(config.bannerRejectSelectors)) {
    usedRejectBaseline = true;
    await waitForKetchRulesState(mutableRules, false, 1500);
  }

  let mutableCount = 0;
  let presentCount = 0;
  for (const rule of config.categoryRules ?? []) {
    const desired = desiredStates[rule.id];
    const control = findKetchCategoryControl(rule);
    if (!control) continue;
    presentCount += 1;
    if (isKetchToggleDisabled(control)) continue;
    mutableCount += 1;
    if (usedRejectBaseline && !desired) continue;
    await applyKetchRuleState(rule, desired);
  }

  if (presentCount > 0 && mutableCount === 0) return 'locked';
  return presentCount > 0 ? 'applied' : 'missing';
}

async function applyKetchRuleState(rule, desired, options = {}) {
  const trustCurrentState = options.trustCurrentState !== false;
  const control = findKetchCategoryControl(rule);
  if (!control) return false;
  if (isKetchToggleDisabled(control)) return false;
  const current = readKetchToggleState(control);
  if (current === desired) return true;
  forceKetchToggleState(control, desired, { trustCurrentState });
  const settled = await waitForSingleKetchRuleState(rule, desired, 500);
  if (settled) return true;
  const finalControl = findKetchCategoryControl(rule);
  return finalControl ? readKetchToggleState(finalControl) === desired : false;
}

async function waitForKetchRulesState(rules, desired, timeoutMs = 1200) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    let allMatch = true;
    for (const rule of rules) {
      const control = findKetchCategoryControl(rule);
      if (!control || readKetchToggleState(control) !== desired) {
        allMatch = false;
        break;
      }
    }
    if (allMatch) return true;
    await waitForKetchToggleSettle(100);
  }
  return false;
}

async function waitForSingleKetchRuleState(rule, desired, timeoutMs = 500) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const control = findKetchCategoryControl(rule);
    if (control && readKetchToggleState(control) === desired) return true;
    await waitForKetchToggleSettle(100);
  }
  return false;
}

function findKetchCategoryControl(rule) {
  const exact = document.getElementById(rule.id);
  if (exact) {
    const exactTarget = findKetchToggleInteractionTarget(exact);
    return exactTarget ?? exact;
  }

  const labels = (rule.labels?.length ? rule.labels : [rule.id.replaceAll('_', ' ')])
    .map((label) => label.toLowerCase());
  const toggleSelector = 'input[type="checkbox"], button[role="switch"], [role="switch"], [aria-checked]';
  const candidates = deepQuerySelectorAll('label, [role="group"], [role="listitem"], li, div, section');

  // Prefer the most specific container: the one that matches a category label but
  // contains the fewest toggle controls. A parent wrapper contains ALL category rows
  // and its text includes every label — so it always matches first in DOM order but
  // always returns the same first toggle. Picking the candidate with the minimum
  // toggle count selects the per-category row rather than the outer wrapper.
  let bestControl = null;
  let bestToggleCount = Infinity;

  for (const candidate of candidates) {
    if (!isVisible(candidate)) continue;
    const text = candidate.textContent?.trim().toLowerCase() ?? '';
    if (!text) continue;
    if (!labels.some((label) => text.includes(label))) continue;
    const control = candidate.querySelector(toggleSelector);
    if (!control) continue;
    const interactionTarget = findKetchToggleInteractionTarget(control);
    const target = (interactionTarget && isVisible(interactionTarget)) ? interactionTarget
      : isVisible(control) ? control : null;
    if (!target) continue;
    const toggleCount = candidate.querySelectorAll(toggleSelector).length;
    if (toggleCount < bestToggleCount) {
      bestToggleCount = toggleCount;
      bestControl = target;
    }
  }
  return bestControl;
}

function readKetchToggleState(control) {
  const visibleSwitchState = readKetchVisibleSwitchState(control);
  if (visibleSwitchState != null) return visibleSwitchState;
  if (!(control instanceof HTMLInputElement)) {
    const labeledInput = control.matches?.('label') ? control.querySelector('input[type="checkbox"]') : null;
    if (labeledInput instanceof HTMLInputElement) {
      if (labeledInput.hasAttribute('aria-checked')) {
        return labeledInput.getAttribute('aria-checked') === 'true';
      }
      return Boolean(labeledInput.checked);
    }
  }
  if (control instanceof HTMLInputElement) {
    if (control.hasAttribute('aria-checked')) {
      return control.getAttribute('aria-checked') === 'true';
    }
    return Boolean(control.checked);
  }
  const nestedInput = control.querySelector?.('input[type="checkbox"]');
  if (nestedInput instanceof HTMLInputElement) {
    if (nestedInput.hasAttribute('aria-checked')) {
      return nestedInput.getAttribute('aria-checked') === 'true';
    }
    return Boolean(nestedInput.checked);
  }
  const ariaChecked = control.getAttribute?.('aria-checked');
  if (ariaChecked === 'true') return true;
  if (ariaChecked === 'false') return false;
  return null;
}

function readKetchVisibleSwitchState(control) {
  const selfId = (control?.id || '').toLowerCase();
  if (selfId.includes('switch-container-on')) return true;
  if (selfId.includes('switch-container-off')) return false;
  const switchContainer = findKetchSwitchContainer(control);
  if (!switchContainer) return null;
  const id = (switchContainer.id || '').toLowerCase();
  if (id.includes('switch-container-on')) return true;
  if (id.includes('switch-container-off')) return false;
  return null;
}

function isKetchToggleDisabled(control) {
  if (!(control instanceof HTMLInputElement)) {
    const labeledInput = control.matches?.('label') ? control.querySelector('input[type="checkbox"]') : null;
    if (labeledInput instanceof HTMLInputElement) {
      return Boolean(labeledInput.disabled);
    }
  }
  if (control instanceof HTMLInputElement) {
    return Boolean(control.disabled);
  }
  const nestedInput = control.querySelector?.('input[type="checkbox"]');
  if (nestedInput instanceof HTMLInputElement) {
    return Boolean(nestedInput.disabled);
  }
  return control.getAttribute?.('aria-disabled') === 'true' || control.hasAttribute?.('disabled');
}

function forceKetchToggleState(control, checked, options = {}) {
  const trustCurrentState = options.trustCurrentState !== false;
  const current = trustCurrentState ? readKetchToggleState(control) : null;
  if (current === checked) return;
  const interactionTarget = findKetchToggleInteractionTarget(control) ?? clickTargetFor(control);
  dispatchSyntheticClick(interactionTarget);
  const afterClick = readKetchToggleState(control);
  if (afterClick === checked) return;
  if (interactionTarget && interactionTarget !== control) {
    return;
  }
  if (control instanceof HTMLInputElement) {
    forceCheckboxState(control, checked);
    return;
  }
  const nestedInput = control.querySelector?.('input[type="checkbox"]');
  if (nestedInput instanceof HTMLInputElement) {
    forceCheckboxState(nestedInput, checked);
  }
}

function findKetchToggleInteractionTarget(control) {
  if (!control) return null;
  if (control instanceof HTMLInputElement) {
    const switchContainer = findKetchSwitchContainer(control);
    if (switchContainer && isVisible(switchContainer)) return switchContainer;
    const label = control.labels?.[0] ?? control.closest?.('label');
    if (label && isVisible(label)) return label;
    return control;
  }
  if (control.matches?.('label')) {
    const switchContainer = findKetchSwitchContainer(control);
    if (switchContainer && isVisible(switchContainer)) return switchContainer;
    return control;
  }
  const nestedInput = control.querySelector?.('input[type="checkbox"]');
  if (nestedInput instanceof HTMLInputElement) {
    const switchContainer = findKetchSwitchContainer(nestedInput);
    if (switchContainer && isVisible(switchContainer)) return switchContainer;
    const label = nestedInput.labels?.[0] ?? nestedInput.closest?.('label');
    if (label && isVisible(label)) return label;
  }
  const switchContainer = findKetchSwitchContainer(control);
  if (switchContainer && isVisible(switchContainer)) return switchContainer;
  return control;
}

function findKetchSwitchContainer(control) {
  if (!control) return null;
  if (control instanceof HTMLInputElement) {
    return control.parentElement?.querySelector('[id*="switch-container"]') ?? null;
  }
  if (control.matches?.('label')) {
    return control.querySelector('[id*="switch-container"]');
  }
  return control.querySelector?.('[id*="switch-container"]') ?? null;
}

function waitForKetchToggleSettle(ms = 250) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function handleBloombergTermsGate(siteOverrides, prefs) {
  if (await tryHandleBloombergCcpaModal(prefs)) {
    return true;
  }

  const visible = await waitForSiteSelectors([
    '#cmp-consent-modal',
    '#cmp-consent-button',
    'text:we\'ve updated our terms',
    'text:we’ve updated our terms',
  ], 5000);
  if (!visible || !isBloombergTermsGateVisible()) return false;

  const canAutoAccept = isBloombergCookieAcceptAligned(prefs) || siteOverrides.alwaysAccept;
  if (!canAutoAccept) {
    await chrome.runtime.sendMessage({
      type: 'REPORT_UNSUPPORTED_SITE',
      site,
      reason: 'Bloomberg is showing an accept-only terms gate on this visit. Reject/custom cookie preferences are not being applied automatically here; use Always accept here if you want this site to auto-clear. Bloomberg’s separate Do Not Sell or Share choice still follows your CCPA setting independently.',
      allowAcceptOverride: true,
    });
    return true;
  }

  const acceptButton = findBloombergTermsAcceptButton();
  if (!acceptButton) return false;

  dispatchSyntheticClick(clickTargetFor(acceptButton));
  const dismissed = await waitForSelectorsToDisappear([
    '#cmp-consent-modal',
    '#cmp-consent-button',
  ], 7000);
  if (!dismissed) return false;

  await chrome.runtime.sendMessage({ type: 'CLEAR_UNSUPPORTED_SITE', domain: site });
  await reportAction(siteOverrides.alwaysAccept ? 'site_override:accept_all' : 'site_specific:accept_all', 'accept_all');
  scheduleBloombergCcpaWatch(prefs);
  return true;
}

function ensureKetchManualOpenGuard(config) {
  if (ketchManualOpenGuardInstalled || !config?.entrySelectors?.length) return;
  ketchManualOpenGuardInstalled = true;
  document.addEventListener('click', (event) => {
    if (!event.isTrusted) return;
    const target = event.target instanceof Element
      ? event.target.closest('a, button, [role="button"]')
      : null;
    const text = (target?.textContent || '').trim().toLowerCase();
    if (!text) return;
    const matched = config.entrySelectors.some((sel) =>
      sel.startsWith('text:') && text.includes(sel.slice(5).toLowerCase()),
    );
    if (matched) ketchManualOpenUntil = Date.now() + KETCH_MANUAL_SUPPRESS_MS;
  }, true);
}

function ensureBloombergCcpaBridge(prefs) {
  scheduleBloombergCcpaWatch(prefs);
  if (bloombergCcpaBridgeInstalled) return;
  bloombergCcpaBridgeInstalled = true;

  document.addEventListener('click', (event) => {
    const trigger = event.target instanceof Element
      ? event.target.closest('a, button, [role="button"]')
      : null;
    const text = (trigger?.textContent || '').trim().toLowerCase();
    if (!text.includes('do not sell or share my personal information')) return;
    if (event.isTrusted) {
      bloombergCcpaManualOpenUntil = Date.now() + BLOOMBERG_CCPA_MANUAL_SUPPRESS_MS;
    }
    setTimeout(() => {
      scheduleBloombergCcpaWatch(prefs);
    }, 100);
  }, true);
}

function scheduleBloombergCcpaWatch(prefsOrPromise, durationMs = 15000) {
  const token = Date.now();
  bloombergCcpaWatchToken = token;

  const run = async () => {
    const prefs = await prefsOrPromise;
    const started = Date.now();
    while (bloombergCcpaWatchToken === token && Date.now() - started < durationMs) {
      if (await tryHandleBloombergCcpaModal(prefs)) return true;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return false;
  };

  void run();
}

function isBloombergSourcepointIframeVisible() {
  return Array.from(document.querySelectorAll('iframe[id^="sp_message_iframe"], iframe[title*="SP Consent Message" i]'))
    .some((iframe) => {
      const src = iframe.getAttribute('src') || '';
      if (!/sourcepointcmp\.bloomberg\.com\/us_pm\//i.test(src)) {
        return false;
      }
      return isVisible(iframe);
    });
}

async function tryHandleBloombergCcpaModal(prefs) {
  if (!prefs || prefs.ccpaDoNotSell === undefined) return false;
  if (!isBloombergSourcepointIframeVisible()) return false;
  if (Date.now() < bloombergCcpaManualOpenUntil) return false;

  const response = await chrome.runtime.sendMessage({
    type: 'EMC_EXECUTE_BLOOMBERG_CCPA',
    enableOptOut: prefs.ccpaDoNotSell !== false,
  }).catch(() => null);

  if (!response?.handled) {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    if (isBloombergSourcepointIframeVisible()) return false;
  }

  await reportAction('site_specific:bloomberg:ccpa', prefs.globalPreference);
  return true;
}

function isBloombergTermsGateVisible() {
  const modal = document.getElementById('cmp-consent-modal');
  if (modal && isVisible(modal)) return Boolean(findBloombergTermsAcceptButton());

  const bodyText = (document.body?.innerText || '').toLowerCase();
  const hasTermsHeading = bodyText.includes("we've updated our terms") || bodyText.includes('we’ve updated our terms');
  return hasTermsHeading && Boolean(findBloombergTermsAcceptButton());
}

function findBloombergTermsAcceptButton() {
  const exact = document.getElementById('cmp-consent-button');
  if (exact && isVisible(exact)) return exact;

  for (const el of deepQuerySelectorAll('button, [role="button"], a, input[type="button"], input[type="submit"]')) {
    if (!isVisible(el)) continue;
    const text = (el.textContent || el.value || '').trim().toLowerCase();
    if (text === 'accept') return el;
  }
  return null;
}

function forceCheckboxState(input, checked) {
  if (!(input instanceof HTMLInputElement) || input.disabled) return;
  if (Boolean(input.checked) === checked) return;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked');
    descriptor?.set?.call(input, checked);
    input.setAttribute('aria-checked', checked ? 'true' : 'false');
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  } catch (_) {}
  if (readCheckboxLikeState(input) === checked) return;
  try { input.click(); } catch (_) {}
  if (readCheckboxLikeState(input) === checked) return;
  const switchContainer = input.parentElement?.querySelector('div');
  if (switchContainer && isVisible(switchContainer)) {
    dispatchSyntheticClick(switchContainer);
  }
}

function readCheckboxLikeState(input) {
  if (!(input instanceof HTMLInputElement)) return null;
  if (input.hasAttribute('aria-checked')) {
    return input.getAttribute('aria-checked') === 'true';
  }
  return Boolean(input.checked);
}

async function exitKetchPrivacyCenter(config) {
  if (!config || !isKetchPrivacyCenterPage(config)) return true;

  const exitSelectors = [
    ...(config.exitSelectors ?? []),
    'data-nav-action:close',
    'data-nav-action:back',
    'button.ketch-btn-close',
    'button[aria-label*="Close" i]',
    'text:close',
  ];

  if (clickElement(exitSelectors)) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    if (!isKetchPrivacyCenterPage(config)) return true;
  }

  try {
    const referrer = document.referrer || '';
    if (new RegExp(`^https?:\\/\\/(www\\.)?${site.replaceAll('.', '\\.')}\\/`, 'i').test(referrer) && history.length > 1) {
      history.back();
      await new Promise((resolve) => setTimeout(resolve, 1500));
      if (!isKetchPrivacyCenterPage(config)) return true;
    }
  } catch (_) {}

  try {
    if (config.homeUrl) {
      const targetUrl = new URL(config.homeUrl, location.href);
      const currentUrl = new URL(location.href);
      if (targetUrl.origin === currentUrl.origin && targetUrl.pathname === currentUrl.pathname) {
        location.reload();
        await new Promise((resolve) => setTimeout(resolve, 2000));
        if (!isKetchPrivacyCenterPage(config)) return true;
      }
    }
  } catch (_) {}

  try {
    if (config.homeUrl) {
      location.replace(config.homeUrl);
      await new Promise((resolve) => setTimeout(resolve, 2000));
      if (!isKetchPrivacyCenterPage(config)) return true;
    }
  } catch (_) {
    if (config.homeUrl) {
      location.href = config.homeUrl;
      await new Promise((resolve) => setTimeout(resolve, 2000));
      if (!isKetchPrivacyCenterPage(config)) return true;
    }
  }
  return !isKetchPrivacyCenterPage(config);
}

async function retryDisneyFamilyUsNatMainWorld(prefs) {
  const ready = await waitForDisneyFamilyUsNatReady(4000);
  if (!ready) return false;

  document.documentElement.dataset.emcPref = prefs.globalPreference;
  document.dispatchEvent(new CustomEvent('__emc_prefs__', { detail: prefs }));

  const retried = await waitForMainWorldResult(5000);
  if (!retried) return false;
  await reportAction(retried.method, prefs.globalPreference);
  return true;
}

async function waitForDisneyFamilyUsNatReady(timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (
      document.getElementById('ot-group-id-BG559') ||
      queryElement('label[for="ot-group-id-BG559"]') ||
      queryElement('#onetrust-accept-btn-handler')
    ) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

async function handleDW(prefs) {
  const selectors = [
    '#cmpwrapper',
    '#cmpbox',
    '#cmpinlinepreferencesbox',
    '.cmpboxbtnyes',
    '.cmpboxbtnno',
    '.cmpboxbtnaccept',
    '.cmpboxbtnreject',
    '.cmptxt_btn_yes',
    '.cmptxt_btn_no',
    '.cmptxt_btn_save',
    '.cmptxt_btn_yes2',
    '.cmptxt_btn_no2',
    '.cmptxt_btn_save2',
    '.cmptogglelink',
    '.cmpboxbtnyescustomchoices',
    '.cmpboxbtnrejectcustomchoices',
  ];

  const visible = await waitForSiteSelectors(selectors, 4000);
  if (!visible) return false;

  const onSettingsPage = Boolean(queryElement('.cmpboxbtnyescustomchoices') || queryElement('.cmpboxbtnrejectcustomchoices') || queryElement('text:save selection'));
  if (isFlowCoolingDown('dw') && !onSettingsPage) return true;

  if (onSettingsPage) {
    startFlowCooldown('dw');
    const configured = await configureDWSettings(prefs);
    if (configured) {
      await reportAction(
        prefs.globalPreference === 'accept_all' ? 'site_specific:accept_all' : 'site_specific:settings_save',
        prefs.globalPreference,
      );
      return true;
    }
  }

  if (prefs.globalPreference === 'accept_all') {
    startFlowCooldown('dw');
    const accepted = await clickAndWait(
      ['.cmptxt_btn_yes2', '.cmptxt_btn_yes', '.cmpboxbtnyes', '#cmpbntyestxt'],
      dwWatchSelectors(),
      6000,
    );
    if (accepted) {
      await reportAction('site_specific:accept_all', 'accept_all');
      return true;
    }
    if (await waitForSiteSelectors(['.cmpboxbtnyescustomchoices', '.cmpboxbtnrejectcustomchoices', 'text:save selection'], 1200)) {
      const configured = await configureDWSettings(prefs);
      if (configured) {
        await reportAction('site_specific:accept_all', 'accept_all');
        return true;
      }
    }
  } else if (prefs.globalPreference === 'reject_all') {
    startFlowCooldown('dw');
    const rejected = await clickAndWait(
      ['.cmptxt_btn_no2', '.cmptxt_btn_no', '.cmpboxbtnno', '#cmpbntnotxt'],
      dwWatchSelectors(),
      6000,
    );
    if (rejected) {
      await reportAction('site_specific:deny_all', prefs.globalPreference);
      return true;
    }
    if (await waitForSiteSelectors(['.cmpboxbtnyescustomchoices', '.cmpboxbtnrejectcustomchoices', 'text:save selection'], 1200)) {
      const configured = await configureDWSettings(prefs);
      if (configured) {
        await reportAction('site_specific:settings_save', prefs.globalPreference);
        return true;
      }
    }
  }

  const settingsOpened = clickElement(['.cmpboxbtncustom', '#cmpbntcustomtxt']);
  if (settingsOpened) {
    startFlowCooldown('dw');
    await new Promise((resolve) => setTimeout(resolve, 250));
    const configured = await configureDWSettings(prefs);
    if (configured) {
      await reportAction(
        prefs.globalPreference === 'accept_all' ? 'site_specific:accept_all' : 'site_specific:settings_save',
        prefs.globalPreference,
      );
      return true;
    }
  }

  return false;
}

async function handleFT(siteOverrides, prefs) {
  // FT's real consent actions happen inside a cross-origin Sourcepoint iframe.
  // This page-level helper only opens the correct manager entry point for the US variant,
  // where FT injects a "Manage Cookies" / "Do Not Sell My Personal Information" link
  // outside the iframe. Success is reported by the dedicated frame handler.
  if (prefs.globalPreference === 'accept_all' || siteOverrides.alwaysAccept) {
    return false;
  }
  if (isFlowCoolingDown('ft')) return true;

  const openerSelectors = [
    'a[aria-label*="do not sell my personal information" i]',
    'button[aria-label*="do not sell my personal information" i]',
    'a[title*="do not sell my personal information" i]',
    'button[title*="do not sell my personal information" i]',
    'a[href*="/preferences/manage-cookies"]',
    'button[data-trackable*="Manage Cookies" i]',
    'a[data-trackable*="Manage Cookies" i]',
    'text:do not sell my personal information',
    'text:manage cookies',
  ];

  const visible = await waitForSiteSelectors(openerSelectors, 3000);
  if (!visible) return false;

  startFlowCooldown('ft');
  return clickElement(openerSelectors);
}

async function handleEuronews(prefs) {
  if (isFlowCoolingDown('euronews')) return true;

  const selectors = didomiWatchSelectors();
  const visible = await waitForSiteSelectors(selectors, 5000);
  if (!visible) return false;

  startFlowCooldown('euronews');

  if (prefs.globalPreference === 'accept_all') {
    const accepted = await clickAndWait(
      [
        '#didomi-notice-agree-button',
        'button[aria-label*="Agree and close" i]',
        'button[aria-label*="Accept and close" i]',
        'text:agree and close',
        'text:accept and close',
        'text:accepter et fermer',
        'text:alle akzeptieren',
        'text:aceptar y cerrar',
        'text:accetta e chiudi',
        'text:aceitar e fechar',
      ],
      selectors,
      7000,
    );
    if (accepted) {
      await reportAction('site_specific:didomi:accept_all', 'accept_all');
      return true;
    }
  } else {
    const rejected = await clickAndWait(
      [
        '.didomi-continue-without-agreeing',
        '[role="button"][class*="didomi-continue-without-agreeing"]',
        'text:continue without agreeing',
        'text:continuer sans accepter',
        'text:ohne zustimmung fortfahren',
        'text:continuar sin aceptar',
        'text:continua senza accettare',
      ],
      selectors,
      7000,
    );
    if (rejected) {
      await reportAction('site_specific:didomi:reject_all', prefs.globalPreference);
      return true;
    }
  }

  const learnedMore = clickElement([
    '#didomi-notice-learn-more-button',
    'button[aria-label*="Learn More" i]',
    'text:learn more',
    'text:en savoir plus',
    'text:mehr erfahren',
    'text:más información',
    'text:scopri di più',
  ]);
  if (!learnedMore) return false;

  const configured = await configureDidomiPreferences(prefs.globalPreference);
  if (configured) {
    await reportAction(
      prefs.globalPreference === 'accept_all' ? 'site_specific:didomi:accept_all' : 'site_specific:didomi:settings_save',
      prefs.globalPreference,
    );
    return true;
  }

  return false;
}

async function handleDisneyPrivacyCenter(prefs) {
  const visible = await waitForSiteSelectors([
    '#onetrust-pc-sdk',
    '.save-preference-btn-handler',
    '#ot-group-id-SSPD_BG',
    'a.df-privacy-compliance',
    '.df-privacy-compliance',
  ], 5000);
  if (!visible) return false;

  const panelOpen = isSelectorVisible('#onetrust-pc-sdk') || isSelectorVisible('.save-preference-btn-handler');
  if (!panelOpen) {
    const opened = clickElement([
      'a.df-privacy-compliance',
      '.df-privacy-compliance',
    ]);
    if (!opened) return false;
  }

  const ready = await waitForSiteSelectors([
    '.save-preference-btn-handler',
    '#ot-group-id-SSPD_BG',
  ], 5000);
  if (!ready) return false;

  const shouldEnable = prefs.ccpaDoNotSell === false;
  const toggle = document.getElementById('ot-group-id-SSPD_BG');
  if (!toggle) return false;

  if (Boolean(toggle.checked) !== shouldEnable) {
    const label = document.querySelector('label[for="ot-group-id-SSPD_BG"]');
    if (!label || !isVisible(label)) return false;
    try {
      label.click();
    } catch (_) {
      dispatchSyntheticClick(label);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  const saved = clickElement(['.save-preference-btn-handler']);
  if (!saved) return false;

  const expectedGroup = `SSPD_BG:${shouldEnable ? '1' : '0'}`;
  if (!(await waitForCookieGroup(expectedGroup, 5000))) return false;

  await reportAction('site_specific:disney:privacy_center', prefs.globalPreference);
  return true;
}

async function handleCanadianTireOneTrust(prefs) {
  const visible = await waitForSiteSelectors([
    '#onetrust-pc-sdk',
    '.save-preference-btn-handler',
    '#ot-sdk-btn',
    '.ot-sdk-show-settings',
  ], 5000);
  if (!visible) return false;

  if (prefs.globalPreference === 'accept_all') {
    const accepted = clickNativeElement([
      '#accept-recommended-btn-handler',
      'button[aria-label*="Allow All" i]',
      'button[title*="Allow All" i]',
    ]);
    if (!accepted) return false;
    if (!(await waitForCanadianTireCookieGroups({
      C0002: true,
      C0003: true,
      C0004: true,
    }, 5000))) return false;
    if (!(await closeCanadianTireOneTrustPanel())) return false;
    await reportAction('site_specific:accept_all', prefs.globalPreference);
    return true;
  }

  const panelOpen = isSelectorVisible('#onetrust-pc-sdk') || isSelectorVisible('.save-preference-btn-handler');
  if (!panelOpen) {
    const opened = clickNativeElement([
      '#ot-sdk-btn',
      '.ot-sdk-show-settings',
      '#onetrust-pc-btn-handler',
    ]);
    if (!opened) return false;
  }

  const ready = await waitForSiteSelectors([
    '#onetrust-pc-sdk',
    '.save-preference-btn-handler',
    '#close-pc-btn-handler',
    '#ot-group-id-C0002',
    '#ot-group-id-C0003',
    '#ot-group-id-C0004',
  ], 5000);
  if (!ready) return false;

  let expectedGroups = null;

  if (prefs.globalPreference === 'reject_all') {
    const rejected = clickNativeElement([
      '.ot-pc-refuse-all-handler',
      '#onetrust-reject-all-handler',
    ]);
    if (!rejected) {
      const applied = [
        setCanadianTireOneTrustToggle('ot-group-id-C0002', false),
        setCanadianTireOneTrustToggle('ot-group-id-C0003', false),
        setCanadianTireOneTrustToggle('ot-group-id-C0004', false),
      ];
      if (applied.some((value) => value === false)) return false;
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (!clickNativeElement([
        '.save-preference-btn-handler',
        '#onetrust-accept-btn-handler',
      ])) {
        return false;
      }
    }

    expectedGroups = {
      C0002: false,
      C0003: false,
      C0004: false,
    };
    if (!(await waitForCanadianTireCookieGroups(expectedGroups, 5000))) return false;
    syncCanadianTireToggleScaffold(expectedGroups);
    if (!(await closeCanadianTireOneTrustPanel())) return false;
    await reportAction('site_specific:deny_all', prefs.globalPreference);
    return true;
  }

  if (prefs.globalPreference !== 'custom') return false;

  const applied = [
    setCanadianTireOneTrustToggle('ot-group-id-C0002', Boolean(prefs.analytics)),
    setCanadianTireOneTrustToggle('ot-group-id-C0003', Boolean(prefs.functional)),
    setCanadianTireOneTrustToggle('ot-group-id-C0004', Boolean(prefs.advertising) && prefs.ccpaDoNotSell === false),
  ];
  if (applied.some((value) => value === false)) return false;

  await new Promise((resolve) => setTimeout(resolve, 250));

  if (!clickNativeElement([
    '.save-preference-btn-handler',
    '#onetrust-accept-btn-handler',
  ])) {
    return false;
  }

  expectedGroups = {
    C0002: Boolean(prefs.analytics),
    C0003: Boolean(prefs.functional),
    C0004: Boolean(prefs.advertising) && prefs.ccpaDoNotSell === false,
  };
  if (!(await waitForCanadianTireCookieGroups(expectedGroups, 5000))) return false;
  syncCanadianTireToggleScaffold(expectedGroups);
  if (!(await closeCanadianTireOneTrustPanel())) return false;

  await reportAction('site_specific:canadiantire:onetrust:custom', prefs.globalPreference);
  return true;
}

function setCanadianTireOneTrustToggle(id, checked) {
  const toggle = document.getElementById(id);
  if (!(toggle instanceof HTMLInputElement) || toggle.disabled || toggle.getAttribute('aria-disabled') === 'true') {
    return false;
  }
  if (Boolean(toggle.checked) === checked) return true;

  const label = document.querySelector(`label[for="${id}"]`);
  if (label && isVisible(label)) {
    try {
      label.click();
    } catch (_) {
      dispatchSyntheticClick(label);
    }
  }
  if (Boolean(toggle.checked) === checked) return true;

  try {
    toggle.click();
  } catch (_) {
    dispatchSyntheticClick(toggle);
  }
  if (Boolean(toggle.checked) === checked) return true;

  forceCheckboxState(toggle, checked);
  return Boolean(toggle.checked) === checked;
}

async function waitForCanadianTireCookieGroups(expectedGroups, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const groups = readCanadianTireCookieGroups();
    if (groups &&
        Object.entries(expectedGroups).every(([group, expected]) => groups[group] === expected)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  const groups = readCanadianTireCookieGroups();
  return Boolean(groups &&
    Object.entries(expectedGroups).every(([group, expected]) => groups[group] === expected));
}

function readCanadianTireCookieGroups() {
  const raw = document.cookie
    .split('; ')
    .find((part) => part.startsWith('OptanonConsent='))
    ?.slice('OptanonConsent='.length);
  if (!raw) return null;

  try {
    const decoded = decodeURIComponent(raw);
    const groupText = decoded.match(/groups=([^&]+)/)?.[1] ?? '';
    return Object.fromEntries(groupText.split(',').map((entry) => {
      const [group, value] = entry.split(':');
      return [group, value === '1'];
    }));
  } catch (_) {
    return null;
  }
}

function syncCanadianTireToggleScaffold(expectedGroups) {
  for (const [group, checked] of Object.entries(expectedGroups ?? {})) {
    const toggle = document.getElementById(`ot-group-id-${group}`);
    if (!(toggle instanceof HTMLInputElement)) continue;
    forceCheckboxState(toggle, checked);
  }
}

async function closeCanadianTireOneTrustPanel() {
  if (!(isSelectorVisible('#onetrust-pc-sdk') || isSelectorVisible('.onetrust-pc-dark-filter'))) {
    return true;
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    clickNativeElement([
      '#close-pc-btn-handler',
      '.onetrust-close-btn-handler.ot-close-icon',
    ]);
    if (await waitForSelectorsToDisappear([
      '#onetrust-pc-sdk',
      '.onetrust-pc-dark-filter',
    ], 600)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  return waitForSelectorsToDisappear([
    '#onetrust-pc-sdk',
    '.onetrust-pc-dark-filter',
  ], 1500);
}

async function handleGitHub(prefs, siteOverrides) {
  const DIALOG_SEL = 'ghcc-consent [role="dialog"][aria-label="Manage cookie preferences"]';

  const visible = await waitForSiteSelectors([DIALOG_SEL], 5000);
  if (!visible) return false;

  const dialog = document.querySelector(DIALOG_SEL);
  if (!dialog || !isVisible(dialog)) return false;

  const acceptAll = prefs.globalPreference === 'accept_all' || siteOverrides.alwaysAccept;

  // Set each configurable radio group (Required has no radios and is skipped naturally).
  for (const group of dialog.querySelectorAll('[role="radiogroup"]')) {
    const sampleInput = group.querySelector('input[type="radio"]');
    if (!sampleInput) continue;
    const categoryName = sampleInput.name.toLowerCase().replace(/\s+/g, '');
    const desiredValue = githubCategoryValue(categoryName, prefs, acceptAll);
    const input = group.querySelector(`input[type="radio"][value="${desiredValue}"]`);
    if (!input) continue;
    const label = dialog.querySelector(`label[for="${CSS.escape(input.id)}"]`);
    const target = label ?? input;
    if (isVisible(target)) dispatchSyntheticClick(target);
  }

  await new Promise((r) => setTimeout(r, 300));

  const saveButton = Array.from(dialog.querySelectorAll('button')).find(
    (btn) => /save changes/i.test(btn.textContent),
  );
  if (!saveButton || !isVisible(saveButton)) return false;
  dispatchSyntheticClick(saveButton);

  const dismissed = await waitForSelectorsToDisappear([DIALOG_SEL], 5000);
  if (!dismissed) return false;

  await chrome.runtime.sendMessage({ type: 'CLEAR_UNSUPPORTED_SITE', domain: site });
  const method = acceptAll
    ? (siteOverrides.alwaysAccept ? 'site_override:accept_all' : 'site_specific:github:accept_all')
    : prefs.globalPreference === 'reject_all'
    ? 'site_specific:github:reject_all'
    : 'site_specific:github:custom';
  await reportAction(method, prefs.globalPreference);
  return true;
}

function githubCategoryValue(normalizedName, prefs, acceptAll) {
  if (acceptAll) return 'accept';
  if (prefs.globalPreference === 'reject_all') return 'reject';
  // custom
  if (normalizedName === 'analytics') return prefs.analytics ? 'accept' : 'reject';
  if (normalizedName === 'socialmedia') return prefs.advertising ? 'accept' : 'reject';
  return prefs.uncategorized === 'accept' ? 'accept' : 'reject';
}

async function handleLeMonde(prefs, siteOverrides) {
  const selectors = [
    '.gdpr-lmd-wall',
    '[data-gdpr-expression="acceptAll"]',
    '[data-gdpr-expression="denyAll"]',
    '[data-gdpr-action="settings"]',
    '[data-gdpr-action="save"]',
  ];

  const visible = await waitForSiteSelectors(selectors, 4000);
  if (!visible) return false;

  if (prefs.globalPreference === 'accept_all' || siteOverrides.alwaysAccept) {
    const accepted = await clickAndWait(
      ['[data-gdpr-expression="acceptAll"]', '.gdpr-lmd-button[data-gdpr-expression="acceptAll"]', '.gdpr-lmd-button--slate-darker'],
      selectors,
    );
    if (accepted) {
      await chrome.runtime.sendMessage({ type: 'CLEAR_UNSUPPORTED_SITE', domain: site });
      await reportAction(siteOverrides.alwaysAccept ? 'site_override:accept_all' : 'site_specific:accept_all', 'accept_all');
      return true;
    }
  }

  const deniedDirectly = await clickAndWait(
    [
      '[data-gdpr-expression="denyAll"]',
      '.gdpr-lmd-wall__refuse-link',
      'button[data-gdpr-expression="denyAll"]',
      'a[data-gdpr-expression="denyAll"]',
    ],
    selectors,
  );
  if (deniedDirectly) {
    await chrome.runtime.sendMessage({ type: 'CLEAR_UNSUPPORTED_SITE', domain: site });
    await reportAction('site_specific:deny_all', prefs.globalPreference);
    return true;
  }

  const settingsButton = document.querySelector('[data-gdpr-action="settings"]');
  if (settingsButton && isVisible(settingsButton)) {
    dispatchSyntheticClick(settingsButton);
    const configured = await configureLeMondeSettings(prefs);
    if (configured) {
      await chrome.runtime.sendMessage({ type: 'CLEAR_UNSUPPORTED_SITE', domain: site });
      await reportAction('site_specific:settings_save', prefs.globalPreference);
      return true;
    }
  }

  await chrome.runtime.sendMessage({
    type: 'REPORT_UNSUPPORTED_SITE',
    site,
    reason: 'Le Monde opened a settings path we could not fully apply automatically on this visit.',
    allowAcceptOverride: true,
  });
  return true;
}

async function configureLeMondeSettings(prefs) {
  const settingsSelectors = [
    '[data-gdpr-expression="denyAll"]',
    '[data-gdpr-action="save"]',
    'button[aria-label*="Refuser" i]',
    'button[aria-label*="Save" i]',
    'button[title*="Save" i]',
  ];

  const visible = await waitForSiteSelectors(settingsSelectors, 3000);
  if (!visible) return false;

  const directDeny = await clickAndWait(
    [
      '[data-gdpr-expression="denyAll"]',
      'button[aria-label*="Refuser" i]',
      'button[title*="Refuser" i]',
      'button[data-gdpr-expression="denyAll"]',
      'a[data-gdpr-expression="denyAll"]',
    ],
    ['.gdpr-lmd-wall', '[data-gdpr-action="save"]'],
  );
  if (directDeny) return true;

  if (prefs.globalPreference !== 'accept_all') {
    await turnOffLeMondeInputs();
  }

  const saveButton = document.querySelector('[data-gdpr-action="save"]') ||
    document.querySelector('button[aria-label*="Save" i]') ||
    findButtonByText(['save', 'enregistrer']);
  if (!saveButton || !isVisible(saveButton)) return false;

  dispatchSyntheticClick(saveButton);
  return waitForSelectorsToDisappear(['.gdpr-lmd-wall', '[data-gdpr-action="save"]'], 5000);
}

async function turnOffLeMondeInputs() {
  const toggles = Array.from(document.querySelectorAll('input[type="checkbox"], input[type="radio"], [role="switch"], [aria-checked]'));
  for (const toggle of toggles) {
    const text = (toggle.closest('label, [role="button"], button, div')?.textContent || '').toLowerCase();
    if (/strict|necessary|essentiel|nécessaire/.test(text)) continue;

    if (toggle.matches('[role="switch"], [aria-checked]')) {
      const checked = toggle.getAttribute('aria-checked') === 'true';
      if (checked && isVisible(toggle)) dispatchSyntheticClick(toggle);
      continue;
    }

    if ('checked' in toggle && toggle.checked && !toggle.disabled && isVisible(toggle)) {
      dispatchSyntheticClick(toggle);
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 150));
}

function scheduleLateMainWorldReport(capturedRunId, prefs) {
  const signature = currentRunSignature;
  const cleanupTimer = setTimeout(() => {
    document.removeEventListener('__emc_handled__', lateHandler);
  }, 30000);
  function lateHandler(event) {
    clearTimeout(cleanupTimer);
    document.removeEventListener('__emc_handled__', lateHandler);
    if (capturedRunId !== latestRunId) return;
    if (wasHandledForCurrentPage(signature)) return;
    void reportAction(event.detail?.method ?? 'cmp_api:late', prefs.globalPreference);
  }
  document.addEventListener('__emc_handled__', lateHandler);
}

function shouldUseExtendedOneTrustMainWorldTimeout() {
  return [
    '#onetrust-banner-sdk',
    '#onetrust-consent-sdk',
    '#onetrust-pc-sdk',
    '#onetrust-pc-btn-handler',
    '.ot-sdk-show-settings',
    '.save-preference-btn-handler',
    '.category-switch-handler',
    "input[id^='ot-group-id-']",
  ].some((selector) => document.querySelector(selector));
}

function waitForMainWorldResult(timeoutMs, redispatchPrefs = null) {
  return new Promise((resolve) => {
    let intervalId = null;
    const timer = setTimeout(() => {
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener('__emc_handled__', handler);
      resolve(null);
    }, timeoutMs);

    function handler(e) {
      clearTimeout(timer);
      if (intervalId) clearInterval(intervalId);
      resolve(e.detail);
    }

    if (redispatchPrefs?.globalPreference) {
      intervalId = setInterval(() => {
        document.documentElement.dataset.emcPref = redispatchPrefs.globalPreference;
        document.dispatchEvent(new CustomEvent('__emc_prefs__', { detail: redispatchPrefs }));
      }, 400);
    }

    document.addEventListener('__emc_handled__', handler, { once: true });
  });
}

function hasFreshMainWorldFlowInProgress(signature) {
  return Boolean(
    currentMainWorldFlow &&
    currentMainWorldFlow.signature === signature &&
    currentMainWorldFlow.method &&
    (Date.now() - currentMainWorldFlow.timestamp) < MAIN_WORLD_FLOW_IN_PROGRESS_TTL_MS
  );
}

async function waitForMainWorldGraceResult(signature) {
  if (!hasFreshMainWorldFlowInProgress(signature)) return null;
  return waitForMainWorldResult(MAIN_WORLD_FLOW_GRACE_MS);
}

function shouldUseShopifyMainWorldOnly(prefs) {
  if (prefs?.globalPreference !== 'custom') return false;
  return [
    '#shopify-pc__banner',
    '#shopify-pc__prefs',
    '#shopify-pc__prefs__dialog',
    '.shopify-pc__prefs__dialog',
    '#privacy-cookie-banner',
    '#privacy-preferences-modal',
    '#shopify-pc__banner__btn-manage-prefs',
    '#privacy-banner-manage-preferences-button',
    '#shopify-pc__prefs__header-save',
    '#privacy-preferences-save-button',
  ].some((selector) => document.querySelector(selector));
}

function resolvePrefs(settings, siteOverrides = {}) {
  if (siteOverrides.alwaysAccept) {
    return {
      functional: true,
      analytics: true,
      advertising: true,
      ccpaDoNotSell: settings.categoryPreferences?.ccpaDoNotSell ?? false,
      uncategorized: 'accept',
      globalPreference: 'accept_all',
    };
  }
  if (settings.globalPreference === 'custom') {
    return { ...settings.categoryPreferences, globalPreference: 'custom' };
  }
  const ccpaDoNotSell = settings.categoryPreferences?.ccpaDoNotSell ?? (settings.globalPreference !== 'accept_all');
  const allOn = { functional: true, analytics: true, advertising: true, ccpaDoNotSell };
  const allOff = { functional: false, analytics: false, advertising: false, ccpaDoNotSell };
  const base = settings.globalPreference === 'accept_all' ? allOn : allOff;
  return { ...base, globalPreference: settings.globalPreference };
}

async function waitForSiteSelectors(selectors, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const found = selectors.some((selector) => {
      const el = queryElement(selector);
      return el && isVisible(el);
    });
    if (found) return true;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

function isSelectorVisible(selector) {
  const el = queryElement(selector);
  return Boolean(el && isVisible(el));
}

async function clickAndWait(clickSelectors, watchSelectors, timeoutMs = 5000) {
  if (!clickElement(clickSelectors)) return false;
  return waitForSelectorsToDisappear(watchSelectors, timeoutMs);
}

async function clickAndWaitRetry(clickSelectors, watchSelectors, timeoutMs = 5000, attempts = 2) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (!clickElement(clickSelectors)) return false;
    if (await waitForSelectorsToDisappear(watchSelectors, timeoutMs)) return true;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  return false;
}

async function clickKetchBannerActionAndWait(clickSelectors, watchSelectors, settingsSelectors, timeoutMs = 5000, attempts = 2) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (!clickElement(clickSelectors)) return false;
    const settled = await waitForKetchBannerTransition(watchSelectors, settingsSelectors, timeoutMs);
    if (settled) return true;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  return false;
}

function clickNativeElement(selectors) {
  const el = firstVisibleElementOnPage(selectors);
  if (!el) return false;
  const target = clickTargetFor(el);
  try {
    target.focus?.();
    target.click?.();
    return true;
  } catch (_) {}
  return dispatchSyntheticClick(target);
}

function clickElement(selectors) {
  for (const selector of selectors) {
    const el = queryElement(selector);
    if (el && isVisible(el)) {
      dispatchSyntheticClick(clickTargetFor(el));
      return true;
    }
  }
  return false;
}

function clickShopifyButton(root, selectors = [], textOptions = []) {
  if (!root) return false;
  for (const selector of selectors) {
    const el = root.querySelector(selector);
    if (el && isVisible(el)) {
      return activateShopifyButton(el);
    }
  }
  const lowered = textOptions.map((text) => text.toLowerCase());
  for (const el of root.querySelectorAll('button, [role="button"]')) {
    const text = el.textContent?.trim().toLowerCase() ?? '';
    if (!text || !isVisible(el)) continue;
    if (lowered.some((phrase) => text.includes(phrase))) {
      return activateShopifyButton(el);
    }
  }
  return false;
}

function activateShopifyButton(el) {
  const target = clickTargetFor(el);
  try {
    target.focus?.();
    target.click?.();
    return true;
  } catch (_) {}
  return dispatchSyntheticClick(target);
}

function hasVisibleShopifySurface() {
  return shopifyWatchSelectors().some((selector) => {
    return Array.from(document.querySelectorAll(selector)).some((el) => isVisible(el));
  });
}

function shopifyWatchSelectors() {
  return [
    '#shopify-pc__banner',
    '.shopify-pc__banner__dialog',
    '#shopify-pc__prefs',
    '#shopify-pc__prefs__dialog',
    '.shopify-pc__prefs__dialog',
    '#privacy-cookie-banner',
    '#privacy-preferences-modal',
  ];
}

function findVisibleShopifyBanner() {
  return firstVisibleElementOnPage([
    '#shopify-pc__banner',
    '.shopify-pc__banner__dialog',
    '#privacy-cookie-banner',
  ]);
}

function findVisibleShopifyPrefsDialog() {
  return firstVisibleElementOnPage([
    '#shopify-pc__prefs__dialog',
    '.shopify-pc__prefs__dialog',
    '#privacy-preferences-modal',
  ]);
}

function firstVisibleElementOnPage(selectors) {
  for (const selector of selectors) {
    for (const el of document.querySelectorAll(selector)) {
      if (isVisible(el)) return el;
    }
  }
  return null;
}

function applyShopifyToggleState(root, id, checked) {
  const toggle = findShopifyToggleInRoot(root, id);
  if (!(toggle instanceof HTMLInputElement)) return false;
  return applyShopifyToggle(toggle, checked);
}

function applyShopifyGroupState(root, { ids = [], labels = [] }, checked) {
  for (const id of ids) {
    if (applyShopifyToggleState(root, id, checked)) return true;
  }
  const toggle = findShopifyToggleByLabel(root, labels);
  if (!toggle) return false;
  return applyShopifyToggle(toggle, checked);
}

function applyShopifyToggle(toggle, checked) {
  if (!(toggle instanceof HTMLInputElement)) return false;
  if (toggle.disabled || toggle.getAttribute('aria-disabled') === 'true') return false;
  if (Boolean(toggle.checked) === checked) return true;

  const label = toggle.labels?.[0] ?? toggle.closest('label');
  if (label && isVisible(label)) {
    try { label.click(); } catch (_) { dispatchSyntheticClick(label); }
  }
  if (Boolean(toggle.checked) === checked) return true;

  try { toggle.click(); } catch (_) { dispatchSyntheticClick(toggle); }
  if (Boolean(toggle.checked) === checked) return true;

  forceCheckboxState(toggle, checked);
  return Boolean(toggle.checked) === checked;
}

function findShopifyToggleInRoot(root, id) {
  if (!root?.querySelectorAll) return null;
  const escaped = typeof CSS?.escape === 'function' ? CSS.escape(id) : id;
  const matches = Array.from(root.querySelectorAll(`#${escaped}`));
  return matches.find((el) => el instanceof HTMLInputElement && isVisible(el)) ?? null;
}

function findShopifyToggleByLabel(root, labelPatterns) {
  if (!root?.querySelectorAll) return null;
  const toggles = Array.from(root.querySelectorAll('input[type="checkbox"], input[role="switch"]'));
  return toggles.find((toggle) => {
    if (!(toggle instanceof HTMLInputElement)) return false;
    if (toggle.disabled || toggle.getAttribute('aria-disabled') === 'true') return false;
    const text = shopifyToggleText(toggle);
    if (!text) return false;
    return labelPatterns.some((pattern) => pattern.test(text));
  }) ?? null;
}

function shopifyToggleText(toggle) {
  const pieces = [];
  for (const label of Array.from(toggle.labels ?? [])) {
    pieces.push(label.textContent ?? '');
  }
  const row = toggle.closest('label, li, div[role="group"], div');
  if (row) pieces.push(row.textContent ?? '');
  const parentRow = row?.parentElement?.closest?.('li, div[role="group"], div');
  if (parentRow) pieces.push(parentRow.textContent ?? '');
  return pieces.join(' ').replace(/\s+/g, ' ').trim();
}

async function waitForSelectorsToDisappear(selectors, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const visible = selectors.some((selector) => {
      const el = queryElement(selector);
      return el && isVisible(el);
    });
    if (!visible) return true;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

async function waitForKetchBannerTransition(watchSelectors, settingsSelectors, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const watchVisible = watchSelectors.some((selector) => {
      const el = queryElement(selector);
      return el && isVisible(el);
    });
    if (!watchVisible) return true;
    const settingsVisible = settingsSelectors.some((selector) => {
      const el = queryElement(selector);
      return el && isVisible(el);
    });
    if (settingsVisible) return true;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

async function waitForCookieGroup(group, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if ((document.cookie || '').includes(group)) return true;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return (document.cookie || '').includes(group);
}

function findButtonByText(phrases) {
  const lower = phrases.map((phrase) => phrase.toLowerCase());
  for (const el of deepQuerySelectorAll('button, [role="button"], a')) {
    const text = el.textContent?.trim().toLowerCase() ?? '';
    if (lower.some((phrase) => text.includes(phrase)) && isVisible(el)) {
      return el;
    }
  }
  return null;
}

function queryElement(selector) {
  if (!selector) return null;
  if (selector.startsWith('text:')) {
    return findButtonByText([selector.slice(5)]);
  }
  // Ketch SDK embeds a base64 JSON in data-nav; "action" field is language-agnostic.
  // Example: data-nav-action:confirm matches the Confirm/Save button in the preferences modal.
  if (selector.startsWith('data-nav-action:')) {
    return findButtonByNavAction(selector.slice(16));
  }
  return deepQuerySelector(selector);
}

function findButtonByNavAction(action) {
  for (const el of deepQuerySelectorAll('button, [role="button"], a')) {
    const raw = el.getAttribute?.('data-nav');
    if (!raw) continue;
    try {
      const decoded = JSON.parse(atob(raw));
      if (decoded?.action === action && isVisible(el)) return el;
    } catch (_) {}
  }
  return null;
}

function clickTargetFor(el) {
  return el.closest?.('button, [role="button"], a, input[type="button"], input[type="submit"]') ?? el;
}

function hasTopLevelConsentManagerSurface() {
  if (window.top !== window) return false;
  if (CONSENTMANAGER_TOP_LEVEL_EXCLUDED_SITES.has(site)) return false;
  if (window.cmpmngr?.eventwrapper) return true;

  return [
    '#cmpbox',
    '#cmpinlinepreferencesbox',
    '.cmpboxbtnno',
    '.cmpboxbtnyes',
    '.cmpboxbtnaccept',
    '.cmpboxbtnreject',
    '.cmpboxbtncustom',
    '.cmpboxbtnsave',
    '.cmpboxbtnyescustomchoices',
    '.cmpboxbtnrejectcustomchoices',
    '.cmptogglelink',
    '.cmptogglelinkspan',
    '[data-cmp-purpose]',
    '[data-cmp-action]',
  ].some((selector) => {
    const el = queryElement(selector);
    return el && isVisible(el);
  });
}

async function configureDWSettings(prefs) {
  const visible = await waitForSiteSelectors(
    [
      '.cmptxt_btn_yes2',
      '.cmptxt_btn_no2',
      '.cmptxt_btn_save2',
      '.cmptxt_btn_save',
      '.cmpboxnaviitem',
      '.cmptogglelink',
      '.cmptogglelinkspan',
      '.cmpboxbtnyescustomchoices',
      '.cmpboxbtnrejectcustomchoices',
      'text:save selection',
    ],
    4000,
  );
  if (!visible) return false;

  if (prefs.globalPreference === 'accept_all') {
    if (clickElement([
      '.cmptxt_btn_yes2',
      '.cmptxt_btn_yes',
      '.cmpboxbtnaccept',
      '.cmpboxbtnacceptcustomchoices',
      '.cmpboxbtnyescustomchoices:not(.cmptxt_btn_save2):not(.cmptxt_btn_save)',
    ])) {
      await new Promise((resolve) => setTimeout(resolve, 900));
      if (await resolveDWPostChoice()) return true;
    }
  } else if (prefs.globalPreference === 'reject_all') {
    if (clickElement([
      '.cmptxt_btn_no2',
      '.cmptxt_btn_no',
      '.cmpboxbtnreject',
      '.cmpboxbtnrejectcustomchoices',
    ])) {
      await new Promise((resolve) => setTimeout(resolve, 900));
      if (await resolveDWPostChoice()) return true;
    }
  }

  if (prefs.globalPreference === 'custom') {
    await applyDWCustomRows(prefs);
  } else {
    toggleOffDWRows();
  }
  await new Promise((resolve) => setTimeout(resolve, 220));

  if (!clickElement([
    '.cmptxt_btn_save2',
    '.cmptxt_btn_save',
    '.cmpboxbtnyescustomchoices.cmptxt_btn_save2',
    '.cmpboxbtnyescustomchoices.cmptxt_btn_save',
    '.cmpboxbtnsave',
    '.cmpsave',
  ])) {
    return false;
  }

  return waitForSelectorsToDisappear(dwWatchSelectors(), 6000);
}

async function resolveDWPostChoice() {
  if (!(await anyDWVisible())) return true;

  if (isDWChoiceSummaryVisible()) {
    if (clickElement(['text:back'])) {
      return waitForDWArticleReturn(10000);
    }
  }

  return false;
}

async function anyDWVisible() {
  return dwWatchSelectors().some((selector) => {
    const el = queryElement(selector);
    return el && isVisible(el);
  });
}

function isDWChoiceSummaryVisible() {
  const back = queryElement('text:back');
  const save = queryElement('text:save selection');
  const box = queryElement('#cmpbox');
  const text = box?.textContent?.toLowerCase() ?? '';
  return Boolean(back && isVisible(back) && !save && text.includes('your choice'));
}

async function waitForDWArticleReturn(timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (!isDWPrivacySettingsPage() && !(await anyDWVisible())) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

function isDWPrivacySettingsPage() {
  return location.pathname.includes('/data-privacy-settings/');
}

function toggleOffDWRows() {
  const rows = deepQuerySelectorAll('.cmpboxnaviitem, [data-cmp-purpose], .cmpboxnaviitem');
  for (const row of rows) {
    const text = row.textContent?.trim().toLowerCase() ?? '';
    if (!text || /strictly necessary|always on|necessary|security|fraud/i.test(text)) continue;

    const toggle = findDWRowToggle(row);
    if (!toggle) continue;
    if (readDWToggleState(row, toggle) === false) continue;
    dispatchSyntheticClick(toggle);
  }
}

async function applyDWCustomRows(prefs) {
  const rules = [
    {
      labels: ['function'],
      desired: true,
    },
    {
      labels: ['marketing'],
      desired: Boolean(prefs.advertising) && prefs.ccpaDoNotSell === false,
    },
    {
      labels: ['preferences'],
      desired: Boolean(prefs.functional),
    },
    {
      labels: ['measurement'],
      desired: Boolean(prefs.analytics),
    },
    {
      labels: ['other'],
      desired: prefs.uncategorized === 'accept',
    },
    {
      labels: ['social media'],
      desired: Boolean(prefs.advertising) && prefs.ccpaDoNotSell === false,
    },
  ];

  for (const rule of rules) {
    const opened = clickDWCategoryNav(rule.labels);
    if (!opened) continue;
    await new Promise((resolve) => setTimeout(resolve, 180));
    setDWCurrentPageToggles(rule.desired, { allowNecessary: rule.desired === true && rule.labels.includes('function') });
  }
}

function findDWRowToggle(row) {
  const toggle = row.querySelector('.cmptogglelink, .cmptogglelinkspan, [role="checkbox"], [role="switch"], [aria-checked]');
  if (!toggle || !isVisible(toggle)) return null;
  return toggle;
}

function readDWToggleState(row, toggle) {
  const ariaChecked = toggle.getAttribute('aria-checked');
  if (ariaChecked === 'true') return true;
  if (ariaChecked === 'false') return false;

  const stateText = row.querySelector('.cmpofftext, .cmpontxt, .cmptxt_off, .cmponofftext')?.textContent?.trim().toLowerCase() ?? '';
  if (stateText) {
    if (/inactive|off/.test(stateText)) return false;
    if (/active|on/.test(stateText)) return true;
  }

  const className = `${toggle.className ?? ''} ${row.className ?? ''}`.toLowerCase();
  if (/\boff\b|inactive/.test(className)) return false;
  if (/\bon\b|active/.test(className)) return true;
  return null;
}

function clickDWCategoryNav(labels) {
  const candidates = deepQuerySelectorAll('.cmpboxnaviitem, [role="tab"], button, a, li, div');
  for (const candidate of candidates) {
    if (!isVisible(candidate)) continue;
    if (candidate.querySelector('.cmptogglelink, .cmptogglelinkspan, [role="checkbox"], [role="switch"], [aria-checked], input[type="checkbox"]')) continue;

    const text = candidate.textContent?.trim().toLowerCase() ?? '';
    if (!text) continue;
    if (!labels.some((label) => text.includes(label))) continue;

    dispatchSyntheticClick(clickTargetFor(candidate));
    return true;
  }
  return false;
}

function setDWCurrentPageToggles(desired, { allowNecessary = false } = {}) {
  const rows = deepQuerySelectorAll('tr, li, [data-cmp-purpose], .cmpboxnaviitem');
  const seen = new Set();
  for (const row of rows) {
    if (seen.has(row) || !isVisible(row)) continue;
    seen.add(row);

    const toggle = findDWRowToggle(row);
    if (!toggle) continue;

    const text = row.textContent?.trim().toLowerCase() ?? '';
    if (!text) continue;
    if (!allowNecessary && /strictly necessary|always on|necessary|security|fraud|data controller/i.test(text)) continue;

    const current = readDWToggleState(row, toggle);
    if (current == null || current === desired) continue;
    dispatchSyntheticClick(toggle);
  }
}

async function ensureFTManagerOpen() {
  if (
    queryElement('button.sp_choice_type_SAVE_AND_EXIT') ||
    queryElement('button.sp_choice_type_ACCEPT_ALL') ||
    queryElement('button[title="Save and Close"]') ||
    queryElement('.pm-switch') ||
    queryElement('button[aria-label="Reject"]')
  ) {
    return true;
  }

  const opened = clickElement([
    'a[aria-label*="manage cookies" i]',
    'text:manage cookies',
    '.sp_choice_type_12',
  ]);
  if (!opened) return false;

  return waitForSiteSelectors([
    'button.sp_choice_type_SAVE_AND_EXIT',
    'button.sp_choice_type_ACCEPT_ALL',
    'button[title="Save and Close"]',
    'button[aria-label="Save and Close"]',
    'button[title="Reject"]',
    'button[aria-label="Reject"]',
    '.pm-switch',
  ], 5000);
}

async function configureFTManager(preference) {
  const managerSelectors = ftWatchSelectors();
  const visible = await waitForSiteSelectors(managerSelectors, 5000);
  if (!visible) return false;

  if (preference === 'accept_all') {
    const accepted = await clickAndWaitRetry(
      ['button.sp_choice_type_ACCEPT_ALL', 'button[title="Accept"]', 'button[aria-label="Accept"]', 'text:accept'],
      managerSelectors,
      7000,
      2,
    );
    if (accepted) return true;
  } else {
    const rejected = await clickAndWaitRetry(
      ['button[title="Reject"]', 'button[aria-label="Reject"]', 'text:reject'],
      managerSelectors,
      7000,
      2,
    );
    if (rejected) return true;

    turnOffFTSwitches();
    await new Promise((resolve) => setTimeout(resolve, 180));

    const saved = await clickAndWaitRetry(
      ['button[title="Save and Close"]', 'button[aria-label="Save and Close"]', 'text:save and close'],
      managerSelectors,
      7000,
      2,
    );
    if (saved) return true;
  }

  return false;
}

function turnOffFTSwitches() {
  const switches = deepQuerySelectorAll('.pm-switch[role="switch"], .pm-switch[aria-checked], button.pm-switch');
  for (const toggle of switches) {
    if (!isVisible(toggle)) continue;
    if (toggle.getAttribute('aria-checked') === 'true') {
      dispatchSyntheticClick(clickTargetFor(toggle));
    }
  }
}

function dwWatchSelectors() {
  return [
    '#cmpwrapper',
    '#cmpbox',
    '#cmpinlinepreferencesbox',
    '.cmpboxbtnsave',
    '.cmpboxbtnaccept',
    '.cmpboxbtnreject',
    '.cmpboxbtnyescustomchoices',
    '.cmpboxbtnrejectcustomchoices',
    '.cmptxt_btn_yes2',
    '.cmptxt_btn_yes',
    '.cmptxt_btn_no2',
    '.cmptxt_btn_no',
    '.cmptxt_btn_save2',
    '.cmptxt_btn_save',
    '.cmptogglelink',
  ];
}

function ftWatchSelectors() {
  return [
    '.message-component',
    '.footer .sp_choice_type_11',
    'button.sp_choice_type_SAVE_AND_EXIT',
    'button.sp_choice_type_ACCEPT_ALL',
    'button[title="Save and Close"]',
    'button[aria-label="Save and Close"]',
    'button[title="Reject"]',
    'button[aria-label="Reject"]',
    'button[title="Accept"]',
    'button[aria-label="Accept"]',
    '.pm-switch',
    'a[aria-label*="manage cookies" i]',
  ];
}

function didomiWatchSelectors() {
  return [
    '#didomi-host',
    '#didomi-popup',
    '.didomi-popup-backdrop',
    '.didomi-notice-popup',
    '.didomi-consent-popup__dialog',
    '.didomi-continue-without-agreeing',
    '#didomi-notice-agree-button',
    '#didomi-notice-learn-more-button',
    '#btn-toggle-disagree',
    '#btn-toggle-agree',
    '#btn-toggle-save',
  ];
}

async function configureDidomiPreferences(preference) {
  const selectors = didomiWatchSelectors();
  const visible = await waitForSiteSelectors(['#btn-toggle-disagree', '#btn-toggle-agree', '#btn-toggle-save'], 5000);
  if (!visible) return false;

  if (preference === 'accept_all') {
    const accepted = await clickAndWait([
      '#btn-toggle-agree',
      'button[aria-label*="Agree to all" i]',
      'button[aria-label*="Accept all" i]',
      'text:agree to all',
      'text:accept all',
      'text:accepter tout',
      'text:alle akzeptieren',
      'text:aceptar todo',
      'text:accetta tutto',
    ], selectors, 7000);
    if (accepted) return true;
  } else {
    const disagreed = clickElement([
      '#btn-toggle-disagree',
      'button[aria-label*="Disagree to all" i]',
      'button[aria-label*="Reject all" i]',
      'text:disagree to all',
      'text:reject all',
      'text:tout refuser',
      'text:alle ablehnen',
      'text:rechazar todo',
      'text:rifiuta tutto',
      'text:rejeitar tudo',
    ]);
    if (!disagreed) return false;
    await waitForDidomiSaveEnabled(2500);
    const saved = await clickAndWait([
      '#btn-toggle-save',
      'button[aria-label*="Save" i]',
      'text:save',
      'text:enregistrer',
      'text:speichern',
      'text:guardar',
      'text:salva',
    ], selectors, 7000);
    if (saved) return true;
  }

  return false;
}

async function waitForDidomiSaveEnabled(timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const save = queryElement('#btn-toggle-save');
    if (save && isVisible(save) && !save.disabled && save.getAttribute('aria-disabled') !== 'true') return true;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return false;
}

function isVisible(el) {
  const rect = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
}

function trackFTOutcome(prefs) {
  if (window.__emcFTTrackerAttached) return;
  window.__emcFTTrackerAttached = true;

  const baseline = readFTConsentSnapshot();
  let sawVisibleBanner = false;
  const started = Date.now();
  const timeoutMs = 20000;

  const tick = async () => {
    const visible = hasVisibleFTConsentFrame();
    if (visible) sawVisibleBanner = true;

    if (ftConsentChanged(baseline) || (sawVisibleBanner && !visible)) {
      stop();
      await reportAction(
        prefs.globalPreference === 'accept_all' ? 'sourcepoint:ft:accept_all' : 'sourcepoint:ft:reject_all',
        prefs.globalPreference,
      );
      return;
    }

    if (Date.now() - started > timeoutMs) {
      stop();
    }
  };

  const intervalId = setInterval(() => {
    void tick();
  }, 250);

  const observer = new MutationObserver(() => {
    void tick();
  });

  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
  void tick();

  function stop() {
    clearInterval(intervalId);
    observer.disconnect();
  }
}

function hasVisibleFTConsentFrame() {
  return Array.from(document.querySelectorAll('iframe[src*="consent-manager.ft.com"]')).some((frame) => isVisible(frame));
}

function readFTConsentSnapshot() {
  return {
    ftConsent: readCookie('FTConsent'),
    ftConsentGDPR: readCookie('FTCookieConsentGDPR'),
    lastFtc: safeLocalStorageGet('__lastFtc'),
    marketingOptOut: safeLocalStorageGet('ft_sp_marketing_optout'),
  };
}

function ftConsentChanged(baseline) {
  const next = readFTConsentSnapshot();
  return next.ftConsent !== baseline.ftConsent ||
    next.ftConsentGDPR !== baseline.ftConsentGDPR ||
    next.lastFtc !== baseline.lastFtc ||
    next.marketingOptOut !== baseline.marketingOptOut;
}

function safeLocalStorageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch (_) {
    return null;
  }
}

function safeLocalStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (_) {
    return false;
  }
}

function readCookie(name) {
  try {
    const prefix = `${name}=`;
    const match = document.cookie.split('; ').find((entry) => entry.startsWith(prefix));
    return match ? match.slice(prefix.length) : null;
  } catch (_) {
    return null;
  }
}

function writeCookie(name, value, options = {}) {
  try {
    const parts = [`${name}=${value}`];
    parts.push(`path=${options.path ?? '/'}`);
    if (options.maxAge != null) parts.push(`max-age=${options.maxAge}`);
    if (options.domain) parts.push(`domain=${options.domain}`);
    parts.push(`SameSite=${options.sameSite ?? 'Lax'}`);
    if (options.secure !== false && location.protocol === 'https:') parts.push('Secure');
    document.cookie = parts.join('; ');
    return true;
  } catch (_) {
    return false;
  }
}

function shouldUseDirectKetchCookieFlow(config) {
  return Boolean(config?.consentCookieName && config?.cooldownScope === 'liveramp');
}

async function handleKetchViaConsentCookie(siteOverrides, prefs, config, options = {}) {
  if (!config?.consentCookieName) return false;
  const { persistOnly = false } = options;
  const payloads = buildLiveRampConsentPayloads(prefs);
  if (!payloads?.ketch || !payloads?.swb || !payloads?.metadata) return false;

  const cookieOptions = {
    maxAge: 31536000,
    domain: '.liveramp.com',
    sameSite: 'None',
    secure: true,
  };
  if (!writeCookie(config.consentCookieName, payloads.ketch, cookieOptions)) return false;
  if (!writeCookie('_swb_consent_', payloads.swb, cookieOptions)) return false;
  if (!writeCookie('_swb_consent__metadata', payloads.metadata, cookieOptions)) return false;

  const storedKetch = safeLocalStorageSet(config.consentCookieName, payloads.ketch);
  const storedSwb = safeLocalStorageSet('_swb_consent_', payloads.swb);
  const storedMetadata = safeLocalStorageSet('_swb_consent__metadata', payloads.metadata);
  if (!storedKetch || !storedSwb || !storedMetadata) return false;

  if (persistOnly) return true;

  startSiteSpecificFlowLock(`ketch:${config.cooldownScope}:${prefs.globalPreference}`);
  startFlowCooldown(config.cooldownScope);

  await chrome.runtime.sendMessage({ type: 'CLEAR_UNSUPPORTED_SITE', domain: site });
  await reportAction(
    siteOverrides.alwaysAccept ? 'site_override:accept_all' : 'site_specific:ketch:cookie',
    siteOverrides.alwaysAccept ? 'accept_all' : prefs.globalPreference,
  );

  setTimeout(() => {
    try {
      if (config.homeUrl && isKetchPrivacyCenterPage(config)) {
        location.replace(config.homeUrl);
        return;
      }
      location.reload();
    } catch (_) {}
  }, 25);
  return true;
}

function buildLiveRampConsentPayloads(prefs) {
  const currentKetch = readLiveRampJsonState('_ketch_consent_v1_') ?? {};
  const essentialServicesEnabled = true;
  const ketchNext = {
    ...currentKetch,
    analytics: buildLiveRampKetchPurpose('analytics', Boolean(prefs?.analytics)),
    essential_services: buildLiveRampKetchPurpose('essential_services', essentialServicesEnabled),
    behavioral_advertising: buildLiveRampKetchPurpose('behavioral_advertising', Boolean(prefs?.advertising)),
  };
  const currentSwb = readLiveRampJsonState('_swb_consent_');
  const swbBase = (currentSwb && typeof currentSwb === 'object')
    ? currentSwb
    : createDefaultLiveRampSwbConsent();

  const timestamp = Math.floor(Date.now() / 1000);
  const swbNext = {
    ...swbBase,
    collectedAt: timestamp,
    cachedAt: timestamp,
    interactive: true,
    context: {
      ...(swbBase.context ?? {}),
      source: prefs?.globalPreference === 'reject_all' ? 'banner.rejectAll' : 'modal.manual',
    },
    purposes: {
      ...(swbBase.purposes ?? {}),
      analytics: buildLiveRampSwbPurpose('analytics', Boolean(prefs?.analytics), 'consent_optout'),
      behavioral_advertising: buildLiveRampSwbPurpose('behavioral_advertising', Boolean(prefs?.advertising), 'consent_optin'),
      essential_services: buildLiveRampSwbPurpose('essential_services', essentialServicesEnabled, 'consent_optout'),
    },
  };

  return {
    ketch: encodeBase64JsonCookie(ketchNext),
    swb: encodeBase64JsonCookie(swbNext),
    metadata: createLiveRampConsentMetadata(),
  };
}

function buildLiveRampKetchPurpose(name, enabled) {
  return {
    status: enabled ? 'granted' : 'denied',
    canonicalPurposes: [name],
  };
}

function buildLiveRampSwbPurpose(name, enabled, legalBasisCode) {
  return {
    allowed: enabled ? 'true' : 'false',
    collectedAt: 0,
    issuedAt: 0,
    legalBasisCode,
    source: '',
  };
}

function createDefaultLiveRampSwbConsent() {
  const timestamp = Math.floor(Date.now() / 1000);
  return {
    collectedAt: timestamp,
    cachedAt: timestamp,
    interactive: true,
    context: {
      issuedAt: 0,
      source: 'modal.manual',
    },
    controllerCode: '',
    environmentCode: 'production',
    identities: {},
    jurisdictionCode: '',
    propertyCode: 'website_smart_tag',
    purposes: {},
  };
}

function createLiveRampConsentMetadata() {
  const issuedAt = Math.floor(Date.now() / 1000);
  return encodeBase64JsonCookie({
    iat: issuedAt,
    exp: issuedAt + 31536000,
  });
}

function readLiveRampJsonState(key) {
  return (
    decodeBase64JsonCookie(readCookie(key)) ??
    decodeBase64JsonCookie(safeLocalStorageGet(key))
  );
}

function liveRampConsentMatches(prefs) {
  const ketch = readLiveRampJsonState('_ketch_consent_v1_');
  const swb = readLiveRampJsonState('_swb_consent_');
  if (!ketch || !swb) return false;

  const analyticsEnabled = Boolean(prefs?.analytics);
  const advertisingEnabled = Boolean(prefs?.advertising);
  const essentialServicesEnabled = true;

  return (
    ketch.analytics?.status === (analyticsEnabled ? 'granted' : 'denied') &&
    ketch.behavioral_advertising?.status === (advertisingEnabled ? 'granted' : 'denied') &&
    ketch.essential_services?.status === (essentialServicesEnabled ? 'granted' : 'denied') &&
    swb.purposes?.analytics?.allowed === String(analyticsEnabled) &&
    swb.purposes?.behavioral_advertising?.allowed === String(advertisingEnabled) &&
    swb.purposes?.essential_services?.allowed === String(essentialServicesEnabled)
  );
}

function suppressLiveRampBanner(durationMs = 15000) {
  const selectors = [
    '#ketch-banner',
    '#ketch-consent-banner',
    '#ketch-modal',
    '#ketch-purposes-modal',
    '#ketch-preferences',
    '#ketch-preference-panel',
  ];

  const hideOnce = () => {
    let changed = false;
    for (const selector of selectors) {
      for (const el of deepQuerySelectorAll(selector)) {
        if (!(el instanceof HTMLElement)) continue;
        el.style.setProperty('display', 'none', 'important');
        el.style.setProperty('visibility', 'hidden', 'important');
        el.setAttribute('aria-hidden', 'true');
        changed = true;
      }
    }

    for (const el of deepQuerySelectorAll('[id^="ketch-banner-button"]')) {
      if (!(el instanceof HTMLElement)) continue;
      el.style.setProperty('display', 'none', 'important');
      el.style.setProperty('visibility', 'hidden', 'important');
      changed = true;
    }

    try {
      document.body?.style?.setProperty('overflow', '', 'important');
      document.documentElement?.style?.setProperty('overflow', '', 'important');
    } catch (_) {}

    return changed;
  };

  hideOnce();
  const observer = new MutationObserver(() => {
    hideOnce();
  });
  try {
    observer.observe(document.documentElement ?? document, {
      childList: true,
      subtree: true,
      attributes: true,
    });
    setTimeout(() => observer.disconnect(), durationMs);
  } catch (_) {}
}

function decodeBase64JsonCookie(value) {
  if (!value) return null;
  try {
    return JSON.parse(atob(value));
  } catch (_) {
    try {
      return JSON.parse(atob(decodeURIComponent(value)));
    } catch (_) {
      return null;
    }
  }
}

function encodeBase64JsonCookie(value) {
  try {
    return btoa(JSON.stringify(value));
  } catch (_) {
    return null;
  }
}

function deepQuerySelector(selector, root = document) {
  return deepQuerySelectorAll(selector, root)[0] ?? null;
}

function deepQuerySelectorAll(selector, root = document) {
  const results = [];
  const visit = (node) => {
    if (!node?.querySelectorAll) return;
    try {
      results.push(...node.querySelectorAll(selector));
      for (const el of node.querySelectorAll('*')) {
        if (el.shadowRoot) visit(el.shadowRoot);
      }
    } catch (_) {}
  };
  visit(root);
  return results;
}

async function reportAction(method, preference, { noRejectAvailable } = {}) {
  markHandledForCurrentPage(currentRunSignature ?? preference);
  await chrome.runtime.sendMessage({
    type: 'ACTION_FIRED',
    site,
    method,
    preference,
    ...(noRejectAvailable ? { noRejectAvailable: true } : {}),
  });
}

async function reportDomResult(result, prefs) {
  await syncPlatformSupportWarning(result, prefs);
  const noRejectAvailable = Boolean(result.noticeOnly) && prefs.globalPreference !== 'accept_all';
  return reportAction(result.method, prefs.globalPreference, { noRejectAvailable });
}

async function syncPlatformSupportWarning(result, prefs) {
  const warning = getPlatformSupportWarning(result, prefs);
  if (warning) {
    await chrome.runtime.sendMessage({
      type: 'REPORT_UNSUPPORTED_SITE',
      site,
      reason: warning.reason,
      allowAcceptOverride: Boolean(warning.allowAcceptOverride),
    });
    return;
  }

  if (!shouldManagePlatformSupportWarning(result)) return;
  await chrome.runtime.sendMessage({ type: 'CLEAR_UNSUPPORTED_SITE', domain: site });
}

function shouldManagePlatformSupportWarning(result) {
  const method = result?.method ?? '';
  return method.startsWith('dom:woocommercestorenotice') ||
    method.startsWith('dom:magentocookie') ||
    method.startsWith('dom:bigcommercecatalyst');
}

function getPlatformSupportWarning(result, prefs) {
  const method = result?.method ?? '';

  if (method.startsWith('dom:woocommercestorenotice')) {
    return {
      reason: 'WooCommerce store notices are only dismissible banners, not full consent managers. Eat My Cookies can close the notice, but it cannot apply accept, reject, custom, or CCPA preferences generically on this storefront.',
      allowAcceptOverride: false,
    };
  }

  if (method.startsWith('dom:magentocookie')) {
    if (prefs.globalPreference === 'accept_all' && prefs.ccpaDoNotSell === false) {
      return null;
    }
    return {
      reason: 'Magento’s native cookie notice only exposes an allow-or-close flow. Eat My Cookies used the closest safe path for this visit, but custom category choices and standalone CCPA sell/share controls are not available generically on this storefront. If you want this warning to stop here, switch this site to Accept All.',
      allowAcceptOverride: true,
    };
  }

  if (method.startsWith('dom:bigcommercecatalyst')) {
    return null;
  }

  return null;
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.textContent = message;
  Object.assign(toast.style, {
    position: 'fixed',
    top: '16px',
    right: '16px',
    zIndex: '2147483647',
    background: '#1a1a2e',
    color: '#fff',
    padding: '10px 16px',
    borderRadius: '8px',
    fontSize: '14px',
    fontFamily: 'system-ui, sans-serif',
    border: '1px solid #f5a623',
    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
    transition: 'opacity 0.3s',
  });
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; }, 1800);
  setTimeout(() => toast.remove(), 2100);
}

function handledKey(preference) {
  return `${RUN_GUARD_PREFIX}:${site}:${location.pathname}:${preference}`;
}

function prefsRunSignature(prefs) {
  if (!prefs || typeof prefs !== 'object') return String(prefs ?? '');
  return JSON.stringify({
    globalPreference: prefs.globalPreference ?? '',
    functional: Boolean(prefs.functional),
    analytics: Boolean(prefs.analytics),
    advertising: Boolean(prefs.advertising),
    ccpaDoNotSell: Boolean(prefs.ccpaDoNotSell),
    uncategorized: prefs.uncategorized ?? '',
  });
}

function cooldownKey(scope) {
  return `${RUN_GUARD_PREFIX}:cooldown:${site}:${scope}`;
}

function runCooldownScope(signature) {
  return `run:${location.pathname}:${signature}`;
}

function pendingPreHandleActionKey(signature) {
  return `${RUN_GUARD_PREFIX}:pending-action:${site}:${location.pathname}:${signature}`;
}

function reloadRetryKey(signature) {
  return `${RUN_GUARD_PREFIX}:reload-retry:${site}:${location.pathname}:${signature}`;
}

function wasHandledForCurrentPage(preference) {
  try {
    return sessionStorage.getItem(handledKey(preference)) === '1';
  } catch (_) {
    return false;
  }
}

function markHandledForCurrentPage(preference) {
  try {
    sessionStorage.setItem(handledKey(preference), '1');
  } catch (_) {}
}

function startFlowCooldown(scope) {
  try {
    sessionStorage.setItem(cooldownKey(scope), String(Date.now()));
  } catch (_) {}
}

function isFlowCoolingDown(scope) {
  try {
    const value = Number(sessionStorage.getItem(cooldownKey(scope)) || '0');
    return value > 0 && (Date.now() - value) < FLOW_COOLDOWN_MS;
  } catch (_) {
    return false;
  }
}

function shouldRetryOneTrustAfterReload(signature) {
  const navigationEntry = performance.getEntriesByType?.('navigation')?.[0];
  if (navigationEntry?.type !== 'reload') return false;
  if (!ONETRUST_RELOAD_RETRY_SELECTORS.some((selector) => isVisible(document.querySelector(selector)))) {
    return false;
  }
  try {
    const key = reloadRetryKey(signature);
    if (sessionStorage.getItem(key) === '1') return false;
    sessionStorage.setItem(key, '1');
    return true;
  } catch (_) {
    return false;
  }
}

function startSiteSpecificFlowLock(scope, ttlMs = 4000) {
  siteSpecificFlowLock = {
    scope,
    until: Date.now() + ttlMs,
  };
}

function isSiteSpecificFlowLocked(scope) {
  return Boolean(
    siteSpecificFlowLock &&
    siteSpecificFlowLock.scope === scope &&
    siteSpecificFlowLock.until > Date.now()
  );
}

function persistPendingPreHandleAction(signature, method, preference, expectedGroups = null) {
  if (!REJECT_RELOAD_GUARD_HOSTS.has(site)) return;
  if (!method) return;
  const actionToken = `${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
  try {
    localStorage.setItem(pendingPreHandleActionKey(signature), JSON.stringify({
      method,
      preference,
      expectedGroups,
      actionToken,
      timestamp: Date.now(),
    }));
  } catch (_) {}
  return actionToken;
}

function hasPendingPreHandleAction(signature) {
  if (!REJECT_RELOAD_GUARD_HOSTS.has(site)) return false;
  let payload = null;
  try {
    payload = JSON.parse(localStorage.getItem(pendingPreHandleActionKey(signature)) || 'null');
  } catch (_) {
    payload = null;
  }
  return isFreshPendingPreHandleAction(payload);
}

function isFreshPendingPreHandleAction(payload) {
  return Boolean(
    payload?.method &&
    payload?.preference &&
    payload?.actionToken &&
    payload?.timestamp &&
    (Date.now() - payload.timestamp) < PRE_HANDLE_PENDING_TTL_MS
  );
}

async function flushPendingPreHandleAction(signature) {
  if (!REJECT_RELOAD_GUARD_HOSTS.has(site)) return;
  let payload = null;
  try {
    payload = JSON.parse(localStorage.getItem(pendingPreHandleActionKey(signature)) || 'null');
  } catch (_) {
    payload = null;
  }
  if (!isFreshPendingPreHandleAction(payload)) {
    clearPendingPreHandleAction(signature);
    return false;
  }
  if (payload.expectedGroups && !oneTrustConsentGroupsMatch(payload.expectedGroups)) {
    clearPendingPreHandleAction(signature);
    return false;
  }
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'ACTION_FIRED',
      site,
      method: payload.method,
      preference: payload.preference,
      actionToken: payload.actionToken,
    });
    if (response?.ok) {
      clearPendingPreHandleAction(signature);
      return true;
    }
  } catch (_) {}
  return false;
}

function clearPendingPreHandleAction(signature) {
  try {
    localStorage.removeItem(pendingPreHandleActionKey(signature));
  } catch (_) {}
}

function readOneTrustConsentGroups() {
  const raw = document.cookie
    .split('; ')
    .find((part) => part.startsWith('OptanonConsent='))
    ?.slice('OptanonConsent='.length);
  if (!raw) return null;

  try {
    const decoded = decodeURIComponent(raw);
    const groupText = decoded.match(/groups=([^&]+)/)?.[1] ?? '';
    return Object.fromEntries(
      groupText
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => {
          const [group, value] = entry.split(':');
          return [group, value === '1'];
        })
    );
  } catch (_) {
    return null;
  }
}

function oneTrustConsentGroupsMatch(expectedGroups) {
  if (!expectedGroups || Object.keys(expectedGroups).length === 0) return true;
  const groups = readOneTrustConsentGroups();
  return Boolean(groups &&
    Object.entries(expectedGroups).every(([group, expected]) => groups[group] === Boolean(expected)));
}

function dispatchSyntheticClick(el) {
  if (!el) return false;

  try { el.focus?.({ preventScroll: true }); } catch (_) {}

  const rect = el.getBoundingClientRect();
  const clientX = rect.left + Math.max(1, rect.width / 2);
  const clientY = rect.top + Math.max(1, rect.height / 2);
  const options = {
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
    el.dispatchEvent(new EventCtor(name, options));
  }

  if (typeof el.click === 'function') {
    el.click();
  }

  return true;
}
