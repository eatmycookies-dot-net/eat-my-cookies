/**
 * Popup tests — popup/popup.js
 *
 * Coverage:
 *   renderStats    — total count and sites count displayed correctly
 *   renderPreference — Edit button visibility (custom vs other)
 *   renderBadges   — badge chips rendered with correct icon
 *   showMilestoneCard / showReviewCard — popup card content and CTA behavior
 *   formatSiteOverrideLabel helpers
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MILESTONES } from '../../utils/stats.js';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');

// ── DOM setup ─────────────────────────────────────────────────────────────────
// Build the minimal popup HTML structure that popup.js expects.

function buildPopupDOM() {
  document.body.innerHTML = `
    <div id="main-view">
      <div id="total-count">—</div>
      <div id="sites-count">across — sites</div>
      <div id="milestone-card" class="hidden">
        <div class="milestone-icon">🍪</div>
        <div id="milestone-name"></div>
        <div id="milestone-desc"></div>
        <div id="milestone-nudge"></div>
        <a id="milestone-donate" href="#">Buy me a coffee</a>
        <button id="milestone-dismiss">Dismiss</button>
      </div>
      <section id="site-warning" class="hidden">
        <div id="site-warning-title"></div>
        <div id="site-warning-text"></div>
        <button id="site-accept-btn" class="hidden"></button>
        <button id="site-warning-dismiss">Dismiss</button>
      </section>
      <div id="site-toggle-row" class="hidden">
        <span id="site-toggle-label"></span>
        <button id="site-toggle-btn"></button>
      </div>
      <div class="pref-row">
        <select id="pref-select">
          <option value="reject_all">Reject All</option>
          <option value="accept_all">Accept All</option>
          <option value="custom">Custom</option>
        </select>
        <button id="pref-edit-btn" class="hidden">Edit →</button>
      </div>
      <label class="pref-row">
        <span>CCPA: Do not sell/share</span>
        <input type="checkbox" id="pref-ccpa-do-not-sell">
      </label>
      <ul id="activity-list"></ul>
      <button id="clear-activity-btn">Clear</button>
      <div id="badges-list"></div>
      <span id="badges-count">0</span>
      <div id="site-overrides-list"></div>
    </div>

    <div id="settings-view" class="hidden">
      <button id="settings-btn"></button>
      <button id="popup-close"></button>
      <button id="settings-back"></button>
      <button id="settings-close"></button>
      <input type="radio" name="pref" value="reject_all">
      <input type="radio" name="pref" value="accept_all">
      <input type="radio" name="pref" value="custom">
      <div id="custom-toggles" class="hidden">
        <input type="checkbox" id="toggle-functional">
        <input type="checkbox" id="toggle-analytics">
        <input type="checkbox" id="toggle-advertising">
        <input type="checkbox" id="toggle-ccpa-do-not-sell">
        <select id="toggle-uncategorized">
          <option value="reject">Reject</option>
          <option value="accept">Accept</option>
        </select>
      </div>
      <input type="checkbox" id="toggle-badge">
      <button id="export-btn">Export</button>
      <button id="import-btn">Import</button>
      <input type="file" id="import-file">
      <button id="clear-overrides-btn">Clear overrides</button>
      <span id="version-label"></span>
      <a id="report-bug-link" href="#"></a>
      <button id="restart-onboarding-btn"></button>
    </div>
  `;
}

// ── Helpers extracted from popup.js for unit testing ─────────────────────────
// We copy the pure render functions here (they have no side effects outside DOM)
// rather than loading popup.js which auto-calls init() and requires chrome mocks.

function renderStats(stats) {
  document.getElementById('total-count').textContent = stats.totalActionsCount.toLocaleString();
  const sc = stats.sitesHandled;
  document.getElementById('sites-count').textContent =
    `across ${sc.toLocaleString()} ${sc === 1 ? 'site' : 'sites'}`;
}

function renderPreference(settings) {
  const select  = document.getElementById('pref-select');
  const editBtn = document.getElementById('pref-edit-btn');
  select.value  = settings.globalPreference;
  editBtn.classList.toggle('hidden', settings.globalPreference !== 'custom');
}

function renderSiteToggle(currentDomain, siteOverride) {
  const row = document.getElementById('site-toggle-row');
  if (!currentDomain || siteOverride?.disabled) {
    row.classList.add('hidden');
    return;
  }

  row.classList.remove('hidden');
  document.getElementById('site-toggle-label').textContent = currentDomain;
  document.getElementById('site-toggle-btn').textContent = siteOverride?.disabled
    ? 'Re-enable on this site'
    : 'Disable on this site';
}

function renderBadges(milestonesShown) {
  const badges = MILESTONES.filter((b) => milestonesShown.includes(b.id));
  document.getElementById('badges-count').textContent = String(badges.length);

  const list = document.getElementById('badges-list');
  if (!badges.length) {
    list.innerHTML = '<div class="badge-empty">No badges yet.</div>';
    return;
  }

  list.innerHTML = badges.map((badge) =>
    `<div class="badge-chip">
      <img src="${badge.icon ?? '../icons/icon-16.png'}" alt="" class="badge-icon">
      <span>${badge.name}</span>
    </div>`
  ).join('');
}

const CHROME_WEB_STORE_REVIEW_URL = 'https://chromewebstore.google.com/detail/eat-my-cookies/bjkadflopfgeolknbhkhoechfahdjkpf/reviews';

function renderPopupCard({ icon, title, description, nudgeText, primaryHref, primaryText }) {
  const card = document.getElementById('milestone-card');
  const iconEl = card.querySelector('.milestone-icon');
  const primaryLink = document.getElementById('milestone-donate');
  const nudge = document.getElementById('milestone-nudge');

  if (iconEl) {
    iconEl.innerHTML = icon
      ? `<img src="${icon}" width="36" height="36" alt="">`
      : '🍪';
  }

  document.getElementById('milestone-name').textContent = title;
  document.getElementById('milestone-desc').textContent = description;
  nudge.textContent = nudgeText ?? '';
  nudge.classList.toggle('hidden', !nudgeText);

  if (primaryHref && primaryText) {
    primaryLink.href = primaryHref;
    primaryLink.textContent = primaryText;
    primaryLink.classList.remove('hidden');
  } else {
    primaryLink.removeAttribute('href');
    primaryLink.classList.add('hidden');
  }

  card.classList.remove('hidden');
}

function showMilestoneCard(milestone) {
  const isBeerTier = milestone.threshold >= 5000;
  const isFirstMilestone = milestone.id === 'first_action';
  const count = milestone.threshold;
  renderPopupCard({
    icon: milestone.icon,
    title: `${milestone.name} — Unlocked!`,
    description: `You've handled ${count.toLocaleString()} cookie ${count === 1 ? 'banner' : 'banners'}.`,
    nudgeText: isFirstMilestone
      ? ''
      : (isBeerTier
        ? "You've made it absurdly far. If you skipped the coffee, maybe buy me a beer so I can sober up."
        : "Eat My Cookies is free. If it's saved you a minute, consider buying me a coffee."),
    primaryHref: isFirstMilestone ? '' : 'https://ko-fi.com/eatmycookies',
    primaryText: isFirstMilestone ? '' : (isBeerTier ? '♥ Buy Me a Beer' : '♥ Buy Me a Coffee'),
  });
}

function showReviewCard(card) {
  const relatedMilestone = MILESTONES.find((milestone) => milestone.id === (card.relatedMilestoneId ?? 'dozen'));
  const count = Math.max(Number(card.count) || 0, 12);
  renderPopupCard({
    icon: relatedMilestone?.icon,
    title: 'Enjoying Eat My Cookies?',
    description: `You've handled ${count.toLocaleString()} cookie ${count === 1 ? 'banner' : 'banners'}.`,
    nudgeText: 'If it is genuinely helping, would you leave an honest review on the Chrome Web Store?',
    primaryHref: CHROME_WEB_STORE_REVIEW_URL,
    primaryText: 'Leave a review',
  });
}

function buildIssueUrl({ releaseVersion, issueVersion, currentDomain, buildMeta }) {
  const body = [
    '## Report details',
    '',
    `- Release version: \`${releaseVersion}\``,
    ...(buildMeta?.displayVersion ? [`- Unpacked build: \`${buildMeta.displayVersion}\``] : []),
    `- Current domain: ${currentDomain ?? 'unknown'}`,
    `- Browser: ${navigator.userAgent}`,
    '',
    '## What happened',
    '',
    '<!-- Describe the banner behavior, your selected preference, and any console errors you saw. -->',
  ].join('\n');

  const params = new URLSearchParams({
    title: `[Banner not handled][v${issueVersion}] ${currentDomain ?? 'unknown domain'}`,
    labels: 'cmp-coverage',
    body,
  });

  return `https://github.com/eatmycookies-dot-net/eat-my-cookies/issues/new?${params.toString()}`;
}

function renderVersionMeta(releaseVersion, currentDomain, buildMeta = null) {
  const displayVersion = buildMeta?.displayVersion ?? releaseVersion;
  const issueVersion = buildMeta?.displayVersion ?? releaseVersion;
  document.getElementById('version-label').textContent = `Version v${displayVersion}`;
  document.getElementById('report-bug-link').href = buildIssueUrl({ releaseVersion, issueVersion, currentDomain, buildMeta });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  buildPopupDOM();
});

describe('popup.html structure', () => {
  it('places the popup card between the stats block and the site warning', () => {
    const source = fs.readFileSync(path.join(ROOT, 'popup/popup.html'), 'utf8');
    const statsIndex = source.indexOf('<div class="stats-block">');
    const cardIndex = source.indexOf('<div id="milestone-card" class="milestone-card hidden">');
    const warningIndex = source.indexOf('<section id="site-warning" class="site-warning hidden">');

    expect(statsIndex).toBeGreaterThan(-1);
    expect(cardIndex).toBeGreaterThan(statsIndex);
    expect(warningIndex).toBeGreaterThan(cardIndex);
  });

  it('places the review link on its own footer row below the support links', () => {
    const source = fs.readFileSync(path.join(ROOT, 'popup/popup.html'), 'utf8');
    const footerRowIndex = source.indexOf('<div class="popup-footer-row">');
    const donateIndex = source.indexOf('<a id="donate-link"', footerRowIndex);
    const sponsorIndex = source.indexOf('data-i18n="popupSponsorFooter"', footerRowIndex);
    const reviewIndex = source.indexOf('<a id="review-link"', footerRowIndex);
    const footerRowCloseIndex = source.indexOf('</div>', footerRowIndex);

    expect(footerRowIndex).toBeGreaterThan(-1);
    expect(donateIndex).toBeGreaterThan(footerRowIndex);
    expect(sponsorIndex).toBeGreaterThan(donateIndex);
    expect(footerRowCloseIndex).toBeGreaterThan(sponsorIndex);
    expect(reviewIndex).toBeGreaterThan(footerRowCloseIndex);
  });

  it('places the version label below the restart onboarding button in settings', () => {
    const source = fs.readFileSync(path.join(ROOT, 'popup/popup.html'), 'utf8');
    const settingsMetaIndex = source.indexOf('<div class="settings-meta">');
    const linksGroupIndex = source.indexOf('<div class="settings-meta-links">', settingsMetaIndex);
    const settingsMetaCloseIndex = source.indexOf('</div>', linksGroupIndex);
    const restartIndex = source.indexOf('<button id="restart-onboarding-btn"', settingsMetaCloseIndex);
    const versionIndex = source.indexOf('<span id="version-label"', restartIndex);
    const reportBugIndex = source.indexOf('<a id="report-bug-link"', linksGroupIndex);
    const settingsReviewIndex = source.indexOf('<a id="settings-review-link"', linksGroupIndex);
    const openSourceIndex = source.indexOf('data-i18n="settingsOpenSource"', linksGroupIndex);

    expect(settingsMetaIndex).toBeGreaterThan(-1);
    expect(linksGroupIndex).toBeGreaterThan(settingsMetaIndex);
    expect(reportBugIndex).toBeGreaterThan(linksGroupIndex);
    expect(settingsReviewIndex).toBeGreaterThan(reportBugIndex);
    expect(openSourceIndex).toBeGreaterThan(settingsReviewIndex);
    expect(restartIndex).toBeGreaterThan(settingsMetaCloseIndex);
    expect(versionIndex).toBeGreaterThan(restartIndex);
  });

  it('uses the settings-specific review label for the settings review link', () => {
    const source = fs.readFileSync(path.join(ROOT, 'popup/popup.html'), 'utf8');
    expect(source).toContain('id="settings-review-link"');
    expect(source).toContain('data-i18n="settingsReviewLink"');
  });
});

// renderStats

describe('renderStats()', () => {
  it('displays total count', () => {
    renderStats({ totalActionsCount: 42, sitesHandled: 3 });
    expect(document.getElementById('total-count').textContent).toBe('42');
  });

  it('formats large numbers with locale separators', () => {
    renderStats({ totalActionsCount: 1234567, sitesHandled: 5 });
    // toLocaleString may produce "1,234,567" or "1.234.567" depending on locale
    const text = document.getElementById('total-count').textContent;
    expect(text).toMatch(/1.234.567|1,234,567/);
  });

  it('uses "site" singular when sitesHandled is 1', () => {
    renderStats({ totalActionsCount: 1, sitesHandled: 1 });
    expect(document.getElementById('sites-count').textContent).toContain('1 site');
    expect(document.getElementById('sites-count').textContent).not.toContain('1 sites');
  });

  it('uses "sites" plural when sitesHandled is not 1', () => {
    renderStats({ totalActionsCount: 5, sitesHandled: 3 });
    expect(document.getElementById('sites-count').textContent).toContain('3 sites');
  });
});

// renderPreference

describe('renderPreference()', () => {
  it('shows Edit button when preference is custom', () => {
    renderPreference({ globalPreference: 'custom' });
    expect(document.getElementById('pref-edit-btn').classList.contains('hidden')).toBe(false);
  });

  it('hides Edit button when preference is reject_all', () => {
    renderPreference({ globalPreference: 'reject_all' });
    expect(document.getElementById('pref-edit-btn').classList.contains('hidden')).toBe(true);
  });

  it('hides Edit button when preference is accept_all', () => {
    renderPreference({ globalPreference: 'accept_all' });
    expect(document.getElementById('pref-edit-btn').classList.contains('hidden')).toBe(true);
  });

  it('sets the select value to the current preference', () => {
    renderPreference({ globalPreference: 'accept_all' });
    expect(document.getElementById('pref-select').value).toBe('accept_all');
  });
});

describe('renderSiteToggle()', () => {
  it('shows the site toggle row for active sites', () => {
    renderSiteToggle('www.nbc.com', { disabled: false });
    expect(document.getElementById('site-toggle-row').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('site-toggle-label').textContent).toBe('www.nbc.com');
    expect(document.getElementById('site-toggle-btn').textContent).toBe('Disable on this site');
  });

  it('hides the site toggle row when the site is already disabled', () => {
    renderSiteToggle('www.cnbc.com', { disabled: true });
    expect(document.getElementById('site-toggle-row').classList.contains('hidden')).toBe(true);
  });

  it('keeps the site toggle row visible for always-accept exceptions', () => {
    renderSiteToggle('www.ilsole24ore.com', { alwaysAccept: true, disabled: false });
    expect(document.getElementById('site-toggle-row').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('site-toggle-btn').textContent).toBe('Disable on this site');
  });
});

// renderBadges

describe('renderBadges()', () => {
  it('shows 0 when no milestones earned', () => {
    renderBadges([]);
    expect(document.getElementById('badges-count').textContent).toBe('0');
  });

  it('renders badge chips for earned milestones', () => {
    renderBadges(['first_action', 'dozen']);
    const chips = document.querySelectorAll('.badge-chip');
    expect(chips.length).toBe(2);
    expect(document.getElementById('badges-count').textContent).toBe('2');
  });

  it('uses the badge icon path from MILESTONES', () => {
    renderBadges(['first_action']);
    const img = document.querySelector('.badge-chip img');
    const firstMilestone = MILESTONES.find((m) => m.id === 'first_action');
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toBe(firstMilestone.icon);
  });

  it('shows empty-state message when no badges earned', () => {
    renderBadges([]);
    expect(document.getElementById('badges-list').innerHTML).toContain('No badges yet');
  });
});

// showMilestoneCard

describe('showMilestoneCard()', () => {
  const firstMilestone = MILESTONES[0]; // { id: 'first_action', threshold: 1, name: 'First Bite', icon: '../icons/badges/first-bite.png' }

  it('makes the milestone card visible', () => {
    showMilestoneCard(firstMilestone);
    expect(document.getElementById('milestone-card').classList.contains('hidden')).toBe(false);
  });

  it('displays the milestone name', () => {
    showMilestoneCard(firstMilestone);
    expect(document.getElementById('milestone-name').textContent).toContain('First Bite');
  });

  it('displays the threshold count', () => {
    showMilestoneCard(firstMilestone);
    expect(document.getElementById('milestone-desc').textContent).toContain('1 cookie banner');
  });

  it('uses milestone.icon as an img src instead of hardcoded emoji', () => {
    showMilestoneCard(firstMilestone);
    const iconEl = document.querySelector('#milestone-card .milestone-icon');
    const img    = iconEl.querySelector('img');
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toBe(firstMilestone.icon);
    // The raw emoji must NOT be the text content
    expect(iconEl.textContent).not.toBe('🍪');
  });

  it('falls back to the 🍪 emoji when milestone has no icon', () => {
    showMilestoneCard({ ...firstMilestone, icon: undefined });
    const iconEl = document.querySelector('#milestone-card .milestone-icon');
    expect(iconEl.textContent).toBe('🍪');
    expect(iconEl.querySelector('img')).toBeNull();
  });

  it('uses singular "banner" when threshold is 1', () => {
    showMilestoneCard({ ...firstMilestone, threshold: 1 });
    expect(document.getElementById('milestone-desc').textContent).toContain('1 cookie banner');
    expect(document.getElementById('milestone-desc').textContent).not.toContain('banners');
  });

  it('uses plural "banners" when threshold > 1', () => {
    showMilestoneCard({ ...firstMilestone, threshold: 12 });
    expect(document.getElementById('milestone-desc').textContent).toContain('banners');
  });

  it('hides the primary CTA on the very first milestone', () => {
    showMilestoneCard(firstMilestone);
    expect(document.getElementById('milestone-donate').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('milestone-nudge').classList.contains('hidden')).toBe(true);
  });

  it('shows the donation CTA on later milestones like before', () => {
    showMilestoneCard({ ...firstMilestone, id: 'quarter_crunch', threshold: 25 });
    expect(document.getElementById('milestone-donate').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('milestone-donate').textContent).toBe('♥ Buy Me a Coffee');
    expect(document.getElementById('milestone-nudge').classList.contains('hidden')).toBe(false);
  });
});

describe('showReviewCard()', () => {
  it('renders a review CTA instead of a donation CTA', () => {
    showReviewCard({ kind: 'review', relatedMilestoneId: 'dozen', count: 12 });
    expect(document.getElementById('milestone-donate').textContent).toBe('Leave a review');
    expect(document.getElementById('milestone-donate').href).toBe(CHROME_WEB_STORE_REVIEW_URL);
  });

  it('uses the dozen badge icon for the review prompt', () => {
    const dozen = MILESTONES.find((milestone) => milestone.id === 'dozen');
    showReviewCard({ kind: 'review', relatedMilestoneId: 'dozen', count: 20 });
    const img = document.querySelector('#milestone-card .milestone-icon img');
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toBe(dozen.icon);
  });
});

describe('renderVersionMeta()', () => {
  it('shows the runtime version', () => {
    renderVersionMeta('1.0.1', 'www.theguardian.com');
    expect(document.getElementById('version-label').textContent).toBe('Version v1.0.1');
  });

  it('includes release version and domain in the bug report url', () => {
    renderVersionMeta('1.0.1', 'support.theguardian.com');
    const href = document.getElementById('report-bug-link').href;
    const parsed = new URL(href);
    expect(href).toContain('issues/new?');
    expect(parsed.searchParams.get('title')).toBe('[Banner not handled][v1.0.1] support.theguardian.com');
    expect(parsed.searchParams.get('body')).toContain('Release version: `1.0.1`');
    expect(parsed.searchParams.get('body')).toContain('Current domain: support.theguardian.com');
  });

  it('prefers the unpacked build label when present', () => {
    renderVersionMeta('1.0.1', 'www.theguardian.com', { displayVersion: '1.0.1-dev.20260429T040500Z' });
    const href = document.getElementById('report-bug-link').href;
    const parsed = new URL(href);
    expect(document.getElementById('version-label').textContent).toBe('Version v1.0.1-dev.20260429T040500Z');
    expect(parsed.searchParams.get('title')).toBe('[Banner not handled][v1.0.1-dev.20260429T040500Z] www.theguardian.com');
    expect(parsed.searchParams.get('body')).toContain('Unpacked build: `1.0.1-dev.20260429T040500Z`');
  });
});
