# CMP Impact Map

Use this document before making changes to understand which sites a code path touches,
and which sites to re-test after a change lands.

---

## File → CMP family → Sites affected

### Universal files (touch every site)

| File | When it runs | What it does |
|------|-------------|--------------|
| `content/tcf-interceptor.js` | `document_start` MAIN | Intercepts `window.__tcfapi` for GDPR TCF v2.2 |
| `content/gcm-injector.js` | `document_start` MAIN | Sets Google Consent Mode v2 defaults |
| `content/cmp-api-handler.js` | `document_idle` MAIN | Calls CMP JS APIs (OneTrust, Cookiebot, Didomi, etc.) |
| `content/dom-handler.js` | `document_idle` ISOLATED | CSS-selector fallback using `rules/cmps.json` |
| `content/heuristic.js` | `document_idle` ISOLATED | Text-pattern fallback for unrecognized banners |
| `content/main.js` | `document_idle` ISOLATED | Coordinator: loads prefs, routes to tiers, reports stats |

**Any change to these files can affect every site. Minimum retest set: one site per CMP family (see table below).**

### CMP-scoped files (touch one CMP family)

| File | CMP / Sites affected |
|------|---------------------|
| `content/sp-frame-handler.js` | Sourcepoint: NYT, The Verge, Wired, Spiegel, Guardian, FT |
| `content/cm-frame-handler.js` | ConsentManager: DW |
| `content/appconsent-frame-handler.js` | AppConsent |
| `rules/cmps.json` | All DOM-handler CMPs (see CMP family table) |

### Site-specific files (touch exactly one site)

| File | Site |
|------|------|
| `content/bbc-sourcepoint-hook.js` | bbc.com |
| `content/bbc-preferences.js` | bbc.com |
| `content/latimes-privacy.js` | latimes.com |
| `content/latimes-interstitial.js` | latimes.com |
| `main.js` → `handleGuardian*` | theguardian.com, support.theguardian.com |
| `main.js` → `handleFT` | ft.com |
| `main.js` → `handleDW` | dw.com |
| `main.js` → `handleEuronews` | euronews.com |
| `main.js` → `handleLeMonde` | lemonde.fr |
| `main.js` → `ACCEPT_OR_WARN_SITES` | repubblica.it, lefigaro.fr, abc.es, lavanguardia.com, corriere.it, ilsole24ore.com, lastampa.it, ilmessaggero.it |

---

## CMP family → Sites

Use this to understand which sites share the same code path and will behave similarly
(or break together) when a CMP handler changes.

### OneTrust
**Handler files:** `cmp-api-handler.js` (Tier 2) + `dom-handler.js` + `rules/cmps.json`

| Site | Region | Mode | Special notes |
|------|--------|------|--------------|
| `reuters.com` | US/global | GDPR + USNat | Automation-covered |
| `forbes.com` | US/global | GDPR + USNat | Automation-covered |
| `bloomberg.com` | US/global | GDPR + USNat | Automation-covered |
| `cnbc.com` | US | CCPA settings flow | Validated May 12, 2026 in headed Chromium e2e for `reject_all` and `accept_all + ccpaDoNotSell=true`. Important behavioral note: the top-level banner often shows `Continue`, but that button only dismisses the shell. The real opt-out path is the visible `Your Privacy Choices` opener into the OneTrust privacy center. |
| `nbcnews.com` | US | CCPA settings flow | Validated May 13, 2026 in headed Chromium e2e for `reject_all + ccpaDoNotSell=true` and `accept_all + ccpaDoNotSell=true`. Important behavioral note: unlike CNBC, NBC News should use the visible `Your Privacy Choices` entry into the OneTrust privacy center without the CNBC-specific reload-on-save path. |
| `schwab.com`, `client.schwab.com` | US | CCPA settings flow + logged-in client surfaces | Validated May 28, 2026 in live manual browser sessions. `www.schwab.com` resource pages use a OneTrust privacy-choice modal with the `SPD_BG` toggle. `client.schwab.com` also matters to OneTrust/ConsentManager changes because false-positive generic automation previously redirected the logged-in account summary page into `/secured/agreements*`. |
| `disney.com` | US | USNat/CCPA only | In `MAIN_WORLD_ONLY_SITES`. USNat handler: `RejectAll()`/`Accept()` commits consent to cookie, then tries Submit click, falls back to DOM removal if modal persists (isTrusted check confirmed as root cause). Human-validated May 2026. |
| `espn.com` | US | USNat/CCPA only | In `MAIN_WORLD_ONLY_SITES`. Same Disney-family modal and handler path. Human-validated May 2026. |
| `nike.com` | US | USNat/CCPA only | In `MAIN_WORLD_ONLY_SITES`. Dedicated MAIN-world handler in `cmp-api-handler.js` handles `/guest/settings/do-not-share-my-data`: waits for `#a11y-do-not-share`, clicks the checkbox (triggers React `onChange` → sets `ni_c=1PA=0` client-side). E2E-validated May 2026 for `reject_all`. Opt-in reversal not automatable (Nike's React component does not propagate the cookie update for programmatic unchecks). |
| `ft.com` | EU/UK | GDPR | Blocked in `HOST_RESTRICTIONS` for reject — iframe handler takes over |
| `lemonde.fr` | EU | GDPR | Blocked in `HOST_RESTRICTIONS` for reject — site-specific handler takes over |
| `bbc.com` | Global | GDPR + USNat | In `EXPLICIT_ONETRUST_CONTROL_HOSTS`; document-start cookie path preferred |

**Trigger for USNat direct path (new `executeOneTrustUSNatDirect`):**
OneTrust is detected + no privacy-center opener button exists + visible toggles are present directly on the modal.
This path is active for US CCPA opt-out notices where the banner shows a toggle + Submit directly (not behind a settings panel).

**Separate Versant / CNBC-family note (added May 2026):**
These are not the same as the Disney-family USNat direct-toggle flows.
On CNBC, the homepage can start on a top-level OneTrust shell with:
- visible `Continue`
- visible `Your Privacy Choices`
- hidden settings toggle markup already present in the DOM

What matters:
- `Continue` dismisses the shell; it is not the opt-out entry
- `Your Privacy Choices` opens the real OneTrust privacy-center flow
- the correct routing condition is `ccpaDoNotSell !== false`, even when `globalPreference === 'accept_all'`
- already-open settings state must be treated as actionable without requiring another opener click
- live validation for this family should use headed Chromium, because headless shell produced false negatives where the extension coordinator never bootstrapped on the page (`emcPref` stayed unset)

**Separate Schwab note (added May 28, 2026):**
Schwab exposes two distinct risk surfaces that should be kept in mind when changing generic handlers:
- `client.schwab.com/app/accounts/summary/` is not a consent flow, but broad generic frame heuristics can still break it by auto-clicking footer/legal UI and sending the user into `/secured/agreements*`
- `www.schwab.com/resource/amendment-to-account-agreements#` does expose a real OneTrust `Your Privacy Choices` CCPA modal, and that modal uses the `ot-group-id-SPD_BG` toggle plus `Confirm My Choice`

What matters:
- Schwab's public privacy-choice flow belongs in the dedicated OneTrust CCPA privacy-center path, alongside other `ccpaDoNotSell`-aware settings flows
- Schwab's logged-in client pages should not be treated as generic CMP surfaces just because footer/legal links mention agreements or privacy
- changes to `cm-frame-handler.js`, `cmp-api-handler.js`, `dom-handler.js`, or other generic click fallbacks should be spot-checked on both `client.schwab.com` and `www.schwab.com`

**Sites also likely using OneTrust (from Priority 1 CCPA targets, not yet validated):**
`walmart.com`, `target.com`, `foxnews.com`, `homedepot.com`

### Sourcepoint
**Handler files:** `sp-frame-handler.js` (primary, in-iframe) + `cmp-api-handler.js` (secondary, page-level hook)

| Site | Region | Special notes |
|------|--------|--------------|
| `nytimes.com` | US/global | GDPR + USNat; automation-covered |
| `theverge.com` | US/global | Sourcepoint; automation-covered |
| `wired.com` | US/global | Sourcepoint; automation-covered |
| `spiegel.de` | EU | Sourcepoint GDPR; automation-covered |
| `theguardian.com` | Global | USNat via `_sp_.usnat.postRejectAll`; dedicated handler |
| `ft.com` | EU/UK | Cross-origin iframe; dedicated page-level opener + frame handler |

### Didomi
**Handler files:** `cmp-api-handler.js` (Tier 2) + `dom-handler.js` + `rules/cmps.json` + `main.js → handleEuronews`

| Site | Region | Special notes |
|------|--------|--------------|
| `euronews.com` | EU/global | Dedicated handler in `main.js`; automation-covered |

### ConsentManager
**Handler files:** `cm-frame-handler.js` + `main.js → handleDW`

| Site | Region | Special notes |
|------|--------|--------------|
| `dw.com` | EU | Dedicated handler; automation-covered. Extension-driven privacy-page detours should return to content, but manual/footer-opened visits to `data-privacy-settings` must remain on that page. |

### Ketch
**Handler files:** `main.js` (reusable Ketch privacy-center path)

| Site | Region | Special notes |
|------|--------|--------------|
| `forbes.com` | US/global | Ketch-backed privacy center with both banner and full settings surfaces; current handling is routed through the reusable Ketch helpers in `main.js`. |
| `ketch.com` | Demo/global | Useful live fixture for Ketch behavior because it exposes visible category toggles (`Analytics`, `Behavioral Advertising`, `Personalization`, etc.) without the rest of a publisher stack. |

**Future legislation coverage review note (observed May 29, 2026):**
Ketch appears to map geos into multiple privacy-law buckets beyond the currently tested US/EU paths. During manual inspection, the visible legislation mapping included:
- `gdpreea` for many EU / EEA / UK territories
- `ccpaus` for `US-CA`
- `us_privacy_law_states` for states such as `US-CO`, `US-CT`, `US-DE`, `US-IA`, `US-IN`, `US-KY`, `US-MD`, `US-MN`, `US-MT`, `US-NE`, `US-NH`, `US-NJ`, `US-OR`, `US-RI`, `US-TN`, `US-TX`, `US-UT`, `US-VA`
- `canada_quebec` for `CA-QC`
- `Brazil`
- `Australia`
- `IND`

What matters:
- current validation has focused mostly on GDPR-like EU behavior and US flows
- Ketch may present materially different toggle sets, defaults, or legal choices for Quebec, Brazil, Australia, India, and newer US state-law buckets
- future Ketch work should include a legislation-coverage pass, not just per-site DOM validation

### Shopify Customer Privacy
**Handler files:** `main.js` + `cmp-api-handler.js` + `dom-handler.js` + `rules/cmps.json`

| Site | Region | Special notes |
|------|--------|--------------|
| `ceespronkstore.com` | EU | Human-validated May 30, 2026 on a VPN storefront session. Shopify's native consent UI can appear first as a compact lower-left banner (`Accept`, `Decline`, `Manage preferences`) or as the larger preferences dialog, so changes to any of the shared Shopify handlers should be rechecked against both surfaces. |

What matters:
- Shopify can render duplicate consent nodes with the same IDs, so visible-element targeting matters more than `querySelector` first-match behavior.
- The compact banner and the full preferences dialog are both valid entry surfaces; support claims should account for both.
- Geo-sensitive validation matters here: many Shopify storefronts only show this flow consistently from an EU IP.

### Cookiebot
**Handler files:** `cmp-api-handler.js` (Tier 2) + `dom-handler.js` + `rules/cmps.json`

No sites currently in the validated inventory — coverage is generic.

### Iubenda
**Handler files:** `cmp-api-handler.js` (Tier 2) + `dom-handler.js` + `rules/cmps.json`

| Site | Region | Special notes |
|------|--------|--------------|
| `repubblica.it` | EU | Blocked for reject; honest paywall warning shown |
| `lastampa.it` | EU | Accept works; reject is paywall path |
| `ilmessaggero.it` | EU | Accept works; reject is paywall path |
| `ilsole24ore.com` | EU | Accept works; reject is paywall path |

### Le Monde (custom CMP)
**Handler files:** `main.js → handleLeMonde` + `dom-handler.js → "lemonde"` entry in cmps.json

| Site | Special notes |
|------|--------------|
| `lemonde.fr` | Human-validated: all flows work |

### BBC (custom, document-start)
**Handler files:** `bbc-sourcepoint-hook.js`, `bbc-preferences.js`

| Site | Special notes |
|------|--------------|
| `bbc.com` | Cookie injection at document_start; avoids DOM click path entirely |

### LA Times (custom, document-start)
**Handler files:** `latimes-privacy.js`, `latimes-interstitial.js`

| Site | Special notes |
|------|--------------|
| `latimes.com`, `membership.latimes.com` | CCPA via rdp API + c_rdp cookie at document_start |

---

## Change → Minimum retest matrix

When you change a file, test at least the sites marked ✅ below.
Sites marked 🔵 are lower risk but worth a spot-check if time allows.

| Changed file | Must test | Spot-check |
|-------------|-----------|------------|
| `cmp-api-handler.js` | reuters.com, cnbc.com, schwab.com, ceespronkstore.com, nytimes.com, dw.com, euronews.com, theguardian.com | bbc.com, ft.com, lemonde.fr |
| `dom-handler.js` | reuters.com, bloomberg.com, forbes.com, cnbc.com, schwab.com, ceespronkstore.com | euronews.com, dw.com |
| `rules/cmps.json` (OneTrust entry) | reuters.com, bloomberg.com, disney.com | ft.com |
| `rules/cmps.json` (Shopify entry) | ceespronkstore.com | — |
| `rules/cmps.json` (Sourcepoint entry) | nytimes.com, theverge.com | spiegel.de |
| `rules/cmps.json` (Didomi entry) | euronews.com | — |
| `rules/cmps.json` (ConsentManager entry) | dw.com | — |
| `sp-frame-handler.js` | nytimes.com, theverge.com, theguardian.com, ft.com | wired.com, spiegel.de |
| `main.js` (coordinator logic) | reuters.com, cnbc.com, schwab.com, ceespronkstore.com, nytimes.com, lemonde.fr, theguardian.com | dw.com, euronews.com |
| `main.js` (site-specific handler) | Only the one site that handler covers | — |
| `heuristic.js` | Any site where other tiers fail | — |
| `tcf-interceptor.js` | nytimes.com (GDPR), spiegel.de | reuters.com |
| `bbc-*.js` | bbc.com only | — |
| `latimes-*.js` | latimes.com only | — |

---

## The OneTrust USNat modal pattern (learned from Disney/ESPN, May 2026)

**Pattern:** Some US sites (CCPA/California) show a "Notice of Right to Opt Out of Sale/Sharing"
using OneTrust in USNat mode. This modal differs from the standard GDPR banner:

- **No** "Privacy Settings" / "Cookie Settings" opener button
- Toggles (e.g. "Selling, Sharing, Targeted Advertising") appear **directly** on the modal
- The confirm button is `#onetrust-accept-btn-handler` labeled **"Submit"** (not "Accept All")

**How to detect:** `isUSNat = submitBtn && /\bsubmit\b/i.test(submitBtn.textContent)` — no `isVisible` check (button is temporarily invisible during React reconciliation, causing false negatives if gated on visibility).

**Current approach (as of May 2026):**
1. Call `OneTrust.RejectAll()` (reject) or `OneTrust.Accept()` (accept) — commits consent to the `OptanonConsent` cookie immediately.
2. For reject: wait up to 600 ms for DOM toggles to flip OFF. If they stay ON, force them OFF via `setOneTrustTogglesOffNow()` (native setter + events, no label click) before the Submit attempt.
3. Try `dispatchSyntheticClick` on Submit — succeeds on some OneTrust builds.
4. After 400 ms, if modal still visible: call `closeOneTrustUSNatModal()` — tries `OneTrust.Close()`, then removes `#onetrust-banner-sdk`, `#onetrust-pc-sdk`, `.onetrust-pc-dark-filter` from DOM and clears overflow locks. Safe because consent is already committed by step 1.

**Confirmed root cause (May 2026):** Disney's OneTrust build checks `event.isTrusted` on the Submit click handler. Synthetic events (`isTrusted = false`) are silently ignored. Confirmed by: `OptanonConsent` cookie shows `groups=C0004:0,C0002:0` (opt-out saved by `RejectAll()`) but modal remains visible. DOM removal is the correct and safe fallback.

**What we tried and abandoned:**
- Fixed 400 ms delay → Submit click only: isTrusted check blocks synthetic click; modal remained.
- DOM toggle manipulation via `forceOneTrustToggleState()` (native setter + label click): label click triggered React's onClick synchronously → re-render reverted the toggle before Submit read it. Fixed by `setOneTrustTogglesOffNow()` (no label click), kept as pre-click insurance for OneTrust builds that do read DOM toggle state on Submit.
- `isVisible(submitBtn)` in USNat detection: React reconciliation makes button temporarily invisible → false negatives → fell through to GDPR accept path. Fixed by removing the visibility gate.
- Guard returning `false` when toggles visible but Submit absent: caused all SPA polls to defer indefinitely in some timing windows.

**MAIN_WORLD_ONLY_SITES requirement:** All OneTrust USNat sites must be in `MAIN_WORLD_ONLY_SITES`.
Tier 4 (dom-handler.js) for `accept_all` clicks `#onetrust-accept-btn-handler` directly from
cmps.json with no API call, bypassing `ccpaDoNotSell` entirely. For `reject_all`, Tier 4's
`executeOneTrustUSNatDirect` calls `disableVisibleOneTrustToggles()` + Submit, also ignoring
`ccpaDoNotSell`. Without this guard, whichever tier fires first wins and may produce wrong results.

**Sites confirmed using this pattern:** `disney.com`, `espn.com`. Likely also: `disneyplus.com`,
`hulu.com`, `abc.com` (all Disney properties), `nike.com`, and potentially other large US companies
using OneTrust for USNat.

---

## The MutationObserver concurrency anti-pattern (learned May 2026)

**Problem:** Attaching async functions directly as MutationObserver callbacks on React/SPA sites
causes browser freezes. React SPAs produce hundreds of DOM mutations/second. Without a concurrency
guard, each mutation triggers a new concurrent async execution (each holding a 4-second polling
loop), saturating the JS event queue.

**Symptoms:** Browser becomes completely unresponsive on affected sites. Extension popup may
falsely show "Rejected" (false-positive `waitForDismissal` before the real modal disappears).

**Fix pattern:**
```js
// cmp-api-handler.js style: debounce + _trying flag
let _trying = false;
const observer = new MutationObserver(() => {
  if (_handled || _trying) return;
  clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(() => tryHandlers(), 100);
});

// dom-handler.js style: running flag in the closure
let running = false;
const observer = new MutationObserver(async () => {
  if (running) return;
  running = true;
  try { /* work */ } finally { running = false; }
});
```

**Rule:** Any new MutationObserver that wraps async work MUST include a concurrency guard.
Any new async function called from a MutationObserver MUST be idempotent or guarded.

---

## SPA polling strategy (adopted May 2026)

**Problem:** On React/Next.js SPAs (Disney, Bloomberg, etc.), a MutationObserver fires
continuously even after `_handled = true`, because React re-renders DOM on every state change.
This caused a dismiss/re-show loop: the handler re-entered after the banner was dismissed,
clicked Submit again, and kept cycling.

**Root cause:** `_handled = true` stops `tryHandlers()` from running, but only if the
MutationObserver fires AFTER `_handled` is set. On SPAs, the race window between the
handler returning and `_handled` being set (which can span an `await`) creates re-entry.

**Fix:** Detect SPA frameworks at startup and replace the MutationObserver with a fixed
polling schedule. Once `_handled = true`, all scheduled checks are no-ops.

**SPA detection (MAIN world — cmp-api-handler.js):**
```js
function isSPA() {
  return !!(window.__NEXT_DATA__ || window.___gatsby || window.__nuxt__ || window.__vue_app__);
}
```

**SPA detection (ISOLATED world — dom-handler.js, DOM attributes only):**
```js
function isSPA() {
  if (document.getElementById('__next')) return true;
  if (document.querySelector('script#__NEXT_DATA__')) return true;
  if (document.getElementById('__nuxt')) return true;
  if (document.querySelector('[data-v-app]')) return true;
  if (document.documentElement.hasAttribute('ng-version')) return true;
  return false;
}
```

**Polling schedule:** `[300, 800, 1800, 3500, 6000, 10000]` ms for Tier 2;
`[500, 1200, 2500, 4500, 8000]` ms for Tier 4.

**Trade-off:** If a site re-shows a banner AFTER the last polling window (> 10s),
the extension won't catch the re-show. This is intentional — a single banner dismissal
is better than an infinite dismiss/re-show loop.

**Sites classified as SPA by this detection:**
- `disney.com` — Next.js (`__NEXT_DATA__`) ✓
- `espn.com` — Next.js (`__NEXT_DATA__`) ✓ (same Disney infrastructure)

---

## Observer / listener audit (May 2026)

All async event sources audited for loop risk:

| Source | File | Guard | Risk | Notes |
|--------|------|-------|------|-------|
| MutationObserver (Tier 2) | `cmp-api-handler.js` | `_handled` check + SPA polling | Low | Observer disabled for SPAs |
| MutationObserver (Tier 4) | `dom-handler.js` | `running` flag + SPA polling | Low | Observer disabled for SPAs |
| Guardian retry loop | `cmp-api-handler.js` | `_handled` stops interval | Low | 10s lifetime, 400ms cadence |
| FT outcome tracker | `main.js` | `stop()` on match or 20s timeout | Medium | `tick()` async fn called from both setInterval and MutationObserver with no concurrency guard — benign for now (reporting only), but worth adding a guard if FT behavior changes |
| `_sp_queue` hook | `cmp-api-handler.js` | Fires once on SP init | None | One-shot callback |
| Site-specific handlers | `main.js` | `isFlowCoolingDown()` | Low | DW, FT, Euronews all gated |

**One known medium-risk pattern:** `trackFTOutcome()` in `main.js` attaches an async `tick()`
to both a `setInterval` and a `MutationObserver` without a concurrency guard. Concurrent
`tick()` calls are safe today (they only read cookies and call `reportAction`), but if `tick()`
ever does DOM writes, add a `let ticking = false` guard matching the dom-handler.js pattern.

---

## zoom.com loop-detection trigger (observed May 2026)

**Updated finding (May 9, 2026):** Reproduced in a live headed Chromium session with the extension
loaded. The repeated Accept All reports on `zoom.com` were coming from
`content/cm-frame-handler.js`, not from OneTrust. The handler recorded
`consentmanager:frame` three times on the same page and the browser landed on
`https://www.zoom.com/en/trust/acceptable-use-guidelines/`, which then triggered the loop
circuit breaker. Fix: add `www.zoom.com` to the ConsentManager frame-handler skip list.

**Regression note (May 12, 2026):** The same false-positive ConsentManager frame path also showed
up on `www.forbes.com` and `www.bloomberg.com`. Those sites use top-level OneTrust on the
homepage, but incidental CM-like frame patterns were enough for `content/cm-frame-handler.js` to
misfire, which matched reports of homepage redirects and duplicate/triplicate counts. Fix: extend
the frame-handler skip list to include `www.forbes.com` and `www.bloomberg.com`.

**NBC News sibling issue (May 13, 2026):** `www.nbcnews.com` also exposed incidental
ConsentManager-like frame patterns. In live extension-backed tracing, the homepage redirect on
reject was caused by `content/cm-frame-handler.js` recording `consentmanager:frame` and navigating
 to an article page, while the real OneTrust `ot-group-id-SPD_BG` CCPA toggle remained unchanged.
Fix: add `www.nbcnews.com` to the ConsentManager frame-handler skip list, and route NBC News
through the visible OneTrust `Your Privacy Choices` opener instead of the CNBC-specific
reload-on-save path.

**Loop-detection thresholds:** 3 identical reports within 12 s (FAST) or 5 within 45 s (SLOW)
trigger auto-disable. "Identical" = same site + preference + method + page URL.

**OneTrust homepage nuance:** Zoom's homepage can expose `OptanonConsent` /
`OnetrustActiveGroups` with all-accepted values even while a visible collapsed OneTrust shell is
still on screen. That means cookie state is not enough to determine user-visible success here.
The visible Accept control on the homepage shell is the close icon
`.onetrust-close-btn-handler.ot-close-icon.banner-close-button`; a plain DOM `.click()` on that
control successfully dismisses the shell in live testing. The extension now uses that for Zoom's
`accept_all` path.

**Reject All status:** fixed. The Zoom OneTrust privacy-center flow now dismisses correctly for
reject after targeting the real preference-center confirm path and using stricter dismissal checks.

**Custom mapping status:** fixed. Zoom's visible OneTrust categories map cleanly to the extension's
custom settings:
- `C0004` Targeting = `Advertising`, but forced OFF whenever `ccpaDoNotSell` is ON
- `C0003` Functional = `Functional`
- `C0002` Performance = `Analytics`

Verified in a live headed browser session with a mixed custom profile
(`functional=true`, `analytics=false`, `advertising=false`, `ccpaDoNotSell=true`):
`OptanonConsent` was written with `groups=C0004:0,C0003:1,C0002:0,C0001:1`.

**Remaining caveat:** the footer `Your Privacy Choices` / `Cookies Settings` reopen path has been
inconsistent during manual testing, so CCPA verification is still provisional even though the
reject and custom flows now close reliably.
