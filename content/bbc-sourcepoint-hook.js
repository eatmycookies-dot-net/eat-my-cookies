// BBC Sourcepoint hook — runs in MAIN world at document_start.
// Uses the page's own Sourcepoint API to apply the US privacy opt-out without
// clicking any page elements.

(function () {
  if (window.location.hostname !== 'www.bbc.com') return;

  let shouldOptOut = false;
  let optOutApplied = false;
  let retryTimer = null;
  let activePreference = 'custom';
  let shouldCelebrateChange = false;

  document.addEventListener('__emc_bbc_prefs__', (event) => {
    shouldOptOut = Boolean(event.detail?.ccpaOptOut);
    activePreference = event.detail?.preference ?? 'custom';
    shouldCelebrateChange = Boolean(event.detail?.stateChanged);
    if (!shouldOptOut) return;

    hookSourcepointReady();
    if (!attemptUsnatOptOut()) {
      startRetryLoop();
    }
  });

  function hookSourcepointReady() {
    const config = window._sp_?.config;
    if (!config) return;

    const existing = config.events?.onConsentReady;
    if (existing?.__emcBbcWrapped) return;

    config.events = config.events || {};
    const wrapped = function (...args) {
      if (shouldOptOut) {
        attemptUsnatOptOut();
      }
      return existing?.apply(this, args);
    };
    wrapped.__emcBbcWrapped = true;
    config.events.onConsentReady = wrapped;
  }

  function startRetryLoop() {
    if (retryTimer || !shouldOptOut || optOutApplied) return;

    const startedAt = Date.now();
    retryTimer = window.setInterval(() => {
      if (optOutApplied || !shouldOptOut || Date.now() - startedAt > 10000) {
        window.clearInterval(retryTimer);
        retryTimer = null;
        return;
      }

      hookSourcepointReady();
      attemptUsnatOptOut();
    }, 250);
  }

  function attemptUsnatOptOut() {
    if (!shouldOptOut || optOutApplied) return optOutApplied;

    const rejectAll = window._sp_?.usnat?.postRejectAll;
    if (typeof rejectAll !== 'function') return false;

    optOutApplied = true;
    try {
      rejectAll.call(window._sp_.usnat, (err, success) => {
        if (err || success === false) {
          optOutApplied = false;
          startRetryLoop();
          return;
        }

        if (shouldCelebrateChange) {
          document.dispatchEvent(new CustomEvent('__emc_bbc_ccpa_handled__', {
            detail: { preference: activePreference },
          }));
        }
      });
      return true;
    } catch (_) {
      optOutApplied = false;
      return false;
    }
  }
})();
