// BBC preference seeding — runs in ISOLATED world at document_start.
// Applies BBC's first-party cookie settings and clears/requests US privacy
// state without clicking page UI.

(function () {
  const BBC_HOST = 'www.bbc.com';
  const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
  const BBC_CONSENT_COOKIE_DOMAIN = '.bbc.com';
  const BBC_US_PRIVACY_COOKIE_NAMES = [
    'ccpaApplies',
    'ccpaUUID',
    'ccpaReject',
    'ccpaConsentAll',
    'consentStatus',
    'usnatUUID',
    'consentDateUsnat',
    'dnsDisplayed',
    'signedLspa',
    '_sp_su',
  ];
  const BBC_US_PRIVACY_STORAGE_KEYS = [
    '_sp_user_consent_26225',
    '_sp_local_state',
    '_sp_non_keyed_local_state',
    'consented',
    'cvcConsentGiven',
    'permutive-consent',
  ];

  if (window.location.hostname !== BBC_HOST) return;

  document.addEventListener('__emc_bbc_ccpa_handled__', (event) => {
    void chrome.runtime.sendMessage({
      type: 'ACTION_FIRED',
      site: BBC_HOST,
      method: 'site_specific:bbc:ccpa_api',
      preference: event.detail?.preference ?? 'custom',
    });
  });

  void bootstrap();

  async function bootstrap() {
    const settings = await chrome.storage.sync.get({
      globalPreference: 'reject_all',
      onboardingComplete: false,
      categoryPreferences: {
        functional: false,
        analytics: false,
        advertising: false,
        ccpaDoNotSell: true,
        uncategorized: 'reject',
      },
    });
    if (!settings.onboardingComplete) return;

    const { siteOverrides = {} } = await chrome.storage.local.get({ siteOverrides: {} });
    const siteOverride = siteOverrides[BBC_HOST] ?? {};
    if (siteOverride.disabled) return;

    const prefs = derivePrefs(settings, siteOverride);
    const hadOptOutState = hasStoredUsPrivacyOptOut();
    applyBbcFirstPartyCookies(prefs);

    if (prefs.ccpaOptOut) {
      // Give the MAIN-world hook the opt-out request so it can use BBC's
      // Sourcepoint API once it becomes available.
      document.dispatchEvent(new CustomEvent('__emc_bbc_prefs__', {
        detail: {
          ccpaOptOut: true,
          preference: prefs.preference,
          stateChanged: !hadOptOutState,
        },
      }));
      return;
    }

    clearBbcUsPrivacyState();
    document.dispatchEvent(new CustomEvent('__emc_bbc_prefs__', {
      detail: {
        ccpaOptOut: false,
        preference: prefs.preference,
        stateChanged: hadOptOutState,
      },
    }));

    if (hadOptOutState) {
      void chrome.runtime.sendMessage({
        type: 'ACTION_FIRED',
        site: BBC_HOST,
        method: 'site_specific:bbc:ccpa_cleared',
        preference: prefs.preference,
      });
    }

  }

  function derivePrefs(settings, siteOverride) {
    if (siteOverride.alwaysAccept || settings.globalPreference === 'accept_all') {
      return {
        functional: true,
        performance: true,
        advertising: true,
        ccpaOptOut: Boolean(settings.categoryPreferences?.ccpaDoNotSell),
        preference: siteOverride.alwaysAccept ? 'accept_all' : settings.globalPreference,
      };
    }

    return {
      functional: Boolean(settings.categoryPreferences?.functional),
      performance: Boolean(settings.categoryPreferences?.analytics),
      advertising: Boolean(settings.categoryPreferences?.advertising),
      ccpaOptOut: Boolean(settings.categoryPreferences?.ccpaDoNotSell),
      preference: settings.globalPreference,
    };
  }

  function applyBbcFirstPartyCookies(prefs) {
    setCookie('ckns_policy', '111');
    setCookie('ckns_policy_exp', String(Date.now() + YEAR_MS));
    setCookie('ckns_explicit', prefs.functional || prefs.performance ? '1' : '0');
  }

  function hasStoredUsPrivacyOptOut() {
    try {
      const stored = window.localStorage.getItem('_sp_user_consent_26225');
      if (stored && /"rejectedAny":true|"consented":false|"status":"rejectedSome"/.test(stored)) {
        return true;
      }
    } catch (_) {}

    return document.cookie.includes('consentDateUsnat=') ||
      document.cookie.includes('ccpaReject=true') ||
      /usnatUUID=[^;]+_137/.test(document.cookie);
  }

  function clearBbcUsPrivacyState() {
    for (const name of BBC_US_PRIVACY_COOKIE_NAMES) {
      clearCookie(name);
    }

    for (const key of BBC_US_PRIVACY_STORAGE_KEYS) {
      try {
        window.localStorage.removeItem(key);
      } catch (_) {}
    }
  }

  function setCookie(name, value) {
    const encoded = encodeURIComponent(value);
    document.cookie = `${name}=${encoded}; domain=${BBC_CONSENT_COOKIE_DOMAIN}; path=/; expires=${new Date(Date.now() + YEAR_MS).toUTCString()}; SameSite=Lax`;
  }

  function clearCookie(name) {
    const expires = 'Thu, 01 Jan 1970 00:00:00 GMT';
    document.cookie = `${name}=; domain=${BBC_CONSENT_COOKIE_DOMAIN}; path=/; expires=${expires}; SameSite=Lax`;
    document.cookie = `${name}=; path=/; expires=${expires}; SameSite=Lax`;
  }
})();
