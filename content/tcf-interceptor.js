// Tier 1 — IAB TCF v2.2/v2.3 signal interception.
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

  function invokeCallback(callback, ...args) {
    if (typeof callback !== 'function') return false;
    callback(...args);
    return true;
  }

  window.__tcfapi = function (command, version, callback, parameter) {
    switch (command) {
      case 'getTCData':
      case 'addEventListener':
        if (_prefs) {
          invokeCallback(callback, buildTCData(_prefs), true);
          return buildTCData(_prefs);
        }
        if (typeof callback === 'function') {
          // Prefs not yet loaded — queue until the event arrives
          _pendingCallbacks.push(callback);
        }
        break;
      case 'removeEventListener':
        _pendingCallbacks = _pendingCallbacks.filter((cb) => cb !== callback);
        invokeCallback(callback, true);
        return true;
      case 'ping':
        {
          const pingResult = { gdprApplies: true, cmpLoaded: true, cmpStatus: 'loaded', displayStatus: 'hidden', apiVersion: '2.2', cmpVersion: 1, cmpId: 0, gvlVersion: 0, tcfPolicyVersion: 2 };
          invokeCallback(callback, pingResult, true);
          return pingResult;
        }
      default:
        invokeCallback(callback, null, false);
        return null;
    }
  };

  // __tcfapi queue: flush any calls made before our script loaded
  if (Array.isArray(window.__tcfapiBuffer)) {
    window.__tcfapiBuffer.forEach(([cmd, ver, cb, param]) => {
      window.__tcfapi(cmd, ver, cb, param);
    });
  }

  // IAB TCF spec: window.__tcfapi is only directly callable from same-origin
  // frames. Cross-origin frames (ad-tech vendor tags, prebid wrappers — the
  // kind of nested iframe a publisher's own ad stack loads) locate the CMP by
  // finding a hidden `__tcfapiLocator` iframe and relaying calls over
  // postMessage instead. Without that locator frame + relay, this interceptor
  // only ever answered same-frame callers; any cross-origin ad/consent script
  // got no CMP response at all, which some publisher ad stacks treat as "no
  // valid consent yet" and retry/reload for. This adds the locator frame and
  // the postMessage relay the spec requires, mirroring what a real CMP does.
  if (!window.frames['__tcfapiLocator']) {
    const locatorFrame = document.createElement('iframe');
    locatorFrame.style.cssText = 'display:none;';
    locatorFrame.name = '__tcfapiLocator';
    (document.body || document.documentElement).appendChild(locatorFrame);
  }

  window.addEventListener('message', (event) => {
    const isString = typeof event.data === 'string';
    let json = event.data;
    if (isString) {
      try { json = JSON.parse(event.data); } catch (_) { return; }
    }
    const call = json && json.__tcfapiCall;
    if (!call || !event.source) return;
    window.__tcfapi(call.command, call.version, (returnValue, success) => {
      const response = { __tcfapiReturn: { returnValue, success, callId: call.callId } };
      event.source.postMessage(isString ? JSON.stringify(response) : response, '*');
    }, call.parameter);
  });

  function buildTCData(prefs) {
    return {
      tcString: buildTCString(prefs),
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

  // Mirrors utils/tc-string-builder.js's buildTCString(). That module is ESM-only
  // and unreachable from this MAIN-world classic script (no bundler wires it in —
  // it's only exercised by its own unit test), so previously eventStatus/cmpStatus
  // reported "consent obtained" while tcString stayed '' unconditionally. Sites
  // whose ad/paywall stack validates the TC string itself (rather than trusting
  // eventStatus alone) can treat an empty string as a broken consent state and
  // keep re-triggering their own CMP/reload flow. Kept as a duplicate rather than
  // sharing the module because MAIN-world content scripts can't use ES imports.
  function buildTCString(prefs) {
    const bits = [];
    const push = (value, length) => {
      for (let i = length - 1; i >= 0; i--) bits.push((value >> i) & 1);
    };
    const deciseconds = (date) => Math.round(date.getTime() / 100);
    const now = new Date();

    push(2, 6);                     // Version
    push(deciseconds(now), 36);     // Created
    push(deciseconds(now), 36);     // LastUpdated
    push(0, 12);                    // CmpId (0 = not a registered CMP)
    push(0, 12);                    // CmpVersion
    push(0, 6);                     // ConsentScreen
    push(encodeLanguage('EN'), 12); // ConsentLanguage
    push(0, 12);                    // VendorListVersion (0 = unspecified)
    push(2, 6);                     // TcfPolicyVersion
    push(0, 1);                     // IsServiceSpecific
    push(0, 1);                     // UseNonStandardStacks
    push(0, 12);                    // SpecialFeatureOptIns
    push(purposeBits(prefs), 24);   // PurposeConsents
    push(0, 24);                    // PurposeLegitimateInterests
    push(0, 1);                     // PurposeOneTreatment
    push(encodeLanguage('AA'), 12); // PublisherCC ('AA' = unknown/global)
    push(0, 16);                    // MaxVendorId
    push(0, 1);                     // IsRangeEncoding (bitfield)

    const coreSegment = base64urlEncode(bitsToBytes(bits));
    return `${coreSegment}.${buildDisclosedVendorsSegment()}`;
  }

  // Mandatory as of TCF v2.3 (enforced from March 1, 2026 — see
  // https://iabeurope.eu/all-you-need-to-know-about-the-transition-to-tcf-v2-3/):
  // every TC string must carry a Disclosed Vendors segment. This extension
  // doesn't model individual vendors (MaxVendorId is 0 in the Core String
  // above too), so this is an honestly-empty "no vendors disclosed" segment —
  // enough to keep the string spec-valid without fabricating vendor IDs.
  function buildDisclosedVendorsSegment() {
    const segmentBits = [];
    const pushSegment = (value, length) => {
      for (let i = length - 1; i >= 0; i--) segmentBits.push((value >> i) & 1);
    };
    pushSegment(1, 3);  // SegmentType 1 = Disclosed Vendors
    pushSegment(0, 16); // MaxVendorId
    pushSegment(0, 1);  // IsRangeEncoding (bitfield, zero-length since MaxVendorId is 0)
    return base64urlEncode(bitsToBytes(segmentBits));
  }

  function purposeBits(prefs) {
    let field = 0;
    field |= (1 << 23); // purpose 1: strictly necessary — always grant
    if (prefs?.functional)  field |= (1 << 22); // purpose 2
    if (prefs?.analytics)   field |= (1 << 21) | (1 << 20); // purposes 3–4
    if (prefs?.advertising) field |= (1 << 19) | (1 << 18) | (1 << 17) | (1 << 16); // 5–8
    return field;
  }

  function encodeLanguage(lang) {
    const a = lang.charCodeAt(0) - 65;
    const b = lang.charCodeAt(1) - 65;
    return (a << 6) | b;
  }

  function bitsToBytes(bits) {
    const padded = [...bits];
    while (padded.length % 8 !== 0) padded.push(0);
    const bytes = new Uint8Array(padded.length / 8);
    for (let i = 0; i < bytes.length; i++) {
      let byte = 0;
      for (let j = 0; j < 8; j++) byte = (byte << 1) | padded[i * 8 + j];
      bytes[i] = byte;
    }
    return bytes;
  }

  function base64urlEncode(bytes) {
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
})();
