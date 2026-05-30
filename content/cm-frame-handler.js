// ConsentManager.net frame handler — runs in ALL frames.
// DW and other sites using consentmanager.net render their banner inside a
// cross-origin iframe on delivery.consentmanager.net or *.consentmanager.net.
// This script detects those iframes and clicks the "only necessary" button.

(function () {
  const host = window.location.hostname;
  const DW_RETURN_DELAY_MS = 5000;
  const DW_RETURN_PENDING_KEY = '__emc_dw_return_pending__';
  const DW_RETURN_PENDING_TTL_MS = 20000;
  // Sites where cm-frame-handler must not run, because ConsentManager-like DOM
  // patterns appear incidentally and would produce false positives.
  // BBC and LA Times have dedicated document-start handlers (bbc-sourcepoint-hook.js,
  // bbc-preferences.js, latimes-privacy.js, latimes-interstitial.js) — those sites work.
  // zoom.com uses OneTrust on the top-level page; CM-like frames there are unrelated
  // and were causing false Accept All reports.
  // Forbes, Bloomberg, and NBC News also expose incidental CM-like frame patterns while their
  // actual consent flow lives in the top-level page; letting this handler run there
  // causes homepage redirects and duplicate/triplicate counts.
  const CM_FRAME_EXCLUDED_SITES = new Set([
    'www.bbc.com',
    'latimes.com',
    'www.latimes.com',
    'membership.latimes.com',
    'www.forbes.com',
    'www.bloomberg.com',
    'www.nbcnews.com',
    'www.zoom.com',
  ]);

  const REJECT_SELS = [
    '.cmptxt_btn_no2',
    '.cmpboxbtnno',          // "Only necessary" button
    '.cmpboxbtnreject',
    '.cmpboxbtnrejectcustomchoices',
    '#cmpbntnotxt',          // alternate text button
    'a[onclick*="necessary"]',
    'a[onclick*="setNecessary"]',
    'a[data-cmp-action*="necessary"]',
    'text:reject',
    'text:only necessary',
    'text:nur notwendige',
  ];

  const ACCEPT_SELS = [
    '.cmptxt_btn_yes2',
    '.cmpboxbtnyes',
    '.cmpboxbtnaccept',
    '.cmpboxbtnacceptcustomchoices',
    '.cmpboxbtnyescustomchoices:not(.cmptxt_btn_save2)',
    '#cmpbntyestxt',
    'a[data-cmp-action="acceptall"]',
    'a[onclick*="acceptAll"]',
    'text:agree',
    'text:accept',
  ];

  const SETTINGS_SELS = [
    '.cmpboxbtncustom',
    '#cmpbntcustomtxt',
    'a[data-cmp-action="customize"]',
    'text:settings',
    'text:manage options',
    'text:privacy settings',
  ];

  const SAVE_SELS = [
    '.cmptxt_btn_save2',
    '.cmpsave',
    '.cmpboxbtnsave',
    '.cmpboxbtnyescustomchoices.cmptxt_btn_save2',
    'button[data-cmp-action="save"]',
    'text:save selection',
    'text:save settings',
    'text:auswahl speichern',
  ];

  const CM_STRONG_SELECTORS = [
    '#cmpbox',
    '#cmpwrapper',
    '#cmpinlinepreferencesbox',
    '.cmpbox',
    '.cmpboxbtns',
    '.cmpboxbtnno',
    '.cmpboxbtnyes',
    '.cmpboxbtnreject',
    '.cmpboxbtnaccept',
    '.cmpboxbtnsave',
    '#cmpbntnotxt',
    '#cmpbntyestxt',
    '.cmptogglelink',
    '.cmptogglelinkspan',
    '[data-cmp-action]',
    '[data-cmp-purpose]',
  ];

  function hasStrongConsentManagerSignals() {
    if (Boolean(window.cmpmngr?.eventwrapper)) return true;
    return CM_STRONG_SELECTORS.some((sel) => deepQuerySelector(sel) !== null);
  }

  function isConsentManagerFrame() {
    return /consentmanager\.net|consensu\.org/.test(host) ||
      hasStrongConsentManagerSignals() ||
      /only necessary|necessary cookies|consentmanager/i.test(document.body?.innerText ?? '');
  }

  function tryClick(sels) {
    for (const sel of sels) {
      const el = sel.startsWith('text:') ? findByText(sel.slice(5)) : deepQuerySelector(sel);
      if (el && isVisible(el)) { dispatchSyntheticClick(clickTargetFor(el)); return true; }
    }
    return false;
  }

  function isVisible(el) {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  }

  async function waitForDismissal(timeoutMs = 4000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const remaining = [
        '#cmpbox',
        '#cmpwrapper',
        '.cmpbox',
        '.cmpboxbtnno',
        '.cmpboxbtnreject',
        '.cmpboxbtnrejectcustomchoices',
        '.cmpboxbtnaccept',
        '.cmpboxbtnyescustomchoices',
        '#cmpbntnotxt',
      ].some((sel) => {
        const el = deepQuerySelector(sel);
        return el && isVisible(el);
      });
      if (!remaining) return true;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return false;
  }

  async function run() {
    const topSite = topSiteHost();
    if (CM_FRAME_EXCLUDED_SITES.has(topSite) || CM_FRAME_EXCLUDED_SITES.has(host)) return;
    if (topSite === 'www.ft.com') return;
    // Guardian's consent is managed entirely by Sourcepoint — stay out completely.
    if (topSite === 'www.theguardian.com') return;
    if (!isConsentManagerFrame()) return;
    // Skip DW's main frame on regular pages — #cmpwrapper is always in the DOM
    // there as an empty div and would cause false-positive detection. Exception:
    // the dedicated privacy-settings page where CM renders the full inline
    // preferences UI (#cmpinlinepreferencesbox) directly in the main frame.
    if (window.top === window && window.location.hostname === 'www.dw.com' &&
        !deepQuerySelector('#cmpinlinepreferencesbox')) return;
    if (await isDisabledForTopSite()) return;

    const settings = await chrome.storage.sync.get({
      globalPreference: 'reject_all',
      onboardingComplete: false,
    });
    if (!settings.onboardingComplete) return;

    const accept = settings.globalPreference === 'accept_all';
    const sels = accept ? ACCEPT_SELS : REJECT_SELS;

    // DW's US-redirect page embeds the CM UI inline — after consent is saved the
    // #cmpbox is removed but the page stays at /data-privacy-settings/…, so we
    // navigate back after a short delay to return the user to their content.
    const isDWInlinePage = window.top === window &&
      window.location.hostname === 'www.dw.com' &&
      deepQuerySelector('#cmpinlinepreferencesbox') !== null;
    const shouldReturnFromDWInlinePage = isDWInlinePage && await hasDWAutoReturnPending();
    const shouldMarkDWAutoReturn = !isDWInlinePage && topSite === 'www.dw.com';

    if (shouldMarkDWAutoReturn) await markDWAutoReturnPending();
    if (tryClick(sels) && await waitForDismissal()) {
      report('consentmanager:frame', settings.globalPreference);
      if (shouldReturnFromDWInlinePage) { await new Promise(r => setTimeout(r, DW_RETURN_DELAY_MS)); await returnFromDWPrivacyPage(); }
      return;
    }

    if (shouldMarkDWAutoReturn) await markDWAutoReturnPending();
    if (invokeCmpAction(accept ? 'accept' : 'reject') && await waitForDismissal(5000)) {
      report(`consentmanager:frame:${accept ? 'accept' : 'reject'}:api`, settings.globalPreference);
      if (shouldReturnFromDWInlinePage) { await new Promise(r => setTimeout(r, DW_RETURN_DELAY_MS)); await returnFromDWPrivacyPage(); }
      return;
    }

    if (shouldMarkDWAutoReturn) await markDWAutoReturnPending();
    if (accept && await configureAcceptAll()) {
      report('consentmanager:frame:accept-settings', settings.globalPreference);
      if (shouldReturnFromDWInlinePage) { await new Promise(r => setTimeout(r, DW_RETURN_DELAY_MS)); await returnFromDWPrivacyPage(); }
      return;
    }

    if (shouldMarkDWAutoReturn) await markDWAutoReturnPending();
    if (!accept && await configureNecessaryOnly()) {
      report('consentmanager:frame:settings', settings.globalPreference);
      if (shouldReturnFromDWInlinePage) { await new Promise(r => setTimeout(r, DW_RETURN_DELAY_MS)); await returnFromDWPrivacyPage(); }
      return;
    }

    const observer = new MutationObserver(async () => {
      if (shouldMarkDWAutoReturn) await markDWAutoReturnPending();
      if (tryClick(sels) && await waitForDismissal()) {
        observer.disconnect();
        report('consentmanager:frame:deferred', settings.globalPreference);
        if (shouldReturnFromDWInlinePage) { await new Promise(r => setTimeout(r, DW_RETURN_DELAY_MS)); await returnFromDWPrivacyPage(); }
        return;
      }
      if (shouldMarkDWAutoReturn) await markDWAutoReturnPending();
      if (accept && await configureAcceptAll()) {
        observer.disconnect();
        report('consentmanager:frame:accept-settings:deferred', settings.globalPreference);
        if (shouldReturnFromDWInlinePage) { await new Promise(r => setTimeout(r, DW_RETURN_DELAY_MS)); await returnFromDWPrivacyPage(); }
        return;
      }
      if (shouldMarkDWAutoReturn) await markDWAutoReturnPending();
      if (!accept && await configureNecessaryOnly()) {
        observer.disconnect();
        report('consentmanager:frame:settings:deferred', settings.globalPreference);
        if (shouldReturnFromDWInlinePage) { await new Promise(r => setTimeout(r, DW_RETURN_DELAY_MS)); await returnFromDWPrivacyPage(); }
      }
    });
    observer.observe(document.body ?? document.documentElement, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 10000);
  }

  function report(method, preference) {
    try {
      const referrer = (() => {
        try {
          const ancestor = window.location.ancestorOrigins?.[0];
          if (ancestor) return new URL(ancestor).hostname;
        } catch (_) {}
        try { return new URL(document.referrer).hostname; } catch(_) { return 'unknown'; }
      })();
      chrome.runtime.sendMessage({ type: 'ACTION_FIRED', site: referrer, method, preference });
    } catch (_) {}
  }

  async function isDisabledForTopSite() {
    const domain = topSiteHost();
    if (!domain) return false;
    const { siteOverrides } = await chrome.storage.local.get({ siteOverrides: {} });
    return Boolean(siteOverrides?.[domain]?.disabled);
  }

  function topSiteHost() {
    if (window.top === window) return window.location.hostname;
    try {
      const ancestor = window.location.ancestorOrigins?.[0];
      if (ancestor) return new URL(ancestor).hostname;
    } catch (_) {}
    try {
      if (document.referrer) return new URL(document.referrer).hostname;
    } catch (_) {}
    return null;
  }

  async function configureNecessaryOnly() {
    if (!(await waitForSettingsView(500))) {
      if (!tryClick(SETTINGS_SELS)) return false;
      if (!(await waitForSettingsView())) return false;
    }

    if (tryClick(['.cmptxt_btn_no2', '.cmpboxbtnreject', '.cmpboxbtnrejectcustomchoices', 'text:reject']) && await waitForDismissal(5000)) {
      return true;
    }

    if (invokeCmpAction('reject') && await waitForDismissal(5000)) {
      return true;
    }

    turnOffOptionalPurposes();

    if (!tryClick(SAVE_SELS) && !invokeCmpAction('save')) {
      return false;
    }

    return waitForDismissal(5000);
  }

  async function returnFromDWPrivacyPage(timeoutMs = 10000) {
    const targetUrl = dwReturnUrl();
    if (targetUrl) {
      try {
        window.location.replace(targetUrl);
      } catch (_) {}
      await waitForDWReturn(timeoutMs);
      await clearDWAutoReturnPending();
      return;
    }
    try {
      history.back();
    } catch (_) {}
    await waitForDWReturn(timeoutMs);
    await clearDWAutoReturnPending();
  }

  function dwReturnUrl() {
    try {
      const referrer = document.referrer ? new URL(document.referrer) : null;
      if (!referrer) return null;
      if (referrer.hostname !== 'www.dw.com') return null;
      if (referrer.pathname.includes('/data-privacy-settings/')) return null;
      return referrer.href;
    } catch (_) {
      return null;
    }
  }

  async function waitForDWReturn(timeoutMs) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (!window.location.pathname.includes('/data-privacy-settings/') &&
          deepQuerySelector('#cmpinlinepreferencesbox') === null) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return false;
  }

  async function markDWAutoReturnPending() {
    try {
      await chrome.storage.local.set({
        [DW_RETURN_PENDING_KEY]: { timestamp: Date.now() },
      });
    } catch (_) {}
  }

  async function hasDWAutoReturnPending() {
    try {
      const result = await chrome.storage.local.get({ [DW_RETURN_PENDING_KEY]: null });
      const payload = result?.[DW_RETURN_PENDING_KEY];
      return Boolean(payload?.timestamp && (Date.now() - payload.timestamp) < DW_RETURN_PENDING_TTL_MS);
    } catch (_) {
      return false;
    }
  }

  async function clearDWAutoReturnPending() {
    try {
      await chrome.storage.local.remove(DW_RETURN_PENDING_KEY);
    } catch (_) {}
  }

  async function configureAcceptAll() {
    if (!(await waitForSettingsView(500))) {
      return false;
    }
    if (tryClick(['.cmptxt_btn_yes2', '.cmpboxbtnaccept', '.cmpboxbtnacceptcustomchoices', '.cmpboxbtnyescustomchoices:not(.cmptxt_btn_save2)', 'text:agree', 'text:accept']) &&
      await waitForDismissal(5000)) {
      return true;
    }
    if (invokeCmpAction('accept') && await waitForDismissal(5000)) {
      return true;
    }
    return false;
  }

  async function waitForSettingsView(timeoutMs = 3000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const visible = [
        '.cmptogglelinkspan',
        '.cmptoggle',
        '[data-cmp-purpose]',
        '.cmpboxnaviitem',
      ].some((sel) => {
        const el = deepQuerySelector(sel);
        return el && isVisible(el);
      });
      if (visible) return true;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    return false;
  }

  function turnOffOptionalPurposes() {
    const rows = deepQuerySelectorAll('[data-cmp-purpose], .cmpboxnaviitem');
    for (const row of rows) {
      const text = row.textContent?.trim().toLowerCase() ?? '';
      if (!text) continue;
      if (/strictly necessary|strictly necessary cookies|nur notwendige|necessary/i.test(text)) continue;

      const toggle = row.querySelector('.cmptogglelink, .cmptogglelinkspan, [role="switch"], [aria-checked], input[type="checkbox"]');
      if (!toggle || !isVisible(toggle)) continue;

      const isOn = toggle.getAttribute('aria-checked') === 'true' ||
        toggle.className.includes('active') ||
        toggle.className.includes('on') ||
        toggle.checked === true;

      if (isOn) dispatchSyntheticClick(clickTargetFor(toggle));
    }
  }

  function invokeCmpAction(kind) {
    const wrapper = window.cmpmngr?.eventwrapper;
    if (!wrapper) return false;
    try {
      if (kind === 'reject' && typeof wrapper.setConsentViaBtnWrapper0 === 'function') {
        wrapper.setConsentViaBtnWrapper0();
        return true;
      }
      if (kind === 'accept' && typeof wrapper.setConsentViaBtnWrapper1 === 'function') {
        wrapper.setConsentViaBtnWrapper1();
        return true;
      }
      if (kind === 'save' && typeof wrapper.setConsentViaBtnWrapper2 === 'function') {
        wrapper.setConsentViaBtnWrapper2();
        return true;
      }
    } catch (_) {}
    return false;
  }

  function findByText(phrase) {
    const needle = phrase.toLowerCase();
    for (const el of deepQuerySelectorAll('button, [role="button"], a, span')) {
      const text = el.textContent?.trim().toLowerCase() ?? '';
      if (text.includes(needle) && isVisible(el)) return el.closest('button, [role="button"], a') ?? el;
    }
    return null;
  }

  function clickTargetFor(el) {
    return el.closest?.('button, [role="button"], a, input[type="button"], input[type="submit"]') ?? el;
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

  run();
})();
