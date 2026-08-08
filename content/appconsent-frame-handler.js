// Handles AppConsent banners rendered in about:srcdoc / about:blank frames.
// Le Figaro uses this pattern, so match_about_blank is required in the manifest.

(function () {
  const MANUAL_CONSENT_OPEN_KEY = '__emc_manual_consent_open__';
  const MANUAL_CONSENT_SUPPRESS_MS = 120000;

  function referrerHost() {
    try { return new URL(document.referrer).hostname; } catch (_) { return 'unknown'; }
  }

  function isAppConsentFrame() {
    return (
      document.querySelector('.button__refuseAll') !== null ||
      document.querySelector('.button__skip') !== null ||
      /continue without accepting|refuse all/i.test(document.body?.innerText ?? '')
    );
  }

  function isVisible(el) {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  }

  function clickSelector(selectors) {
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && isVisible(el)) {
        el.click();
        return true;
      }
    }
    return false;
  }

  async function waitForDismissal(timeoutMs = 4000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const buttons = Array.from(document.querySelectorAll('.button__refuseAll, .button__skip, .button__acceptAll'))
        .filter(isVisible);
      if (buttons.length === 0) return true;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return false;
  }

  async function run() {
    if (await isDisabledForTopSite()) return;
    if (await isManualConsentOpenSuppressed(referrerHost())) return;

    const settings = await chrome.storage.sync.get({
      globalPreference: 'reject_all',
      onboardingComplete: false,
    });
    if (!settings.onboardingComplete) return;

    const rejectSelectors = [
      '.button__refuseAll',
      '.button__skip',
    ];
    const acceptSelectors = [
      '.button__acceptAll',
    ];

    const selectors = settings.globalPreference === 'accept_all' ? acceptSelectors : rejectSelectors;
    const report = () => {
      try {
        const site = referrerHost();
        isManualConsentOpenSuppressed(site).then((suppressed) => {
          if (suppressed) return;
          chrome.runtime.sendMessage({
            type: 'ACTION_FIRED',
            site,
            method: 'appconsent:frame',
            preference: settings.globalPreference,
          });
        });
      } catch (_) {}
    };

    const attemptHandle = async () => {
      if (!isAppConsentFrame()) return false;
      const topSite = referrerHost();
      if (topSite === 'www.lefigaro.fr' && settings.globalPreference !== 'accept_all') {
        return false;
      }
      if (!clickSelector(selectors)) return false;
      if (!(await waitForDismissal())) return false;
      report();
      return true;
    };

    if (await attemptHandle()) return;

    const observer = new MutationObserver(async () => {
      if (await attemptHandle()) observer.disconnect();
    });
    const root = document.body ?? document.documentElement;
    if (!root) return;
    observer.observe(root, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 10000);
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
      return !payload.site || payload.site === site || payload.site === window.location.hostname;
    } catch (_) {
      return false;
    }
  }

  run();
})();
