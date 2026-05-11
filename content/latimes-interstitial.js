// LA Times legal/privacy interstitial handler — runs at document_start.
// Keeps the generic handlers disabled for LA Times, then narrowly dismisses the
// shadow-DOM "Legal Terms and Privacy" gate once it becomes visible.

(function () {
  const LAT_HOSTS = new Set(['latimes.com', 'www.latimes.com']);
  const SITE_OVERRIDE_KEYS = ['latimes.com', 'www.latimes.com'];
  const MODAL_SELECTORS = [
    'modality-custom-element[name="metering-modal"]',
    'modality-custom-element[aria-label*="Legal Terms and Privacy" i]',
  ];
  const CONTENT_SELECTORS = [
    '.modality-content',
    '.reg-dialog.meter-modal',
    '.reg-content',
    '.met-container',
  ];
  const BUTTON_SELECTORS = [
    'a[data-tos-handler="accept-tos"]',
    'a.met-button.met-non-sub-link',
    '[role="button"][data-tos-handler="accept-tos"]',
  ];

  if (!LAT_HOSTS.has(window.location.hostname)) return;

  let observer = null;
  let attemptInFlight = false;
  let completed = false;

  void bootstrap();

  async function bootstrap() {
    const settings = await chrome.storage.sync.get({ onboardingComplete: false });
    if (!settings.onboardingComplete) return;

    const { siteOverrides = {} } = await chrome.storage.local.get({ siteOverrides: {} });
    if (SITE_OVERRIDE_KEYS.some((key) => siteOverrides?.[key]?.disabled)) return;

    watch();
    void maybeDismiss();
  }

  function watch() {
    if (observer || !document.documentElement) return;
    observer = new MutationObserver(() => {
      void maybeDismiss();
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
    });
    setTimeout(() => observer?.disconnect(), 15000);
  }

  async function maybeDismiss() {
    if (completed || attemptInFlight) return;

    const state = findVisibleInterstitial();
    if (!state) return;

    attemptInFlight = true;
    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        dispatchSyntheticClick(state.button);
        if (await waitForDismissal(4000)) {
          completed = true;
          observer?.disconnect();
          return;
        }
        await sleep(250);
      }
    } finally {
      attemptInFlight = false;
    }
  }

  function findVisibleInterstitial() {
    for (const selector of MODAL_SELECTORS) {
      const host = document.querySelector(selector);
      if (!host) continue;
      const root = host.shadowRoot;
      if (!root) continue;

      const heading = root.querySelector('.topText, h2');
      const headingText = heading?.textContent?.trim().toLowerCase() ?? '';
      if (headingText && !headingText.includes('legal terms and privacy')) continue;

      const content = CONTENT_SELECTORS
        .map((sel) => root.querySelector(sel))
        .find((el) => el && isVisible(el));
      if (!content) continue;

      const button = BUTTON_SELECTORS
        .map((sel) => root.querySelector(sel))
        .find((el) => el && isVisible(el));
      if (!button) continue;

      const text = button.textContent?.trim().toLowerCase() ?? '';
      if (!text.includes('continue')) continue;

      return { host, button };
    }
    return null;
  }

  async function waitForDismissal(timeoutMs) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (!findVisibleInterstitial()) return true;
      await sleep(200);
    }
    return false;
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
    if (rect.width === 0 || rect.height === 0) return false;
    const style = getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
})();
