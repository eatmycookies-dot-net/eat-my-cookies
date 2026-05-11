// Tier 4 — DOM selector fallback using the cmps.json database.
// Runs in ISOLATED world. Loads CMP signatures, detects which CMP is present,
// then clicks the appropriate button.

const DOM_TIMEOUT_MS = 10000;
const EXPLICIT_ONETRUST_CONTROL_HOSTS = new Set([
  'www.bbc.com',
]);
const ZOOM_ONETRUST_HOSTS = new Set([
  'www.zoom.com',
]);

async function runDOMHandler(prefs) {
  const cmpsUrl = chrome.runtime.getURL('rules/cmps.json');
  const { cmps } = await fetch(cmpsUrl).then((r) => r.json());

  const immediate = await tryCMPs(cmps, prefs);
  if (immediate) return immediate;

  return new Promise((resolve) => {
    const start = Date.now();

    if (isSPA()) {
      // SPAs generate continuous DOM mutations. Polling at fixed intervals avoids
      // observer-driven re-entry loops after we've already handled the banner.
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
          } else if (Date.now() - start > DOM_TIMEOUT_MS && !done) {
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
      setTimeout(() => { if (!done) { done = true; resolve(null); } }, DOM_TIMEOUT_MS);
    } else {
      let running = false;

      const observer = new MutationObserver(async () => {
        if (running) return;
        running = true;
        try {
          const result = await tryCMPs(cmps, prefs);
          if (result) {
            observer.disconnect();
            resolve(result);
            return;
          }
          if (Date.now() - start > DOM_TIMEOUT_MS) {
            observer.disconnect();
            resolve(null);
          }
        } finally {
          running = false;
        }
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

    const method = prefs.globalPreference === 'accept_all' ? 'accept_all' : 'reject_all';
    const actions = cmp.actions?.[method];
    if (!actions) continue;
    if (await executeActions(cmp, actions)) {
      return { method: `dom:${cmp.id}`, cmpName: cmp.name };
    }
  }
  return null;
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
        if (cmp.id === 'onetrust' && ZOOM_ONETRUST_HOSTS.has(location.hostname)) {
          scheduleZoomOneTrustCleanup();
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

  if (clickFirstVisible([
    '.ot-pc-refuse-all-handler',
    '#onetrust-reject-all-handler',
    'button[aria-label*="Reject All" i]',
    'button[title*="Reject All" i]',
    'button[aria-label*="Refuse All" i]',
    'button[title*="Refuse All" i]',
  ])) {
    return waitForDismissal(cmp, cmp.actions?.reject_all ?? []);
  }

  disableVisibleOneTrustToggles();
  await delay(250);

  if (!clickFirstVisible(oneTrustSaveSelectors(host))) {
    return false;
  }

  if (ZOOM_ONETRUST_HOSTS.has(host)) scheduleZoomOneTrustCleanup();

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

function setOneTrustGroupStateById(id, checked) {
  const toggle = document.getElementById(id);
  if (!toggle || toggle.disabled || toggle.getAttribute('aria-disabled') === 'true') return false;
  if (Boolean(toggle.checked) === checked) return true;
  forceOneTrustToggleState(toggle, checked);
  return true;
}

function scheduleZoomOneTrustCleanup() {
  cleanupZoomOneTrustArtifacts();
  try {
    setTimeout(() => cleanupZoomOneTrustArtifacts(), 1200);
    setTimeout(() => cleanupZoomOneTrustArtifacts(), 3500);
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

function isVisible(el) {
  const rect = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
}

function clickFirstVisible(selectors) {
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (!el || !isVisible(el)) continue;
    return dispatchSyntheticClick(el);
  }
  return false;
}

function hasVisibleSelector(selectors) {
  return selectors.some((selector) => {
    const el = document.querySelector(selector);
    return Boolean(el && isVisible(el));
  });
}

function disableVisibleOneTrustToggles() {
  for (const toggle of visibleOneTrustToggles()) {
    if (!toggle.checked) continue;
    forceOneTrustToggleState(toggle, false);
  }
}

function visibleOneTrustToggles() {
  return Array.from(document.querySelectorAll(
    ".category-switch-handler, input[id^='ot-group-id-']"
  )).filter((el) =>
    isVisible(el) &&
    !el.disabled &&
    el.getAttribute('aria-disabled') !== 'true'
  );
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
  const label = toggle.id && typeof CSS?.escape === 'function'
    ? document.querySelector(`label[for="${CSS.escape(toggle.id)}"]`)
    : null;
  if (label) dispatchSyntheticClick(label);
}

async function waitForAnyVisible(selectors, timeoutMs = 3000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && isVisible(el)) return true;
    }
    await delay(200);
  }
  return false;
}

async function waitForDismissal(cmp, actions, timeoutMs = 4000) {
  const selectors = [
    ...cmp.detectors.filter((d) => d.type === 'css_selector').map((d) => d.value),
    ...actions.filter((a) => a.type === 'click').map((a) => a.selector),
  ];

  const requiresStableHidden = cmp.id === 'onetrust' && ZOOM_ONETRUST_HOSTS.has(location.hostname);
  const stableHiddenMs = requiresStableHidden ? 1200 : 0;
  if (requiresStableHidden) timeoutMs += 2500;
  const started = Date.now();
  let hiddenSince = null;
  while (Date.now() - started < timeoutMs) {
    const stillVisible = selectors.some((selector) => {
      const el = document.querySelector(selector);
      return el && isVisible(el);
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

function isCMPBlockedOnHost(cmpId, host, preference) {
  if (preference === 'accept_all') return false;

  const blocked = {
    'www.repubblica.it': new Set(['iubenda']),
    'www.ft.com': new Set(['onetrust']),
  };

  return blocked[host]?.has(cmpId) ?? false;
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
