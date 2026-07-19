# AppConsent

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
| Standard web banner | Vendor SDK with first-layer notice |
| TCF publisher flow | IAB purposes/vendors and consent string handling |
| Regional variants | Different message/configuration by geography |
| iframe/modal settings | Second-layer preferences in modal or frame |
| Mobile layout | Alternate controls and DOM at mobile widths |
| Publisher custom skin | News-group-specific wrapper or branding |

## Test sites

| URL / domain | Expected fingerprint | Priority | Evidence status |
|---|---|---:|---|
| https://www.appconsent.io | Reference implementation | Tier 0 | confirmed vendor |
| https://www.aftonbladet.se | Publisher deployment candidate | Tier 0 | candidate |
| https://www.vg.no | Publisher deployment candidate | Tier 0 | candidate |
| https://www.finn.no | Marketplace deployment candidate | Tier 1 | candidate |
| https://www.schibsted.com | Corporate deployment candidate | Tier 1 | candidate |
| https://www.svd.se | Publisher deployment candidate | Tier 1 | candidate |
| https://www.aftenposten.no | Publisher deployment candidate | Tier 1 | candidate |
| https://www.bt.no | Publisher deployment candidate | Tier 2 | candidate |
| https://www.stavanger-aftenblad.no | Publisher deployment candidate | Tier 2 | candidate |
| https://www.dn.no | Publisher deployment candidate | Tier 2 | candidate |
| https://www.e24.no | Business publisher candidate | Tier 2 | candidate |
| https://www.blocket.se | Marketplace candidate | Tier 1 | candidate |
| https://www.hemnet.se | Property marketplace candidate | Tier 2 | candidate |
| https://www.prisjakt.nu | Comparison marketplace candidate | Tier 2 | candidate |
| https://www.tek.no | Technology publisher candidate | Tier 2 | candidate |

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
