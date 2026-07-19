# OneTrust

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
| Classic CDN Stub | `otSDKStub.js`, `cdn.cookielaw.org`, `data-domain-script`, `OptanonWrapper` |
| AutoBlock | OneTrust AutoBlock script, category-tagged blocked scripts, delayed activation |
| CookiePro Branding | Same core platform with CookiePro naming or assets |
| SPA / Reinjection | Banner or SDK initialized after route changes; React/Vue/Angular lifecycle |
| Custom Wrapper | Publisher or enterprise UI calls OneTrust APIs behind custom markup |
| Preference Center | Modal or iframe launched separately from first-layer banner |
| Self-hosted / proxied SDK | SDK and JSON assets served from first-party or proxy domains |
| Multi-domain / geo switching | Different domain-script IDs, rules, or messages by region/subdomain |

## Test sites

| URL / domain | Expected fingerprint | Priority | Evidence status |
|---|---|---:|---|
| https://www.microsoft.com | Classic SDK / CDN stub | Tier 0 | historically observed |
| https://support.microsoft.com | Classic SDK / shared Microsoft deployment | Tier 1 | historically observed |
| https://learn.microsoft.com | Classic SDK / shared Microsoft deployment | Tier 1 | candidate |
| https://www.office.com | CookiePro/OneTrust family | Tier 1 | historically observed |
| https://www.xbox.com | Classic SDK | Tier 1 | historically observed |
| https://www.adobe.com | SPA/custom wrapper | Tier 0 | historically observed |
| https://experienceleague.adobe.com | SPA/custom wrapper | Tier 1 | candidate |
| https://www.intel.com | AutoBlock + preference center | Tier 0 | historically observed |
| https://www.amd.com | Classic/AutoBlock candidate | Tier 1 | historically observed |
| https://www.nvidia.com | SPA/customized SDK | Tier 0 | historically observed |
| https://developer.nvidia.com | Shared enterprise deployment | Tier 1 | candidate |
| https://www.dell.com | Classic/AutoBlock | Tier 0 | historically observed |
| https://www.delltechnologies.com | Enterprise deployment | Tier 1 | candidate |
| https://www.hp.com | Classic/AutoBlock | Tier 1 | historically observed |
| https://www.lenovo.com | Classic/AutoBlock | Tier 1 | historically observed |
| https://www.samsung.com | Modern customized deployment | Tier 1 | historically observed |
| https://www.sony.com | Classic SDK candidate | Tier 1 | historically observed |
| https://www.cisco.com | Enterprise AutoBlock | Tier 0 | historically observed |
| https://developer.cisco.com | Shared enterprise deployment | Tier 1 | candidate |
| https://www.oracle.com | Enterprise deployment | Tier 0 | historically observed |
| https://docs.oracle.com | Shared enterprise deployment | Tier 1 | candidate |
| https://www.vmware.com | Enterprise deployment | Tier 1 | historically observed |
| https://www.broadcom.com | Modern enterprise deployment | Tier 1 | historically observed |
| https://www.salesforce.com | Modern customized deployment | Tier 0 | historically observed |
| https://www.paypal.com | Custom OneTrust integration | Tier 0 | historically observed |
| https://www.mastercard.com | AutoBlock candidate | Tier 1 | historically observed |
| https://usa.visa.com | AutoBlock candidate | Tier 1 | historically observed |
| https://www.americanexpress.com | Custom enterprise integration | Tier 1 | historically observed |
| https://www.fidelity.com | AutoBlock candidate | Tier 1 | historically observed |
| https://www.schwab.com | Modern enterprise deployment | Tier 1 | historically observed |
| https://www.bloomberg.com | Modern customized deployment | Tier 0 | historically observed |
| https://www.reuters.com | AutoBlock/custom publisher deployment | Tier 0 | historically observed |
| https://www.cnbc.com | Publisher deployment | Tier 1 | historically observed |
| https://www.nbcnews.com | Publisher deployment | Tier 1 | historically observed |
| https://www.cnn.com | Publisher deployment | Tier 0 | historically observed |
| https://www.foxnews.com | Publisher deployment candidate | Tier 1 | historically observed |
| https://www.usatoday.com | Gannett customized deployment | Tier 1 | historically observed |
| https://weather.com | Publisher deployment | Tier 1 | historically observed |
| https://time.com | Publisher deployment | Tier 1 | historically observed |
| https://people.com | Dotdash Meredith wrapper | Tier 0 | historically observed |
| https://www.allrecipes.com | Dotdash Meredith wrapper | Tier 0 | historically observed |
| https://www.foodandwine.com | Dotdash Meredith wrapper | Tier 1 | historically observed |
| https://www.travelandleisure.com | Dotdash Meredith wrapper | Tier 1 | historically observed |
| https://www.bhg.com | Dotdash Meredith wrapper | Tier 1 | historically observed |
| https://www.investopedia.com | Dotdash Meredith wrapper | Tier 0 | historically observed |
| https://www.verywellhealth.com | Dotdash Meredith wrapper | Tier 1 | historically observed |
| https://www.health.com | Dotdash Meredith wrapper | Tier 1 | historically observed |
| https://www.ikea.com | AutoBlock candidate | Tier 0 | historically observed |
| https://www.nike.com | Modern customized deployment | Tier 0 | historically observed |
| https://www.adidas.com | Modern customized deployment | Tier 1 | historically observed |
| https://us.puma.com | AutoBlock candidate | Tier 1 | historically observed |
| https://www.underarmour.com | AutoBlock candidate | Tier 1 | historically observed |
| https://www.lowes.com | Modern deployment | Tier 0 | historically observed |
| https://www.homedepot.com | Enterprise deployment | Tier 0 | historically observed |
| https://www.walgreens.com | Modern deployment | Tier 1 | historically observed |
| https://www.cvs.com | AutoBlock candidate | Tier 1 | historically observed |
| https://www.target.com | Enterprise deployment | Tier 0 | historically observed |
| https://www.costco.com | Enterprise deployment | Tier 1 | historically observed |
| https://www.united.com | AutoBlock candidate | Tier 1 | historically observed |
| https://www.delta.com | AutoBlock candidate | Tier 1 | historically observed |
| https://www.marriott.com | Modern / preference center | Tier 0 | historically observed |
| https://www.hilton.com | Enterprise deployment | Tier 0 | historically observed |
| https://www.hyatt.com | Enterprise deployment | Tier 1 | historically observed |
| https://www.booking.com | Enterprise deployment candidate | Tier 1 | historically observed |
| https://www.expedia.com | Modern deployment | Tier 0 | historically observed |
| https://www.airbnb.com | Customized enterprise deployment | Tier 0 | historically observed |
| https://open.spotify.com | SPA deployment | Tier 0 | historically observed |
| https://www.hulu.com | Streaming deployment | Tier 1 | historically observed |
| https://www.disneyplus.com | Streaming deployment | Tier 1 | historically observed |
| https://www.peacocktv.com | Streaming deployment | Tier 1 | historically observed |
| https://www.paramountplus.com | Streaming deployment | Tier 1 | historically observed |
| https://www.ea.com | AutoBlock candidate | Tier 1 | historically observed |
| https://www.epicgames.com | Modern deployment | Tier 1 | historically observed |
| https://www.ubisoft.com | Enterprise deployment | Tier 1 | historically observed |
| https://www.playstation.com | Enterprise deployment | Tier 1 | historically observed |
| https://www.accenture.com | Modern enterprise deployment | Tier 1 | historically observed |
| https://www.capgemini.com | AutoBlock candidate | Tier 2 | historically observed |
| https://www2.deloitte.com | Global multi-domain deployment | Tier 1 | historically observed |
| https://home.kpmg | Global multi-domain deployment | Tier 1 | historically observed |
| https://www.pwc.com | Global multi-domain deployment | Tier 1 | historically observed |

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
