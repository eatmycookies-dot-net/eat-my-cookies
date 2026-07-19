# Didomi

This document is part of the Eat My Cookies live-site validation corpus.

## Evidence policy

The web is dynamic and CMP behavior varies by geography, login state, viewport, browser privacy settings, and A/B test. A site entry is therefore a **test target**, not a permanent assertion.

Status meanings:

- **confirmed vendor** — first-party vendor/reference property.
- **known custom** — the site is known to use a first-party or dedicated consent experience.
- **historically observed** — observed or documented previously; must be rechecked before relying on it.
- **candidate** — plausible target requiring live fingerprint verification.

Do not treat labels such as “Classic,” “SPA,” or “AutoBlock” as formal vendor version numbers. They are Eat My Cookies implementation fingerprints.


## Implementation styles

| Fingerprint | Detection / behavior |
|---|---|
| Web SDK standard notice | `window.didomiOnReady`, Didomi SDK, standard notice |
| SPA lifecycle | SDK initialized once while notice/settings react to route changes |
| TCF publisher configuration | IAB TCF API, vendor/purpose choices |
| Embedded preference center | Settings embedded or launched from privacy links |
| Google Consent Mode integration | Consent signals mapped to Google storage categories |
| Multi-domain consent | Consent shared across configured domains/subdomains |
| Custom notice UI | Custom markup or experience using Didomi APIs |

## Test sites

| URL / domain | Expected fingerprint | Priority | Evidence status |
|---|---|---:|---|
| https://www.deezer.com | Web SDK / SPA | Tier 0 | candidate |
| https://www.dailymotion.com | Web SDK / video SPA | Tier 0 | candidate |
| https://www.blablacar.com | Web SDK / regional deployment | Tier 0 | candidate |
| https://www.orange.fr | French enterprise deployment | Tier 0 | candidate |
| https://www.lemonde.fr | Publisher deployment / TCF | Tier 0 | candidate |
| https://www.lefigaro.fr | Publisher deployment / TCF | Tier 1 | candidate |
| https://www.liberation.fr | Publisher deployment / TCF | Tier 1 | candidate |
| https://www.20minutes.fr | Publisher deployment / TCF | Tier 1 | candidate |
| https://www.lesechos.fr | Publisher deployment / TCF | Tier 1 | candidate |
| https://www.leparisien.fr | Publisher deployment / TCF | Tier 1 | candidate |
| https://www.fnac.com | Commerce deployment | Tier 0 | candidate |
| https://www.decathlon.fr | Commerce deployment | Tier 0 | candidate |
| https://fr.shopping.rakuten.com | Marketplace deployment | Tier 1 | candidate |
| https://www.renault.fr | Automotive multi-domain deployment | Tier 1 | candidate |
| https://www.peugeot.fr | Automotive multi-domain deployment | Tier 1 | candidate |
| https://www.citroen.fr | Automotive multi-domain deployment | Tier 1 | candidate |
| https://www.dsautomobiles.fr | Automotive multi-domain deployment | Tier 2 | candidate |
| https://www.backmarket.fr | Marketplace SPA | Tier 1 | candidate |
| https://www.seloger.com | Classifieds deployment | Tier 1 | candidate |
| https://www.meetic.fr | Account/SPA deployment | Tier 2 | candidate |
| https://www.doctolib.fr | Application deployment | Tier 1 | candidate |
| https://www.manomano.fr | Commerce SPA | Tier 1 | candidate |
| https://www.cdiscount.com | Commerce deployment | Tier 1 | candidate |
| https://www.lacentrale.fr | Classifieds deployment | Tier 2 | candidate |
| https://www.autoplus.fr | Publisher deployment | Tier 2 | candidate |
| https://www.marmiton.org | Publisher deployment | Tier 1 | candidate |
| https://www.allocine.fr | Publisher/media deployment | Tier 1 | candidate |
| https://www.jeuxvideo.com | Publisher deployment | Tier 1 | candidate |
| https://www.bfmtv.com | Publisher/video deployment | Tier 1 | candidate |
| https://www.rmc.fr | Publisher/audio deployment | Tier 2 | candidate |

## Validation checklist

For each target, run at least:

1. Clean profile with no consent cookies.
2. EU/EEA and US geographies where available.
3. Desktop and mobile viewports.
4. Reject All, Accept All, and Custom category choices.
5. Reload, same-origin navigation, SPA route change, and new tab.
6. Re-open preferences from the footer/privacy link.
7. Verify the banner is removed and the chosen state persists.
8. Record vendor fingerprints, script URLs, iframe origins, APIs, DOM selectors, cookies/local storage, and screenshots.
9. Mark login walls, anti-bot pages, paywalls, geo redirects, and A/B variants separately.
10. Never promote a candidate to confirmed solely because a vendor string appears in static HTML; verify the active runtime flow.
