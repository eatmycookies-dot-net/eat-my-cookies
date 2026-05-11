// LA Times privacy signal handler — runs in ISOLATED world at document_start.
// Uses LA Times' own CCPA signal instead of waiting for a visible settings UI:
// - membership.latimes.com persists `rdp` through the site's privacy API
// - latimes.com / www.latimes.com consume the shared `c_rdp` cookie

(function () {
  const LAT_ALL_HOSTS = new Set(['latimes.com', 'www.latimes.com', 'membership.latimes.com']);
  const LAT_MAIN_OVERRIDE_KEYS = ['latimes.com', 'www.latimes.com'];
  const LAT_COOKIE_DOMAIN = '.latimes.com';
  const LAT_COOKIE_NAME = 'c_rdp';
  const LAT_PRIVACY_PATH = '/v1/@me/account/privacy-settings';
  const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

  if (!LAT_ALL_HOSTS.has(window.location.hostname)) return;

  void bootstrap();

  async function bootstrap() {
    const settings = await chrome.storage.sync.get({
      globalPreference: 'reject_all',
      onboardingComplete: false,
      categoryPreferences: {
        ccpaDoNotSell: true,
      },
    });
    if (!settings.onboardingComplete) return;

    const { siteOverrides = {} } = await chrome.storage.local.get({ siteOverrides: {} });
    if (isDisabled(siteOverrides)) return;

    const prefs = derivePrefs(settings, siteOverrides);
    if (window.location.hostname === 'membership.latimes.com') {
      await syncMembershipPrivacy(prefs);
      return;
    }

    await syncLatimesCookie(prefs);
  }

  function isDisabled(siteOverrides) {
    if (window.location.hostname === 'membership.latimes.com') {
      return Boolean(siteOverrides?.['membership.latimes.com']?.disabled);
    }
    return LAT_MAIN_OVERRIDE_KEYS.some((key) => siteOverrides?.[key]?.disabled);
  }

  function derivePrefs(settings, siteOverrides) {
    const override = siteOverrides?.[window.location.hostname] ?? {};
    return {
      ccpaOptOut: Boolean(settings.categoryPreferences?.ccpaDoNotSell),
      preference: override.alwaysAccept ? 'accept_all' : settings.globalPreference,
    };
  }

  async function syncMembershipPrivacy(prefs) {
    const wantsOptOut = prefs.ccpaOptOut;
    const beforeCookie = getCookie(LAT_COOKIE_NAME);
    let apiChanged = false;

    try {
      const current = await fetchCurrentRdp();
      if (current == null || current !== wantsOptOut) {
        const updated = await putRdp(wantsOptOut);
        if (updated === wantsOptOut) {
          apiChanged = await waitForConfirmedRdp(wantsOptOut);
        }
      }
    } catch (_) {
      // Fall through to cookie syncing as a best-effort signal for the main site.
    }

    const cookieChanged = syncCookieValue(wantsOptOut, beforeCookie);
    if (apiChanged || cookieChanged) {
      void chrome.runtime.sendMessage({
        type: 'ACTION_FIRED',
        site: window.location.hostname,
        method: wantsOptOut ? 'site_specific:latimes:ccpa_opt_out' : 'site_specific:latimes:ccpa_accept',
        preference: prefs.preference,
      });
    }

    if (apiChanged) {
      await sleep(400);
      reloadMembershipPage();
    }
  }

  async function syncLatimesCookie(prefs) {
    const wantsOptOut = prefs.ccpaOptOut;
    const beforeCookie = getCookie(LAT_COOKIE_NAME);
    const cookieChanged = syncCookieValue(wantsOptOut, beforeCookie);
    if (!cookieChanged) return;

    void chrome.runtime.sendMessage({
      type: 'ACTION_FIRED',
      site: window.location.hostname,
      method: wantsOptOut ? 'site_specific:latimes:ccpa_cookie_opt_out' : 'site_specific:latimes:ccpa_cookie_accept',
      preference: prefs.preference,
    });
  }

  async function fetchCurrentRdp() {
    const response = await fetch(`https://membership.latimes.com${LAT_PRIVACY_PATH}`, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) return null;
    return payload?.data?.attributes?.rdp === true;
  }

  async function putRdp(enabled) {
    const response = await fetch(`https://membership.latimes.com${LAT_PRIVACY_PATH}`, {
      method: 'PUT',
      credentials: 'include',
      cache: 'no-store',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        data: {
          type: 'user-privacy-settings',
          id: '@me',
          attributes: {
            rdp: enabled,
          },
        },
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error('LA Times privacy update failed');
    return payload?.data?.attributes?.rdp === true;
  }

  async function waitForConfirmedRdp(enabled, timeoutMs = 4000) {
    const deadline = Date.now() + timeoutMs;
    let sawDesiredState = false;

    while (Date.now() < deadline) {
      const current = await fetchCurrentRdp().catch(() => null);
      if (current === enabled) {
        if (sawDesiredState) return true;
        sawDesiredState = true;
      } else {
        sawDesiredState = false;
      }
      await sleep(250);
    }

    return false;
  }

  function reloadMembershipPage() {
    const next = new URL(window.location.href);
    next.searchParams.set('_emc_rdp_sync', String(Date.now()));
    window.location.replace(next.toString());
  }

  function syncCookieValue(wantsOptOut, beforeCookie) {
    if (wantsOptOut) {
      if (beforeCookie === '1') return false;
      setCookie(LAT_COOKIE_NAME, '1');
      return true;
    }

    if (beforeCookie == null) return false;
    clearCookie(LAT_COOKIE_NAME);
    return true;
  }

  function getCookie(name) {
    const prefix = `${name}=`;
    for (const part of document.cookie.split(';')) {
      const trimmed = part.trim();
      if (trimmed.startsWith(prefix)) {
        return decodeURIComponent(trimmed.slice(prefix.length));
      }
    }
    return null;
  }

  function setCookie(name, value) {
    const encoded = encodeURIComponent(value);
    document.cookie = `${name}=${encoded}; domain=${LAT_COOKIE_DOMAIN}; path=/; expires=${new Date(Date.now() + YEAR_MS).toUTCString()}; Secure; SameSite=Lax`;
    document.cookie = `${name}=${encoded}; path=/; expires=${new Date(Date.now() + YEAR_MS).toUTCString()}; Secure; SameSite=Lax`;
  }

  function clearCookie(name) {
    const expires = 'Thu, 01 Jan 1970 00:00:00 GMT';
    document.cookie = `${name}=0; domain=${LAT_COOKIE_DOMAIN}; path=/; expires=${expires}; Secure; SameSite=Lax`;
    document.cookie = `${name}=0; path=/; expires=${expires}; Secure; SameSite=Lax`;
  }
})();
