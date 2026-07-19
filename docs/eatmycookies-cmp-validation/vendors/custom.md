# Custom and Hybrid Implementations

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
| First-party banner | No detectable third-party CMP UI; site owns DOM and state |
| Account-aware consent | Consent choices depend on login/account state |
| Consent-or-pay/paywall | Tracking choice tied to subscription/access |
| Dedicated consent domain | Redirect or interstitial hosted on another domain |
| SPA-only UI | Consent rendered and managed entirely in app lifecycle |
| Server-rendered modal | Banner is present in initial HTML |
| GTM/custom tag-manager flow | UI and state mediated through tag manager |
| Hybrid wrapper | Custom UI backed by a vendor API that must be fingerprinted |

## Test sites

| URL / domain | Expected fingerprint | Priority | Evidence status |
|---|---|---:|---|
| https://www.google.com | Google consent UI | Tier 0 | known custom |
| https://consent.google.com | Google dedicated consent flow | Tier 0 | known custom |
| https://www.youtube.com | Google consent UI / SPA | Tier 0 | known custom |
| https://www.amazon.com | Amazon custom consent UI | Tier 0 | known custom |
| https://www.facebook.com | Meta custom consent UI | Tier 0 | known custom |
| https://www.instagram.com | Meta custom consent UI | Tier 0 | known custom |
| https://www.apple.com | Apple custom privacy UI | Tier 0 | known custom |
| https://www.netflix.com | Custom account/marketing flow | Tier 1 | known custom |
| https://www.spotify.com | Custom or wrapped flow | Tier 1 | candidate |
| https://www.airbnb.com | Custom/wrapped flow | Tier 1 | candidate |
| https://www.uber.com | Custom/wrapped flow | Tier 1 | candidate |
| https://www.lyft.com | Custom flow candidate | Tier 2 | candidate |
| https://www.nytimes.com | Publisher custom/paywall flow | Tier 0 | known custom |
| https://www.wsj.com | Publisher custom/paywall flow | Tier 0 | candidate |
| https://www.ft.com | Publisher custom/paywall flow | Tier 0 | candidate |
| https://www.economist.com | Publisher custom/paywall flow | Tier 1 | candidate |
| https://www.reddit.com | Custom consent UI | Tier 0 | known custom |
| https://www.tiktok.com | Custom consent UI | Tier 0 | known custom |
| https://www.linkedin.com | Custom/wrapped enterprise flow | Tier 0 | candidate |
| https://github.com | Custom/wrapped consent flow | Tier 0 | candidate |
| https://openai.com | Custom/wrapped consent flow | Tier 1 | candidate |
| https://chatgpt.com | Application-specific flow | Tier 1 | candidate |
| https://www.cloudflare.com | Custom/wrapped consent flow | Tier 1 | candidate |
| https://stripe.com | Custom/wrapped consent flow | Tier 1 | candidate |
| https://www.twilio.com | Custom/wrapped consent flow | Tier 2 | candidate |
| https://www.datadoghq.com | Custom/wrapped consent flow | Tier 2 | candidate |
| https://www.snowflake.com | Custom/wrapped consent flow | Tier 2 | candidate |
| https://www.mongodb.com | Custom/wrapped consent flow | Tier 2 | candidate |
| https://vercel.com | Custom consent UI candidate | Tier 1 | candidate |
| https://www.netlify.com | Custom consent UI candidate | Tier 2 | candidate |
| https://www.dropbox.com | Custom/wrapped consent flow | Tier 1 | candidate |
| https://www.slack.com | Custom/wrapped consent flow | Tier 1 | candidate |
| https://www.zoom.com | Custom/wrapped consent flow | Tier 1 | candidate |
| https://www.atlassian.com | Custom/wrapped consent flow | Tier 1 | candidate |
| https://www.notion.so | Custom consent UI candidate | Tier 1 | candidate |
| https://www.canva.com | Custom consent UI candidate | Tier 1 | candidate |
| https://www.figma.com | Custom consent UI candidate | Tier 1 | candidate |
| https://www.shopify.com | Custom/wrapped consent flow | Tier 1 | candidate |
| https://www.ebay.com | Custom marketplace flow | Tier 1 | candidate |
| https://www.etsy.com | Custom marketplace flow | Tier 1 | candidate |
| https://www.walmart.com | Custom retail flow | Tier 1 | candidate |
| https://www.bestbuy.com | Custom retail flow | Tier 1 | candidate |
| https://www.tripadvisor.com | Custom travel flow | Tier 1 | candidate |
| https://www.kayak.com | Custom travel flow | Tier 2 | candidate |
| https://www.priceline.com | Custom travel flow | Tier 2 | candidate |
| https://www.expedia.com | Custom/wrapped travel flow | Tier 1 | candidate |
| https://www.booking.com | Custom/wrapped travel flow | Tier 1 | candidate |
| https://www.pinterest.com | Custom consent UI | Tier 1 | candidate |
| https://x.com | Custom consent UI | Tier 1 | candidate |
| https://www.snapchat.com | Custom consent UI | Tier 2 | candidate |

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
