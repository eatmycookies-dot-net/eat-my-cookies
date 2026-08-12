/**
 * Unit tests — utils/storage.js
 *
 * Coverage:
 *   getSettings / updateSettings
 *   getStats / setStats / clearRecentActivity
 *   getSiteOverrides / setSiteOverride / removeSiteOverride / clearSiteOverrides
 *   getUnsupportedSites / setUnsupportedSite / clearUnsupportedSite
 *   exportSettings / importSettings
 */

import { describe, it, expect } from 'vitest';
import {
  getSettings,
  updateSettings,
  getStats,
  setStats,
  clearRecentActivity,
  getSiteOverrides,
  setSiteOverride,
  removeSiteOverride,
  clearSiteOverrides,
  getUnsupportedSites,
  setUnsupportedSite,
  clearUnsupportedSite,
  exportSettings,
  importSettings,
  runStorageMigrations,
} from '../../utils/storage.js';

// ── getSettings ───────────────────────────────────────────────────────────────

describe('getSettings()', () => {
  it('returns SYNC_DEFAULTS when nothing is stored', async () => {
    const s = await getSettings();
    expect(s.globalPreference).toBe('reject_all');
    expect(s.onboardingComplete).toBe(false);
    expect(s.showBadgeCount).toBe(true);
    expect(s.milestonesShown).toEqual([]);
    expect(s.reviewPromptsShown).toEqual([]);
    expect(s.reviewPromptClickedAt).toBeNull();
    expect(s.installDate).toBeNull();
  });

  it('returns stored value over default', async () => {
    await updateSettings({ globalPreference: 'accept_all' });
    const s = await getSettings();
    expect(s.globalPreference).toBe('accept_all');
  });

  it('returns categoryPreferences defaults', async () => {
    const s = await getSettings();
    expect(s.categoryPreferences).toMatchObject({
      functional: true,
      analytics: false,
      advertising: false,
      ccpaDoNotSell: true,
      uncategorized: 'reject',
    });
  });
});

// ── updateSettings ────────────────────────────────────────────────────────────

describe('updateSettings()', () => {
  it('persists a single key', async () => {
    await updateSettings({ globalPreference: 'custom' });
    const s = await getSettings();
    expect(s.globalPreference).toBe('custom');
  });

  it('persists multiple keys at once', async () => {
    await updateSettings({ globalPreference: 'accept_all', onboardingComplete: true });
    const s = await getSettings();
    expect(s.globalPreference).toBe('accept_all');
    expect(s.onboardingComplete).toBe(true);
  });

  it('does not clear unrelated keys', async () => {
    await updateSettings({ onboardingComplete: true });
    await updateSettings({ globalPreference: 'accept_all' });
    const s = await getSettings();
    expect(s.onboardingComplete).toBe(true);
    expect(s.globalPreference).toBe('accept_all');
  });
});

// ── getStats / setStats ───────────────────────────────────────────────────────

describe('getStats()', () => {
  it('returns LOCAL_DEFAULTS.stats when nothing is stored', async () => {
    const stats = await getStats();
    expect(stats.totalActionsCount).toBe(0);
    expect(stats.sitesHandled).toBe(0);
    expect(stats.handledSites).toEqual([]);
    expect(stats.recentActivity).toEqual([]);
    expect(stats.lastActionDate).toBeNull();
    expect(stats.lastActionNoticeOnly).toBe(false);
  });
});

describe('setStats()', () => {
  it('persists and retrieves custom stats', async () => {
    await setStats({
      totalActionsCount: 42,
      sitesHandled: 3,
      handledSites: ['a.com'],
      recentActivity: [],
      lastActionDate: '2024-01-01',
      lastActionNoticeOnly: true,
    });
    const stats = await getStats();
    expect(stats.totalActionsCount).toBe(42);
    expect(stats.sitesHandled).toBe(3);
    expect(stats.lastActionNoticeOnly).toBe(true);
  });
});

// ── clearRecentActivity ───────────────────────────────────────────────────────

describe('clearRecentActivity()', () => {
  it('empties the recentActivity array while preserving other stats fields', async () => {
    await setStats({
      totalActionsCount: 10,
      sitesHandled: 2,
      handledSites: ['x.com'],
      recentActivity: [{ site: 'x.com', method: 'test', preference: 'reject_all', timestamp: 'now' }],
      lastActionDate: '2024-01-01',
      lastActionSite: 'x.com',
      lastActionNoticeOnly: false,
    });
    await clearRecentActivity();
    const stats = await getStats();
    expect(stats.recentActivity).toEqual([]);
    expect(stats.totalActionsCount).toBe(10);
  });
});

// ── getSiteOverrides / setSiteOverride / removeSiteOverride ───────────────────

describe('getSiteOverrides()', () => {
  it('returns empty object when nothing is stored', async () => {
    expect(await getSiteOverrides()).toEqual({});
  });
});

describe('setSiteOverride()', () => {
  it('creates an override for a new domain', async () => {
    await setSiteOverride('example.com', { disabled: true });
    const overrides = await getSiteOverrides();
    expect(overrides['example.com']).toMatchObject({ disabled: true });
  });

  it('merges with an existing override', async () => {
    await setSiteOverride('example.com', { alwaysAccept: true });
    await setSiteOverride('example.com', { hiddenSelectors: ['#banner'] });
    const overrides = await getSiteOverrides();
    expect(overrides['example.com'].alwaysAccept).toBe(true);
    expect(overrides['example.com'].hiddenSelectors).toEqual(['#banner']);
  });

  it('does not affect other domains', async () => {
    await setSiteOverride('a.com', { disabled: true });
    await setSiteOverride('b.com', { alwaysAccept: true });
    const overrides = await getSiteOverrides();
    expect(overrides['a.com'].disabled).toBe(true);
    expect(overrides['b.com'].alwaysAccept).toBe(true);
    expect(overrides['a.com'].alwaysAccept).toBeUndefined();
  });
});

describe('removeSiteOverride()', () => {
  it('removes the domain entry', async () => {
    await setSiteOverride('gone.com', { disabled: true });
    await removeSiteOverride('gone.com');
    const overrides = await getSiteOverrides();
    expect(overrides['gone.com']).toBeUndefined();
  });

  it('does not throw when domain does not exist', async () => {
    await expect(removeSiteOverride('no-such.com')).resolves.not.toThrow();
  });
});

describe('clearSiteOverrides()', () => {
  it('removes all overrides', async () => {
    await setSiteOverride('a.com', { disabled: true });
    await setSiteOverride('b.com', { alwaysAccept: true });
    await clearSiteOverrides();
    expect(await getSiteOverrides()).toEqual({});
  });
});

// ── getUnsupportedSites / setUnsupportedSite / clearUnsupportedSite ───────────

describe('getUnsupportedSites()', () => {
  it('returns empty object by default', async () => {
    expect(await getUnsupportedSites()).toEqual({});
  });
});

describe('setUnsupportedSite()', () => {
  it('stores a value for a domain', async () => {
    await setUnsupportedSite('tricky.com', { reason: 'no reject path' });
    const sites = await getUnsupportedSites();
    expect(sites['tricky.com']).toMatchObject({ reason: 'no reject path' });
  });
});

describe('clearUnsupportedSite()', () => {
  it('removes the domain entry', async () => {
    await setUnsupportedSite('tricky.com', { reason: 'no reject path' });
    await clearUnsupportedSite('tricky.com');
    expect((await getUnsupportedSites())['tricky.com']).toBeUndefined();
  });
});

// ── runStorageMigrations() ────────────────────────────────────────────────────

describe('runStorageMigrations()', () => {
  it('removes legacy top-level category keys left over from before categoryPreferences existed', async () => {
    await chrome.storage.sync.set({
      functional: true,
      analytics: false,
      advertising: true,
      ccpaDoNotSell: false,
    });
    await runStorageMigrations();
    const raw = await chrome.storage.sync.get(['functional', 'analytics', 'advertising', 'ccpaDoNotSell']);
    expect(raw).not.toHaveProperty('functional');
    expect(raw).not.toHaveProperty('analytics');
    expect(raw).not.toHaveProperty('advertising');
    expect(raw).not.toHaveProperty('ccpaDoNotSell');
  });

  it('never touches the real categoryPreferences the user actually set', async () => {
    await updateSettings({
      categoryPreferences: { functional: false, analytics: true, advertising: true, ccpaDoNotSell: false, uncategorized: 'accept' },
    });
    await chrome.storage.sync.set({ functional: true, analytics: false });
    await runStorageMigrations();
    const s = await getSettings();
    expect(s.categoryPreferences).toEqual({ functional: false, analytics: true, advertising: true, ccpaDoNotSell: false, uncategorized: 'accept' });
  });

  it('backfills categoryPreferences from the legacy flat keys when the profile predates it, instead of silently falling back to defaults', async () => {
    // A profile old enough to have never written categoryPreferences at all —
    // the flat keys are the *only* record of what the user actually chose.
    // Deleting them without carrying the value forward would lose the
    // selection, not just tidy up dead storage.
    await chrome.storage.sync.set({
      functional: false,
      analytics: true,
      advertising: true,
      ccpaDoNotSell: false,
    });
    await runStorageMigrations();
    const s = await getSettings();
    expect(s.categoryPreferences).toEqual({
      functional: false,
      analytics: true,
      advertising: true,
      ccpaDoNotSell: false,
      uncategorized: 'reject', // not part of the legacy flat keys — falls back to default
    });
    const raw = await chrome.storage.sync.get(['functional', 'analytics', 'advertising', 'ccpaDoNotSell']);
    expect(raw).not.toHaveProperty('functional');
    expect(raw).not.toHaveProperty('advertising');
  });

  it('backfills only the legacy keys actually present, leaving the rest at default', async () => {
    await chrome.storage.sync.set({ ccpaDoNotSell: false });
    await runStorageMigrations();
    const s = await getSettings();
    expect(s.categoryPreferences).toEqual({
      functional: true, // default — never had a legacy key to backfill from
      analytics: false, // default
      advertising: false, // default
      ccpaDoNotSell: false, // backfilled from the legacy key
      uncategorized: 'reject',
    });
  });

  it('does not touch globalPreference or other real settings', async () => {
    await updateSettings({ globalPreference: 'custom', onboardingComplete: true });
    await chrome.storage.sync.set({ ccpaDoNotSell: true });
    await runStorageMigrations();
    const s = await getSettings();
    expect(s.globalPreference).toBe('custom');
    expect(s.onboardingComplete).toBe(true);
  });

  it('is a no-op on a fresh profile with no legacy keys', async () => {
    await expect(runStorageMigrations()).resolves.not.toThrow();
    const s = await getSettings();
    expect(s.categoryPreferences).toMatchObject({ functional: true, analytics: false, advertising: false, ccpaDoNotSell: true });
  });

  it('only runs once — a second call does not redo work or error on an already-clean profile', async () => {
    await chrome.storage.sync.set({ functional: true });
    await runStorageMigrations();
    await expect(runStorageMigrations()).resolves.not.toThrow();
    const raw = await chrome.storage.sync.get(['functional']);
    expect(raw).not.toHaveProperty('functional');
  });

  it('records a schema version so migrations do not re-scan storage forever', async () => {
    await runStorageMigrations();
    const { storageSchemaVersion } = await chrome.storage.sync.get({ storageSchemaVersion: 0 });
    expect(storageSchemaVersion).toBeGreaterThan(0);
  });
});

// ── exportSettings / importSettings ──────────────────────────────────────────

describe('exportSettings()', () => {
  it('returns a valid JSON string', async () => {
    const json = await exportSettings();
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('includes all SYNC_DEFAULTS keys', async () => {
    const json = await exportSettings();
    const parsed = JSON.parse(json);
    expect(parsed).toHaveProperty('globalPreference');
    expect(parsed).toHaveProperty('categoryPreferences');
    expect(parsed).toHaveProperty('showBadgeCount');
    expect(parsed).toHaveProperty('onboardingComplete');
    expect(parsed).toHaveProperty('milestonesShown');
    expect(parsed).toHaveProperty('reviewPromptsShown');
    expect(parsed).toHaveProperty('reviewPromptClickedAt');
  });
});

describe('importSettings()', () => {
  it('imports known keys and persists them', async () => {
    const payload = JSON.stringify({ globalPreference: 'accept_all', onboardingComplete: true });
    await importSettings(payload);
    const s = await getSettings();
    expect(s.globalPreference).toBe('accept_all');
    expect(s.onboardingComplete).toBe(true);
  });

  it('ignores unknown keys', async () => {
    const payload = JSON.stringify({ globalPreference: 'custom', unknownKey: 'evil' });
    await importSettings(payload);
    const s = await getSettings();
    expect(s).not.toHaveProperty('unknownKey');
  });

  it('throws on invalid JSON', async () => {
    await expect(importSettings('not json {')).rejects.toThrow();
  });

  it('round-trips settings correctly', async () => {
    await updateSettings({ globalPreference: 'accept_all', showBadgeCount: false });
    const exported = await exportSettings();
    await updateSettings({ globalPreference: 'reject_all', showBadgeCount: true });
    await importSettings(exported);
    const s = await getSettings();
    expect(s.globalPreference).toBe('accept_all');
    expect(s.showBadgeCount).toBe(false);
  });
});
