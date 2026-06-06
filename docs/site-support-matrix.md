# Site Support Matrix

This matrix tracks the current practical state of site support based on a mix of automation and human validation.

Important notes:

- Many EU publisher flows are geo-sensitive. Validation from a US IP can differ from validation from an EU IP.
- Human validation remains the source of truth for complex paywall-or-consent experiences.
- TODO: add a repeatable VPN / EU-geo validation workflow so contributors can verify country-specific behavior more reliably.

## Supported

These sites currently behave well for the tested flows and have recent human confirmation.

| Site | Status | Notes |
| --- | --- | --- |
| `20minutes.fr` | Supported | Human-validated. EU VPN single-site test passes (cmp_api:Didomi). Full-run failures are timing artifacts, not real regressions. |
| `leparisien.fr` | Supported | Human-validated. Same Didomi API path as 20minutes.fr — expected to pass. |
| `lemonde.fr` | Supported | Human-validated: Accept, Reject, and Custom behaved correctly. |
| `elmundo.es` | Supported | EU VPN single-site test passes. |
| `elconfidencial.com` | Supported | EU VPN single-site test passes (cmp_api:Didomi). |
| `elpais.com` | Supported | Human-validated: Accept, Reject, and Custom behaved correctly. |
| `ft.com` | Supported | Human-validated as working well. |
| `www.theguardian.com` | Supported | Human-validated: homepage Accept and Reject currently work. |
| `ceespronkstore.com` | Supported | Shopify Customer Privacy storefront. Human-validated May 30, 2026: `Accept All`, `Reject All`, and `Custom` are expected to work from an EU/VPN storefront session. Important nuance: Shopify can surface either the lower-left banner or the full preferences dialog first depending on timing and geo. |
| `bernstein-sanitarios.pt` | Supported | Human-validated May 30, 2026. Top-level Consentmanager storefront: `Accept All`, `Reject All`, and `Custom` now work through the in-page preferences UI. Important nuance: the CMP presents one category pane at a time (`Function`, `Marketing`, `Preferences`, `Measurement`, `Other`, `Social media`), so custom handling must traverse the left-side navigation before saving. |
| `habitium.com` | Supported | Human-validated May 30, 2026. CookieScript CMP: `Accept All`, `Reject All`, and `Custom` all complete correctly. Custom flow opens the preferences panel, sets Functional, Performance, Targeting, and Unclassified toggles, then saves. Targeting is suppressed when `ccpaDoNotSell` is enabled. |

## Automation-Covered

These sites are in the active automated coverage inventory and should remain in the matrix even when recent human confirmation is missing.

| Site | Status | Notes |
| --- | --- | --- |
| `dw.com` | Automation-covered | EU VPN single-site test passes (site_specific:deny_all). The same page-level Consentmanager handler now also covers direct top-level storefront implementations such as `bernstein-sanitarios.pt`. Important nuance: extension-initiated trips through DW's privacy-settings page should return to the original content page, but a user who opens the footer privacy page intentionally should stay there. |
| `spiegel.de` | Automation-covered | Active e2e coverage for the current Sourcepoint/iframe flow. |
| `nytimes.com` | Automation-covered | Active e2e coverage for the current Sourcepoint flow. |
| `reuters.com` | Automation-covered | Active e2e coverage for the current OneTrust flow. |
| `forbes.com` | Automation-covered | Ketch CMP. US region: accept/reject/custom all covered via Ketch privacy center. EU region: full banner (Accept All / Reject All Non-Required / Manage Preferences) — fixed May 2026 to respect user preference instead of forcing accept-only. EU e2e passes via VPN (`Forbes (EU/GDPR)` in sites.json). |
| `pret.com` | Supported | Ketch CMP. 🇬🇧 UK (en-GB). Human-validated May 2026: `Accept All`, `Reject All`, and `Custom` all work. Site-specific config required — banner has no direct Reject All button; extension opens the Privacy Preference Center via "Customise my settings", then applies preferences using language-agnostic Ketch class selectors and `button[type="submit"]` for save. Uses `DYNAMIC_SITE_SPECIFIC_HOSTS` retry loop because the Ketch banner loads asynchronously (~5s after page load). **Upcoming release item.** |
| `olly.com` | Automation-covered | Ketch CMP (generic). US: `Accept All`, `Reject All`, and `Custom` e2e-validated June 2026 via headless Playwright. EU/GDPR: e2e passes via VPN. USNat banner uses `I Understand` (accept) and `Do Not Sell` (reject). Custom preference network-verified: `analytics` and `behavioral_advertising` correctly submitted as `allowed:false` when turned off. **Upcoming release item.** |
| `dollarshaveclub.com` | Automation-covered | Ketch CMP (generic). US and EU/GDPR e2e-validated June 2026 via headless Playwright. **Upcoming release item.** |
| `cleareyes.com` | Automation-covered | Ketch CMP (generic). US e2e-validated June 2026 via headless Playwright. **Upcoming release item.** |
| `therealreal.com` | Supported | Ketch CMP (site-specific). US privacy center at `/customer-privacy`. Human-validated June 2026: `Accept All`, `Reject All`, and `Custom` all apply correctly. No banner — Ketch is embedded inline on the privacy page only. Anti-bot challenge blocks automated e2e testing. **Upcoming release item.** |
| `bloomberg.com` | Automation-covered | Active e2e coverage for the current OneTrust flow. |
| `theverge.com` | Automation-covered | Active e2e coverage for the current Sourcepoint flow. |
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
| `zoom.com` | Supported with caveats | Verified May 9, 2026 from live headed browser sessions with the extension loaded. Root cause of the old Accept All loop was not OneTrust itself: `content/cm-frame-handler.js` was misfiring on unrelated ConsentManager-like frames and recording repeated `consentmanager:frame` accepts, which redirected the page to `/en/trust/acceptable-use-guidelines/` and tripped the circuit breaker. Fixed by skipping ConsentManager frame handling on `www.zoom.com`. Zoom's homepage OneTrust UI is also unusual: `OptanonConsent` / `OnetrustActiveGroups` can already show all-accepted values while a visible collapsed OneTrust shell is still on screen, so cookie state alone is not proof that the banner is dismissed. The working Accept All path closes the visible homepage shell via `.onetrust-close-btn-handler.ot-close-icon.banner-close-button`, then records `cmp_api:OneTrust`. Reject All now dismisses the banner properly. Custom is now mapped to Zoom's real OneTrust categories: `C0004` Targeting = Advertising (forced OFF when `ccpaDoNotSell` is ON), `C0003` Functional = Functional, `C0002` Performance = Analytics. Verified cookie result for a mixed custom profile: `groups=C0004:0,C0003:1,C0002:0,C0001:1`. **Remaining caveat:** the footer `Your Privacy Choices` / settings reopen path has been inconsistent during manual testing, so CCPA verification should still be treated as provisional until that reopen flow is validated more directly. |
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
| `abc.es` | Site-specific choice | Evolok paywall. Reject leads to a subscription page (€3.99+/month for cookie-free browsing). Accept is the only free path. Confirmed via EU VPN (NL) manual test. |
| `corriere.it` | Site-specific choice | RCS flow behaves like paid-or-accept / consentless-subscription. |
| `lastampa.it` | Site-specific choice | Accept works; reject loops back into a paid-style banner. |

## Needs Investigation

These sites have observed problems but the root cause is not fully understood yet.

| Site | Status | Notes |
| --- | --- | --- |
| `euronews.com` | Automation-covered | EU VPN single-site test passes (site_specific:didomi:reject_all). Full-run failures are timing artifacts from a 42-site sequential run, not real regressions. |

## Needs Implementation

These sites still need direct handling work.

| Site | Status | Notes |
| --- | --- | --- |
| `zeit.de` | Needs implementation | Current flow uses a top-level choice plus a secondary settings modal. |
| `faz.net` | Needs implementation | Current flow did not work for any tested preference. |
| `sueddeutsche.de` | Needs implementation | Current flow did not work for any tested preference. |
| `washingtonpost.com` | Needs implementation | Not supported for now. Current behavior appears site-buggy and inconsistent: reject can land on the cookie policy page, and accept-all may redirect users unexpectedly. |

## Newly Added — Pending Human Validation

Detected via automated VPN scan (Browsec → Germany/Lithuania EU IP) on 2026-05-29. CMP family confirmed by script fingerprinting; consent flows have **not** been human-validated yet.

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

### Cookiebot — Needs Human Validation (new CMP)

| Site | URL | CMP | Validation result |
| --- | --- | --- | --- |
| Inchcape | [inchcape.com](https://www.inchcape.com/) | Cookiebot | 🇬🇧 UK. First Cookiebot site in the matrix. No banner shown in automated run. Human validation needed. |

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
- `fedex.com`
- `ups.com`

Before adding any of these to automated validation, do a quick live banner probe from a US session and record:

- active CMP family, if any
- whether the homepage reliably shows a banner
- whether reject / opt-out is a real free path or a site-specific paid-or-accept pattern
- whether anti-bot or geo-gating makes the site unsuitable for stable CI-style coverage

## Evidence Source

- Automated site coverage is tracked in [tests/sites.json](tests/sites.json).
