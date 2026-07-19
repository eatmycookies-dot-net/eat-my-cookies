# Iubenda

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
| Standard banner | Iubenda CS configuration and standard banner |
| Prior Blocking | Scripts blocked until policy/category consent |
| TCF integration | IAB TCF purposes/vendors for ad-supported sites |
| Privacy Controls and Cookie Solution | Banner plus settings/preferences controls |
| Embedded/custom banner | Custom placement or site-specific skin |
| Cross-domain configuration | Shared policy/configuration across properties |

## Test sites

| URL / domain | Expected fingerprint | Priority | Evidence status |
|---|---|---:|---|
| https://www.iubenda.com | Reference implementation / demos | Tier 0 | confirmed vendor |
| https://www.bendingspoons.com | Corporate deployment | Tier 0 | candidate |
| https://www.musixmatch.com | Media/application deployment | Tier 0 | candidate |
| https://www.spreaker.com | Media/application deployment | Tier 1 | candidate |
| https://www.livecareer.com | SaaS/lead-generation deployment | Tier 1 | candidate |
| https://www.resume-now.com | SaaS/lead-generation deployment | Tier 1 | candidate |
| https://www.zety.com | SaaS/lead-generation deployment | Tier 1 | candidate |
| https://www.websiteplanet.com | Publisher/affiliate deployment | Tier 2 | candidate |
| https://www.hostinger.com | SaaS deployment candidate | Tier 1 | candidate |
| https://www.omnisend.com | SaaS deployment candidate | Tier 2 | candidate |
| https://www.mailerlite.com | SaaS deployment candidate | Tier 2 | candidate |
| https://www.printful.com | Commerce/SaaS candidate | Tier 2 | candidate |
| https://www.ecwid.com | Commerce/SaaS candidate | Tier 2 | candidate |
| https://www.sellfy.com | Commerce/SaaS candidate | Tier 2 | candidate |
| https://www.siteground.com | Hosting deployment candidate | Tier 2 | candidate |
| https://www.prezi.com | Application deployment candidate | Tier 2 | candidate |
| https://www.typeform.com | Application deployment candidate | Tier 2 | candidate |
| https://www.hotjar.com | SaaS deployment candidate | Tier 2 | candidate |
| https://www.satispay.com | Fintech deployment candidate | Tier 2 | candidate |
| https://www.scalapay.com | Fintech deployment candidate | Tier 2 | candidate |

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
