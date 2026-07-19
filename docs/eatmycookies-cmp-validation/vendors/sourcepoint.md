# Sourcepoint

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
| Unified Messaging Web | Sourcepoint bootstrap plus message configuration |
| TCF v2.x | IAB `__tcfapi`, vendor/purpose stacks, EU message |
| US privacy / state laws | US state-specific messages and privacy APIs |
| Multi-regulation | Message selected by geo, regulation, or property configuration |
| iframe message | Consent UI in Sourcepoint-controlled iframe |
| Native/custom message | Publisher-controlled presentation backed by Sourcepoint |
| Paywall / consent-or-pay | Consent coupled to subscription or continue-with-ads flow |
| AMP/mobile variants | Separate message and rendering constraints |

## Test sites

| URL / domain | Expected fingerprint | Priority | Evidence status |
|---|---|---:|---|
| https://www.washingtonpost.com | Publisher CMP / TCF + US privacy | Tier 0 | candidate |
| https://www.theguardian.com | Publisher CMP / regional messaging | Tier 0 | candidate |
| https://www.latimes.com | Publisher CMP / paywall interaction | Tier 1 | candidate |
| https://www.politico.com | Publisher CMP | Tier 1 | candidate |
| https://www.forbes.com | Publisher CMP / monetization integration | Tier 0 | candidate |
| https://www.businessinsider.com | Publisher CMP | Tier 0 | candidate |
| https://www.vox.com | Vox Media shared deployment | Tier 0 | candidate |
| https://www.theverge.com | Vox Media shared deployment | Tier 0 | candidate |
| https://www.eater.com | Vox Media shared deployment | Tier 1 | candidate |
| https://www.polygon.com | Vox Media shared deployment | Tier 1 | candidate |
| https://www.curbed.com | Vox Media shared deployment | Tier 2 | candidate |
| https://www.techradar.com | Future PLC shared deployment | Tier 0 | candidate |
| https://www.tomsguide.com | Future PLC shared deployment | Tier 1 | candidate |
| https://www.pcgamer.com | Future PLC shared deployment | Tier 1 | candidate |
| https://www.gamesradar.com | Future PLC shared deployment | Tier 2 | candidate |
| https://www.whathifi.com | Future PLC shared deployment | Tier 2 | candidate |
| https://www.cosmopolitan.com | Hearst shared publisher deployment | Tier 1 | candidate |
| https://www.elle.com | Hearst shared publisher deployment | Tier 1 | candidate |
| https://www.esquire.com | Hearst shared publisher deployment | Tier 1 | candidate |
| https://www.goodhousekeeping.com | Hearst shared publisher deployment | Tier 1 | candidate |
| https://www.popularmechanics.com | Hearst shared publisher deployment | Tier 2 | candidate |
| https://www.runnersworld.com | Hearst shared publisher deployment | Tier 2 | candidate |
| https://www.delish.com | Hearst shared publisher deployment | Tier 2 | candidate |
| https://www.autoweek.com | Hearst shared publisher deployment | Tier 2 | candidate |
| https://www.menshealth.com | Hearst shared publisher deployment | Tier 1 | candidate |
| https://www.womenshealthmag.com | Hearst shared publisher deployment | Tier 1 | candidate |
| https://www.townandcountrymag.com | Hearst shared publisher deployment | Tier 2 | candidate |
| https://www.seventeen.com | Hearst shared publisher deployment | Tier 2 | candidate |
| https://www.housebeautiful.com | Hearst shared publisher deployment | Tier 2 | candidate |
| https://www.cnet.com | Publisher CMP candidate | Tier 0 | candidate |
| https://www.zdnet.com | Publisher CMP candidate | Tier 1 | candidate |
| https://www.gamespot.com | Publisher CMP candidate | Tier 1 | candidate |
| https://www.metacritic.com | Publisher CMP candidate | Tier 2 | candidate |
| https://www.chowhound.com | Publisher CMP candidate | Tier 2 | candidate |
| https://www.cbssports.com | Publisher CMP candidate | Tier 1 | candidate |
| https://www.cbsnews.com | Publisher CMP candidate | Tier 1 | candidate |
| https://www.paramount.com | Enterprise/publisher candidate | Tier 2 | candidate |
| https://www.newsweek.com | Publisher CMP candidate | Tier 1 | candidate |
| https://www.standard.co.uk | Publisher CMP candidate | Tier 2 | candidate |
| https://www.independent.co.uk | Publisher CMP candidate | Tier 1 | candidate |
| https://www.telegraph.co.uk | Publisher CMP candidate | Tier 1 | candidate |
| https://www.dailymail.co.uk | Publisher CMP candidate | Tier 1 | candidate |
| https://www.metro.co.uk | Publisher CMP candidate | Tier 2 | candidate |
| https://www.nationalworld.com | Publisher CMP candidate | Tier 2 | candidate |
| https://www.scotsman.com | Publisher CMP candidate | Tier 2 | candidate |
| https://www.yorkshirepost.co.uk | Publisher CMP candidate | Tier 2 | candidate |
| https://www.mirror.co.uk | Publisher CMP candidate | Tier 1 | candidate |
| https://www.express.co.uk | Publisher CMP candidate | Tier 2 | candidate |
| https://www.dailyrecord.co.uk | Publisher CMP candidate | Tier 2 | candidate |

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
