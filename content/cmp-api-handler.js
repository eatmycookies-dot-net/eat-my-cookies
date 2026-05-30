// Tier 2 — CMP-specific JavaScript API calls.
// Runs in MAIN world so it can access page-defined globals (window.OneTrust, etc.).
// Waits for CMPs to initialize via MutationObserver, then fires the appropriate method.

(function () {
  const GUARDIAN_HOSTS = new Set(['www.theguardian.com', 'support.theguardian.com']);
  const GUARDIAN_REJECT_API_HOSTS = new Set(['www.theguardian.com', 'support.theguardian.com']);
  const EXPLICIT_ONETRUST_CONTROL_HOSTS = new Set(['www.bbc.com']);
  const ONETRUST_PRIVACY_CHOICES_CCPA_HOSTS = new Set(['www.cnbc.com', 'www.nbcnews.com', 'www.schwab.com', 'schwab.com']);
  // CNBC exposes a visible top-level OneTrust banner that reloads on save.
  // NBC News does not consistently expose the same surface, and forcing this
  // path there can route users away from the homepage on reject.
  const ONETRUST_RELOAD_ON_SAVE_HOSTS = new Set(['www.cnbc.com']);
  const ONETRUST_FORCE_CLEANUP_HOSTS = new Set(['www.zoom.com', 'www.thomsonreuters.com', 'thomsonreuters.com']);
  const ONETRUST_PRIVACY_CENTER_ACCEPT_HOSTS = new Set(['www.thomsonreuters.com', 'thomsonreuters.com', 'www.schwab.com', 'schwab.com']);
  const ONETRUST_AGGRESSIVE_CLEANUP_HOSTS = new Set(['www.thomsonreuters.com', 'thomsonreuters.com']);
  const ONETRUST_CLEANUP_WATCH_MS = 15000;
  const DISNEY_FAMILY_USNAT_HOSTS = new Set(['www.disney.com', 'www.espn.com', 'www.hulu.com']);
  const DISNEY_PRIVACY_HOSTS = new Set(['privacy.thewaltdisneycompany.com']);
  const ZOOM_ONETRUST_HOSTS = new Set(['www.zoom.com']);
  const NIKE_CCPA_HOSTS = new Set(['www.nike.com']);
  const ONETRUST_VISIBLE_SELECTORS = [
    '#onetrust-banner-sdk',
    '#onetrust-consent-sdk',
    '#onetrust-pc-sdk',
    '.onetrust-pc-dark-filter',
  ];
  const ONETRUST_ACTIONABLE_SURFACE_SELECTORS = [
    ...ONETRUST_VISIBLE_SELECTORS,
    '#onetrust-pc-btn-handler',
    '#onetrust-accept-btn-handler',
    '#onetrust-reject-all-handler',
    '.ot-pc-refuse-all-handler',
    '.save-preference-btn-handler',
    '.category-switch-handler',
    "input[id^='ot-group-id-']",
  ];
  let _guardianRetryTimer = null;

  // Sourcepoint: intercept window._sp_queue before their SDK processes it.
  // SP checks _sp_queue on load; pushing a callback here lets us hook onMessageReady
  // and dismiss the consent layer if their JS API exposes a reject method post-init.
  // The primary SP handler is sp-frame-handler.js (clicking inside the iframe).
  // This is a secondary attempt via the main-page JS API.
  (function hookSourcepoint() {
    if (['www.ft.com'].includes(window.location.hostname)) return;
    const queue = window._sp_queue;
    if (!Array.isArray(queue)) return;  // SP not present on this page

    // SP SDK fires window._sp_.events.onMessageReady when the consent UI is shown.
    // We add our own onMessageReady handler via the config events queue.
    const existingConfig = window._sp_?.config;
    if (!existingConfig) return;

    const origReady = existingConfig.events?.onMessageReady;
    existingConfig.events = existingConfig.events || {};
    existingConfig.events.onMessageReady = function (...args) {
      // Called after SP renders its message. At this point their SDK methods exist.
      // _sp_.reject() / _sp_.accept() may be available depending on SP version.
      try {
        const pref   = document.documentElement.dataset.emcPref ?? 'reject_all';
        const accept = pref === 'accept_all';

        if (GUARDIAN_HOSTS.has(window.location.hostname)) {
          const handled = accept
            ? invokeGuardianAcceptPreference()
            : invokeGuardianRejectPreference();
          if (handled) {
            origReady?.apply(this, args);
            return;
          }
        }

        // GDPR framework
        if (window._sp_?.gdpr) {
          accept ? window._sp_.gdpr?.acceptAll?.() : window._sp_.gdpr?.rejectAll?.();
        }
        // USNat / CCPA — rejectAll = opt out of data sale
        if (window._sp_?.usnat) {
          accept ? window._sp_.usnat?.acceptAll?.() : window._sp_.usnat?.rejectAll?.();
        }
        // Fallback: top-level _sp_ (older SP builds)
        if (!window._sp_?.gdpr && !window._sp_?.usnat) {
          accept
            ? (window._sp_?.accept?.() || window._sp_?.acceptAll?.())
            : (window._sp_?.reject?.() || window._sp_?.rejectAll?.());
        }
      } catch (_) {}
      origReady?.apply(this, args);
    };
  })();

  const CMP_HANDLERS = {
    OneTrust: async (w, prefs) => {
      if (DISNEY_PRIVACY_HOSTS.has(window.location.hostname)) {
        return handleDisneyPrivacyChoices(prefs);
      }

      if (shouldUseOneTrustPrivacyCenterOptOut(prefs, window.location.hostname)) {
        return handleOneTrustPrivacyCenterReject('cmp_api:OneTrust:ccpa');
      }

      // Detect USNat modal first — applies to both accept and reject paths.
      // USNat "Notice of Right to Opt Out" banners use "Submit" as the confirm label.
      // GDPR preference centers use "Accept All" or "Confirm My Choices" — never "Submit".
      // Do NOT gate on isVisible(submitBtn): during React reconciliation the button
      // exists with the correct text but is momentarily invisible, which caused false
      // negatives that fell through to the GDPR accept path.
      const submitBtn = document.querySelector('#onetrust-accept-btn-handler');
      const isUSNat = submitBtn &&
        /\bsubmit\b/i.test(submitBtn.textContent?.trim() ?? '');

      if (isUSNat) {
        // USNat/CCPA modal (e.g. Disney, ESPN): commit consent via API, then close the UI.
        // Disney's OneTrust checks event.isTrusted on the Submit click handler, so our
        // synthetic click is ignored. The workaround: use the JS API to persist consent
        // (already commits to the OptanonConsent cookie), try the Submit click, then fall
        // back to DOM removal if the modal is still visible after 400 ms. This mirrors the
        // Guardian SP approach: call the API, then destroy the modal elements directly.
        if (prefs.ccpaDoNotSell !== false) {
          // Opt out: RejectAll() commits consent to the cookie immediately.
          if (typeof w.OneTrust?.RejectAll === 'function') w.OneTrust.RejectAll();
          // Wait up to 600 ms for OneTrust to propagate API state to DOM toggles.
          // If they flip OFF, Submit (if it fires) reads the correct state.
          // If they stay ON, force them OFF immediately before the click attempt.
          const togglesOff = await waitForOneTrustTogglesState(false, 600);
          if (!togglesOff) setOneTrustTogglesNow(false);
        } else {
          // Opt in: Accept() commits the allow-selling state to the cookie.
          if (typeof w.OneTrust?.Accept === 'function') w.OneTrust.Accept();
          // Disney-family USNat builds can leave the visible toggle UI stale even after
          // Accept() commits the cookie. Mirror the reject path: wait briefly for OneTrust
          // to reconcile the DOM, then force the toggles ON right before Submit if needed.
          const togglesOn = await waitForOneTrustTogglesState(true, 600);
          if (!togglesOn) setOneTrustTogglesNow(true);
        }

        // Attempt the Submit click — works when isTrusted is not required.
        const btn = document.querySelector('#onetrust-accept-btn-handler') ?? submitBtn;
        dispatchSyntheticClick(btn);

        // Give OneTrust 400 ms to close the modal via its own dismiss handler.
        // If it's still visible, the click was blocked (isTrusted check) — remove DOM
        // directly since consent is already committed to the cookie by the API call above.
        await delay(400);
        if (hasVisibleSelector(ONETRUST_VISIBLE_SELECTORS)) {
          closeOneTrustUSNatModal();
        }

        _handled = true;
        document.dispatchEvent(new CustomEvent('__emc_handled__', {
          detail: { method: 'cmp_api:OneTrust:usnat' }
        }));
        return true;
      }

      // --- Non-USNat (GDPR) path below ---

      if (prefs.globalPreference === 'custom' && ZOOM_ONETRUST_HOSTS.has(window.location.hostname)) {
        return handleZoomOneTrustCustom(prefs);
      }

      if (prefs.globalPreference === 'accept_all' && shouldUseOneTrustPrivacyCenterAccept(window.location.hostname)) {
        return handleOneTrustPrivacyCenterAccept();
      }

      if (prefs.globalPreference === 'accept_all') {
        if (!hasVisibleSelector(ONETRUST_ACTIONABLE_SURFACE_SELECTORS)) {
          return false;
        }
        if (ZOOM_ONETRUST_HOSTS.has(window.location.hostname) && closeZoomOneTrustBannerIfVisible()) {
          return true;
        }
        const acceptClicked = clickFirstVisible([
          '#accept-recommended-btn-handler',
          '#onetrust-accept-btn-handler',
          'button[aria-label*="Accept" i]',
          'button[title*="Accept" i]',
        ]);
        if (acceptClicked) {
          if (shouldForceOneTrustCleanup(window.location.hostname)) {
            await delay(500);
            if (hasVisibleSelector(ONETRUST_VISIBLE_SELECTORS)) {
              scheduleOneTrustCleanup();
            }
          }
          return true;
        }
        if (typeof w.OneTrust?.Accept === 'function') {
          w.OneTrust.Accept();
          if (shouldForceOneTrustCleanup(window.location.hostname)) {
            await delay(250);
            const btn = document.querySelector('#onetrust-accept-btn-handler');
            if (btn && isVisible(btn)) dispatchSyntheticClick(btn);
            await delay(500);
            if (hasVisibleSelector(ONETRUST_VISIBLE_SELECTORS)) {
              scheduleOneTrustCleanup();
            }
          }
          return true;
        }
        return clickFirstVisible([
          '#accept-recommended-btn-handler',
          '#onetrust-accept-btn-handler',
          'button[aria-label*="Accept" i]',
          'button[title*="Accept" i]',
        ]);
      }

      if (typeof w.OneTrust?.RejectAll === 'function') {
        if (!hasVisibleSelector(ONETRUST_ACTIONABLE_SURFACE_SELECTORS)) {
          return false;
        }
        // GDPR preference center: RejectAll via API, fall through to waitForDismissal
        w.OneTrust.RejectAll();
        await delay(300);
        return true;
      }

      if (clickFirstVisible([
        '#onetrust-reject-all-handler',
        '.ot-pc-refuse-all-handler',
        'button[aria-label*="Reject" i]',
        'button[title*="Reject" i]',
      ])) {
        return true;
      }

      return handleOneTrustPrivacyCenterReject();
    },
    Cookiebot: (w, prefs) => {
      if (!w.Cookiebot) return false;
      w.Cookiebot.declined = prefs.globalPreference !== 'accept_all';
      w.Cookiebot.consented = prefs.globalPreference === 'accept_all';
      if (prefs.globalPreference === 'accept_all') {
        w.Cookiebot.submitCustomConsent?.(true, true, true);
      } else {
        w.Cookiebot.withdraw?.();
      }
      return true;
    },
    UC_UI: (w, prefs) => {
      if (!w.UC_UI) return false;
      if (prefs.globalPreference === 'accept_all') {
        w.UC_UI?.acceptAllConsents?.();
      } else {
        w.UC_UI?.denyAllConsents?.();
      }
      return true;
    },
    Didomi: (w, prefs) => {
      if (!w.Didomi) return false;
      if (prefs.globalPreference === 'accept_all') {
        w.Didomi?.setUserAgreeToAll?.();
      } else {
        w.Didomi?.setUserDisagreeToAll?.();
      }
      return true;
    },
    truste: (w, prefs) => {
      if (!w.truste?.eu?.bindMap) return false;
      w.truste.eu.bindMap.on = prefs.globalPreference === 'accept_all' ? '1' : '0';
      return true;
    },
    _axcb: (w, prefs) => {
      if (!Array.isArray(w._axcb)) return false;
      w._axcb.push((axeptio) => {
        if (prefs.globalPreference === 'accept_all') {
          axeptio?.acceptAll?.();
        } else {
          axeptio?.dismiss?.();
        }
      });
      return true;
    },
    _iub: (w, prefs) => {
      if (!w._iub?.cs) return false;
      if (prefs.globalPreference === 'accept_all') {
        w._iub.cs.api?.accept?.() ||
        w._iub.cs.acceptCookiesFull?.();
      } else {
        w._iub.cs.api?.reject?.() ||
        w._iub.cs.reject?.()      ||
        w._iub.cs.rejectCookies?.();
      }
      return true;
    },
    privacyBanner: async (w, prefs) => {
      if (!w.privacyBanner) return false;
      if (!hasVisibleSelector(CMP_SELECTORS.privacyBanner ?? [])) return false;
      if (prefs.globalPreference === 'custom') return false;

      const bannerClicked = prefs.globalPreference === 'accept_all'
        ? activateVisibleElement(firstVisibleElement([
          '#shopify-pc__banner__btn-accept',
          'button.shopify-pc__banner__btn-accept',
        ]))
        : prefs.globalPreference === 'reject_all'
          ? activateVisibleElement(firstVisibleElement([
            '#shopify-pc__banner__btn-decline',
            'button.shopify-pc__banner__btn-decline',
          ]))
          : false;
      if (bannerClicked) {
        return 'cmp_api:Shopify';
      }

      if (typeof w.privacyBanner.showPreferences === 'function' &&
        !hasVisibleSelector(shopifyPreferenceSelectors())) {
        try {
          await w.privacyBanner.showPreferences();
        } catch (_) {}
      }

      const consentApi = await waitForShopifyConsentApi(w, 6000);
      if (!consentApi?.setTrackingConsent) return false;

      const desiredConsent = {
        marketing: prefs.globalPreference === 'accept_all'
          ? true
          : prefs.globalPreference === 'reject_all'
            ? false
            : Boolean(prefs.advertising),
        analytics: prefs.globalPreference === 'accept_all'
          ? true
          : prefs.globalPreference === 'reject_all'
            ? false
            : Boolean(prefs.analytics),
        preferences: prefs.globalPreference === 'accept_all'
          ? true
          : prefs.globalPreference === 'reject_all'
            ? false
            : Boolean(prefs.functional) || prefs.uncategorized === 'accept',
      };

      const submission = await submitShopifyConsent(consentApi, desiredConsent);
      if (!submission.ok) return false;

      await waitForShopifyConsent(consentApi, desiredConsent, 2500).catch(() => false);

      closeShopifyPrivacyUi();
      cleanupShopifyPrivacyArtifacts();
      await delay(150);
      _handled = true;
      document.dispatchEvent(new CustomEvent('__emc_handled__', {
        detail: {
          method: prefs.globalPreference === 'custom'
            ? 'cmp_api:Shopify:custom'
            : 'cmp_api:Shopify',
        },
      }));
      return false;
    },
    Nike: async (w, prefs) => {
      if (!NIKE_CCPA_HOSTS.has(w.location.hostname)) return false;
      if (!/^\/(?:guest|member)\/settings\/do-not-share-my-data/.test(w.location.pathname)) return false;
      // Skip if we only have partial prefs (bootstrapped from dataset attribute).
      // Full prefs arrive via __emc_prefs__ and include ccpaDoNotSell.
      if (prefs.ccpaDoNotSell === undefined) return false;

      const checkbox = await waitForNikeCheckbox(6000);
      if (!checkbox) return false;

      // Only handle the opt-out direction (checking the "Do Not Share" box).
      // Checking the box triggers Nike's React onChange which sets ni_c=1PA=0 client-side.
      // Unchecking (opting back in) does not reliably update the server-side preference
      // cookie via automated DOM interaction; users who choose accept_all are left with
      // whatever server-side state Nike persisted from their last manual interaction.
      const shouldOptOut = prefs.ccpaDoNotSell !== false;
      if (shouldOptOut && !checkbox.checked) {
        setNikeCheckbox(checkbox);
        await new Promise((r) => setTimeout(r, 1000));
      }

      _handled = true;
      document.dispatchEvent(new CustomEvent('__emc_handled__', {
        detail: { method: 'cmp_api:Nike' },
      }));
      return false;
    },
  };

  const CMP_SELECTORS = {
    OneTrust: [
      '#onetrust-banner-sdk',
      '#onetrust-consent-sdk',
      '#onetrust-pc-sdk',
      '.onetrust-pc-dark-filter',
      '#onetrust-reject-all-handler',
      '#onetrust-pc-btn-handler',
      '#ot-sdk-btn',
      '.df-privacy-compliance',
      '.ot-sdk-show-settings',
      '.save-preference-btn-handler',
    ],
    Cookiebot: ['#CybotCookiebotDialog', '#cookiebanner'],
    UC_UI: ['#usercentrics-root', "[data-testid='uc-banner']"],
    Didomi: ['#didomi-popup', '#didomi-notice'],
    truste: ['#truste-consent-track', '.truste_overlay'],
    _axcb: ['#axeptio_overlay', '.axeptio_widget'],
    _iub: ['#iubenda-cs-banner', '.iubenda-cs-content', '.iubenda-cs-reject-btn', '.iubenda-cs-accept-btn'],
    privacyBanner: [
      '#shopify-pc__banner',
      '.shopify-pc__banner__dialog',
      '#shopify-pc__prefs',
      '#shopify-pc__prefs__dialog',
      '.shopify-pc__prefs__dialog',
      '#shopify-pc__prefs__header-save',
      '#shopify-pc__banner__btn-manage-prefs',
    ],
    Nike: [],
  };

  const HOST_RESTRICTIONS = {
    'www.repubblica.it': {
      reject_all: ['_iub'],
      custom: ['_iub'],
    },
    'www.ft.com': {
      reject_all: ['OneTrust'],
      custom: ['OneTrust'],
      accept_all: ['OneTrust'],
    },
    'www.euronews.com': {
      reject_all: ['Didomi'],
      custom: ['Didomi'],
      accept_all: ['Didomi'],
    },
    'www.lemonde.fr': {
      reject_all: ['OneTrust', '_iub'],
      custom: ['OneTrust', '_iub'],
    },
  };

  let _prefs = null;
  let _handled = false;
  let _trying = false;
  let _debounceTimer = null;
  let _proactiveSynced = false;
  let _lastTrustedClick = 0;

  // Track user-initiated interactions so we don't auto-dismiss preference centers
  // the user intentionally opened via footer links or similar controls.
  document.addEventListener('click', (e) => {
    if (e.isTrusted) _lastTrustedClick = Date.now();
  }, { capture: true, passive: true });

  function userClickedRecently() {
    return _lastTrustedClick > 0 && Date.now() - _lastTrustedClick < 2000;
  }

  async function tryHandlers() {
    if (_handled || !_prefs) return;
    if (userClickedRecently()) return;

    // Guardian uses a dedicated retry loop (startGuardianRetryLoop) that fires every 400ms
    // to wait for Sourcepoint's iframe to load. The _trying guard would block every retry
    // for the full duration of waitForDismissal (up to 5s), breaking the retry cadence.
    // Guardian's tryGuardianSourcepointHandler has its own fast-fail visibility check,
    // so concurrent calls are safe there.
    if (GUARDIAN_HOSTS.has(window.location.hostname)) {
      if (await tryGuardianSourcepointHandler()) return;
      return;
    }

    // For all other sites: prevent concurrent handler calls.
    // Without this guard, React/SPA DOM mutations flood tryHandlers() with concurrent
    // async calls, each holding a waitForDismissal polling loop, freezing the browser.
    if (_trying) return;
    _trying = true;
    try {
      for (const [name, handler] of Object.entries(CMP_HANDLERS)) {
        try {
          if (_handled) return;
          if (isBlockedForHost(name, _prefs.globalPreference)) continue;
          if (!shouldAttemptHandler(name)) continue;
          const result = await handler(window, _prefs);
          if (result) {
            if (_handled) return; // handler self-dispatched __emc_handled__ (e.g. USNat early signal)
            if (await waitForDismissal(CMP_SELECTORS[name] ?? [])) {
              if (name === 'OneTrust' && shouldForceOneTrustCleanup(window.location.hostname)) scheduleOneTrustCleanup();
              _handled = true;
              document.dispatchEvent(new CustomEvent('__emc_handled__', {
                detail: { method: typeof result === 'string' ? result : `cmp_api:${name}` }
              }));
              return;
            }
          }
        } catch (_) {}
      }
    } finally {
      _trying = false;
    }
  }

  // Proactively syncs OneTrust consent when the library is initialized but no modal
  // is visible. OneTrust suppresses the modal on return visits once a consent cookie
  // exists, so changing the extension preference between visits would have no effect
  // until the cookie expires. This runs once per page load, after confirming a cached
  // OptanonConsent cookie is present and no modal is currently showing.
  function syncOneTrustConsent() {
    if (_handled || _proactiveSynced || !_prefs) return;
    if (userClickedRecently()) return;
    if (isBlockedForHost('OneTrust', _prefs.globalPreference)) return;
    if (typeof window.OneTrust?.RejectAll !== 'function') return;
    if (hasVisibleSelector(CMP_SELECTORS.OneTrust ?? [])) return;
    if (!document.cookie.includes('OptanonConsent=')) return;
    _proactiveSynced = true;
    if (_prefs.ccpaDoNotSell !== false) {
      window.OneTrust.RejectAll();
    } else if (typeof window.OneTrust?.Accept === 'function') {
      window.OneTrust.Accept();
    }
  }

  document.addEventListener('__emc_prefs__', (e) => {
    setPrefs(e.detail);
    if (GUARDIAN_HOSTS.has(window.location.hostname)) {
      startGuardianRetryLoop();
    }
    tryHandlers();
    syncOneTrustConsent();
  }, { once: true });

  bootstrapPrefsFromDataset();
  if (_prefs?.globalPreference) {
    if (GUARDIAN_HOSTS.has(window.location.hostname)) {
      startGuardianRetryLoop();
    }
    tryHandlers();
  }

  // The isolated-world coordinator can set data-emc-pref slightly after this MAIN-world
  // script loads. Re-check a few times so quiet non-SPA pages (like Disney's privacy
  // center) still pick up prefs even if the initial bootstrap ran too early.
  for (const ms of [120, 400, 1200, 2500]) {
    setTimeout(() => {
      if (_handled) return;
      bootstrapPrefsFromDataset();
      if (!_prefs?.globalPreference) return;
      if (GUARDIAN_HOSTS.has(window.location.hostname)) {
        startGuardianRetryLoop();
      }
      tryHandlers();
      syncOneTrustConsent();
    }, ms);
  }

  // React/Next.js SPAs emit hundreds of DOM mutations per second. A MutationObserver
  // there re-enters tryHandlers() continuously even after _handled = true, causing
  // dismiss/re-show loops. For SPAs we use scheduled polling instead.
  if (isSPA()) {
    for (const ms of [300, 800, 1800, 3500, 6000, 10000]) {
      setTimeout(() => {
        if (_handled) return;
        bootstrapPrefsFromDataset();
        tryHandlers();
        syncOneTrustConsent();
      }, ms);
    }
  } else {
    const observer = new MutationObserver(() => {
      bootstrapPrefsFromDataset();
      if (_handled || _trying) return;
      clearTimeout(_debounceTimer);
      _debounceTimer = setTimeout(() => { tryHandlers(); syncOneTrustConsent(); }, 100);
    });
    const root = document.documentElement ?? document;
    if (root) observer.observe(root, { childList: true, subtree: true });
    setTimeout(() => { observer.disconnect(); clearTimeout(_debounceTimer); }, 15000);
  }

  // Detects React/Next.js/Nuxt SPAs via page-global markers accessible in MAIN world.
  function isSPA() {
    return !!(
      window.__NEXT_DATA__ ||       // Next.js (Disney, many US sites)
      window.___gatsby ||           // Gatsby
      window.__nuxt__ ||            // Nuxt
      window.__vue_app__            // Vue 3 app root
    );
  }

  async function tryGuardianSourcepointHandler() {
    if (!hasVisibleSourcepointSelector()) return false;
    if (_prefs.globalPreference === 'accept_all') {
      if (!invokeGuardianAcceptPreference()) return false;
      if (!(await waitForDismissal(sourcepointSelectors(), 5000))) return false;
      _handled = true;
      document.dispatchEvent(new CustomEvent('__emc_handled__', {
        detail: { method: 'cmp_api:Sourcepoint:guardian_accept' }
      }));
      return true;
    }
    if (!GUARDIAN_REJECT_API_HOSTS.has(window.location.hostname)) return false;
    if (!invokeGuardianRejectPreference()) return false;
    // destroyMessages/destroyMessaging + cleanupGuardianArtifacts were called immediately
    // inside invokeGuardianRejectPreference(), so the modal is already removed.
    // waitForDismissal here catches the rare case of a delayed SP re-render.
    if (!(await waitForDismissal(sourcepointSelectors(), 5000))) return false;
    _handled = true;
    document.dispatchEvent(new CustomEvent('__emc_handled__', {
      detail: { method: 'cmp_api:Sourcepoint:guardian_reject' }
    }));
    return true;
  }

  function startGuardianRetryLoop() {
    if (_guardianRetryTimer) return;
    const started = Date.now();
    _guardianRetryTimer = setInterval(() => {
      if (_handled || !_prefs || Date.now() - started > 10000) {
        clearInterval(_guardianRetryTimer);
        _guardianRetryTimer = null;
        return;
      }
      tryHandlers();
    }, 400);
  }

  function sourcepointSelectors() {
    return [
      "[id^='sp_message_container']",
      "[id^='sp_message_iframe']",
      '.sp_choice_type_REJECT_ALL',
      '.sp_choice_type_ACCEPT_ALL',
      '.sp_choice_type_11',
      '.sp_choice_type_13',
      '.gu-btn-dns',
      "button[title*='Do not sell or share' i]",
      "button[aria-label*='Do not sell or share' i]",
      "button[data-sp-action='REJECT_ALL']",
      "button[data-sp-action='ACCEPT_ALL']",
    ];
  }

  function shopifyPreferenceSelectors() {
    return [
      '#shopify-pc__prefs',
      '#shopify-pc__prefs__dialog',
      '.shopify-pc__prefs__dialog',
      '#shopify-pc__prefs__header-save',
      '#shopify-pc__prefs__preferences-input',
      '#shopify-pc__prefs__marketing-input',
      '#shopify-pc__prefs__analytics-input',
    ];
  }

  function hasVisibleSourcepointSelector() {
    return hasVisibleSelector(sourcepointSelectors());
  }

  function invokeGuardianRejectPreference() {
    const reject = window._sp_?.usnat?.postRejectAll;
    if (typeof reject !== 'function') return false;

    try {
      // Destroy the consent UI immediately — before postRejectAll fires its async callback.
      // If we wait for the callback, SP has already rendered its Privacy Manager panel,
      // and the click-based "Save and close" approach was unreliable.
      window._sp_?.destroyMessages?.();
      window._sp_?.destroyMessaging?.();
      cleanupGuardianArtifacts();
      scheduleGuardianCleanup(); // catch any delayed re-renders
      reject.call(window._sp_.usnat, () => {}); // persist opt-out preference async
      return true;
    } catch (_) {
      return false;
    }
  }

  function invokeGuardianAcceptPreference() {
    try {
      document.cookie = `consentDateUsnat=${new Date().toISOString()}; domain=.theguardian.com; path=/; Secure; SameSite=None`;
      window._sp_?.destroyMessages?.();
      window._sp_?.destroyMessaging?.();
      scheduleGuardianCleanup();
      cleanupGuardianArtifacts();
      return true;
    } catch (_) {
      return false;
    }
  }

  function scheduleGuardianCleanup() {
    try {
      setTimeout(() => cleanupGuardianArtifacts(), 1500);
      setTimeout(() => cleanupGuardianArtifacts(), 4000);
    } catch (_) {}
  }

  function cleanupGuardianArtifacts() {
    try {
      document.documentElement.classList.remove('sp-message-open', 'src-focus-disabled');
      document.body?.classList?.remove('sp-message-open', 'src-focus-disabled');
      for (const el of document.querySelectorAll("[id^='sp_message_container'], [id^='sp_message_iframe'], .message-overlay")) {
        el.remove?.();
      }
      if (document.body) {
        document.body.style.overflow = '';
      }
      document.documentElement.style.overflow = '';
    } catch (_) {}
  }

  async function waitForDismissal(selectors, timeoutMs = 4000) {
    const requiresStableHidden = ZOOM_ONETRUST_HOSTS.has(window.location.hostname) &&
      selectors.some((selector) => selector.includes('onetrust') || selector.includes('ot-'));
    const stableHiddenMs = requiresStableHidden ? 1200 : 0;
    if (requiresStableHidden) timeoutMs += 2500;
    const started = Date.now();
    let hiddenSince = null;
    while (Date.now() - started < timeoutMs) {
      const visible = selectors.some((selector) => {
        const el = document.querySelector(selector);
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      });
      if (!visible) {
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

  function getShopifyConsentApi(w = window) {
    return w.Shopify?.customerPrivacy ?? w.Shopify?.trackingConsent ?? null;
  }

  async function waitForShopifyConsentApi(w = window, timeoutMs = 6000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const consentApi = getShopifyConsentApi(w);
      if (consentApi?.setTrackingConsent) return consentApi;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    return getShopifyConsentApi(w);
  }

  async function submitShopifyConsent(consentApi, desiredConsent) {
    try {
      const result = await new Promise((resolve) => {
        consentApi.setTrackingConsent(desiredConsent, (error, data) => {
          resolve({ error, data });
        });
      });
      return {
        ok: !result?.error,
        data: result?.data ?? null,
        error: result?.error ?? null,
      };
    } catch (_) {
      return { ok: false, data: null, error: true };
    }
  }

  async function waitForShopifyConsent(consentApi, desiredConsent, timeoutMs = 2500) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const current = consentApi.currentVisitorConsent?.();
      if (shopifyConsentMatches(current, desiredConsent)) return true;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    return shopifyConsentMatches(consentApi.currentVisitorConsent?.(), desiredConsent);
  }

  function shopifyConsentMatches(current, desiredConsent) {
    if (!current) return false;
    return normalizeShopifyConsent(current.marketing) === desiredConsent.marketing &&
      normalizeShopifyConsent(current.analytics) === desiredConsent.analytics &&
      normalizeShopifyConsent(current.preferences) === desiredConsent.preferences;
  }

  function normalizeShopifyConsent(value) {
    if (value === 'yes' || value === true) return true;
    if (value === 'no' || value === false) return false;
    return null;
  }

  function cleanupShopifyPrivacyArtifacts() {
    for (const selector of [
      '#shopify-pc__banner',
      '#shopify-pc__prefs',
      '#shopify-pc__prefs__dialog',
      '#shopify-pc__prefs__overlay',
      '.shopify-pc__banner__dialog',
      '.shopify-pc__prefs__dialog',
      '.shopify-pc__prefs__overlay',
    ]) {
      for (const el of document.querySelectorAll(selector)) {
        if (!(el instanceof HTMLElement)) continue;
        el.style.display = 'none';
        el.setAttribute('aria-hidden', 'true');
      }
    }
    try {
      document.documentElement?.classList?.remove('lock');
      document.body?.classList?.remove('lock');
      if (document.documentElement) document.documentElement.style.overflow = '';
      if (document.body) document.body.style.overflow = '';
    } catch (_) {}
  }

  function closeShopifyPrivacyUi() {
    const closeButton = firstVisibleElement([
      '#shopify-pc__prefs__header-close',
      'button.shopify-pc__prefs__header-close',
    ]);
    if (closeButton) {
      dispatchSyntheticClick(closeButton);
    }
  }

  function hasVisibleSelector(selectors) {
    return selectors.some((selector) => {
      for (const el of document.querySelectorAll(selector)) {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        if (rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden') {
          return true;
        }
      }
      return false;
    });
  }

  function firstVisibleElement(selectors) {
    for (const selector of selectors) {
      for (const el of document.querySelectorAll(selector)) {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        if (rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden') {
          return el;
        }
      }
    }
    return null;
  }

  function isBlockedForHost(handlerName, preference) {
    const host = window.location.hostname;
    const restricted = HOST_RESTRICTIONS[host]?.[preference] ?? [];
    return restricted.includes(handlerName);
  }

  function shouldAttemptHandler(name) {
    if (hasVisibleSelector(CMP_SELECTORS[name] ?? [])) return true;
    if (name === 'Nike') {
      return NIKE_CCPA_HOSTS.has(window.location.hostname) &&
        /^\/(?:guest|member)\/settings\/do-not-share-my-data/.test(window.location.pathname);
    }
    return name === 'OneTrust' &&
      DISNEY_FAMILY_USNAT_HOSTS.has(window.location.hostname) &&
      document.getElementById('ot-group-id-BG559') != null;
  }

  function shouldUseOneTrustPrivacyCenterOptOut(prefs, host = window.location.hostname) {
    return ONETRUST_PRIVACY_CHOICES_CCPA_HOSTS.has(host) && prefs.ccpaDoNotSell !== false;
  }

  function shouldUseOneTrustPrivacyCenterAccept(host = window.location.hostname) {
    return ONETRUST_PRIVACY_CENTER_ACCEPT_HOSTS.has(host);
  }

  function shouldForceOneTrustCleanup(host = window.location.hostname) {
    return ONETRUST_FORCE_CLEANUP_HOSTS.has(host);
  }

  function setPrefs(detail) {
    if (!detail?.globalPreference) return;
    _prefs = detail;
  }

  function bootstrapPrefsFromDataset() {
    if (_prefs?.globalPreference) return;
    const pref = document.documentElement.dataset.emcPref;
    if (!pref) return;
    _prefs = { globalPreference: pref };
  }

  async function handleOneTrustPrivacyCenterReject(method = 'cmp_api:OneTrust') {
    const settingsVisible = hasVisibleSelector([
      '.save-preference-btn-handler',
      '.category-switch-handler',
      "input[id^='ot-group-id-']",
      '#onetrust-consent-sdk',
      '#onetrust-pc-sdk',
    ]);
    const actionableSurfaceVisible = hasVisibleSelector(ONETRUST_ACTIONABLE_SURFACE_SELECTORS);
    const privacyChoicesEntryVisible = hasVisibleOneTrustPrivacyChoicesEntry(window.location.hostname);

    if (!settingsVisible && !actionableSurfaceVisible && !privacyChoicesEntryVisible) {
      return false;
    }

    const opened = settingsVisible || clickFirstVisible([
      '#onetrust-pc-btn-handler',
      '#ot-sdk-btn',
      'a.df-privacy-compliance',
      '.df-privacy-compliance',
      '.ot-sdk-show-settings',
      'button[aria-label*="Privacy Choices" i]',
      'button[title*="Privacy Choices" i]',
      'button[aria-label*="Cookie Settings" i]',
      'button[title*="Cookie Settings" i]',
      'button[aria-label*="Manage Preferences" i]',
      'button[title*="Manage Preferences" i]',
    ]) || clickOneTrustContinueToSettings(window.location.hostname);

    if (!opened) {
      // USNat/CCPA direct opt-out modal: no privacy center opener exists.
      // Toggles appear directly on the notice (e.g. Disney's "Notice of Right to Opt Out").
      return tryOneTrustUSNatDirectReject();
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
      dispatchPreHandleIfOneTrustReloadsOnSave();
    }
    if (clickFirstVisible(rejectSelectors)) {
      return method;
    }

    disableVisibleOneTrustToggles();
    await delay(250);

    const saveSelectors = oneTrustSaveSelectors();
    if (hasVisibleSelector(saveSelectors)) {
      dispatchPreHandleIfOneTrustReloadsOnSave();
    }
    const clicked = clickFirstVisible(saveSelectors);
    if (clicked && shouldForceOneTrustCleanup(window.location.hostname)) {
      scheduleOneTrustCleanup();
    }
    return clicked ? method : false;
  }

  async function handleOneTrustPrivacyCenterAccept(method = 'cmp_api:OneTrust') {
    const settingsVisible = hasVisibleSelector([
      '.save-preference-btn-handler',
      '.category-switch-handler',
      "input[id^='ot-group-id-']",
      '#onetrust-consent-sdk',
      '#onetrust-pc-sdk',
    ]);

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
    ]);
    if (!opened) return false;

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

    const clicked = clickFirstVisible(oneTrustSaveSelectors(window.location.hostname));
    if (clicked && shouldForceOneTrustCleanup(window.location.hostname)) {
      scheduleOneTrustCleanup();
    }
    return clicked ? method : false;
  }

  async function handleDisneyPrivacyChoices(prefs) {
    const settingsVisible = hasVisibleSelector([
      '#ot-group-id-SSPD_BG',
      '.save-preference-btn-handler',
      '#onetrust-pc-sdk',
    ]);

    if (!settingsVisible) {
      const opened = clickFirstVisible([
        'a.df-privacy-compliance',
        '.df-privacy-compliance',
        '.ot-sdk-show-settings',
        '#ot-sdk-btn',
        '#onetrust-pc-btn-handler',
      ]);
      if (!opened) return false;
    }

    if (!(await waitForAnyVisible([
      '#ot-group-id-SSPD_BG',
      '.save-preference-btn-handler',
      '#onetrust-pc-sdk',
    ], 5000))) {
      return false;
    }

    setDisneyPrivacyChoice(prefs.ccpaDoNotSell === false);
    await delay(250);

    const saveBtn = document.querySelector('.save-preference-btn-handler');
    let clicked = false;
    if (!saveBtn) {
      clicked = clickFirstVisible(oneTrustSaveSelectors(window.location.hostname));
    } else {
      try {
        saveBtn.click();
        clicked = true;
      } catch (_) {
        clicked = dispatchSyntheticClick(saveBtn);
      }
    }
    // This page has persistent UI (no dismissable banner), so waitForDismissal would
    // never resolve. Mark handled directly to stop the MutationObserver from cycling.
    if (clicked) {
      _handled = true;
      document.dispatchEvent(new CustomEvent('__emc_handled__', { detail: { method: 'cmp_api:OneTrust:disney_privacy' } }));
    }
    return clicked;
  }

  function setDisneyPrivacyChoice(checked) {
    const toggle = document.getElementById('ot-group-id-SSPD_BG');
    if (!toggle || toggle.disabled || toggle.getAttribute('aria-disabled') === 'true') return false;
    if (Boolean(toggle.checked) === checked) return true;
    const label = findToggleLabel(toggle);
    if (!label) return false;
    try {
      label.click();
      return true;
    } catch (_) {
      return dispatchSyntheticClick(label);
    }
  }

  async function handleZoomOneTrustCustom(prefs) {
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

    const clicked = clickFirstVisible(oneTrustSaveSelectors(window.location.hostname));
    if (clicked) scheduleOneTrustCleanup();
    return clicked;
  }

  function tryOneTrustUSNatDirectReject() {
    const toggle = document.querySelector('.category-switch-handler, input[id^="ot-group-id-"]');
    if (!toggle || !isVisible(toggle)) return false;

    disableVisibleOneTrustToggles();
    return clickUSNatSubmitIfPresent() || clickFirstVisible(oneTrustSaveSelectors());
  }

  // In USNat/CCPA mode, #onetrust-accept-btn-handler is labeled "Submit".
  // Only click it when the text confirms it's "Submit" — GDPR preference centers
  // use "Confirm My Choices" and must not be triggered here.
  function clickUSNatSubmitIfPresent() {
    const btn = document.querySelector('#onetrust-accept-btn-handler');
    if (!btn || !isVisible(btn)) return false;
    const text = btn.textContent?.trim() ?? '';
    if (!/\bsubmit\b/i.test(text)) return false;
    return dispatchSyntheticClick(btn);
  }

  function oneTrustSaveSelectors(host = window.location.hostname) {
    const selectors = [
      '.save-preference-btn-handler',
      '#onetrust-accept-btn-handler',
      'button[aria-label*="Confirm My Choice" i]',
      'button[aria-label*="Confirm My Choices" i]',
      'button[title*="Confirm My Choice" i]',
      'button[title*="Confirm My Choices" i]',
    ];

    // BBC surfaces unrelated visible "Save" buttons in page chrome, so keep
    // OneTrust automation there limited to explicit OneTrust controls.
    if (!EXPLICIT_ONETRUST_CONTROL_HOSTS.has(host)) {
      selectors.push(
        'button[aria-label*="Save" i]',
        'button[title*="Save" i]',
      );
    }

    return selectors;
  }

  function dispatchPreHandleIfOneTrustReloadsOnSave() {
    if (!ONETRUST_RELOAD_ON_SAVE_HOSTS.has(window.location.hostname)) return;
    document.dispatchEvent(new CustomEvent('__emc_pre_handle__', {
      detail: {
        method: 'cmp_api:OneTrust:ccpa',
        preference: document.documentElement.dataset.emcPref ?? 'reject_all',
      },
    }));
  }

  function clickOneTrustContinueToSettings(host = window.location.hostname) {
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

  function closeZoomOneTrustBannerIfVisible() {
    const btn = document.querySelector('.onetrust-close-btn-handler.ot-close-icon.banner-close-button');
    if (!btn || !isVisible(btn)) return false;
    try {
      btn.click();
      return true;
    } catch (_) {
      return dispatchSyntheticClick(btn);
    }
  }

  function closeOneTrustUSNatModal() {
    const removeHiddenToo = ONETRUST_AGGRESSIVE_CLEANUP_HOSTS.has(window.location.hostname);
    // Only remove elements that are currently visible. Hidden elements (e.g. the
    // preference-center SDK container that OneTrust re-uses for "Your Privacy Choices")
    // must be left in the DOM so the CMP can show correct state when the user opens
    // them later. Exception: Thomson Reuters re-surfaces broken hidden OneTrust shells,
    // so its host-scoped cleanup removes those nodes entirely.
    for (const sel of [
      ...ONETRUST_VISIBLE_SELECTORS,
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

  function scheduleOneTrustCleanup() {
    closeOneTrustUSNatModal();
    startOneTrustCleanupWatch();
    try {
      setTimeout(() => closeOneTrustUSNatModal(), 1200);
      setTimeout(() => closeOneTrustUSNatModal(), 3500);
    } catch (_) {}
  }

  let oneTrustCleanupWatchTimer = null;
  let oneTrustCleanupObserver = null;

  function startOneTrustCleanupWatch() {
    if (!ONETRUST_AGGRESSIVE_CLEANUP_HOSTS.has(window.location.hostname)) return;
    closeOneTrustUSNatModal();
    try { oneTrustCleanupObserver?.disconnect(); } catch (_) {}
    try { clearTimeout(oneTrustCleanupWatchTimer); } catch (_) {}
    const root = document.body ?? document.documentElement;
    if (root) {
      oneTrustCleanupObserver = new MutationObserver(() => closeOneTrustUSNatModal());
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

  async function waitForOneTrustTogglesState(checked, timeoutMs) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const toggles = visibleOneTrustToggles();
      if (toggles.length === 0 || toggles.every((t) => Boolean(t.checked) === checked)) return true;
      await delay(50);
    }
    const toggles = visibleOneTrustToggles();
    return toggles.length === 0 || toggles.every((t) => Boolean(t.checked) === checked);
  }

  // Sets toggles to the requested state via native setter + change/input events only —
  // no label click. Called immediately before clicking Submit so the DOM state is read
  // before React's async reconciliation runs. A label click would fire React's onClick
  // synchronously, potentially causing a re-render that reverts the checked state before
  // Submit fires.
  function setOneTrustTogglesNow(checked) {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'checked'
    )?.set;
    for (const toggle of visibleOneTrustToggles()) {
      if (Boolean(toggle.checked) === checked) continue;
      if (nativeSetter) {
        nativeSetter.call(toggle, checked);
      } else {
        toggle.checked = checked;
      }
      toggle.dispatchEvent(new Event('change', { bubbles: true }));
      toggle.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function disableVisibleOneTrustToggles() {
    for (const toggle of visibleOneTrustToggles()) {
      if (!toggle.checked) continue;
      forceOneTrustToggleState(toggle, false);
    }
  }

  // Mirror of disableVisibleOneTrustToggles — turns unchecked (OFF) toggles ON.
  // Used when ccpaDoNotSell=false (user allows data selling) in USNat/CCPA mode.
  function enableVisibleOneTrustToggles() {
    for (const toggle of visibleOneTrustToggles()) {
      if (toggle.checked) continue; // already ON — skip
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

  // Sets a checkbox toggle to the desired state in a way that works with React
  // controlled inputs. React overrides the native 'checked' property setter to
  // track changes; simply setting el.checked = x doesn't fire React's onChange.
  // We bypass React's override by calling the native prototype setter directly,
  // then dispatch 'change' and 'input' events so React's reconciler picks it up.
  // A synthetic click on the label is also fired as a belt-and-suspenders fallback.
  function forceOneTrustToggleState(toggle, checked) {
    // Native setter — bypasses React's property descriptor override
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'checked'
    )?.set;
    if (nativeSetter) {
      nativeSetter.call(toggle, checked);
    } else {
      toggle.checked = checked;
    }
    // React's synthetic event system listens for native change/input events
    toggle.dispatchEvent(new Event('change', { bubbles: true }));
    toggle.dispatchEvent(new Event('input', { bubbles: true }));
    // Belt-and-suspenders: also click the label (works for non-React OneTrust builds)
    const label = findToggleLabel(toggle);
    if (label) dispatchSyntheticClick(label);
  }

  function findToggleLabel(toggle) {
    if (!toggle?.id || typeof CSS?.escape !== 'function') return null;
    return document.querySelector(`label[for="${CSS.escape(toggle.id)}"]`);
  }

  async function waitForNikeCheckbox(timeoutMs) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const el = document.getElementById('a11y-do-not-share');
      if (el) return el;
      await delay(150);
    }
    return null;
  }

  // Checks Nike's "Do Not Share My Information" checkbox (opt-out direction only).
  // checkbox.click() is the most reliable trigger for Nike's React onChange, which
  // sets the ni_c cookie client-side. The label click is also fired as a fallback.
  function setNikeCheckbox(checkbox) {
    try { checkbox.click(); } catch (_) {}
    const label = document.querySelector(`label[for="${CSS.escape(checkbox.id)}"]`);
    if (label && !checkbox.checked) dispatchSyntheticClick(label);
  }

  function clickFirstVisible(selectors) {
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (!isVisible(el)) continue;
      return activateVisibleElement(el);
    }
    return false;
  }

  function activateVisibleElement(el) {
    if (!el) return false;
    try {
      el.focus?.({ preventScroll: true });
      el.click?.();
      return true;
    } catch (_) {}
    return dispatchSyntheticClick(el);
  }

  function hasVisibleOneTrustPrivacyChoicesEntry(host = window.location.hostname) {
    if (!ONETRUST_PRIVACY_CHOICES_CCPA_HOSTS.has(host)) return false;
    return hasVisibleSelector([
      '#onetrust-pc-btn-handler',
      '.ot-sdk-show-settings',
    ]);
  }

  async function waitForAnyVisible(selectors, timeoutMs = 3000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (hasVisibleSelector(selectors)) return true;
      await delay(200);
    }
    return false;
  }

  function isVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
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
    if (typeof el.click === 'function') el.click();
    return true;
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
})();
