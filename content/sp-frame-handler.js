// Sourcepoint frame handler — covers both GDPR (TCF) and US (USNat/CCPA) banners.
// Runs in ALL frames so it reaches inside cross-origin Sourcepoint iframes.
//
// GDPR banner:  "Reject All" / "Accept All" buttons — sp_choice_type_REJECT_ALL etc.
// USNat banner: "Do not sell or share my personal information" — text-matched because
//               the Guardian and many publishers style these buttons with their own classes,
//               not Sourcepoint's generic sp_choice_type_* class names.
//
// Clicking is correct — it fires SP's postRejectAll → POST to their backend,
// which records consent. Faking the signal alone doesn't suppress the banner.

(function () {
  const FRAME_COOLDOWN_MS = 20000;
  const FRAME_RUN_GUARD_PREFIX = '__emc_spframe__';
  const MANUAL_CONSENT_OPEN_KEY = '__emc_manual_consent_open__';
  const MANUAL_CONSENT_SUPPRESS_MS = 120000;
  const GUARDIAN_ACCESSIBILITY_PATH = '/help/accessibility-help';
  const GUARDIAN_HOSTS = new Set(['www.theguardian.com', 'support.theguardian.com']);
  const TEMPORARILY_UNSUPPORTED_TOP_SITES = new Set(['www.bbc.com', 'latimes.com', 'www.latimes.com', 'membership.latimes.com']);

  function isSourcepointHost(host = window.location.hostname) {
    return /sourcepoint\.com|sourcepointcmp\.|sp-prod\.net|privacy-mgmt\.com/.test(host);
  }

  // ── Detection ───────────────────────────────────────────────────────────────
  // SP iframes always include at least one of these signals.
  function isSPFrame() {
    // Hostname check covers USNat iframes that load on Sourcepoint-owned domains
    const host = window.location.hostname;
    const docEl = document.documentElement;
    if (isSourcepointHost(host)) return true;
    return (
      document.querySelector('[class*="sp_choice_type"]') !== null ||
      document.querySelector('[data-sp-action]')          !== null ||
      (
        document.querySelector('[class*="message-component"]') !== null &&
        hasConsentKeywords()
      ) ||
      docEl?.dataset?.spMessageId !== undefined
    );
  }

  // ── GDPR selectors ──────────────────────────────────────────────────────────
  const GDPR_REJECT = [
    '.sp_choice_type_REJECT_ALL',
    '.sp_choice_type_13',
    'button[data-sp-action="REJECT_ALL"]',
    '[aria-label*="Reject All" i]',
    'button[title*="Reject All" i]',
    'button[title*="Decline All" i]',
    'button[title*="Refuse All" i]',
    '[aria-label*="Refuse All" i]',
    'button[title*="Do Not Accept" i]',
    'button[aria-label*="Do Not Accept" i]',
    'text:no, i do not accept',
    'text:i do not accept',
  ];

  const GDPR_ACCEPT = [
    '.sp_choice_type_ACCEPT_ALL',
    '.sp_choice_type_11',
    'button[data-sp-action="ACCEPT_ALL"]',
    '[aria-label*="Accept All" i]',
    'button[title*="Accept All" i]',
  ];

  const FT_NOTICE_ACCEPT = [
    '.sp_choice_type_11',
    'button[title="Accept"]',
    'button[aria-label="Accept"]',
    'button[data-sp-action="ACCEPT_ALL"]',
    'text:accept',
  ];

  const FT_NOTICE_MANAGE = [
    '.sp_choice_type_12',
    'button[title*="Manage Cookies" i]',
    'button[aria-label*="Manage Cookies" i]',
    'a[title*="Manage Cookies" i]',
    'a[aria-label*="Manage Cookies" i]',
    'text:manage cookies',
  ];

  const FT_PM_REJECT = [
    'button[title*="Reject All" i]',
    'button[aria-label*="Reject All" i]',
    'button[data-sp-action="REJECT_ALL"]',
    '.sp_choice_type_REJECT_ALL',
    'text:reject all',
    'text:decline all',
  ];

  const FT_PM_ACCEPT = [
    'button[title*="Accept All" i]',
    'button[aria-label*="Accept All" i]',
    'button[title="Accept"]',
    'button[aria-label="Accept"]',
    'button[data-sp-action="ACCEPT_ALL"]',
    '.sp_choice_type_ACCEPT_ALL',
    '.sp_choice_type_11',
    'text:accept all',
    'text:accept',
  ];

  const FT_PM_SAVE = [
    'button[title*="Save and Close" i]',
    'button[aria-label*="Save and Close" i]',
    'button[title*="Save" i]',
    'button[aria-label*="Save" i]',
    '.sp_choice_type_SAVE_AND_EXIT',
    'text:save and close',
    'text:save',
  ];

  // ── USNat / CCPA selectors ──────────────────────────────────────────────────
  // "Do not sell" is the privacy-protective action (equivalent to "Reject All").
  // "Accept" / dismiss leaves data-selling enabled.
  const USNAT_OPT_OUT = [
    // Text-based — publishers style these buttons themselves
    ...textSels([
      'do not sell or share',
      'do not sell my personal',
      'opt out of sale',
      'opt-out of sale',
      'opt out of sharing',
      'do not share my personal',
      'do not sell',
    ]),
    // SP class-based (some builds still use these)
    '.gu-btn-dns',
    '.sp_choice_type_13',
    '.sp_choice_type_REJECT_ALL',
    'button[title*="Do not sell or share" i]',
    'button[aria-label*="Do not sell or share" i]',
    'button[data-sp-action="OPT_OUT_OF_SALE"]',
    'button[data-sp-action="REJECT_ALL"]',
  ];

  const USNAT_ACCEPT = [
    ...textSels(['accept', 'allow', 'agree', 'i accept', 'ok', 'got it']),
    '.sp_choice_type_ACCEPT_ALL',
    'button[data-sp-action="ACCEPT_ALL"]',
  ];

  // Dismiss (X button) — used when user just wants to close a notice-only banner
  const DISMISS = [
    '.sp_choice_type_DISMISS',
    'button[data-sp-action="DISMISS"]',
    '[aria-label*="Close" i]',
    '[aria-label*="Dismiss" i]',
    'button.message-close-btn',
  ];

  // ── Main ────────────────────────────────────────────────────────────────────
  async function run() {
    // Guard the top-level Guardian frame before any SP detection. The Guardian
    // renders SP elements directly in the page DOM, so isSPFrame() returns true
    // in the top frame where referrerHost() is unreliable ('unknown'). Clicking
    // wrong elements there causes navigation to /help/accessibility-help.
    if (GUARDIAN_HOSTS.has(window.location.hostname)) return;
    if (isCurrentGuardianAccessibilityPage()) return;
    const site = referrerHost();
    if (TEMPORARILY_UNSUPPORTED_TOP_SITES.has(site) || TEMPORARILY_UNSUPPORTED_TOP_SITES.has(window.location.hostname)) return;

    const isFTShell = isPotentialFTShell(site);
    // isSPFrame()/hasConsentSignals() rely on DOM content (sp_choice_type classes,
    // data-sp-action, cookie/consent keywords) that Sourcepoint's own JS renders
    // asynchronously. On document_idle — when this content script first runs — that
    // content may not exist yet, especially on custom first-party CNAME domains
    // (e.g. sp-spiegel-de.spiegel.de) that also don't match isSourcepointHost()'s
    // hostname fast path. Without a retry, a page where SP simply hasn't painted
    // yet looks identical to a page with no SP banner at all, and this frame gives
    // up permanently with no later chance to catch the banner once it renders.
    const gateDeadline = Date.now() + 6000;
    let framePresent = isSPFrame();
    while (!framePresent && !isFTShell && Date.now() < gateDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      framePresent = isSPFrame();
    }
    if (!framePresent && !isFTShell) return;

    let signalsPresent = hasConsentSignals();
    while (!signalsPresent && !isFTShell && !isSourcepointHost(window.location.hostname) && Date.now() < gateDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      signalsPresent = hasConsentSignals();
    }
    if (!signalsPresent && !isFTShell && !isSourcepointHost(window.location.hostname)) return;
    if (await isDisabledForTopSite()) return;
    if (await isManualConsentOpenSuppressed(site)) return;

    // Determine which framework this banner is. USNat/CCPA banners contain explicit
    // "sell"/"sale" language, or "sharing"/"share" paired closely with "personal"
    // (e.g. "Do Not Sell or Share My Personal Information"). The sharing/personal
    // gap must stay bounded — unbounded .* previously spanned the entire page text
    // and false-matched unrelated GDPR marketing copy on the same page (e.g.
    // "personalized advertising" in one sentence, "No sharing of your data" in a
    // completely unrelated one), misclassifying a GDPR-only banner as USNat. That
    // silently broke Accept All on spiegel.de: USNat selectors don't include the
    // GDPR accept button, so the misrouted click never found anything to click.
    const isUSNat = !!document.body?.textContent?.match(/\bsell(?:ing|s)?\b|\bsale\b|shar(?:e|ing)[\s\S]{0,40}personal/i);

    const settings = await chrome.storage.sync.get({
      globalPreference: 'reject_all',
      onboardingComplete: false,
      categoryPreferences: { functional: false, analytics: false, advertising: false, ccpaDoNotSell: true, uncategorized: 'reject' },
    });
    if (!settings.onboardingComplete) return;
    if (isFrameCoolingDown(site, settings.globalPreference)) return;

    if (GUARDIAN_HOSTS.has(site)) {
      if (settings.globalPreference === 'accept_all') {
        await handleGuardianAcceptFrame(site, settings.globalPreference);
        return;
      }
      if (site === 'support.theguardian.com') {
        await handleGuardianSupportRejectFrame(site, settings.globalPreference);
      }
      return;
    }

    if (site === 'www.euronews.com') return;
    if (site === 'www.ft.com') {
      if (!(await waitForFTFrameReady())) return;
      await handleFTFrame(settings, site);
      return;
    }

    const accept = settings.globalPreference === 'accept_all';
    const wantsUsNatOptOut = effectiveUsNatOptOut(settings);

    let selectors;
    if (isUSNat) {
      selectors = accept ? USNAT_ACCEPT : (wantsUsNatOptOut ? USNAT_OPT_OUT : DISMISS);
    } else {
      selectors = accept ? GDPR_ACCEPT : GDPR_REJECT;
    }

    const framework = isUSNat ? 'usnat' : 'gdpr';
    const bloombergImmediateDismissSelectors = [
      '.sp_choice_type_13',
      'button[title*="Do Not Accept" i]',
      'button[aria-label*="Do Not Accept" i]',
      'text:no, i do not accept',
    ];
    const bloombergImmediateAcceptSelectors = [
      '.sp_choice_type_11',
      'button[title*="Yes, I Accept" i]',
      'button[aria-label*="Yes, I Accept" i]',
      'button[title*="Accept All" i]',
      'button[aria-label*="Accept All" i]',
      'text:yes, i accept',
    ];

    if (isPrivacyManagerFrame()) {
      if (isUSNat) {
        if (await applySourcepointUsNatPrivacyChoice(wantsUsNatOptOut, site, settings.globalPreference)) {
          return;
        }
      } else if (!accept) {
        const rejected = await rejectFromPrivacyManager();
        if (rejected) {
          // Report before clicking Save — saving can trigger a full page reload
          // (confirmed on spiegel.de), which can destroy this frame's execution
          // context mid-click and silently drop the report if it were sent after.
          // A confirmed rejection of every category plus a genuinely visible Save
          // control is itself sufficient evidence of a completed save.
          await report(site, `sourcepoint:${framework}:privacy-manager`, settings.globalPreference);
          clickPrivacyManagerSaveAndExit();
          return;
        }
      }
      return;
    }

    const shouldReportBloombergImmediateDismiss =
      site === 'www.bloomberg.com' &&
      !isUSNat &&
      !accept &&
      hasVisibleSelector(bloombergImmediateDismissSelectors);
    const shouldReportBloombergImmediateAccept =
      site === 'www.bloomberg.com' &&
      !isUSNat &&
      accept &&
      hasVisibleSelector(bloombergImmediateAcceptSelectors);
    // spiegel.de tears down this SP iframe (removes it from the DOM) within
    // ~1s of a successful Accept click, same as the privacy-manager Save race
    // documented above. waitForDismissal() below polls via setTimeout inside
    // this frame's own JS context; once the iframe is detached that context is
    // discarded and the pending poll never resumes, so a report() issued after
    // the click never fires even though the click genuinely worked (verified:
    // outgoing ad-partner requests carry a real, non-zero TC consent string
    // immediately after). Unlike the Bloomberg cases below, reporting right
    // after dispatching the click isn't safe here either -- the teardown can
    // race the message send itself. Report BEFORE dispatching the click
    // instead (same fix as the privacy-manager Save race above): tryClick()
    // already validates a real, visible Accept control is present, which is
    // sufficient evidence the click will register.
    if (site === 'www.spiegel.de' && !isUSNat && accept) {
      const target = findClickTarget(selectors);
      if (target) {
        await report(site, `sourcepoint:${framework}:frame`, settings.globalPreference);
        dispatchSyntheticClick(target);
        return;
      }
    }

    if (tryClick(selectors)) {
      if (shouldReportBloombergImmediateDismiss) {
        void report(site, `sourcepoint:${framework}:frame`, settings.globalPreference);
      }
      if (shouldReportBloombergImmediateAccept) {
        void report(site, `sourcepoint:${framework}:frame`, settings.globalPreference);
      }
      if (isUSNat && !accept && wantsUsNatOptOut) {
        const outcome = await waitForUsNatTransition(6000);
        if (outcome === 'dismissed') {
          await report(site, `sourcepoint:${framework}:frame`, settings.globalPreference);
          return;
        }
        if (outcome === 'privacy_manager') {
          await applySourcepointUsNatPrivacyChoice(true, site, settings.globalPreference);
          return;
        }
      }
      if (await waitForDismissal()) {
        await report(site, `sourcepoint:${framework}:frame`, settings.globalPreference);
      }
      return;
    }

    if (!accept && openPrivacyManager()) return;

    // Buttons hydrate asynchronously in some SP builds — watch the DOM.
    const observer = new MutationObserver(async () => {
      const shouldReportDeferredBloombergImmediateDismiss =
        site === 'www.bloomberg.com' &&
        !isUSNat &&
        !accept &&
        hasVisibleSelector(bloombergImmediateDismissSelectors);
      const shouldReportDeferredBloombergImmediateAccept =
        site === 'www.bloomberg.com' &&
        !isUSNat &&
        accept &&
        hasVisibleSelector(bloombergImmediateAcceptSelectors);
      // Same report-before-click reasoning as the initial (non-deferred) check
      // above: spiegel.de's teardown can race a report sent after the click.
      if (site === 'www.spiegel.de' && !isUSNat && accept) {
        const deferredTarget = findClickTarget(selectors);
        if (deferredTarget) {
          observer.disconnect();
          await report(site, `sourcepoint:${framework}:frame:deferred`, settings.globalPreference);
          dispatchSyntheticClick(deferredTarget);
          return;
        }
      }

      if (tryClick(selectors)) {
        if (shouldReportDeferredBloombergImmediateDismiss) {
          void report(site, `sourcepoint:${framework}:frame:deferred`, settings.globalPreference);
        }
        if (shouldReportDeferredBloombergImmediateAccept) {
          void report(site, `sourcepoint:${framework}:frame:deferred`, settings.globalPreference);
        }
        if (isUSNat && !accept && wantsUsNatOptOut) {
          const outcome = await waitForUsNatTransition(6000);
          if (outcome === 'dismissed') {
            observer.disconnect();
            await report(site, `sourcepoint:${framework}:frame:deferred`, settings.globalPreference);
            return;
          }
          if (outcome === 'privacy_manager') {
            observer.disconnect();
            await applySourcepointUsNatPrivacyChoice(true, site, settings.globalPreference);
            return;
          }
        }
        if (await waitForDismissal()) {
          observer.disconnect();
          await report(site, `sourcepoint:${framework}:frame:deferred`, settings.globalPreference);
          return;
        }
      }
      if (!accept && openPrivacyManager()) {
        observer.disconnect();
      }
    });
    const root = document.body ?? document.documentElement;
    if (!root) return;
    observer.observe(root, {
      childList: true, subtree: true,
    });
    setTimeout(() => observer.disconnect(), 10000);
  }

  async function handleGuardianAcceptFrame(site, preference) {
    if (site === 'support.theguardian.com' && isGuardianSupportPrivacyManagerOpen()) {
      if (await applyGuardianSupportPrivacyChoice(false, site, preference, 'accept')) {
        return true;
      }
    }

    const selectors = site === 'support.theguardian.com'
      ? [
          '.sp_choice_type_11',
          '.gu-close-btn',
          'button[title="Closer"]',
          'button[aria-label="Closer"]',
          'button[title*="Close" i]',
          'button[aria-label*="Close" i]',
          '.message-close-btn',
          'text:closer',
          'text:close',
        ]
      : ['.sp_choice_type_11', '.gu-close-btn', 'button[title="Closer"]', 'button[aria-label="Closer"]'];

    if (await clickGuardianMainWorldWhenReady(selectors, 10000)) {
      if (await waitForDismissal()) {
        await report(site, 'sourcepoint:guardian:accept_close_main_world', preference);
      }
      return true;
    }
    if (site === 'support.theguardian.com' && tryClick(selectors)) {
      if (await waitForDismissal()) {
        await report(site, 'sourcepoint:guardian:accept_close_frame', preference);
      }
      return true;
    }
    return false;
  }

  async function handleGuardianSupportRejectFrame(site, preference) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'EMC_EXECUTE_GUARDIAN_TOP_ACTION',
        action: 'guardian_support_reject',
      });
      if (response?.handled) {
        const outcome = await waitForGuardianSupportRejectTransition(7000);
        if (outcome === 'dismissed') {
          await report(site, 'sourcepoint:guardian:support_reject_top_api', preference);
          return true;
        }
      }
    } catch (_) {}

    const optOutSelectors = [
      '.gu-btn-dns',
      '.sp_choice_type_13',
      'button[title*="Do not sell or share" i]',
      'button[aria-label*="Do not sell or share" i]',
      'text:do not sell or share',
    ];

    if (isGuardianSupportPrivacyManagerOpen()) {
      if (await applyGuardianSupportPrivacyChoice(true, site, preference, 'reject')) {
        return true;
      }
      return false;
    }

    if (await clickGuardianMainWorldWhenReady(optOutSelectors, 5000)) {
      const outcome = await waitForGuardianSupportRejectTransition(6000);
      if (outcome === 'dismissed') {
        await report(site, 'sourcepoint:guardian:support_reject_frame', preference);
        return true;
      }
      if (outcome === 'privacy_manager') {
        return await applyGuardianSupportPrivacyChoice(true, site, preference, 'reject');
      }
      return false;
    }
    if (tryClick(optOutSelectors)) {
      const outcome = await waitForGuardianSupportRejectTransition(6000);
      if (outcome === 'dismissed') {
        await report(site, 'sourcepoint:guardian:support_reject_frame', preference);
        return true;
      }
      if (outcome === 'privacy_manager') {
        return await applyGuardianSupportPrivacyChoice(true, site, preference, 'reject');
      }
      return false;
    }
    return false;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  // Build querySelectorAll-compatible selectors that match button text.
  // We check textContent manually since CSS has no :has-text().
  function textSels(phrases) {
    // Return marker strings prefixed with "text:" — resolved in tryClick.
    return phrases.map(p => `text:${p}`);
  }

  function findClickTarget(selectors) {
    for (const sel of selectors) {
      let el;
      if (sel.startsWith('text:')) {
        el = findByText(sel.slice(5));
      } else {
        el = document.querySelector(sel);
      }
      if (el && isVisible(el)) return el;
    }
    return null;
  }

  function tryClick(selectors) {
    const el = findClickTarget(selectors);
    if (!el) return false;
    dispatchSyntheticClick(el);
    return true;
  }

  function hasVisibleSelector(selectors) {
    return selectors.some((sel) => {
      const el = sel.startsWith('text:') ? findByText(sel.slice(5)) : document.querySelector(sel);
      return el && isVisible(el);
    });
  }

  async function waitForAny(selectors, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    if (hasVisibleSelector(selectors)) return true;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      if (hasVisibleSelector(selectors)) return true;
    }
    return false;
  }

  function isPrivacyManagerFrame() {
    return /privacy-manager/.test(window.location.href) ||
      document.querySelector('.sp_choice_type_SAVE_AND_EXIT, button[title*="Save and Close" i], button[aria-label*="Save and Close" i], [role="switch"][aria-checked], button.pm-toggle, .pm-switch[aria-checked]') !== null;
  }

  function openPrivacyManager() {
    const trigger = document.querySelector('.sp_choice_type_12');
    if (trigger && isVisible(trigger)) {
      dispatchSyntheticClick(trigger);
      return true;
    }
    return false;
  }

  async function runGuardianMainWorldClick(selectors) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'EMC_EXECUTE_FRAME_CLICK',
        selectors,
      });
      return Boolean(response?.clicked);
    } catch (_) {
      return false;
    }
  }

  async function clickGuardianMainWorldWhenReady(selectors, timeoutMs = 5000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (await runGuardianMainWorldClick(selectors)) return true;
      await sleep(200);
    }
    return false;
  }

  async function waitForGuardianSupportPrivacyManager(timeoutMs = 5000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (isGuardianSupportPrivacyManagerOpen()) return true;
      if (await waitForDismissal(200)) return false;
      await sleep(200);
    }
    return false;
  }

  async function waitForGuardianSupportRejectTransition(timeoutMs = 6000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (isGuardianSupportPrivacyManagerOpen()) return 'privacy_manager';
      if (await waitForDismissal(200)) return 'dismissed';
      await sleep(200);
    }
    return 'timeout';
  }

  async function waitForUsNatTransition(timeoutMs = 6000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (isSourcepointUsNatPrivacyManagerOpen()) return 'privacy_manager';
      if (await waitForDismissal(200)) return 'dismissed';
      await sleep(200);
    }
    return 'timeout';
  }

  function isGuardianSupportPrivacyManagerVisible(selectors = []) {
    return selectors.some((sel) => {
      const el = sel.startsWith('text:') ? findByText(sel.slice(5)) : document.querySelector(sel);
      return el && isVisible(el);
    });
  }

  function guardianSupportSwitchSelectors() {
    return [
      '.switch-container button.pm-toggle',
      'button.pm-toggle[role="switch"]',
      'button.pm-toggle',
      '.pm-us button[role="switch"]',
      '.pm-us [role="switch"]',
      'button[role="switch"][aria-checked]',
    ];
  }

  function guardianSupportSwitchTargetSelectors(enabled) {
    if (enabled) {
      return [
        '.pm-us button.pm-toggle span.on',
        'button.pm-toggle span.on',
        '.pm-toggle span.on',
      ];
    }
    return [
      '.pm-us button.pm-toggle span.off',
      'button.pm-toggle span.off',
      '.pm-toggle span.off',
    ];
  }

  function guardianSupportSaveSelectors() {
    return [
      '.sp_choice_type_SE',
      '.sp_choice_type_SAVE_AND_EXIT',
      'button[title*="Save and close" i]',
      'button[aria-label*="Save and close" i]',
      'text:save and close',
    ];
  }

  function isGuardianSupportPrivacyManagerOpen() {
    return isGuardianSupportPrivacyManagerVisible([
      ...guardianSupportSwitchSelectors(),
      ...guardianSupportSaveSelectors(),
    ]);
  }

  function getGuardianSupportSwitchState() {
    const toggle = guardianSupportSwitchSelectors()
      .map((selector) => document.querySelector(selector))
      .find((el) => el && isVisible(el));
    if (!toggle) return null;
    return toggle.getAttribute('aria-checked') === 'true';
  }

  function sourcepointUsNatSwitchSelectors() {
    return [
      '.switch-container button.pm-toggle',
      'button.pm-toggle[role="switch"]',
      'button.pm-toggle',
      '.pm-us button[role="switch"]',
      '.pm-us [role="switch"]',
      '.pm-switch[role="switch"]',
      '.pm-switch[aria-checked]',
      'button[role="switch"][aria-checked]',
      'input[type="checkbox"][id*="sale" i]',
      'input[type="checkbox"][name*="sale" i]',
      'input[type="checkbox"][id*="share" i]',
      'input[type="checkbox"][name*="share" i]',
    ];
  }

  function sourcepointUsNatSwitchTargetSelectors(enabled) {
    if (enabled) {
      return [
        '.pm-us button.pm-toggle span.on',
        'button.pm-toggle span.on',
        '.pm-toggle span.on',
      ];
    }
    return [
      '.pm-us button.pm-toggle span.off',
      'button.pm-toggle span.off',
      '.pm-toggle span.off',
    ];
  }

  function sourcepointUsNatSaveSelectors() {
    return [
      '.sp_choice_type_SE',
      '.sp_choice_type_SAVE_AND_EXIT',
      'button[title*="Save and close" i]',
      'button[aria-label*="Save and close" i]',
      'button[title*="Confirm My Choice" i]',
      'button[aria-label*="Confirm My Choice" i]',
      'text:save and close',
      'text:save',
      'text:confirm my choice',
    ];
  }

  function isSourcepointUsNatPrivacyManagerOpen() {
    return isGuardianSupportPrivacyManagerVisible([
      ...sourcepointUsNatSwitchSelectors(),
      ...sourcepointUsNatSaveSelectors(),
    ]);
  }

  function getSourcepointUsNatSwitchState() {
    const toggle = sourcepointUsNatSwitchSelectors()
      .map((selector) => document.querySelector(selector))
      .find((el) => el && isVisible(el));
    if (!toggle) return null;
    if (toggle.getAttribute('aria-checked') != null) {
      return toggle.getAttribute('aria-checked') === 'true';
    }
    if ('checked' in toggle) {
      return Boolean(toggle.checked);
    }
    return null;
  }

  async function setSourcepointUsNatSwitchState(enabled) {
    const current = getSourcepointUsNatSwitchState();
    if (current === null) return { applied: false, changed: false };
    if (current === enabled) return { applied: true, changed: false };

    const target = sourcepointUsNatSwitchTargetSelectors(enabled)
      .map((selector) => document.querySelector(selector))
      .find((el) => el && isVisible(el));
    if (target) {
      dispatchSyntheticClick(target);
      await sleep(250);
      return {
        applied: getSourcepointUsNatSwitchState() === enabled,
        changed: true,
      };
    }

    const toggle = sourcepointUsNatSwitchSelectors()
      .map((selector) => document.querySelector(selector))
      .find((el) => el && isVisible(el));
    if (!toggle) return { applied: false, changed: false };

    dispatchSyntheticClick(toggle);
    await sleep(250);
    return {
      applied: getSourcepointUsNatSwitchState() === enabled,
      changed: true,
    };
  }

  async function applySourcepointUsNatPrivacyChoice(enable, site, preference) {
    const switchState = await setSourcepointUsNatSwitchState(enable);
    if (!switchState.applied) return false;

    const saveSelectors = sourcepointUsNatSaveSelectors();
    if (tryClick(saveSelectors) && await waitForDismissal(5000)) {
      if (switchState.changed) {
        await report(site, `sourcepoint:usnat:${enable ? 'opt_out' : 'save_close'}`, preference);
      }
      return true;
    }
    return false;
  }

  async function setGuardianSupportSwitchState(enabled) {
    const current = getGuardianSupportSwitchState();
    if (current === null) return { applied: false, changed: false };
    if (current === enabled) return { applied: true, changed: false };

    const targetSelectors = guardianSupportSwitchTargetSelectors(enabled);
    if (await clickGuardianMainWorldWhenReady(targetSelectors, 3000)) {
      await sleep(250);
      return {
        applied: getGuardianSupportSwitchState() === enabled,
        changed: true,
      };
    }
    if (tryClick(targetSelectors)) {
      await sleep(250);
      return {
        applied: getGuardianSupportSwitchState() === enabled,
        changed: true,
      };
    }

    const fallbackSelectors = guardianSupportSwitchSelectors();
    if (await clickGuardianMainWorldWhenReady(fallbackSelectors, 3000)) {
      await sleep(250);
      return {
        applied: getGuardianSupportSwitchState() === enabled,
        changed: true,
      };
    }
    if (tryClick(fallbackSelectors)) {
      await sleep(250);
      return {
        applied: getGuardianSupportSwitchState() === enabled,
        changed: true,
      };
    }
    return { applied: false, changed: false };
  }

  async function applyGuardianSupportPrivacyChoice(reject, site, preference, mode) {
    const switchState = await setGuardianSupportSwitchState(reject);
    if (!switchState.applied) return false;

    const saveSelectors = guardianSupportSaveSelectors();
    if (await clickGuardianMainWorldWhenReady(saveSelectors, 5000) && await waitForDismissal(5000)) {
      if (switchState.changed) {
        await report(site, `sourcepoint:guardian:support_${mode}_save_close`, preference);
      }
      return true;
    }
    if (tryClick(saveSelectors) && await waitForDismissal(5000)) {
      if (switchState.changed) {
        await report(site, `sourcepoint:guardian:support_${mode}_save_close_frame`, preference);
      }
      return true;
    }
    return false;
  }

  function effectiveAccept(settings) {
    if (settings.globalPreference === 'accept_all') return true;
    if (settings.globalPreference === 'reject_all') return false;
    // custom mode: treat as accept if user accepted the uncategorized bucket
    const cp = settings.categoryPreferences ?? {};
    return cp.uncategorized === 'accept';
  }

  function effectiveUsNatOptOut(settings) {
    const cp = settings.categoryPreferences ?? {};
    if ('ccpaDoNotSell' in cp) return cp.ccpaDoNotSell !== false;
    return settings.globalPreference !== 'accept_all';
  }

  async function handleFTFrame(settings, site) {
    const accept = effectiveAccept(settings);

    if (accept) {
      if (await clickFTAction(isFTPrivacyManagerFrame() ? FT_PM_ACCEPT : FT_NOTICE_ACCEPT, 3000, 150)) {
        await waitForFTProgress(800);
        await report(site, 'sourcepoint:ft:accept_all', settings.globalPreference);
        return true;
      }
      return false;
    }

    if (!isFTPrivacyManagerFrame()) {
      if (!openFTPrivacyManager()) return false;
      if (!(await waitForFTPrivacyManager())) return false;
    }

    if (await rejectFTFromPrivacyManager()) {
      return true;
    }
    return false;
  }

  function isFTPrivacyManagerFrame() {
    return document.querySelector('.pm-switch, .sp_choice_type_SAVE_AND_EXIT, button[title*="Save and Close" i], button[aria-label*="Save and Close" i]') !== null;
  }

  function isPotentialFTShell(site) {
    return site === 'www.ft.com' &&
      /consent-manager\.ft\.com/.test(window.location.hostname) &&
      /message_id=/.test(window.location.href);
  }

  async function waitForFTFrameReady(timeoutMs = 12000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (
        findByText('accept') ||
        findByText('manage cookies') ||
        document.querySelector('.message-component, .sp_choice_type_11, .sp_choice_type_12, .pm-switch')
      ) {
        return true;
      }
      await sleep(250);
    }
    return false;
  }

  function openFTPrivacyManager() {
    return tryClick(FT_NOTICE_MANAGE);
  }

  async function waitForFTPrivacyManager(timeoutMs = 5000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (isFTPrivacyManagerFrame()) return true;
      await sleep(200);
    }
    return false;
  }

  async function rejectFTFromPrivacyManager() {
    await clickFTAction(FT_PM_REJECT, 1200, 120);
    await disableFTLegitimateInterestSelections();
    await sleep(120);

    if (await clickFTAction(FT_PM_SAVE, 2500, 120)) {
      await waitForFTProgress(800);
      await report(referrerHost(), 'sourcepoint:ft:reject_all', 'reject_all');
      return true;
    }

    return false;
  }

  async function disableFTLegitimateInterestSelections() {
    for (const category of ['Purposes', 'Features', 'Site Vendors']) {
      await selectFTPrivacyManagerTab(category);
      await sleep(120);
      await selectFTTypeToggle('Legitimate Interest');
      await sleep(120);
      expandFTAccordions();
      await sleep(120);
      toggleOffFTSwitches();
      await sleep(120);
    }
  }

  function expandFTAccordions() {
    let expanded = false;
    const accordions = Array.from(document.querySelectorAll('button.accordion, .accordion[role="button"], .accordion'));
    for (const accordion of accordions) {
      if (!isVisible(accordion)) continue;
      if (accordion.getAttribute('aria-expanded') !== 'false') continue;
      dispatchSyntheticClick(accordion);
      expanded = true;
    }
    return expanded;
  }

  function toggleOffFTSwitches() {
    let toggled = false;
    const switches = Array.from(document.querySelectorAll('.pm-switch[role="switch"], .pm-switch[aria-checked], button.pm-switch, [role="switch"].pm-switch'));
    for (const toggle of switches) {
      if (!isVisible(toggle)) continue;
      if (toggle.getAttribute('aria-checked') === 'true' || toggle.classList.contains('checked')) {
        dispatchSyntheticClick(toggle);
        toggled = true;
      }
    }
    return toggled;
  }

  async function selectFTPrivacyManagerTab(label) {
    const tab = findFTControl(label, '.pm-tabs');
    if (!tab) return false;
    const selected = tab.getAttribute('aria-selected') === 'true' || /\bactive\b/i.test(tab.className);
    if (selected) return true;
    dispatchSyntheticClick(tab);
    return true;
  }

  async function selectFTTypeToggle(label) {
    const toggle = findFTControl(label, '.pm-type-toggle');
    if (!toggle) return false;
    const selected = toggle.getAttribute('aria-selected') === 'true' ||
      toggle.getAttribute('aria-pressed') === 'true' ||
      /\bactive\b/i.test(toggle.className);
    if (selected) return true;
    dispatchSyntheticClick(toggle);
    return true;
  }

  function findFTControl(label, scopeSelector) {
    const scope = scopeSelector ? document.querySelector(scopeSelector) : document;
    if (!scope) return null;
    const lc = label.toLowerCase();
    for (const el of scope.querySelectorAll('button, [role="tab"], [role="button"], a, div')) {
      const text = el.textContent?.trim().toLowerCase() ?? '';
      if (!text) continue;
      if (text === lc || text.includes(lc)) return el;
    }
    return null;
  }

  async function waitForFTProgress(timeoutMs = 1000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (ftConsentPersisted() || ftControlsGone()) return true;
      await sleep(200);
    }
    return false;
  }

  async function clickFTAction(selectors, timeoutMs = 3000, intervalMs = 150) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (ftConsentPersisted() || ftControlsGone()) return true;
      if (tryClick(selectors)) {
        return true;
      }
      await sleep(intervalMs);
      if (ftConsentPersisted() || ftControlsGone()) return true;
    }
    return false;
  }

  function ftConsentPersisted() {
    try {
      if (document.cookie.includes('FTConsent=')) return true;
    } catch (_) {}
    try {
      if (localStorage.getItem('__lastFtc')) return true;
    } catch (_) {}
    try {
      const raw = localStorage.getItem('ft_sp_marketing_optout');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.usnat || parsed?.usca) return true;
      }
    } catch (_) {}
    return false;
  }

  function ftControlsGone() {
    return ![
      '.message-component',
      '.sp_choice_type_11',
      '.sp_choice_type_12',
      '.sp_choice_type_ACCEPT_ALL',
      '.sp_choice_type_REJECT_ALL',
      '.sp_choice_type_SAVE_AND_EXIT',
      '.pm-switch',
      'button[title="Accept"]',
      'button[aria-label="Accept"]',
      'button[title*="Manage Cookies" i]',
      'button[aria-label*="Manage Cookies" i]',
      'button[title*="Save and Close" i]',
      'button[aria-label*="Save and Close" i]',
    ].some((sel) => {
      const el = document.querySelector(sel);
      return el && isVisible(el);
    });
  }

  async function rejectFromPrivacyManager() {
    // The privacy manager's purpose list (bulk reject-all button, or the
    // per-category pur-buttons-container rows) can still be loading/rendering
    // when this frame's content script first runs — wait for one of them
    // before deciding there's nothing to click.
    await waitForAny([
      '.sp_choice_type_REJECT_ALL',
      'button[data-sp-action="REJECT_ALL"]',
      '.pur-buttons-container',
    ], 6000);

    // Most Sourcepoint privacy managers expose a single bulk reject-all control.
    let rejectClicked = tryClick([
      '.sp_choice_type_REJECT_ALL',
      'button[data-sp-action="REJECT_ALL"]',
    ]);
    if (rejectClicked) {
      await new Promise((resolve) => setTimeout(resolve, 120));
    } else {
      // Some builds (e.g. spiegel.de as of August 2026) present each purpose as its
      // own Accept/Reject pair instead of a bulk control — reject every row.
      rejectClicked = await rejectAllPrivacyManagerCategories();
      if (!rejectClicked) {
        // Last-resort single-match text fallback for any other layout not covered above.
        rejectClicked = tryClick(['text:reject all', 'text:decline all', 'text:refuse all', 'text:reject']);
        if (rejectClicked) {
          await new Promise((resolve) => setTimeout(resolve, 120));
        }
      }
    }

    // Never save if nothing was actually rejected — that would silently persist
    // whatever the page's default (typically accept-leaning) state is and still
    // report a successful reject_all.
    if (!rejectClicked) return false;

    const saveButton = document.querySelector('.sp_choice_type_SAVE_AND_EXIT');
    return Boolean(saveButton && isVisible(saveButton));
  }

  // Clicks Save and Exit without waiting to confirm dismissal afterward — saving
  // can trigger a full page reload (confirmed on spiegel.de), which can destroy
  // this frame's execution context mid-wait. The caller reports success before
  // calling this, once rejection + a genuinely visible Save control are both
  // confirmed, since that confirmation can't rely on anything after the click.
  function clickPrivacyManagerSaveAndExit() {
    const saveButton = document.querySelector('.sp_choice_type_SAVE_AND_EXIT');
    if (saveButton && isVisible(saveButton)) {
      dispatchSyntheticClick(saveButton);
    }
  }

  // Rejects every purpose row in Sourcepoint privacy managers that use per-category
  // Accept/Reject button pairs (class="pur-buttons-container") instead of a single
  // bulk reject-all control. The Reject button is consistently the last button in
  // each pair — confirmed structural, not text-based, so this works regardless of
  // the page's language (Sourcepoint renders "Accept"/"Reject", "Zustimmen"/
  // "Ablehnen", etc. with identical markup/ordering, only the label text differs).
  async function rejectAllPrivacyManagerCategories() {
    const containers = document.querySelectorAll('.pur-buttons-container');
    if (!containers.length) return false;

    let rejectedAny = false;
    for (const container of containers) {
      const buttons = container.querySelectorAll('button');
      const rejectButton = buttons[buttons.length - 1];
      if (rejectButton && isVisible(rejectButton)) {
        dispatchSyntheticClick(rejectButton);
        rejectedAny = true;
        await new Promise((resolve) => setTimeout(resolve, 80));
      }
    }
    return rejectedAny;
  }

  async function waitForDismissal(timeoutMs = 4000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const visibleControls = [
        '[id^="sp_message_container"]',
        '[id^="sp_message_iframe"]',
        '[class*="sp_message_container"]',
        '.sp_choice_type_REJECT_ALL',
        '.sp_choice_type_ACCEPT_ALL',
        '.sp_choice_type_11',
        '.sp_choice_type_12',
        '.sp_choice_type_SAVE_AND_EXIT',
        '.message-component',
      ].some((sel) => {
        const el = document.querySelector(sel);
        return el && isVisible(el);
      });

      if (!visibleControls) return true;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return false;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function findByText(phrase) {
    const lc = phrase.toLowerCase();
    for (const el of document.querySelectorAll('button, [role="button"], a')) {
      if (el.textContent.trim().toLowerCase().includes(lc) && isVisible(el)) return el;
    }
    return null;
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

  function isVisible(el) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
  }

  function referrerInfo() {
    try {
      const ancestor = window.location.ancestorOrigins?.[0];
      if (ancestor) {
        const url = new URL(ancestor);
        return { host: url.hostname, path: url.pathname || '/' };
      }
    } catch (_) {}
    try {
      const url = new URL(document.referrer);
      return { host: url.hostname, path: url.pathname || '/' };
    } catch (_) {
      return { host: 'unknown', path: '/' };
    }
  }

  function referrerHost() {
    return referrerInfo().host;
  }

  function isCurrentGuardianAccessibilityPage() {
    try {
      return GUARDIAN_HOSTS.has(window.location.hostname) &&
        window.location.pathname === GUARDIAN_ACCESSIBILITY_PATH;
    } catch (_) {
      return false;
    }
  }

  async function isDisabledForTopSite() {
    const domain = referrerHost();
    if (!domain || domain === 'unknown') return false;
    const { siteOverrides } = await chrome.storage.local.get({ siteOverrides: {} });
    return Boolean(siteOverrides?.[domain]?.disabled);
  }

  async function isManualConsentOpenSuppressed(site) {
    try {
      const result = await chrome.storage.local.get({ [MANUAL_CONSENT_OPEN_KEY]: null });
      const payload = result?.[MANUAL_CONSENT_OPEN_KEY];
      if (!payload?.timestamp || Date.now() - payload.timestamp >= MANUAL_CONSENT_SUPPRESS_MS) {
        await chrome.storage.local.remove(MANUAL_CONSENT_OPEN_KEY);
        return false;
      }
      const currentHost = window.location.hostname;
      return !payload.site || payload.site === site || payload.site === currentHost;
    } catch (_) {
      return false;
    }
  }

  async function report(site, method, preference) {
    if (await isManualConsentOpenSuppressed(site)) return;
    startFrameCooldown(site, preference);
    try {
      const response = await chrome.runtime.sendMessage({ type: 'ACTION_FIRED', site, method, preference });
      if (response?.loopDetected || response?.autoDisabled || response?.disabled) {
        startFrameCooldown(site, preference, FRAME_COOLDOWN_MS * 3);
      }
    } catch (_) {}
  }

  function frameCooldownKey(site, preference) {
    return `${FRAME_RUN_GUARD_PREFIX}:${site}:${preference}`;
  }

  function isFrameCoolingDown(site, preference) {
    try {
      const until = Number(sessionStorage.getItem(frameCooldownKey(site, preference)) || '0');
      return until > Date.now();
    } catch (_) {
      return false;
    }
  }

  function startFrameCooldown(site, preference, durationMs = FRAME_COOLDOWN_MS) {
    try {
      sessionStorage.setItem(frameCooldownKey(site, preference), String(Date.now() + durationMs));
    } catch (_) {}
  }

  function hasConsentSignals() {
    return hasConsentKeywords() || document.querySelector('[data-sp-action], [class*="sp_choice_type"]') !== null;
  }

  function hasConsentKeywords() {
    const text = document.body?.innerText?.toLowerCase() ?? '';
    return /cookie|cookies|privacy|consent|personal information|do not sell|partners store and access|vendor/i.test(text);
  }

  run();
})();
