# ConsentManager

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
| cmp.php loader | ConsentManager bootstrap commonly loaded from CMP endpoints |
| TCF v2.x iframe | IAB TCF message, often iframe-based |
| Inline/banner UI | First-layer banner injected into publisher DOM |
| Google Consent Mode | Consent categories bridged to Google tags |
| Publisher skin | Heavily branded publisher markup |
| Mobile/responsive variant | Different DOM or controls at narrow viewport |
| Consent wall / paywall | Access decision coupled to consent or subscription |

## Test sites

| URL / domain | Expected fingerprint | Priority | Evidence status |
|---|---|---:|---|
| https://www.heise.de | cmp.php / TCF publisher deployment | Tier 0 | candidate |
| https://www.computerbase.de | Publisher TCF deployment | Tier 0 | candidate |
| https://www.focus.de | Publisher TCF deployment | Tier 0 | candidate |
| https://www.bild.de | Publisher TCF deployment | Tier 0 | candidate |
| https://www.welt.de | Publisher TCF deployment | Tier 1 | candidate |
| https://www.handelsblatt.com | Publisher TCF deployment | Tier 1 | candidate |
| https://www.faz.net | Publisher TCF deployment | Tier 1 | candidate |
| https://www.t-online.de | Portal deployment | Tier 1 | candidate |
| https://www.spiegel.de | Publisher deployment candidate | Tier 1 | candidate |
| https://www.stern.de | Publisher deployment candidate | Tier 1 | candidate |
| https://www.golem.de | Technology publisher deployment | Tier 1 | candidate |
| https://www.chip.de | Technology publisher deployment | Tier 1 | candidate |
| https://www.netzwelt.de | Technology publisher deployment | Tier 2 | candidate |
| https://www.pcwelt.de | Technology publisher deployment | Tier 2 | candidate |
| https://www.macwelt.de | Technology publisher deployment | Tier 2 | candidate |
| https://www.auto-motor-und-sport.de | Automotive publisher deployment | Tier 2 | candidate |
| https://www.motorsport-total.com | Automotive publisher deployment | Tier 2 | candidate |
| https://www.kicker.de | Sports publisher deployment | Tier 1 | candidate |
| https://www.sport1.de | Sports publisher deployment | Tier 1 | candidate |
| https://www.transfermarkt.de | Sports/classifieds deployment | Tier 1 | candidate |
| https://www.wetteronline.de | Utility portal deployment | Tier 2 | candidate |
| https://www.wetter.com | Utility portal deployment | Tier 2 | candidate |
| https://www.holidaycheck.de | Travel deployment | Tier 2 | candidate |
| https://www.chefkoch.de | Publisher/community deployment | Tier 2 | candidate |
| https://www.mydealz.de | Community/commerce deployment | Tier 1 | candidate |
| https://www.idealo.de | Comparison commerce deployment | Tier 1 | candidate |
| https://www.check24.de | Comparison commerce candidate | Tier 1 | candidate |
| https://www.mobile.de | Classifieds candidate | Tier 1 | candidate |
| https://www.autoscout24.de | Classifieds candidate | Tier 1 | candidate |
| https://www.immobilienscout24.de | Classifieds candidate | Tier 1 | candidate |

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
