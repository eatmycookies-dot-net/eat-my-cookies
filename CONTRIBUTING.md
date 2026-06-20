# Contributing

Thanks for contributing to Eat My Cookies.

Project reminder:

Cookie banners are annoying. Eat My Cookies is a free Chrome extension that handles them based on user preferences, so people don't have to fix them site by site. No backend, no tracking, no ads.

## Tooling Model

This repo is intentionally split like this:

- Node.js for normal development work
- Python only for the optional icon-art generator

That means:

- Build, packaging, and validation use `npm`
- The extension runtime and tests are JavaScript-based
- Python is not required unless you are regenerating icons

## Quick Start

Requirements:

- Node.js

Install dependencies:

```bash
npm install
```

Run the normal contributor sanity check:

```bash
npm run verify
```

That command:

- builds the unpacked extension into `dist/`
- runs the static validation checks
- does not run unit tests
- does not run live browser e2e validation

## Common Commands

Build the extension:

```bash
npm run build
```

Create a store-ready zip:

```bash
npm run build:zip
```

Release zips keep the plain semver filename. `npm run build:zip` will refuse to overwrite an existing artifact for the current version, so bump semver first when cutting another public release:

```bash
npm run version:patch
# or:
npm run version:minor
npm run version:major
```

The single source of truth for the current release version is [`version.json`](version.json). Use the version scripts rather than editing `manifest.json`, `package.json`, or test metadata by hand.

Run unit tests plus static validation:

```bash
npm run test
```

Run the full suite, including live browser e2e:

```bash
npm run test:all
```

Run live validation:

```bash
npm run test:e2e
```

Useful validation variants:

```bash
npm run test:e2e:headed
npm run test:e2e:eu
npm run test:e2e:us
```

Site entries in `tests/sites.json` may also include:

- `locale`
- `acceptLanguage`

Use those when a CMP changes visible labels by language and you want the validator to exercise the native locale instead of defaulting to browser English.

For extension UI strings, use the shared localization helper in [`utils/i18n.js`](utils/i18n.js) and add keys to `_locales/*/messages.json` instead of hardcoding new popup or context-menu copy in JavaScript.

UI localization is not enough by itself. If a new language should also work for localized consent banners, update the matcher/fallback phrases in `content/*.js` and extend the locale regression tests in `tests/unit/locale-support.test.js`.

When touching Ketch or other geo-sensitive CMPs, do not assume one region tells the whole story. A site can serve:

- a simple banner in one geography
- a full privacy center in another
- different category names or toggle behavior by legislation bucket

Document the tested geography in your notes and prefer real-region validation before declaring a site "fixed".

## Icon Generation

Icon generation is a one-off asset workflow and intentionally remains in Python.

Why:

- the current raster drawing logic is compact in Pillow
- it avoids adding extra Node image-processing dependencies to the normal dev path
- icon changes are rare compared with runtime and test changes

You only need this if you are changing icon or badge art.

Requirements for this step only:

- Python 3
- Pillow

Install the icon-tool dependency:

```bash
python3 -m pip install -r scripts/requirements-icons.txt
```

Regenerate icons:

```bash
npm run icons
```

## Testing Guidance

Contributors should usually use this order:

1. `npm run verify`
2. `npm run test`
3. `npm run test:e2e -- --site="Relevant Site Name"` when changing a real site flow

Meaning:

- `npm run verify` is the fastest normal check for build + static validation
- `npm run test` adds unit coverage on top of that
- `npm run test:e2e` is for live browser/site-flow validation and is slower, geo-dependent, and more brittle
- for EU publishers, prefer validating from an EU IP/VPN when possible, because many walls change meaningfully by region

### Batch run reliability caveat

Running the full suite (`npm run test:e2e` or `npm run test:e2e:vpn`) visits all 60+ sites sequentially in a single browser session. Browser memory and timing degrade over a long run, causing sites later in the queue to fail with `visible=none` or `recorded=none` even when those same sites pass cleanly in isolation.

**Do not treat full-batch failures as confirmed regressions.** Before investigating a failure, always retest the affected site individually:

```bash
npm run test:e2e -- --site="Site Name"
# or with VPN:
npm run test:e2e -- --vpn --site="Site Name"
```

If the site passes in isolation, the full-batch failure is a timing artifact, not a real bug. For EU sites in particular, run them as a separate batch rather than mixed with US sites:

```bash
npm run test:e2e:eu        # EU only
npm run test:e2e:us        # US only
```

This was discovered in May 2026 when a 42-site EU VPN batch run showed 15 failures, but individual retests confirmed only 2 were genuine (both pre-existing paywalls, not code regressions).

### Testing with a VPN

Some EU sites are bot-protected and only load correctly from a real browser with a VPN active. Three scripts support this:

| Script | npm alias | Purpose |
| --- | --- | --- |
| `tests/vpn-connect.js` | `npm run test:vpn-setup` | First-time setup: accepts Browsec ToS and turns the VPN on |
| `tests/detect-cmp.js` | `npm run test:detect-cmp` | Discovery tool: fingerprints the CMP on a list of sites from an EU IP |
| `tests/validate.js --vpn` | `npm run test:e2e:vpn` | Runs the full validation suite through the VPN |

**One-time setup:**

1. Install [Browsec](https://chromewebstore.google.com/detail/omghfjlpggmjjaagoclmmobgdodcjboh) (or any proxy extension) from the Chrome Web Store
2. In Chrome go to `chrome://extensions` → enable **Developer mode** → find your extension → click its ID → copy the **Path**
3. Export the path so all three scripts can find it:

```bash
export EMC_VPN_EXT=<path-to-unpacked-extension>   # add to ~/.zshrc or ~/.bashrc
```

4. Run the setup script once to accept terms and connect:

```bash
npm run test:vpn-setup
```

   A browser window opens. Turn the VPN on manually if the script cannot do it automatically, then close the window. The connected session is saved to `.tmp-vpn-profile/` (gitignored).

**Subsequent runs** clone the saved connected profile into a fresh temporary run profile, so VPN auth is preserved without carrying over stale cookie-consent state from previous validations:

```bash
npm run test:e2e:vpn                          # full suite via VPN
npm run test:e2e -- --vpn --site=LVMH       # single site
npm run test:detect-cmp                        # CMP discovery scan
```

Prefer `npm run verify` during normal iteration, `npm run test` before opening a PR when code behavior changed, and targeted `npm run test:e2e` when you touched a supported site or CMP flow.

## Public Repo Hygiene

This is a public open source repo. Local paths, secrets, private operational notes, agent-specific local state, and machine-specific artifacts should not be committed.

Run the hygiene check manually:

```bash
npm run check:hygiene
```

To check only staged files:

```bash
npm run check:hygiene:staged
```

To install local git hooks for this repo:

```bash
npm run hooks:install
```

That installs:

- `pre-commit`: runs the hygiene check against staged files
- `pre-push`: runs the hygiene check plus the structural support-drift check

Recommended workflow before opening a PR:

1. `npm run check:hygiene:staged`
2. `npm run check:support-drift`
3. `npm run verify`
4. request a review using the diff-review workflow

### Ketch-specific testing notes

Ketch needs extra care because banner actions and custom settings are not always equivalent:

- `Accept All` and `Reject All` may be wired to real SDK state transitions even when direct toggle clicks are not
- mixed custom states can behave differently from "all on" or "all off"
- opening a privacy center from a footer link can reuse existing consent state from the same session

When validating a Ketch change:

1. Test `Accept All`
2. Test `Reject All`
3. Test at least one mixed custom state such as:
   - `Functional = off`
   - `Analytics = on`
   - `Advertising = off`
4. Reopen the site's privacy link and confirm the saved state matches what the extension attempted
5. Confirm the action is also recorded in popup stats / `Recent`

For Forbes specifically, prefer checking both:

- the first banner surface
- the later `Forbes Privacy Center` settings page

The same applies to Ketch demo/testing surfaces such as `ketch.com`, which are useful for isolating Ketch behavior without a publisher-specific shell.

## Site Integration Guidance

When adding or fixing a site:

1. Identify the CMP vendor first.
2. Check whether there is a page API before reaching for selectors.
3. Treat iframe CMPs as stateful apps, not just DOM fragments.
4. Verify both:
   - consent was recorded
   - the visible banner or overlay is actually gone
5. Keep site-specific logic tightly scoped to the affected host.
6. If the site is locale-sensitive, add or update `locale` and `acceptLanguage` in `tests/sites.json` and validate the real language variant.
7. Update [docs/site-support-matrix.md](docs/site-support-matrix.md) when the practical support status changed, especially if you moved a site between "supported", "supported with caveats", and "needs implementation".
8. If you learn something vendor-specific that is useful but not yet productized, add a note to `docs/cmp-impact-map.md` and, if sensitive or speculative, the private research notes instead of leaving it only in commit history or chat.

As a rule, a small verified API path is better than a large set of guessed selectors.

## Repository Notes

- `dist/` is generated output
- `releases/` contains release artifacts and notes
- temporary local reproduction folders such as `.tmp-*` should stay untracked

## Pull Request Expectations

Before merging, try to keep these true:

- build passes
- unit tests pass when code behavior changed
- static validation passes
- any site-specific flow changes are tested against the relevant site variant when feasible
- README or contributor docs are updated if the workflow changed
