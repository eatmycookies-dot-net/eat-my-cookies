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

Prefer `npm run verify` during normal iteration, `npm run test` before opening a PR when code behavior changed, and targeted `npm run test:e2e` when you touched a supported site or CMP flow.

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
