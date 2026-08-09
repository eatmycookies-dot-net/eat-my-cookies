# Releases

Generated Chrome Web Store packages should live in this folder.

Project message for release context:

Cookie banners are annoying. Eat My Cookies is a free Chrome extension that handles them based on user preferences, so people don't have to fix them site by site. No backend, no tracking, no ads.

## v1.3.3

### ZEIT (zeit.de) / Sourcepoint refresh-loop and activity-counting fix

- Fixed a user-reported refresh loop on `zeit.de`. Root cause: the shared TCF signal interceptor (`content/tcf-interceptor.js`, runs on every site) always answered `getTCData`/`addEventListener` with an empty `tcString` despite claiming consent was obtained, and never implemented the IAB-required `__tcfapiLocator` postMessage bridge that lets a publisher's cross-origin consent iframe discover that signal at all. Fixed both — verified live that disabling the fix alone reproduces 19 page navigations in 30 seconds, versus 2 with the fix in place. Reverified from real EU VPN sessions (Romania and Netherlands exit nodes) with a fresh cookie-free profile: no loop, correct region detected, Reject All and Custom both complete cleanly.
- That fix has a side effect worth knowing about: Sourcepoint now trusts our signal quickly enough on `zeit.de` that it can skip rendering an interactive banner entirely, which means the existing click-based activity counter had nothing to click and stopped incrementing for this site. Added a new watcher (`sp-frame-handler.js`) that recognizes this specific pattern — a consent container appears then vanishes without any interactive control ever rendering — and records it. Also fixed two related live-only bugs this uncovered during regression testing: a false-positive on `spiegel.de`'s Accept flow caused by a real banner's own render flicker, and a same-action double-count between this new watcher and the existing click-based reporter (they run in different frames, so the usual duplicate-action check couldn't see both). All fixed and reverified across the full Sourcepoint regression set (`ZEIT`, `Der Spiegel` ×3, `The Guardian`, `TAG24`, `Der Standard`, `Frankfurter Allgemeine`, `Sueddeutsche Zeitung`).
- Added the IAB TCF v2.3 Disclosed Vendors segment (mandatory as of March 1, 2026) to the same interceptor, since it was already being touched for the fix above.

### Storage schema migrations — legacy category keys cleaned up automatically

- Follow-up to the zeit.de refresh-loop investigation above: the user found that manually clearing the extension's stored data resolved a lingering loop that a fresh profile could never reproduce, pointing at something stale in their long-lived profile rather than the loop fix itself being incomplete. Investigation found a plausible culprit sitting in aged profiles: legacy top-level `functional`/`analytics`/`advertising`/`ccpaDoNotSell` sync keys, left over from before preferences moved into the current nested `categoryPreferences` object. No current code reads or writes them, but they can sit there desynced from the real values indefinitely with nothing to clean them up.
- Added a small, version-gated storage migration system (`runStorageMigrations()` in `utils/storage.js`, run once via `chrome.runtime.onInstalled`) that removes exactly these known-dead keys on upgrade, gated by an internal schema-version counter so it only ever runs once per profile and never re-scans storage on every future update. It only ever touches implementation-internal debris — it never resets or overwrites `categoryPreferences`, `globalPreference`, or any other value the user actually chose. This is meant to be the first entry in an ongoing migration list, not a one-off special case, so future storage schema changes have a standing place to clean up after themselves instead of relying on users clearing storage manually.

### The Guardian — US CCPA "Do Not Sell or Share" not applying

- Fixed a bug where the `ccpaDoNotSell` preference was never actually applied on `theguardian.com` for most US visitors. Root cause: the only automatic mechanism (a direct call to Sourcepoint's `_sp_.usnat.postRejectAll` API) only fired when an interactive banner happened to be visible on the page — but Guardian's CCPA experience is normally a footer link only ("US resident - Do Not Sell or Share"), with no banner shown to most visitors, so the API was silently never called at all. Added a proactive sync (mirroring the equivalent existing fix for OneTrust's return-visit modal suppression) that calls the real API even when no banner is visible. Live-verified: with `ccpaDoNotSell` on, opening the real footer panel now shows the actual Sourcepoint toggle as opted out (`aria-checked="true"`), matching the extension setting — previously it showed opted in regardless of the setting.
- Fixed a related gap reported right after the above landed: with `accept_all` **and** `ccpaDoNotSell` both on, "Accept All didn't dismiss the banner" in the US. Root cause: the plain close/accept button never touches the USNat toggle, so a user who wants everything else accepted but still opted out of sale left the panel unresolved. Fixed by routing that specific combination through the same toggle-aware save path used for reject, before falling back to the plain accept/close button. Plain `accept_all` (no do-not-sell) is unaffected and continues to work as before.

### The Guardian — EU consent-or-pay wall, and a critical cross-site safety fix

- Reproduced a user-reported EU experience live (`theguardian.com/europe`, real VPN session): the page offers only "Accept all" or a €5/month "Reject all and subscribe" — no free reject option. While investigating, found that this button's own `title`/`aria-label` text ("Reject all and subscribe") was matched by this extension's *existing, generic* Sourcepoint reject-fallback selectors — the same ones used across every Sourcepoint site, not something specific to Guardian. That means a reject or custom preference could have caused the extension to auto-click into a real payment flow. **Fixed immediately as a standalone safety guard**: no click driven by these generic selectors will ever fire on an element whose own text signals a paid or subscription action (checked via a keyword/currency pattern), on this or any other Sourcepoint site. Live re-verified after the fix: with reject preferences active, the wall stays up, the subscribe button is left untouched, and — because nothing was clicked — no false "rejected" activity entry is recorded either.
- Since `www.theguardian.com` (outside `support.theguardian.com`) has no free-reject flow at all, silently doing nothing on this wall left no explanation for the user. Added detection for the specific case where the only available reject control is the paid one, and now honestly reports the page as unsupported — same mechanism already used for other consent-or-pay walls (`repubblica.it`, `abc.es`, etc.) — with an "accept anyway" override available from the popup. This does not add a general free-reject flow for `www.theguardian.com`; that remains open pending evidence a real one exists on any page under this host.

### CookieHub — new support, then a real-world fix

- Added CookieHub support (Reject All, Accept All, Custom with real per-category toggles). Live-verified end-to-end on `monday.com`, then found broken on a second real site (`semrush.com`) under live EU VPN testing: the settings modal opened but never saved, staying open indefinitely. Root cause: `semrush.com`'s CookieHub theme doesn't mark category headings the same way `monday.com`'s does, so no category could be matched, and the extension silently retried forever without ever clicking Save. Fixed with a more defensive heading-matching fallback chain, an explicit wait for category rows to finish populating (confirmed live: they can render several seconds after the settings panel itself opens), and a bounded-retry fallback to Reject All so a future unrecognized theme degrades gracefully instead of leaving the modal stuck open. Reverified via live EU VPN session: Custom now completes correctly on `semrush.com`. US/CCPA note carried over from the first pass: the first-layer banner there only offers Accept All and a settings link, not a direct Reject All — rejecting or customizing opens the settings panel, which does have both.

### Activity counter label: "CCPA handled" → "Privacy choices", and a follow-up priority fix

- The popup's recent-activity label "CCPA handled" claimed a specific US law applied regardless of the visitor's actual location — reported by a user who saw it on `canadiantire.ca` while browsing from a European VPN. This extension does no IP/geo-detection by design, so it can't actually know whether CCPA applies; the label just named whichever method handled a site's Do Not Sell/Privacy Choices opt-out entry point. Renamed to "Privacy choices" (and equivalent translations across all supported locales) to describe what happened without asserting a jurisdiction the extension can't verify. Purely a label change — the underlying category values being written were already correct.
- Follow-up user report: even with the renamed label, an EU visit with a clear-cut preference (e.g. Custom) could still show the generic "Privacy choices" label instead of "Accepted"/"Rejected"/"Custom" — because `formatActivityPreference()` checked the CCPA/USNat method signature *before* checking the actual recorded preference, so any activity that happened to route through a CCPA-capable method got the generic label even when the outcome was unambiguous. Reordered so a concrete accept/reject/custom outcome always wins; the CCPA/USNat label is now genuinely last-resort, used only when no concrete preference is available to describe.

### Der Spiegel (spiegel.de)

- Fixed Reject All and Custom, which had stopped working after the site's first-layer banner changed to a consent-or-pay wall (`Consent and continue` / `Subscribe now` / `Preferences`) with no direct Reject All control. Rejecting now opens Preferences into the privacy-manager frame and rejects every purpose row individually when no bulk reject-all control is present.
- Fixed Accept All, which was being misrouted through the wrong (USNat/CCPA) button set due to an overly broad text match and so never dismissed the banner.
- Fixed a bug where a successful Accept could still fail to record as handled, because the site's consent iframe tears itself down within about a second of a successful click.
- Fixed a save delay on Reject/Custom (previously ~5–6 seconds) caused by the extension waiting out a full timeout budget even though the purpose list had already finished rendering; saving now completes in well under a second.
- Fixed a narrower timing bug where a purpose row's Reject button could still be mid-animation when the extension tried to click it, occasionally leaving that one category unrejected.
- Custom still behaves the same as Reject All on this site for now — Sourcepoint's privacy manager here doesn't expose a reliable way to save individual category choices yet, so honest full-reject remains the safer default rather than a granular selection that can't be verified as actually saved.

### Le Monde (lemonde.fr)

- Human-validated Accept All, Reject All, Accept All with CCPA do-not-sell, and Custom on `lemonde.fr/en/`, Le Monde's configurable CMP surface.
- The French root path's consent-or-pay wall (`Soutenez un journalisme fiable`) is now handled as an honest site-specific choice — Reject/Custom show the site's real limitation instead of falsely claiming a rejection was recorded, while the Accept path works cleanly without accidentally triggering Le Monde's consent-withdrawal modal.
- Fixed a bug where reopening Le Monde's footer cookie settings to inspect saved preferences could itself trigger an unwanted auto-save or auto-dismiss.

### DW (dw.com)

- Fixed Accept All and Custom to correctly complete DW's privacy-settings detour: the extension now saves the real settings page, returns to the original article, and no longer mistakenly discards the saved selection.
- Manually opening DW's footer privacy settings now stays on that page for the user to inspect, instead of being redirected or double-counted.

### Usercentrics

- Added coverage for the modern Usercentrics shadow-DOM UI (Accept All, Reject All, Custom). Live-validated on `fedex.com` (previously did not work) across repeated runs of all three modes — Reject, Accept, and Custom each complete successfully whether the real `UC_UI` service API or the DOM shadow-root fallback happens to win the race on a given page load. `leadersisland.com` remains a second example, still pending its own live/human validation pass.

### Manual settings inspection

- Across ConsentManager, Sourcepoint, and AppConsent-powered sites, manually opening a footer "cookie settings" or "privacy preferences" link now suppresses automatic re-handling for a short window, so users can actually inspect their saved choices instead of the extension immediately re-applying and closing them.

### Known regression: New York Times (nytimes.com)

- `nytimes.com` has moved from "Automation-covered" to "Needs implementation." A live check found the site now serving a different consent platform (Fides) instead of the previously-detected Sourcepoint, and this extension has no Fides handler yet. The CCPA/opt-out path on this site should be treated as unsupported until Fides support is added — see `docs/site-support-matrix.md` for the full detail.

### Validation tooling

- Added automatic CMP-family drift detection to `npm run test:e2e`: every run now checks whether a site's actual live CMP still matches what's declared, so a site quietly switching consent platforms (like the NYT regression above) shows up as a clear signal instead of a silent pass.
- Added a weekly scheduled CI run (`.github/workflows/e2e-weekly.yml`, Tuesdays) covering both non-VPN and VPN/geo-gated sites, so this kind of drift is caught automatically going forward instead of waiting for someone to notice.
- Fixed several test-harness reliability gaps that could let a real regression pass silently: an empty selector list that always "passed," no check on which handler actually fired, and incorrect fallback behavior when reading extension stats or writing preferences under real Chrome.

### Validation

- `npm run test`
- `npm run verify`
- `npm run test:e2e -- --site="Der Spiegel"` (Reject, Accept, and Custom entries)
- `npm run test:e2e -- --site="FedEx"` (Reject, Accept, and Custom entries, multiple runs each)
- `npm run test:e2e:usercentrics`
- Live human-validated sessions for `lemonde.fr/en/`, `lemonde.fr`, and `dw.com`

## v1.3.2

### Shopify Account Privacy Support

- Added support for Shopify's newer native account privacy UI, including the bottom `Cookie consent` banner and the `Manage preferences` modal seen on `shopify.com` account pages.
- Expanded generic Shopify Customer Privacy detection from the older storefront `shopify-pc__*` markup to the newer stable `privacy-*` IDs, including `#privacy-cookie-banner`, `#privacy-banner-manage-preferences-button`, and `#privacy-preferences-modal`.
- Custom Shopify preferences now handle generated checkbox IDs by matching nearby category labels such as `Personalization`, `Marketing`, and `Analytics`, while preserving the existing storefront toggle-id path.
- Added local fixture coverage for Shopify account privacy flows:
  - `Accept`
  - `Decline`
  - `Manage preferences` → mixed custom save
  - direct preferences-modal custom save
- Updated Shopify validation metadata, CMP fingerprinting, support docs, and impact-map notes. Logged-in `shopify.com` account pages remain marked fixture-covered pending live/session validation.

### Validation

- `npm run test`
- `npm run verify`
- `npm run check:support-drift`
- `npm run check:hygiene`
- Focused Shopify fixture validation for accept, reject, custom-from-banner, and direct-modal custom paths

## v1.3.1

### OneTrust Footer Review and State Reliability

- Fixed OneTrust footer/settings reopen behavior for Reuters and the shared API-backed OneTrust path. Once consent is applied, a user opening `Manage Cookies`, `Cookie Settings`, or a comparable structural privacy control now sees the publisher's interactive preference center instead of a second extension dismissal pass.
- Reopened OneTrust centers silently reflect the consent group IDs already written through the OneTrust API. This is group-id based, does not rely on English button/category text, and avoids synthetic toggle events that can freeze Reuters-class sites.
- Added focused FIFA persisted-state and Reuters trusted-footer-click regression coverage, plus OneTrust guard coverage and implementation notes.

### Review Request and Popup Polish

- Added an optional, respectful Chrome Web Store review prompt. It is entirely local: it appears only after a recent, meaningful usage streak, never asks for a particular rating, and is limited to one prompt per activity range.
- Added permanent `Leave a review` links to the popup and Settings screen.
- Refined milestone/review popup cards, settings metadata layout, and related translations.

## v1.3.0

### OneTrust Refactor and Stability Fixes

- Refactored OneTrust handling into a more general privacy-center flow so the extension can:
  - recognize real OneTrust action surfaces more reliably
  - open settings through footer / privacy-choice controls when that is the only safe route
  - preserve and re-sync preference-center state after save instead of relying on brittle one-shot dismissal behavior
- Generalized OneTrust CCPA / privacy-choice detection away from a small host allowlist and toward structural signals such as privacy-choice controls and `_BG` group ids.
- Improved OneTrust save handling so the extension now:
  - prefers the real reject / save UI when available
  - restores scroll position after preference-center interactions
  - retries final dismissal more safely after consent is already written
  - keeps reusable preference-center DOM where the host depends on it
- Fixed `www.canadiantire.ca` OneTrust behavior by avoiding footer-widget false positives and preserving the reusable preference-center structure instead of tearing down the underlying DOM.
- Fixed `www.zoom.com` OneTrust behavior with dedicated handling for footer / privacy-choice reopen paths so the extension no longer fights Zoom's own settings links after consent handling.
- Added broader validation and guard coverage for the OneTrust refactor, including focused regression scripts for Canadian Tire and Zoom plus stronger source assertions in `tests/content/guards.test.js`.

### Cookiebot / Usercentrics Bug Fixes

- Fixed Cookiebot custom-preference handling so custom category consent is written and verified more reliably before the dialog is hidden.
- Added a host-specific Cookiebot / Usercentrics fix for `allroundautomations.com`.

### Additional CMP Coverage and Validation Tooling

- Added first-class handling for Investis Cookie Manager preference-center flows.
- Expanded public support and validation documentation around `docs/site-support-matrix.md`, `docs/cmp-impact-map.md`, and `docs/cmp-roadmap.md`, while moving raw CMP research out of the public docs tree so release notes no longer point at stale support claims.

### Brazil / LGPD Coverage Expansion

- Expanded Brazilian LGPD coverage with first-class support for Globo, SBT, XP, `e-core.com` (AdOpt / HubSpot hybrid), the Privacy Tools lightweight banner family, Bradesco, Netshoes, `gov.br`, `sp.gov.br`, and Correios.
- Added fixture coverage for the new Brazil-specific banner families so selector and dismissal regressions are caught locally before live-site validation.
- Added live regression targets in `tests/sites.json` for `globo.com`, `sbt.com.br`, `e-core.com`, `americanas.com.br`, `banco.bradesco`, `netshoes.com.br`, `gov.br`, `sp.gov.br`, `correios.com.br`, and `tim.com.br`.
- Non-VPN live e2e validation now passes for the sites above, plus previously added Brazil targets such as `terra.com.br`, `exame.com` (accept path), and `globo.com`.
- Documented the remaining Browsec/VPN limitation more clearly: the old validator-side `emcPref=n/a` issue was fixed by preferring Chromium-based launches in VPN mode, but long Browsec-backed VPN sweeps can still degrade into `ERR_TUNNEL_CONNECTION_FAILED`, so targeted single-site VPN reruns are the trustworthy path.

### Canada / PIPEDA Initial Wave

- Added a first Canadian/PIPEDA validation wave focused on high-traffic sites from Similarweb's Canada ranking for May 2026.
- Added live regression targets for `rbcroyalbank.com`, `nhl.com`, `td.com`, `canadiantire.ca`, and `theweathernetwork.com`.
- Non-VPN live e2e now passes for:
  - `rbcroyalbank.com` → OneTrust (`Accept All` and `Reject All`)
  - `nhl.com` → OneTrust (`Reject All`)
  - `td.com` → OneTrust (current live path records consent successfully on rerun)
  - `canadiantire.ca` → OneTrust (current homepage reject/custom paths now pass again)
  - `theweathernetwork.com` → Didomi / `privacy-center.org` preferences modal (`Accept All` and `Reject All`)
- Strengthened the generic Didomi handler so sites that expose a manage/preferences entry point first, rather than the lightweight notice layer, can still be handled end to end through the full Didomi preferences modal.
- Strengthened the generic Didomi handler again so that, when the SDK is already present but the site does not expose a visible entry point, the extension can try Didomi's public `preferences.show()` API before giving up.
- Documented the current honest follow-up set instead of over-claiming support:
  - `lapresse.ca` exposes a public `nuglif.consentHandler`, but in sampled anonymous sessions it still behaves like a no-op wrapper and has not yet produced a stable public automation target

### Quebec / Law 25 Initial Wave

- Added the first dedicated Quebec / Law 25 validation wave with Quebec-facing locale and language settings.
- Added live validated Quebec targets for:
  - `hydroquebec.com` → OneTrust (`Accept All` and `Reject All`)
  - `ici.radio-canada.ca` → custom Radio-Canada cookie alert
- Added a first-class custom handler for Radio-Canada's French privacy alert (`#js-legal-disclaimer` / `ACCEPTER ET FERMER L'ALERTE`).
- Documented the next honest Quebec follow-up set:
  - `lapresse.ca` loads a Quebec-specific `bootstrapConsent` layer, writes consent state locally, and exposes `nuglif.consentHandler`, but the sampled anonymous session still did not mount a visible UI
  - `ledevoir.com` loads Didomi / `privacy-center.org` with a hidden host and is the next live-validation candidate for the new API-open fallback

---

## v1.2.1

### GitHub Cookie Preferences

- Added a dedicated `github.com` site-specific handler for GitHub's cookie-preferences dialog instead of relying on fragile text-only matching.
- The handler now sets each visible radio group deliberately, saves through the dialog's real `Save changes` path, and records the outcome as a site-specific action.
- Excluded GitHub from incidental ConsentManager frame handling so unrelated frame patterns do not steal the flow or over-count activity.

### Ketch / LiveRamp Stabilization

- Hardened generic and site-specific Ketch handling so the extension distinguishes between:
  - full privacy-center flows that must be saved through the UI
  - US-style cookie-write flows where consent can be persisted directly and the page reloaded safely
- Fixed `liveramp.com` custom handling so the extension no longer treats an existing-but-incomplete Ketch consent cookie as success and now uses the correct Ketch flow per surface.
- Added a manual-open guard for Ketch privacy centers so if a user opens the panel themselves from footer or in-page controls, the extension does not immediately fight that interaction and re-apply consent.
- Tightened `ketch.com` handling specifically:
  - removed false-positive privacy-center detection caused by homepage marketing sections like `#analytics`
  - stopped using banner paths that actually navigate to product pages instead of dismissing consent UI
  - added safer save/auto-close behavior for overlays that should dismiss without an explicit exit click
- Improved validator reliability for Ketch-powered sites by:
  - strengthening extension preference writes when multiple service workers are present
  - falling back to the extension popup page when Playwright cannot reach the extension service worker directly
  - adding a dedicated `tests/test-ketch.js` helper for focused Ketch regression runs

### Cookie Control by Civic

- Fixed Cookie Control by Civic custom handling to better support full preference-center deployments, not just compact notify banners.
- Added support for the dedicated Civic close/save button class `.ccc-close-button` and broader preference-center opening selectors such as `.ccc-notify-link`.
- Expanded Civic custom handling to:
  - open the real preference center before applying settings
  - expand IAB purpose sections before touching their toggles
  - map custom decisions from the actual Civic input values instead of relying only on numeric suffixes in ids
- Adjusted Civic advertising purpose coverage to include purpose id `11`, which was missing from the prior mapping.
- Hardened the final save path so Civic custom flows can fall back to the platform API when a simple button click does not dismiss the modal cleanly.
- Fixed the shared TCF interceptor so callback-less `__tcfapi` calls no longer throw during Civic save/hide flows, which was blocking consent persistence on some sites.
- Updated Civic regression targets in `tests/sites.json`, including the Peterborough custom expectation (`advertising: false`) and selector coverage for Civic close/save buttons.

---

## v1.2.0

### OneTrust Follow-Ups

- Generalized OneTrust custom preference handling so category-mapped sites can use the CMP's real group IDs instead of relying on brittle label-only matching.
- Validated `guidepostgrowth.com` on June 12, 2026: custom preferences now map correctly through OneTrust's category group IDs (`C0002` Performance, `C0003` Functional, `C0004` Targeting, `C0005` Social Media).
- Fixed Zoom's footer `Your Privacy Choices` and `Cookie Preferences` reopen links after banner handling. Root cause: Zoom-specific cleanup was removing hidden reusable OneTrust preference-center scaffolding (`#onetrust-pc-sdk`) along with the visible surface.
- Zoom cleanup now removes only currently visible OneTrust banner / modal layers, preserving the hidden settings structure needed when the user later reopens privacy settings from the footer.

### Platform / CMP Coverage Cleanup

- Added generic `Pandectes` support covering `Accept All`, `Reject All`, and `Custom` preference flows.
- Added generic `Consentmo` support covering `Accept All`, `Reject All`, and `Custom` preference flows, including shadow-root handling for Shopify app-extension installs such as Bare Biology.
- Hardened `Complianz` custom handling so sites that expose `View preferences` first, like QualityMinds, now reliably open the preferences center before applying per-category settings.
- Live validation on June 6-7, 2026 now confirms:
  - `cluse.com` → `Pandectes` works for `Accept All`, `Reject All`, and `Custom`
  - `barebiology.com` → `Consentmo` now saves the intended custom state correctly
  - `qualityminds.com/en/` → `Complianz` custom flow now works end to end
- Strengthened the VPN validator so a Bare Biology-style `PASS` is no longer just “banner dismissed”; the validator can now reopen Consentmo settings on the inspection page and report saved switch state for debugging.

### Generic CMP Coverage Expansion

- Added reusable generic CMP coverage for `Complianz`, `Cookie Information`, `Borlabs Cookie`, and `Cookie Wow`.
- Extended the same generic CMP layer further with `Cookie Control by Civic`, `Truendo`, `Clickio`, `cookiesjsr`, and `privacymanager.io`.
- Added live validated public-site coverage for:
  - `qualityminds.com` → Complianz
  - `cookieinformation.com` → Cookie Information
- Added a public target probe for `cookiecontrol.com` → Cookie Control by Civic. The site exposes the expected banner, but automated validation currently hits an anti-bot challenge, so it remains documented as partial coverage rather than a clean pass.
- Both newly validated sites pass targeted e2e on June 6, 2026:
  - without VPN
  - with the local Browsec VPN profile enabled
- `Borlabs Cookie` and `Cookie Wow` are implemented in the generic layer but still need stable public regression targets before they should be marketed as broadly validated support.

### Ketch CMP — Generic Support

- Added `KETCH_GENERIC_CONFIG` fallback so any Ketch-powered site now works without a dedicated site entry. Previously only `forbes.com`, `ketch.com`, `therealreal.com`, and `pret.com` were covered.
- New US sites validated: `olly.com`, `dollarshaveclub.com`, `cleareyes.com`. All pass headless e2e for `Accept All`, `Reject All`, and banner detection.
- USNat banner semantics handled: `I Understand` (accept), `Do Not Sell`, and `Opt Out` are all recognized as valid accept/reject signals across the generic config.
- Added `data-nav-action:confirm` as the primary save selector for all Ketch configs (generic and all site-specific entries). The newer Ketch SDK encodes a base64 JSON payload in each button's `data-nav` attribute; the `action: "confirm"` field is language-agnostic and works regardless of button label language. Text-based selectors (`text:save choices`, etc.) remain as fallbacks for older SDK deployments.
- Added `bannerWatchSelectors` coverage for `#ketch-banner-button-tertiary` — the tertiary button position is used for Accept on some Ketch deployments and Reject on others, so watching it is necessary for reliable banner detection regardless of semantic role.

### Ketch — Custom Preferences Fix

- Fixed `findKetchCategoryControl` incorrectly returning the same toggle for every category rule. Root cause: parent container elements (whose `textContent` includes all category labels) were being matched first in DOM order, and `querySelector` on those containers always returned the first toggle in the whole group. Fixed by preferring the most specific container — the matching element with the fewest nested toggle controls — which selects the per-category row rather than the outer wrapper.
- As a result, `Custom` preferences on Ketch sites (The RealReal, OLLY, and any generic Ketch site) now correctly apply the right toggle per category. Previously, selecting `Functional=ON / Analytics=OFF / Advertising=OFF` could result in Analytics being toggled ON instead.
- Fixed all site-specific Ketch configs (`forbes.com`, `ketch.com`, `therealreal.com`, `pret.com`) missing `data-nav-action:confirm` in their `saveSelectors`. On sites using the new Ketch SDK, `clickElement(saveSelectors)` was silently failing — the extension applied the correct toggles but returned before `reportAction`, so custom preferences "worked" (Ketch auto-saves toggle state changes) but the action was never counted.

### Ketch / Pret A Manger

- Added site-specific Ketch support for `pret.com/en-GB`.
- Pret's banner has no direct Reject All button — only "Customise my settings" — so the extension opens the Privacy Preference Center and applies preferences there.
- Covers `Accept All`, `Reject All`, and `Custom`. Human-validated May 2026 on UK/en-GB.
- Uses the `DYNAMIC_SITE_SPECIFIC_HOSTS` retry loop because Pret's Ketch banner loads asynchronously (~5s after page load).
- Selectors are language-agnostic where possible: Ketch CSS variable class patterns (`[class*="rejectAllButton"]`, `[class*="acceptAllButton"]`) and `button[type="submit"]` for save, with text fallbacks for "Save choices" and "Confirm".
- Fixed `readKetchVisibleSwitchState` to correctly read toggle state when the control element itself is the switch container — needed for Pret's sibling checkbox/toggle DOM layout, which was causing custom preference to toggle blindly.

### Osano CMP

- Added full Osano CMP support covering `Accept All`, `Reject All`, and `Custom` preference flows.
- Detection uses Osano's CSS class namespace (`.osano-cm-dialog`, `.osano-cm-window`, `.osano-cm-widget`, and related selectors from `rules/cmps.json`).
- `Accept All` clicks `button.osano-cm-accept-all`; `Reject All` clicks `button.osano-cm-denyAll`; `Custom` opens the preference drawer via `.osano-cm-link--type_manage`, sets per-category toggles, and saves via `button.osano-cm-save`.
- Handled via a `MutationObserver`-based watcher (`scheduleOsanoWatch`) with polling fallback at 300 ms / 800 ms / 1.6 s / 3 s / 5 s / 8 s / 12 s / 20 s / 30 s — needed because Osano can inject its dialog asynchronously after initial page load.
- Fixed a deduplication bug where Osano actions fired by the watcher could be counted multiple times. The `duplicateActionKey` in the service worker previously included `method` in the key, so the same site+preference combination with slightly different method strings was not recognized as a duplicate. Removed `method` from the dedup key so rapid repeated firings on the same document are correctly collapsed.

### Headless US Validation Fix

- Fixed US headless e2e tests (`OLLY US`, `Dollar Shave Club US`, `Clear Eyes US`) all failing with `emcPref=n/a`. Root cause: Playwright's bundled Chromium does not expose extension service workers via `browser.serviceWorkers()` in headless mode, so `writePreferences` never found the SW and the extension bootstrap exited early at `onboardingComplete` check.
- Fix: `validate.js` now attempts to launch with `channel: 'chromium'` (system-installed Chromium at `/Applications/Chromium.app`) in headless mode, which does expose the service worker. Falls back to bundled Chromium silently if system Chromium is not available.
- Added a warmup navigation to `example.com` immediately after launch so the extension SW activates and becomes visible to `browser.serviceWorkers()`.
- Added 4-second SW polling in `writePreferences` so the write always lands before the first site navigation, even on cold starts.

---

## v1.1.0

### CookieScript

- Added full CookieScript support covering `Accept All`, `Reject All`, and `Custom` preference flows.
- Detection uses `window.CookieScript` JS global plus CSS selectors (`#cookiescript_injected`, `#cookiescript_accept`, `#cookiescript_reject`, and related IDs).
- `Accept All` and `Reject All` call `instance.acceptAllAction()` / `instance.rejectAllAction()` via the CookieScript page API when available; the DOM fallback clicks `#cookiescript_accept` / `#cookiescript_reject`.
- `Custom` opens the preferences panel via `#cookiescript_manage` (or the matching `aria-controls` button), sets per-category toggles for Functional, Performance/Analytics, and Targeting/Advertising, handles the Unclassified category through its `<select>` element, then saves via `#cookiescript_save` or a localised save/close button (EN/ES/FR/DE/IT).
- Targeting/Advertising is forced off when `ccpaDoNotSell` is enabled.
- A `CookieScriptLoaded` event listener bootstraps preference handling as soon as the CMP signals readiness, avoiding timing races on slow pages.
- Human validation on `habitium.com` confirms all three flows complete correctly.

### Shopify Customer Privacy

- Added expected support for Shopify's native Customer Privacy banner and preferences flow.
- Human validation on `ceespronkstore.com` now confirms the core Shopify flows are expected to work:
  - `Accept All` records activity and dismisses the banner.
  - `Reject All` records activity and dismisses the banner.
  - `Custom` is now expected to complete on Shopify storefronts, though timing around which Shopify surface appears first can still vary by store and geo.
- Contributor note: for geo-sensitive Shopify storefronts, prefer an EU/VPN validation path before claiming regressions or support gaps.

### Ketch / Forbes

- Refactored Ketch into a reusable privacy-center handler instead of keeping Forbes on a one-off site path.
- Added explicit Ketch support for `forbes.com`, `www.forbes.com`, `ketch.com`, and `www.ketch.com`.
- Fixed Forbes EU banner handling so visible `Reject All Non-Required` and `Manage Preferences` paths are treated as actionable instead of falsely flagged as accept-only.
- Fixed Forbes/Ketch stats reporting when a banner action transitions into the settings surface before the final save/report step.
- Stabilized Ketch mixed custom handling:
  - Ketch demo pages no longer fight the rendered UI as aggressively when applying mixed custom states.
  - Forbes mixed custom now uses a Ketch reject baseline before re-enabling selected categories, which fixed the real-world “all on” / “all off” / “mixed custom” split.

### Schwab

- Prevented false-positive ConsentManager handling from redirecting logged-in Schwab users away from the account summary page.
- Added OneTrust coverage for Schwab privacy-choice flows on `schwab.com` / `www.schwab.com`, including the `Your Privacy Choices` modal used on agreement/resource pages.
- Documented Schwab support and caveats in the support matrix and CMP impact notes.

### Bloomberg

- Tightened Bloomberg-specific Sourcepoint routing so EU/GDPR flows are not mistaken for the US CCPA privacy-manager path.
- Fixed Bloomberg GDPR reject handling for the first-layer Sourcepoint modal and improved modal dismissal behavior.
- Fixed Bloomberg activity reporting so successful dismissals count even when the iframe closes quickly.

### VPN Validation / Tooling

- Added Browsec-based VPN validation tooling and contributor guidance for EU/IP-sensitive sites.
- Added CMP discovery tooling for research across real geo variants.
- Added focused live diagnostic scripts for Bloomberg and Forbes exception flows.

### Release Packaging

- Release packages use the plain semver filename, for example `eat-my-cookies-v1.1.0.zip`.
- `npm run build:zip` now refuses to overwrite an existing zip for the current version, so you must intentionally bump semver before cutting another release artifact.

## v1.0.1

### OneTrust / Versant

- Fixed CNBC's CCPA privacy-center flow so both `Reject All + CCPA do not sell/share` and `Accept All + CCPA do not sell/share` apply the real OneTrust toggle and record activity correctly.
- Added headed-browser validation coverage for CNBC and NBC News, with explicit toggle-state checks so counting-only regressions do not pass silently.
- Fixed NBC News reject-all + CCPA routing to use the visible `Your Privacy Choices` path instead of redirect-prone fallback behavior.

### ConsentManager / DW

- Tightened DW's dedicated ConsentManager flow so homepage handling does not jump users onto the wrong content page.
- Auto-return from DW's `data-privacy-settings` page now applies only to extension-triggered detours; users who intentionally open the footer privacy page can stay there.
- Strengthened regression coverage to validate final landing URL, not just whether a banner disappeared.

### Thomson Reuters

- Improved host-specific OneTrust cleanup on `thomsonreuters.com` so leftover shell markup is removed more aggressively after consent handling.

### Regressions and Validation

- Skipped false-positive ConsentManager frame handling on Forbes, Bloomberg, NBC News, and Zoom where that path could redirect or over-count.
- Expanded CMP impact notes and support docs for CNBC / NBC News / DW behavior.
- Added stronger validation around homepage stability and site-specific post-consent expectations.

## v1.0.0

### CMP Coverage

- Sourcepoint (GDPR + USNat/CCPA), OneTrust, ConsentManager, Didomi, Iubenda, TrustArc, AppConsent, and custom site-specific flows.
- Site-specific handling for consent-or-pay publishers (`lemonde.fr`, `repubblica.it`, `ft.com`, `lefigaro.fr`).

### DW.com

- US visitors redirected to DW's `/data-privacy-settings/privacy-settings-en` inline consent page are handled automatically — preference is applied and the user is returned to their content via `history.back()`.
- Regular DW article pages are not incorrectly triggered (the always-present empty `#cmpwrapper` div is no longer used as a detection signal).

### FT.com

- Custom preference mode reads `categoryPreferences` correctly when deciding whether to accept or reject in FT's privacy manager.

### Popup

- Settings panel scroll works on the first attempt (switched from `position: absolute` to `position: fixed` so scroll height is always computed against the viewport).
- "Custom" preference no longer auto-opens the settings panel on every popup open — an inline "Edit →" button appears next to the dropdown instead.
- Category label updated to "Uncategorized/Custom Purposes".
- Site exceptions: disable the extension per domain, or always accept on specific sites.
- Collectible badges and recent activity log.

### Other

- Cookie-eating toolbar animation with badge counter.
- Export / import settings.
- Added `.tmp-*` and `*.tmp` to `.gitignore`.

---

## Packaging

- Upload artifact: `eat-my-cookies-v1.3.0.zip`
- Run `npm run build` to generate a fresh `dist/`.
- Run `npm run version:patch` (or `version:minor` / `version:major`) before packaging a new public release for an already-published version line.
- Run `npm run build:zip` to generate a clean Chrome Web Store package in this folder.
- `npm run verify` should pass before submission.
- The submission zip should not contain hidden junk such as `.DS_Store`.

## Chrome Web Store Notes

- Category: `Privacy & Security`
- Official URL: `https://eatmycookies.net`
- Homepage URL: `https://eatmycookies.net`
- Support URL: `https://eatmycookies.net/en/install/`

### Reviewer Test Instructions

No login or test account is required.

1. Install the extension.
2. Open the popup and choose `Reject All`, `Accept All`, or `Custom`.
3. Visit a supported site with a cookie banner.
4. Confirm the extension attempts to apply the selected preference automatically.
5. Reopen the popup to review recent activity, settings, and site controls.

Suggested review sites:

- `https://www.bbc.com/`
- `https://www.latimes.com/`
- `https://www.theguardian.com/`
- `https://www.forbes.com/`

Reviewer notes:

- The extension runs locally in the browser.
- It does not use remote code.
- Some sites expose custom, paywall-like, or limited consent flows; in those cases the extension may show a warning or site-specific behavior instead of claiming success.
- Some flows are geo-sensitive. Forbes, Bloomberg, DW, and similar sites can present materially different consent UI outside the US.

### Permissions Summary

- `host_permissions` / `<all_urls>`: needed to detect and handle consent banners on the sites the user visits.
- `scripting`: used to interact with consent UI and page-level consent APIs where required.
- `tabs`: used to refresh or update the current tab after a user-triggered settings or site action.
- `contextMenus`: used for right-click controls such as opening the popup or disabling the extension on a site.
- `storage`: used for preferences, site exceptions, and local stats.
- `browsingData`: used only for user-triggered cleanup of site-specific cookies and storage when clearing or removing a site override.

- Update this file with a short human summary whenever a release zip is created.
