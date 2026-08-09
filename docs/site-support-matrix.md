# Site Support Matrix

This matrix tracks the current practical state of site support based on a mix of automation and human validation.

Important notes:

- Many EU publisher flows are geo-sensitive. Validation from a US IP can differ from validation from an EU IP.
- Human validation remains the source of truth for complex paywall-or-consent experiences.
- Broad candidate-CMP/customer research should not be treated as support truth; the durable public sources are this matrix plus `tests/sites.json`.
- A repeatable Browsec-backed VPN workflow exists for targeted reruns, but long sequential VPN sweeps can still degrade into `ERR_TUNNEL_CONNECTION_FAILED`. Prefer focused single-site VPN reruns over one giant geo batch.

## July 19, 2026 Snapshot

- Non-VPN validation across the current `tests/sites.json` inventory finished at **80 passed / 3 failed / 56 skipped**.
- The three reproducible non-VPN failures were `exame.com` reject flow, `childrenscommissioner.gov.uk/privacy/cookies/`, and `diariomotor.com/diariomotor-sin-cookies/`.
- Targeted VPN reruns on Sunday, July 19, 2026 confirmed fresh passes for `qualityminds.com`, `orange.com`, `help.uis.cam.ac.uk`, `anta.com`, and `exame.com` reject, while some other sites still failed at navigation time with Browsec tunnel errors instead of consent-handling failures.

## Supported

These sites currently behave well for the tested flows and have recent human confirmation.

| Site | Status | Notes |
| --- | --- | --- |
| `20minutes.fr` | Supported | Human-validated. Targeted non-VPN live rerun passed again on July 19, 2026 (`cmp_api:Didomi`). A same-day VPN rerun did not surface a fresh banner, so keep treating this cluster as session-sensitive rather than regressed. |
| `leparisien.fr` | Supported | Human-validated. Same Didomi API path as 20minutes.fr — expected to pass. |
| `lemonde.fr/en/` | Supported | Le Monde's English path exposes the configurable proprietary `gdpr-lmd` CMP. Human-validated from an EU session on August 8, 2026: Reject All, Accept All, Accept All with CCPA do-not-sell, and Custom Functional all work, and a user-clicked footer `Cookie Preferences` opener remains inspectable instead of being auto-saved or auto-dismissed. Reject uses only explicit `denyAll`; Accept All routes through settings on configurable CMP surfaces so reopened preferences match the saved state, with ads off only when CCPA do-not-sell is enabled. Custom Functional mirrors the intended `lmd_consent` payload in extension storage so analytics/social/media-platform/ads stay off while personalization stays on. Le Monde can render duplicate purpose controls when footer settings are reopened, so the watcher suppresses user-opened footer/settings links immediately and syncs visible duplicate controls from the saved cookie only while the settings surface is open. |
| `elmundo.es` | Supported | EU VPN single-site test passes. |
| `elconfidencial.com` | Supported | EU VPN single-site test passes (cmp_api:Didomi). |
| `elpais.com` | Supported | Human-validated: Accept, Reject, and Custom behaved correctly. |
| `ft.com` | Supported | Human-validated as working well. |
| `www.theguardian.com` | Supported, with an honest exception | Human-validated: homepage Accept and Reject currently work. US CCPA "Do Not Sell or Share" is proactively synced even with no banner visible, and `accept_all` + `ccpaDoNotSell` routes through the real USNat toggle instead of leaving the panel open (both fixed 2026-08-09). Some editions/sections (confirmed live on `theguardian.com/europe` from an EU VPN session) instead serve a consent-or-pay wall offering only "Accept all" or a €5/month "Reject all and subscribe" — the extension will never auto-click a paid option, and now honestly reports this page as unsupported (with an accept-anyway override in the popup) instead of silently doing nothing. See `docs/cmp-impact-map.md` for the full investigation, including a critical fix: this wall's paid button previously matched the same generic "Reject All" fallback selectors used across every Sourcepoint site. |
| `ceespronkstore.com` | Supported | Shopify Customer Privacy storefront. Human-validated May 30, 2026: `Accept All`, `Reject All`, and `Custom` are expected to work from an EU/VPN storefront session. Important nuance: Shopify can surface either the lower-left banner or the full preferences dialog first depending on timing and geo. |
| `shopify.com` account pages | Fixture-covered, pending live validation | User-supplied evidence from July 25, 2026 showed Shopify's newer account privacy banner (`#privacy-cookie-banner`) and manage-preferences modal (`#privacy-preferences-modal`). Generic Shopify Customer Privacy handling now covers banner Accept/Decline plus the full preferences modal using category-label matching for generated checkbox IDs. Needs a logged-in/session live check before promoting beyond fixture-covered. |
| `bernstein-sanitarios.pt` | Supported | Human-validated May 30, 2026. Top-level Consentmanager storefront: `Accept All`, `Reject All`, and `Custom` now work through the in-page preferences UI. Important nuance: the CMP presents one category pane at a time (`Function`, `Marketing`, `Preferences`, `Measurement`, `Other`, `Social media`), so custom handling must traverse the left-side navigation before saving. |
| `habitium.com` | Supported | Human-validated May 30, 2026. CookieScript CMP: `Accept All`, `Reject All`, and `Custom` all complete correctly. Custom flow opens the preferences panel, sets Functional, Performance, Targeting, and Unclassified toggles, then saves. Targeting is suppressed when `ccpaDoNotSell` is enabled. |
| `cluse.com` | Supported | Human-validated June 6, 2026. Pandectes CMP: `Accept All`, `Reject All`, and `Custom` all behaved correctly. |
| `barebiology.com` | Supported | Human-validated June 7, 2026. Consentmo CMP inside an open shadow-root custom element. `Accept All`, `Reject All`, and `Custom` now save the intended state correctly after multiple live-fix passes. |
| `afternic.com` | Pending human validation | GoDaddy Privacy Manager — full modal path (`#privacy_manager_modal`). Categories: Advertising, Performance, Support (optional), Essential (locked on). Handler sets all optional `div[role="switch"].ux-track` toggles via `setAriaToggleState` then clicks Save. Tested on `afternic.com/forsale/sprout.com` without VPN (US). Needs human validation to confirm consent actually persists. |
| `godaddy.com` | Pending human validation | GoDaddy Privacy Manager — initial banner path (Shadow DOM under `#gtm_privacy`). Buttons vary by locale (Dutch: Beheren/Afwijzen/Accepteren). Handler uses multilingual regex patterns to click Reject/Accept, with positional fallback (3-button order: Manage, Reject, Accept). Same CMP as afternic.com. Needs human validation across locales. |

## Automation-Covered

These sites are in the active automated coverage inventory and should remain in the matrix even when recent human confirmation is missing.

| Site | Status | Notes |
| --- | --- | --- |
| `spiegel.de` | Automation-covered | Sourcepoint GDPR. Fixed August 8, 2026: the first-layer banner is a consent-or-pay wall (`Consent and continue` / `Subscribe now` / `Preferences`, no direct Reject All), so rejecting now goes through `sp-frame-handler.js`'s `rejectFromPrivacyManager()`, which opens "Preferences" into a separate privacy-manager frame and, when no bulk reject-all control exists there either, rejects every purpose row individually (`rejectAllPrivacyManagerCategories()` — the Reject button is structurally the last button in each `pur-buttons-container` pair, so this works regardless of page language). The privacy manager's purpose list and the first-layer banner's own JS-rendered content can both take a few seconds to paint, so the frame handler now retries detection instead of giving up after a single synchronous check. Saving can trigger a full page reload, so the action is reported before the Save click fires rather than after, since the reload can destroy the frame's execution context mid-wait. Accept All fixed the same day: a bounded USNat-classification regex fix (previously a false GDPR/USNat misclassification routed the click through the wrong selector set) plus a report-before-click ordering fix for this host (this site's consent iframe self-destructs within ~1s of a successful Accept click, which was silently losing the activity report). The ~5s Reject/Custom save delay reported by a user was also fixed the same day: a visibility-check bug (`hasVisibleSelector()` only checked the first DOM match per selector, not every match) caused the extension to wait out its entire timeout budget even though the purpose list had already rendered; the privacy-manager save now completes in well under 1 second. Custom currently behaves identically to Reject — Sourcepoint's GDPR privacy-manager handling has no per-category granularity in this codebase yet. CCPA/USNat mode does not apply; this is a GDPR-only banner for EU visitors. Verified end-to-end for Reject, Accept, and Custom via the official `tests/validate.js` harness (`Der Spiegel`, `Der Spiegel (Accept)`, `Der Spiegel (Custom)` entries in `tests/sites.json`), each confirming both banner dismissal and the correct recorded activity method. See `docs/cmp-impact-map.md` for the full bug-by-bug breakdown. |
| `dw.com` | Automation-covered | ConsentManager frame flow. Targeted automated reruns on August 8, 2026 pass for Accept All, Custom, and the original DW reject/settings path. Accept All and Custom on `/en/top-stories/s-9097` both cover the full privacy-settings detour: the handler must save the real ConsentManager settings surface, return to the original content URL, leave `Your data. Your choice.` absent, record exactly the saved action, and clear the extension's DW auto-return marker afterward. The Accept All fixture also clicks the footer privacy-settings link and verifies the user-opened settings page remains inspectable with `Save selection` visible and no second activity count. Custom must enter through DW's first-layer `Settings` link; Accept All must not fall back to the reject-style toggle-off path if DW lands on `Save selection`. The same page-level Consentmanager handler also covers direct top-level storefront implementations such as `bernstein-sanitarios.pt`. |
| `reuters.com` | Automation-covered | Active e2e coverage for the current OneTrust flow. |
| `thomsonreuters.com` | Automation-covered | Targeted homepage coverage was added June 21, 2026. Important OneTrust nuance: the homepage exposes a visible shell with only a `Cookie Settings` opener, then a `Confirm My Choices` privacy center with five categories (`2,3,4,5,8`). The stable non-VPN path restored on June 22, 2026 is: open the privacy center, apply `OneTrust.RejectAll()` / `OneTrust.Accept()`, then scope the confirm click to the active preference-center surface instead of any page-level accept button. Reuters-class hosts should still avoid synthetic toggle-event sync and forced DOM teardown after the API call because that can freeze the page. Current caveat: the focused US/non-VPN homepage run now passes again, but the VPN profile still fails with the visible shell on screen and no trustworthy extension activity recorded, so EU/VPN behavior remains an open follow-up. |
| `investopedia.com` | Automation-covered | Dotdash Meredith / OneTrust CCPA settings flow remains in the active automated inventory. The non-VPN rerun on Sunday, July 19, 2026 did not surface a fresh banner, so treat the current result as session-sensitive rather than as a confirmed regression. |
| `fifa.com` | Automation-covered | Targeted US/no-VPN custom-mode e2e added June 20, 2026. Important OneTrust nuance: the homepage can show a top-level shell with visible `Reject All` / `I'm OK with that` / `Preference Center` controls while the full category preference center sits hidden in the DOM. Custom handling must route through the real OneTrust preference-center flow rather than collapsing to a raw `RejectAll()` API sync. Current validation note from June 21, 2026: isolated US/non-VPN e2e passes, but the same site still failed in the VPN profile because the top-level shell stayed visible after timeout even though the hidden category toggles were OFF. Treat VPN behavior as an open follow-up. |
| `kpmg.com` | Automation-covered | Targeted article coverage added June 24, 2026 for the OneTrust PC2 custom flow. Important nuance: the preference center has both `Submit All Preferences` and `Agree & Proceed`; custom mode must submit preferences, not click the accept/proceed button. The flow also briefly reopens/restyles the PC after consent is written, so shared OneTrust handling now includes a bounded post-save settle watcher that closes or visually hides stale surfaces and restores scroll. |
| `qualityminds.com` | Automation-covered | Complianz. Single-site e2e passed again on July 19, 2026 both without VPN and with the Browsec VPN profile (`dom:complianz:custom`). `Accept`, `Deny`, and `Custom` are covered through the visible `View preferences` path. |
| `cookieinformation.com` | Automation-covered | Cookie Information. Single-site e2e passes on June 6, 2026 both without VPN and with the Browsec VPN profile (`dom:cookieinformation:reject_all`). Public site reliably exposes `Decline all` on first load. |
| `cookiecontrol.com` | Automation-covered | Public demo target for Cookie Control by Civic. The current non-VPN rerun on Sunday, July 19, 2026 hit an anti-bot challenge, so keep it in the inventory as a regression target but not as a clean automation pass claim. |
| `forbes.com` | Automation-covered | Ketch CMP. US region: accept/reject/custom all covered via Ketch privacy center. EU region: full banner (Accept All / Reject All Non-Required / Manage Preferences) — fixed May 2026 to respect user preference instead of forcing accept-only. EU e2e passes via VPN (`Forbes (EU/GDPR)` in sites.json). |
| `zeit.de` | Automation-covered | Targeted live validation rerun passed on July 19, 2026 (`Consent recorded (container persists but buttons gone)`). This should no longer be treated as a current `Needs implementation` entry without fresher contrary evidence. |
| `faz.net` | Automation-covered | Targeted live validation rerun passed on July 19, 2026 (`Consent recorded (container persists but buttons gone)`). Keep in automated coverage unless a newer real-browser regression is reproduced. |
| `sueddeutsche.de` | Automation-covered | Targeted live validation rerun passed on July 19, 2026 (`Consent recorded (container persists but buttons gone)`). This replaces the older unsupported characterization. |
| `pret.com` | Supported | Ketch CMP. 🇬🇧 UK (en-GB). Human-validated May 2026: `Accept All`, `Reject All`, and `Custom` all work. Site-specific config required — banner has no direct Reject All button; extension opens the Privacy Preference Center via "Customise my settings", then applies preferences using language-agnostic Ketch class selectors and `button[type="submit"]` for save. Uses `DYNAMIC_SITE_SPECIFIC_HOSTS` retry loop because the Ketch banner loads asynchronously (~5s after page load). **Upcoming release item.** |
| `olly.com` | Automation-covered | Ketch CMP (generic). US: `Accept All`, `Reject All`, and `Custom` e2e-validated June 2026 via headless Playwright. EU/GDPR: e2e passes via VPN. USNat banner uses `I Understand` (accept) and `Do Not Sell` (reject). Custom preference network-verified: `analytics` and `behavioral_advertising` correctly submitted as `allowed:false` when turned off. **Upcoming release item.** |
| `dollarshaveclub.com` | Automation-covered | Ketch CMP (generic). US and EU/GDPR e2e-validated June 2026 via headless Playwright. **Upcoming release item.** |
| `cleareyes.com` | Automation-covered | Ketch CMP (generic). US e2e-validated June 2026 via headless Playwright. **Upcoming release item.** |
| `therealreal.com` | Supported | Ketch CMP (site-specific). US privacy center at `/customer-privacy`. Human-validated June 2026: `Accept All`, `Reject All`, and `Custom` all apply correctly. No banner — Ketch is embedded inline on the privacy page only. Anti-bot challenge blocks automated e2e testing. **Upcoming release item.** |
| `bloomberg.com` | Automation-covered | Active e2e coverage for the current OneTrust flow. |
| `theverge.com` | Automation-covered | Current live homepage fingerprint on July 19, 2026 loaded OneTrust SDK assets plus Launchpad / LiveRamp privacy scripts, and the non-VPN automated run recorded `dom:onetrust:ccpa`. Do not describe this as a current Sourcepoint-only regression target anymore. |
| `wired.com` | Automation-covered | Active e2e coverage for the current Sourcepoint flow. |
| `euronews.com` | Automation-covered | Active e2e coverage; human confirmation is still useful because the banner can be session-sensitive. |
| `cnbc.com` | Automation-covered | Validated May 12, 2026 in live headed Chromium e2e for both `reject_all` and `accept_all` + `ccpaDoNotSell=true`. CNBC's OneTrust CCPA flow starts from a top-level banner where `Continue` only dismisses the shell; the real opt-out entry is `Your Privacy Choices`, and successful runs now record activity. **Validation caveat:** headless Playwright shell was misleading here because the extension coordinator did not reliably bootstrap on the page, so headed runs are the source of truth. |

## Supported With Caveats

These sites are usable, but the current behavior has caveats worth documenting.

| Site | Status | Notes |
| --- | --- | --- |
| `disney.com` | Supported with caveats | US CCPA "Notice of Right to Opt Out" (OneTrust USNat mode). Handled entirely by Tier 2 (`cmp-api-handler.js` MAIN world); `www.disney.com` is in `MAIN_WORLD_ONLY_SITES` to prevent Tier 4 from interfering. Reject All + CCPA Do Not Sell ON works. **Known issue (May 2026):** Switching `ccpaDoNotSell` between ON/OFF does not always reflect in the modal toggle visual — the extension calls `OneTrust.RejectAll()` to set internal consent state and clicks Submit, but the DOM toggle may still show ON (selling enabled) visually. Whether OneTrust reads the DOM toggle or its internal API state on Submit is unconfirmed; the saved consent record may or may not match the displayed toggle. Needs deeper investigation. |
| `espn.com` | Supported with caveats | Same Disney-family OneTrust USNat modal ("Notice of Right to Opt Out"). Added to `MAIN_WORLD_ONLY_SITES` May 2026 — without this, Tier 4 would click Submit with no API prep, ignoring `ccpaDoNotSell`. **Known issue (May 2026):** CCPA flag is respected sporadically. Toggling `ccpaDoNotSell` on/off in the extension and reloading can eventually get the banner to reflect the right state, but behavior is not deterministic. Root cause likely same as Disney: unresolved question of whether OneTrust reads DOM toggle or internal API state on Submit. |
| `bbc.com` | Supported with caveats | Uses a BBC-specific document-start path: first-party consent cookies plus BBC's Sourcepoint US privacy API. This avoids the redirect-prone generic click path and keeps homepage flows stable under tested settings. |
| `latimes.com` | Supported with caveats | The legal/privacy interstitial is handled on `latimes.com`, and CCPA is synced through `membership.latimes.com/privacy-settings` via the site's `rdp` API field and shared `c_rdp` cookie. This is intentionally narrower than claiming broad generic banner automation across the whole property. |
| `telegraph.co.uk` | Supported with caveats | Similar CCPA flow exists, but geo-sensitive banner visibility makes validation incomplete. |
| `lefigaro.fr` | Supported with caveats | Works well overall; may redirect to `connect.lefigaro.fr`, and some flows should remain explicit site-choice warnings. |
| `repubblica.it` | Supported with caveats | Accept works. Reject/custom reach an honest site-specific warning path and should not be overstated as full free-access rejection. |
| `ilsole24ore.com` | Supported with caveats | Accept works. Reject behaves like a paid-or-accept path, even though the consent UI itself can sometimes be reached. |
| `ilmessaggero.it` | Supported with caveats | Accept works. Reject/custom should continue to be treated as a paywall-style limitation. |
| `zoom.com` | Supported with caveats | Verified May 9, 2026 from live headed browser sessions with the extension loaded. Root cause of the old Accept All loop was not OneTrust itself: `content/cm-frame-handler.js` was misfiring on unrelated ConsentManager-like frames and recording repeated `consentmanager:frame` accepts, which redirected the page to `/en/trust/acceptable-use-guidelines/` and tripped the circuit breaker. Fixed by skipping ConsentManager frame handling on `www.zoom.com`. Zoom's homepage OneTrust UI is also unusual: `OptanonConsent` / `OnetrustActiveGroups` can already show all-accepted values while a visible collapsed OneTrust shell is still on screen, so cookie state alone is not proof that the banner is dismissed. The working Accept All path closes the visible homepage shell via `.onetrust-close-btn-handler.ot-close-icon.banner-close-button`, then records `cmp_api:OneTrust`. Reject All now dismisses the banner properly. Custom is mapped to Zoom's real OneTrust categories: `C0004` Targeting = Advertising (forced OFF when `ccpaDoNotSell` is ON), `C0003` Functional = Functional, `C0002` Performance = Analytics. Verified cookie result for a mixed custom profile: `groups=C0004:0,C0003:1,C0002:0,C0001:1`. July 19, 2026 follow-up: after reload Zoom's native `#ot-do-not-sell` (`Your Privacy Choices`) control can fail while its sibling `.ot-sdk-show-settings` (`Cookie Settings`) reliably opens the same center. The extension now bridges only that broken id to the working native sibling, without changing modal styles, scroll position, or OneTrust's open/save/close lifecycle. A targeted headed regression covers custom consent, both footer controls, close/reopen, and the first post-reload click with and without the configured VPN profile. |
| `nike.com` | Supported with caveats | Dedicated MAIN-world handler (`cmp-api-handler.js`) detects `/guest/settings/do-not-share-my-data`, waits for `#a11y-do-not-share`, and clicks the checkbox to trigger Nike's React `onChange`, which sets `ni_c=1PA=0` client-side. E2E-validated May 2026 (`reject_all` direction). **Caveat:** opt-in reversal (`accept_all` → uncheck box) cannot be reliably automated — Nike's React component does not propagate the `ni_c` cookie update for programmatic unchecks. Users who previously opted out via the extension and switch to `accept_all` will need to visit the Nike settings page and uncheck manually. |
| `nbcnews.com` | Supported with caveats | Validated May 13, 2026 in headed Chromium e2e for both `reject_all + ccpaDoNotSell=true` and `accept_all + ccpaDoNotSell=true`, with the real OneTrust `ot-group-id-SPD_BG` toggle verified OFF after handling. Important caveat: NBC News is a CNBC sibling in the Versant / OneTrust family, but it should not use CNBC's reload-on-save special case; the working path is the visible `Your Privacy Choices` opener into the privacy center. |
| `client.schwab.com`, `www.schwab.com` | Supported with caveats | Validated May 28, 2026 in live manual browser sessions. `client.schwab.com/app/accounts/summary/` should no longer be redirected into the agreements page by the extension; the root cause was overly broad ConsentManager-frame detection on non-CMP surfaces. `www.schwab.com/resource/amendment-to-account-agreements#` uses a OneTrust CCPA privacy-choice modal with `ot-group-id-SPD_BG`, and the extension now applies `ccpaDoNotSell` through the visible `Your Privacy Choices` / `Confirm My Choice` path there. **Validation caveat:** Schwab coverage is currently human-validated rather than part of the automated inventory. |

## Site-Specific Choice / Paywall-Or-Accept

These sites currently require accepting cookies or taking a paid/subscriber path for rejection.
The extension should guide users honestly instead of pretending reject/custom truly succeeded.

| Site | Status | Notes |
| --- | --- | --- |
| `abc.es` | Site-specific choice | Reject path leads to a subscription-style wall after initial handling. |
| `lavanguardia.com` | Site-specific choice | Evolok paywall. Reject = "Rechazar y suscribirse" — requires paid subscription. Accept is the only free path. Confirmed via EU VPN (NL) manual test. |
| `corriere.it` | Site-specific choice | RCS flow behaves like paid-or-accept / consentless-subscription. |
| `lemonde.fr` | Site-specific choice | Human-validated from an EU session on August 8, 2026. The French root path can show Le Monde's consent-or-pay wall (`Soutenez un journalisme fiable`) with Accept, Subscribe, or Sign in choices and no free Reject/Custom controls. This flow is working as intended: Reject/Custom show the site-specific choice warning rather than recording a rejected consent or claiming the wall was dismissed, and the site-specific Accept override proceeds cleanly. Accept override on this root wall must not run the `/en/` post-accept settings recovery, because that can open Le Monde's withdrawal modal; if such a modal is already present from automation, the handler cancels it unless the user manually opened settings. The `/en/` path is a separate fully supported configurable CMP surface. |
| `lastampa.it` | Site-specific choice | Accept works; reject loops back into a paid-style banner. |

## Needs Implementation

These sites still need direct handling work.

| Site | Status | Notes |
| --- | --- | --- |
| `washingtonpost.com` | Needs implementation | Not supported for now. Current behavior appears site-buggy and inconsistent: reject can land on the cookie policy page, and accept-all may redirect users unexpectedly. |
| `nytimes.com` | Needs implementation | Was listed as Automation-covered (Sourcepoint); moved here August 8, 2026 after a live VPN/CCPA probe found the first-layer banner served by **Fides** (`fides-reject-all-button`), not Sourcepoint. No Fides handler exists in this codebase (no `rules/cmps.json` entry, no `cmp-api-handler.js` API integration). The banner currently only clears via `heuristic.js`'s generic text-match fallback, which has no CCPA-specific awareness and never runs when the user's preference is `custom` — treat the CCPA opt-out path as unverified until real Fides support ships. NYT may be A/B testing Sourcepoint vs. Fides rather than fully migrated, so the fix should be generic Fides detection (Tier 2 API + declarative DOM rule), not a nytimes.com-specific branch. GDPR/EU behavior on this site was not re-tested and its Sourcepoint status there is unconfirmed either way — see `docs/cmp-impact-map.md`'s Sourcepoint section for the full finding. |

## Newer Generic CMP Coverage

These CMP families were introduced as generic handler expansions and then rechecked against live public targets on July 19, 2026. Treat this section as the current evidence status, not as a blanket claim that every site using the family is solved.

| CMP | Status | Notes |
| --- | --- | --- |
| `Borlabs Cookie` | Live coverage added | `beumergroup.com` and `discover-drives.danfoss.com` both passed targeted live e2e on July 19, 2026 (`dom:borlabs:custom`). `realmaker.de` did not surface a fresh banner in the same pass, so keep extra targets on the watch list. |
| `Cookie Wow` | Imported, pending validation | Generic detection and category-toggle handling are now implemented. Vendor/help pages probed during this pass did not expose a live consent surface. |
| `Usercentrics` | Live coverage added | `fedex.com` live-validated August 9, 2026 (headed real-Chrome run, all three modes, multiple runs each). This site previously did not work. Each of Reject All, Accept All, and Custom can complete via either the real `UC_UI` service API (`cmp_api:UC_UI:reject_all` / `accept_all` / `custom`) or the DOM shadow-root fallback (`dom:usercentrics:reject_all` / `accept_all` / `custom`) depending on page-load timing — both were observed live across repeated runs and are treated as equally legitimate, verified paths, not a real-handler-vs-fallback distinction. No banner element remains visible after any mode either way. `leadersisland.com` remains a second, fixture-covered example of the modern Usercentrics shadow-root UI (`#usercentrics-cmp-ui`) that is host-gated to the MAIN-world `UC_UI` path because DOM clicks alone can dismiss the modal without proving service-level consent persistence; local headless probing there did not surface a fresh banner, so it remains pending its own live/human recheck. The MAIN-world handler observes shadow-root mutations so a late-rendered modal is still handled after the document-level retry window, treats opacity-zero/pointer-events-disabled shells as dismissed for counting, and maps the publisher's analytics-described `Functional` category to the extension's Analytics setting. Extension-level regression coverage (`tests/usercentrics-shadow-extension.js`) verifies stats for shadow DOM Accept All, Reject All, and Custom after 5-second delayed visibility, semantic category mapping, fade-out dismissal, and CMP-triggered reload, plus `window.UC_UI` API Accept, Reject, and Custom with persisted service decisions. |
| `Cookie Control by Civic` | Mixed live coverage | `help.uis.cam.ac.uk` passed targeted live e2e on July 19, 2026 both without VPN and with the Browsec profile (`dom:cookiecontrolcivic:custom`). `peterborough.gov.uk/cookies` dismissed successfully in the same pass, but the recorded method came back as `consentmanager:frame:deferred`, so keep an eye on handler overlap. `childrenscommissioner.gov.uk/privacy/cookies/` failed reproducibly in custom mode with the banner still visible. |
| `Truendo` | Live coverage added | `truendo.com` and `sportradar.com` both passed targeted live e2e on July 19, 2026 (`cmp_api:Truendo:custom`). `laola1.at` did not surface a fresh banner in the sampled session. |
| `Clickio` | Needs investigation | `diariomotor.com/diariomotor-sin-cookies/` failed reproducibly on July 19, 2026 with the banner still visible after timeout. `atelevisao.com` did not show a fresh banner in the same sweep, so this family should stay out of strong support claims for now. |
| `cookiesjsr` | Live coverage added | `crealogix.com` and `pathosense.com` both passed targeted live e2e on July 19, 2026, including a custom save flow on PathoSense. |
| `CookieYes` | Live coverage added, legacy-markup gap fixed 2026-08-09 | `emeablog.msasafety.com` passed targeted live e2e on July 19, 2026 (`dom:cookieyes:custom`) and re-passed after this fix (`Handled before banner polling (dom:cookieyes:custom)`), confirming no regression on the modern `.cky-*` widget path. Fixed 2026-08-09: the legacy self-hosted "Cookie Law Info" WebToffee plugin markup (`#cookie-law-info-bar`, `.cli_*`/`.wt-cli-*` — still shipped by the current WordPress.org CookieYes plugin for backwards compatibility, confirmed live on `iabeurope.eu`) was already a `rules/cmps.json` detector and already had legacy click candidates in `dom-handler.js`'s `executeCookieYesFlow`, but was missing from that function's actionable-surface gate, so those sites were detected then silently bailed out before ever trying the working candidates. `iabeurope.eu` itself is still pending confirmation: the plugin gates the banner on GeoIP, and the automated e2e run correctly `SKIP`ped it ("No banner detected") from a non-EU IP — needs an EU IP/VPN profile to actually exercise the fixed path. |
| `CookieHub` | Live coverage added 2026-08-09 | `monday.com` (US/CCPA region, found via Wappalyzer's public CookieHub customer list — `cookiehub.com`'s own site was tried first but its integration was found broken) live-verified in a real headed Playwright run for all three modes: Reject All, Accept All, and Custom with real per-category toggles (`dom:cookiehub:reject_all` / `accept_all` / `custom`). US/CCPA mode's first-layer banner has no direct Reject All — only Accept All and a "Cookie settings" opener — so reject/custom open the settings modal, which does have its own Reject All shortcut plus per-category toggles. EU/GDPR-mode first-layer markup is not yet confirmed live. |
| `privacymanager.io` | Imported, pending validation | Generic slider-based handling is implemented. Public regression target still needed. |

## Newly Added — Pending Human Validation

Detected via automated VPN scan (Browsec → Germany/Lithuania EU IP) on 2026-05-29. CMP family confirmed by script fingerprinting; consent flows have **not** been human-validated yet.

## Brazil / LGPD Coverage Pass

Reviewed on June 13, 2026 from live public homepages and user-supplied DOM screenshots. This pass prioritised high-traffic Brazilian publisher / finance targets and mapped them to the actual banner family visible on first load.

Non-VPN live e2e revalidation on June 14, 2026 passed for `globo.com`, `sbt.com.br`, `e-core.com`, `terra.com.br`, `exame.com` (accept path), `americanas.com.br`, `banco.bradesco`, and `netshoes.com.br`. Sunday, July 19, 2026 follow-up runs kept `globo.com`, `sbt.com.br`, `americanas.com.br`, `banco.bradesco`, `gov.br`, `sp.gov.br`, `correios.com.br`, `tim.com.br`, `uol.com.br`, and `terra.com.br` green in a non-VPN session, but they also surfaced two important truth updates: `e-core.com` currently fingerprints as an AdOpt / HubSpot hybrid rather than a pure HubSpot banner, and `exame.com` reject failed reproducibly without VPN while a targeted VPN rerun passed via the heuristic fallback.

| Site | CMP / banner family | Current status | Notes |
| --- | --- | --- | --- |
| `globo.com` | Globo custom LGPD banner | Live-validated | Single-button `Prosseguir` banner. Added direct selector coverage for `#cookie-banner-lgpd` / `.cookie-banner-lgpd_accept-button`. Human-validated June 20, 2026 from both US and EU/VPN sessions. |
| `sbt.com.br` | SBT custom LGPD banner | Live-validated | CSS-module banner with visible `OK` action and privacy-policy link. Added direct selector coverage for the visible banner shell plus `button.sbt-button`. Human-validated June 20, 2026 from both US and EU/VPN sessions. |
| `e-core.com` | AdOpt / HubSpot hybrid | Live-validated | Sunday, July 19, 2026 live fingerprinting found visible AdOpt DOM (`#cookie-banner`) and `tag.goadopt.io` scripts on top of HubSpot assets. The non-VPN reject run still passed, but it recorded via `dom:privacymanager:reject_all`, so this should no longer be described as pure HubSpot-only coverage. |
| `americanas.com.br` | Privacy Tools banner (`privacytools.com.br`) | Live-validated | Public homepage renders `#privacytools-banner-consent` / `.cc-window.cc-banner` with `Aceitar` plus a close affordance. Added dedicated coverage for this lightweight storefront banner family. Human-validated June 20, 2026 from both US and EU/VPN sessions. |
| `banco.bradesco` | Bradesco custom LGPD banner | Live-validated | Public homepage shows explicit `#rejeitarCookiesNaoNecessarios` and `#aceitarCookies` actions inside `#cookies.cookie-banner`. Added first-class accept and reject handling. Human-validated June 20, 2026 from both US and EU/VPN sessions. |
| `netshoes.com.br` | Netshoes custom cookie notice | Live-validated | Homepage notice currently exposes `.cookie-notification` with a single `CONCORDAR E FECHAR` action. Added lightweight notice coverage so it can be dismissed consistently. Human-validated June 20, 2026 from both US and EU/VPN sessions. |
| `gov.br` | gov.br shared cookie bar | Fixture-covered | Live homepage exposes `.br-cookiebar` with explicit `Gerenciar cookies`, `Rejeitar cookies`, and `Aceitar cookies` actions. Added dedicated accept/reject coverage for the shared government shell. |
| `sp.gov.br` | Sao Paulo state custom LGPD modal | Fixture-covered | Public homepage currently shows `#lgpdModal` with a single accept button `#cadastrar.lgpd-btn`. Added accept-only coverage for this essential-cookies notice. |
| `correios.com.br` | Correios custom cookie notice | Fixture-covered | Public homepage shows `#cookiesId` / `.cookiesCorreios` with a single `Aceito` action (`#btnCookie`). Added lightweight accept-only coverage. |
| `tim.com.br` | Privacy Tools-style lightweight banner | Live-validated | Public homepage currently renders `.cc-window.cc-banner` with `Aceitar`, `Dispensar`, and `Alterar preferências`. In live e2e on June 15, 2026 it was handled successfully through the `privacytoolsbanner` path. |
| `xpi.com.br` | XP custom LGPD component | Fixture-covered | User screenshot confirmed `data-testid='lgpd-cookies-id'` / `#cookies-policy-container` plus explicit accept/reject buttons. |
| `uol.com.br` | `privacymanager.io` simple LGPD banner | Fixture-covered | Public homepage currently shows a simple `OK` banner (`.banner-lgpd-consent__accept`) rather than the older slider dialog. |
| `folha.uol.com.br` | UOL-family simple LGPD banner | Expected-covered | Same visible `banner-lgpd-consent` family as `uol.com.br`. Coverage piggybacks on the same simple-banner path. |
| `terra.com.br` | `privacymanager.io` simple LGPD banner | Live-validated | Public homepage currently shows the Terra `dialog.push-notification.is-cookies` / `.push-notification--accept-button` flow. Human-validated June 20, 2026 from both US and EU/VPN sessions. |
| `exame.com` | AdOpt banner on top of Launchpad / LiveRamp stack | Needs investigation | The accept path still passed on Sunday, July 19, 2026, but the reject path also failed reproducibly in isolated non-VPN reruns with the banner still visible. A same-day targeted VPN rerun passed via the heuristic fallback instead. Keep the hybrid Launchpad/AdOpt classification, but do not overstate reject support until the non-VPN regression is understood. |
| `itau.com.br` | OneTrust | Already covered | Live homepage still exposes a OneTrust shell. Existing OneTrust coverage should apply here without special handling. |
| `estadao.com.br` | Launchpad / Liveramp stack observed | Needs more live validation | Launchpad scripts were present during the June 13, 2026 probe, but the visible actionable shell was not stable enough in that session to claim full live validation yet. |

Additional live probes during the same pass:

- `caixa.gov.br`: AdOpt banner is visible and matches the existing AdOpt support path; good regression target but no new handler was needed.
- `abril.com.br` and `estadao.com.br`: both loaded `launchpad.privacymanager.io` / LiveRamp scripts during the June 15, 2026 sweep, but the visible banner shell was not stable enough in-session to promote to first-class live validation yet.
- `mercadolivre.com.br`, `olx.com.br`, `vivo.com.br`, `bb.com.br`, `santander.com.br`, `casasbahia.com.br`, `magazineluiza.com.br`, `extra.com.br`, `pontofrio.com.br`, and `claro.com.br`: blocked, errored, or challenge-gated in the sampled session, so they were not strong automation targets for this round.
- `nubank.com.br`: visible `Aceitar` / `Continuar` controls plus privacy-policy links were present, but the public shell was not yet specific enough to claim durable first-class handling without a tighter selector pass.
- `shopee.com.br`: the sampled session exposed a cookie banner on top of an unavailable / verification shell, so it remains a possible follow-up target rather than a stable regression case.
- `magazineluiza.com.br`: homepage probe returned an access-blocked / unavailable shell in the sampled session, so it was not a good immediate regression target.

## Canada / PIPEDA Coverage Pass

Reviewed on June 15, 2026 against Similarweb's Canada ranking for May 2026, last updated June 1, 2026. This pass prioritised high-traffic Canadian banking, commerce, government, and media properties that exposed automatable consent surfaces in live public sessions.

| Site | CMP / banner family | Current status | Notes |
| --- | --- | --- | --- |
| `rbcroyalbank.com` | OneTrust | Live-validated | Public homepage exposed a standard OneTrust banner with visible `Accept All Cookies` and privacy-center entry points. Both `Accept All` and `Reject All` passed targeted e2e on June 15, 2026. |
| `nhl.com` | OneTrust | Live-validated | Canadian traffic cohort still surfaced a standard OneTrust shell on the public homepage. Targeted reject-path e2e passed on June 15, 2026. |
| `theweathernetwork.com` | Didomi / `privacy-center.org` preferences modal | Live-validated | Public homepage exposed a `Manage My Consent` entry point instead of the basic notice layer. Generic Didomi support was extended to open and handle the full preferences modal, and both `Accept All` and `Reject All` passed targeted e2e on June 15, 2026. |
| `td.com` | OneTrust | Live-validated | The earlier June 15, 2026 run was a skip because no visible banner surfaced in that sampled session. A targeted live validation rerun on July 19, 2026 now passes before banner polling with recorded activity (`cmp_api:OneTrust:ccpa`), so this should no longer be documented as merely pending. |
| `canadiantire.ca` | OneTrust | Live-validated | Targeted live validation reruns on July 19, 2026 now pass for both the CA reject path (`cmp_api:OneTrust:ccpa`) and the US custom preference-center path (`Banner dismissed; activity recorded (cmp_api:OneTrust:custom)`). Keep the preserve-DOM dismissal note: deleting OneTrust's reusable preference-center scaffold still breaks footer-triggered `Cookie Settings` reopens. |

Additional Canadian probes during the same pass:

- `canada.ca` and `weather.gc.ca`: no fresh dismissible cookie banner surfaced in the sampled sessions.
- `lapresse.ca`: a Quebec-specific `bootstrapConsent` script was observed, making it the strongest candidate for a dedicated Quebec / Law 25 follow-up. Deeper probing showed a public `nuglif.consentHandler` object, but in the sampled anonymous session it behaved like a no-op wrapper and did not mount a consent UI when `show()` was invoked. It remains research-backed rather than claimed coverage.
- `amazon.ca`, `interac.ca`, and `ctvnews.ca`: privacy links were visible, but no automatable first-load consent surface was stable in-session.
- `cbc.ca`, `homedepot.ca`, `walmart.ca`, and `realtor.ca`: errored, blocked, or otherwise did not present a stable public automation target in the sampled run.

## Quebec / Law 25 Coverage Pass

Reviewed on June 15, 2026 from live public Quebec-facing sessions with `fr-CA` locale and `fr-CA,fr;q=0.9,en-CA;q=0.8` request headers. This pass focused on major Quebec public-service and media properties that exposed privacy surfaces aligned with Quebec expectations around transparency and consent.

| Site | CMP / banner family | Current status | Notes |
| --- | --- | --- | --- |
| `hydroquebec.com` | OneTrust | Live-validated | Public homepage exposed a visible French OneTrust banner with `Tout accepter` and `Gérer mes préférences`. Both `Accept All` and `Reject All` passed targeted e2e on June 15, 2026. |
| `ici.radio-canada.ca` | Radio-Canada custom cookie alert | Live-validated | Public homepage exposed a visible French privacy alert in `#js-legal-disclaimer` with `ACCEPTER ET FERMER L'ALERTE`. Added first-class support for this custom alert and validated it live on June 15, 2026. |

Additional Quebec probes during the same pass:

- `lapresse.ca`: the site loads a Quebec-specific `bootstrapConsent` script, writes `lp.consent.currentConsent` to `localStorage`, and exposes `window.nuglif.consentHandler`. In the sampled anonymous public session, invoking `show()` still did not mount a visible consent surface, so support is not being claimed yet.
- `ledevoir.com`: the public homepage loaded the Didomi SDK and a hidden `#didomi-host`, but no visible first-layer notice surfaced. The generic Didomi handler was strengthened to try the public `Didomi.preferences.show()` API for this class of site, but Le Devoir still needs a fresh live validation pass before it should be promoted to supported coverage.
- `tvanouvelles.ca` and `journaldemontreal.com`: footer privacy links were visible, but no automatable first-load consent surface was present in the sampled sessions.
- `quebec.ca`: no fresh dismissible cookie banner surfaced during the sampled session.

### Sourcepoint — Needs Human Validation

| Site | URL | CMP | Validation result |
| --- | --- | --- | --- |
| TAG24 | [tag24.de](https://www.tag24.de/) | Sourcepoint | 🇩🇪 Germany. Passes in batch run. |
| Der Standard | [derstandard.at](https://www.derstandard.at/) | Sourcepoint | 🇦🇹 Austria. Passes in batch run. |
| The Independent | [independent.co.uk](https://www.independent.co.uk/) | Sourcepoint | 🇬🇧 UK. Passes in batch run. |
| Daily Mail | [dailymail.co.uk](https://www.dailymail.co.uk/) | Sourcepoint | 🇬🇧 UK. CMP detected. Human validation needed (banner skipped in automated run — session cookie). |

### Didomi — EU VPN validated ✅

| Site | URL | CMP | Validation result |
| --- | --- | --- | --- |
| ORF | [orf.at](https://www.orf.at/) | Didomi | 🇦🇹 Austria. ✅ Passes single-site VPN test (cmp_api:Didomi). |
| NRC | [nrc.nl](https://www.nrc.nl/) | Didomi | 🇳🇱 Netherlands. ✅ Passes single-site VPN test (cmp_api:Didomi). |
| Orange | [orange.com/en](https://www.orange.com/en) | Didomi | 🇫🇷 France. ✅ Passes single-site VPN test (cmp_api:Didomi). |
| Free.fr | [free.fr](https://www.free.fr/) | Didomi | 🇫🇷 France. ✅ Passes single-site VPN test (cmp_api:Didomi). |
| Michelin | [michelin.com](https://www.michelin.com/) | Didomi | 🇫🇷 France. ✅ Passes single-site VPN test (cmp_api:Didomi). |
| Economía Digital | [economiadigital.es](https://www.economiadigital.es/) | Didomi | 🇪🇸 Spain. Banner not shown in automated run — session cookie. Human validation needed. |
| Marca | [marca.com](https://www.marca.com/) | Didomi | 🇪🇸 Spain. Banner not shown in automated run — session cookie. Human validation needed. |

### Bot-blocked — not automatable

| Site | URL | CMP | Notes |
| --- | --- | --- | --- |
| De Telegraaf | [telegraaf.nl](https://www.telegraaf.nl/) | Didomi | 🇳🇱 Anti-bot challenge blocks automation even with VPN. Human validation only. |
| Harrods | [harrods.com](https://www.harrods.com/) | Didomi | 🇬🇧 `ERR_HTTP2_PROTOCOL_ERROR` even with VPN. Human validation only. |

### Cookiebot — Mixed Live Coverage

| Site | URL | CMP | Validation result |
| --- | --- | --- | --- |
| Allround Automations | [allroundautomations.com](https://www.allroundautomations.com/) | Cookiebot | 🇺🇸 US. ✅ Targeted single-site e2e pass on June 20, 2026 in `custom` mode with `Preferences=true / Statistics=false / Marketing=false`. Important nuance: Cookiebot recorded the correct `CookieConsent` cookie values before the UI disappeared, so the generic handler now calls `Cookiebot.hide()` after `submitCustomConsent()` / `withdraw()` when the consent state is verified. |

### Investis Cookie Manager — Limited Live Coverage

| Site | URL | CMP | Validation result |
| --- | --- | --- | --- |
| Inchcape | [inchcape.com](https://www.inchcape.com/) | Investis Cookie Manager | 🇬🇧 UK / EU. User-supplied live EU evidence on June 20, 2026 showed the visible `#__cookieWrapper` banner remained on screen because the site had been misclassified as Cookiebot. After reclassifying it and adding a generic Investis Cookie Manager handler, a targeted single-site e2e rerun on June 20, 2026 now passes in `custom` mode (`dom:investiscookiemanager:custom`) with the expected `functionalCookies=true / performanceCookies=false / marketingCookies=false` cookie state. EU-IP / VPN confirmation is still worth keeping on the follow-up list because the original regression was reported from an EU session. |

### OneTrust — EU VPN validated ✅

| Site | URL | CMP | Validation result |
| --- | --- | --- | --- |
| LVMH | [lvmh.com](https://www.lvmh.com/) | OneTrust | 🇫🇷 France. ✅ Passes single-site VPN test. GDPR toggle-style banner (no reject-all button) handled via manage-preferences path. |
| Volvo | [volvocars.com/en](https://www.volvocars.com/en/) | OneTrust | 🇸🇪 Sweden. No banner shown in automated run. Human validation needed. |

## Proposed US / CCPA Coverage Targets

These are proposed next targets for US expansion work. They are intentionally separate from the validated inventory above.

Selection criteria:

- Not already present in [tests/sites.json](tests/sites.json)
- High US traffic based on Similarweb's March 2026 US top-sites ranking
- Likely to expose a public cookie / privacy-choice flow worth probing for existing CMP coverage

Priority 1:

- `yahoo.com`
- `ebay.com`
- `walmart.com`
- `weather.com`
- `espn.com`
- `zillow.com`
- `foxnews.com`
- `target.com`
- `etsy.com`
- `paypal.com`
- `apple.com`
- `homedepot.com`
- `people.com`
- `capitalone.com`
- `finance.yahoo.com`
- `t-mobile.com`

Priority 2:

- `yelp.com`
- `accuweather.com`
- `realtor.com`
- `usatoday.com`
- `att.com`
- `xfinity.com`
- `lowes.com`
- `mlb.com`
- `wayfair.com`
- `doordash.com`
- `apnews.com`
- `adobe.com`
- `indeed.com`
- `ups.com`

Before adding any of these to automated validation, do a quick live banner probe from a US session and record:

- active CMP family, if any
- whether the homepage reliably shows a banner
- whether reject / opt-out is a real free path or a site-specific paid-or-accept pattern
- whether anti-bot or geo-gating makes the site unsuitable for stable CI-style coverage

## Evidence Source

- Automated site coverage is tracked in [tests/sites.json](tests/sites.json).
