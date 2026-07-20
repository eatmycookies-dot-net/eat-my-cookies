/**
 * Unit tests — utils/stats.js
 *
 * Coverage:
 *   MILESTONES structure
 *   recordAction (counter, activity, milestone triggering)
 *   recordSite (unique domain tracking)
 *   getNewMilestones
 *   formatBadgeCount
 *   formatActivityPreference
 */

import { describe, it, expect } from 'vitest';
import {
  MILESTONES,
  recordAction,
  recordSite,
  getNewMilestones,
  formatBadgeCount,
  formatActivityPreference,
} from '../../utils/stats.js';
import { setStats, getStats } from '../../utils/storage.js';

// ── MILESTONES structure ──────────────────────────────────────────────────────

describe('MILESTONES', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(MILESTONES)).toBe(true);
    expect(MILESTONES.length).toBeGreaterThan(0);
  });

  it('each milestone has id, threshold, name, icon', () => {
    for (const m of MILESTONES) {
      expect(typeof m.id).toBe('string');
      expect(m.id.length).toBeGreaterThan(0);
      expect(typeof m.threshold).toBe('number');
      expect(typeof m.name).toBe('string');
      expect(typeof m.icon).toBe('string');
    }
  });

  it('ids are unique', () => {
    const ids = MILESTONES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('thresholds are strictly increasing', () => {
    for (let i = 1; i < MILESTONES.length; i++) {
      expect(MILESTONES[i].threshold).toBeGreaterThan(MILESTONES[i - 1].threshold);
    }
  });

  it('uses a unique icon file for every milestone', () => {
    const icons = MILESTONES.map((m) => m.icon);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it('first threshold is 1 (first banner handled)', () => {
    expect(MILESTONES[0].threshold).toBe(1);
  });

  it('top threshold is at least 1,000,000', () => {
    const top = MILESTONES[MILESTONES.length - 1].threshold;
    expect(top).toBeGreaterThanOrEqual(1_000_000);
  });
});

// ── recordAction ──────────────────────────────────────────────────────────────

describe('recordAction()', () => {
  it('increments totalActionsCount by 1', async () => {
    const { stats } = await recordAction({ site: 'a.com', method: 'dom:test', preference: 'reject_all' });
    expect(stats.totalActionsCount).toBe(1);
  });

  it('accumulates across multiple calls', async () => {
    await recordAction({ site: 'a.com', method: 'm', preference: 'reject_all' });
    await recordAction({ site: 'b.com', method: 'm', preference: 'reject_all' });
    const { stats } = await recordAction({ site: 'c.com', method: 'm', preference: 'reject_all' });
    expect(stats.totalActionsCount).toBe(3);
  });

  it('updates lastActionSite and lastActionDate', async () => {
    const { stats } = await recordAction({ site: 'xyz.com', method: 'm', preference: 'reject_all' });
    expect(stats.lastActionSite).toBe('xyz.com');
    expect(typeof stats.lastActionDate).toBe('string');
  });

  it('stores whether the latest action was notice-only', async () => {
    const { stats } = await recordAction({
      site: 'notice.com',
      method: 'm',
      preference: 'reject_all',
      noticeOnly: true,
    });
    expect(stats.lastActionNoticeOnly).toBe(true);
    expect(stats.recentActivity[0].noticeOnly).toBe(true);
  });

  it('prepends activity to recentActivity', async () => {
    await recordAction({ site: 'first.com', method: 'm', preference: 'reject_all' });
    const { stats } = await recordAction({ site: 'second.com', method: 'm', preference: 'reject_all' });
    expect(stats.recentActivity[0].site).toBe('second.com');
    expect(stats.recentActivity[1].site).toBe('first.com');
  });

  it('trims recentActivity to max 20 entries', async () => {
    // Seed 19 actions
    await setStats({
      totalActionsCount: 19,
      sitesHandled: 0,
      handledSites: [],
      recentActivity: Array(19).fill({ site: 'old.com', method: 'm', preference: 'reject_all', noticeOnly: false, timestamp: 't' }),
      lastActionDate: null,
      lastActionSite: null,
      lastActionNoticeOnly: false,
    });
    const { stats } = await recordAction({ site: 'new.com', method: 'm', preference: 'reject_all' });
    expect(stats.recentActivity.length).toBe(20);
    const { stats: s2 } = await recordAction({ site: 'newest.com', method: 'm', preference: 'reject_all' });
    expect(s2.recentActivity.length).toBe(20);
  });

  it('triggers first milestone when count crosses threshold=1', async () => {
    const { triggeredMilestones } = await recordAction({ site: 'a.com', method: 'm', preference: 'reject_all' });
    expect(triggeredMilestones.length).toBeGreaterThan(0);
    expect(triggeredMilestones[0].id).toBe('first_action');
  });

  it('does not re-trigger a milestone already reached', async () => {
    // Seed count at threshold already
    await setStats({
      totalActionsCount: 1,
      sitesHandled: 0,
      handledSites: [],
      recentActivity: [],
      lastActionDate: null,
      lastActionSite: null,
      lastActionNoticeOnly: false,
    });
    const { triggeredMilestones } = await recordAction({ site: 'a.com', method: 'm', preference: 'reject_all' });
    // first_action (threshold=1) should NOT trigger since prev was already 1
    const firstBite = triggeredMilestones.find((m) => m.id === 'first_action');
    expect(firstBite).toBeUndefined();
  });

  it('triggers baker dozen milestone at threshold=12', async () => {
    await setStats({
      totalActionsCount: 11,
      sitesHandled: 0,
      handledSites: [],
      recentActivity: [],
      lastActionDate: null,
      lastActionSite: null,
      lastActionNoticeOnly: false,
    });
    const { triggeredMilestones } = await recordAction({ site: 'a.com', method: 'm', preference: 'reject_all' });
    const bakers = triggeredMilestones.find((m) => m.id === 'dozen');
    expect(bakers).toBeDefined();
  });
});

// ── recordSite ────────────────────────────────────────────────────────────────

describe('recordSite()', () => {
  it('adds a domain and increments sitesHandled', async () => {
    await recordSite('example.com');
    const stats = await getStats();
    expect(stats.handledSites).toContain('example.com');
    expect(stats.sitesHandled).toBe(1);
  });

  it('deduplicates: same domain counted once', async () => {
    await recordSite('example.com');
    await recordSite('example.com');
    const stats = await getStats();
    expect(stats.sitesHandled).toBe(1);
  });

  it('counts multiple unique domains separately', async () => {
    await recordSite('a.com');
    await recordSite('b.com');
    await recordSite('c.com');
    const stats = await getStats();
    expect(stats.sitesHandled).toBe(3);
  });
});

// ── getNewMilestones ──────────────────────────────────────────────────────────

describe('getNewMilestones()', () => {
  it('returns triggered milestones not already shown', () => {
    const triggered = [MILESTONES[0], MILESTONES[1]];
    const shown = ['first_action'];
    const result = getNewMilestones(shown, triggered);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('dozen');
  });

  it('returns all triggered milestones when none are shown', () => {
    const triggered = [MILESTONES[0]];
    expect(getNewMilestones([], triggered).length).toBe(1);
  });

  it('returns empty when all triggered are already shown', () => {
    const triggered = [MILESTONES[0]];
    expect(getNewMilestones(['first_action'], triggered).length).toBe(0);
  });
});

// ── formatBadgeCount ──────────────────────────────────────────────────────────

describe('formatBadgeCount()', () => {
  it('renders numbers < 1000 as-is', () => {
    expect(formatBadgeCount(0)).toBe('0');
    expect(formatBadgeCount(999)).toBe('999');
  });

  it('renders 1000–9999 as Xk', () => {
    expect(formatBadgeCount(1000)).toBe('1k');
    expect(formatBadgeCount(9999)).toBe('9k');
  });

  it('renders 10000–999999 as Xk', () => {
    expect(formatBadgeCount(10000)).toBe('10k');
    expect(formatBadgeCount(999999)).toBe('999k');
  });

  it('renders 1000000+ as XM', () => {
    expect(formatBadgeCount(1_000_000)).toBe('1M');
    expect(formatBadgeCount(5_500_000)).toBe('5M');
  });
});

// ── formatActivityPreference ──────────────────────────────────────────────────

describe('formatActivityPreference()', () => {
  it('returns "Accepted" when method contains accept', () => {
    expect(formatActivityPreference({ method: 'dom:accept_all', preference: 'reject_all' })).toBe('Accepted');
  });

  it('returns "Accepted" when preference is accept_all', () => {
    expect(formatActivityPreference({ method: 'dom:cmp', preference: 'accept_all' })).toBe('Accepted');
  });

  it('returns "Rejected" when method contains reject', () => {
    expect(formatActivityPreference({ method: 'sourcepoint:gdpr:reject_all', preference: 'reject_all' })).toBe('Rejected');
  });

  it('returns "CCPA handled" for US privacy / CCPA-style methods', () => {
    expect(formatActivityPreference({ method: 'sourcepoint:usnat:opt_out', preference: 'reject_all' })).toBe('CCPA handled');
    expect(formatActivityPreference({ method: 'site_specific:latimes:ccpa_accept', preference: 'reject_all' })).toBe('CCPA handled');
    expect(formatActivityPreference({ method: 'site_specific:latimes:ccpa_opt_out', preference: 'reject_all' })).toBe('CCPA handled');
    expect(formatActivityPreference({ method: 'site_specific:bbc:ccpa_cleared', preference: 'custom' })).toBe('CCPA handled');
  });

  it('returns "Rejected" when preference is reject_all even if method is generic', () => {
    expect(formatActivityPreference({ method: 'dom:cmp', preference: 'reject_all' })).toBe('Rejected');
  });

  it('returns "Custom" when preference is custom', () => {
    expect(formatActivityPreference({ method: 'dom:cmp', preference: 'custom' })).toBe('Custom');
  });

  it('returns "Custom" when method includes settings_save', () => {
    expect(formatActivityPreference({ method: 'site_specific:settings_save', preference: 'custom' })).toBe('Custom');
  });

  it('returns "Handled" for unknown combinations', () => {
    expect(formatActivityPreference({ method: 'tcf:intercept', preference: 'unknown' })).toBe('Handled');
  });
});
