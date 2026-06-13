# Releases

Generated Chrome Web Store packages should live in this folder.

Project message for release context:

Cookie banners are annoying. Eat My Cookies is a free Chrome extension that handles them based on user preferences, so people don't have to fix them site by site. No backend, no tracking, no ads.

## Upcoming (unreleased)

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

- Upload artifact: `eat-my-cookies-v<version>.zip`
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
