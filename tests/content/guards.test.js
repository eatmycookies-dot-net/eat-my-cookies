/**
 * Content-script guard tests.
 *
 * These tests validate that the key behavioral guards added to prevent the
 * Guardian accessibility-page redirect loop are present and correct in the
 * source files. We use source-code inspection for IIFE-style scripts that
 * can't be imported as modules.
 *
 * In addition, for sp-frame-handler we evaluate the IIFE in a mocked
 * environment to verify that no click is attempted when the guardian guard
 * fires, and that the correct USNAT opt-out selectors exist.
 */

import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');

function readSource(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

// ── sp-frame-handler.js guards ────────────────────────────────────────────────

describe('sp-frame-handler.js — guardian top-frame guard', () => {
  const source = readSource('content/sp-frame-handler.js');

  it('has top-frame hostname guard for www.theguardian.com', () => {
    expect(source).toContain('GUARDIAN_HOSTS');
    expect(source).toContain("new Set(['www.theguardian.com', 'support.theguardian.com'])");
  });

  it('top-frame guard appears before isSPFrame() check', () => {
    const guardPos    = source.indexOf('GUARDIAN_HOSTS.has(window.location.hostname)');
    const spFramePos  = source.indexOf('if (!isSPFrame() && !isFTShell)');
    expect(guardPos).toBeGreaterThan(-1);
    expect(spFramePos).toBeGreaterThan(-1);
    expect(guardPos).toBeLessThan(spFramePos);
  });

  it('has a referrer-based site guard for www.theguardian.com (SP iframe skipped)', () => {
    expect(source).toContain('if (GUARDIAN_HOSTS.has(site))');
    expect(source).toContain("settings.globalPreference === 'accept_all'");
    expect(source).toContain('handleGuardianAcceptFrame');
    expect(source).toContain('handleGuardianSupportRejectFrame');
    expect(source).toContain("if (site === 'support.theguardian.com')");
  });

  it('USNAT_OPT_OUT includes sp_choice_type_13 (guardian "do not sell" class)', () => {
    expect(source).toContain('.sp_choice_type_13');
  });

  it('USNAT_OPT_OUT includes .gu-btn-dns (guardian-specific class)', () => {
    expect(source).toContain('.gu-btn-dns');
  });

  it('USNAT_OPT_OUT contains "do not sell or share" text selector', () => {
    expect(source).toContain('do not sell or share');
  });

  it('guardian accept frame handler targets the close button', () => {
    expect(source).toContain('.sp_choice_type_11');
    expect(source).toContain('.gu-close-btn');
    expect(source).toContain('text:close');
    expect(source).toContain('EMC_EXECUTE_FRAME_CLICK');
    expect(source).toContain('sourcepoint:guardian:accept_close_main_world');
    expect(source).toContain('sourcepoint:guardian:accept_close_frame');
    expect(source).toContain("applyGuardianSupportPrivacyChoice(false, site, preference, 'accept')");
  });

  it('guardian support reject handler targets the do-not-sell control, switch state, and save-and-close', () => {
    expect(source).toContain('handleGuardianSupportRejectFrame');
    expect(source).toContain("type: 'EMC_EXECUTE_GUARDIAN_TOP_ACTION'");
    expect(source).toContain("action: 'guardian_support_reject'");
    expect(source).toContain('sourcepoint:guardian:support_reject_top_api');
    expect(source).toContain('.gu-btn-dns');
    expect(source).toContain('sourcepoint:guardian:support_reject_frame');
    expect(source).toContain("applyGuardianSupportPrivacyChoice(true, site, preference, 'reject')");
    expect(source).toContain('support_${mode}_save_close');
    expect(source).toContain('support_${mode}_save_close_frame');
    expect(source).toContain("button[role=\"switch\"][aria-checked]");
    expect(source).toContain('.switch-container button.pm-toggle');
    expect(source).toContain('button.pm-toggle');
    expect(source).toContain('button.pm-toggle span.on');
    expect(source).toContain('button.pm-toggle span.off');
    expect(source).toContain('setGuardianSupportSwitchState');
    expect(source).toContain('guardianSupportSwitchTargetSelectors');
    expect(source).toContain('applyGuardianSupportPrivacyChoice');
    expect(source).toContain('switchState.changed');
    expect(source).toContain('.sp_choice_type_SAVE_AND_EXIT');
    expect(source).toContain('waitForGuardianSupportPrivacyManager');
    expect(source).toContain('waitForGuardianSupportRejectTransition');
    expect(source).toContain("outcome === 'privacy_manager'");
    expect(source).toContain("outcome === 'dismissed'");
  });

  it('has a generic USNAT privacy-manager save flow and a dedicated custom CCPA preference', () => {
    expect(source).toContain('ccpaDoNotSell');
    expect(source).toContain('effectiveUsNatOptOut');
    expect(source).toContain('waitForUsNatTransition');
    expect(source).toContain('applySourcepointUsNatPrivacyChoice');
    expect(source).toContain("sourcepoint:usnat:${enable ? 'opt_out' : 'save_close'}");
    expect(source).toContain('switchState.changed');
    expect(source).toContain('const framework = isUSNat ? \'usnat\' : \'gdpr\'');
  });
});

// ── tcf-interceptor.js — guardian skip ───────────────────────────────────────

describe('tcf-interceptor.js — guardian skip', () => {
  const source = readSource('content/tcf-interceptor.js');

  it('has a hostname guard for www.theguardian.com', () => {
    expect(source).toContain("window.location.hostname === 'www.theguardian.com'");
  });

  it('guardian guard appears before window.__tcfapi is assigned', () => {
    const guardPos = source.indexOf("window.location.hostname === 'www.theguardian.com'");
    // Search for the actual assignment (function definition), not a comment mention
    const tcfPos   = source.indexOf('window.__tcfapi = function');
    expect(guardPos).toBeGreaterThan(-1);
    expect(tcfPos).toBeGreaterThan(-1);
    expect(guardPos).toBeLessThan(tcfPos);
  });

  it('early-exits on guardian (return statement follows the guard)', () => {
    // Find the guardian guard line and check the next non-whitespace statement is return
    const idx = source.indexOf("window.location.hostname === 'www.theguardian.com'");
    const snippet = source.slice(idx, idx + 80);
    expect(snippet).toMatch(/return/);
  });
});

// ── main.js — guardian main-world-only handling ───────────────────────────────

describe('main.js — guardian main-world-only guards', () => {
  const source = readSource('content/main.js');

  it('has a MAIN_WORLD_ONLY_SITES set', () => {
    expect(source).toContain('MAIN_WORLD_ONLY_SITES');
  });

  it('MAIN_WORLD_ONLY_SITES includes www.theguardian.com', () => {
    expect(source).toContain('www.theguardian.com');
  });

  it('MAIN_WORLD_ONLY_SITES includes support.theguardian.com', () => {
    expect(source).toContain('support.theguardian.com');
  });

  it('MAIN_WORLD_ONLY_SITES includes Disney privacy center host', () => {
    expect(source).toContain('privacy.thewaltdisneycompany.com');
  });

  it('guardian returns after main-world handling but before DOM fallback', () => {
    const guardPos = source.indexOf('if (MAIN_WORLD_ONLY_SITES.has(site))');
    const domPos = source.indexOf('const domResult = await runDOMHandler(prefs);');
    expect(guardPos).toBeGreaterThan(-1);
    expect(domPos).toBeGreaterThan(-1);
    expect(guardPos).toBeLessThan(domPos);
  });

  it('DO_NOT_HANDLE_URLS includes the accessibility-help page', () => {
    expect(source).toContain('/help/accessibility-help');
  });

  it('routes BBC through document-start handling only', () => {
    expect(source).toContain('DOCUMENT_START_ONLY_SITES');
    expect(source).toContain("'www.bbc.com'");
    expect(source).toContain('if (DOCUMENT_START_ONLY_SITES.has(site)) return;');
    expect(source).not.toContain("__emc_force_run__");
  });

  it('routes LA Times through the temporary no-handle path', () => {
    expect(source).toContain('DOCUMENT_START_ONLY_SITES');
    expect(source).toContain("'latimes.com'");
    expect(source).toContain("'www.latimes.com'");
    expect(source).toContain("'membership.latimes.com'");
    expect(source).toContain('if (DOCUMENT_START_ONLY_SITES.has(site)) return;');
  });
});

describe('cmp-api-handler.js — guardian sourcepoint api path', () => {
  const source = readSource('content/cmp-api-handler.js');

  it('does not skip guardian in hookSourcepoint()', () => {
    expect(source).not.toContain("['www.ft.com', 'www.theguardian.com'].includes(window.location.hostname)");
  });

  it('has a guardian-specific sourcepoint handler', () => {
    expect(source).toContain('GUARDIAN_HOSTS.has(window.location.hostname)');
    expect(source).toContain('support.theguardian.com');
    expect(source).toContain('tryGuardianSourcepointHandler');
    expect(source).toContain('guardian_accept');
    expect(source).toContain('postRejectAll');
    expect(source).toContain('invokeGuardianRejectPreference');
    expect(source).toContain('invokeGuardianAcceptPreference');
    expect(source).toContain('startGuardianRetryLoop');
    expect(source).toContain('consentDateUsnat');
    expect(source).toContain('destroyMessages');
    expect(source).toContain('cleanupGuardianArtifacts');
    expect(source).toContain('scheduleGuardianCleanup');
    expect(source).toContain('setTimeout(() => cleanupGuardianArtifacts(), 1500)');
    expect(source).toContain("sp-message-open");
    expect(source).toContain("[id^='sp_message_container']");
    expect(source).toContain('cmp_api:Sourcepoint:guardian_reject');
  });

  it('keeps BBC onetrust handling scoped to explicit OneTrust save controls', () => {
    expect(source).toContain("EXPLICIT_ONETRUST_CONTROL_HOSTS = new Set(['www.bbc.com'])");
    expect(source).toContain('oneTrustSaveSelectors');
    expect(source).toContain("if (!EXPLICIT_ONETRUST_CONTROL_HOSTS.has(host))");
  });

  it('mirrors Disney-family USNat accept and reject state into visible OneTrust toggles', () => {
    expect(source).toContain('waitForOneTrustTogglesState(false, 600)');
    expect(source).toContain('waitForOneTrustTogglesState(true, 600)');
    expect(source).toContain('setOneTrustTogglesNow(false)');
    expect(source).toContain('setOneTrustTogglesNow(true)');
  });

  it('has a dedicated Disney privacy-center handler for the SSPD_BG toggle', () => {
    expect(source).toContain('DISNEY_PRIVACY_HOSTS');
    expect(source).toContain('handleDisneyPrivacyChoices');
    expect(source).toContain('ot-group-id-SSPD_BG');
    expect(source).toContain('a.df-privacy-compliance');
  });
});

describe('dom-handler.js — BBC onetrust save guard', () => {
  const source = readSource('content/dom-handler.js');

  it('keeps BBC onetrust save fallback scoped to explicit OneTrust controls', () => {
    expect(source).toContain("EXPLICIT_ONETRUST_CONTROL_HOSTS = new Set([");
    expect(source).toContain("'www.bbc.com'");
    expect(source).toContain('oneTrustSaveSelectors');
    expect(source).toContain("if (!EXPLICIT_ONETRUST_CONTROL_HOSTS.has(host))");
  });
});

describe('frame handlers — temporary skip guards', () => {
  const spSource = readSource('content/sp-frame-handler.js');
  const cmSource = readSource('content/cm-frame-handler.js');
  const heuristicSource = readSource('content/heuristic.js');
  const bbcPrefsSource = readSource('content/bbc-preferences.js');
  const bbcHookSource = readSource('content/bbc-sourcepoint-hook.js');

  it('sourcepoint frame handler skips BBC and LA Times', () => {
    expect(spSource).toContain("TEMPORARILY_UNSUPPORTED_TOP_SITES = new Set(['www.bbc.com', 'latimes.com', 'www.latimes.com', 'membership.latimes.com'])");
    expect(spSource).toContain('TEMPORARILY_UNSUPPORTED_TOP_SITES.has(site)');
  });

  it('consentmanager frame handler skips BBC and LA Times', () => {
    expect(cmSource).toContain('CM_FRAME_EXCLUDED_SITES');
    expect(cmSource).toContain("'www.bbc.com'");
    expect(cmSource).toContain("'latimes.com'");
    expect(cmSource).toContain("'www.latimes.com'");
    expect(cmSource).toContain("'membership.latimes.com'");
    expect(cmSource).toContain("'www.zoom.com'");
    expect(cmSource).toContain('CM_FRAME_EXCLUDED_SITES.has(topSite)');
  });

  it('heuristic fallback skips BBC and LA Times', () => {
    expect(heuristicSource).toContain("'www.bbc.com'");
    expect(heuristicSource).toContain("'latimes.com'");
    expect(heuristicSource).toContain("'www.latimes.com'");
    expect(heuristicSource).toContain("'membership.latimes.com'");
  });

  it('bbc document-start preference seeding writes first-party cookies and clears US privacy state when needed', () => {
    expect(bbcPrefsSource).toContain("const BBC_HOST = 'www.bbc.com'");
    expect(bbcPrefsSource).toContain("setCookie('ckns_policy', '111')");
    expect(bbcPrefsSource).toContain("setCookie('ckns_explicit'");
    expect(bbcPrefsSource).toContain('clearBbcUsPrivacyState');
    expect(bbcPrefsSource).toContain("__emc_bbc_prefs__");
    expect(bbcPrefsSource).toContain('stateChanged: !hadOptOutState');
    expect(bbcPrefsSource).toContain('stateChanged: hadOptOutState');
    expect(bbcPrefsSource).toContain("method: 'site_specific:bbc:ccpa_cleared'");
    expect(bbcPrefsSource).not.toContain("__emc_force_run__");
    expect(bbcPrefsSource).not.toContain('window.location.reload()');
  });

  it('bbc sourcepoint hook uses the usnat API instead of clicks', () => {
    expect(bbcHookSource).toContain("window.location.hostname !== 'www.bbc.com'");
    expect(bbcHookSource).toContain('__emc_bbc_prefs__');
    expect(bbcHookSource).toContain('postRejectAll');
    expect(bbcHookSource).toContain('onConsentReady');
    expect(bbcHookSource).toContain('shouldCelebrateChange');
  });
});

describe('latimes-privacy.js — shared CCPA signal handling', () => {
  const source = readSource('content/latimes-privacy.js');

  it('targets the main LA Times sites and membership subdomain', () => {
    expect(source).toContain("new Set(['latimes.com', 'www.latimes.com', 'membership.latimes.com'])");
  });

  it('uses the membership privacy API and c_rdp cookie instead of switch clicks', () => {
    expect(source).toContain("const LAT_COOKIE_NAME = 'c_rdp'");
    expect(source).toContain("const LAT_PRIVACY_PATH = '/v1/@me/account/privacy-settings'");
    expect(source).toContain("'user-privacy-settings'");
    expect(source).toContain('rdp: enabled');
    expect(source).toContain('https://membership.latimes.com');
  });

  it('writes and clears the shared latimes.com cookie and only reports on real changes', () => {
    expect(source).toContain("const LAT_COOKIE_DOMAIN = '.latimes.com'");
    expect(source).toContain("site_specific:latimes:ccpa_opt_out");
    expect(source).toContain("site_specific:latimes:ccpa_accept");
    expect(source).toContain("site_specific:latimes:ccpa_cookie_opt_out");
    expect(source).toContain("site_specific:latimes:ccpa_cookie_accept");
    expect(source).toContain('if (beforeCookie === \'1\') return false;');
    expect(source).toContain('if (beforeCookie == null) return false;');
    expect(source).not.toContain('LAT_COOKIE_HOSTS');
    expect(source).not.toContain("__emc_force_run__");
  });
});

describe('latimes-interstitial.js — dedicated modal handler', () => {
  const source = readSource('content/latimes-interstitial.js');

  it('targets both latimes.com hostnames', () => {
    expect(source).toContain("new Set(['latimes.com', 'www.latimes.com'])");
  });

  it('targets the metering modal shadow DOM and accept-tos button', () => {
    expect(source).toContain('modality-custom-element[name="metering-modal"]');
    expect(source).toContain('.modality-content');
    expect(source).toContain('data-tos-handler="accept-tos"');
    expect(source).toContain('legal terms and privacy');
    expect(source).toContain('continue');
  });

  it('keeps retrying until the interstitial actually disappears', () => {
    expect(source).toContain('waitForDismissal(4000)');
    expect(source).toContain('if (!findVisibleInterstitial()) return true;');
  });

  it('reports a handled action only after the legal interstitial actually dismisses', () => {
    expect(source).not.toContain("method: 'site_specific:latimes:accept_legal'");
    expect(source).not.toContain("type: 'ACTION_FIRED'");
  });
});

describe('popup.js — active tab reload after preference changes', () => {
  const source = readSource('popup/popup.js');

  it('reloads the active tab instead of injecting a force-run event', () => {
    expect(source).toContain('async function reloadActiveTab()');
    expect(source).toContain('chrome.tabs.reload');
    expect(source).not.toContain('chrome.scripting.executeScript');
    expect(source).not.toContain("__emc_force_run__");
  });
});

describe('service-worker.js — guardian frame click bridge', () => {
  const source = readSource('background/service-worker.js');

  it('handles EMC_EXECUTE_FRAME_CLICK messages', () => {
    expect(source).toContain("message.type === 'EMC_EXECUTE_FRAME_CLICK'");
    expect(source).toContain('executeFrameClick(sender, message.selectors ?? [])');
    expect(source).toContain("message.type === 'EMC_EXECUTE_GUARDIAN_TOP_ACTION'");
    expect(source).toContain('executeGuardianTopAction(sender, message.action)');
  });

  it('executes iframe clicks in MAIN world via chrome.scripting', () => {
    expect(source).toContain("world: 'MAIN'");
    expect(source).toContain("frameIds: [frameId]");
    expect(source).toContain("el.click?.()");
  });
});

// ── sp-frame-handler.js — behavioral test via VM ─────────────────────────────
//
// We evaluate the IIFE in a mocked environment and verify that the guardian
// top-frame guard prevents any click when window.location.hostname is
// 'www.theguardian.com'.

describe('sp-frame-handler.js — guardian top-frame: no click in VM', () => {
  it('does not call dispatchSyntheticClick when hostname is www.theguardian.com (top-frame guard)', async () => {
    const source = readSource('content/sp-frame-handler.js');

    // Build a minimal DOM-like environment for the IIFE
    const doc = {
      querySelector: vi.fn(() => null),
      querySelectorAll: vi.fn(() => []),
      body: { textContent: 'some page', innerText: '', dataset: {} },
      documentElement: { dataset: {} },
      addEventListener: vi.fn(),
      referrer: '',
    };

    const sandbox = {
      window: {
        location: {
          hostname: 'www.theguardian.com',
          href: 'https://www.theguardian.com/film/2024/article',
          pathname: '/film/2024/article',
          ancestorOrigins: [],
        },
        top: null,            // will set below
        sessionStorage: { getItem: vi.fn(() => null), setItem: vi.fn() },
        addEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
        MutationObserver: class { observe() {} disconnect() {} },
        setTimeout: vi.fn(),
        clearTimeout: vi.fn(),
        PointerEvent: undefined,
        MouseEvent: vi.fn(),
      },
      document: doc,
      chrome: {
        storage: { sync: { get: vi.fn(async () => ({ globalPreference: 'reject_all', onboardingComplete: true, categoryPreferences: { functional: true, analytics: false, advertising: false, uncategorized: 'reject' } })) }, local: { get: vi.fn(async () => ({ siteOverrides: {} })) } },
        runtime: { sendMessage: vi.fn(async () => ({})) },
      },
      sessionStorage: { getItem: vi.fn(() => null), setItem: vi.fn() },
      console: { warn: vi.fn(), error: vi.fn(), log: vi.fn() },
    };
    sandbox.window.top = sandbox.window;

    const context = vm.createContext(sandbox);
    // Run the IIFE — it should return early without clicking
    vm.runInContext(source, context);
    // Give any async work a tick to settle
    await new Promise((r) => setTimeout(r, 50));

    // chrome.storage.sync.get should NOT have been called (guard fires first)
    expect(sandbox.chrome.storage.sync.get).not.toHaveBeenCalled();
  });

  it('does not report ACTION_FIRED from the guardian iframe path before a successful dismiss', async () => {
    // Simulates the SP iframe (sourcepoint.theguardian.com) where the top-frame
    // hostname guard won't fire, but reject_all should bail out before reporting.
    const source = readSource('content/sp-frame-handler.js');

    const doc = {
      querySelector: vi.fn(() => null),
      querySelectorAll: vi.fn(() => []),
      body: { textContent: 'do not sell or share', innerText: 'do not sell or share', dataset: {} },
      documentElement: { dataset: { spMessageId: '123' } },
      addEventListener: vi.fn(),
      referrer: 'https://www.theguardian.com/',
    };

    const sandbox = {
      // URL must be explicitly provided — VM contexts don't inherit Node globals
      URL,
      window: {
        location: {
          hostname: 'sourcepoint.theguardian.com',
          href: 'https://sourcepoint.theguardian.com/us_pm/index.html',
          pathname: '/us_pm/index.html',
          // ancestorOrigins[0] returns the parent frame origin → www.theguardian.com
          ancestorOrigins: ['https://www.theguardian.com'],
        },
        top: {},   // non-null → this is a sub-frame
        sessionStorage: { getItem: vi.fn(() => null), setItem: vi.fn() },
        localStorage: { getItem: vi.fn(() => null), setItem: vi.fn() },
        addEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
        MutationObserver: class { observe() {} disconnect() {} },
        setTimeout: vi.fn(),
        clearTimeout: vi.fn(),
        PointerEvent: undefined,
        MouseEvent: vi.fn(),
      },
      document: doc,
      chrome: {
        storage: {
          sync: { get: vi.fn(async () => ({ globalPreference: 'reject_all', onboardingComplete: true, categoryPreferences: {} })) },
          local: { get: vi.fn(async () => ({ siteOverrides: {} })) },
        },
        runtime: { sendMessage: vi.fn(async () => ({})) },
      },
      sessionStorage: { getItem: vi.fn(() => null), setItem: vi.fn() },
      setTimeout,
      clearTimeout,
      console: { warn: vi.fn(), error: vi.fn(), log: vi.fn() },
    };
    sandbox.window.top = {};  // different from window → sub-frame

    const context = vm.createContext(sandbox);
    vm.runInContext(source, context);
    await new Promise((r) => setTimeout(r, 50));

    const sentTypes = sandbox.chrome.runtime.sendMessage.mock.calls.map(([message]) => message?.type);
    expect(sentTypes).not.toContain('ACTION_FIRED');
  });

  it('does not throw when document.documentElement is temporarily null', async () => {
    const source = readSource('content/sp-frame-handler.js');

    const sandbox = {
      window: {
        location: {
          hostname: 'example.com',
          href: 'https://example.com/',
          pathname: '/',
          ancestorOrigins: [],
        },
        top: {},
        sessionStorage: { getItem: vi.fn(() => null), setItem: vi.fn() },
        localStorage: { getItem: vi.fn(() => null), setItem: vi.fn() },
        addEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
        MutationObserver: class { observe() {} disconnect() {} },
        setTimeout: vi.fn(),
        clearTimeout: vi.fn(),
        PointerEvent: undefined,
        MouseEvent: vi.fn(),
      },
      document: {
        querySelector: vi.fn(() => null),
        querySelectorAll: vi.fn(() => []),
        body: { textContent: '', innerText: '', dataset: {} },
        documentElement: null,
        addEventListener: vi.fn(),
        referrer: '',
      },
      chrome: {
        storage: {
          sync: { get: vi.fn(async () => ({ globalPreference: 'reject_all', onboardingComplete: true, categoryPreferences: {} })) },
          local: { get: vi.fn(async () => ({ siteOverrides: {} })) },
        },
        runtime: { sendMessage: vi.fn(async () => ({})) },
      },
      sessionStorage: { getItem: vi.fn(() => null), setItem: vi.fn() },
      console: { warn: vi.fn(), error: vi.fn(), log: vi.fn() },
    };
    sandbox.window.top = {};

    const context = vm.createContext(sandbox);
    expect(() => vm.runInContext(source, context)).not.toThrow();
    await new Promise((r) => setTimeout(r, 20));
  });
});

// ── tcf-interceptor.js — behavioral test via VM ──────────────────────────────

describe('tcf-interceptor.js — guardian hostname: __tcfapi NOT defined', () => {
  it('does not define window.__tcfapi when hostname is www.theguardian.com', () => {
    const source = readSource('content/tcf-interceptor.js');

    const sandbox = {
      window: {
        location: { hostname: 'www.theguardian.com' },
        __tcfapi: undefined,
        __tcfapiBuffer: undefined,
      },
      document: { addEventListener: vi.fn() },
      console: { log: vi.fn(), warn: vi.fn() },
    };

    const context = vm.createContext(sandbox);
    vm.runInContext(source, context);

    // The guardian guard should have returned before defining __tcfapi
    expect(sandbox.window.__tcfapi).toBeUndefined();
  });

  it('defines window.__tcfapi on a non-guardian hostname', () => {
    const source = readSource('content/tcf-interceptor.js');

    const sandbox = {
      window: {
        location: { hostname: 'www.bbc.com' },
        __tcfapi: undefined,
        __tcfapiBuffer: undefined,
      },
      document: { addEventListener: vi.fn() },
      console: { log: vi.fn(), warn: vi.fn() },
    };

    const context = vm.createContext(sandbox);
    vm.runInContext(source, context);

    expect(typeof sandbox.window.__tcfapi).toBe('function');
  });
});
