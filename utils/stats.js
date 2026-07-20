import { getStats, setStats } from './storage.js';

const RECENT_ACTIVITY_LIMIT = 20;

// `name` is the English fallback (also used by tests/static-checks.js and
// tests/unit/stats.test.js). `nameKey` is the _locales/*/messages.json key
// popup.js looks up via i18n.t() to display the badge name in the user's
// chosen UI language.
export const MILESTONES = [
  { id: 'first_action',          threshold: 1,        name: 'First Bite',           nameKey: 'badgeNameFirstBite',           icon: '../icons/badges/first-bite.png' },
  { id: 'dozen',                 threshold: 12,       name: "Baker's Dozen",        nameKey: 'badgeNameBakersDozen',         icon: '../icons/badges/bakers-dozen.png' },
  { id: 'quarter_crunch',        threshold: 25,       name: 'Quarter Crunch',       nameKey: 'badgeNameQuarterCrunch',       icon: '../icons/badges/quarter-crunch.png' },
  { id: 'fifty_stack',           threshold: 50,       name: 'Fifty Stack',          nameKey: 'badgeNameFiftyStack',          icon: '../icons/badges/fifty-stack.png' },
  { id: 'seventy_five',          threshold: 75,       name: 'Snack Attack',         nameKey: 'badgeNameSnackAttack',         icon: '../icons/badges/snack-attack.png' },
  { id: 'century',               threshold: 100,      name: 'Century Crumbler',     nameKey: 'badgeNameCenturyCrumbler',     icon: '../icons/badges/century-crumbler.png' },
  { id: 'two_hundred',           threshold: 200,      name: 'Double Dip',           nameKey: 'badgeNameDoubleDip',           icon: '../icons/badges/double-dip.png' },
  { id: 'three_hundred',         threshold: 300,      name: 'Tray Tracker',         nameKey: 'badgeNameTrayTracker',         icon: '../icons/badges/tray-tracker.png' },
  { id: 'four_hundred',          threshold: 400,      name: 'Oven Regular',         nameKey: 'badgeNameOvenRegular',         icon: '../icons/badges/oven-regular.png' },
  { id: 'five_hundred',          threshold: 500,      name: 'Cookie Crusher',       nameKey: 'badgeNameCookieCrusher',       icon: '../icons/badges/cookie-crusher.png' },
  { id: 'thousand',              threshold: 1000,     name: 'Terminator',           nameKey: 'badgeNameTerminator',          icon: '../icons/badges/terminator.png' },
  { id: 'two_thousand',          threshold: 2000,     name: 'Jar Raider',           nameKey: 'badgeNameJarRaider',           icon: '../icons/badges/jar-raider.png' },
  { id: 'three_thousand',        threshold: 3000,     name: 'Batch Boss',           nameKey: 'badgeNameBatchBoss',           icon: '../icons/badges/batch-boss.png' },
  { id: 'four_thousand',         threshold: 4000,     name: 'Crate Cracker',        nameKey: 'badgeNameCrateCracker',        icon: '../icons/badges/crate-cracker.png' },
  { id: 'five_thousand',         threshold: 5000,     name: 'Unstoppable',          nameKey: 'badgeNameUnstoppable',         icon: '../icons/badges/unstoppable.png' },
  { id: 'ten_thousand',          threshold: 10000,    name: 'Legend',               nameKey: 'badgeNameLegend',              icon: '../icons/badges/legend.png' },
  { id: 'twenty_five_thousand',  threshold: 25000,    name: 'Scroll Stomper',       nameKey: 'badgeNameScrollStomper',       icon: '../icons/badges/scroll-stomper.png' },
  { id: 'fifty_thousand',        threshold: 50000,    name: 'Bannerbreaker',        nameKey: 'badgeNameBannerbreaker',       icon: '../icons/badges/bannerbreaker.png' },
  { id: 'hundred_thousand',      threshold: 100000,   name: 'Consent Cartographer', nameKey: 'badgeNameConsentCartographer', icon: '../icons/badges/consent-cartographer.png' },
  { id: 'quarter_million',       threshold: 250000,   name: 'Wall Whisperer',       nameKey: 'badgeNameWallWhisperer',       icon: '../icons/badges/wall-whisperer.png' },
  { id: 'half_million',          threshold: 500000,   name: 'Crumb Colossus',       nameKey: 'badgeNameCrumbColossus',       icon: '../icons/badges/crumb-colossus.png' },
  { id: 'million',               threshold: 1000000,  name: 'Mythic Muncher',       nameKey: 'badgeNameMythicMuncher',       icon: '../icons/badges/mythic-muncher.png' },
];

export async function recordAction({ site, method, preference, noticeOnly = false }) {
  const stats = await getStats();

  const prev = stats.totalActionsCount;
  stats.totalActionsCount += 1;
  stats.lastActionDate = new Date().toISOString();
  stats.lastActionSite = site;
  stats.lastActionNoticeOnly = Boolean(noticeOnly);

  const activity = {
    site,
    method,
    preference,
    noticeOnly: Boolean(noticeOnly),
    timestamp: stats.lastActionDate,
  };
  stats.recentActivity = [activity, ...stats.recentActivity].slice(0, RECENT_ACTIVITY_LIMIT);

  const triggered = MILESTONES.filter(
    (m) => prev < m.threshold && stats.totalActionsCount >= m.threshold
  );

  await setStats(stats);
  return { stats, triggeredMilestones: triggered };
}

export async function recordSite(domain) {
  const stats = await getStats();
  const handledSites = new Set(stats.handledSites ?? []);
  handledSites.add(domain);
  stats.handledSites = [...handledSites];
  stats.sitesHandled = stats.handledSites.length;
  await setStats(stats);
}

export function getNewMilestones(milestonesShown, triggeredMilestones) {
  return triggeredMilestones.filter((m) => !milestonesShown.includes(m.id));
}

export function formatBadgeCount(count) {
  if (count < 1000) return String(count);
  if (count < 10000) return `${Math.floor(count / 1000)}k`;
  if (count < 1000000) return `${Math.floor(count / 1000)}k`;
  if (count < 10000000) return `${Math.floor(count / 1000000)}M`;
  if (count < 1000000000) return `${Math.floor(count / 1000000)}M`;
  return `${Math.floor(count / 1000000000)}B`;
}

export function formatActivityPreference(activity) {
  const method = String(activity.method ?? '').toLowerCase();
  const preference = String(activity.preference ?? '').toLowerCase();

  if (
    method.includes('ccpa') ||
    method.includes('usnat')
  ) {
    return 'CCPA handled';
  }

  if (
    method.includes('accept') ||
    preference === 'accept_all'
  ) {
    return 'Accepted';
  }

  if (
    method.includes('custom') ||
    method.includes('settings_save') ||
    preference === 'custom'
  ) {
    return 'Custom';
  }

  if (
    method.includes('reject') ||
    method.includes('deny') ||
    method.includes('refuse') ||
    method.includes('opt_out') ||
    preference === 'reject_all'
  ) {
    return 'Rejected';
  }

  return 'Handled';
}
