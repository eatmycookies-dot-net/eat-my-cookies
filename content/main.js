// Main coordinator — ISOLATED world, document_idle.
// 1. Loads user preferences from the service worker
// 2. Handles site-specific flows when a publisher needs custom logic
// 3. Dispatches prefs to MAIN world scripts (TCF interceptor, GCM injector, CMP API handler)
// 4. Falls back to DOM handler → heuristic if MAIN world didn't handle it
// 5. Reports result to service worker for stats + badge update

const site = location.hostname;
const RUN_GUARD_PREFIX = '__emc_handled__';
const FLOW_COOLDOWN_MS = 15000;
const SHOPIFY_MAIN_WORLD_TIMEOUT_MS = 5000;
const REJECT_RELOAD_GUARD_HOSTS = new Set(['www.cnbc.com', 'www.nbcnews.com']);
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
let bloombergCcpaBridgeInstalled = false;
let bloombergCcpaWatchToken = 0;
let bloombergCcpaManualOpenUntil = 0;
const BLOOMBERG_CCPA_MANUAL_SUPPRESS_MS = 15000;

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
    saveSelectors: ['text:save your choices'],
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
    saveSelectors: ['text:save your choices'],
    exitSelectors: ['text:exit'],
  },
  'www.ketch.com': {
    siteLabel: 'Ketch',
    privacyCenterTitle: 'your privacy',
    homeUrl: 'https://www.ketch.com/',
    cooldownScope: 'ketch',
    purposeTabSelectors: ['text:purposes'],
    readySelectors: [
      'text:your privacy',
      'text:save choices',
      '#analytics',
      '#behavioral_advertising',
      '#personalization',
    ],
    settingsSelectors: [
      'text:save choices',
      '#analytics',
      '#behavioral_advertising',
      '#personalization',
    ],
    entrySelectors: [
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
      'text:your privacy',
      'text:save choices',
      '#analytics',
      '#behavioral_advertising',
      '#personalization',
      'text:reject all',
      'text:accept all',
    ],
    bannerAcceptSelectors: [
      'text:accept all',
    ],
    bannerRejectSelectors: [
      'text:reject all',
    ],
    bannerManageSelectors: [
      'text:your privacy',
    ],
    saveSelectors: ['text:save choices'],
    exitSelectors: [],
  },
  'ketch.com': {
    siteLabel: 'Ketch',
    privacyCenterTitle: 'your privacy',
    homeUrl: 'https://www.ketch.com/',
    cooldownScope: 'ketch',
    purposeTabSelectors: ['text:purposes'],
    readySelectors: [
      'text:your privacy',
      'text:save choices',
      '#analytics',
      '#behavioral_advertising',
      '#personalization',
    ],
    settingsSelectors: [
      'text:save choices',
      '#analytics',
      '#behavioral_advertising',
      '#personalization',
    ],
    entrySelectors: [
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
      'text:your privacy',
      'text:save choices',
      '#analytics',
      '#behavioral_advertising',
      '#personalization',
      'text:reject all',
      'text:accept all',
    ],
    bannerAcceptSelectors: [
      'text:accept all',
    ],
    bannerRejectSelectors: [
      'text:reject all',
    ],
    bannerManageSelectors: [
      'text:your privacy',
    ],
    saveSelectors: ['text:save choices'],
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
    saveSelectors: ['button[type="submit"]', 'text:save choices', 'text:confirm'],
    exitSelectors: [],
  },
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
]);

const DISNEY_FAMILY_USNAT_HOSTS = new Set([
  'www.disney.com',
  'www.espn.com',
  'www.hulu.com',
]);

let latestRunId = 0;
let currentRunSignature = null;

document.addEventListener('__emc_pre_handle__', (event) => {
  const detail = event?.detail ?? {};
  const signature = currentRunSignature ?? document.documentElement.dataset.emcRunSignature ?? document.documentElement.dataset.emcPref ?? '';
  const preference = detail.preference ?? document.documentElement.dataset.emcPref ?? 'reject_all';
  const actionToken = persistPendingPreHandleAction(signature, detail.method, preference);
  startFlowCooldown(runCooldownScope(signature));
  firePreHandleAction(detail.method, preference, actionToken);
  markHandledForCurrentPage(signature);
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
  scheduleShopifyWatch(prefs);
  const hadPendingPreHandleAction = hasPendingPreHandleAction(currentRunSignature);
  await flushPendingPreHandleAction(currentRunSignature);
  if (!force && hadPendingPreHandleAction) return;
  if (!force && isFlowCoolingDown(runCooldownScope(currentRunSignature))) return;
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
  const mainWorldResultPromise = waitForMainWorldResult(
    preferShopifyMainWorld ? SHOPIFY_MAIN_WORLD_TIMEOUT_MS : 3000,
    preferShopifyMainWorld ? prefs : null,
  );

  document.documentElement.dataset.emcPref = prefs.globalPreference;
  document.dispatchEvent(new CustomEvent('__emc_prefs__', { detail: prefs }));

  const mainWorldResult = await mainWorldResultPromise;
  if (mainWorldResult) {
    return reportAction(mainWorldResult.method, prefs.globalPreference);
  }

  if (DISNEY_FAMILY_USNAT_HOSTS.has(site)) {
    const retried = await retryDisneyFamilyUsNatMainWorld(prefs);
    if (retried) return;
  }

  if (MAIN_WORLD_ONLY_SITES.has(site)) {
    return;
  }

  const domResult = await runDOMHandler(prefs);
  if (domResult) {
    return reportAction(domResult.method, prefs.globalPreference);
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
  if (!DYNAMIC_SITE_SPECIFIC_HOSTS.has(site) || siteSpecificWatchStarted) return;
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
      ['#shopify-pc__banner__btn-accept'],
      ['accept']
    ) || clickShopifyButton(
      dialog,
      ['#shopify-pc__prefs__header-accept'],
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
      ['#shopify-pc__banner__btn-decline'],
      ['decline']
    ) || clickShopifyButton(
      dialog,
      ['#shopify-pc__prefs__header-decline'],
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
    if (clickShopifyButton(dialog, ['#shopify-pc__prefs__header-accept'], ['accept all']) ||
      clickShopifyButton(banner, ['#shopify-pc__banner__btn-accept'], ['accept'])) {
      if (await waitForSelectorsToDisappear(shopifyWatchSelectors(), 7000)) {
        await reportAction('site_specific:shopify:accept_all', prefs.globalPreference);
        return true;
      }
    }
  }

  if (allDesiredOff) {
    if (clickShopifyButton(dialog, ['#shopify-pc__prefs__header-decline'], ['decline all', 'reject all']) ||
      clickShopifyButton(banner, ['#shopify-pc__banner__btn-decline'], ['decline'])) {
      if (await waitForSelectorsToDisappear(shopifyWatchSelectors(), 7000)) {
        await reportAction('site_specific:shopify:reject_all', prefs.globalPreference);
        return true;
      }
    }
  }

  let activeDialog = dialog;
  if (!activeDialog) {
    const opened = clickShopifyButton(banner, ['#shopify-pc__banner__btn-manage-prefs'], ['manage preferences', 'manage']);
    if (!opened) return false;
    const visible = await waitForSiteSelectors(['#shopify-pc__prefs__dialog', '.shopify-pc__prefs__dialog'], 5000);
    if (!visible) return false;
    activeDialog = findVisibleShopifyPrefsDialog();
    if (!activeDialog) return false;
  }

  const appliedPreferences = applyShopifyToggleState(activeDialog, 'shopify-pc__prefs__preferences-input', desiredStates.preferences);
  const appliedMarketing = applyShopifyToggleState(activeDialog, 'shopify-pc__prefs__marketing-input', desiredStates.marketing);
  const appliedAnalytics = applyShopifyToggleState(activeDialog, 'shopify-pc__prefs__analytics-input', desiredStates.analytics);
  if (!appliedPreferences || !appliedMarketing || !appliedAnalytics) return false;

  await new Promise((resolve) => setTimeout(resolve, 250));

  const saved = clickShopifyButton(activeDialog, ['#shopify-pc__prefs__header-save'], ['save my choices', 'save choices', 'save']);
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
  return KETCH_SITE_CONFIGS[host] ?? null;
}

async function handleKetchPrivacyCenter(siteOverrides, prefs, config, options = {}) {
  if (!config) return false;

  const prefersAcceptAll = isEffectivelyAcceptAllPrefs(prefs);
  const interactionLockScope = `ketch:${config.cooldownScope}:${prefs.globalPreference}`;
  const { bypassLock = false } = options;
  if (!bypassLock && isSiteSpecificFlowLocked(interactionLockScope)) return true;
  const onPrivacyCenterPage = isKetchPrivacyCenterPage(config);
  if (!onPrivacyCenterPage) {
    if (isKetchBannerVisible(config)) {
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
  if (outcome !== 'applied') return false;

  startFlowCooldown(config.cooldownScope);
  if (!clickElement(config.saveSelectors)) return false;
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await exitKetchPrivacyCenter(config);
  await chrome.runtime.sendMessage({ type: 'CLEAR_UNSUPPORTED_SITE', domain: site });
  await reportAction(
    siteOverrides.alwaysAccept ? 'site_override:accept_all' : 'site_specific:ketch:save',
    siteOverrides.alwaysAccept ? 'accept_all' : prefs.globalPreference,
  );
  return true;
}

function isKetchPrivacyCenterPage(config) {
  if (!config) return false;
  const bodyText = (document.body?.innerText || '').toLowerCase();
  if (!bodyText.includes(config.privacyCenterTitle)) return false;
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
  const candidates = deepQuerySelectorAll('label, [role="group"], [role="listitem"], li, div, section');
  for (const candidate of candidates) {
    if (!isVisible(candidate)) continue;
    const text = candidate.textContent?.trim().toLowerCase() ?? '';
    if (!text) continue;
    if (!labels.some((label) => text.includes(label))) continue;
    const control = candidate.querySelector('input[type="checkbox"], button[role="switch"], [role="switch"], [aria-checked]');
    if (control) {
      const interactionTarget = findKetchToggleInteractionTarget(control);
      if (interactionTarget && isVisible(interactionTarget)) return interactionTarget;
      if (isVisible(control)) return control;
    }
  }
  return null;
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
  if (!config || !isKetchPrivacyCenterPage(config)) return;

  if (clickElement(config.exitSelectors)) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    if (!isKetchPrivacyCenterPage(config)) return;
  }

  try {
    const referrer = document.referrer || '';
    if (new RegExp(`^https?:\\/\\/(www\\.)?${site.replaceAll('.', '\\.')}\\/`, 'i').test(referrer) && history.length > 1) {
      history.back();
      await new Promise((resolve) => setTimeout(resolve, 1500));
      if (!isKetchPrivacyCenterPage(config)) return;
    }
  } catch (_) {}

  try {
    location.replace(config.homeUrl);
  } catch (_) {
    location.href = config.homeUrl;
  }
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

function shouldUseShopifyMainWorldOnly(prefs) {
  if (prefs?.globalPreference !== 'custom') return false;
  return [
    '#shopify-pc__banner',
    '#shopify-pc__prefs',
    '#shopify-pc__prefs__dialog',
    '.shopify-pc__prefs__dialog',
    '#shopify-pc__banner__btn-manage-prefs',
    '#shopify-pc__prefs__header-save',
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
  ];
}

function findVisibleShopifyBanner() {
  return firstVisibleElementOnPage([
    '#shopify-pc__banner',
    '.shopify-pc__banner__dialog',
  ]);
}

function findVisibleShopifyPrefsDialog() {
  return firstVisibleElementOnPage([
    '#shopify-pc__prefs__dialog',
    '.shopify-pc__prefs__dialog',
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
  return deepQuerySelector(selector);
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

function readCookie(name) {
  try {
    const prefix = `${name}=`;
    const match = document.cookie.split('; ').find((entry) => entry.startsWith(prefix));
    return match ? match.slice(prefix.length) : null;
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

async function reportAction(method, preference) {
  markHandledForCurrentPage(currentRunSignature ?? preference);
  await chrome.runtime.sendMessage({
    type: 'ACTION_FIRED',
    site,
    method,
    preference,
  });
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

function persistPendingPreHandleAction(signature, method, preference) {
  if (!REJECT_RELOAD_GUARD_HOSTS.has(site)) return;
  if (!method) return;
  const actionToken = `${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
  try {
    localStorage.setItem(pendingPreHandleActionKey(signature), JSON.stringify({
      method,
      preference,
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

function firePreHandleAction(method, preference, actionToken) {
  if (!method || !actionToken) return;
  try {
    void chrome.runtime.sendMessage({
      type: 'ACTION_FIRED',
      site,
      method,
      preference,
      actionToken,
    });
  } catch (_) {}
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
    return;
  }
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'ACTION_FIRED',
      site,
      method: payload.method,
      preference: payload.preference,
      actionToken: payload.actionToken,
    });
    if (response?.ok) clearPendingPreHandleAction(signature);
  } catch (_) {}
}

function clearPendingPreHandleAction(signature) {
  try {
    localStorage.removeItem(pendingPreHandleActionKey(signature));
  } catch (_) {}
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
