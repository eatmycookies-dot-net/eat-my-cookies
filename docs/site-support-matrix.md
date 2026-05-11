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
| `20minutes.fr` | Supported | Human-validated: Accept, Reject, and Custom behaved correctly. |
| `leparisien.fr` | Supported | Human-validated: Accept, Reject, and Custom behaved correctly. |
| `lemonde.fr` | Supported | Human-validated: Accept, Reject, and Custom behaved correctly. |
| `elmundo.es` | Supported | Human-validated: flows worked; reject labeling was previously generic. |
| `elconfidencial.com` | Supported | Human-validated: Accept, Reject, and Custom behaved correctly. |
| `elpais.com` | Supported | Human-validated: Accept, Reject, and Custom behaved correctly. |
| `ft.com` | Supported | Human-validated as working well. |
| `www.theguardian.com` | Supported | Human-validated: homepage Accept and Reject currently work. |

## Automation-Covered

These sites are in the active automated coverage inventory and should remain in the matrix even when recent human confirmation is missing.

| Site | Status | Notes |
| --- | --- | --- |
| `dw.com` | Automation-covered | Human-validated as working. The automated suite can miss the delayed multi-step ConsentManager workflow, so e2e output here is not the final source of truth. |
| `spiegel.de` | Automation-covered | Active e2e coverage for the current Sourcepoint/iframe flow. |
| `nytimes.com` | Automation-covered | Active e2e coverage for the current Sourcepoint flow. |
| `reuters.com` | Automation-covered | Active e2e coverage for the current OneTrust flow. |
| `forbes.com` | Automation-covered | Active e2e coverage for the current OneTrust flow. |
| `bloomberg.com` | Automation-covered | Active e2e coverage for the current OneTrust flow. |
| `theverge.com` | Automation-covered | Active e2e coverage for the current Sourcepoint flow. |
| `wired.com` | Automation-covered | Active e2e coverage for the current Sourcepoint flow. |
| `euronews.com` | Automation-covered | Active e2e coverage; human confirmation is still useful because the banner can be session-sensitive. |

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

## Site-Specific Choice / Paywall-Or-Accept

These sites currently require accepting cookies or taking a paid/subscriber path for rejection.
The extension should guide users honestly instead of pretending reject/custom truly succeeded.

| Site | Status | Notes |
| --- | --- | --- |
| `abc.es` | Site-specific choice | Reject path leads to a subscription-style wall after initial handling. |
| `lavanguardia.com` | Site-specific choice | Accept works; reject should be treated as paid-or-accept. |
| `corriere.it` | Site-specific choice | RCS flow behaves like paid-or-accept / consentless-subscription. |
| `lastampa.it` | Site-specific choice | Accept works; reject loops back into a paid-style banner. |

## Needs Investigation

These sites have observed problems but the root cause is not fully understood yet.

| Site | Status | Notes |
| --- | --- | --- |

## Needs Implementation

These sites still need direct handling work.

| Site | Status | Notes |
| --- | --- | --- |
| `zeit.de` | Needs implementation | Current flow uses a top-level choice plus a secondary settings modal. |
| `faz.net` | Needs implementation | Current flow did not work for any tested preference. |
| `sueddeutsche.de` | Needs implementation | Current flow did not work for any tested preference. |
| `washingtonpost.com` | Needs implementation | Not supported for now. Current behavior appears site-buggy and inconsistent: reject can land on the cookie policy page, and accept-all may redirect users unexpectedly. |

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
- `cnbc.com`
- `nbcnews.com`
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
