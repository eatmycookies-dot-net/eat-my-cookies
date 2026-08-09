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

**Manual settings/open invariant (added August 8, 2026):** If the user clicks a footer or privacy/settings link to inspect a CMP surface, automation must stand down. `content/main.js` records a short-lived `__emc_manual_consent_open__` marker for trusted user clicks on cookie/privacy/settings/preferences/choices openers, and the coordinator plus ConsentManager, Sourcepoint, and AppConsent frame handlers check that marker before taking action or reporting a count. Retests for any CMP handler that can reopen settings should prove that a manual opener remains inspectable and does not create another recent activity entry.

### CMP-scoped files (touch one CMP family)

| File | CMP / Sites affected |
|------|---------------------|
| `content/sp-frame-handler.js` | Sourcepoint: NYT, Wired, Spiegel, Guardian, FT |
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
| `main.js` → `handleDW` | dw.com, bernstein-sanitarios.pt |
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
| `theverge.com` | US/global | OneTrust + LiveRamp Launchpad | Live fingerprint on Sunday, July 19, 2026 found OneTrust SDK assets plus Launchpad / LiveRamp privacy scripts. The current non-VPN automation run recorded `dom:onetrust:ccpa`, so do not assume the older Sourcepoint path is still active here. |
| `fifa.com` | US/global | GDPR banner + hidden preference center | Targeted custom-mode e2e added June 20, 2026. The homepage can show a simple top-level OneTrust shell while the full category PC remains hidden in the DOM. |
| `kpmg.com` | US/global | GDPR banner + PC2 preference center | Targeted custom-mode e2e added June 24, 2026. The PC footer exposes both `Submit All Preferences` and `Agree & Proceed`; generic save selection must choose the submit/preferences button and treat agree/proceed as accept-style text. KPMG can also reopen the PC after consent is written, so the shared post-save settle watcher must close or visually hide stale OneTrust surfaces after save. |
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

**Custom-mode routing rule (added June 20, 2026):**
When a OneTrust surface exposes real category controls, `custom` must route through the shared
preference-center flow (`handleOneTrustCustom` / `executeOneTrustCustomFlow`). Host-scoped sets
may tune follow-up behavior such as DOM preservation, confirm skipping, or DOM sync, but they
must not decide whether custom mode is supported at all. FIFA exposed the bug here: collapsing
`custom` to raw `RejectAll()` wrote a reject-style cookie, left the visible shell untouched,
and skipped the real category mapping.

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
| `nytimes.com` | US/global | GDPR + USNat; CCPA path currently drifted to Fides — see live drift note below. Do not trust the "Sourcepoint" label on this row until re-verified. |
| `wired.com` | US/global | Sourcepoint; automation-covered |
| `spiegel.de` | EU | Still genuinely Sourcepoint. Consent-or-pay wall with per-category privacy-manager reject — fixed August 8, 2026, see live drift note below |
| `theguardian.com` | Global | USNat via `_sp_.usnat.postRejectAll`; dedicated handler. Some editions/sections (e.g. `/europe`) serve an EU consent-or-pay wall with no free reject option — see live drift note below (2026-08-09) |
| `ft.com` | EU/UK | Cross-origin iframe; dedicated page-level opener + frame handler |

**Live drift note (added July 19, 2026):**
Do not treat `theverge.com` as a current Sourcepoint regression target without re-probing the live page first. A targeted live fingerprint on Sunday, July 19, 2026 found OneTrust SDK assets plus Launchpad / LiveRamp privacy scripts, and the automated US run recorded `dom:onetrust:ccpa`.

**Live drift note (added August 8, 2026):** Two separate live-site changes on the same day, neither caused by a code change here — this is exactly the class of regression the CMP family drift check (see "CMP family drift detection" below) now catches automatically instead of relying on a maintainer noticing.
- `nytimes.com`: a live VPN/CCPA-path probe found the first-layer banner served by **Fides** (`fides-reject-all-button`, `.fides-banner-button` classes), not Sourcepoint. There is no Fides handler in this codebase yet (no `rules/cmps.json` entry, no `cmp-api-handler.js` API integration), so the only thing that currently clears the banner is `heuristic.js`'s generic text-match fallback — which has no CCPA-specific awareness and doesn't run at all when the user's preference is `custom`. Treat `nytimes.com`'s CCPA/opt-out path as unsupported until real Fides support is added (Tier 2 `window.Fides` API + a declarative DOM rule), not merely "Sourcepoint with a bug." It's plausible NYT is A/B testing Sourcepoint vs. Fides rather than having fully migrated — build the fix as generic Fides detection, not a nytimes.com-specific branch, so it also covers whichever CMP is actually live on a given visit and any other site running Fides.
- `spiegel.de`: still genuinely Sourcepoint (confirmed via live DOM inspection of the actual `sp-spiegel-de.spiegel.de` iframe), but the first-layer banner changed to a consent-or-pay wall (`Consent and continue` / `Subscribe now` / `Preferences` — `sp_choice_type_11` / `9` / `12`) with **no direct Reject All control** (no `sp_choice_type_REJECT_ALL`, no `data-sp-action="REJECT_ALL"`). Rejecting requires clicking "Preferences", which opens a *separate* `privacy-manager` iframe that uses per-category `Accept`/`Reject` button pairs instead of a bulk reject-all control.

  **Fixed August 8, 2026.** Three separate, layered issues had to be fixed together (not a Sourcepoint-wide behavior change — see the shared-function caution in `AGENTS.md`):
  1. `isSPFrame()`/`hasConsentSignals()` were checked once, synchronously, at `document_idle` — before Sourcepoint's own JS had rendered anything on this custom CNAME domain (`sp-spiegel-de.spiegel.de` doesn't match `isSourcepointHost()`'s hostname fast path either), so the frame gave up permanently with no retry. `run()` now polls both checks for up to 6s before giving up — a no-op for every site where these already resolve immediately, since the retry loop's body never executes in that case.
  2. `rejectFromPrivacyManager()` only knew how to click a bulk `.sp_choice_type_REJECT_ALL`. It now falls back to a new `rejectAllPrivacyManagerCategories()` when no bulk control is found: the Reject button is structurally the *last* button in each `.pur-buttons-container` pair, which holds regardless of page language ("Reject"/"Ablehnen"/etc. — confirmed by direct comparison of English and German-locale DOM dumps), so this doesn't need per-locale text matching. It also now waits for the purpose list to actually render before giving up, same rendering-timing issue as (1) one level deeper.
  3. Clicking Save can trigger a full page reload, which destroys the frame's JS execution context mid-flight — anything scheduled to run *after* that point (including the success report) is silently dropped, no error, no catch block runs. The fix reports success *before* clicking Save, once category rejection and a genuinely visible Save control are both confirmed, rather than after a post-click dismissal check that a reload can make unreliable.

  Also uncovered and fixed two unrelated, pre-existing bugs in `tests/validate.js` itself while chasing why the *test* wouldn't reflect the fix even after (1)–(3) landed: `readStatsSnapshot()`'s fallback tried to read `chrome.storage` from `chrome-extension://invalid/`, which never becomes a real extension context, so it silently returned hardcoded zero stats whenever the service worker wasn't visible via `serviceWorkers()`. And real system Chrome — which the harness's headed path tried first — never exposes that service worker at all *and* blocks (`net::ERR_BLOCKED_BY_CLIENT`) direct navigation to the extension's popup/onboarding pages under Manifest V3, so `writePreferences()`'s fallback couldn't work either: preferences silently never got written, and every headed real-Chrome run did nothing for the rest of the suite regardless of what site was under test. Playwright's own Chromium channel doesn't have either gap, so the harness now prefers it over real Chrome.

  **Accept All fixed August 8, 2026 (found after (1)–(3) above, via manual real-Chrome testing on this site's consent-or-pay wall — reject/custom worked but Accept All did not dismiss the banner).** Two more separate, layered bugs, both isolated to this site via host-gating rather than changed shared-default behavior:
  4. `isUSNat`'s framework-classification regex (`/sell|sharing.*personal/i`) used an unbounded `.*` between "sharing" and "personal" that spanned this page's *entire* text content, false-matching unrelated GDPR marketing copy elsewhere on the page (e.g. "personalized advertising" in one sentence, "No sharing of your data" in a wholly unrelated one) and misclassifying this GDPR-only banner as USNat. That routed Accept All's click through `USNAT_ACCEPT` selectors, which don't include `.sp_choice_type_11` (this site's actual Accept control), so nothing was ever clicked. Fixed with a bounded, word-boundaried regex (`/\bsell(?:ing|s)?\b|\bsale\b|shar(?:e|ing)[\s\S]{0,40}personal/i`) — this is a shared-function change (`isUSNat` runs on every Sourcepoint frame), verified with a standalone sanity check against known USNat and GDPR sample text, plus a live re-run confirming real (non-zero) TC consent strings on outgoing ad-partner requests, plus regression passes on `ZEIT` (GDPR/EU) and `The Guardian (US/CCPA)` (genuine USNat, though Guardian routes through its own dedicated handler rather than this shared path). Live re-verification against another real USNat site on the shared generic path was blocked by unrelated CMP drift (`nytimes.com` and `wired.com` have both migrated to Fides — see the drift note above) and an anti-bot wall (`arstechnica.com`), not by this change.
  5. Even after (4) fixed the click itself, the activity report was still silently lost: this site's SP consent iframe self-destructs (is removed from the DOM) within ~1s of a successful Accept click. The report was being sent *after* `waitForDismissal()` confirmed the banner was gone, but that confirmation polls via `setTimeout` inside the same iframe's JS context — once the iframe is torn down that context is discarded mid-poll, and the pending report call never resumes. Real consent was reaching Sourcepoint's backend (confirmed via non-zero TC strings in ad-partner network requests) but our own `stats` recorded nothing. Fixed the same way as (3): report *before* the action that can trigger teardown, not after. Since `tryClick()` dispatches its click immediately, it was split into `findClickTarget()` (locate + validate visibility, no click) and `tryClick()` (calls `findClickTarget` then clicks) — a behavior-preserving refactor used by every caller — so this site's Accept path can report first, then dispatch the click, host-gated to `site === 'www.spiegel.de' && !isUSNat && accept` rather than changing report ordering for any other site.

  **Reject/Custom save delay fixed August 8, 2026 (user-reported: ~5s to save, "ideally 2 seconds max").** Timed the flow end-to-end with a live instrumented Playwright run (network events, MutationObserver on the privacy-manager frame's DOM, timestamped against the moment the purpose list finished rendering). Sourcepoint's own rendering was never the problem — the first-layer banner, the privacy-manager iframe load, and its 7-row purpose list all finished in under 1 second combined. The delay was ~5.8 seconds of complete, measured DOM inactivity immediately after the purpose list rendered, with every reject click landing back-to-back the instant that gap ended — a strong signal the extension itself was stuck waiting on something, not the CMP.
  6. Root cause: `hasVisibleSelector()` (used by `waitForAny()`, which `rejectFromPrivacyManager()` awaits before acting) checked only `document.querySelector(sel)` — the *first* DOM match — not every element matching a selector. Sourcepoint renders one `.pur-buttons-container` per purpose row, and the first one in DOM order was a locked/essential category with a `0×0` `getBoundingClientRect()` (confirmed live), even while all 6 other rows were fully visible and interactive. `hasVisibleSelector()` latched onto that one unrepresentative match, reported "nothing visible yet," and `waitForAny()` polled its entire 6-second timeout budget before `rejectFromPrivacyManager()` proceeded regardless — a delay attributable to nothing, since the elements it needed had already been ready the whole time. Fixed by checking every element returned by `document.querySelectorAll(sel)` instead of stopping at the first match; this is a strict correctness fix (a selector that previously reported visible via its first match still does, so no caller can regress) and applies to every caller of `hasVisibleSelector()`/`waitForAny()`, not just this site. Re-verified live: the privacy-manager frame now opens and reloads (save complete) in well under 1 second, down from ~6 seconds; regression-passed on `ZEIT` and all three Der Spiegel `tests/sites.json` entries (reject, accept, custom).

  Both fixes added standing regression coverage: `Der Spiegel (Accept)` and `Der Spiegel (Custom)` entries in `tests/sites.json`, alongside the existing default (reject) entry. Custom currently exercises the identical `rejectFromPrivacyManager()` code path as reject — Sourcepoint's GDPR privacy-manager handling in this codebase does not read `categoryPreferences` at all, so there is no genuine per-category distinction yet for this CMP family. CCPA/USNat testing does not apply to this site: it is GDPR-only for EU visitors (same reasoning as why `The Guardian (EU/GDPR)` has no CCPA variant in `tests/sites.json` — only Guardian's separate US-region entries do).

  While fixing the delay above, two more real, narrower bugs surfaced and were fixed the same day, both kept in `rejectAllPrivacyManagerCategories()`:
  7. Purpose rows fade in with a staggered per-row animation rather than all becoming interactive at once — confirmed live via a MutationObserver: some rows' Reject buttons were still non-visible for over a second after sibling rows' buttons already were. The single `isVisible()` check per row (no wait/retry) could silently skip whichever categories hadn't finished animating in yet, meaning "reject everything" could previously leave some categories at whatever their unclicked default state was instead of actually rejecting them — verified this was a real (if narrow) gap by re-running with the fix in place and confirming, via the actual outgoing consent save payload (not just the UI), that the correct purposes report `consent:false`. Fixed with a per-element `waitForElementVisible()` retry (2s budget) before each click, and a `waitForStableCount()` wait for the purpose-row count itself to settle before iterating (the earlier delay fix made `waitForAny()` return almost immediately, which could otherwise catch the row list mid-render, before every row had even been added to the DOM).
  8. **Attempted and reverted: category-aware Custom support.** Built a host-gated `applySpiegelCustomPrivacyManagerCategories()` that mapped this site's 7 purpose rows (matched by their rendered German/English text, since Sourcepoint exposes no stable purpose ID reachable from this frame) to `functional`/`analytics`/`advertising`, confirmed the UI visually updated correctly per row (`aria-pressed` matched intent). But inspecting the actual outgoing save network payload (`wrapper/v2/choice/gdpr/1`, `pmSaveAndExitVariables.categories`) showed every custom purpose saved as `"consent":true` regardless of which ones had their Reject button clicked — the visible click state does not reliably reflect what Sourcepoint's own internal (likely React-managed) state machine actually persists for these custom purposes when driven via synthetic DOM events. Shipping that would have been worse than the status quo: it would look like granular consent was honored while silently over-sharing. Reverted back to Custom = full reject (matching Reject's existing behavior, which *was* independently verified correct via the same payload-inspection method: it correctly reports `consent:false` for the purposes it controls and omits the rest rather than misreporting them). Real category-aware Custom support for this site would need a fundamentally different approach — most plausibly calling Sourcepoint's own consent-management JS API directly (if one is exposed on `window` in the right frame) rather than simulating clicks — not a bigger version of the same DOM-click strategy.

**Live drift note (added 2026-08-09): Guardian US CCPA proactive sync, accept_all + ccpaDoNotSell hybrid, EU consent-or-pay wall, and a critical generic-selector safety fix.**

- **US CCPA "Do Not Sell or Share" not applying.** Root cause: the only automatic mechanism (`_sp_.usnat.postRejectAll`) only fired when an interactive banner happened to be visible, but Guardian's CCPA experience for most US visitors is a footer link only ("US resident - Do Not Sell or Share") with no banner shown. Added `syncGuardianUsNatConsent()` in `cmp-api-handler.js` (mirrors the existing OneTrust proactive-sync pattern), wired into `startGuardianRetryLoop()`'s interval so it runs even with no banner present. Deliberately does not report/count, matching the OneTrust precedent, to avoid cluttering the activity log on every SPA page transition. Live-verified: with `ccpaDoNotSell` on, the real footer panel now shows the Sourcepoint toggle opted out (`aria-checked="true"`), previously opted in regardless of the setting.
- **`accept_all` + `ccpaDoNotSell=true` hybrid left the banner open.** User report: "Accept All didn't dismiss the banner in the US... should have clicked on the do not sell options... Accept all without do not sell worked well." Root cause: `handleGuardianAcceptFrame`'s plain close/accept button path never touches the USNat toggle at all, so it silently can't resolve the panel when the user also wants to stay opted out of sale — only the toggle-aware save path (`applyGuardianSupportPrivacyChoice`) can. Added a leading branch in `handleGuardianAcceptFrame(site, preference, wantsUsNatOptOut)`: when `wantsUsNatOptOut` and the privacy manager is open, route through the toggle-aware save (`accept_optout` mode) first. Confirmed live that the underlying `.pm-toggle`/switch-container markup is the same on both Guardian hosts, unlike the plain-accept path, which stays `support.theguardian.com`-only since it was never observed to fail on `www.theguardian.com`.
- **EU consent-or-pay wall, reproduced live on `theguardian.com/europe`.** With a Europe VPN session, this page (unlike the plain GDPR banner elsewhere) offers only "Accept all" or "Reject all and subscribe" (€5/month, `sp_choice_type_9`) — no free reject path.
  - **Critical finding:** this wall's own reject-labeled button has `title`/`aria-label` = "Reject all and subscribe", which the *existing generic* Sourcepoint fallback selectors `[aria-label*="Reject All" i]` and `button[title*="Reject All" i]` in `sp-frame-handler.js` (used across every Sourcepoint site's reject flow, not Guardian-specific) matched via plain substring — confirmed live via a direct `document.querySelector` check in the real iframe (`matched: true`). Before this fix, a reject/custom preference could have caused the extension to auto-click into a paid subscription flow. Fixed with a `PAID_ACTION_TEXT_RE` regex and `looksLikePaidAction(el)` guard, applied inside the shared `findClickTarget()` chokepoint (used by essentially every accept/reject click across every Sourcepoint site) and inside `rejectAllPrivacyManagerCategories()`'s per-row loop. This is a hard behavioral rule, not a Guardian-specific carve-out: no Sourcepoint site's generic reject path may ever click a button whose own text signals payment, regardless of which selector matched it. Live re-verified after the fix on `theguardian.com/europe` with `reject_all`: wall stays up, subscribe button untouched, zero page navigations, and — because nothing was clicked — no false "rejected" stats entry was written either.
  - `www.theguardian.com` (non-`support` host) has no free-reject click flow wired up at all — only `support.theguardian.com` has a real reject handler (`handleGuardianSupportRejectFrame`); the generic host previously just returned early doing nothing for `reject_all`/`custom`, silently, on every page load. Since the pay-wall's "reject" control is now reliably detectable as paid-only via `looksLikePaidAction`, added `guardianRejectIsPaidWallOnly()` + `reportGuardianPaidWallUnsupported()`: when the only visible reject-labeled control is the paid upsell, report it through the same `REPORT_UNSUPPORTED_SITE` path `ACCEPT_OR_WARN_SITES` uses for other consent-or-pay walls (`repubblica.it`, `abc.es`, etc.), with `allowAcceptOverride: true` so the user can still choose to accept from the popup. Live-verified: `chrome.storage.local.unsupportedSites` now records an honest reason for `www.theguardian.com` after visiting the wall with `reject_all`, instead of the previous silent no-op with no explanation. This does not add a generic free-reject click flow for `www.theguardian.com` — that remains explicitly out of scope pending evidence a real free reject control exists on any Guardian page under this host, to avoid reintroducing the reload issues the MAIN-world-only comments on `handleGuardianAcceptFrame` already document.

### Didomi
**Handler files:** `cmp-api-handler.js` (Tier 2) + `dom-handler.js` + `rules/cmps.json` + `main.js → handleEuronews`

| Site | Region | Special notes |
|------|--------|--------------|
| `euronews.com` | EU/global | Dedicated handler in `main.js`; automation-covered |

### ConsentManager
**Handler files:** `cm-frame-handler.js` + `main.js → handleDW`

| Site | Region | Special notes |
|------|--------|--------------|
| `dw.com` | EU/US | Dedicated handler; automation-covered. August 8, 2026 focused reruns cover Accept All, Custom via the first-layer `Settings` link on `/en/top-stories/s-9097`, and the original DW settings/reject path. Extension-driven privacy-page detours must save the real settings surface, return to the original content URL, and clear `__emc_dw_return_pending__` after the detour; manual/footer-opened visits to `data-privacy-settings` must remain on that page and must not create another action count. The DW Accept All fixture verifies that clicking the footer privacy-settings link leaves `Save selection` visible and records no new activity. Accept All must enable eligible purposes and click `Save selection` if DW strands it on the settings page; it must not use the reject-style toggle-off fallback. DW cooldowns are preference-scoped so reject/accept/custom runs do not suppress each other in sequential validation. |
| `bernstein-sanitarios.pt` | EU | Human-validated May 30, 2026. Top-level Consentmanager storefront using `#cmpwrapper` / `#cmpbox` directly in the page rather than a cross-origin frame. The working path must recognize `cmptxt_btn_save`, avoid misclassifying `.cmpboxbtnyescustomchoices` save buttons as accept buttons, and traverse the left-side category navigation so custom prefs apply across `Function`, `Marketing`, `Preferences`, `Measurement`, `Other`, and `Social media` before `Save + Exit`. |

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
| `shopify.com` account pages | US/global | User-supplied account-page evidence on July 25, 2026 showed Shopify's newer native privacy UI using stable IDs such as `#privacy-cookie-banner`, `#privacy-banner-manage-preferences-button`, and `#privacy-preferences-modal`. Fixture coverage now exercises the banner, manage-preferences transition, and generated-checkbox modal path. Live logged-in/session validation is still useful. |

What matters:
- Shopify can render duplicate consent nodes with the same IDs, so visible-element targeting matters more than `querySelector` first-match behavior.
- The compact banner and the full preferences dialog are both valid entry surfaces; support claims should account for both old `shopify-pc__*` storefront markup and newer `privacy-*` account-page markup.
- Geo-sensitive validation matters here: many Shopify storefronts only show this flow consistently from an EU IP.

### Cookiebot
**Handler files:** `cmp-api-handler.js` (Tier 2) + `dom-handler.js` + `rules/cmps.json`

| Site | Region | Special notes |
|------|--------|--------------|
| `allroundautomations.com` | US | Targeted single-site e2e passes June 20, 2026 in custom mode (`preferences=true`, `statistics=false`, `marketing=false`). This Usercentrics-branded Cookiebot build records the correct `CookieConsent` values through `submitCustomConsent()` / `withdraw()`, but the visible dialog does not auto-dismiss afterward; the shared handler now calls `Cookiebot.hide()` after consent-state verification. |

### Usercentrics
**Handler files:** `cmp-api-handler.js` (Tier 2) + `dom-handler.js` + `rules/cmps.json`

| Site | Region | Special notes |
|------|--------|--------------|
| `fedex.com` | US/global | Live-validated August 9, 2026 in a headed real-Chrome run, multiple repeated runs per mode (this used not to work). Confirms `window.UC_UI` is genuinely present (`hasUcUi: true`). All three modes verified end to end, but note there is no clean handler split by mode: each of Reject All, Accept All, and Custom was independently observed completing via *either* the real `UC_UI` service API (`cmp_api:UC_UI:reject_all` / `accept_all` / `custom`) *or* the DOM shadow-root fallback (`dom:usercentrics:reject_all` / `accept_all` / `custom`) across different runs, apparently depending on page-load timing rather than the mode itself. Both paths are legitimate and verified, not a real-handler-vs-weaker-fallback distinction — `tests/sites.json`'s `expectedActivityMethodPrefixes` for all three FedEx entries accepts both prefixes accordingly, and a future test failure asserting only one exact method here would be a false positive, not evidence of a regression. No banner element (`#usercentrics-cmp-ui`) remains visible after any of the three. This is the strongest current live evidence for this CMP family — prefer it over `leadersisland.com` below as the first regression target when touching Usercentrics handling. |
| `leadersisland.com` | US/global | User-supplied browser evidence on July 30, 2026 showed the modern Usercentrics UI mounted as `aside#usercentrics-cmp-ui` with all actionable buttons inside an open shadow root. The shadow DOM fallback can visually dismiss this site without proving service-level consent persistence, so Leaders Island is host-gated to a single MAIN-world owner. That owner first uses `UC_UI` service APIs when available; if they are missing/not ready, it clicks the official Usercentrics shadow UI from MAIN world for Accept All, Reject All, and Custom. The `#usercentrics-cmp-ui` host may measure as zero-height while shadow children are visible, so handler gating must check visible shadow surfaces, not host-box visibility alone. The MAIN-world handler now observes Usercentrics shadow-root mutations because the page can reveal the modal after the document observer and the original 2.5-second retry window have ended. A `UC_UI_CMP_EVENT` confirms that consent was committed but is not by itself proof that the first-layer modal closed; action reporting must wait for the visible Usercentrics surface to disappear, otherwise the counter can increment while the banner remains open and prevent the official UI fallback. Its post-save check also treats opacity-zero/pointer-events-disabled shells as dismissed, allowing the pre-handle action to be counted when Usercentrics keeps an invisible shadow shell in the DOM. Leaders Island's visible `Functional` category is mapped by its analytics/measurement description, so Custom with Analytics off turns that category off. `tests/usercentrics-shadow-extension.js` maps `leadersisland.com` to local zero-host fixtures and covers the real extension/service-worker stats path for shadow UI Accept All, Reject All, and Custom, including 5-second shadow-only visibility, delayed event-before-dismissal on `/en/podcast/`, semantic category mapping, fade-out dismissal, CMP-triggered reload, and no-double-count manual reload. It also covers `window.UC_UI` API Accept, Reject, and Custom with persisted service decisions. Live headless validation from the local environment did not surface a fresh banner, so keep fixture coverage as the regression source until a fresh human/live pass is available. |

### Investis Cookie Manager
**Handler files:** `dom-handler.js` + `rules/cmps.json`

| Site | Region | Special notes |
|------|--------|--------------|
| `inchcape.com` | EU/UK | Public site uses Investis Digital Cookie Manager v3.1 (`#__cookieWrapper`, `#cc-reject-Btn`, `#cc-CookieSettingPreference`) rather than Cookiebot. The reusable DOM flow now covers direct accept/reject plus the modal custom-preferences path (`functionalCookies`, `performanceCookies`, `marketingCookies`). Targeted single-site e2e now passes in `custom` mode, but an EU-IP rerun is still a useful follow-up because the original regression was reported from an EU session. Retest after changes to `dom-handler.js` or `rules/cmps.json`. |

### Complianz
**Handler files:** `dom-handler.js` + `rules/cmps.json`

| Site | Region | Special notes |
|------|--------|--------------|
| `qualityminds.com` | US/global | Single-site e2e passes June 6, 2026 with and without VPN. `Accept`, `Deny`, and `Custom` are now covered through the visible `View preferences` flow. |

### Pandectes
**Handler files:** `dom-handler.js` + `rules/cmps.json`

| Site | Region | Special notes |
|------|--------|--------------|
| `cluse.com` | EU/global | Human-validated June 6, 2026. Public site uses Pandectes rather than Shopify Customer Privacy, so Shopify regressions should not be inferred from this target. |

### GoDaddy Privacy Manager
**Handler files:** `dom-handler.js` + `rules/cmps.json`

New CMP family added June 21, 2026. Two-layer implementation:

**Layer 1 — Shadow DOM banner** (godaddy.com and parked/hosted GoDaddy properties): detected by `#gtm_privacy` (shadow host). Shadow root contains `#pw_banner` and `.pw_buttons` with Reject/Accept/Manage buttons that vary by locale. Handler uses multilingual regex patterns (`/^afwijzen|ablehnen|refuser|rechazar.../i`) plus positional fallback (button order: Manage → Reject → Accept).

**Layer 2 — Preference modal** (afternic.com and any site where the modal appears directly): detected by `#privacy_manager_modal`. Uses GoDaddy's UX design system (`ux-toggle-button-track`, `pm_toggle`, `pm_option`) with `div[role="switch"][aria-checked]` toggle controls. Categories: Advertising, Performance, Support (all optional); Essential (locked, `aria-disabled="true"`). Handler uses `setAriaToggleState` to flip each interactable toggle, then clicks the visible Save button.

Consent persistence is not yet human-validated on either layer.

| Site | Region | Special notes |
|------|--------|--------------|
| `godaddy.com` | US/global | Shadow DOM banner. Seen in Dutch (`/nl`). Multilingual button matching + positional fallback. Pending human validation. |
| `afternic.com` | US | Full preference modal. Tested on `/forsale/sprout.com` without VPN. Pending human validation. |

### Consentmo
**Handler files:** `dom-handler.js` + `rules/cmps.json`

| Site | Region | Special notes |
|------|--------|--------------|
| `barebiology.com` | EU/global | Human-validated June 7, 2026. Public site uses Consentmo inside an open shadow-root custom element. The custom path now relies on the logical switch state (`aria-checked` / nested checkbox) rather than just the visual accept/reject half styling. |

### Cookie Information
**Handler files:** `dom-handler.js` + `rules/cmps.json`

| Site | Region | Special notes |
|------|--------|--------------|
| `cookieinformation.com` | US/global | Single-site e2e passes June 6, 2026 with and without VPN using the visible `Decline all` path. |

### Borlabs Cookie
**Handler files:** `dom-handler.js` + `rules/cmps.json`

| Site | Region | Special notes |
|------|--------|--------------|
| `beumergroup.com` | EU/global | Targeted live e2e passed on Sunday, July 19, 2026 (`dom:borlabs:custom`). |
| `discover-drives.danfoss.com` | EU/global | Targeted live e2e passed on Sunday, July 19, 2026 (`dom:borlabs:custom`). |

`realmaker.de` did not surface a fresh banner in the same pass, so keep additional Borlabs targets on the watch list.

### Cookie Wow
**Handler files:** `dom-handler.js` + `rules/cmps.json`

Public live target still needed for stable regression coverage. Generic analytics/marketing toggle handling is implemented.

### CookieHub
**Handler files:** `dom-handler.js` (`executeCookieHubFlow`) + `rules/cmps.json`

| Site | Region | Special notes |
|------|--------|--------------|
| `monday.com` | US/CCPA | Live-verified 2026-08-09 in a real headed Playwright run with the extension loaded: Reject All, Accept All, and Custom (per-category) all complete and are correctly recorded (`dom:cookiehub:reject_all` / `accept_all` / `custom`). Found via Wappalyzer's public CookieHub customer list, not `cookiehub.com` itself (see below). |

**Live verification (2026-08-09):** The initial pass (see `docs/cmp-roadmap.md` history) added CookieHub as a declarative-only `rules/cmps.json` entry from general knowledge of the product's default theme, without a confirmed live site. `cookiehub.com`'s own marketing site was tried first (the user's example URL, `cookiehub.com/iab-tcf-v23`) but its own CookieHub integration was found genuinely broken at the time (`window.cookiehub.openDialog()` threw `Cannot read properties of undefined (reading 'appendChild')`), so it isn't a usable regression target. Wappalyzer's public "websites using CookieHub" list surfaced real customer sites instead (`monday.com`, `semrush.com`, `yotpo.com`, `plugins.jetbrains.com`, `uploadcare.com`, and others), and `monday.com` was used for live verification.

That verification found the original declarative-only assumptions wrong in two ways: `.ch2-container` is a **class**, not an id (the original entry used `#ch2-container`), and — more importantly — the **first-layer banner in US/CCPA mode has no direct Deny All button at all**, only "Accept all cookies" and a "Cookie settings" opener; Deny All (`.ch2-deny-all-btn`) only exists inside the settings modal (`.ch2-settings`), alongside per-category toggles (`.ch2-settings-option`, checkbox `input.ch2-switch-value`) and a `.ch2-save-settings-btn`. So a plain declarative reject action was silently unreachable for any CCPA-region visitor. Rebuilt as a full `dom-handler.js` flow: Accept All still clicks the first-layer `.ch2-allow-all-btn` directly; Reject All tries a direct `.ch2-deny-all-btn` click first (in case EU/GDPR mode shows one on the first layer — unconfirmed, see below) and otherwise opens settings and clicks its Deny All shortcut; Custom opens settings and sets each category individually.

Category toggles are matched by each option's **visible heading text** (`[role="heading"]` inside `.ch2-settings-option-details`), not CookieHub's internal `name="c-N"` attribute (publisher-configured, not a stable semantic id) — confirmed live as `c-1`=Necessary, `c-2`=Functional, `c-3`=Performance & analytics, `c-4`=Targeting on monday.com, but that numbering is not guaranteed to hold on other installs. First implementation matched against each option's *full* description text, which false-matched the Necessary option (whose own description mentions "ensuring good performance on our site") against the analytics pattern and silently tried to toggle a disabled switch — fixed by matching only the heading.

**Not yet confirmed:** EU/GDPR-mode first-layer banner markup (whether it exposes a direct Reject All, unlike the confirmed US/CCPA behavior) — flagged in `private/human-validation-backlog.md` for VPN-based validation.

### CookieYes
**Handler files:** `dom-handler.js` (`executeCookieYesFlow`) + `rules/cmps.json`

| Site | Region | Special notes |
|------|--------|--------------|
| `emeablog.msasafety.com` | EU | Targeted live e2e passed July 19, 2026 (`dom:cookieyes:custom`), modern `.cky-*` widget markup. |
| `iabeurope.eu` | EU | Legacy self-hosted "Cookie Law Info" WebToffee plugin markup, added as a fixture 2026-08-09 — see the "legacy CookieYes markup" writeup below. Not yet live/headed re-validated. Geo-gated: the plugin only renders the banner for EU-detected IPs (`wt-cli-non-eu-country` body class observed from a non-EU session), so this needs an EU IP/VPN profile to validate. |

**Legacy CookieYes/"Cookie Law Info" markup gap (fixed 2026-08-09):** The current WordPress.org "CookieYes" plugin still ships two markup generations: the modern hosted `.cky-*` widget, and the older self-hosted "Cookie Law Info" plugin markup (`#cookie-law-info-bar`, `.wt-cli-cookie-bar-container`, `.cli_*` classes, `#cliSettingsPopup` modal) that some installs — including `iabeurope.eu`'s own cookie banner, which prompted this investigation — still run (confirmed live by fetching the site's actual bundled plugin JS, `wp-content/plugins/webtoffee-gdpr-cookie-consent/public/js/cookie-law-info-public.js?ver=2.5.3`). `#cookie-law-info-bar` was already a `rules/cmps.json` detector for `cookieyes`, and `executeCookieYesFlow`'s accept/reject click candidates already included the legacy ids (`#cookie_action_close_header`, `#cookie_action_close_header_reject`) — but `COOKIEYES_ACTIONABLE_SURFACE_SELECTORS`, the very first gate the function checks, only listed modern `.cky-*` selectors. So legacy-markup sites got detected (entered the `cookieyes` branch in `tryCMPs()`), then immediately bailed out via `hasVisibleSelector(COOKIEYES_ACTIONABLE_SURFACE_SELECTORS)` returning false — the working legacy click candidates were unreachable dead code. `emeablog.msasafety.com`'s own fixture (`tests/sites.json`) already listed `#cookie-law-info-bar` in `bannerSelectors`, suggesting this was a known-latent gap even before `iabeurope.eu` surfaced it.

Fixed by adding `#cookie-law-info-bar` / `.wt-cli-cookie-bar-container` / `#cliSettingsPopup` / `.cli-modal-dialog` to the actionable-surface and preference-surface selector lists, adding the current plugin's actual accept/reject/settings/save selectors (`.wt-cli-accept-all-btn`, `.cli_action_button[data-cli_action="accept"]`, `.cookie_action_close_header_reject`, `.cli_settings_button`, `#wt-cli-save-preferences-btn`) as additional click candidates, and adding a `setCheckboxStateByIdOrSelector()` helper so the custom-preference category toggles (`.cli-user-preference-checkbox[data-id="checkbox-<category>"]`, mapped from the plugin's default `functional`/`performance`/`advertisement` categories — `marketing` and `non-necessary`/`others` are also tried since some installs relabel them) work alongside the modern widget's `id="ckySwitch<category>"` toggles. None of this touches the modern `.cky-*` path, so `emeablog.msasafety.com` should not regress. **Not yet live-confirmed** — no browser session with the extension loaded was available this pass; the fix is grounded in reading the actual plugin JS served by `iabeurope.eu`, not a live click-through.

### Cookie Control by Civic
**Handler files:** `dom-handler.js` + `rules/cmps.json`

| Site | Region | Special notes |
|------|--------|--------------|
| `cookiecontrol.com` | US/global | Public banner is visible and the generic handler is implemented, but automated validation currently hits an anti-bot challenge. |
| `help.uis.cam.ac.uk` | EU | Targeted live e2e passed on Sunday, July 19, 2026 both without VPN and with the Browsec profile (`dom:cookiecontrolcivic:custom`). |
| `peterborough.gov.uk/cookies` | EU | Visible Civic banner is still present and dismissible, but the July 19 non-VPN run recorded `consentmanager:frame:deferred`, so keep an eye on handler overlap before broadening claims. |
| `childrenscommissioner.gov.uk/privacy/cookies/` | EU | Targeted live e2e failed reproducibly on Sunday, July 19, 2026 with the banner still visible in custom mode. |

### Truendo
**Handler files:** `dom-handler.js` + `rules/cmps.json`

| Site | Region | Special notes |
|------|--------|--------------|
| `truendo.com` | EU/global | Targeted live e2e passed on Sunday, July 19, 2026 (`cmp_api:Truendo:custom`). |
| `sportradar.com` | EU/global | Targeted live e2e passed on Sunday, July 19, 2026 (`cmp_api:Truendo:custom`). |

`laola1.at` did not surface a fresh banner in the sampled session, so keep a second-family retest on the backlog.

### Clickio
**Handler files:** `dom-handler.js` + `rules/cmps.json`

| Site | Region | Special notes |
|------|--------|--------------|
| `diariomotor.com/diariomotor-sin-cookies/` | EU | Targeted live e2e failed reproducibly on Sunday, July 19, 2026 with the banner still visible in custom mode. |

`atelevisao.com` did not surface a fresh banner in the same pass, so keep Clickio out of broad support claims for now.

### cookiesjsr
**Handler files:** `dom-handler.js` + `rules/cmps.json`

| Site | Region | Special notes |
|------|--------|--------------|
| `crealogix.com/en/cookie_docs` | EU | Targeted live e2e passed on Sunday, July 19, 2026 (`dom:cookiesjsr:reject_all`). |
| `pathosense.com/cookies/documentation` | EU | Targeted live e2e passed on Sunday, July 19, 2026 (`dom:cookiesjsr:custom`). |

Generic settings-panel handling is implemented via tab traversal (`performance`, `tracking`, `video`).

### privacymanager.io
**Handler files:** `dom-handler.js` + `rules/cmps.json`

Generic slider-based handling is implemented. Public live target still needed for stable regression coverage.

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
| `lemonde.fr` | Split live behavior. Human-validated from an EU session on August 8, 2026 for both the French root path and `/en/`. The French root path can show a consent-or-pay wall (`Soutenez un journalisme fiable`) where reject/custom are not available without accepting, subscribing, or signing in; the handler must report the site-specific choice warning there and must not record a rejected consent. A site-specific Accept override on this root wall is treated as raw accept only and is validated working: do not run the post-accept settings recovery there, because Le Monde can turn that path into a withdrawal modal (`Souhaitez-vous retirer votre consentement`). If that withdrawal modal is already visible from an automatic recovery attempt, cancel it unless the user manually opened settings. The `/en/` path exposes Le Monde's configurable `gdpr-lmd` CMP and is validated for Reject All, Accept All, Accept All with CCPA do-not-sell, and Custom Functional. Reject clicks only explicit `denyAll`; Accept All uses the settings save path when the configurable surface exists so reopened preferences match the saved state, with `ads=false` only when CCPA do-not-sell is enabled. If the first layer exposes only raw Accept before settings, Accept All with CCPA do-not-sell reopens settings afterward and saves ads off before recording success on `/en/` only. The settings-save path also normalizes the first-party `lmd_consent` purpose map to the intended categories and mirrors the intended payload in extension storage so Le Monde's delayed cleanup cannot turn Custom Functional into reject-all. User-opened footer/settings links are suppressed immediately so users can inspect saved values without auto-dismissal; visible duplicate controls are synced from `lmd_consent` only while the settings surface is visible. Le Monde is gated out of generic DOM fallback so late banners cannot be raw-accepted by the declarative `lemonde` rule before the host-specific settings/CCPA path runs. |

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

## OneTrust toggle manipulation — blast radius and known constraints (June 2026)

`forceOneTrustToggleState`, `disableVisibleOneTrustToggles`, and `enableVisibleOneTrustToggles`
are called from every OneTrust reject, accept, and custom-preference flow in both
`cmp-api-handler.js` (MAIN world) and `dom-handler.js` (ISOLATED world). A behavior change
in any of these silently affects every OneTrust site.

**Known constraint — label click in `forceOneTrustToggleState`:**
The label click at the end of `forceOneTrustToggleState` is intentional. It fires a reverting
`change` event (checked → !checked) immediately after the native setter's `change(false)`.
This tells OneTrust's internal handler "state changed then reverted — nothing to do." Without it,
the single `change(false)` event triggers heavy consent processing on some OneTrust builds
(confirmed: reuters.com became unresponsive / hung). Do not remove this label click from the
shared function.

**How to fix toggle behavior for a specific host without breaking others:**
Create a host-gated function that omits the label click and call it only from that host's code
path. The existing `applyOneTrustToggleDirectById` in `cmp-api-handler.js` is the established
pattern — it is only called from `handleOneTrustCustom`, with `UpdateConsent`-driven DOM sync now
enabled generically except on known-bad hosts (currently zoom.com, where those change events
corrupt OneTrust's reopen state).

**Minimum retest when changing any OneTrust toggle helper or surface router:**
reuters.com, thomsonreuters.com (no hang), people.com or another People-family US privacy-choice
flow, cnbc.com, fifa.com, schwab.com, one simple direct-button banner such as kpmg.com, and at
least one site from the canadiantire.ca / zoom.com custom-preference set.

**Privacy-center state rule (June 21, 2026):**
For OneTrust privacy centers that expose only a settings opener plus `Confirm My Choices`,
prefer `OneTrust.Accept()` / `OneTrust.RejectAll()` first, then use direct DOM sync only as
visual reconciliation, and keep the old label-click toggle helper as the fallback. Thomson
Reuters' homepage and People's US `OSSTA_BG`-style flow are the motivating cases: they are better
modeled as "OneTrust API state + confirm dismissal" than as bespoke per-toggle exceptions.
The routing decision for that CCPA/privacy-choice path is now selector/model-driven rather than
host-driven: route through the CCPA privacy-choice flow only when the rendered OneTrust model
exposes actual opt-out controls such as `_BG` group ids (`OSSTA_BG`, `SPD_BG`) or matching
category-row text. A visible footer opener like `#ot-do-not-sell` / `Your Privacy Choices`
is not sufficient on its own, because Zoom and similar GDPR-style builds can expose that opener
while still using ordinary `C000x` categories underneath.
`custom` must also stay on the real OneTrust custom-preference path even when
`ccpaDoNotSell=true`; otherwise People-family privacy-choice sites collapse to a generic
CCPA/reject flow, record `CCPA handled`, and skip the actual custom category save the user asked
for. Treat "privacy-choice custom" and "privacy-choice reject" as different surface behaviors.
For generic OneTrust opening logic, prefer these surfaces in order:
1. visible banner action buttons (`Reject`, `Reject All`, `Accept All`)
2. explicit preference-center controls (`#onetrust-pc-btn-handler`, `.ot-sdk-show-settings`)
3. `ToggleInfoDisplay`-backed openers such as inline `manage choices` links
This keeps KPMG-style banners in the shared OneTrust model instead of requiring a host exception.
Once a OneTrust settings surface is open, save/confirm selection should be scoped to a visible
preference-center root that actually contains category controls. Do not let a page-level
`#onetrust-accept-btn-handler` outrank the in-modal confirm button just because it appears
earlier in the DOM; that can collapse a reject/custom flow back into an accept-style shell click.
Likewise, do not classify `Agree & Proceed` as a save button. Some PC2 builds, such as KPMG,
place that accept-style button next to the real preference save (`Submit All Preferences`).
Reuters-class hosts (`reuters.com`, `thomsonreuters.com`) are the known exception to that
visual-reconciliation step: once the API state is written, synthetic toggle events should be
avoided because they can re-enter heavy OneTrust processing and freeze the page.
For every API-backed OneTrust save, the handler now also installs a lightweight, page-lifetime
reconciliation listener. When a structural OneTrust settings opener is user-activated, it
silently mirrors the persisted `OptanonConsent` group map into the newly rendered group-id
checkboxes. This is deliberately group-id based, emits no input/change events, and does not
depend on English labels or a site-specific footer-text whitelist. It addresses the class of
"consent stored but Manage Cookies shows defaults" regressions while preserving Reuters' no-event
constraint.
Thomson Reuters also no longer belongs in the forced OneTrust DOM-cleanup bucket: its live
homepage dismisses cleanly through OneTrust's own confirm/reload path, so aggressive node
removal is more likely to destabilize the page than to help.
Because some OneTrust privacy-center flows perform a top-level reload as part of save, the
`content/main.js` cooldown guard now allows one controlled retry after a reload when the same
OneTrust surface is still visible. This keeps reload-backed dismissals from getting stranded
behind the normal 15-second same-page cooldown.
Separately, some privacy-center flows legitimately stay busy longer than the initial
main-world wait window even without a reload: open footer/settings entry, apply API state,
confirm, settle, then dismiss. `content/main.js` now gives a short grace window when a
OneTrust MAIN-world flow has already emitted `__emc_pre_handle__`, so Tier 4 does not race in
and reopen the same modal a second time while the first pass is still finishing.
When the opener used a footer/settings control rather than the currently visible banner button,
capture and restore the page scroll position after the save/dismiss sequence. This prevents
People-family and similar footer-opened OneTrust flows from leaving the user stranded at the
bottom of the page after automation completes.
Some OneTrust builds can also reopen or restyle the preference center shortly after a successful
save even though the `OptanonConsent` groups are correct. The shared post-save settle watcher is
intentionally bounded and observes OneTrust DOM/style mutations briefly after save; if a stale
surface reappears, it closes or visually hides that surface and restores the original scroll.
That watcher is strictly automation-only: a trusted click on a structural OneTrust footer/settings
opener stops it before OneTrust renders the user-requested preference center. Footer review must
show the saved choices and remain interactive; it must never trigger a second dismissal pass.

---

## CMP family drift detection (added August 8, 2026)

`tests/validate.js` checks, on every `npm run test:e2e` invocation (no separate command), whether
the CMP actually present on a site's live page still matches what `tests/sites.json`'s `cmp` field
declares. This exists because both `nytimes.com` and `spiegel.de` drifted on the same day — one
switched CMP family entirely (Sourcepoint → Fides), the other kept its CMP but changed its banner
enough that the existing handler no longer works — and neither showed up as an obvious failure:
the harness's own leniency (an empty `consentSelectors` array vacuously "passing", and no check on
*which* handler actually fired) let both regressions through silently. See the live drift notes
under "Sourcepoint" above for what was actually found.

How it works, deliberately without duplicating `rules/cmps.json`:
- It reuses the same `detectors` (`css_selector`, `js_global`, `script_src`) already declared per
  CMP in `rules/cmps.json` — the file `dom-handler.js` uses at runtime — so a CMP fingerprint only
  ever lives in one place. A small supplemental list in `tests/validate.js`
  (`SUPPLEMENTAL_CMP_SIGNATURES`) covers only the CMPs with no `rules/cmps.json` entry because
  they're handled exclusively by a dedicated frame content script (`AppConsent`, `Ketch`), plus
  `Fides` — not supported, but worth detecting given it's what `nytimes.com` switched to.
- `tests/sites.json`'s free-text `cmp` field (e.g. `"OneTrust / consent-or-pay"`, `"Sourcepoint
  (USNat)"`) is split on `/` and matched by substring against every known CMP id/name, so hybrid
  labels resolve against every family they mention. `"Needs validation"` is treated as nothing to
  compare against.
- The check scans every frame on the page (not just the top frame) for any detector match, and
  only flags a mismatch when it found a *different*, known CMP than the one declared — if nothing
  is detected at all (banner didn't render this run, already consented, geo-gated), that's treated
  as ambiguous, same as the existing SKIP semantics, not evidence of drift.
- It runs immediately after the banner-detection wait, before the harness decides whether to SKIP,
  so a stale `bannerSelectors` assumption (built for the CMP a site *used to* run) doesn't prevent
  the drift itself from being caught.

A CMP family drift failure means **the site changed, not necessarily the code** — re-verify which
handler needs to run there (new CMP entirely, or the same CMP with a changed banner) before
assuming any other test result on that row, or the existing implementation, is at fault.

**Runs on a schedule, not just manually.** `.github/workflows/e2e-weekly.yml` runs the full suite
every Tuesday — non-VPN sites on a GitHub-hosted runner automatically, VPN/geo-gated sites on a
self-hosted runner (see `CONTRIBUTING.md` → "Weekly VPN runner setup"). This is what would have
caught both the `nytimes.com` and `spiegel.de` drift above on the day it happened instead of
whenever someone next ran the suite manually.

---

## Change → Minimum retest matrix

When you change a file, test at least the sites marked ✅ below.
Sites marked 🔵 are lower risk but worth a spot-check if time allows.

| Changed file | Must test | Spot-check |
|-------------|-----------|------------|
| `cmp-api-handler.js` | reuters.com, cnbc.com, fifa.com, schwab.com, ceespronkstore.com, nytimes.com, dw.com, euronews.com, theguardian.com | bbc.com, ft.com, lemonde.fr |
| `dom-handler.js` | reuters.com, bloomberg.com, forbes.com, cnbc.com, schwab.com, ceespronkstore.com | euronews.com, dw.com |
| `rules/cmps.json` (OneTrust entry) | reuters.com, bloomberg.com, disney.com, theverge.com | ft.com |
| `rules/cmps.json` (Shopify entry) | ceespronkstore.com | — |
| `rules/cmps.json` (Complianz entry) | qualityminds.com | — |
| `rules/cmps.json` (Cookie Information entry) | cookieinformation.com | — |
| `rules/cmps.json` (Cookie Control by Civic entry) | cookiecontrol.com, help.uis.cam.ac.uk, childrenscommissioner.gov.uk | peterborough.gov.uk/cookies |
| `rules/cmps.json` (Sourcepoint entry) | nytimes.com | wired.com, spiegel.de |
| `rules/cmps.json` (Didomi entry) | euronews.com | — |
| `rules/cmps.json` (ConsentManager entry) | dw.com, bernstein-sanitarios.pt | — |
| `dom-handler.js` (`executeCookieHubFlow`) / `rules/cmps.json` (CookieHub entry) | monday.com | semrush.com, yotpo.com, plugins.jetbrains.com |
| `dom-handler.js` (`executeCookieYesFlow`) | emeablog.msasafety.com (modern `.cky-*` markup) | iabeurope.eu (legacy markup, needs EU IP/VPN) |
| `sp-frame-handler.js` | nytimes.com, theguardian.com, ft.com | wired.com, spiegel.de |
| `main.js` (coordinator logic) | reuters.com, cnbc.com, schwab.com, ceespronkstore.com, nytimes.com, lemonde.fr, theguardian.com | dw.com, bernstein-sanitarios.pt, euronews.com |
| `main.js` (site-specific handler) | Only the one site that handler covers | — |
| `heuristic.js` | Any site where other tiers fail | — |
| `tcf-interceptor.js` | nytimes.com (GDPR), spiegel.de, zeit.de | reuters.com |
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

**Footer reopen-path update (June 12, 2026):** Zoom's footer openers are
`#ot-do-not-sell.ot-sdk-show-settings` (`Your Privacy Choices`) and a second
`.ot-sdk-show-settings` link (`Cookie Preferences`). The old Zoom-specific cleanup path was too
destructive: it removed `#onetrust-pc-sdk` plus broad `.ot-sdk-container` / `.ot-sdk-row`
scaffolding after consent handling, which could break those footer reopen links even though the
banner itself had been dismissed successfully. Fixed by narrowing Zoom cleanup to remove only
currently visible OneTrust surfaces, leaving the hidden reusable preference-center structure intact
for later footer-triggered reopens.

**Footer opener update (July 19, 2026):** Zoom exposes two structural OneTrust openers:
`#ot-do-not-sell.ot-sdk-show-settings` (`Your Privacy Choices`) and its sibling
`.ot-sdk-show-settings` (`Cookie Settings`). After a reload, Zoom's own first control can fail
silently while the sibling opens the native preference center immediately. The extension bridges
only `#ot-do-not-sell` to that sibling by id/class, without text matching, scroll restoration,
modal styling, or synthetic preference-center lifecycle work. The targeted headed regression now
covers custom consent, both footer controls, close/reopen, and the first click after reload in
both the normal and VPN profiles.

**Footer reopen-path constraint (June 20, 2026):** After adding `applyOneTrustToggleDirectById`
to the custom-preference path (for canadiantire.ca toggle-state correctness), the footer "Cookie
Settings" link produced `otBannerSdk.js: Cannot read properties of undefined (reading
'removeAttribute')`. Root cause: `applyOneTrustCustomPreferencesViaApi` was calling
`applyOneTrustToggleDirectById` after every `UpdateConsent` call to sync DOM state. On Zoom,
`UpdateConsent` correctly records consent in OneTrust's internal state — the `change` events fired
by `applyOneTrustToggleDirectById` triggered OneTrust's handler, corrupting the state
`otBannerSdk` needs to reopen the PC from the footer link. The safer generic rule is now:
mirror DOM state after `UpdateConsent` unless the host is in
`ONETRUST_SKIP_API_DOM_SYNC_HOSTS` (currently zoom.com). That keeps tabbed preference centers
such as FIFA and Canadian Tire aligned without growing a new allowlist for every host whose Save
button reads DOM state.

**Canadian Tire footer-state update (June 24, 2026):** Canadian Tire's OneTrust flow respects the
saved consent choices, but its preserved preference-center DOM can redraw stale cached toggle
values when the footer `Cookie Settings` link is opened immediately after handling. The
preserve-DOM path now installs a bounded post-save sync for expected OneTrust groups and a
reopen-click sync burst, so the footer reopen reflects the latest saved toggle state without a
page refresh. The same flow also restores the consent-run scroll baseline so the page does not
remain stranded at the footer after OneTrust handling.

## zeit.de refresh-loop investigation (2026-08-09)

**Reported symptom:** `zeit.de` goes into a refresh loop with the extension active. No live
browser session with the extension loaded was available during this pass (Claude in Chrome was
not connected), so this is a static-analysis-driven fix, not a live-confirmed root cause —
**flag for live/headed re-validation on `zeit.de` before treating this as closed.**

**What was ruled out:**
- Double-handling between `dom-handler.js` and `sp-frame-handler.js`: `rules/cmps.json`'s
  `sourcepoint` entry has no `actions` block and `tryCMPs()` explicitly skips `cmp.id ===
  'sourcepoint'`, so only `sp-frame-handler.js` ever clicks on Sourcepoint sites — no
  double-click race.
- The generic Sourcepoint initial-banner reject path (`sp-frame-handler.js`'s
  `tryClick(selectors)` → `waitForDismissal()` → `report()`, used for zeit.de's direct
  `.sp_choice_type_REJECT_ALL` button): the July 19, 2026 validator rerun
  (`private/human-validation-backlog.md`) recorded a clean single `Consent recorded (container
  persists but buttons gone)` result for zeit.de, which is inconsistent with a click that itself
  triggers a full-page reload (that would either show a fresh banner or destroy the frame context
  before `report()` runs). This doesn't rule out a *newer* regression on this path, but it means
  the reload is not obviously explained by the click-then-reload race already documented for
  spiegel.de's Accept flow and Sourcepoint privacy-manager Save.
- `startFrameCooldown()` uses `sessionStorage`, which survives same-tab reloads, so a report that
  actually lands should suppress re-triggering across a reload for 20s (60s after a detected
  loop). If reports are landing, the loop should self-terminate quickly via
  `background/service-worker.js`'s loop detector (3 identical reports in 12s or 5 in 45s,
  keyed on site+preference+method+page URL) — a *user-visible* refresh loop implies the reports
  either aren't landing, or the page URL changes on every reload so the loop key never repeats.

**Root cause found (verified statically, not yet live-confirmed on zeit.de itself):**
`content/tcf-interceptor.js` defines `window.__tcfapi` and answers `getTCData`/`addEventListener`
with `eventStatus: 'tcloaded'`, `cmpStatus: 'loaded'`, `gdprApplies: true` — but the `tcString`
field was hardcoded to `''` regardless of preferences. `utils/tc-string-builder.js` already
contained a correct, spec-shaped encoder (`buildTCString`), but it's ESM-only and nothing wires
it into the actual MAIN-world content script (no bundler; `scripts/build.mjs` just copies files
verbatim) — it was only ever exercised by its own unit test. So every site got a stub claiming
"consent obtained" with no actual consent string. A publisher whose ad/paywall stack validates
the TC string itself (not just `eventStatus`) can treat an empty string as a broken/incomplete
consent state and retry — plausible for a subscription/ad-funded German publisher like zeit.de
with a stricter ad-tech integrity check than most sites in `tests/sites.json`.

Separately, and independently confirmed by reading `content/tcf-interceptor.js`'s manifest entry:
it runs **without** `all_frames: true`, so only the top frame gets `window.__tcfapi`. Per the IAB
TCF spec, cross-origin frames (ad-vendor tags, prebid wrappers loaded by the publisher's own ad
stack) can't call a same-name global in a different origin directly — they locate the CMP via a
hidden `__tcfapiLocator` iframe and relay calls over `postMessage`. That locator frame and relay
were entirely absent, so any cross-origin script on the page got **no** CMP response at all
(not even the empty-string stub), which is the more likely trigger for a strict publisher's
"no consent signal found" retry/reload behavior than the empty tcString alone.

**Fix applied:** `content/tcf-interceptor.js` now (1) creates a hidden `__tcfapiLocator` iframe
and relays `postMessage` `__tcfapiCall` requests to `window.__tcfapi`, matching what a real CMP
does for cross-origin callers, and (2) builds a real, spec-shaped, base64url TC string from the
same bit-packing algorithm as `utils/tc-string-builder.js` (duplicated inline — MAIN-world classic
scripts can't `import` — rather than left as dead code only the unit test exercises). Neither
change alters click/selector logic on any site, so no click-based flow (which never depended on
`__tcfapi`) should regress. Covered by new tests in `tests/content/guards.test.js` (locator frame
creation + postMessage relay, non-empty `tcString`) and unchanged existing coverage in
`tests/unit/tc-string.test.js`. **Must still be live/headed re-validated on `zeit.de` itself**
(and spot-checked on `nytimes.com` / `spiegel.de` per the retest matrix above) before this is
described as resolved rather than "fix applied, pending confirmation" in
`docs/site-support-matrix.md` or `private/human-validation-backlog.md`.

## TCF v2.3 Disclosed Vendors segment (2026-08-09)

Per https://iabeurope.eu/all-you-need-to-know-about-the-transition-to-tcf-v2-3/, TCF v2.3's only
TC-string encoding change is making the previously-optional Disclosed Vendors segment mandatory,
enforced from March 1, 2026 (TC strings created before that date remain valid indefinitely; no
change to the TCF Policy Version field or to any CMP API command/field per that source).
`utils/tc-string-builder.js` and `content/tcf-interceptor.js` both now append a `.`-joined
Disclosed Vendors segment (`SegmentType=1`, `MaxVendorId=0`, `IsRangeEncoding=0`) after the Core
String. Since this extension doesn't model individual vendors — `MaxVendorId` is already 0 in the
Core String's own vendor-consent range — the appended segment is an honestly-empty "no vendors
disclosed" declaration, not fabricated vendor-level data. This keeps the emitted TC string
spec-valid post-enforcement without overclaiming vendor disclosure tracking this extension
doesn't do.
