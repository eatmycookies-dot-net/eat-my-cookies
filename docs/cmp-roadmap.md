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

Several of those still need better live regression targets or tighter support wording, but that is validation and hardening work, not greenfield CMP expansion.

## Finish First On Existing Families

Before adding more families, the highest-value next steps are:

1. `Clickio`
   Current status: generic handler exists, but `diariomotor.com/diariomotor-sin-cookies/` failed reproducibly on Sunday, July 19, 2026.
2. `Cookie Control by Civic`
   Current status: mixed evidence. `help.uis.cam.ac.uk` passed, `peterborough.gov.uk/cookies` showed handler overlap, and `childrenscommissioner.gov.uk/privacy/cookies/` failed reproducibly on Sunday, July 19, 2026.
3. `privacymanager.io` / Launchpad
   Current status: generic handling exists, but the public regression story is still weak and real sites such as `theverge.com`, `e-core.com`, and `exame.com` show hybrid stacks.
4. `Cookie Wow`
   Current status: implementation exists, but a stable public regression target is still missing.
5. Public regression targets for `Usercentrics`, `Quantcast Choice`, `Axeptio`, `Termly`, and `Osano`
   Current status: runtime support exists, but these should not be treated as strong public roadmap wins until they have stable validation targets in `tests/sites.json` and corresponding public support notes.

## Next Truly New CMP Families

Once the existing partials above are tightened up, the next unsupported CMP families should be:

| Priority | CMP family | Why it should be next | Suggested first step |
| --- | --- | --- | --- |
| 1 | `Google Funding Choices / Google CMP` | Biggest clear product gap left in the old roadmap. Important publisher path with Google-controlled frames and interstitial-style surfaces that existing handlers do not already cover. | Find 2 to 3 stable public targets and decide whether the right layer is a new frame/document-start path rather than more generic DOM rules. |
| 2 | `CookieHub` | Broad SMB and mid-market footprint with a likely reusable hosted-banner shape. Better breadth payoff than the lower-volume regional long tail. | Fingerprint a small live corpus and confirm whether it fits `rules/cmps.json` cleanly or needs a helper in `content/dom-handler.js`. |
| 3 | `Piwik PRO Consent Manager` | Distinct European enterprise/public-sector value and a different analytics/tag-manager coupling than the CMPs already covered. | Split discovery between cloud-hosted and first-party/on-prem targets before choosing selectors or API hooks. |
| 4 | `Crownpeak Universal Consent Platform / Evidon` | Real legacy-enterprise gap with multiple generations that are not covered by the current OneTrust/Sourcepoint/Ketch work. | Identify one legacy Evidon target and one newer Crownpeak target before designing a shared handler. |
| 5 | `Commanders Act TrustCommander` | Still a meaningful France/EU enterprise gap, but lower global payoff than the items above. | Build a French-market discovery set and confirm whether the consent layer is banner-first, privacy-center-first, or TCF-frame-heavy. |

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
