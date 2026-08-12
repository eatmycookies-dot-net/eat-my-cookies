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
  const SP_VISIBLE_CONSENT_SELECTORS = [
    '[id^="sp_message_container"]',
    '[id^="sp_message_iframe"]',
    '[class*="sp_message_container"]',
    '.sp_choice_type_REJECT_ALL',
    '.sp_choice_type_ACCEPT_ALL',
    '.sp_choice_type_11',
    '.sp_choice_type_12',
    '.sp_choice_type_SAVE_AND_EXIT',
    '.message-component',
  ];

  // Mirrors cmp-api-handler.js's userClickedRecently() — used below so a real
  // user manually dismissing a banner during the observation window isn't
  // misattributed to us as a silent Sourcepoint-suppressed success.
  let _lastTrustedClick = 0;
  document.addEventListener('click', (e) => {
    if (e.isTrusted) _lastTrustedClick = Date.now();
  }, { capture: true, passive: true });
  function userClickedRecently(withinMs = 15000) {
    return _lastTrustedClick > 0 && Date.now() - _lastTrustedClick < withinMs;
  }

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

  const SP_SHELL_ONLY_SELECTORS = ['[id^="sp_message_container"]', '[id^="sp_message_iframe"]'];

  // See the call site in run() for the full explanation. Backs off entirely
  // (no report) the moment isSPFrame() becomes true at any point, handing
  // off to the normal detection/click/report flow below — this only ever
  // reports for the specific case where a bare shell appeared and vanished
  // without isSPFrame()'s deeper markers ever appearing at all.
  async function watchForSilentTopFrameSuppression(site) {
    const deadline = Date.now() + 8000;
    let sawShell = false;
    while (Date.now() < deadline) {
      if (isSPFrame()) return;
      const visibleNow = hasVisibleSelector(SP_SHELL_ONLY_SELECTORS);
      if (visibleNow) sawShell = true;
      if (sawShell && !visibleNow) {
        // Confirm this is a real, stable disappearance rather than a brief
        // reflow/transition flicker before Sourcepoint finishes rendering an
        // actual interactive banner. Confirmed live on spiegel.de: a shell
        // flicker briefly false-triggered this before the real accept
        // banner (and its own dedicated, more specific report) had rendered,
        // and this watcher's less-specific report won the background's
        // dedup race against the correct one.
        let confirmed = true;
        for (let i = 0; i < 3; i++) {
          await new Promise((resolve) => setTimeout(resolve, 300));
          if (isSPFrame() || hasVisibleSelector(SP_SHELL_ONLY_SELECTORS)) {
            confirmed = false;
            break;
          }
        }
        if (!confirmed) continue;

        if (userClickedRecently()) return;
        if (await isDisabledForTopSite()) return;
        if (await isManualConsentOpenSuppressed(site)) return;
        const settings = await chrome.storage.sync.get({ globalPreference: 'reject_all', onboardingComplete: false });
        if (!settings.onboardingComplete) return;
        if (isFrameCoolingDown(site, settings.globalPreference)) return;
        // The real click-based report (if one fires) is sent from inside the
        // cross-origin SP iframe — a different frame/document than this
        // top-frame watcher, so the background's per-document dedup key
        // never matches between the two and can't suppress a duplicate here.
        // Confirmed live on spiegel.de's accept flow: without this check,
        // both reports landed and totalActionsCount was inflated by one.
        // Reading the already-recorded stats (rather than adding new
        // cross-frame messaging) is the smallest fix for that gap. Compares
        // against window.location.hostname, not the `site` param
        // (referrerHost()'s value) — for a direct top-level navigation
        // referrerHost() returns 'unknown' (no document.referrer or
        // ancestorOrigins), which background normalizes to the real
        // hostname before storing, so comparing the raw 'unknown' against
        // the normalized stored value always missed the duplicate. This
        // function only ever runs in the top frame, so location.hostname is
        // reliably the real site here.
        if (await hasRecentActivityFor(window.location.hostname, settings.globalPreference)) return;
        await report(site, 'sourcepoint:silent_shell', settings.globalPreference);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  async function hasRecentActivityFor(hostname, preference, withinMs = 10000) {
    try {
      const { stats } = await chrome.storage.local.get({ stats: null });
      const recent = stats?.recentActivity?.[0];
      if (!recent || recent.site !== hostname || recent.preference !== preference) return false;
      return Date.now() - new Date(recent.timestamp).getTime() < withinMs;
    } catch (_) {
      return false;
    }
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

    // Sourcepoint's own loader can render a bare sp_message_container/iframe
    // shell in the TOP frame and then remove it within ~1s, without ever
    // populating the sp_choice_type/data-sp-action markup isSPFrame() below
    // requires. Confirmed live on zeit.de: tcf-interceptor.js's
    // __tcfapiLocator bridge (MAIN world, document_start) lets the nested
    // cross-origin consent iframe discover our already-answered TCF signal
    // before Sourcepoint decides whether to render an interactive banner at
    // all, so it renders nothing and isSPFrame() below never returns true —
    // run() would otherwise exit at its retry-loop timeout having detected,
    // and reported, nothing, even though the shell's own appear-then-vanish-
    // within-1s lifecycle (no button ever offered) is real, observable
    // evidence that Sourcepoint deferred to our earlier signal. Only run in
    // the top frame: nested SP iframes are cross-origin, so this frame can
    // see the <iframe> element itself (same-origin DOM) but not what is or
    // isn't inside it.
    if (window === window.top) {
      void watchForSilentTopFrameSuppression(site);
    }

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
        await handleGuardianAcceptFrame(site, settings.globalPreference, effectiveUsNatOptOut(settings));
        return;
      }
      if (site === 'support.theguardian.com') {
        await handleGuardianSupportRejectFrame(site, settings.globalPreference);
        return;
      }
      // www.theguardian.com has no free reject flow wired up here (see the
      // MAIN-world-only comments above handleGuardianAcceptFrame). Some
      // editions/sections (confirmed live on theguardian.com/europe) go
      // further and only offer "Accept all" or a paid subscription to
      // reject — the only "reject"-labeled control present is the
      // sp_choice_type_9 paid upsell that looksLikePaidAction() already
      // refuses to click. Silently doing nothing every page load leaves the
      // user with no explanation; report it the same honest way
      // ACCEPT_OR_WARN_SITES does for other consent-or-pay walls so it
      // shows up in the popup instead of looking like the extension is
      // simply broken here.
      if (site === 'www.theguardian.com' && guardianRejectIsPaidWallOnly()) {
        await reportGuardianPaidWallUnsupported(site);
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

    // Complements watchForSilentTopFrameSuppression() (see run()) for the case
    // where isSPFrame() DID pass (a real interactive banner was detected) but
    // no button was ever successfully clicked, and the surface disappeared on
    // its own anyway — e.g. an auto-timeout dismissal or a selector mismatch.
    // Unlike an actual click, this path never fires Sourcepoint's own
    // postRejectAll/postCustom POST to their backend (see the file header
    // comment), so it cannot itself prove the choice was persisted with
    // Sourcepoint or its vendors, only that the on-page UI resolved without
    // our intervention. Gated on having genuinely seen a visible consent
    // surface first, and on no trusted click having happened, so a real user
    // manually dismissing the banner themselves isn't misattributed to us.
    let sawVisibleSurface = hasVisibleSelector(SP_VISIBLE_CONSENT_SELECTORS);

    // Buttons hydrate asynchronously in some SP builds — watch the DOM.
    const observer = new MutationObserver(async () => {
      if (!sawVisibleSurface && hasVisibleSelector(SP_VISIBLE_CONSENT_SELECTORS)) {
        sawVisibleSurface = true;
      }
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

    // Runs independently of the observer above (which only reacts to DOM
    // mutations — SP can finish tearing its own UI down in one mutation burst,
    // after which nothing further changes for the observer to react to).
    // Polls every 250ms instead of waiting out the full 10s button-hydration
    // budget in one shot: validate.js's default handleWaitMs is 6s, and a real
    // user checking the popup right after the banner vanishes shouldn't have
    // to wait 10s for the counter to catch up. Capped below 10s so it can't
    // outlive the observer's own window.
    const deadline = Date.now() + 9000;
    while (Date.now() < deadline) {
      const visibleNow = hasVisibleSelector(SP_VISIBLE_CONSENT_SELECTORS);
      if (visibleNow) sawVisibleSurface = true;
      if (sawVisibleSurface && !visibleNow) {
        if (!userClickedRecently()) {
          await report(site, `sourcepoint:${framework}:silent`, settings.globalPreference);
        }
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  async function handleGuardianAcceptFrame(site, preference, wantsUsNatOptOut = false) {
    // Hybrid preference (accept_all + ccpaDoNotSell=true): the plain
    // close/accept button below never touches the USNat "Do not sell or
    // share" toggle at all, so a user who wants everything else accepted but
    // still wants to stay opted out of sale would silently end up fully
    // opted in. Confirmed live: with this preference combination, only the
    // toggle-aware save path below resolves the panel — the close-button
    // path leaves it open. The underlying .pm-toggle/switch-container markup
    // is the same on both Guardian hosts (confirmed live on
    // www.theguardian.com/us), unlike the plain-accept path below, which
    // stays support.theguardian.com-only since it was never shown to fail on
    // www.theguardian.com.
    if (wantsUsNatOptOut && isGuardianSupportPrivacyManagerOpen()) {
      if (await applyGuardianSupportPrivacyChoice(true, site, preference, 'accept_optout')) {
        return true;
      }
    }

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

  // Some Sourcepoint consent-or-pay walls offer a "reject" choice that is
  // actually a paid subscription, not a free opt-out — confirmed live on
  // theguardian.com/europe: the button's own title/aria-label is literally
  // "Reject all and subscribe" for a €5/month product, using a distinct
  // sp_choice_type (9) instead of the usual REJECT_ALL/13. That's exactly
  // the kind of text our existing generic `[aria-label*="Reject All" i]` /
  // `button[title*="Reject All" i]` fallback selectors are designed to
  // catch — a plain substring match can't tell it apart from a genuine free
  // reject button, and confirmed live that it does match. Must never
  // auto-click anything whose own text signals a paid/subscription action —
  // this cannot be allowed to trigger a purchase on the user's behalf, on
  // this or any other Sourcepoint site with a similarly-worded upsell.
  const PAID_ACTION_TEXT_RE = /\bsubscri(?:be|ption|ing)\b|\bpay\b|\bpaid\b|€\s?\d|\$\s?\d|£\s?\d|\bper\s+month\b|\/\s*month\b|\bpremium\b/i;

  function looksLikePaidAction(el) {
    const text = `${el.textContent || ''} ${el.getAttribute('aria-label') || ''} ${el.getAttribute('title') || ''}`;
    return PAID_ACTION_TEXT_RE.test(text);
  }

  function findClickTarget(selectors) {
    for (const sel of selectors) {
      let el;
      if (sel.startsWith('text:')) {
        el = findByText(sel.slice(5));
      } else {
        el = document.querySelector(sel);
      }
      if (el && isVisible(el) && !looksLikePaidAction(el)) return el;
    }
    return null;
  }

  function tryClick(selectors) {
    const el = findClickTarget(selectors);
    if (!el) return false;
    dispatchSyntheticClick(el);
    return true;
  }

  // Same lookup as findClickTarget but without the paid-action filter, so
  // callers can tell "no reject control at all" apart from "a reject
  // control exists but it's the paid upsell" — the latter is what we want
  // to report as an honest unsupported-here state instead of silently
  // never handling the page.
  function findRawCandidate(selectors) {
    for (const sel of selectors) {
      const el = sel.startsWith('text:') ? findByText(sel.slice(5)) : document.querySelector(sel);
      if (el && isVisible(el)) return el;
    }
    return null;
  }

  function guardianRejectIsPaidWallOnly() {
    const candidate = findRawCandidate(GDPR_REJECT);
    return !!candidate && looksLikePaidAction(candidate);
  }

  let guardianPaidWallReported = false;
  async function reportGuardianPaidWallUnsupported(site) {
    if (guardianPaidWallReported) return;
    guardianPaidWallReported = true;
    try {
      await chrome.runtime.sendMessage({
        type: 'REPORT_UNSUPPORTED_SITE',
        site,
        reason: 'This page currently only offers "Accept all" or a paid subscription to opt out of tracking. Eat My Cookies will not click a paid option on your behalf.',
        allowAcceptOverride: true,
      });
    } catch (_) {}
  }

  // Checks every element matching each selector, not just the first DOM match.
  // querySelector()'s first match isn't necessarily representative: Sourcepoint
  // privacy managers render one .pur-buttons-container per purpose row, and the
  // first one in DOM order can be a zero-size locked/essential row (confirmed
  // on spiegel.de: getBoundingClientRect() 0x0) even while every other row is
  // fully rendered and visible. Stopping at that first, unrepresentative match
  // made waitForAny() below report "not visible yet" for the entire purpose
  // list and poll its full timeout budget before proceeding, even though the
  // list had already rendered -- a multi-second delay attributed to nothing
  // (confirmed via a live MutationObserver: zero DOM activity for ~5.8s of a
  // ~6s reject/custom flow, immediately followed by every reject click landing
  // back-to-back once the timeout finally expired).
  function hasVisibleSelector(selectors) {
    return selectors.some((sel) => {
      if (sel.startsWith('text:')) return Boolean(findByText(sel.slice(5)));
      return Array.from(document.querySelectorAll(sel)).some((el) => isVisible(el));
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

  // waitForAny() above confirms at least one match exists, not that every
  // expected match has rendered -- Sourcepoint privacy managers can paint
  // purpose rows one at a time rather than all at once, especially now that
  // waitForAny() (via hasVisibleSelector()'s querySelectorAll fix) resolves
  // almost immediately on the first visible row instead of only after
  // burning several seconds of poll budget. Acting on an incomplete row set
  // silently skips whichever purposes hadn't painted yet -- confirmed live on
  // spiegel.de's Custom flow, where 3 of 7 purpose rows were still missing at
  // the moment the row list was read. Waits for the matched-element count to
  // stop changing across consecutive polls before treating the list as final.
  async function waitForStableCount(selector, timeoutMs = 3000) {
    const deadline = Date.now() + timeoutMs;
    let lastCount = -1;
    let stableStreak = 0;
    while (Date.now() < deadline) {
      const count = document.querySelectorAll(selector).length;
      if (count > 0 && count === lastCount) {
        stableStreak++;
        if (stableStreak >= 2) return count;
      } else {
        stableStreak = 0;
      }
      lastCount = count;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return document.querySelectorAll(selector).length;
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

  // Purpose rows on spiegel.de's privacy manager fade in with a staggered
  // per-row animation rather than all becoming interactive at once (confirmed
  // live: some rows' Reject buttons were still non-visible for over a
  // second after the row itself, and its sibling rows, already had visible
  // buttons). A single upfront wait for the purpose list to exist isn't
  // enough -- each row's own target button needs its own short visibility
  // wait immediately before it's clicked.
  async function waitForElementVisible(el, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    if (isVisible(el)) return true;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (isVisible(el)) return true;
    }
    return false;
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
    await waitForStableCount('.pur-buttons-container');
    const containers = document.querySelectorAll('.pur-buttons-container');
    if (!containers.length) return false;

    let rejectedAny = false;
    for (const container of containers) {
      const buttons = container.querySelectorAll('button');
      const rejectButton = buttons[buttons.length - 1];
      if (!rejectButton) continue;
      // Rows can fade in with a staggered per-row animation (confirmed live
      // on spiegel.de: some rows' buttons were still non-visible for over a
      // second after sibling rows' buttons already were) -- a single
      // isVisible() check here without a short wait/retry silently skips
      // whichever categories hadn't finished animating in yet, meaning
      // "reject everything" could previously leave some categories at
      // whatever their default state was instead of actually rejecting them.
      if (!(await waitForElementVisible(rejectButton, 2000))) continue;
      if (looksLikePaidAction(rejectButton)) continue;
      dispatchSyntheticClick(rejectButton);
      rejectedAny = true;
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    return rejectedAny;
  }

  async function waitForDismissal(timeoutMs = 4000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (!hasVisibleSelector(SP_VISIBLE_CONSENT_SELECTORS)) return true;
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
