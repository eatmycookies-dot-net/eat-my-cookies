# Storage Schema Migrations

This extension has no backend — `chrome.storage.sync` and `chrome.storage.local` are the only
persistent state, and profiles can live for years across many extension versions. When the shape
of that state changes (a key renamed, nested, removed, or superseded), old profiles keep whatever
they already had until something explicitly cleans it up. Nothing does that automatically in
Chrome's storage APIs — silence is not the same as correctness.

## Why this exists

`utils/storage.js` defines the canonical shape of settings in `SYNC_DEFAULTS` /
`LOCAL_DEFAULTS`. Those defaults describe what *should* be there today, not what's actually
sitting in every installed profile. A profile that predates a schema change can carry stale,
orphaned keys indefinitely — nothing reads them, nothing writes them, but nothing removes them
either.

That gap caused a real, hard-to-reproduce bug in August 2026: a user reported `zeit.de` still
refresh-looping after the underlying loop was already fixed and verified clean on every fresh
test profile. The difference was their long-lived browser profile, which (traced after the fact)
was carrying legacy top-level `functional` / `analytics` / `advertising` / `ccpaDoNotSell` sync
keys — flat siblings left over from before preferences moved into the current nested
`categoryPreferences` object. No current code path read or wrote them; they'd simply never been
cleaned up. Clearing the user's storage fixed it. `runStorageMigrations()` exists so the next
person doesn't have to clear their own storage manually to recover from a schema change we
already know about.

## The hard rule

**A migration must never cause the user to lose a selection they actually made.** That's the
real invariant — not "never touch user data." Migrations are allowed, and sometimes required, to
touch keys that hold real user-chosen values: renaming a key, moving a value into a new nested
shape, merging two old fields into one, backfilling a new field from an old one. What's never
allowed is a migration that drops, resets to default, or silently discards the user's actual
intent while doing that reshaping — e.g. removing an old key without first carrying its value
into the new location, or overwriting a real preference with a hardcoded default "just to be
safe."

In practice:

- If the key you're touching is genuinely dead (nothing reads or writes it, confirmed by
  grepping the whole codebase — the situation migration 1 below handled), it's safe to just
  remove it. There's no value to preserve.
- If the key holds something the user actually set, the migration must **read the old value,
  translate it into the new shape, write the new value, and only then remove the old key** (if
  removing it at all). Write this as a copy-forward, not a delete. Test the translation with a
  profile that has real pre-migration data in it, not just an empty one — the "no-op on a fresh
  profile" test alone won't catch a translation bug.
- If you're not sure whether a key is dead debris or a real (if oddly-shaped) user preference,
  investigate first — grep every reader/writer, check `tests/unit/storage.test.js` for what
  depends on it — rather than guessing either way.

A migration should also be **narrow and named**, not a general "clean up anything that looks
wrong" pass. Target exact, known key names, the same way the first migration lists
`['functional', 'analytics', 'advertising', 'ccpaDoNotSell']` by name rather than inferring dead
keys heuristically.

## How the mechanism works

Everything lives in `utils/storage.js`:

```js
const STORAGE_SCHEMA_VERSION_KEY = 'storageSchemaVersion';

const STORAGE_MIGRATIONS = [
  {
    version: 1,
    migrate: async () => { /* ... */ },
  },
];

export async function runStorageMigrations() { /* ... */ }
```

- `storageSchemaVersion` is a plain integer counter stored in `chrome.storage.sync`, starting
  implicitly at `0` for any profile that has never run a migration (fresh installs included).
  It is **deliberately independent of `manifest.json` / `package.json`'s marketing version** —
  those get bumped for reasons that have nothing to do with storage shape, and tying migrations
  to them means either forgetting to bump the right one or migrations firing (or not firing) for
  the wrong reason.
- `runStorageMigrations()` reads the current `storageSchemaVersion`, runs every migration whose
  `version` is greater than it, in ascending order, then writes the highest version reached back
  to storage. A profile that's already current runs zero migrations — the function is a cheap
  no-op every time after that.
- It's invoked once, unconditionally, from `chrome.runtime.onInstalled` in
  `background/service-worker.js`. `onInstalled` fires on real installs and updates, not on every
  browser startup, so this doesn't run on a hot path — no need to also hook `onStartup`.
  Running it unconditionally (not gated on `reason === 'update'`) is intentional: it's a no-op
  for fresh installs (nothing to migrate) and for already-migrated profiles (version check short
  circuits), so there's no reason to special-case `reason`.

## Adding a new migration

1. Confirm, by grepping the whole codebase (not just `utils/storage.js`), that the key(s) you
   want to touch are genuinely dead or genuinely need reshaping — not read by any content script,
   background handler, or popup code path, and not something `exportSettings()` /
   `importSettings()` round-trips as a real user setting.
2. Append a new entry to `STORAGE_MIGRATIONS` with the next integer `version`. **Never reuse,
   renumber, or delete a past entry** — once a version number has shipped, profiles out in the
   world may already be past it. Changing a past migration's behavior after release means some
   profiles ran the old behavior and some will never run the new one; if a past migration turns
   out to be wrong, ship a new, higher-numbered migration that fixes the consequences instead of
   editing history.
3. Write `migrate` as an idempotent async function: it must be safe to run exactly once per
   profile (the version gate guarantees that in practice), but don't rely on ordering beyond "runs
   after every lower-numbered migration already ran." Read with `chrome.storage.sync.get([...])`
   or `chrome.storage.local.get([...])`, using an explicit key list — never wipe or replace whole
   storage areas.
4. Add a one-line comment on the migration explaining *why* it exists (what shipped it, what old
   shape it's cleaning up) — the next person reading `STORAGE_MIGRATIONS` should not need to dig
   through git blame to understand why a given key is being removed.
5. Add tests in `tests/unit/storage.test.js` following the existing `runStorageMigrations()`
   block. For a dead-key-removal migration: assert the dead key(s) are gone and assert unrelated
   real settings (`categoryPreferences`, `globalPreference`, etc.) are byte-for-byte untouched.
   For a migration that carries a real value forward: assert the value survives the translation
   correctly (seed storage with realistic pre-migration data, not an empty profile, then check the
   new key holds the right translated value and the user's choice wasn't reset to a default).
   Either way, also assert it's a no-op on a profile that never had the old key, and that a second
   call doesn't redo work or throw.
6. If the migration is `chrome.storage.local` rather than `chrome.storage.sync` (e.g. cleaning up
   `stats`, `siteOverrides`, or `unsupportedSites` shape drift), the same pattern applies — just
   read/write the local area instead. The current `storageSchemaVersion` counter lives in sync
   storage; keep using that single counter for both areas rather than introducing a second one,
   unless a real reason to split them shows up later.
7. Update this file's "Shipped migrations" log below.

## Shipped migrations

| Version | What it removes/fixes | Shipped | Why |
| --- | --- | --- | --- |
| 1 | Legacy top-level `functional` / `analytics` / `advertising` / `ccpaDoNotSell` sync keys | 2026-08-09 (v1.3.3) | Predate the `categoryPreferences` nesting; unread, unwritten by any current code path, but could sit in aged profiles indefinitely — see "Why this exists" above. If `categoryPreferences` already exists, the flat keys are stale duplicates and are just removed. If a profile predates `categoryPreferences` entirely, the flat keys are the only record of what the user chose — this migration backfills `categoryPreferences` from them before removing them, rather than letting the value silently fall back to `SYNC_DEFAULTS`. |

## Testing

`tests/unit/storage.test.js` exercises `runStorageMigrations()` directly against the mocked
`chrome.storage` in `tests/__setup__/chrome.js` (which supports `get`/`set`/`clear`/`remove`).
There is no live/VPN validation step needed for a storage migration on its own — it's pure
storage-shape logic, not a CMP interaction — but if a migration is added specifically to resolve
a live-reported bug (as migration 1 was), it's worth noting the connection in
`private/human-validation-backlog.md` the way the zeit.de entry does, so the link between the
symptom and the fix isn't lost.
