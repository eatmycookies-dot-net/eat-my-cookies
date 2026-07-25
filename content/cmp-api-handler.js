// Tier 2 — CMP-specific JavaScript API calls.
// Runs in MAIN world so it can access page-defined globals (window.OneTrust, etc.).
// Waits for CMPs to initialize via MutationObserver, then fires the appropriate method.

(function () {
  const GUARDIAN_HOSTS = new Set(['www.theguardian.com', 'support.theguardian.com']);
  const GUARDIAN_REJECT_API_HOSTS = new Set(['www.theguardian.com', 'support.theguardian.com']);
  const EXPLICIT_ONETRUST_CONTROL_HOSTS = new Set(['www.bbc.com']);
  const ONETRUST_CCPA_TEXT_RE = /\b(do not sell|do not share|sale of personal data|share of personal data)\b/i;
  const ONETRUST_CCPA_GROUP_ID_RE = /^[A-Z]+_BG$/;
  // CNBC exposes a visible top-level OneTrust banner that reloads on save.
  // NBC News does not consistently expose the same surface, and forcing this
  // path there can route users away from the homepage on reject.
  const ONETRUST_RELOAD_ON_SAVE_HOSTS = new Set([
    'www.cnbc.com',
    'www.thomsonreuters.com',
    'thomsonreuters.com',
  ]);
  const ONETRUST_FORCE_CLEANUP_HOSTS = new Set([]);
  // Use OneTrust.Close() / close-button dismissal instead of DOM removal so that the
  // reusable preference-center structure (#onetrust-pc-sdk) stays in the DOM for footer
  // link reopens. Do NOT add zoom.com: zoom.com's OneTrust build (202409.2.0) removes
  // .onetrust-pc-dark-filter from the DOM when OneTrust.Close() is called, which still
  // breaks footer-link reopens. Use ONETRUST_VISUAL_HIDE_CLOSE_HOSTS for zoom.com instead.
  const ONETRUST_PRESERVE_DOM_CLOSE_HOSTS = new Set(['www.canadiantire.ca']);
  // Let OneTrust complete its own close/save lifecycle. Its footer controls remain the
  // source of truth for reopening privacy settings after the initial consent flow.
  const ONETRUST_VISUAL_HIDE_CLOSE_HOSTS = new Set([]);
  const ONETRUST_SKIP_CONFIRM_HOSTS = new Set(['www.zoom.com', 'www.fifa.com', 'fifa.com']);
  // Most OneTrust builds need the DOM toggles mirrored after UpdateConsent so visible
  // "Confirm My Choices" / Save actions do not read stale checkbox state. Zoom is the
  // known exception: touching the toggles at all corrupts OneTrust's internal reopen state.
  const ONETRUST_SKIP_API_DOM_SYNC_HOSTS = new Set([
    'www.zoom.com',
  ]);
  // Reuters-class hosts hang when we fire OneTrust's full toggle event path, but leaving
  // the DOM stale makes the visible preference center misreport the saved state. Mirror
  // the checkbox state with the native setter only so the UI reflects the API-written
  // consent without retriggering heavy OneTrust processing.
  const ONETRUST_VISUAL_API_DOM_SYNC_HOSTS = new Set([
    'www.fifa.com',
    'fifa.com',
    'www.reuters.com',
    'reuters.com',
    'www.thomsonreuters.com',
    'thomsonreuters.com',
  ]);
  const ONETRUST_PRIVACY_CENTER_REJECT_HOSTS = new Set(['www.thomsonreuters.com', 'thomsonreuters.com']);
  const ONETRUST_PRIVACY_CENTER_ACCEPT_HOSTS = new Set(['www.thomsonreuters.com', 'thomsonreuters.com', 'www.schwab.com', 'schwab.com']);
  const ONETRUST_AGGRESSIVE_CLEANUP_HOSTS = new Set([]);
  const ONETRUST_SURFACE_ONLY_CLEANUP_HOSTS = new Set(['www.zoom.com']);
  const ONETRUST_CLEANUP_WATCH_MS = 15000;
  const DISNEY_FAMILY_USNAT_HOSTS = new Set(['www.disney.com', 'www.espn.com', 'www.hulu.com']);
  const DISNEY_PRIVACY_HOSTS = new Set(['privacy.thewaltdisneycompany.com']);
  const ZOOM_ONETRUST_HOSTS = new Set(['www.zoom.com']);
  const NIKE_CCPA_HOSTS = new Set(['www.nike.com']);
  let _zoomOneTrustPrivacyChoicesBridgeInstalled = false;
  const ONETRUST_VISIBLE_SELECTORS = [
    '#onetrust-banner-sdk',
    '#onetrust-consent-sdk',
    '#onetrust-pc-sdk',
    '.onetrust-pc-dark-filter',
  ];
  const ONETRUST_ACTIONABLE_SURFACE_SELECTORS = [
    ...ONETRUST_VISIBLE_SELECTORS,
    // onetrust-pc-btn-handler intentionally excluded — see dom-handler.js comment.
    '#onetrust-accept-btn-handler',
    '#onetrust-reject-all-handler',
    '.ot-pc-refuse-all-handler',
    '.save-preference-btn-handler',
    '.category-switch-handler',
    "input[id^='ot-group-id-']",
  ];
  const ONETRUST_OPEN_CONTROL_SELECTORS = [
    '#onetrust-pc-btn-handler',
    '#ot-do-not-sell',
    '#ot-sdk-btn',
    'button[data-type="cmpFooterLink"]',
    'a[onclick*="ToggleInfoDisplay"]',
    'button[onclick*="ToggleInfoDisplay"]',
    '.df-privacy-compliance',
    '.ot-sdk-show-settings',
  ];
  const ONETRUST_CCPA_STRUCTURAL_SELECTORS = [
    '#ot-do-not-sell',
    '[data-optanongroupid$="_BG"]',
    "input[id^='ot-group-id-'][id$='_BG']",
  ];
  const ONETRUST_PREFERENCE_CENTER_SELECTORS = [
    '#onetrust-consent-sdk',
    '#onetrust-pc-sdk',
    '.save-preference-btn-handler',
    '.category-switch-handler',
    "input[id^='ot-group-id-']",
  ];
  const ONETRUST_SAVE_TEXT_RE = /\b(confirm|save|submit|proceed)\b/i;
  const ONETRUST_NON_SAVE_TEXT_RE = /\b(accept|agree|allow all|i['’]?m ok with that|continue)\b/i;
  const OSANO_VISIBLE_SELECTORS = [
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
  const OSANO_ROOT_SELECTORS = [
    '.osano-cm-dialog',
    '.osano-cm-window',
    '.osano-cm-widget',
    '.osano-cm-info-dialog',
    '.osano-cm-info-views',
    '.osano-cm-view',
  ];
  const OSANO_SAVE_SELECTORS = [
    'button.osano-cm-save',
    '.osano-cm-save',
  ];
  const OSANO_PREF_SELECTORS = [
    ...OSANO_SAVE_SELECTORS,
    '[class*="osano-cm-toggle"]',
    '[class*="osano-cm-switch"]',
    'input[aria-labelledby*="osano-cm" i]',
    '[role="switch"][aria-labelledby*="osano-cm" i]',
  ];
  const TRUENDO_VISIBLE_SELECTORS = [
    '#truendo_container',
    '[data-cy="accept-only-banner"]',
    '[data-cy="tru-panel"]',
    '[data-cy="action-button-all"]',
    '[data-cy="action-button-necessary"]',
    '.tru_cookie-dialog_ok',
    '.tru_overlay',
  ];
  let _guardianRetryTimer = null;

  // This is independent of a consent action. After a reload, main.js correctly
  // skips an already-handled page, but Zoom's broken native footer control still
  // needs its structural bridge for the lifetime of the document.
  if (ZOOM_ONETRUST_HOSTS.has(window.location.hostname)) {
    installZoomOneTrustPrivacyChoicesBridge();
  }

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

      // Custom mode should use the real OneTrust preference-center flow on any site that
      // exposes category controls. Host-specific sets only tune post-save behavior
      // (preserve DOM, skip confirm, DOM sync) and should not decide whether custom is
      // supported at all.
      if (prefs.globalPreference === 'custom') {
        if (ZOOM_ONETRUST_HOSTS.has(window.location.hostname)) {
          return handleZoomOneTrustCustomNative(prefs);
        }
        return handleOneTrustCustom(prefs);
      }

      if (shouldUseOneTrustPrivacyCenterOptOut(prefs)) {
        return handleOneTrustPrivacyCenterReject('cmp_api:OneTrust:ccpa', prefs);
      }

      if (prefs.globalPreference === 'accept_all' && shouldUseOneTrustPrivacyCenterAccept(prefs, window.location.hostname)) {
        return handleOneTrustPrivacyCenterAccept('cmp_api:OneTrust', prefs);
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
          await settleOneTrustAfterAction(window.location.hostname);
          return true;
        }
        if (typeof w.OneTrust?.Accept === 'function') {
          w.OneTrust.Accept();
          await settleOneTrustAfterAction(window.location.hostname);
          return true;
        }
        return clickFirstVisible([
          '#accept-recommended-btn-handler',
          '#onetrust-accept-btn-handler',
          'button[aria-label*="Accept" i]',
          'button[title*="Accept" i]',
        ]);
      }

      const rejectResult = await handleOneTrustPrivacyCenterReject('cmp_api:OneTrust', prefs);
      if (rejectResult) return rejectResult;

      // Last-resort fallback: if a visible OneTrust shell remains but the standard reject
      // controls were not actionable, sync the SDK state directly and let the shared
      // dismissal watcher decide whether the surface actually disappeared.
      if (prefs.globalPreference === 'reject_all' &&
          typeof w.OneTrust?.RejectAll === 'function' &&
          hasVisibleSelector(ONETRUST_ACTIONABLE_SURFACE_SELECTORS)) {
        w.OneTrust.RejectAll();
        await delay(300);
        await settleOneTrustAfterAction(window.location.hostname);
        return true;
      }

      return false;
    },
    Cookiebot: async (w, prefs) => {
      if (!w.Cookiebot) return false;
      const desiredState = buildCookiebotDesiredState(prefs);
      if (prefs.globalPreference === 'reject_all') {
        if (typeof w.Cookiebot.withdraw === 'function') {
          w.Cookiebot.withdraw();
        } else if (typeof w.Cookiebot.submitCustomConsent === 'function') {
          w.Cookiebot.submitCustomConsent(false, false, false);
        } else {
          return false;
        }
      } else {
        if (typeof w.Cookiebot.submitCustomConsent !== 'function') return false;
        w.Cookiebot.submitCustomConsent(
          desiredState.preferences,
          desiredState.statistics,
          desiredState.marketing,
        );
      }
      const verified = await waitForCookiebotConsentState(desiredState, 2500);
      if (!verified) return false;
      w.Cookiebot.hide?.();
      return prefs.globalPreference === 'custom' ? 'cmp_api:Cookiebot:custom' : 'cmp_api:Cookiebot';
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
    CookieScript: (w, prefs) => {
      const instance = w.CookieScript?.instance;

      if (prefs.globalPreference === 'accept_all') {
        if (!instance) return false;
        if (typeof instance.acceptAllAction !== 'function') return false;
        instance.acceptAllAction();
        return true;
      }

      if (prefs.globalPreference === 'custom') {
        return handleCookieScriptCustom(prefs);
      }

      if (!instance) return false;
      if (typeof instance.rejectAllAction !== 'function') return false;
      instance.rejectAllAction();
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
          '#privacy-banner-accept-button',
        ]))
        : prefs.globalPreference === 'reject_all'
          ? activateVisibleElement(firstVisibleElement([
            '#shopify-pc__banner__btn-decline',
            'button.shopify-pc__banner__btn-decline',
            '#privacy-banner-decline-button',
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
    Osano: async (w, prefs) => {
      const cm = w.Osano?.cm;
      if (!cm) return false;
      if (!hasVisibleSelector(OSANO_VISIBLE_SELECTORS)) return false;

      const desiredConsent = {
        marketing: Boolean(prefs.advertising) && prefs.ccpaDoNotSell === false,
        personalization: Boolean(prefs.functional) || prefs.uncategorized === 'accept',
        analytics: Boolean(prefs.analytics),
        optOut: prefs.ccpaDoNotSell !== false,
      };

      if (!await openOsanoDrawer(cm)) return false;
      if (!(await waitForAnyVisible(OSANO_PREF_SELECTORS, 4000))) return false;
      if (!(await waitForOsanoControls(4000))) return false;

      const applyResults = [
        await setOsanoConsentControl(['MARKETING'], [/\btarget(?:ed|ing)? advertising\b/i, /\badvertising\b/i, /\bmarketing\b/i], desiredConsent.marketing),
        await setOsanoConsentControl(['PERSONALIZATION'], [/\bpersonali[sz]ation\b/i, /\bpreferences?\b/i, /\bfunctional\b/i], desiredConsent.personalization),
        await setOsanoConsentControl(['ANALYTICS'], [/\banalytics?\b/i, /\bmeasurement\b/i, /\bperformance\b/i], desiredConsent.analytics),
      ];

      let optOutResult = await setOsanoConsentControl(['OPT_OUT', 'CCPA'], [/\bdo not sell\b/i, /\bdo not sell or share\b/i, /\bccpa\b/i, /\bopt[\s-]?out\b/i], desiredConsent.optOut);
      if (optOutResult === null) {
        optOutResult = await openAndApplyOsanoDoNotSell(cm, desiredConsent.optOut);
      }
      applyResults.push(optOutResult);

      const appliedCount = applyResults.filter((value) => value !== null).length;
      if (appliedCount === 0 || applyResults.includes(false)) return false;

      if (!clickFirstVisible(OSANO_SAVE_SELECTORS)) return false;

      const verified = await waitForOsanoConsentState(cm, desiredConsent, 4000);
      if (!verified) return false;

      _handled = true;
      document.dispatchEvent(new CustomEvent('__emc_handled__', {
        detail: {
          method: prefs.globalPreference === 'custom'
            ? 'cmp_api:Osano:custom'
            : prefs.globalPreference === 'accept_all'
              ? 'cmp_api:Osano:accept_all'
              : 'cmp_api:Osano:reject_all',
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
    Truendo: async (w, prefs) => {
      if (!w.Truendo || typeof w.Truendo !== 'object') return false;
      if (!hasVisibleSelector(TRUENDO_VISIBLE_SELECTORS) && !document.cookie.includes('truendo_cmp=')) return false;
      if (prefs.globalPreference === 'custom' &&
          (prefs.functional === undefined || prefs.analytics === undefined || prefs.advertising === undefined)) {
        return false;
      }

      const desiredState = buildTruendoDesiredState(prefs);

      if (prefs.globalPreference === 'custom') {
        const currentState = readTruendoConsentState(w);
        applyTruendoApiToggle(w, currentState, desiredState, 'preferences', 'togglePreferences');
        applyTruendoApiToggle(w, currentState, desiredState, 'marketing', 'toggleMarketing');
        applyTruendoApiToggle(w, currentState, desiredState, 'statistics', 'toggleStatistics');
        applyTruendoApiToggle(w, currentState, desiredState, 'social_content', 'toggleContent');
        applyTruendoApiToggle(w, currentState, desiredState, 'social_sharing', 'toggleSharing');
        applyTruendoApiToggle(w, currentState, desiredState, 'add_features', 'addFeatures');
      } else if (prefs.globalPreference !== 'accept_all' && prefs.globalPreference !== 'reject_all') {
        return false;
      }

      // For accept_all / reject_all: call the Truendo SDK so it updates its internal
      // consent state for ALL categories. Without this the SDK's state doesn't change
      // and waitForTruendoConsentState times out. These calls do NOT freeze the page —
      // the freeze came solely from suppressTruendoSurface() manipulating DOM elements
      // that triggered Truendo's MutationObserver. SDK API calls are safe.
      if (prefs.globalPreference === 'accept_all') {
        try { if (typeof w.Truendo.acceptAllCookies === 'function') w.Truendo.acceptAllCookies(); } catch (_) {}
      } else if (prefs.globalPreference === 'reject_all') {
        try { if (typeof w.Truendo.acceptNecessaryCookiesOnly === 'function') w.Truendo.acceptNecessaryCookiesOnly(); } catch (_) {}
      }

      // Also write the cookie directly for belt-and-suspenders persistence.
      syncTruendoConsentCookie(desiredState);

      const verified = await waitForTruendoConsentState(w, desiredState, 4000);
      if (!verified) return false;

      // Do NOT call suppressTruendoSurface() — hiding the banner elements fires Truendo's
      // own MutationObserver, which can run heavy synchronous SDK code and freeze the page.
      // Instead reload: on the reloaded page Truendo reads the cookie, sees consent is set,
      // and never shows the banner.
      _handled = true;
      document.dispatchEvent(new CustomEvent('__emc_handled__', {
        detail: {
          method: prefs.globalPreference === 'custom'
            ? 'cmp_api:Truendo:custom'
            : prefs.globalPreference === 'accept_all'
              ? 'cmp_api:Truendo:accept_all'
              : 'cmp_api:Truendo:reject_all',
        },
      }));
      setTimeout(() => { try { location.reload(); } catch (_) {} }, 0);
      return true;
    },
  };

  const CMP_SELECTORS = {
    OneTrust: [...ONETRUST_VISIBLE_SELECTORS],
    Cookiebot: ['#CybotCookiebotDialog', '#cookiebanner'],
    UC_UI: ['#usercentrics-root', "[data-testid='uc-banner']"],
    Didomi: ['#didomi-popup', '#didomi-notice'],
    truste: ['#truste-consent-track', '.truste_overlay'],
    _axcb: ['#axeptio_overlay', '.axeptio_widget'],
    _iub: ['#iubenda-cs-banner', '.iubenda-cs-content', '.iubenda-cs-reject-btn', '.iubenda-cs-accept-btn'],
    CookieScript: [
      '#cookiescript_injected',
      '#cookiescript_injected_wrapper',
      '#cookiescript_checkboxes',
      '#cookiescript_accept',
      '#cookiescript_reject',
      '#cookiescript_save',
    ],
    Osano: OSANO_VISIBLE_SELECTORS,
    privacyBanner: [
      '#shopify-pc__banner',
      '.shopify-pc__banner__dialog',
      '#shopify-pc__prefs',
      '#shopify-pc__prefs__dialog',
      '.shopify-pc__prefs__dialog',
      '#privacy-cookie-banner',
      '#privacy-preferences-modal',
      '#shopify-pc__prefs__header-save',
      '#shopify-pc__banner__btn-manage-prefs',
      '#privacy-preferences-save-button',
      '#privacy-banner-manage-preferences-button',
    ],
    Nike: [],
    Truendo: TRUENDO_VISIBLE_SELECTORS,
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
    if (!hasCompleteCustomPrefs(_prefs)) return;

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
    if (!hasCompleteCustomPrefs(_prefs)) return;
    if (_prefs.globalPreference === 'custom') return;
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

  window.addEventListener('CookieScriptLoaded', () => {
    if (_handled) return;
    bootstrapPrefsFromDataset();
    if (!_prefs?.globalPreference) return;
    tryHandlers();
  });

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
      '#privacy-preferences-modal',
      '#shopify-pc__prefs__header-save',
      '#privacy-preferences-save-button',
      '#shopify-pc__prefs__preferences-input',
      '#shopify-pc__prefs__marketing-input',
      '#shopify-pc__prefs__analytics-input',
    ];
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
        candidates.push({ root, score: toggleCount * 10 + saveCount * 3 });
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0]?.root ?? null;
  }

  async function openOsanoDrawer(cm) {
    if (hasVisibleSelector(OSANO_PREF_SELECTORS)) return true;
    for (const method of ['showDrawer', 'showDialog', 'showWidget']) {
      if (typeof cm?.[method] !== 'function') continue;
      try {
        cm[method]();
      } catch (_) {
        continue;
      }
      if (await waitForAnyVisible(OSANO_PREF_SELECTORS, 1500)) return true;
    }
    return clickFirstVisible([
      '.osano-cm-link--type_manage',
      'a.osano-cm-link--type_manage',
      'button.osano-cm-link--type_manage',
      'button[aria-label*="Cookie Preferences" i]',
      'button[title*="Cookie Preferences" i]',
    ]) && (await waitForAnyVisible(OSANO_PREF_SELECTORS, 1500));
  }

  async function openAndApplyOsanoDoNotSell(cm, checked) {
    for (const method of ['showDoNotSell', 'showOptOutWidget']) {
      if (typeof cm?.[method] !== 'function') continue;
      try {
        cm[method]();
      } catch (_) {
        continue;
      }
      if (!(await waitForAnyVisible(OSANO_PREF_SELECTORS, 1500))) continue;
      const result = await setOsanoConsentControl(['OPT_OUT', 'CCPA'], [/\bdo not sell\b/i, /\bdo not sell or share\b/i, /\bccpa\b/i, /\bopt[\s-]?out\b/i], checked);
      if (result === false || result === null) continue;
      if (!clickFirstVisible(OSANO_SAVE_SELECTORS)) return false;
      return waitForOsanoConsentState(cm, {
        marketing: cm.marketing ?? false,
        personalization: cm.personalization ?? false,
        analytics: cm.analytics ?? false,
        optOut: checked,
      }, 3000);
    }
    return null;
  }

  async function waitForOsanoControls(timeoutMs = 4000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const root = activeOsanoRoot();
      const visibleControls = Array.from(
        (root ?? document).querySelectorAll('input[type="checkbox"], [role="switch"], button[aria-checked], [aria-checked][tabindex]')
      ).filter((control) => isVisible(control) || hasVisibleOsanoLabel(control));
      if (visibleControls.length >= 2) return true;
      await delay(50);
    }
    return false;
  }

  function hasVisibleOsanoLabel(control) {
    for (const label of Array.from(control?.labels ?? [])) {
      if (isVisible(label)) return true;
    }
    const closestLabel = control?.closest?.('label');
    return Boolean(closestLabel && isVisible(closestLabel));
  }

  async function setOsanoConsentControl(categoryKeys, labelPatterns, checked) {
    const control = findOsanoConsentControl(categoryKeys, labelPatterns);
    if (!control) return null;
    const current = readOsanoConsentControl(control);
    if (current === null) return false;
    if (current === checked) return true;

    const target = findOsanoInteractionTarget(control);
    if (target && activateVisibleElement(target) && (await waitForOsanoControlState(control, checked, 700))) {
      return true;
    }

    if (!forceOsanoConsentControl(control, checked)) return false;
    return waitForOsanoControlState(control, checked, 700);
  }

  function findOsanoConsentControl(categoryKeys, labelPatterns) {
    const root = activeOsanoRoot() ?? document;
    const controls = root.querySelectorAll('input[type="checkbox"], [role="switch"], button[aria-checked], [aria-checked][tabindex]');
    for (const control of controls) {
      if (!isVisible(control) && !hasVisibleOsanoLabel(control)) continue;
      const identity = [
        control.id ?? '',
        control.getAttribute?.('name') ?? '',
        control.getAttribute?.('data-category') ?? '',
        control.getAttribute?.('aria-describedby') ?? '',
        control.getAttribute?.('aria-labelledby') ?? '',
      ].join(' ').toUpperCase();
      const label = [
        control.getAttribute?.('aria-label') ?? '',
        ...(control.labels ? Array.from(control.labels).map((label) => label.textContent ?? '') : []),
        control.closest?.('label')?.textContent ?? '',
        control.parentElement?.textContent ?? '',
      ].join(' ').replace(/\s+/g, ' ').trim();
      if (categoryKeys.some((key) => identity.includes(key))) return control;
      if (labelPatterns.some((pattern) => pattern.test(label))) return control;
    }
    return null;
  }

  function readOsanoConsentControl(control) {
    if (control instanceof HTMLInputElement) return Boolean(control.checked);
    if (control.getAttribute?.('aria-checked') != null) return control.getAttribute('aria-checked') === 'true';
    return null;
  }

  function findOsanoInteractionTarget(control) {
    const explicitLabel = control.labels?.[0];
    if (explicitLabel && isVisible(explicitLabel)) return explicitLabel;
    const closestLabel = control.closest?.('label');
    if (closestLabel && isVisible(closestLabel)) return closestLabel;
    if (isVisible(control)) return control;
    return explicitLabel || closestLabel || control;
  }

  async function waitForOsanoControlState(control, checked, timeoutMs = 700) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (readOsanoConsentControl(control) === checked) return true;
      await delay(50);
    }
    return readOsanoConsentControl(control) === checked;
  }

  function forceOsanoConsentControl(control, checked) {
    if (control instanceof HTMLInputElement) {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'checked')?.set;
      if (nativeSetter) nativeSetter.call(control, checked);
      else control.checked = checked;
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

  async function waitForOsanoConsentState(cm, desiredConsent, timeoutMs = 4000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const consent = typeof cm.getConsent === 'function' ? cm.getConsent() : {};
      const current = {
        marketing: normalizeOsanoConsentValue(cm.marketing ?? consent.MARKETING),
        personalization: normalizeOsanoConsentValue(cm.personalization ?? consent.PERSONALIZATION),
        analytics: normalizeOsanoConsentValue(cm.analytics ?? consent.ANALYTICS),
        optOut: normalizeOsanoConsentValue(cm.optOut ?? consent.OPT_OUT),
      };
      if (
        current.marketing === desiredConsent.marketing &&
        current.personalization === desiredConsent.personalization &&
        current.analytics === desiredConsent.analytics &&
        current.optOut === desiredConsent.optOut
      ) {
        return true;
      }
      await delay(100);
    }
    return false;
  }

  function normalizeOsanoConsentValue(value) {
    if (value === true || value === 'ACCEPT') return true;
    if (value === false || value === 'DENY') return false;
    return null;
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

  async function handleCookieScriptCustom(prefs) {
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

    const saveClicked = clickFirstVisible(cookieScriptSaveSelectors()) ||
      clickCookieScriptButtonByText(/(?:save|guardar|enregistrer|speichern|salva).*(?:close|fechar|fermer|schlie(?:ss|ß)en|chiudi)?/i);
    return saveClicked ? 'cmp_api:CookieScript:custom' : false;
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

  function cookieScriptSaveSelectors() {
    return [
      '#cookiescript_save',
      'button#cookiescript_save',
      '[role="button"]#cookiescript_save',
    ];
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

  function cleanupShopifyPrivacyArtifacts() {
    for (const selector of [
      '#shopify-pc__banner',
      '#shopify-pc__prefs',
      '#shopify-pc__prefs__dialog',
      '#shopify-pc__prefs__overlay',
      '#privacy-cookie-banner',
      '#privacy-preferences-modal',
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
      '#privacy-preferences-close-button',
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
    if (name === 'Truendo') {
      return Boolean(window.Truendo) && document.cookie.includes('truendo_cmp=');
    }
    return name === 'OneTrust' &&
      DISNEY_FAMILY_USNAT_HOSTS.has(window.location.hostname) &&
      document.getElementById('ot-group-id-BG559') != null;
  }

  function buildCookiebotDesiredState(prefs) {
    if (prefs.globalPreference === 'accept_all') {
      return {
        preferences: true,
        statistics: true,
        marketing: true,
      };
    }

    if (prefs.globalPreference === 'reject_all') {
      return {
        preferences: false,
        statistics: false,
        marketing: false,
      };
    }

    return {
      preferences: Boolean(prefs.functional) || prefs.uncategorized === 'accept',
      statistics: Boolean(prefs.analytics),
      marketing: Boolean(prefs.advertising) && prefs.ccpaDoNotSell === false,
    };
  }

  function readCookiebotConsentState() {
    try {
      const raw = document.cookie.split('; ').find((entry) => entry.startsWith('CookieConsent='));
      if (!raw) return null;
      const decoded = decodeURIComponent(raw.slice('CookieConsent='.length));
      const readBool = (key) => {
        const match = decoded.match(new RegExp(`${key}:(true|false)`));
        if (!match) return null;
        return match[1] === 'true';
      };
      return {
        preferences: readBool('preferences'),
        statistics: readBool('statistics'),
        marketing: readBool('marketing'),
      };
    } catch (_) {
      return null;
    }
  }

  async function waitForCookiebotConsentState(desiredState, timeoutMs = 2500) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const current = readCookiebotConsentState();
      if (current &&
          current.preferences === desiredState.preferences &&
          current.statistics === desiredState.statistics &&
          current.marketing === desiredState.marketing) {
        return true;
      }
      await delay(100);
    }
    return false;
  }

  function buildTruendoDesiredState(prefs) {
    const desiredFunctional = Boolean(prefs?.functional) || prefs?.uncategorized === 'accept';
    return {
      ack: true,
      preferences: desiredFunctional,
      marketing: Boolean(prefs?.advertising),
      necessary: true,
      statistics: Boolean(prefs?.analytics),
      social_content: desiredFunctional,
      social_sharing: desiredFunctional,
      add_features: prefs?.uncategorized === 'accept',
      consent_sent: 'true',
    };
  }

  function readTruendoConsentState(w = window) {
    try {
      const raw = document.cookie.split('; ').find((entry) => entry.startsWith('truendo_cmp='));
      if (raw) {
        const parsed = JSON.parse(decodeURIComponent(raw.slice('truendo_cmp='.length)));
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch (_) {}

    try {
      if (typeof w.Truendo?.getFullConsentDecoded === 'function') {
        const consent = w.Truendo.getFullConsentDecoded();
        if (consent && typeof consent === 'object') return consent;
      }
      if (typeof w.Truendo?.getFullConsent === 'function') {
        const consent = w.Truendo.getFullConsent();
        if (consent && typeof consent === 'object') return consent;
      }
    } catch (_) {}

    return null;
  }

  function applyTruendoApiToggle(w, currentState, desiredState, key, methodName) {
    if (!w.Truendo || typeof w.Truendo[methodName] !== 'function') return false;
    if (typeof currentState?.[key] === 'boolean' && currentState[key] === desiredState[key]) return true;
    try {
      w.Truendo[methodName]();
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

  async function waitForTruendoConsentState(w, desiredState, timeoutMs = 4000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const currentState = readTruendoConsentState(w);
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

  function suppressTruendoSurface(durationMs = 15000) {
    const selectors = [
      '#truendo_container',
      '.tru_overlay',
      '[data-cy="accept-only-banner"]',
      '[data-cy="tru-panel"]',
      '[data-cy="action-button-all"]',
      '[data-cy="action-button-necessary"]',
      '.tru_cookie-dialog_ok',
    ];

    const hide = () => {
      for (const selector of selectors) {
        for (const el of document.querySelectorAll(selector)) {
          if (!(el instanceof HTMLElement)) continue;
          el.style.setProperty('display', 'none', 'important');
          el.style.setProperty('visibility', 'hidden', 'important');
          el.setAttribute('aria-hidden', 'true');
        }
      }
      try {
        document.body?.style?.setProperty('overflow', '', 'important');
        document.documentElement?.style?.setProperty('overflow', '', 'important');
      } catch (_) {}
    };

    hide();
    const observer = new MutationObserver(() => hide());
    try {
      observer.observe(document.documentElement ?? document, {
        childList: true,
        subtree: true,
        attributes: true,
      });
      setTimeout(() => observer.disconnect(), durationMs);
    } catch (_) {}
  }

  function shouldUseOneTrustPrivacyCenterOptOut(prefs) {
    return prefs?.globalPreference !== 'custom' &&
      prefs.ccpaDoNotSell !== false &&
      (isOneTrustPrivacyChoicesCcpaFlow() || hasAnyOneTrustPrivacyChoicesEntry());
  }

  function shouldUseOneTrustPrivacyCenterAccept(prefs, host = window.location.hostname) {
    if (ONETRUST_PRIVACY_CENTER_ACCEPT_HOSTS.has(host)) return true;
    if (prefs?.ccpaDoNotSell === false) return false;
    return hasAnyOneTrustPrivacyChoicesEntry();
  }

  function shouldForceOneTrustCleanup(host = window.location.hostname) {
    return ONETRUST_FORCE_CLEANUP_HOSTS.has(host);
  }

  function shouldCloseOneTrustPreservingDom(host = window.location.hostname) {
    return ONETRUST_PRESERVE_DOM_CLOSE_HOSTS.has(host);
  }

  function setPrefs(detail) {
    if (!detail?.globalPreference) return;
    _prefs = detail;
  }

  function bootstrapPrefsFromDataset() {
    if (_prefs?.globalPreference) return;
    const pref = document.documentElement.dataset.emcPref;
    if (!pref) return;
    if (pref === 'custom') return;
    _prefs = { globalPreference: pref };
  }

  function hasCompleteCustomPrefs(prefs) {
    if (prefs?.globalPreference !== 'custom') return true;
    return typeof prefs.functional === 'boolean' &&
      typeof prefs.analytics === 'boolean' &&
      typeof prefs.advertising === 'boolean' &&
      typeof prefs.ccpaDoNotSell === 'boolean' &&
      (prefs.uncategorized === 'accept' || prefs.uncategorized === 'reject');
  }

  async function handleOneTrustPrivacyCenterReject(method = 'cmp_api:OneTrust', prefs = _prefs) {
    const host = window.location.hostname;
    const settingsVisible = hasVisibleSelector(ONETRUST_PREFERENCE_CENTER_SELECTORS);
    const actionableSurfaceVisible = hasVisibleSelector(ONETRUST_ACTIONABLE_SURFACE_SELECTORS);
    const privacyChoicesEntryVisible = hasVisibleOneTrustPrivacyChoicesEntry();
    const privacyChoicesEntryPresent = hasAnyOneTrustPrivacyChoicesEntry();
    const forcePrivacyCenterReject = shouldUseOneTrustPrivacyCenterReject(host);
    const preferPreferenceCenterPersistence = settingsVisible ||
      privacyChoicesEntryPresent ||
      oneTrustCategoryEntries().length > 0;

    if (!settingsVisible && !actionableSurfaceVisible && !privacyChoicesEntryPresent) {
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
    if (!forcePrivacyCenterReject &&
        !preferPreferenceCenterPersistence &&
        clickFirstVisible(rejectSelectors)) {
      await settleOneTrustAfterAction(host);
      return finalizeOneTrustHandled(method, 5000, host);
    }

    const { opened, scrollPosition } = openOneTrustPreferenceCenter(host, { settingsVisible, allowContinue: true });

    if (!opened) {
      // USNat/CCPA direct opt-out modal: no privacy center opener exists.
      // Toggles appear directly on the notice (e.g. Disney's "Notice of Right to Opt Out").
      return tryOneTrustUSNatDirectReject();
    }

    if (!(await ensureOneTrustPreferenceCenterVisible(ONETRUST_PREFERENCE_CENTER_SELECTORS, 4000))) {
      return false;
    }

    if (!forcePrivacyCenterReject &&
        !preferPreferenceCenterPersistence &&
        clickFirstVisible(rejectSelectors)) {
      await settleOneTrustAfterAction(host);
      restoreScrollPosition(scrollPosition);
      return finalizeOneTrustHandled(method, 5000, host);
    }

    return commitOneTrustPreferenceProfile(prefs, method, host, scrollPosition);
  }

  async function handleOneTrustPrivacyCenterAccept(method = 'cmp_api:OneTrust', prefs = _prefs) {
    const settingsVisible = hasVisibleSelector(ONETRUST_PREFERENCE_CENTER_SELECTORS);

    const { opened, scrollPosition } = openOneTrustPreferenceCenter(window.location.hostname, { settingsVisible });
    if (!opened) return false;

    if (!(await ensureOneTrustPreferenceCenterVisible(ONETRUST_PREFERENCE_CENTER_SELECTORS, 4000))) {
      return false;
    }

    return commitOneTrustPreferenceProfile(prefs, method, window.location.hostname, scrollPosition);
  }

  async function applyOneTrustPrivacyCenterState(checked) {
    const hadVisibleToggles = visibleOneTrustToggles().length > 0;
    if (applyOneTrustBulkStateViaApi(checked)) {
      const host = window.location.hostname;
      if (!hadVisibleToggles || shouldSkipOneTrustApiDomSync(host)) return true;
      if (await waitForOneTrustTogglesState(checked, 700)) return true;
      if (shouldUseVisualOneTrustApiDomSync(host)) {
        setOneTrustCategoryEntriesSilently(checked);
        return await waitForOneTrustTogglesState(checked, 250);
      }
      setOneTrustTogglesNow(checked);
      if (await waitForOneTrustTogglesState(checked, 400)) return true;
    }

    if (checked) {
      enableVisibleOneTrustToggles();
    } else {
      disableVisibleOneTrustToggles();
    }
    await delay(250);
    return !hadVisibleToggles || await waitForOneTrustTogglesState(checked, 400);
  }

  function applyOneTrustBulkStateViaApi(checked) {
    try {
      if (checked) {
        if (typeof window.OneTrust?.Accept === 'function') {
          window.OneTrust.Accept();
          return true;
        }
        return false;
      }

      if (typeof window.OneTrust?.RejectAll === 'function') {
        window.OneTrust.RejectAll();
        return true;
      }
    } catch (_) {}

    return false;
  }

  function shouldSkipOneTrustApiDomSync(host = window.location.hostname) {
    return ONETRUST_SKIP_API_DOM_SYNC_HOSTS.has(host);
  }

  function shouldUseVisualOneTrustApiDomSync(host = window.location.hostname) {
    return ONETRUST_VISUAL_API_DOM_SYNC_HOSTS.has(host);
  }

  function shouldUseOneTrustPrivacyCenterReject(host = window.location.hostname) {
    return ONETRUST_PRIVACY_CENTER_REJECT_HOSTS.has(host);
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

  async function handleOneTrustCustom(prefs) {
    const host = window.location.hostname;
    const settingsVisible = hasVisibleSelector(ONETRUST_PREFERENCE_CENTER_SELECTORS);
    const { opened, scrollPosition } = openOneTrustPreferenceCenter(host, { settingsVisible });
    if (!opened) return false;

    if (!(await ensureOneTrustPreferenceCenterVisible(ONETRUST_PREFERENCE_CENTER_SELECTORS, 4000))) {
      return false;
    }

    return commitOneTrustPreferenceProfile(prefs, 'cmp_api:OneTrust:custom', host, scrollPosition);
  }

  async function handleZoomOneTrustCustomNative(prefs) {
    const host = window.location.hostname;
    const settingsVisible = hasVisibleSelector(ONETRUST_PREFERENCE_CENTER_SELECTORS);
    const { opened } = openOneTrustPreferenceCenter(host, { settingsVisible });
    if (!opened || !(await ensureOneTrustPreferenceCenterVisible(ONETRUST_PREFERENCE_CENTER_SELECTORS, 4000))) {
      return false;
    }

    // Zoom's save control reads the rendered toggle state. Updating the cookie API
    // first leaves those controls stale, so use OneTrust's native control path here.
    if (!applyZoomOneTrustNativeToggleState(prefs)) return false;
    const expectedGroups = expectedOneTrustConsentGroupsForPrefs(prefs);
    await delay(150);
    if (!clickOneTrustSaveButton(host)) return false;
    if (Object.keys(expectedGroups).length && !(await waitForOneTrustConsentGroups(expectedGroups, 2500))) {
      return false;
    }
    if (!(await waitForDismissal(ONETRUST_VISIBLE_SELECTORS, 4000))) return false;

    _handled = true;
    document.dispatchEvent(new CustomEvent('__emc_handled__', {
      detail: { method: 'cmp_api:OneTrust:zoom_native_custom' }
    }));
    return true;
  }

  // Zoom's #ot-do-not-sell control is a broken OneTrust settings opener after a
  // reload. Its sibling .ot-sdk-show-settings control opens the same native
  // preference center reliably. Bridge by stable ids/classes only; do not touch
  // the modal, page scroll, or OneTrust's save/close lifecycle.
  function installZoomOneTrustPrivacyChoicesBridge() {
    if (_zoomOneTrustPrivacyChoicesBridgeInstalled) return;
    _zoomOneTrustPrivacyChoicesBridgeInstalled = true;
    document.addEventListener('click', (event) => {
      const privacyChoices = event.target?.closest?.('#ot-do-not-sell');
      if (!privacyChoices) return;
      const settings = document.querySelector('.ot-sdk-show-settings:not(#ot-do-not-sell)');
      if (!settings) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      settings.click();
    }, true);
  }

  function applyZoomOneTrustNativeToggleState(prefs) {
    let applied = false;
    for (const entry of oneTrustCategoryEntries()) {
      const desired = desiredOneTrustEntryState(entry, prefs);
      if (desired === null || entry.id === 'C0001') continue;
      const toggle = document.getElementById(`ot-group-id-${entry.id}`);
      if (!toggle || toggle.disabled || toggle.getAttribute('aria-disabled') === 'true') continue;
      applied = true;
      if (Boolean(toggle.checked) === desired) continue;
      const label = findToggleLabel(toggle);
      if (label) {
        try {
          label.click();
        } catch (_) {
          dispatchSyntheticClick(label);
        }
      }
      if (Boolean(toggle.checked) !== desired) {
        applyOneTrustToggleDirectById(toggle.id, desired);
      }
    }
    return applied;
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

  function clickOneTrustSaveButton(host = window.location.hostname) {
    const btn = findVisibleOneTrustSaveButton(host) ?? findAnyOneTrustSaveButton(host);
    if (!btn) return false;
    try {
      btn.click();
      return true;
    } catch (_) {
      return dispatchSyntheticClick(btn);
    }
  }

  function oneTrustSaveSelectors(host = window.location.hostname, { includeGenericButtons = false } = {}) {
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

    if (includeGenericButtons) {
      selectors.push('button');
    }

    return selectors;
  }

  function findVisibleOneTrustSaveButton(host = window.location.hostname) {
    return findAnyOneTrustSaveButton(host, { visibleOnly: true });
  }

  function findAnyOneTrustSaveButton(host = window.location.hostname, { visibleOnly = false } = {}) {
    const explicitSave = visibleOnly
      ? firstVisibleElement(['.save-preference-btn-handler'])
      : document.querySelector('.save-preference-btn-handler');
    if (explicitSave && (!visibleOnly || isVisible(explicitSave))) return explicitSave;

    for (const root of oneTrustPreferenceSaveRoots()) {
      const scoped = findOneTrustSaveButtonInRoot(root, host, { visibleOnly, includeGenericButtons: true });
      if (scoped) return scoped;
    }

    return findOneTrustSaveButtonInRoot(document, host, { visibleOnly });
  }

  function findOneTrustSaveButtonInRoot(root, host = window.location.hostname, { visibleOnly = false, includeGenericButtons = false } = {}) {
    const seen = new Set();
    for (const selector of oneTrustSaveSelectors(host, { includeGenericButtons })) {
      for (const el of root.querySelectorAll(selector)) {
        if (seen.has(el)) continue;
        seen.add(el);
        if (visibleOnly && !isVisible(el)) continue;
        if (isOneTrustSaveButtonCandidate(el)) return el;
      }
    }
    return null;
  }

  function oneTrustPreferenceSaveRoots() {
    return Array.from(document.querySelectorAll('#onetrust-pc-sdk, #onetrust-consent-sdk')).filter((root) => {
      if (!isVisible(root)) return false;
      return Boolean(root.querySelector(
        ".save-preference-btn-handler, .category-switch-handler, input[id^='ot-group-id-'], [data-optanongroupid], .ot-cat-grp"
      ));
    });
  }

  function isOneTrustSaveButtonCandidate(el) {
    if (!el) return false;
    if (el.matches?.('.save-preference-btn-handler')) return true;
    const text = [
      el.textContent,
      el.getAttribute?.('aria-label'),
      el.getAttribute?.('title'),
      el.getAttribute?.('value'),
    ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    if (!text) return false;
    if (ONETRUST_NON_SAVE_TEXT_RE.test(text)) return false;
    return ONETRUST_SAVE_TEXT_RE.test(text);
  }

  function dispatchPreHandleIfOneTrustFlowStarts(expectedGroups = null, method = 'cmp_api:OneTrust:ccpa', preference = document.documentElement.dataset.emcPref ?? 'reject_all') {
    document.dispatchEvent(new CustomEvent('__emc_pre_handle__', {
      detail: {
        method,
        preference,
        expectedGroups,
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

  function invokeOneTrustToggleInfoDisplay() {
    try {
      if (typeof window.OneTrust?.ToggleInfoDisplay !== 'function') return false;
      window.OneTrust.ToggleInfoDisplay();
      return true;
    } catch (_) {
      return false;
    }
  }

  function openOneTrustPreferenceCenter(host = window.location.hostname, { settingsVisible = hasVisibleSelector(ONETRUST_PREFERENCE_CENTER_SELECTORS), allowContinue = false } = {}) {
    const scrollPosition = captureScrollPosition();
    if (settingsVisible) {
      return { opened: true, scrollPosition };
    }

    const opened = clickFirstVisible([
      ...ONETRUST_OPEN_CONTROL_SELECTORS,
    ]) || invokeOneTrustToggleInfoDisplay() || (allowContinue && clickOneTrustContinueToSettings(host));

    return {
      opened: Boolean(opened),
      scrollPosition: opened ? scrollPosition : null,
    };
  }

  function scheduleOneTrustPostSaveSettle(host = window.location.hostname, scrollPosition = null, expectedGroups = null) {
    // Zoom preserves its reusable preference-center nodes for footer reopens.
    // The generic watcher hides visible nodes with inline display:none, which
    // corrupts that native reopen path after Reject All has saved consent.
    if (ZOOM_ONETRUST_HOSTS.has(host)) return;
    try {
      const stopAt = Date.now() + 15000;
      let settling = false;
      // A real footer/settings click is the user reviewing an already-saved choice.
      // Stop the automation-only cleanup before OneTrust renders that center.
      const onSettingsOpenerClick = (event) => {
        if (!event.isTrusted) return;
        const target = event.target;
        if (!target?.closest?.(ONETRUST_OPEN_CONTROL_SELECTORS.join(', '))) return;
        cleanup();
      };
      const settleVisibleSurface = async () => {
        if (Date.now() > stopAt) {
          cleanup();
          return;
        }
        if (settling || !hasVisibleSelector(ONETRUST_VISIBLE_SELECTORS)) return;
        settling = true;
        try {
          syncPreservedOneTrustPreferenceCenter(host, expectedGroups);
          hideVisibleOneTrustSurfaces();
          await settleOneTrustAfterAction(host);
          syncPreservedOneTrustPreferenceCenter(host, expectedGroups);
          if (hasVisibleSelector(ONETRUST_VISIBLE_SELECTORS)) {
            hideVisibleOneTrustSurfaces();
          }
          restoreScrollPosition(scrollPosition);
        } finally {
          settling = false;
        }
      };
      const intervalId = setInterval(settleVisibleSurface, 500);
      const observer = new MutationObserver(() => { settleVisibleSurface(); });
      const root = document.body ?? document.documentElement;
      if (root) {
        observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'aria-hidden'] });
      }
      document.addEventListener('click', onSettingsOpenerClick, true);
      const cleanupTimer = setTimeout(cleanup, 16000);
      function cleanup() {
        try { clearInterval(intervalId); } catch (_) {}
        try { clearTimeout(cleanupTimer); } catch (_) {}
        try { observer.disconnect(); } catch (_) {}
        try { document.removeEventListener('click', onSettingsOpenerClick, true); } catch (_) {}
      }
    } catch (_) {}
  }

  function schedulePreservedOneTrustStateSync(host = window.location.hostname, expectedGroups = null) {
    if (!shouldCloseOneTrustPreservingDom(host) || !expectedGroups || !Object.keys(expectedGroups).length) return;
    try {
      const stopAt = Date.now() + 60000;
      const burstSync = () => {
        for (const ms of [0, 50, 150, 350, 750, 1500]) {
          try { setTimeout(sync, ms); } catch (_) {}
        }
      };
      const onClick = (event) => {
        const target = event?.target;
        if (!target?.closest?.(ONETRUST_OPEN_CONTROL_SELECTORS.join(', '))) return;
        burstSync();
      };
      const sync = () => {
        if (Date.now() > stopAt) {
          cleanup();
          return;
        }
        syncPreservedOneTrustPreferenceCenter(host, expectedGroups);
      };
      const intervalId = setInterval(sync, 250);
      const observer = new MutationObserver(sync);
      const root = document.body ?? document.documentElement;
      if (root) {
        observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'checked', 'aria-checked'] });
      }
      document.addEventListener('click', onClick, true);
      const cleanupTimer = setTimeout(cleanup, 61000);
      burstSync();
      function cleanup() {
        try { clearInterval(intervalId); } catch (_) {}
        try { clearTimeout(cleanupTimer); } catch (_) {}
        try { observer.disconnect(); } catch (_) {}
        try { document.removeEventListener('click', onClick, true); } catch (_) {}
      }
    } catch (_) {}
  }

  // UpdateConsent persists consent without necessarily updating OneTrust's reusable
  // preference-center markup. Keep the controls visually aligned whenever that
  // center is opened again, without dispatching events that can re-run consent
  // processing on sites such as Reuters.
  let oneTrustApiVisualStateSync = null;

  function scheduleOneTrustApiVisualStateSync(expectedGroups = null) {
    if (!expectedGroups || !Object.keys(expectedGroups).length) return;
    try {
      if (oneTrustApiVisualStateSync) {
        oneTrustApiVisualStateSync.expectedGroups = expectedGroups;
        return;
      }
      const state = { expectedGroups };
      const sync = () => {
        if (!hasVisibleSelector(ONETRUST_PREFERENCE_CENTER_SELECTORS)) return;
        for (const [id, checked] of Object.entries(state.expectedGroups)) {
          applyOneTrustToggleSilentById(`ot-group-id-${id}`, Boolean(checked));
        }
      };
      const burstSync = () => {
        for (const ms of [0, 50, 150, 350, 750, 1500]) {
          try { setTimeout(sync, ms); } catch (_) {}
        }
      };
      const onClick = (event) => {
        const target = event?.target;
        if (!target?.closest?.(ONETRUST_OPEN_CONTROL_SELECTORS.join(', '))) return;
        burstSync();
      };
      document.addEventListener('click', onClick, true);
      oneTrustApiVisualStateSync = state;
      burstSync();
    } catch (_) {}
  }

  function syncPreservedOneTrustPreferenceCenter(host = window.location.hostname, expectedGroups = null) {
    if (!shouldCloseOneTrustPreservingDom(host) || !expectedGroups) return false;
    let synced = false;
    for (const [id, checked] of Object.entries(expectedGroups)) {
      if (applyOneTrustToggleSilentById(`ot-group-id-${id}`, Boolean(checked))) synced = true;
    }
    return synced;
  }

  function setOneTrustGroupStateById(id, checked) {
    const toggle = document.getElementById(id);
    if (!toggle || toggle.disabled || toggle.getAttribute('aria-disabled') === 'true') return false;
    if (Boolean(toggle.checked) === checked) return true;
    forceOneTrustToggleState(toggle, checked);
    return true;
  }

  // Like setOneTrustGroupStateById but omits the label click.
  // Used for React-managed toggles in tab-based preference centers (canadiantire.ca,
  // zoom.com) where the label click would fire a reverting change event and flip the
  // toggle back to its original state. Do NOT use this for sites like reuters.com where
  // the reverting label-click event is needed to avoid triggering heavy OneTrust processing.
  function applyOneTrustToggleDirectById(id, checked) {
    const toggle = document.getElementById(id);
    if (!toggle || toggle.disabled || toggle.getAttribute('aria-disabled') === 'true') return false;
    if (Boolean(toggle.checked) === checked) return true;
    setOneTrustToggleChecked(toggle, checked);
    toggle.dispatchEvent(new Event('change', { bubbles: true }));
    toggle.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }

  function applyOneTrustToggleSilentById(id, checked) {
    const toggle = document.getElementById(id);
    if (!toggle || toggle.disabled || toggle.getAttribute('aria-disabled') === 'true') return false;
    if (Boolean(toggle.checked) === checked) return true;
    setOneTrustToggleChecked(toggle, checked);
    return true;
  }

  async function commitOneTrustPreferenceProfile(
    prefs,
    method,
    host = window.location.hostname,
    scrollPosition = null,
    applyMethodOverride = null,
  ) {
    const applyMethod = applyMethodOverride ?? applyOneTrustPreferenceProfile(prefs);
    if (!applyMethod) return false;

    const expectedGroups = expectedOneTrustConsentGroupsForPrefs(prefs);
    dispatchPreHandleIfOneTrustFlowStarts(expectedGroups, method, prefs?.globalPreference);
    await delay(250);
    if (applyMethod === 'api') scheduleOneTrustApiVisualStateSync(expectedGroups);

    // When UpdateConsent already persisted consent (API path), skip "Confirm My Choices"
    // on hosts where that click corrupts OneTrust's state. settleOneTrustAfterAction
    // closes the PC via close button / OneTrust.Close() without triggering the corruption.
    if (applyMethod === 'api' && ONETRUST_SKIP_CONFIRM_HOSTS.has(host)) {
      if (Object.keys(expectedGroups).length) {
        await waitForOneTrustConsentGroups(expectedGroups, 1500);
      }
      await settleOneTrustAfterAction(host);
      restoreScrollPosition(scrollPosition);
      if (host !== 'www.zoom.com' && hasVisibleSelector(ONETRUST_VISIBLE_SELECTORS)) hideVisibleOneTrustSurfaces();
      schedulePreservedOneTrustStateSync(host, expectedGroups);
      scheduleOneTrustPostSaveSettle(host, scrollPosition, expectedGroups);
      if (Object.keys(expectedGroups).length && !(await waitForOneTrustConsentGroups(expectedGroups, 2000))) {
        return false;
      }
      return finalizeOneTrustHandled(method, 5000, host);
    }

    const saveSelectors = oneTrustSaveSelectors(host);
    const clicked = clickOneTrustSaveButton(host);
    if (Object.keys(expectedGroups).length) {
      await waitForOneTrustConsentGroups(expectedGroups, clicked ? 1500 : 800);
    }
    if (!clicked) {
      await settleOneTrustAfterAction(host);
      restoreScrollPosition(scrollPosition);
      if (hasVisibleSelector(ONETRUST_VISIBLE_SELECTORS)) hideVisibleOneTrustSurfaces();
      schedulePreservedOneTrustStateSync(host, expectedGroups);
      scheduleOneTrustPostSaveSettle(host, scrollPosition, expectedGroups);
      if (Object.keys(expectedGroups).length && !(await waitForOneTrustConsentGroups(expectedGroups, 2000))) {
        return false;
      }
      return finalizeOneTrustHandled(method, 5000, host);
    }
    await settleOneTrustAfterAction(host);
    restoreScrollPosition(scrollPosition);
    if (host !== 'www.zoom.com' && hasVisibleSelector(ONETRUST_VISIBLE_SELECTORS)) hideVisibleOneTrustSurfaces();
    schedulePreservedOneTrustStateSync(host, expectedGroups);
    scheduleOneTrustPostSaveSettle(host, scrollPosition, expectedGroups);
    if (Object.keys(expectedGroups).length && !(await waitForOneTrustConsentGroups(expectedGroups, 2000))) {
      return false;
    }
    return finalizeOneTrustHandled(method, 5000, host);
  }

  function applyOneTrustPreferenceProfile(prefs) {
    if (applyOneTrustCustomPreferencesViaApi(prefs)) {
      return 'api';
    }
    return applyOneTrustCustomPreferencesViaDom(prefs) ? 'dom' : false;
  }

  // Returns 'api' if consent was applied via OneTrust.UpdateConsent (no Confirm click
  // needed on some hosts), 'dom' if applied via DOM toggle manipulation (Confirm needed),
  // or false if nothing could be applied.
  function applyOneTrustCustomPreferences(prefs) {
    return applyOneTrustPreferenceProfile(prefs);
  }

  function applyOneTrustCustomPreferencesViaDom(prefs) {
    // Tab-based PC layouts (e.g. FIFA, canadiantire.ca) often expose only the active
    // tab's toggle as "visible". Iterate all known category IDs directly so every
    // category is reconciled regardless of which tab is currently active.
    const categoryEntries = oneTrustCategoryEntries();
    if (categoryEntries.length) {
      let appliedViaId = false;
      for (const entry of categoryEntries) {
        const nextState = desiredOneTrustEntryState(entry, prefs);
        if (nextState === null) continue;
        if (applyOneTrustToggleDirectById(`ot-group-id-${entry.id}`, nextState)) {
          appliedViaId = true;
        }
      }
      if (appliedViaId) return true;
    }

    const toggles = visibleOneTrustToggles();
    if (!toggles.length) return false;

    let appliedAny = false;
    for (const toggle of toggles) {
      const nextState = desiredOneTrustToggleState(toggle, prefs);
      if (nextState === null) continue;
      appliedAny = true;
      if (Boolean(toggle.checked) !== nextState) {
        forceOneTrustToggleState(toggle, nextState);
      }
    }

    return appliedAny;
  }

  function applyOneTrustCustomPreferencesViaApi(prefs) {
    const updateConsent = window.OneTrust?.UpdateConsent;
    if (typeof updateConsent !== 'function') return false;

    const categoryEntries = oneTrustCategoryEntries();
    if (!categoryEntries.length) return false;
    const host = window.location.hostname;
    const skipDomSync = shouldSkipOneTrustApiDomSync(host);
    const visualDomSync = shouldUseVisualOneTrustApiDomSync(host);

    let appliedAny = false;
    for (const entry of categoryEntries) {
      const nextState = desiredOneTrustEntryState(entry, prefs);
      if (nextState === null) continue;
      appliedAny = true;
      try {
        updateConsent('Category', `${entry.id}:${nextState ? '1' : '0'}`);
      } catch (_) {}
      if (skipDomSync) continue;
      if (visualDomSync) {
        applyOneTrustToggleSilentById(`ot-group-id-${entry.id}`, nextState);
      } else {
        applyOneTrustToggleDirectById(`ot-group-id-${entry.id}`, nextState);
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

    // Privacy-choice `_BG` groups are semantic opt-out controls even when the
    // visible label looks like a targeting/advertising category.
    if (isOneTrustCcpaEntry(entry)) {
      return prefs.ccpaDoNotSell === false;
    }

    if (id === 'C0001' || /strictly necessary|necessary cookies|essential cookies|required cookies|always active/i.test(text)) {
      return true;
    }

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

  function oneTrustCategoryEntries() {
    const entries = new Map();
    for (const row of document.querySelectorAll(
      '#onetrust-pc-sdk [data-optanongroupid], #onetrust-banner-sdk [data-optanongroupid]'
    )) {
      const id = row.getAttribute('data-optanongroupid') ?? '';
      if (!id) continue;
      const text = row.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      const prev = entries.get(id);
      if (!prev || text.length > prev.text.length) {
        entries.set(id, { id, text });
      }
    }
    return Array.from(entries.values());
  }

  function isOneTrustPrivacyChoicesCcpaFlow() {
    if (document.querySelector(ONETRUST_CCPA_STRUCTURAL_SELECTORS.join(', '))) return true;

    const categoryEntries = oneTrustCategoryEntries();
    if (categoryEntries.some((entry) => isOneTrustCcpaEntry(entry))) return true;

    return Array.from(document.querySelectorAll("input[id^='ot-group-id-']")).some((toggle) =>
      isOneTrustCcpaEntry({
        id: toggle?.id?.replace(/^ot-group-id-/, '') ?? '',
        text: oneTrustToggleText(toggle),
      })
    );
  }

  function isOneTrustCcpaEntry(entry) {
    const id = entry?.id ?? '';
    const text = entry?.text ?? '';
    return ONETRUST_CCPA_GROUP_ID_RE.test(id) || ONETRUST_CCPA_TEXT_RE.test(text);
  }

  function expectedOneTrustConsentGroupsForPrefs(prefs) {
    const expectedGroups = {};
    for (const entry of oneTrustCategoryEntries()) {
      const nextState = desiredOneTrustEntryState(entry, prefs);
      if (nextState === null) continue;
      expectedGroups[entry.id] = nextState;
    }
    return expectedGroups;
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
    const selectors = ONETRUST_SURFACE_ONLY_CLEANUP_HOSTS.has(window.location.hostname)
      ? ONETRUST_VISIBLE_SELECTORS
      : [
        ...ONETRUST_VISIBLE_SELECTORS,
        '.ot-sdk-container',
        '.ot-sdk-row',
      ];
    // Only remove elements that are currently visible. Hidden elements (e.g. the
    // preference-center SDK container that OneTrust re-uses for "Your Privacy Choices")
    // must be left in the DOM so the CMP can show correct state when the user opens
    // them later.
    for (const sel of selectors) {
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

  function closeOneTrustPreferenceCenterIfVisible() {
    const btn = document.querySelector('#close-pc-btn-handler, .onetrust-close-btn-handler.ot-close-icon:not(.banner-close-button)');
    if (btn && isVisible(btn)) {
      try {
        btn.click();
        return true;
      } catch (_) {
        return dispatchSyntheticClick(btn);
      }
    }

    try {
      if (typeof window.OneTrust?.Close === 'function') {
        window.OneTrust.Close();
        return true;
      }
    } catch (_) {}

    return false;
  }

  function closeVisibleOneTrustSurface() {
    const btn = firstVisibleElement([
      '#close-pc-btn-handler',
      '#onetrust-close-btn-container button',
      '.onetrust-close-btn-handler.ot-close-icon.banner-close-button',
      '.onetrust-close-btn-handler.banner-close-button',
      '.onetrust-close-btn-handler.ot-close-icon:not(.banner-close-button)',
    ]);
    if (btn) {
      try {
        btn.click();
        return true;
      } catch (_) {
        return dispatchSyntheticClick(btn);
      }
    }

    try {
      if (typeof window.OneTrust?.Close === 'function') {
        window.OneTrust.Close();
        return true;
      }
    } catch (_) {}

    return false;
  }

  function hideOneTrustSurfacesVisually() {
    if (document.documentElement?.dataset.emcZoomOneTrustUserOpen === 'true') return;
    // Sets display:none via inline style on OneTrust surfaces WITHOUT removing elements
    // from the DOM or calling OneTrust's JS close logic. Used for zoom.com where every close
    // mechanism (Confirm, close button, OneTrust.Close()) removes .onetrust-pc-dark-filter
    // from the DOM — which breaks the footer "Cookie Settings" link because otBannerSdk
    // calls removeAttribute("style") on that element to unhide it when reopening.
    //
    // IMPORTANT: Do NOT hide #onetrust-consent-sdk on zoom.com. Zoom's OneTrust build
    // (202409.2.0) nests both #onetrust-pc-sdk and .onetrust-pc-dark-filter INSIDE
    // #onetrust-consent-sdk. If we set display:none on the parent container, the footer
    // link's removeAttribute("style") only clears inline style on the children — the parent
    // stays display:none, making the children invisible regardless. By hiding children
    // individually and leaving #onetrust-consent-sdk without an inline style override,
    // fetchAndSetupPC() can unhide the PC correctly.
    const zoomHideSelectors = [
      '#onetrust-banner-sdk',
      '#onetrust-pc-sdk',
      '.onetrust-pc-dark-filter',
    ];
    for (const sel of zoomHideSelectors) {
      for (const el of document.querySelectorAll(sel)) {
        try { el.style.display = 'none'; } catch (_) {}
      }
    }
    try {
      document.body?.classList?.remove('ot-overflow-hidden', 'ot-no-scroll');
      document.documentElement?.classList?.remove('ot-overflow-hidden', 'ot-no-scroll');
      if (document.body) document.body.style.overflow = '';
    } catch (_) {}
  }

  function hideVisibleOneTrustSurfaces() {
    for (const sel of ONETRUST_VISIBLE_SELECTORS) {
      for (const el of document.querySelectorAll(sel)) {
        if (!isVisible(el)) continue;
        try { el.style.display = 'none'; } catch (_) {}
      }
    }
    try {
      document.body?.classList?.remove('ot-overflow-hidden', 'ot-no-scroll');
      document.documentElement?.classList?.remove('ot-overflow-hidden', 'ot-no-scroll');
      if (document.body) document.body.style.overflow = '';
    } catch (_) {}
  }

  async function settleOneTrustAfterAction(host = window.location.hostname) {
    if (ONETRUST_VISUAL_HIDE_CLOSE_HOSTS.has(host)) {
      await delay(250);
      hideOneTrustSurfacesVisually();
      return;
    }

    if (shouldCloseOneTrustPreservingDom(host)) {
      await delay(250);
      const started = Date.now();
      while (Date.now() - started < 2500) {
        if (!hasVisibleSelector(ONETRUST_VISIBLE_SELECTORS)) return;
        closeOneTrustPreferenceCenterIfVisible();
        await delay(200);
      }
      return;
    }

    if (host === 'www.zoom.com') {
      await delay(250);
      closeZoomOneTrustBannerIfVisible();
      return;
    }

    await delay(250);
    const closeStarted = Date.now();
    while (Date.now() - closeStarted < 1500) {
      if (!hasVisibleSelector(ONETRUST_VISIBLE_SELECTORS)) return;
      if (!closeVisibleOneTrustSurface()) break;
      await delay(200);
    }
    if (!hasVisibleSelector(ONETRUST_VISIBLE_SELECTORS)) return;
    if (document.cookie.includes('OptanonConsent=')) {
      hideVisibleOneTrustSurfaces();
      return;
    }

    if (shouldForceOneTrustCleanup(host)) {
      const btn = document.querySelector('#onetrust-accept-btn-handler');
      if (btn && isVisible(btn)) dispatchSyntheticClick(btn);
      await delay(250);
      if (hasVisibleSelector(ONETRUST_VISIBLE_SELECTORS)) {
        scheduleOneTrustCleanup();
      }
    }
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
    for (const toggle of visibleOneTrustToggles()) {
      if (Boolean(toggle.checked) === checked) continue;
      setOneTrustToggleChecked(toggle, checked);
      toggle.dispatchEvent(new Event('change', { bubbles: true }));
      toggle.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function setOneTrustTogglesSilently(checked) {
    for (const toggle of visibleOneTrustToggles()) {
      if (Boolean(toggle.checked) === checked) continue;
      setOneTrustToggleChecked(toggle, checked);
    }
  }

  function setOneTrustCategoryEntriesSilently(checked) {
    let appliedAny = false;
    for (const entry of oneTrustCategoryEntries()) {
      if (applyOneTrustToggleSilentById(`ot-group-id-${entry.id}`, checked)) {
        appliedAny = true;
      }
    }
    if (appliedAny) return true;
    setOneTrustTogglesSilently(checked);
    return false;
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

  async function waitForOneTrustConsentGroups(expectedGroups, timeoutMs) {
    if (!expectedGroups || Object.keys(expectedGroups).length === 0) return true;
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const groups = readOneTrustConsentGroups();
      if (groups && Object.entries(expectedGroups).every(([group, expected]) => groups[group] === expected)) {
        return true;
      }
      await delay(100);
    }
    const groups = readOneTrustConsentGroups();
    return Boolean(groups &&
      Object.entries(expectedGroups).every(([group, expected]) => groups[group] === expected));
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
    setOneTrustToggleChecked(toggle, checked);
    // React's synthetic event system listens for native change/input events
    toggle.dispatchEvent(new Event('change', { bubbles: true }));
    toggle.dispatchEvent(new Event('input', { bubbles: true }));
    // Belt-and-suspenders: also click the label.
    // On some OneTrust builds (e.g. reuters.com) the label click fires a reverting
    // change event (checked → !checked) that tells OneTrust's handler "state unchanged"
    // — without it, the single change(false) triggers heavy consent processing that
    // hangs the page. For React-managed custom-preference flows (canadiantire.ca, zoom.com)
    // we use applyOneTrustToggleDirectById instead, which omits this label click.
    const label = findToggleLabel(toggle);
    if (label) dispatchSyntheticClick(label);
  }

  function setOneTrustToggleChecked(toggle, checked) {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'checked'
    )?.set;
    if (nativeSetter) {
      nativeSetter.call(toggle, checked);
    } else {
      toggle.checked = checked;
    }
  }

  function findToggleLabel(toggle) {
    if (!toggle) return null;
    if (toggle.id && typeof CSS?.escape === 'function') {
      const explicit = document.querySelector(`label[for="${CSS.escape(toggle.id)}"]`);
      if (explicit) return explicit;
    }
    return toggle.parentElement?.querySelector('.ot-switch-nob, .ot-tgl-cntr, .category-switch-handler') ?? null;
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

  function hasVisibleOneTrustPrivacyChoicesEntry() {
    return hasVisibleSelector(ONETRUST_OPEN_CONTROL_SELECTORS);
  }

  function hasAnyOneTrustPrivacyChoicesEntry() {
    return ONETRUST_OPEN_CONTROL_SELECTORS.some((selector) => document.querySelector(selector)) ||
      typeof window.OneTrust?.ToggleInfoDisplay === 'function' ||
      oneTrustCategoryEntries().length > 0;
  }

  async function waitForAnyVisible(selectors, timeoutMs = 3000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (hasVisibleSelector(selectors)) return true;
      await delay(200);
    }
    return false;
  }

  async function ensureOneTrustPreferenceCenterVisible(selectors, timeoutMs = 4000) {
    if (await waitForAnyVisible(selectors, timeoutMs)) return true;
    if (!invokeOneTrustToggleInfoDisplay()) return false;
    return waitForAnyVisible(selectors, Math.max(1800, Math.floor(timeoutMs / 2)));
  }

  async function finalizeOneTrustHandled(method, timeoutMs = 5000, host = window.location.hostname) {
    if (!(await waitForDismissal(ONETRUST_VISIBLE_SELECTORS, timeoutMs))) {
      await settleOneTrustAfterAction(host);
      if (!(await waitForDismissal(ONETRUST_VISIBLE_SELECTORS, 1500))) return false;
    }
    _handled = true;
    document.dispatchEvent(new CustomEvent('__emc_handled__', {
      detail: { method },
    }));
    return true;
  }

  function captureScrollPosition() {
    try {
      const dataset = document.documentElement?.dataset ?? {};
      const x = Number(dataset.emcConsentScrollX);
      const y = Number(dataset.emcConsentScrollY);
      if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
      return { x: window.scrollX, y: window.scrollY };
    } catch (_) {
      return null;
    }
  }

  function restoreScrollPosition(position) {
    if (!position) return;
    try {
      window.scrollTo(position.x, position.y);
    } catch (_) {}
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
