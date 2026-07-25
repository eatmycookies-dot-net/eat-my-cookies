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

describe('cmp-api-handler.js — OneTrust shared guards', () => {
  const source = readSource('content/cmp-api-handler.js');

  it('uses active OneTrust surfaces for dismissal instead of persistent footer openers', () => {
    expect(source).toContain('OneTrust: [...ONETRUST_VISIBLE_SELECTORS]');
  });

  it('chooses OneTrust save controls by confirm/save semantics instead of banner-accept text', () => {
    expect(source).toContain('ONETRUST_PREFERENCE_CENTER_SELECTORS');
    expect(source).toContain('findVisibleOneTrustSaveButton');
    expect(source).toContain('findAnyOneTrustSaveButton');
    expect(source).toContain('oneTrustPreferenceSaveRoots');
    expect(source).toContain('findOneTrustSaveButtonInRoot');
    expect(source).toContain("document.querySelectorAll('#onetrust-pc-sdk, #onetrust-consent-sdk')");
    expect(source).toContain("i['’]?m ok with that");
    expect(source).toContain('agree');
    expect(source).toContain('includeGenericButtons');
    expect(source).toContain("selectors.push('button');");
    expect(source).toContain('ONETRUST_SAVE_TEXT_RE');
    expect(source).toContain('ONETRUST_NON_SAVE_TEXT_RE');
  });
});

// ── main.js — guardian main-world-only handling ───────────────────────────────

describe('main.js — guardian main-world-only guards', () => {
  const source = readSource('content/main.js');
  const oneTrustRetrySelectorsMatch = source.match(/const ONETRUST_RELOAD_RETRY_SELECTORS = \[(.*?)\];/s);
  const oneTrustRetrySelectors = oneTrustRetrySelectorsMatch?.[1] ?? '';

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

  it('has a Bloomberg terms-gate handler that keys off cookie acceptance only, not the CCPA toggle', () => {
    expect(source).toContain("if (site === 'www.bloomberg.com')");
    expect(source).toContain('handleBloombergTermsGate');
    expect(source).toContain("#cmp-consent-modal");
    expect(source).toContain("#cmp-consent-button");
    expect(source).toContain("text:we’ve updated our terms");
    expect(source).toContain("document.getElementById('cmp-consent-modal')");
    expect(source).toContain("document.getElementById('cmp-consent-button')");
    expect(source).toContain("text === 'accept'");
    expect(source).toContain("'#cmp-consent-modal'");
    expect(source).toContain("'#cmp-consent-button'");
    expect(source).toContain("const canAutoAccept = isBloombergCookieAcceptAligned(prefs) || siteOverrides.alwaysAccept;");
    expect(source).toContain('isBloombergCookieAcceptAligned');
    expect(source).toContain('accept-only terms gate');
    expect(source).toContain('Bloomberg’s separate Do Not Sell or Share choice still follows your CCPA setting independently.');
  });

  it('preserves the standalone CCPA preference when a site override forces accept_all', () => {
    expect(source).toContain("ccpaDoNotSell: settings.categoryPreferences?.ccpaDoNotSell ?? false");
    expect(source).toContain("uncategorized: 'accept'");
  });

  it('stands down when the user intentionally opens Bloomberg’s footer CCPA flow', () => {
    expect(source).toContain('BLOOMBERG_CCPA_MANUAL_SUPPRESS_MS');
    expect(source).toContain("text.includes('do not sell or share my personal information')");
    expect(source).toContain('if (event.isTrusted) {');
    expect(source).toContain('bloombergCcpaManualOpenUntil = Date.now() + BLOOMBERG_CCPA_MANUAL_SUPPRESS_MS;');
    expect(source).toContain('if (Date.now() < bloombergCcpaManualOpenUntil) return false;');
  });

  it('only treats Bloomberg Sourcepoint iframes with the US privacy-manager path as CCPA surfaces', () => {
    expect(source).toContain("if (!/sourcepointcmp\\.bloomberg\\.com\\/us_pm\\//i.test(src)) {");
    expect(source).not.toContain("|SP Consent Message");
  });

  it('has a reusable Ketch privacy-center handler wired for Forbes', () => {
    expect(source).toContain('const ketchConfig = getKetchSiteConfig(site);');
    expect(source).toContain('if (ketchConfig) {');
    expect(source).toContain('return handleKetchPrivacyCenter(siteOverrides, prefs, ketchConfig);');
    expect(source).toContain('handleForbesPrivacyCenter');
    expect(source).toContain("return handleKetchPrivacyCenter(siteOverrides, prefs, getKetchSiteConfig('www.forbes.com'));");
    expect(source).toContain('const KETCH_SITE_CONFIGS = {');
    expect(source).toContain("'forbes.com'");
    expect(source).toContain("'www.forbes.com'");
    expect(source).toContain("'www.ketch.com'");
    expect(source).toContain("'ketch.com'");
    expect(source).toContain("siteLabel: 'Forbes'");
    expect(source).toContain("siteLabel: 'Ketch'");
    expect(source).toContain("privacyCenterTitle: 'forbes privacy center'");
    expect(source).toContain("privacyCenterTitle: 'your privacy'");
    expect(source).toContain('customRejectBaseline: true');
    expect(source).toContain('getKetchSiteConfig');
    expect(source).toContain('handleKetchPrivacyCenter');
    expect(source).toContain('const prefersAcceptAll = isEffectivelyAcceptAllPrefs(prefs);');
    expect(source).toContain('const onPrivacyCenterPage = isKetchPrivacyCenterPage(config);');
    expect(source).toContain('if (!onPrivacyCenterPage) {');
    expect(source).toContain('isKetchBannerVisible(config)');
    expect(source).toContain('...(config.bannerAcceptSelectors ?? []),');
    expect(source).toContain('...(config.bannerRejectSelectors ?? []),');
    expect(source).toContain('...(config.bannerManageSelectors ?? []),');
    expect(source).toContain('hasVisibleKetchPrivacyCenterEntry(config)');
    expect(source).toContain('config.bannerAcceptSelectors');
    expect(source).toContain('config.bannerRejectSelectors');
    expect(source).toContain('config.bannerManageSelectors');
    expect(source).toContain("type: 'CLEAR_UNSUPPORTED_SITE'");
    expect(source).toContain('config.readySelectors');
    expect(source).toContain('config.settingsSelectors');
    expect(source).toContain('config.purposeTabSelectors');
    expect(source).toContain('clickKetchBannerActionAndWait(');
    expect(source).toContain('waitForKetchBannerTransition(');
    expect(source).toContain('config.saveSelectors');
    expect(source).toContain('config.exitSelectors');
    expect(source).toContain('config.categoryRules');
    expect(source).toContain('siteOverrides.alwaysAccept');
    expect(source).toContain('isEffectivelyAcceptAllPrefs');
    expect(source).toContain("const interactionLockScope = `ketch:${config.cooldownScope}:${prefs.globalPreference}`;");
    expect(source).toContain('const { bypassLock = false } = options;');
    expect(source).toContain('if (!bypassLock && isSiteSpecificFlowLocked(interactionLockScope)) return true;');
    expect(source).toContain('startSiteSpecificFlowLock(interactionLockScope);');
    expect(source).toContain('return handleKetchPrivacyCenter(siteOverrides, prefs, config, { bypassLock: true });');
    expect(source).toContain('isKetchAcceptOnlyState(config)');
    expect(source).toContain('await applyKetchPreferences(config, prefs)');
    expect(source).toContain('async function applyKetchPreferences(config, prefs)');
    expect(source).toContain('findKetchCategoryControl(rule)');
    // Picks the most-specific container (fewest nested toggles) so a parent wrapper
    // that contains ALL category rows doesn't shadow per-category row controls.
    expect(source).toContain('let bestToggleCount = Infinity;');
    expect(source).toContain('if (toggleCount < bestToggleCount)');
    expect(source).toContain('return bestControl;');
    expect(source).toContain('readKetchToggleState(control)');
    expect(source).toContain('const visibleSwitchState = readKetchVisibleSwitchState(control);');
    expect(source).toContain('function readKetchVisibleSwitchState(control) {');
    expect(source).toContain("if (id.includes('switch-container-on')) return true;");
    expect(source).toContain("if (id.includes('switch-container-off')) return false;");
    expect(source).toContain('isKetchToggleDisabled(control)');
    expect(source).toContain('forceKetchToggleState(control, desired, { trustCurrentState });');
    expect(source).toContain('const exactTarget = findKetchToggleInteractionTarget(exact);');
    expect(source).toContain('const interactionTarget = findKetchToggleInteractionTarget(control);');
    expect(source).toContain('function findKetchToggleInteractionTarget(control) {');
    expect(source).toContain('function findKetchSwitchContainer(control) {');
    expect(source).toContain("return control.parentElement?.querySelector('[id*=\"switch-container\"]') ?? null;");
    expect(source).toContain('const label = control.labels?.[0] ?? control.closest?.(\'label\');');
    expect(source).toContain("if (control.matches?.('label')) {");
    expect(source).toContain('function waitForKetchToggleSettle(ms = 250) {');
    expect(source).toContain('async function applyKetchRuleState(rule, desired, options = {}) {');
    expect(source).not.toContain('for (let attempt = 0; attempt < 2; attempt += 1) {');
    expect(source).toContain('forceKetchToggleState(control, desired, { trustCurrentState });');
    expect(source).toContain('const finalControl = findKetchCategoryControl(rule);');
    expect(source).toContain('const settled = await waitForSingleKetchRuleState(rule, desired, 500);');
    expect(source).toContain('async function waitForKetchRulesState(rules, desired, timeoutMs = 1200) {');
    expect(source).toContain('async function waitForSingleKetchRuleState(rule, desired, timeoutMs = 500) {');
    expect(source).toContain('async function clickKetchBannerActionAndWait(clickSelectors, watchSelectors, settingsSelectors, timeoutMs = 5000, attempts = 2) {');
    expect(source).toContain('async function waitForKetchBannerTransition(watchSelectors, settingsSelectors, timeoutMs) {');
    expect(source).toContain("if (labeledInput.hasAttribute('aria-checked')) {");
    expect(source).toContain("if (control.hasAttribute('aria-checked')) {");
    expect(source).toContain("const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked');");
    expect(source).toContain("input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));");
    expect(source).toContain("input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));");
    expect(source).toContain('function readCheckboxLikeState(input) {');
    expect(source).toContain('const mutableRules = (config.categoryRules ?? []).filter((rule) => {');
    expect(source).toContain('const allDesiredOn = mutableRules.length > 0 && mutableRules.every((rule) => desiredStates[rule.id] === true);');
    expect(source).toContain('const allDesiredOff = mutableRules.length > 0 && mutableRules.every((rule) => desiredStates[rule.id] === false);');
    expect(source).toContain('if (allDesiredOn && clickElement(config.bannerAcceptSelectors)) {');
    expect(source).toContain('if (allDesiredOff && clickElement(config.bannerRejectSelectors)) {');
    expect(source).toContain('let usedRejectBaseline = false;');
    expect(source).toContain('config.customRejectBaseline');
    expect(source).toContain('await waitForKetchRulesState(mutableRules, false, 1500);');
    expect(source).toContain('if (usedRejectBaseline && !desired) continue;');
    expect(source).toContain('await applyKetchRuleState(rule, desired);');
    expect(source).toContain('const trustCurrentState = options.trustCurrentState !== false;');
    expect(source).toContain('if (interactionTarget && interactionTarget !== control) {');
    expect(source).toContain("{ id: 'behavioral_advertising', labels: ['behavioral advertising', 'advertising'], desired: (prefs) => Boolean(prefs.advertising) }");
    expect(source).toContain("{ id: 'personalization', labels: ['personalization'], desired: (prefs) => Boolean(prefs.functional) || prefs.uncategorized === 'accept' }");
    expect(source).toContain("(config.categoryRules ?? []).map((rule) => [rule.id, Boolean(rule.desired(prefs))])");
    expect(source).not.toContain('behavioral_advertising: Boolean(prefs.advertising) && prefs.ccpaDoNotSell === false');
    expect(source).toContain('site_override:accept_all');
    expect(source).toContain('exitKetchPrivacyCenter(config)');
    expect(source).toContain("siteOverrides.alwaysAccept ? 'accept_all' : prefs.globalPreference");
  });

  it('detects Ketch sites that open a preferences panel directly (no banner)', () => {
    // isKetchSite() must cover the full set of modal/panel IDs — not just #ketch-banner —
    // so generic handler fires on sites that show the preference panel before any banner.
    expect(source).toContain("'#ketch-banner, #ketch-consent-banner, #ketch-modal, #ketch-purposes-modal, #ketch-preferences, #ketch-preference-panel, [id^=\"ketch-banner-button\"]'");
  });

  it('retries isKetchSite() after document_idle for lazy-loading Ketch banners', () => {
    // OLLY, Dollar Shave Club, and Clear Eyes render their Ketch banner 1–3 s after
    // document_idle.  scheduleDynamicSiteSpecificWatch must schedule cheap DOM retries
    // so the watcher starts before the extension's handling window closes.
    expect(source).toContain("for (const ms of [1000, 2500, 5000]) {");
    expect(source).toContain("if (!siteSpecificWatchStarted && isKetchSite()) scheduleDynamicSiteSpecificWatch();");
  });

  it('reports partial WooCommerce and Magento platform support through the existing site-warning path', () => {
    expect(source).toContain('async function reportDomResult(result, prefs) {');
    expect(source).toContain('async function syncPlatformSupportWarning(result, prefs) {');
    expect(source).toContain('function shouldManagePlatformSupportWarning(result) {');
    expect(source).toContain('function getPlatformSupportWarning(result, prefs) {');
    expect(source).toContain("method.startsWith('dom:woocommercestorenotice')");
    expect(source).toContain("method.startsWith('dom:magentocookie')");
    expect(source).toContain("method.startsWith('dom:bigcommercecatalyst')");
    expect(source).toContain("type: 'REPORT_UNSUPPORTED_SITE'");
    expect(source).toContain("type: 'CLEAR_UNSUPPORTED_SITE'");
    expect(source).toContain('WooCommerce store notices are only dismissible banners, not full consent managers.');
    expect(source).toContain('Magento’s native cookie notice only exposes an allow-or-close flow.');
    expect(source).toContain('switch this site to Accept All.');
  });

  it('has a dedicated config for The RealReal (privacy-page-only Ketch, no banner)', () => {
    expect(source).toContain("'www.therealreal.com'");
    expect(source).toContain("'therealreal.com'");
    expect(source).toContain("siteLabel: 'The RealReal'");
    expect(source).toContain("cooldownScope: 'therealreal'");
    // No banner selectors — avoids false positives on their main site pages.
    expect(source).toContain("bannerWatchSelectors: [],\n    bannerAcceptSelectors: [],\n    bannerRejectSelectors: [],\n    bannerManageSelectors: [],");
    // Entry selectors cover CCPA/USNat footer links.
    expect(source).toContain("'text:your privacy choices'");
    expect(source).toContain("'text:do not sell or share my personal information'");
  });

  it('handles Ketch USNat banner semantics (I UNDERSTAND / DO NOT SELL / MANAGE PREFERENCES)', () => {
    // Dollar Shave Club and similar USNat-only Ketch deployments use different button text.
    expect(source).toContain("'text:i understand'");
    expect(source).toContain("'text:do not sell'");
    expect(source).toContain("'text:opt out'");
  });

  it('uses data-nav-action:confirm as a language-agnostic save selector for the new Ketch SDK', () => {
    // Ketch SDK (Tailwind/React build) encodes {"action":"confirm"} in the save button's
    // data-nav attribute (base64 JSON). This avoids relying on translated button text.
    expect(source).toContain("'data-nav-action:confirm'");
    expect(source).toContain("selector.startsWith('data-nav-action:')");
    expect(source).toContain('function findButtonByNavAction(action)');
    expect(source).toContain("JSON.parse(atob(raw))");
    expect(source).toContain("decoded?.action === action");
  });

  it('fails Ketch flows if the privacy center cannot actually be exited and keeps LiveRamp rooted on the homepage', () => {
    expect(source).toContain("'liveramp.com': {");
    expect(source).toContain("'www.liveramp.com': {");
    expect(source).toContain("homeUrl: 'https://liveramp.com/'");
    expect(source).toContain("homeUrl: 'https://www.liveramp.com/'");
    expect(source).toContain("consentCookieName: '_ketch_consent_v1_'");
    expect(source).toContain('if (shouldUseDirectKetchCookieFlow(config)) {');
    expect(source).toContain("await handleKetchViaConsentCookie(siteOverrides, prefs, config, { persistOnly: true });");
    expect(source).toContain('const { persistOnly = false } = options;');
    expect(source).toContain("analytics: buildLiveRampKetchPurpose('analytics', Boolean(prefs?.analytics))");
    expect(source).toContain('const essentialServicesEnabled = true;');
    expect(source).toContain("essential_services: buildLiveRampKetchPurpose('essential_services', essentialServicesEnabled)");
    expect(source).toContain("behavioral_advertising: buildLiveRampKetchPurpose('behavioral_advertising', Boolean(prefs?.advertising))");
    expect(source).toContain('const cookieOptions = {');
    expect(source).toContain("writeCookie('_swb_consent_', payloads.swb, cookieOptions)");
    expect(source).toContain("writeCookie('_swb_consent__metadata', payloads.metadata, cookieOptions)");
    expect(source).toContain('safeLocalStorageSet(config.consentCookieName, payloads.ketch)');
    expect(source).toContain("safeLocalStorageSet('_swb_consent_', payloads.swb)");
    expect(source).toContain("safeLocalStorageSet('_swb_consent__metadata', payloads.metadata)");
    expect(source).toContain("behavioral_advertising: buildLiveRampSwbPurpose('behavioral_advertising', Boolean(prefs?.advertising), 'consent_optin')");
    expect(source).toContain("essential_services: buildLiveRampSwbPurpose('essential_services', essentialServicesEnabled, 'consent_optout')");
    expect(source).toContain('function createLiveRampConsentMetadata() {');
    expect(source).toContain('function readLiveRampJsonState(key) {');
    expect(source).toContain("decodeBase64JsonCookie(safeLocalStorageGet(key))");
    expect(source).toContain('function liveRampConsentMatches(prefs) {');
    expect(source).toContain("swb.purposes?.essential_services?.allowed === String(essentialServicesEnabled)");
    expect(source).toContain('function suppressLiveRampBanner(durationMs = 15000) {');
    expect(source).toContain("domain: '.liveramp.com'");
    expect(source).toContain("sameSite: 'None'");
    expect(source).toContain('return btoa(JSON.stringify(value));');
    expect(source).toContain('site_specific:ketch:cookie');
    expect(source).toContain('postSaveWaitMs: 5000');
    expect(source).toContain('skipExitAfterSave: true');
    expect(source).toContain("'data-nav-action:close'");
    expect(source).toContain("'data-nav-action:back'");
    expect(source).toContain('const postSaveWaitMs = config.postSaveWaitMs ?? 2000;');
    expect(source).toContain('const dismissed = await waitForSelectorsToDisappear(config.bannerWatchSelectors, postSaveWaitMs);');
    expect(source).toContain("} else if (!(await exitKetchPrivacyCenter(config))) {");
    expect(source).toContain('async function exitKetchPrivacyCenter(config) {');
    expect(source).toContain('if (!isKetchPrivacyCenterPage(config)) return true;');
    expect(source).toContain('location.reload();');
    expect(source).toContain('return !isKetchPrivacyCenterPage(config);');
  });

  it('watches late-rendering Bloomberg and Forbes site-specific flows', () => {
    expect(source).toContain('DYNAMIC_SITE_SPECIFIC_HOSTS');
    expect(source).toContain("'forbes.com'");
    expect(source).toContain("'www.bloomberg.com'");
    expect(source).toContain("'www.forbes.com'");
    expect(source).toContain("'www.ketch.com'");
    expect(source).toContain("'ketch.com'");
    expect(source).toContain('scheduleDynamicSiteSpecificWatch()');
    expect(source).toContain('new MutationObserver(() => {');
    expect(source).toContain("const settings = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });");
    expect(source).toContain("const siteOverrides = await chrome.runtime.sendMessage({ type: 'GET_SITE_OVERRIDES', domain: site }) ?? {};");
    expect(source).toContain('const prefs = resolvePrefs(settings, siteOverrides);');
    expect(source).toContain('document.documentElement.dataset.emcPref = prefs.globalPreference;');
    expect(source).toContain("const keepWatchingAfterHandle = site === 'forbes.com' || site === 'www.forbes.com' || site === 'www.ketch.com' || site === 'ketch.com';");
    expect(source).toContain('const watchDurationMs = keepWatchingAfterHandle ? 120000 : 15000;');
    expect(source).toContain('if (handled && !keepWatchingAfterHandle) stop();');
    expect(source).toContain('}, watchDurationMs);');
    expect(source).toContain('let siteSpecificFlowLock = null;');
    expect(source).toContain('function startSiteSpecificFlowLock(scope, ttlMs = 4000) {');
    expect(source).toContain('function isSiteSpecificFlowLocked(scope) {');
  });

  it('queues reload-on-save flows for post-reload reporting instead of crediting them immediately', () => {
    expect(source).toContain("document.addEventListener('__emc_pre_handle__'");
    expect(source).toContain('document.documentElement.dataset.emcRunSignature = currentRunSignature;');
    expect(source).toContain('persistPendingPreHandleAction(signature, detail.method, preference, detail.expectedGroups ?? null);');
    expect(source).toContain('startFlowCooldown(runCooldownScope(signature));');
    expect(source).toContain('REJECT_RELOAD_GUARD_HOSTS = new Set([');
    expect(source).toContain("'www.cnbc.com'");
    expect(source).toContain("'www.nbcnews.com'");
    expect(source).toContain("'www.thomsonreuters.com'");
    expect(source).toContain("'thomsonreuters.com'");
    expect(source).toContain("const preference = detail.preference ?? document.documentElement.dataset.emcPref ?? 'reject_all';");
    expect(source).not.toContain('firePreHandleAction(detail.method, preference, actionToken);');
    expect(source).not.toContain('markHandledForCurrentPage(signature);');
    expect(source).toContain('const flushedPendingPreHandleAction = await flushPendingPreHandleAction(currentRunSignature);');
    expect(source).toContain('if (!force && flushedPendingPreHandleAction) return;');
    expect(source).toContain('if (payload.expectedGroups && !oneTrustConsentGroupsMatch(payload.expectedGroups)) {');
    expect(source).toContain('const cooldownScope = runCooldownScope(currentRunSignature);');
    expect(source).toContain('!shouldRetryOneTrustAfterReload(currentRunSignature)) return;');
    expect(source).toContain('function shouldRetryOneTrustAfterReload(signature) {');
    expect(source).toContain("const ONETRUST_RELOAD_RETRY_SELECTORS = [");
    expect(source).toContain("navigationEntry?.type !== 'reload'");
  });

  it('waits briefly for an in-progress main-world OneTrust flow before falling back to DOM handling', () => {
    expect(source).toContain('const MAIN_WORLD_FLOW_GRACE_MS = 4000;');
    expect(source).toContain('const MAIN_WORLD_FLOW_IN_PROGRESS_TTL_MS = 12000;');
    expect(source).toContain('let currentMainWorldFlow = null;');
    expect(source).toContain('currentMainWorldFlow = {');
    expect(source).toContain('timestamp: Date.now(),');
    expect(source).toContain('const mainWorldGraceResult = await waitForMainWorldGraceResult(currentRunSignature);');
    expect(source).toContain('function hasFreshMainWorldFlowInProgress(signature) {');
    expect(source).toContain('async function waitForMainWorldGraceResult(signature) {');
    expect(source).toContain('return waitForMainWorldResult(MAIN_WORLD_FLOW_GRACE_MS);');
  });

  it('limits OneTrust reload retries to active consent surfaces, not persistent footer openers', () => {
    expect(oneTrustRetrySelectors).toContain('#onetrust-banner-sdk');
    expect(oneTrustRetrySelectors).toContain('.save-preference-btn-handler');
    expect(oneTrustRetrySelectors).not.toContain('#onetrust-pc-btn-handler');
    expect(oneTrustRetrySelectors).not.toContain('.ot-sdk-show-settings');
  });

  it('holds Shopify custom on the main-world path and redispatches prefs while the API initializes', () => {
    expect(source).toContain('SHOPIFY_MAIN_WORLD_TIMEOUT_MS = 5000');
    expect(source).toContain("if (prefs?.globalPreference === 'accept_all') {");
    expect(source).toContain("if (prefs?.globalPreference === 'reject_all') {");
    expect(source).toContain("if (prefs?.globalPreference !== 'custom') return false;");
    expect(source).toContain("await reportAction('site_specific:shopify:accept_all', prefs.globalPreference);");
    expect(source).toContain("await reportAction('site_specific:shopify:reject_all', prefs.globalPreference);");
    expect(source).toContain('return activateShopifyButton(el);');
    expect(source).toContain('function activateShopifyButton(el) {');
    expect(source).toContain('const preferShopifyMainWorld = shouldUseShopifyMainWorldOnly(prefs);');
    expect(source).toContain('const mainWorldTimeoutMs = preferShopifyMainWorld');
    expect(source).toContain('const mainWorldResultPromise = waitForMainWorldResult(');
    expect(source).toContain('shouldUseExtendedOneTrustMainWorldTimeout()');
    expect(source).toContain('const ONETRUST_MAIN_WORLD_TIMEOUT_MS = 12000;');
    expect(source).toContain('? ONETRUST_MAIN_WORLD_TIMEOUT_MS');
    expect(source).toContain('preferShopifyMainWorld ? prefs : null');
    expect(source).toContain("document.dispatchEvent(new CustomEvent('__emc_prefs__', { detail: prefs }));");
    expect(source).toContain('const mainWorldResult = await mainWorldResultPromise;');
    expect(source).toContain('function shouldUseShopifyMainWorldOnly(prefs) {');
    expect(source).toContain('function shouldUseExtendedOneTrustMainWorldTimeout() {');
    expect(source).not.toContain("const ONETRUST_RELOAD_RETRY_SELECTORS = [\n  '#onetrust-banner-sdk',\n  '#onetrust-consent-sdk',\n  '#onetrust-pc-sdk',\n  '#onetrust-pc-btn-handler'");
    expect(source).toContain("input[id^='ot-group-id-']");
    expect(source).toContain("if (prefs?.globalPreference !== 'custom') return false;");
    expect(source).toContain("if (prefs?.globalPreference !== 'custom' || shopifyWatchStarted) return;");
    expect(source).toContain("'#shopify-pc__prefs__header-save'");
    expect(source).toContain("intervalId = setInterval(() => {");
    expect(source).toContain("document.dispatchEvent(new CustomEvent('__emc_prefs__', { detail: redispatchPrefs }));");
  });
});

describe('dom-handler.js — platform/CMP coverage', () => {
  const source = readSource('content/dom-handler.js');

  it('includes Pandectes handlers for accept, reject, custom, and CCPA-style custom flows', () => {
    expect(source).toContain('PANDECTES_ACTIONABLE_SURFACE_SELECTORS');
    expect(source).toContain("cmp.id === 'pandectes'");
    expect(source).toContain('executePandectesFlow');
    expect(source).toContain('platformCustomMethodForPrefs(\'pandectes\'');
    expect(source).toContain('#pandectes-banner');
    expect(source).toContain('#pd-cp-preferences');
  });

  it('includes Consentmo shadow-root handling for custom category flows', () => {
    expect(source).toContain('CONSENTMO_ACTIONABLE_SURFACE_SELECTORS');
    expect(source).toContain("cmp.id === 'consentmo'");
    expect(source).toContain('executeConsentmoFlow');
    expect(source).toContain('findConsentmoHost');
    expect(source).toContain('consentmoShadowRoot');
    expect(source).toContain('waitForConsentmoDismissal');
    expect(source).toContain('setConsentmoCategoryState');
    expect(source).toContain('setConsentmoSwitchState');
    expect(source).toContain('csm-cookie-consent');
  });

  it('hardens Complianz for view-preferences layouts with category rows and save buttons', () => {
    expect(source).toContain('COMPLIANZ_OPEN_SELECTORS');
    expect(source).toContain('COMPLIANZ_SAVE_SELECTORS');
    expect(source).toContain('setComplianzCategoryState');
    expect(source).toContain('.cmplz-category');
    expect(source).toContain('view preferences|manage consent|preferences');
  });

  it('keeps CookieYes advertising separate from CCPA sell-share choices and syncs Borlabs consent cookies', () => {
    expect(source).toContain("'#ccb-coiOverlay'");
    expect(source).toContain("'#ccb-coi-banner-wrapper'");
    expect(source).toContain("'#ccb-show_details'");
    expect(source).toContain("'#show_details'");
    expect(source).toContain('function wantsAdvertisingCategoryConsent(prefs) {');
    expect(source).toContain('return Boolean(prefs?.advertising);');
    expect(source).toContain('const desiredAdvertising = wantsAdvertisingCategoryConsent(flowPrefs);');
    expect(source).not.toContain("const desiredAdvertising = Boolean(flowPrefs.advertising) && flowPrefs.ccpaDoNotSell === false;");
    expect(source).toContain("['switch-cookie_cat_marketing', 'cookie_cat_marketing'],");
    expect(source).toContain('syncBorlabsGoogleConsentCookie(flowPrefs);');
    expect(source).toContain('function syncBorlabsGoogleConsentCookie(prefs) {');
    expect(source).toContain("analytics_storage: prefs.analytics ? 'granted' : 'denied'");
    expect(source).toContain("functionality_storage: prefs.functional ? 'granted' : 'denied'");
    expect(source).toContain("ad_storage: wantsAdvertisingCategoryConsent(prefs) ? 'granted' : 'denied'");
    expect(source).toContain("document.dispatchEvent(new Event('borlabs-cookie-consent-saved'));");
  });

  it('uses Civic purpose values for IAB custom toggles and accepts the dedicated close button class', () => {
    expect(source).toContain("'.ccc-close-button'");
    expect(source).toContain('.ccc-notify-link');
    expect(source).toContain('/(?:cookie preferences|settings|cookie mix|customi[sz]e)/i');
    expect(source).toContain('async function ensureCookieControlCivicPreferenceCenterVisible() {');
    expect(source).toContain('async function expandCookieControlCivicIabSections() {');
    expect(source).toContain('async function finalizeCookieControlCivicPreferences(cmp) {');
    expect(source).toContain('const controller = window.ClickControl ?? window.CookieControl;');
    expect(source).toContain("if (controller && typeof controller.hide === 'function') {");
    expect(source).toContain("'#iab-purpose button[aria-controls]'");
    expect(source).toContain("const purposeId = `${toggle.value || match?.[1] || ''}`.trim();");
    expect(source).toContain("const advertisingIds = new Set(['2', '3', '4', '5', '6', '8', '11']);");
    expect(source).toContain("const analyticsIds = new Set(['7', '9', '10']);");
    expect(source).toContain("const functionalIds = new Set(['1']);");
  });

  it('uses Truendo consent-state APIs and cookie sync before falling back to the panel UI', () => {
    expect(source).toContain('const apiResult = await executeTruendoApiFlow(prefs);');
    expect(source).toContain('async function executeTruendoApiFlow(prefs) {');
    expect(source).toContain('buildTruendoDesiredState(flowPrefs);');
    expect(source).toContain('syncTruendoConsentCookie(desiredState);');
    expect(source).toContain('window.Truendo[methodName]();');
    expect(source).toContain("`truendo_cmp=${encodeURIComponent(JSON.stringify(next))}`");
    expect(source).toContain('await waitForTruendoConsentState(desiredState, 2500)');
  });

  it('waits for Truendo transient panels to close instead of treating the floating fab as a blocking banner', () => {
    expect(source).toContain('async function waitForTruendoTransientSurfacesToClose(timeoutMs = 5000) {');
    expect(source).toContain("'#truendo_container [data-cy=\"tru-panel\"]'");
    expect(source).toContain("'#truendo_container [data-cy=\"tru-panel-close\"]'");
    expect(source).toContain("'#truendo_container button.tru_title__close'");
    expect(source).toContain("'#truendo_container div[class*=\"tru_cookie-dialog\"]'");
    expect(source).toContain('if (await waitForTruendoTransientSurfacesToClose(5000)) {');
    expect(source).toContain('if (!(await waitForTruendoTransientSurfacesToClose(5000))) return false;');
    expect(source).not.toContain('waitForDismissal(cmp, selectorActions(truendoDismissSelectors()), 5000)');
  });
});

describe('service-worker.js — unsupported-site badge clearing', () => {
  const source = readSource('background/service-worker.js');

  it('refreshes the tab badge when unsupported-site state is cleared', () => {
    expect(source).toContain('clearUnsupportedSiteAndRefresh');
    expect(source).toContain("if (message.type === 'CLEAR_UNSUPPORTED_SITE')");
    expect(source).toContain('await updateBadge(stats.totalActionsCount ?? 0, settings.showBadgeCount, tabId);');
    expect(source).toContain('sender.tab?.id ?? tabIdOverride');
  });

  it('handles always-accept override and tab reload atomically in the service worker', () => {
    expect(source).toContain("if (message.type === 'ACCEPT_SITE_AND_RELOAD')");
    expect(source).toContain('handleAcceptSiteAndReload(message.domain, message.tabId)');
    expect(source).toContain('async function handleAcceptSiteAndReload(domain, tabId)');
    expect(source).toContain('await setSiteOverride(domain, { alwaysAccept: true, disabled: false })');
  });

  it('dedupes repeated actions by page and preference even if different handlers report success', () => {
    expect(source).toContain('const dedupKey = duplicateActionKey({ site, preference }, sender);');
    expect(source).toContain('return `${site}:${preference}:${documentId}`;');
    expect(source).toContain('return `${tabId}:${frameId}:${site}:${preference}:${pageUrl}`;');
  });

  it('keeps Bloomberg CCPA handling open until the Sourcepoint privacy manager actually dismisses', () => {
    expect(source).toContain('const isPrivacyManagerVisible = () => [');
    expect(source).toContain('const clickSaveAndClose = () => {');
    expect(source).toContain('const waitForPrivacyManagerDismissal = async (timeoutMs = 5000) => {');
    expect(source).toContain("'.sp_choice_type_SE'");
    expect(source).toContain("'.sp_choice_type_SAVE_AND_EXIT'");
    expect(source).toContain('if (!clickSaveAndClose()) return false;');
    expect(source).toContain('if (await waitForPrivacyManagerDismissal(3000)) return true;');
    expect(source).toContain('return waitForPrivacyManagerDismissal(3000);');
  });

  it('keeps Bloomberg CCPA execution scoped to the US privacy-manager frame', () => {
    expect(source).toContain('const isBloombergUsPrivacyManager =');
    expect(source).toContain('/sourcepointcmp\\.bloomberg\\.com\\/us_pm\\//i.test(href)');
    expect(source).toContain("document.querySelector('.pm-us') != null");
    expect(source).toContain('/do not sell|do not share|opt out of sale/i.test(bodyText)');
    expect(source).toContain('if (!isBloombergUsPrivacyManager) {');
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

  it('routes OneTrust CCPA privacy-choice flows from structural selectors and group ids, but only CNBC reloads on save', () => {
    expect(source).toContain('const ONETRUST_OPEN_CONTROL_SELECTORS = [');
    expect(source).toContain("'#ot-do-not-sell'");
    expect(source).toContain("'a[onclick*=\"ToggleInfoDisplay\"]'");
    expect(source).toContain("'.df-privacy-compliance'");
    expect(source).toContain('const ONETRUST_CCPA_STRUCTURAL_SELECTORS = [');
    expect(source).toContain('const ONETRUST_CCPA_GROUP_ID_RE = /^[A-Z]+_BG$/;');
    expect(source).toContain('function isOneTrustPrivacyChoicesCcpaFlow() {');
    expect(source).toContain('function isOneTrustCcpaEntry(entry) {');
    expect(source).toContain("document.querySelector(ONETRUST_CCPA_STRUCTURAL_SELECTORS.join(', '))");
    expect(source).toContain('return hasVisibleSelector(ONETRUST_OPEN_CONTROL_SELECTORS);');
    expect(source).not.toContain('const ONETRUST_PRIVACY_CHOICES_ENTRY_TEXT_RE =');
    expect(source).toContain('ONETRUST_RELOAD_ON_SAVE_HOSTS = new Set([');
    expect(source).toContain("'www.cnbc.com'");
    expect(source).toContain("'www.thomsonreuters.com'");
    expect(source).toContain("'thomsonreuters.com'");
    expect(source).toContain("document.dispatchEvent(new CustomEvent('__emc_pre_handle__', {");
    expect(source).toContain('expectedGroups,');
    expect(source).toContain('method,');
  });

  it('includes Schwab in the OneTrust privacy-choice host allowlists', () => {
    expect(source).toContain("'www.schwab.com'");
    expect(source).toContain("'schwab.com'");
    expect(source).toContain("ONETRUST_PRIVACY_CENTER_ACCEPT_HOSTS = new Set(['www.thomsonreuters.com', 'thomsonreuters.com', 'www.schwab.com', 'schwab.com'])");
  });

  it('treats an already-open OneTrust settings modal as actionable without requiring an opener click', () => {
    expect(source).toContain('ONETRUST_ACTIONABLE_SURFACE_SELECTORS');
    expect(source).toContain('const settingsVisible = hasVisibleSelector(ONETRUST_PREFERENCE_CENTER_SELECTORS);');
    expect(source).toContain('const actionableSurfaceVisible = hasVisibleSelector(ONETRUST_ACTIONABLE_SURFACE_SELECTORS);');
    expect(source).toContain('const privacyChoicesEntryVisible = hasVisibleOneTrustPrivacyChoicesEntry();');
    expect(source).toContain('const privacyChoicesEntryPresent = hasAnyOneTrustPrivacyChoicesEntry();');
    expect(source).toContain('if (!settingsVisible && !actionableSurfaceVisible && !privacyChoicesEntryPresent) {');
    expect(source).toContain('const ONETRUST_PREFERENCE_CENTER_SELECTORS = [');
    expect(source).toContain('const { opened, scrollPosition } = openOneTrustPreferenceCenter(host, { settingsVisible, allowContinue: true });');
    expect(source).toContain('ensureOneTrustPreferenceCenterVisible(ONETRUST_PREFERENCE_CENTER_SELECTORS, 4000)');
    expect(source).toContain('function hasAnyOneTrustPrivacyChoicesEntry() {');
  });

  it('treats CNBC Continue as the opener into OneTrust privacy settings', () => {
    expect(source).toContain('clickOneTrustContinueToSettings');
    expect(source).toContain('/\\bcontinue\\b/i.test(text)');
  });

  it('uses CCPA-specific OneTrust method labels without forcing Thomson Reuters into cleanup-only handling', () => {
    expect(source).toContain("handleOneTrustPrivacyCenterReject('cmp_api:OneTrust:ccpa', prefs)");
    expect(source).toContain('const ONETRUST_FORCE_CLEANUP_HOSTS = new Set([]);');
    expect(source).toContain('const ONETRUST_AGGRESSIVE_CLEANUP_HOSTS = new Set([]);');
    expect(source).toContain("return prefs?.globalPreference !== 'custom' &&");
    expect(source).toContain('prefs.ccpaDoNotSell !== false &&');
    expect(source).toContain('(isOneTrustPrivacyChoicesCcpaFlow() || hasAnyOneTrustPrivacyChoicesEntry());');
    expect(source).toContain('shouldSkipOneTrustApiDomSync(host)');
    expect(source).toContain('shouldUseVisualOneTrustApiDomSync(host)');
  });

  it('defers incomplete custom prefs and routes all actionable OneTrust custom flows through the preference center', () => {
    expect(source).toContain('if (!hasCompleteCustomPrefs(_prefs)) return;');
    expect(source).toContain("if (pref === 'custom') return;");
    expect(source).toContain("if (prefs.globalPreference === 'custom') {");
    expect(source).toContain('return handleOneTrustCustom(prefs);');
    expect(source).not.toContain('shouldUseOneTrustCustomFlow');
    expect(source).toContain("const ONETRUST_PRESERVE_DOM_CLOSE_HOSTS = new Set(['www.canadiantire.ca'])");
    expect(source).toContain('const ONETRUST_VISUAL_HIDE_CLOSE_HOSTS = new Set([]);');
    expect(source).toContain('const ONETRUST_SKIP_CONFIRM_HOSTS = new Set([');
    expect(source).toContain("'www.zoom.com', 'www.fifa.com', 'fifa.com'");
    expect(source).toContain("'www.fifa.com',\n    'fifa.com',\n    'www.reuters.com'");
    expect(source).toContain('const ONETRUST_SKIP_API_DOM_SYNC_HOSTS = new Set([');
    expect(source).toContain("'www.zoom.com'");
    expect(source).toContain('function installZoomOneTrustPrivacyChoicesBridge()');
    expect(source).toContain("event.target?.closest?.('#ot-do-not-sell')");
    expect(source).toContain(".ot-sdk-show-settings:not(#ot-do-not-sell)");
    expect(source).not.toContain('scheduleZoomOneTrustFooterReopenRepair');
    expect(source).toContain('closeOneTrustPreferenceCenterIfVisible');
    const customIdx = source.indexOf("if (prefs.globalPreference === 'custom') {");
    const ccpaIdx = source.indexOf('if (shouldUseOneTrustPrivacyCenterOptOut(prefs)) {');
    expect(customIdx).toBeGreaterThan(-1);
    expect(ccpaIdx).toBeGreaterThan(customIdx);
  });

  it('deduplicates OneTrust category IDs so empty duplicate rows cannot overwrite richer mappings', () => {
    expect(source).toContain('const entries = new Map();');
    expect(source).toContain('text.length > prev.text.length');
    expect(source).toContain('return Array.from(entries.values());');
  });

  it('tries the real OneTrust reject UI before falling back to raw RejectAll() state sync', () => {
    expect(source).toContain("const rejectSelectors = [");
    expect(source).toContain("'#onetrust-reject-all-handler'");
    expect(source).toContain('!preferPreferenceCenterPersistence &&');
    expect(source).toContain("const rejectResult = await handleOneTrustPrivacyCenterReject('cmp_api:OneTrust', prefs);");
    expect(source).toContain('if (rejectResult) return rejectResult;');
    expect(source).toContain("if (prefs.globalPreference === 'reject_all' &&");
    expect(source).toContain('typeof w.OneTrust?.RejectAll === \'function\'');
    const rejectResultIdx = source.indexOf("const rejectResult = await handleOneTrustPrivacyCenterReject('cmp_api:OneTrust', prefs);");
    const rejectAllIdx = source.indexOf('w.OneTrust.RejectAll()', rejectResultIdx);
    expect(rejectAllIdx).toBeGreaterThan(rejectResultIdx);
  });

  it('uses OneTrust APIs first inside privacy-center accept/reject flows and only then falls back to toggle helpers', () => {
    expect(source).toContain('async function applyOneTrustPrivacyCenterState(checked) {');
    expect(source).toContain('if (applyOneTrustBulkStateViaApi(checked)) {');
    expect(source).toContain('const host = window.location.hostname;');
    expect(source).toContain('if (!hadVisibleToggles || shouldSkipOneTrustApiDomSync(host)) return true;');
    expect(source).toContain('if (shouldUseVisualOneTrustApiDomSync(host)) {');
    expect(source).toContain('setOneTrustCategoryEntriesSilently(checked);');
    expect(source).toContain('setOneTrustTogglesNow(checked);');
    expect(source).toContain('function applyOneTrustBulkStateViaApi(checked) {');
    expect(source).toContain('function shouldSkipOneTrustApiDomSync(host = window.location.hostname) {');
    expect(source).toContain('function shouldUseVisualOneTrustApiDomSync(host = window.location.hostname) {');
    expect(source).toContain('window.OneTrust.Accept()');
    expect(source).toContain('window.OneTrust.RejectAll()');
  });

  it('lets OneTrust privacy-center flows self-dispatch success after the active surfaces are gone', () => {
    expect(source).toContain('async function finalizeOneTrustHandled(method, timeoutMs = 5000, host = window.location.hostname) {');
    expect(source).toContain('waitForDismissal(ONETRUST_VISIBLE_SELECTORS, timeoutMs)');
    expect(source).toContain('await settleOneTrustAfterAction(host);');
    expect(source).toContain('return finalizeOneTrustHandled(method, 5000, host);');
    expect(source).toContain("return commitOneTrustPreferenceProfile(prefs, 'cmp_api:OneTrust:custom', host, scrollPosition);");
    expect(source).toContain('async function commitOneTrustPreferenceProfile(');
    expect(source).toContain('applyMethodOverride = null');
    expect(source).toContain('if (!clicked) {');
    expect(source).toContain('restoreScrollPosition(scrollPosition);');
    expect(source).toContain('schedulePreservedOneTrustStateSync(host, expectedGroups);');
    expect(source).toContain('scheduleOneTrustApiVisualStateSync(expectedGroups);');
    expect(source).toContain('scheduleOneTrustPostSaveSettle(host, scrollPosition, expectedGroups);');
    expect(source).toContain('function scheduleOneTrustPostSaveSettle(host = window.location.hostname, scrollPosition = null, expectedGroups = null) {');
    expect(source).toContain('const onSettingsOpenerClick = (event) => {');
    expect(source).toContain('if (!event.isTrusted) return;');
    expect(source).toContain('document.addEventListener(\'click\', onSettingsOpenerClick, true);');
    expect(source).toContain('document.removeEventListener(\'click\', onSettingsOpenerClick, true);');
    expect(source).toContain('function syncPreservedOneTrustPreferenceCenter(host = window.location.hostname, expectedGroups = null) {');
    expect(source).toContain('hideVisibleOneTrustSurfaces();');
  });

  it('silently reconciles API-saved OneTrust groups whenever the preference center reopens', () => {
    expect(source).toContain('function scheduleOneTrustApiVisualStateSync(expectedGroups = null) {');
    expect(source).toContain('if (!hasVisibleSelector(ONETRUST_PREFERENCE_CENTER_SELECTORS)) return;');
    expect(source).toContain('applyOneTrustToggleSilentById(`ot-group-id-${id}`, Boolean(checked));');
    expect(source).toContain('ONETRUST_OPEN_CONTROL_SELECTORS.join(\', \')');
  });

  it('can open OneTrust preference centers through ToggleInfoDisplay-backed controls', () => {
    expect(source).toContain('button[data-type="cmpFooterLink"]');
    expect(source).toContain("'a[onclick*=\"ToggleInfoDisplay\"]'");
    expect(source).toContain('function invokeOneTrustToggleInfoDisplay() {');
    expect(source).toContain('window.OneTrust.ToggleInfoDisplay();');
    expect(source).toContain('function openOneTrustPreferenceCenter(host = window.location.hostname');
    expect(source).toContain('const scrollPosition = captureScrollPosition();');
    expect(source).toContain('scrollPosition: opened ? scrollPosition : null');
    expect(source).toContain('function ensureOneTrustPreferenceCenterVisible(selectors, timeoutMs = 4000) {');
  });

  it('tries to close any remaining visible OneTrust surface after consent is already written', () => {
    expect(source).toContain('function closeVisibleOneTrustSurface() {');
    expect(source).toContain('function hideVisibleOneTrustSurfaces() {');
    expect(source).toContain("'#onetrust-close-btn-container button'");
    expect(source).toContain('.onetrust-close-btn-handler.ot-close-icon.banner-close-button');
    expect(source).toContain('while (Date.now() - closeStarted < 1500) {');
    expect(source).toContain("if (document.cookie.includes('OptanonConsent=')) {");
  });

  it('treats _BG privacy-choice groups as CCPA controls before label-based category mapping', () => {
    expect(source).toContain('// Privacy-choice `_BG` groups are semantic opt-out controls even when the');
    const ccpaIdx = source.indexOf('if (isOneTrustCcpaEntry(entry)) {');
    const targetingIdx = source.indexOf('/targeting|advertising|marketing|social media|sale of personal data|share of personal data/i.test(text)');
    expect(ccpaIdx).toBeGreaterThan(-1);
    expect(targetingIdx).toBeGreaterThan(ccpaIdx);
  });

  it('uses visual-only post-api OneTrust DOM sync on Reuters-class hosts where synthetic toggle events are unsafe', () => {
    expect(source).toContain("const ONETRUST_SKIP_API_DOM_SYNC_HOSTS = new Set([");
    expect(source).toContain("'www.zoom.com'");
    expect(source).toContain("const ONETRUST_VISUAL_API_DOM_SYNC_HOSTS = new Set([");
    expect(source).toContain("'www.reuters.com'");
    expect(source).toContain("'reuters.com'");
    expect(source).toContain("'www.thomsonreuters.com'");
    expect(source).toContain("'thomsonreuters.com'");
    expect(source).toContain('applyOneTrustToggleSilentById');
    expect(source).toContain('setOneTrustCategoryEntriesSilently(checked);');
  });

  it('has a dedicated OneTrust privacy-center accept path for Thomson Reuters-style pages', () => {
    expect(source).toContain("ONETRUST_PRIVACY_CENTER_REJECT_HOSTS = new Set(['www.thomsonreuters.com', 'thomsonreuters.com'])");
    expect(source).toContain("ONETRUST_PRIVACY_CENTER_ACCEPT_HOSTS = new Set(['www.thomsonreuters.com', 'thomsonreuters.com', 'www.schwab.com', 'schwab.com'])");
    expect(source).toContain("if (prefs.globalPreference === 'accept_all' && shouldUseOneTrustPrivacyCenterAccept(prefs, window.location.hostname))");
    expect(source).toContain('const forcePrivacyCenterReject = shouldUseOneTrustPrivacyCenterReject(host);');
    expect(source).toContain('const preferPreferenceCenterPersistence = settingsVisible ||');
    expect(source).toContain('handleOneTrustPrivacyCenterAccept');
    expect(source).toContain('return commitOneTrustPreferenceProfile(prefs, method, window.location.hostname, scrollPosition);');
  });

  it('uses Shopify privacyBanner and customerPrivacy APIs before falling back to DOM work', () => {
    expect(source).toContain('privacyBanner: async (w, prefs) => {');
    expect(source).toContain('if (!w.privacyBanner) return false;');
    expect(source).toContain("if (prefs.globalPreference === 'custom') return false;");
    expect(source).toContain("const bannerClicked = prefs.globalPreference === 'accept_all'");
    expect(source).toContain("'#shopify-pc__banner__btn-accept'");
    expect(source).toContain("'#shopify-pc__banner__btn-decline'");
    expect(source).toContain("return 'cmp_api:Shopify';");
    expect(source).toContain("typeof w.privacyBanner.showPreferences === 'function'");
    expect(source).toContain('getShopifyConsentApi');
    expect(source).toContain('waitForShopifyConsentApi');
    expect(source).toContain('submitShopifyConsent');
    expect(source).toContain('waitForShopifyConsent');
    expect(source).toContain('closeShopifyPrivacyUi');
    expect(source).toContain('cleanupShopifyPrivacyArtifacts');
    expect(source).toContain('cmp_api:Shopify:custom');
    expect(source).toContain("'#shopify-pc__prefs__header-save'");
    expect(source).toContain("w.Shopify?.customerPrivacy ?? w.Shopify?.trackingConsent ?? null");
    expect(source).toContain("normalizeShopifyConsent(current.preferences) === desiredConsent.preferences");
    expect(source).toContain('return activateVisibleElement(el);');
    expect(source).toContain('function activateVisibleElement(el) {');
  });

  it('uses explicit CookieScript controls for custom mode instead of the generic acceptAction shortcut', () => {
    expect(source).toContain('return handleCookieScriptCustom(prefs);');
    expect(source).toContain("'cookiescript_category_functionality'");
    expect(source).toContain("'cookiescript_category_performance'");
    expect(source).toContain("'cookiescript_category_targeting'");
    expect(source).toContain("'cookiescript_category_unclassified'");
    expect(source).toContain("'cmp_api:CookieScript:custom'");
    expect(source).toContain('setCookieScriptToggleStateById');
    expect(source).toContain('setCookieScriptSelectStateById');
    expect(source).toContain('clickCookieScriptButtonByText');
    expect(source).toContain("'#cookiescript_manage_wrap'");
    expect(source).not.toContain("instance.acceptAction(categories);");
  });

  it('uses Cookiebot custom category consent and hides the dialog after verification', () => {
    expect(source).toContain('const desiredState = buildCookiebotDesiredState(prefs);');
    expect(source).toContain('waitForCookiebotConsentState(desiredState, 2500)');
    expect(source).toContain('w.Cookiebot.submitCustomConsent(');
    expect(source).toContain('w.Cookiebot.withdraw()');
    expect(source).toContain('w.Cookiebot.hide?.();');
    expect(source).toContain("'cmp_api:Cookiebot:custom'");
  });

  it('treats the Truendo cookie as the primary consent source and returns success after dispatch', () => {
    expect(source).toContain("document.cookie.split('; ').find((entry) => entry.startsWith('truendo_cmp='))");
    expect(source).toContain('const verified = await waitForTruendoConsentState(w, desiredState, 4000);');
    expect(source).toContain("method: prefs.globalPreference === 'custom'");
    expect(source).toContain('return true;');
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

  it('routes DOM OneTrust CCPA privacy-center flows from structural selectors and group ids, but only CNBC reloads on save', () => {
    expect(source).toContain('const ONETRUST_OPEN_CONTROL_SELECTORS = [');
    expect(source).toContain("'#ot-do-not-sell'");
    expect(source).toContain("'a[onclick*=\"ToggleInfoDisplay\"]'");
    expect(source).toContain("'.df-privacy-compliance'");
    expect(source).toContain('const ONETRUST_CCPA_STRUCTURAL_SELECTORS = [');
    expect(source).toContain('const ONETRUST_CCPA_GROUP_ID_RE = /^[A-Z]+_BG$/;');
    expect(source).toContain('function isOneTrustPrivacyChoicesCcpaFlow() {');
    expect(source).toContain('function isOneTrustCcpaEntry(entry) {');
    expect(source).toContain("document.querySelector(ONETRUST_CCPA_STRUCTURAL_SELECTORS.join(', '))");
    expect(source).toContain('return hasVisibleSelector(ONETRUST_OPEN_CONTROL_SELECTORS);');
    expect(source).not.toContain('const ONETRUST_PRIVACY_CHOICES_ENTRY_TEXT_RE =');
    expect(source).toContain("ONETRUST_RELOAD_ON_SAVE_HOSTS = new Set([");
    expect(source).toContain("'www.cnbc.com'");
    expect(source).toContain("'www.thomsonreuters.com'");
    expect(source).toContain("'thomsonreuters.com'");
    expect(source).toContain("document.dispatchEvent(new CustomEvent('__emc_pre_handle__', {");
    expect(source).toContain('expectedGroups,');
    expect(source).toContain('method,');
  });

  it('keeps DOM custom OneTrust flows ahead of the generic CCPA shortcut', () => {
    expect(source).toContain("return prefs?.globalPreference !== 'custom' &&");
    const customIdx = source.indexOf("if (cmp.id === 'onetrust' && prefs.globalPreference === 'custom') {");
    const ccpaIdx = source.indexOf("if (cmp.id === 'onetrust' && shouldUseOneTrustPrivacyCenterOptOut(prefs)) {");
    expect(customIdx).toBeGreaterThan(-1);
    expect(ccpaIdx).toBeGreaterThan(customIdx);
  });

  it('lets the DOM fallback act on an already-open OneTrust settings modal', () => {
    expect(source).toContain('ONETRUST_ACTIONABLE_SURFACE_SELECTORS');
    expect(source).toContain('const settingsVisible = hasVisibleSelector(ONETRUST_PREFERENCE_CENTER_SELECTORS);');
    expect(source).toContain('const actionableSurfaceVisible = hasVisibleOneTrustActionableSurface();');
    expect(source).toContain('const privacyChoicesEntryVisible = hasVisibleOneTrustPrivacyChoicesEntry();');
    expect(source).toContain('if (!settingsVisible && !actionableSurfaceVisible && !privacyChoicesEntryVisible) {');
    expect(source).toContain('const ONETRUST_PREFERENCE_CENTER_SELECTORS = [');
    expect(source).toContain('const { opened, scrollPosition } = openOneTrustPreferenceCenter(host, { settingsVisible, allowContinue: true });');
    expect(source).toContain("'a[onclick*=\"ToggleInfoDisplay\"]'");
    expect(source).toContain('ensureOneTrustPreferenceCenterVisible(ONETRUST_PREFERENCE_CENTER_SELECTORS, 4000)');
  });

  it('treats Investis Cookie Manager as a first-class DOM custom-flow CMP', () => {
    expect(source).toContain("if (cmp.id === 'investiscookiemanager') {");
    expect(source).toContain('executeInvestisCookieManagerFlow');
    expect(source).toContain('INVESTIS_COOKIE_MANAGER_ACTIONABLE_SURFACE_SELECTORS');
    expect(source).toContain("'#cc-CookieSettingPreference'");
    expect(source).toContain("'#cc-cookieAgree'");
    expect(source).toContain("'app-item-functionalCookies'");
    expect(source).toContain("'app-item-performanceCookies'");
    expect(source).toContain("'app-item-marketingCookies'");
    expect(source).toContain('waitForInvestisCookieManagerConsentState');
    expect(source).toContain('cleanupInvestisCookieManagerArtifacts');
  });

  it('deduplicates DOM OneTrust category rows by id before applying custom mappings', () => {
    expect(source).toContain('const entries = new Map();');
    expect(source).toContain('const nextScore = next.text.length + (isOneTrustToggleInteractable(toggle) ? 1000 : 0);');
    expect(source).toContain('return Array.from(entries.values());');
  });

  it('excludes #onetrust-pc-btn-handler from the actionable-surface guard to avoid footer widget false positives', () => {
    const guardStart = source.indexOf('ONETRUST_ACTIONABLE_SURFACE_SELECTORS = [');
    const guardEnd = source.indexOf('];', guardStart);
    const guardBlock = source.slice(guardStart, guardEnd);
    // Must not appear as a live selector string (quoted value), only as a comment.
    expect(guardBlock).not.toMatch(/'#onetrust-pc-btn-handler'/);
    // The parent containers still gate the guard, so real banners are still caught.
    expect(guardBlock).toContain('#onetrust-banner-sdk');
    expect(guardBlock).toContain('#onetrust-consent-sdk');
  });

  it('lets the DOM fallback use CNBC Continue as the settings opener', () => {
    expect(source).toContain('clickOneTrustContinueToSettings');
    expect(source).toContain('/\\bcontinue\\b/i.test(text)');
  });

  it('lets the DOM fallback retry OneTrust preference-center opening through ToggleInfoDisplay when opener clicks do not surface controls', () => {
    expect(source).toContain('function invokeOneTrustToggleInfoDisplay() {');
    expect(source).toContain('window.OneTrust.ToggleInfoDisplay();');
    expect(source).toContain('function openOneTrustPreferenceCenter(host = location.hostname');
    expect(source).toContain('const scrollPosition = captureScrollPosition();');
    expect(source).toContain('function ensureOneTrustPreferenceCenterVisible(selectors, timeoutMs = 4000) {');
    expect(source).toContain('if (!invokeOneTrustToggleInfoDisplay()) return false;');
    expect(source).toContain('const clicked = clickOneTrustSaveButton(host);');
    expect(source).toContain('return completeOneTrustPreferenceCenterAction(cmp, prefs, host,');
  });

  it('uses CCPA-specific DOM method labels without forcing Thomson Reuters through DOM cleanup', () => {
    expect(source).toContain("return { method: `dom:${cmp.id}:ccpa`, cmpName: cmp.name }");
    const cleanupStart = source.indexOf('const ONETRUST_FORCE_CLEANUP_HOSTS = new Set([');
    const cleanupEnd = source.indexOf(']);', cleanupStart);
    const cleanupBlock = source.slice(cleanupStart, cleanupEnd);
    expect(cleanupBlock).not.toContain("'www.zoom.com'");
    expect(cleanupBlock).not.toContain("'www.thomsonreuters.com'");
    expect(cleanupBlock).not.toContain("'www.canadiantire.ca'");
    expect(source).toContain("const ZOOM_ONETRUST_HOSTS = new Set([");
    expect(source).toContain('cleanupZoomOneTrustArtifacts');
    expect(source).toContain("ONETRUST_AGGRESSIVE_CLEANUP_HOSTS = new Set([");
    expect(source).not.toContain("ONETRUST_AGGRESSIVE_CLEANUP_HOSTS = new Set(['www.thomsonreuters.com'");
    expect(source).toContain('scheduleHostOneTrustCleanup(host)');
  });

  it('closes Canadian Tire OneTrust panels without removing the reusable preference-center DOM', () => {
    expect(source).toContain("const ONETRUST_PRESERVE_DOM_CLOSE_HOSTS = new Set([");
    expect(source).toContain("'www.canadiantire.ca'");
    expect(source).toContain('closeOneTrustPreferenceCenterIfVisible');
    expect(source).toContain('await settleOneTrustAfterAction(host);');
  });

  it('treats DOM _BG privacy-choice groups as CCPA controls before label-based category mapping', () => {
    expect(source).toContain('// Privacy-choice `_BG` groups are semantic opt-out controls even when the');
    const ccpaIdx = source.indexOf('if (isOneTrustCcpaEntry(entry)) {');
    const targetingIdx = source.indexOf('/targeting|advertising|marketing|social media|sale of personal data|share of personal data/i.test(text)');
    expect(ccpaIdx).toBeGreaterThan(-1);
    expect(targetingIdx).toBeGreaterThan(ccpaIdx);
  });

  it('tries to close any remaining DOM-visible OneTrust surface after consent is written', () => {
    expect(source).toContain('function closeVisibleOneTrustSurface() {');
    expect(source).toContain('function hideVisibleOneTrustSurfaces() {');
    expect(source).toContain("'#onetrust-close-btn-container button'");
    expect(source).toContain('.onetrust-close-btn-handler.ot-close-icon.banner-close-button');
    expect(source).toContain('while (Date.now() - closeStarted < 1500) {');
    expect(source).toContain("if (document.cookie.includes('OptanonConsent=')) {");
  });

  it('has a dedicated DOM privacy-center accept path for Thomson Reuters-style pages', () => {
    expect(source).toContain("ONETRUST_PRIVACY_CENTER_ACCEPT_HOSTS = new Set([");
    expect(source).toContain("if (cmp.id === 'onetrust' && prefs.globalPreference === 'accept_all' && shouldUseOneTrustPrivacyCenterAccept(prefs, host))");
    expect(source).toContain('executeOneTrustPrivacyCenterAccept');
    expect(source).toContain("return completeOneTrustPreferenceCenterAction(cmp, prefs, host, 'dom:onetrust', cmp.actions?.accept_all ?? [], scrollPosition);");
  });

  it('restores scroll and retries dismissal after DOM OneTrust preference-center saves', () => {
    expect(source).toContain('restoreScrollPosition(scrollPosition);');
    expect(source).toContain('async function waitForOneTrustDismissalAfterSettle(cmp, actions, host, timeoutMs = 4000) {');
    expect(source).toContain('await settleOneTrustAfterAction(host);');
    expect(source).toContain('return waitForDismissal(cmp, actions, 1500);');
    expect(source).toContain('function captureScrollPosition() {');
    expect(source).toContain('function restoreScrollPosition(position) {');
    expect(source).toContain('schedulePreservedOneTrustStateSync(host, expectedGroups);');
    expect(source).toContain('scheduleOneTrustPostSaveSettle(host, scrollPosition, expectedGroups);');
    expect(source).toContain('function scheduleOneTrustPostSaveSettle(host = location.hostname, scrollPosition = null, expectedGroups = null) {');
    expect(source).toContain('function syncPreservedOneTrustPreferenceCenter(host = location.hostname, expectedGroups = null) {');
    expect(source).toContain('hideVisibleOneTrustSurfaces();');
  });

  it('includes Schwab in the DOM OneTrust privacy-choice accept allowlist', () => {
    expect(source).toContain("'www.schwab.com'");
    expect(source).toContain("'schwab.com'");
  });

  it('supports Shopify banner and preferences-dialog handling as a first-class DOM flow', () => {
    const shopifyForceBlock = source.slice(
      source.indexOf('function forceShopifyToggleState(toggle, checked) {'),
      source.indexOf('function scheduleZoomOneTrustCleanup()', source.indexOf('function forceShopifyToggleState(toggle, checked) {')),
    );
    expect(source).toContain('SHOPIFY_ACTIONABLE_SURFACE_SELECTORS');
    expect(source).toContain('SHOPIFY_BANNER_ACCEPT_SELECTORS');
    expect(source).toContain('SHOPIFY_BANNER_DECLINE_SELECTORS');
    expect(source).toContain('SHOPIFY_BANNER_MANAGE_SELECTORS');
    expect(source).toContain('SHOPIFY_PREFS_ACCEPT_SELECTORS');
    expect(source).toContain('SHOPIFY_PREFS_DECLINE_SELECTORS');
    expect(source).toContain('SHOPIFY_PREFS_SAVE_SELECTORS');
    expect(source).toContain('SHOPIFY_PREFS_CLOSE_SELECTORS');
    expect(source).toContain("if (cmp.id === 'shopify') {");
    expect(source).toContain('executeShopifyFlow');
    expect(source).toContain("'#shopify-pc__banner__btn-manage-prefs'");
    expect(source).toContain("'#shopify-pc__prefs__header-save'");
    expect(source).toContain("'#shopify-pc__prefs__header-accept'");
    expect(source).toContain("'#shopify-pc__prefs__header-decline'");
    expect(source).toContain("'#shopify-pc__prefs__header-close'");
    expect(source).toContain("'#privacy-cookie-banner'");
    expect(source).toContain("'#privacy-preferences-modal'");
    expect(source).toContain("'#privacy-banner-manage-preferences-button'");
    expect(source).toContain("'#privacy-preferences-save-button'");
    expect(source).toContain("'shopify-pc__prefs__preferences-input'");
    expect(source).toContain("'shopify-pc__prefs__marketing-input'");
    expect(source).toContain("'shopify-pc__prefs__analytics-input'");
    expect(source).toContain("Boolean(prefs.functional) || prefs.uncategorized === 'accept'");
    expect(source).toContain('setShopifyGroupState(activePrefsRoot');
    expect(source).toContain('setShopifyGroupStateById');
    expect(source).toContain('findShopifyToggleByLabel');
    expect(source).toContain('shopifyToggleText');
    expect(source).toContain('forceShopifyToggleState');
    expect(source).toContain('findShopifyToggleInteractionTarget');
    expect(source).toContain('waitForShopifyToggleState');
    expect(source).toContain('clickFirstVisibleWithin');
    expect(source).toContain('firstVisibleElementWithin');
    expect(source).toContain('const appliedPreferences = await setShopifyGroupState(activePrefsRoot,');
    expect(source).toContain('const appliedMarketing = await setShopifyGroupState(activePrefsRoot,');
    expect(source).toContain('const appliedAnalytics = await setShopifyGroupState(activePrefsRoot,');
    expect(source).toContain('if (!appliedPreferences || !appliedMarketing || !appliedAnalytics) {');
    expect(shopifyForceBlock).not.toContain('findShopifyToggleLabel(toggle)');
    expect(shopifyForceBlock).not.toContain('if (label) dispatchSyntheticClick(label);');
    expect(source).toContain('clickShopifyButtonByText');
    expect(source).toContain("const bannerRoot = firstVisibleElement(['#shopify-pc__banner', '.shopify-pc__banner__dialog', '#privacy-cookie-banner']);");
    expect(source).toContain("const prefsRoot = firstVisibleElement(['#shopify-pc__prefs__dialog', '.shopify-pc__prefs__dialog', '#privacy-preferences-modal']);");
    expect(source).toContain('clickShopifyButtonByText(/accept(?: all)?/i, bannerRoot ?? prefsRoot)');
    expect(source).toContain('clickShopifyButtonByText(/(?:decline|reject)(?: all)?/i, bannerRoot ?? prefsRoot)');
    expect(source).toContain("'#privacy-preferences-modal',");
    expect(source).toContain('/save (?:my )?choices/i');
    expect(source).toContain('/(?:decline|reject) all/i');
    expect(source).toContain('waitForShopifyDismissal');
    expect(source).toContain('shopifyDismissSelectors');
    expect(source).toContain('SHOPIFY_STABLE_HIDDEN_MS = 1500');
    expect(source).toContain('SHOPIFY_DISMISS_TIMEOUT_MS = 7000');
    expect(source).toContain("cmp.id === 'shopify'");
    expect(source).toContain('findVisibleElementById(id, root = document)');
    expect(source).toContain('firstVisibleElement');
  });

  it('has a first-class CookieScript custom DOM flow with category-level controls', () => {
    expect(source).toContain("if (cmp.id === 'cookiescript' && prefs.globalPreference === 'custom') {");
    expect(source).toContain('executeCookieScriptCustomFlow');
    expect(source).toContain('COOKIESCRIPT_ACTIONABLE_SURFACE_SELECTORS');
    expect(source).toContain('COOKIESCRIPT_SAVE_SELECTORS');
    expect(source).toContain('cookieScriptPreferenceSelectors');
    expect(source).toContain('cookieScriptDismissSelectors');
    expect(source).toContain('clickCookieScriptButtonByText');
    expect(source).toContain('setCookieScriptToggleStateById');
    expect(source).toContain('setCookieScriptSelectStateById');
    expect(source).toContain("'cookiescript_category_functionality'");
    expect(source).toContain("'cookiescript_category_performance'");
    expect(source).toContain("'cookiescript_category_targeting'");
    expect(source).toContain("'cookiescript_category_unclassified'");
    expect(source).toContain('Boolean(prefs.advertising) && prefs.ccpaDoNotSell === false');
  });

  it('includes generic WordPress, WooCommerce, Magento, and BigCommerce storefront consent flows', () => {
    expect(source).toContain("if (cmp.id === 'wordpressgdpr') {");
    expect(source).toContain('executeWordPressGdprFlow');
    expect(source).toContain('WORDPRESSGDPR_ACTIONABLE_SURFACE_SELECTORS');
    expect(source).toContain('setWordPressGdprCategoryState');
    expect(source).toContain('findWordPressGdprCategoryToggle');
    expect(source).toContain("'.wpgdprc-consent-bar'");
    expect(source).toContain("'.wpgdprc-consent-bar__settings'");
    expect(source).toContain("'.wpgdprc-consent-bar__button'");
    expect(source).toContain("'.woocommerce-store-notice'");
    expect(source).toContain("'.woocommerce-store-notice__dismiss-link'");
    expect(source).toContain("if (cmp.id === 'bigcommercecatalyst') {");
    expect(source).toContain('executeBigCommerceCatalystFlow');
    expect(source).toContain('BIGCOMMERCE_CATALYST_PLATFORM_SELECTOR');
    expect(source).toContain("meta[name=\"platform\"][content=\"bigcommerce.catalyst\"]");
    expect(source).toContain('persistBigCommerceCatalystConsent');
    expect(source).toContain('buildBigCommerceCatalystConsentPayload');
    expect(source).toContain("fetch('/api/storefront/consent'");
    expect(source).toContain("if (cmp.id === 'magentocookie') {");
    expect(source).toContain('executeMagentoCookieFlow');
    expect(source).toContain('MAGENTO_COOKIE_ACTIONABLE_SURFACE_SELECTORS');
    expect(source).toContain('MAGENTO_COOKIE_ACCEPT_SELECTORS');
    expect(source).toContain('MAGENTO_COOKIE_REJECT_SELECTORS');
    expect(source).toContain("'.message.global.cookie'");
    expect(source).toContain("'.cookie.message'");
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

  it('sourcepoint USNat privacy-manager flow follows the standalone CCPA choice even when cookies are accepted', () => {
    expect(spSource).toContain('function isSourcepointHost');
    expect(spSource).toContain('sourcepointcmp\\.');
    expect(spSource).toContain('if (isPrivacyManagerFrame()) {');
    expect(spSource).toContain('if (isUSNat) {');
    expect(spSource).toContain('await applySourcepointUsNatPrivacyChoice(wantsUsNatOptOut, site, settings.globalPreference)');
    expect(spSource).toContain('const wantsUsNatOptOut = effectiveUsNatOptOut(settings);');
    expect(spSource).toContain('sourcepointUsNatSwitchTargetSelectors');
    expect(spSource).toContain("button.pm-toggle span.on");
    expect(spSource).toContain("button.pm-toggle span.off");
    expect(spSource).toContain('if (!hasConsentSignals() && !isFTShell && !isSourcepointHost(window.location.hostname)) return;');
  });

  it('generic Sourcepoint privacy-manager reject path clicks Reject All before Save and Close', () => {
    expect(spSource).toContain('async function rejectFromPrivacyManager()');
    expect(spSource).toContain("'.sp_choice_type_REJECT_ALL'");
    expect(spSource).toContain("'.sp_choice_type_13'");
    expect(spSource).toContain("'button[data-sp-action=\"REJECT_ALL\"]'");
    expect(spSource).toContain("'text:reject all'");
    expect(spSource).toContain("'text:decline all'");
    expect(spSource).toContain("'text:refuse all'");
    expect(spSource).toContain("'button[title*=\"Do Not Accept\" i]'");
    expect(spSource).toContain("'button[aria-label*=\"Do Not Accept\" i]'");
    expect(spSource).toContain("'text:no, i do not accept'");
    expect(spSource).toContain("'text:i do not accept'");
    expect(spSource).toContain("'text:reject'");
    expect(spSource).toContain("const saveButton = document.querySelector('.sp_choice_type_SAVE_AND_EXIT');");
  });

  it('keeps Sourcepoint class .sp_choice_type_13 out of the generic GDPR accept list', () => {
    expect(spSource).toContain("const GDPR_ACCEPT = [");
    expect(spSource).toContain("'.sp_choice_type_11'");
    const acceptBlock = spSource.slice(
      spSource.indexOf('const GDPR_ACCEPT = ['),
      spSource.indexOf('];', spSource.indexOf('const GDPR_ACCEPT = [')) + 2,
    );
    expect(acceptBlock).not.toContain("'.sp_choice_type_13'");
  });

  it('prefers Sourcepoint structural selectors first for generic accept and manage flows', () => {
    const gdprAcceptBlock = spSource.slice(
      spSource.indexOf('const GDPR_ACCEPT = ['),
      spSource.indexOf('];', spSource.indexOf('const GDPR_ACCEPT = [')) + 2,
    );
    expect(gdprAcceptBlock.indexOf("'.sp_choice_type_11'")).toBeLessThan(
      gdprAcceptBlock.indexOf("'button[data-sp-action=\"ACCEPT_ALL\"]'"),
    );

    const ftNoticeAcceptBlock = spSource.slice(
      spSource.indexOf('const FT_NOTICE_ACCEPT = ['),
      spSource.indexOf('];', spSource.indexOf('const FT_NOTICE_ACCEPT = [')) + 2,
    );
    expect(ftNoticeAcceptBlock.indexOf("'.sp_choice_type_11'")).toBeLessThan(
      ftNoticeAcceptBlock.indexOf("'button[title=\"Accept\"]'"),
    );

    const ftNoticeManageBlock = spSource.slice(
      spSource.indexOf('const FT_NOTICE_MANAGE = ['),
      spSource.indexOf('];', spSource.indexOf('const FT_NOTICE_MANAGE = [')) + 2,
    );
    expect(ftNoticeManageBlock.indexOf("'.sp_choice_type_12'")).toBeLessThan(
      ftNoticeManageBlock.indexOf("'button[title*=\"Manage Cookies\" i]'"),
    );
  });

  it('Bloomberg immediate-dismiss GDPR flow pre-reports before the Sourcepoint frame tears down', () => {
    expect(spSource).toContain("const bloombergImmediateDismissSelectors = [");
    expect(spSource).toContain("site === 'www.bloomberg.com'");
    expect(spSource).toContain("hasVisibleSelector(bloombergImmediateDismissSelectors)");
    expect(spSource).toContain("void report(site, `sourcepoint:${framework}:frame`, settings.globalPreference);");
  });

  it('Bloomberg immediate accept flow reports even when the Sourcepoint frame dismisses immediately', () => {
    expect(spSource).toContain("const bloombergImmediateAcceptSelectors = [");
    expect(spSource).toContain("'.sp_choice_type_11'");
    expect(spSource).toContain("'text:yes, i accept'");
    expect(spSource).toContain('shouldReportBloombergImmediateAccept');
    expect(spSource).toContain('shouldReportDeferredBloombergImmediateAccept');
  });

  it('generic Sourcepoint still routes custom GDPR flows through the non-accept branch', () => {
    expect(spSource).toContain("const accept = settings.globalPreference === 'accept_all';");
    expect(spSource).toContain("selectors = accept ? GDPR_ACCEPT : GDPR_REJECT;");
    expect(spSource).toContain("if (!accept && openPrivacyManager()) return;");
  });

  it('consentmanager frame handler skips BBC and LA Times', () => {
    expect(cmSource).toContain('CM_FRAME_EXCLUDED_SITES');
    expect(cmSource).toContain("'www.bbc.com'");
    expect(cmSource).toContain("'latimes.com'");
    expect(cmSource).toContain("'www.latimes.com'");
    expect(cmSource).toContain("'membership.latimes.com'");
    expect(cmSource).toContain("'www.forbes.com'");
    expect(cmSource).toContain("'www.bloomberg.com'");
    expect(cmSource).toContain("'www.nbcnews.com'");
    expect(cmSource).toContain("'www.zoom.com'");
    expect(cmSource).toContain('CM_FRAME_EXCLUDED_SITES.has(topSite)');
    expect(cmSource).toContain('returnFromDWPrivacyPage');
  });

  it('consentmanager frame handler requires strong CM signals before acting on non-CM pages', () => {
    expect(cmSource).toContain('CM_STRONG_SELECTORS');
    expect(cmSource).toContain('hasStrongConsentManagerSignals');
    expect(cmSource).toContain('window.cmpmngr?.eventwrapper');
    expect(cmSource).toContain('return /consentmanager\\.net|consensu\\.org/.test(host) ||');
    expect(cmSource).not.toContain("REJECT_SELS.concat(ACCEPT_SELS, SETTINGS_SELS, SAVE_SELS).some");
    expect(cmSource).not.toContain("/only necessary|necessary cookies|cmpbox|consentmanager/i");
  });

  it('heuristic fallback skips BBC and LA Times', () => {
    expect(heuristicSource).toContain("'www.bbc.com'");
    expect(heuristicSource).toContain("'latimes.com'");
    expect(heuristicSource).toContain("'www.latimes.com'");
    expect(heuristicSource).toContain("'membership.latimes.com'");
  });

  it('heuristic fallback is disabled for custom preference mode', () => {
    const mainSource = readSource('content/main.js');
    expect(heuristicSource).toContain("if (prefs?.globalPreference === 'custom') return true;");
    expect(mainSource).toContain("if (prefs.globalPreference !== 'custom') {");
    expect(mainSource).toContain('const heuristicResult = runHeuristic(prefs);');
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

  it('dedupes early reload-safe action reports by action token', () => {
    expect(source).toContain('actionToken');
    expect(source).toContain("checkDuplicateAction(`action-token:${actionToken}`)");
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

  it('tolerates __tcfapi calls without a callback on non-guardian hosts', () => {
    const source = readSource('content/tcf-interceptor.js');

    const listeners = new Map();
    const sandbox = {
      window: {
        location: { hostname: 'www.bbc.com' },
        __tcfapi: undefined,
        __tcfapiBuffer: undefined,
      },
      document: {
        addEventListener: vi.fn((name, handler) => listeners.set(name, handler)),
      },
      console: { log: vi.fn(), warn: vi.fn() },
    };

    const context = vm.createContext(sandbox);
    vm.runInContext(source, context);

    listeners.get('__emc_prefs__')?.({
      detail: {
        globalPreference: 'custom',
        functional: true,
        analytics: false,
        advertising: false,
      },
    });

    expect(() => sandbox.window.__tcfapi('ping', 2)).not.toThrow();
    expect(() => sandbox.window.__tcfapi('getTCData', 2)).not.toThrow();
    expect(() => sandbox.window.__tcfapi('removeEventListener', 2)).not.toThrow();
    expect(() => sandbox.window.__tcfapi('unsupportedCommand', 2)).not.toThrow();
  });
});
