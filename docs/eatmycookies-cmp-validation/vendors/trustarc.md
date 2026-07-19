# TrustArc

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
| Classic Cookie Consent Manager | TrustArc/ TRUSTe scripts and standard banner |
| Preference Manager | Separate preference center or privacy manager |
| iframe/modal | Consent controls rendered in modal or iframe |
| Enterprise custom skin | Custom branding and markup over TrustArc services |
| Geo/regulation variants | Different experiences by jurisdiction |
| Legacy TRUSTe lineage | Older naming, domains, or APIs still in production |

## Test sites

| URL / domain | Expected fingerprint | Priority | Evidence status |
|---|---|---:|---|
| https://www.qualcomm.com | Classic enterprise banner | Tier 0 | candidate |
| https://www.juniper.net | Enterprise deployment | Tier 1 | candidate |
| https://www.netapp.com | Enterprise deployment | Tier 1 | candidate |
| https://www.f5.com | Enterprise deployment | Tier 1 | candidate |
| https://www.autodesk.com | Enterprise deployment | Tier 0 | historically observed |
| https://www.synopsys.com | Enterprise deployment | Tier 1 | candidate |
| https://www.xerox.com | Enterprise deployment | Tier 1 | candidate |
| https://www.akamai.com | Enterprise deployment | Tier 1 | candidate |
| https://www.citrix.com | Enterprise deployment | Tier 1 | candidate |
| https://www.splunk.com | Enterprise deployment | Tier 1 | candidate |
| https://www.nutanix.com | Enterprise deployment | Tier 2 | candidate |
| https://www.paloaltonetworks.com | Enterprise deployment | Tier 1 | candidate |
| https://www.microchip.com | Enterprise deployment | Tier 2 | candidate |
| https://www.analog.com | Enterprise deployment | Tier 2 | candidate |
| https://www.keysight.com | Enterprise deployment | Tier 2 | candidate |
| https://www.teradata.com | Enterprise deployment | Tier 2 | candidate |
| https://www.redhat.com | Enterprise deployment candidate | Tier 1 | candidate |
| https://www.sas.com | Enterprise deployment candidate | Tier 1 | candidate |
| https://www.workday.com | Enterprise deployment candidate | Tier 1 | candidate |
| https://www.servicenow.com | Enterprise deployment candidate | Tier 1 | candidate |
| https://www.vmware.com | Legacy/transition candidate | Tier 2 | candidate |
| https://www.broadcom.com | Legacy/transition candidate | Tier 2 | candidate |
| https://www.cisco.com | Legacy/alternate deployment candidate | Tier 2 | candidate |
| https://www.oracle.com | Legacy/alternate deployment candidate | Tier 2 | candidate |

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
