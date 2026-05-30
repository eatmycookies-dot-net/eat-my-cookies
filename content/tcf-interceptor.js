// Tier 1 — IAB TCF v2.2 signal interception.
// Runs in MAIN world at document_start — before any CMP JavaScript executes.
// Defines window.__tcfapi so that when the CMP loads and calls it,
// our handler fires instead and returns pre-built consent data.
//
// Preferences are passed in via a CustomEvent from the ISOLATED world
// before the page scripts run (see main.js bootstrap).

(function () {
  // Guardian uses Sourcepoint's own USNat wrapper; intercepting __tcfapi there
  // causes SP's callback queue to hang (no __emc_prefs__ event since main.js
  // skips Guardian), which triggers a fallback redirect to /help/accessibility-help.
  if (window.location.hostname === 'www.theguardian.com') return;

  if (window.__tcfapi) return; // another extension or CMP already defined it

  let _prefs = null;
  let _pendingCallbacks = [];

  // ISOLATED world sends preferences via this event before page scripts run
  document.addEventListener('__emc_prefs__', (e) => {
    _prefs = e.detail;
    _pendingCallbacks.forEach((cb) => cb(buildTCData(_prefs), true));
    _pendingCallbacks = [];
  }, { once: true });

  window.__tcfapi = function (command, version, callback, parameter) {
    switch (command) {
      case 'getTCData':
      case 'addEventListener':
        if (_prefs) {
          callback(buildTCData(_prefs), true);
        } else {
          // Prefs not yet loaded — queue until the event arrives
          _pendingCallbacks.push(callback);
        }
        break;
      case 'removeEventListener':
        _pendingCallbacks = _pendingCallbacks.filter((cb) => cb !== callback);
        callback(true);
        break;
      case 'ping':
        callback({ gdprApplies: true, cmpLoaded: true, cmpStatus: 'loaded', displayStatus: 'hidden', apiVersion: '2.2', cmpVersion: 1, cmpId: 0, gvlVersion: 0, tcfPolicyVersion: 2 }, true);
        break;
      default:
        callback(null, false);
    }
  };

  // __tcfapi queue: flush any calls made before our script loaded
  const queue = window.__tcfapiBuffer || window.__tcfapiLocator;
  if (Array.isArray(window.__tcfapiBuffer)) {
    window.__tcfapiBuffer.forEach(([cmd, ver, cb, param]) => {
      window.__tcfapi(cmd, ver, cb, param);
    });
  }

  function buildTCData(prefs) {
    return {
      tcString: '',   // populated by tc-string-builder in ISOLATED world; MAIN world gets stub
      tcfPolicyVersion: 2,
      cmpId: 0,
      cmpVersion: 0,
      gdprApplies: true,
      eventStatus: 'tcloaded',
      cmpStatus: 'loaded',
      isServiceSpecific: false,
      purpose: {
        consents: buildPurposeConsents(prefs),
        legitimateInterests: {},
      },
      vendor: { consents: {}, legitimateInterests: {} },
      publisher: { consents: {}, legitimateInterests: {} },
    };
  }

  function buildPurposeConsents(prefs) {
    const c = {};
    c[1] = true; // strictly necessary
    c[2] = !!prefs?.functional;
    c[3] = !!prefs?.analytics;
    c[4] = !!prefs?.analytics;
    for (let i = 5; i <= 10; i++) c[i] = !!prefs?.advertising;
    return c;
  }
})();
