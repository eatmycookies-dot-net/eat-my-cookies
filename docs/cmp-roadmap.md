# CMP Roadmap

This is the public roadmap for CMP expansion.

Use the other docs for the other kinds of truth:

- `docs/site-support-matrix.md` for current support status and caveats
- `docs/cmp-impact-map.md` for implementation blast radius and retest scope
- `tests/sites.json` for active automated coverage targets

Keep speculative vendor research, raw discovery corpora, and vendor dossiers in `private/` instead of the public docs tree.

## Already Implemented — Not New Backlog

These families already have runtime support and should not be described as the next CMPs to add:

- `Cookiebot`, `Usercentrics`, `Quantcast Choice`, `Axeptio`, `Termly`
- `Complianz`, `CookieYes`, `Ketch`, `Osano`, `Pandectes`
- `Borlabs Cookie`, `Cookie Information`, `Cookie Wow`
- `Cookie Control by Civic`, `Truendo`, `Clickio`, `cookiesjsr`, `privacymanager.io`
- `CookieHub`

Several of those still need better live regression targets or tighter support wording, but that is validation and hardening work, not greenfield CMP expansion.

## Finish First On Existing Families

Before adding more families, the highest-value next steps are:

1. `Clickio` — **Corrected 2026-08-12: accept-only, not "done."** The shared `executeClickioFlow`/`applyClickioAllOffAcrossTabs` bugs (locale-blind category matching, a broken tab-switching selector) were real and are fixed generically using Clickio's own stable `data-role` attributes — that part holds. But a same-day user report found that on `diariomotor.com`, saving anything other than full accept redirects away from the article to a subscription-upsell page, and a recorded reject decision doesn't even suppress the banner on the next page view the way accept does — so reject/custom isn't real support, it's a dark pattern that happens to complete without a code error. Re-added the `ACCEPT_OR_WARN_SITES` override for this host (with corrected reason text) rather than claiming it's fixed. See `docs/cmp-impact-map.md`'s "Clickio" section for the full story. `mundokodi.com`'s identical-looking override was left untouched throughout (unverified either way).
2. `Cookie Control by Civic` — **Done, fixed 2026-08-12.** All three tracked live targets (`help.uis.cam.ac.uk`, `peterborough.gov.uk/cookies`, `childrenscommissioner.gov.uk/privacy/cookies/`) now pass reject_all/accept_all/custom. Root cause was a shared save/close helper (`finalizeCookieControlCivicPreferences`) that gave up immediately when a site lacked `#ccc-dismiss-button`/`.ccc-close-button`, instead of falling through to the `#ccc-close` control it already had code for. This also explains peterborough.gov.uk's prior handler-overlap symptom. See `docs/cmp-impact-map.md`'s "Cookie Control by Civic" section for the full writeup.
3. `privacymanager.io` / Launchpad — **Still open after a 2026-08-15 search pass; see `docs/cmp-impact-map.md`'s "privacymanager.io" section for the full writeup.**
   Current status: generic handling exists for three distinct sub-surfaces (simple LGPD banner, AdOpt-branded banner, generic Angular slider panel), but only the first two have any live evidence, and neither is a clean, stable target. The LGPD banner (`uol.com.br`/`terra.com.br`) is accept-only in practice. The AdOpt banner (`exame.com`) has a confirmed, reproducible site-side bug where "Do not sell" sets a real opt-out cookie but never visually dismisses the banner. The classic Angular slider panel (`#manageSettings`/`#saveAndExit`/`mat-dialog`) — the surface `theverge.com`/`e-core.com` were expected to exercise — has **zero live confirmation**: a 2022 bug-report lead (`diepresse.com`, `weer.nl`, `pickmypostcode.com`, `geenstijl.nl`) has fully drifted away or is unreachable, and `e-core.com` no longer runs Launchpad at all as of this pass. Next step: find a live target via LiveRamp's own public customer list/case studies rather than another breakage report, since 2022-era breakage leads have aged out.
4. `Cookie Wow` — **Done, live target found 2026-08-15.**
   `techsauce.co` (found via Cookie Wow's own published client testimonials, not the vendor's own site) is now a confirmed, live-verified regression target — `dom:cookiewow:custom`, real per-category persistence confirmed via `chrome.storage.sync`. See `docs/cmp-impact-map.md`'s "Cookie Wow" section. **Must be run headed** (`npm run test:e2e:headed`) — headless runs `SKIP` because Cookie Wow appears to suppress its banner for automated browser fingerprints.
5. `CookieHub`
   Current status: added 2026-08-09, initially as a declarative-only `rules/cmps.json` entry, then rebuilt same-day as a full `dom-handler.js` flow (`executeCookieHubFlow`) after live verification on a real customer site (`monday.com`, US/CCPA region — via Wappalyzer's public CookieHub customer list) surfaced that the first-layer banner has no direct Deny All in US/CCPA mode (only inside the settings modal) and that `.ch2-container` is a class, not an id, as the first declarative-only version had assumed. Reject All, Accept All, and Custom (real per-category toggles, matched by visible label heading text since CookieHub's `name="c-N"` attribute is publisher-configured, not a stable semantic id) are all live-verified working end-to-end via a real headed Playwright run with the extension loaded. EU/GDPR-region first-layer markup is still unconfirmed — see `docs/cmp-impact-map.md`.
6. Public regression targets for `Usercentrics`, `Quantcast Choice`, `Axeptio`, `Termly`, and `Osano`
   Current status: runtime support exists, but these should not be treated as strong public roadmap wins until they have stable validation targets in `tests/sites.json` and corresponding public support notes.

## Next Truly New CMP Families

Once the existing partials above are tightened up, the next unsupported CMP families should be the ones below. Priorities 1-5 have live, fingerprint-confirmed target sites found during a 2026-08-08 pass that cross-referenced the IAB Europe TCF CMP registry against Similarweb's top-ranked sites in News, Sports, TV/Streaming, E-commerce, Finance, and Adult categories (~280 homepages checked); see `private/cmp-expansion-research/iab-tcf-cmp-list-2026-08.md` for full methodology and the (much larger) list of names that were checked and found with no live evidence, which should stay out of this table until that changes.

| Priority | CMP family | Why it should be next | Suggested first step |
| --- | --- | --- | --- |
| 1 | `Google Funding Choices / Google CMP` | Biggest clear product gap left in the old roadmap. Confirmed live (`fundingchoicesmessages.google.com`) on 8 top-ranked sites across News and Sports: `corriere.it`, `ilsole24ore.com`, `infobae.com`, `marca.com`, `nikkansports.com`, `teamblind.com`, `interia.pl`, `sport.tvp.pl`. | Start with `marca.com` and `infobae.com` (both already-known publisher families) and decide whether the right layer is a new frame/document-start path rather than more generic DOM rules. |
| 2 | `Admiral` | Widely used by English-language news/sports publishers for consent plus engagement/anti-adblock. Confirmed live (`AdmiralScript`, GDPR vendor payload) on `theguardian.com`, `dailymail.com`, `cbssports.com`, `247sports.com`. | Fingerprint `theguardian.com` first — already a `Supported` Sourcepoint site for us, so this is likely a secondary/engagement layer worth understanding before assuming it blocks consent. |
| 3 | `Gemius` | Large Central/Eastern European measurement + consent vendor. Confirmed live on 5 top-ranked sites: `onet.pl`, `interia.pl`, `sport.pl`, `sport.tvp.pl` (Poland), `abola.pt` (Portugal). | Start with `onet.pl` or `interia.pl` — both are already `dom:consentmanager` overlap risks per `docs/cmp-impact-map.md`, so confirm Gemius is the actual consent gate and not a secondary analytics tag before building a handler. |
| 4 | `Ensighten/Cheq` | Established enterprise tag management + consent. Confirmed live (`ENSIGHTEN_SRC`) on `cnn.com` — a top-10 global site already `Automation-covered` for us via Sourcepoint, so this may be a secondary tag-management layer rather than the primary consent gate; verify before assuming a new handler is required. | Fingerprint `cnn.com` specifically to determine whether Ensighten fires before or alongside the existing Sourcepoint flow. |
| 5 | `Ströer Media Solutions` | Large German media/ad-tech group. Confirmed live (explicit `Ströer Digital Publishing GmbH` branding, `stroeerws.de` infrastructure) on `t-online.de`, a top-50 global news site. Relevant given existing German-site coverage (`spiegel.de`, `zeit.de`, `faz.net`, `sueddeutsche.de`). | Fingerprint `t-online.de` directly; check whether other Ströer-owned properties share the same consent surface. |
| 6 | `Piwik PRO Consent Manager` | Distinct European enterprise/public-sector value. Not on the IAB TCF registry and no live target confirmed in the 2026-08-08 pass — demoted. | Split discovery between cloud-hosted and first-party/on-prem targets before choosing selectors or API hooks. |
| 7 | `Crownpeak Universal Consent Platform / Evidon` | Real legacy-enterprise gap. `Evidon` is on the IAB TCF registry but no live target was confirmed in the 2026-08-08 pass — demoted. | Identify one legacy Evidon target and one newer Crownpeak target before designing a shared handler. |
| 8 | `Commanders Act TrustCommander` | Still a meaningful France/EU enterprise gap, but lower payoff than the items above and no live target confirmed in the 2026-08-08 pass. | Build a French-market discovery set and confirm whether the consent layer is banner-first, privacy-center-first, or TCF-frame-heavy. |

## Lower-Priority New Families

These should stay below the line unless discovery data shows stronger frequency or a unique technical pattern:

- `Secure Privacy`
- `Sirdata CMP`
- `DataPrivacyManager`

## Public Documentation Rule

When a CMP moves from discovery into real support work:

1. Add or update live targets in `tests/sites.json`.
2. Record support truth in `docs/site-support-matrix.md`.
3. Record implementation blast radius in `docs/cmp-impact-map.md`.
4. Keep speculative research notes in `private/`, not in public `docs/`.
