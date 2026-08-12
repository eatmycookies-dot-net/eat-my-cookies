const SYNC_DEFAULTS = {
  globalPreference: 'reject_all',
  categoryPreferences: {
    functional: true,
    analytics: false,
    advertising: false,
    ccpaDoNotSell: true,
    uncategorized: 'reject',
  },
  showBadgeCount: true,
  uiLanguage: 'auto',
  onboardingComplete: false,
  milestonesShown: [],
  reviewPromptsShown: [],
  reviewPromptClickedAt: null,
  installDate: null,
};

const LOCAL_DEFAULTS = {
  stats: {
    totalActionsCount: 0,
    sitesHandled: 0,
    handledSites: [],
    lastActionDate: null,
    lastActionSite: null,
    lastActionNoticeOnly: false,
    recentActivity: [],
  },
  siteOverrides: {},
  unsupportedSites: {},
};

export async function getSettings() {
  return chrome.storage.sync.get(SYNC_DEFAULTS);
}

export async function updateSettings(updates) {
  await chrome.storage.sync.set(updates);
}

export async function getStats() {
  const result = await chrome.storage.local.get({ stats: LOCAL_DEFAULTS.stats });
  return result.stats;
}

export async function setStats(stats) {
  await chrome.storage.local.set({ stats });
}

export async function clearRecentActivity() {
  const stats = await getStats();
  stats.recentActivity = [];
  await setStats(stats);
}

export async function getSiteOverrides() {
  const result = await chrome.storage.local.get({ siteOverrides: {} });
  return result.siteOverrides;
}

export async function setSiteOverride(domain, override) {
  const overrides = await getSiteOverrides();
  overrides[domain] = { ...overrides[domain], ...override };
  await chrome.storage.local.set({ siteOverrides: overrides });
}

export async function removeSiteOverride(domain) {
  const overrides = await getSiteOverrides();
  delete overrides[domain];
  await chrome.storage.local.set({ siteOverrides: overrides });
}

export async function clearSiteOverrides() {
  await chrome.storage.local.set({ siteOverrides: {} });
}

export async function getUnsupportedSites() {
  const result = await chrome.storage.local.get({ unsupportedSites: {} });
  return result.unsupportedSites;
}

function domainAliases(domain) {
  if (!domain) return [];
  const aliases = new Set([domain]);
  if (domain.startsWith('www.')) {
    aliases.add(domain.slice(4));
  } else {
    aliases.add(`www.${domain}`);
  }
  return Array.from(aliases);
}

export async function setUnsupportedSite(domain, value) {
  const unsupportedSites = await getUnsupportedSites();
  for (const alias of domainAliases(domain)) {
    unsupportedSites[alias] = { ...value, site: alias };
  }
  await chrome.storage.local.set({ unsupportedSites });
}

export async function clearUnsupportedSite(domain) {
  const unsupportedSites = await getUnsupportedSites();
  for (const alias of domainAliases(domain)) {
    delete unsupportedSites[alias];
  }
  await chrome.storage.local.set({ unsupportedSites });
}

// ── Storage schema migrations ─────────────────────────────────────────────────
// Gated by a persisted schema version counter, independent of the extension's
// marketing version (manifest.json/package.json) so it never depends on
// remembering to bump those in lockstep with a storage change. Each migration
// runs at most once per profile. Migrations must only remove or repair
// implementation-internal storage debris — never a value the user actually
// chose (categoryPreferences, globalPreference, etc.).
const STORAGE_SCHEMA_VERSION_KEY = 'storageSchemaVersion';

const STORAGE_MIGRATIONS = [
  {
    version: 1,
    // Legacy flat category keys (functional/analytics/advertising/ccpaDoNotSell
    // stored as top-level sync keys) predate the current categoryPreferences
    // nesting. No current code path reads or writes them, but an aged profile
    // can still carry stale copies alongside the real nested values, desynced
    // from what the user actually set — traced to a real refresh-loop report
    // on zeit.de in August 2026 that only cleared once the user's own storage
    // was reset.
    migrate: async () => {
      const legacyKeys = ['functional', 'analytics', 'advertising', 'ccpaDoNotSell'];
      const stored = await chrome.storage.sync.get([...legacyKeys, 'categoryPreferences']);
      const present = legacyKeys.filter((key) => key in stored);
      if (!present.length) return;

      // If categoryPreferences already exists, every current code path has been
      // reading and writing that nested object ever since it shipped — it is
      // strictly newer than the flat keys, which nothing has written since, so
      // the flat keys are stale duplicates safe to discard without merging.
      // But if this profile predates categoryPreferences entirely, the flat
      // keys are the *only* record of what the user actually chose — deleting
      // them outright would silently fall back to SYNC_DEFAULTS instead of
      // carrying the real selection forward, which is exactly the kind of loss
      // migrations must not cause. Backfill in that case instead.
      if (!('categoryPreferences' in stored)) {
        const backfilled = { ...SYNC_DEFAULTS.categoryPreferences };
        for (const key of present) {
          backfilled[key] = stored[key];
        }
        await chrome.storage.sync.set({ categoryPreferences: backfilled });
      }

      await chrome.storage.sync.remove(present);
    },
  },
];

export async function runStorageMigrations() {
  const { [STORAGE_SCHEMA_VERSION_KEY]: currentVersion } = await chrome.storage.sync.get({
    [STORAGE_SCHEMA_VERSION_KEY]: 0,
  });
  const pending = STORAGE_MIGRATIONS.filter((migration) => migration.version > currentVersion);
  if (!pending.length) return;
  for (const migration of pending) {
    await migration.migrate();
  }
  const latestVersion = pending.reduce((max, migration) => Math.max(max, migration.version), currentVersion);
  await chrome.storage.sync.set({ [STORAGE_SCHEMA_VERSION_KEY]: latestVersion });
}

export async function exportSettings() {
  const settings = await getSettings();
  return JSON.stringify(settings, null, 2);
}

export async function importSettings(jsonString) {
  const imported = JSON.parse(jsonString);
  const valid = {};
  for (const key of Object.keys(SYNC_DEFAULTS)) {
    if (key in imported) valid[key] = imported[key];
  }
  await chrome.storage.sync.set(valid);
}
