// Main coordinator — ISOLATED world, document_idle.
// 1. Loads user preferences from the service worker
// 2. Handles site-specific flows when a publisher needs custom logic
// 3. Dispatches prefs to MAIN world scripts (TCF interceptor, GCM injector, CMP API handler)
// 4. Falls back to DOM handler → heuristic if MAIN world didn't handle it
// 5. Reports result to service worker for stats + badge update

const site = location.hostname;
const RUN_GUARD_PREFIX = '__emc_handled__';
const FLOW_COOLDOWN_MS = 15000;
const DO_NOT_HANDLE_URLS = new Set([
  'https://www.theguardian.com/help/accessibility-help',
]);
const DOCUMENT_START_ONLY_SITES = new Set([
  'www.bbc.com',
  'latimes.com',
  'www.latimes.com',
  'membership.latimes.com',
]);

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
    reason: 'This wall currently offers accepting cookies or a subscription-based rejection flow.',
    detectSelectors: [
      'text:configura tu navegación',
      'text:aceptar y continuar',
      'text:rechazar y pagar',
      'text:para seguir navegando sin cookies',
    ],
    acceptSelectors: ['text:aceptar y continuar'],
  },
  'www.lavanguardia.com': {
    reason: 'This wall currently offers accepting cookies or a subscription-based rejection flow.',
    detectSelectors: [
      'text:obtener más información y configuración',
      'text:aceptar y continuar',
      'text:rechazar y suscribirse',
    ],
    acceptSelectors: ['text:aceptar y continuar'],
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
  if (runId !== latestRunId) return;

  document.documentElement.dataset.emcPref = prefs.globalPreference;
  document.dispatchEvent(new CustomEvent('__emc_prefs__', { detail: prefs }));

  const mainWorldResult = await waitForMainWorldResult(3000);
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

  const heuristicResult = runHeuristic(prefs);
  if (heuristicResult) {
    return reportAction(heuristicResult.method, prefs.globalPreference);
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

async function handleSiteSpecificFlow(siteOverrides, prefs) {
  if (site === 'www.lemonde.fr') {
    return handleLeMonde(prefs, siteOverrides);
  }
  if (site === 'www.dw.com') {
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
    'text:agree',
    'text:reject',
    'text:settings',
    'text:save selection',
  ];

  const visible = await waitForSiteSelectors(selectors, 4000);
  if (!visible) return false;

  const onSettingsPage = Boolean(queryElement('.cmpboxbtnyescustomchoices') || queryElement('.cmpboxbtnrejectcustomchoices') || queryElement('text:save selection'));
  if (isFlowCoolingDown('dw') && !onSettingsPage) return true;

  if (onSettingsPage) {
    startFlowCooldown('dw');
    const configured = await configureDWSettings(prefs.globalPreference);
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
      ['.cmptxt_btn_yes2', '.cmptxt_btn_yes', '.cmpboxbtnyes', '#cmpbntyestxt', 'text:agree', 'text:accept'],
      dwWatchSelectors(),
      6000,
    );
    if (accepted) {
      await reportAction('site_specific:accept_all', 'accept_all');
      return true;
    }
    if (await waitForSiteSelectors(['.cmpboxbtnyescustomchoices', '.cmpboxbtnrejectcustomchoices', 'text:save selection'], 1200)) {
      const configured = await configureDWSettings(prefs.globalPreference);
      if (configured) {
        await reportAction('site_specific:accept_all', 'accept_all');
        return true;
      }
    }
  } else {
    startFlowCooldown('dw');
    const rejected = await clickAndWait(
      ['.cmptxt_btn_no2', '.cmptxt_btn_no', '.cmpboxbtnno', '#cmpbntnotxt', 'text:reject', 'text:only necessary'],
      dwWatchSelectors(),
      6000,
    );
    if (rejected) {
      await reportAction('site_specific:deny_all', prefs.globalPreference);
      return true;
    }
    if (await waitForSiteSelectors(['.cmpboxbtnyescustomchoices', '.cmpboxbtnrejectcustomchoices', 'text:save selection'], 1200)) {
      const configured = await configureDWSettings(prefs.globalPreference);
      if (configured) {
        await reportAction('site_specific:settings_save', prefs.globalPreference);
        return true;
      }
    }
  }

  const settingsOpened = clickElement(['.cmpboxbtncustom', '#cmpbntcustomtxt', 'text:settings']);
  if (settingsOpened) {
    startFlowCooldown('dw');
    await new Promise((resolve) => setTimeout(resolve, 250));
    const configured = await configureDWSettings(prefs.globalPreference);
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

function waitForMainWorldResult(timeoutMs) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      document.removeEventListener('__emc_handled__', handler);
      resolve(null);
    }, timeoutMs);

    function handler(e) {
      clearTimeout(timer);
      resolve(e.detail);
    }

    document.addEventListener('__emc_handled__', handler, { once: true });
  });
}

function resolvePrefs(settings, siteOverrides = {}) {
  if (siteOverrides.alwaysAccept) {
    return { functional: true, analytics: true, advertising: true, ccpaDoNotSell: false, globalPreference: 'accept_all' };
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

async function configureDWSettings(preference) {
  const visible = await waitForSiteSelectors(
    [
      '.cmptxt_btn_yes2',
      '.cmptxt_btn_no2',
      '.cmptxt_btn_save2',
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

  if (preference === 'accept_all') {
    if (clickElement([
      '.cmptxt_btn_yes2',
      '.cmptxt_btn_yes',
      '.cmpboxbtnaccept',
      '.cmpboxbtnacceptcustomchoices',
      '.cmpboxbtnyescustomchoices:not(.cmptxt_btn_save2)',
      'text:agree',
      'text:accept',
    ])) {
      await new Promise((resolve) => setTimeout(resolve, 900));
      if (await resolveDWPostChoice()) return true;
    }
  } else {
    if (clickElement([
      '.cmptxt_btn_no2',
      '.cmptxt_btn_no',
      '.cmpboxbtnreject',
      '.cmpboxbtnrejectcustomchoices',
      'text:reject',
    ])) {
      await new Promise((resolve) => setTimeout(resolve, 900));
      if (await resolveDWPostChoice()) return true;
    }
  }

  toggleOffDWRows();
  await new Promise((resolve) => setTimeout(resolve, 220));

  if (!clickElement([
    '.cmptxt_btn_save2',
    '.cmpboxbtnyescustomchoices.cmptxt_btn_save2',
    '.cmpboxbtnsave',
    '.cmpsave',
    'text:save selection',
    'text:save settings',
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

    const stateText = row.querySelector('.cmpofftext, .cmpontxt, .cmptxt_off, .cmponofftext')?.textContent?.trim().toLowerCase() ?? '';
    const toggle = row.querySelector('.cmptogglelink, .cmptogglelinkspan, [role="checkbox"], [role="switch"], [aria-checked]');
    if (!toggle || !isVisible(toggle)) continue;

    const ariaChecked = toggle.getAttribute('aria-checked');
    if (ariaChecked === 'false') continue;
    if (stateText && /inactive|off/.test(stateText)) continue;
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
