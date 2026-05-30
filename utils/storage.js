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
  installDate: null,
};

const LOCAL_DEFAULTS = {
  stats: {
    totalActionsCount: 0,
    sitesHandled: 0,
    handledSites: [],
    lastActionDate: null,
    lastActionSite: null,
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
