import {
  getSettings,
  updateSettings,
  getStats,
  exportSettings,
  importSettings,
  getSiteOverrides,
  setSiteOverride,
  getUnsupportedSites,
} from '../utils/storage.js';
import { getBuildMeta, getDisplayVersion, getIssueVersionLabel, getReleaseVersion } from '../utils/build-info.js';
import { MILESTONES, formatActivityPreference } from '../utils/stats.js';
import { applyI18nAttributes, getTranslator } from '../utils/i18n.js';
import {
  POPUP_CARD_KIND_REVIEW,
  REVIEW_PROMPT_RELATED_MILESTONE_ID,
  REVIEW_PROMPT_THRESHOLD,
  buildReviewPopupCard,
  findTriggeredReviewPromptOpportunity,
  normalizeReviewPromptIds,
  selectNextPendingPopupCard,
} from '../utils/popup-cards.js';

const KO_FI_URL = 'https://ko-fi.com/eatmycookies';
const CHROME_WEB_STORE_REVIEW_URL = 'https://chromewebstore.google.com/detail/eat-my-cookies/bjkadflopfgeolknbhkhoechfahdjkpf/reviews';
const POPUP_VIEW_STATE_KEY = 'emc-popup-view';
let activeSettings = null;
let storageListenerAttached = false;
let i18n = {
  locale: 'en',
  t: (key, substitutions = []) => {
    const fallback = {
      popupAcrossSitesSingular: 'across $1 site',
      popupAcrossSitesPlural: 'across $1 sites',
      popupNoActivity: 'No activity yet',
      popupNoBadges: 'No badges yet. Your first one unlocks on the first handled banner.',
      popupMilestoneCoffeeNudge: "Eat My Cookies is free forever. If it's saved you a minute, consider buying me a coffee.",
      popupMilestoneBeerNudge: "You've made it absurdly far. If you skipped the coffee, maybe buy me a beer so I can sober up.",
      popupMilestoneBuyCoffee: '♥ Buy Me a Coffee',
      popupMilestoneBuyBeer: '♥ Buy Me a Beer',
      popupReviewTitle: 'Enjoying Eat My Cookies?',
      popupReviewNudge: 'If it is genuinely helping, would you leave an honest review on the Chrome Web Store?',
      popupReviewCta: 'Leave a review',
      settingsReviewLink: 'Leave a review ↗',
      settingsVersionLabel: 'Version $1',
      siteOverrideRemove: 'Remove',
      activityAccepted: 'Accepted',
      activityRejected: 'Rejected',
      activityCcpaHandled: 'Privacy choices',
      activityCustom: 'Custom',
      activityHandled: 'Handled',
      timeJustNow: 'just now',
      popupReenable: 'Re-enable',
      popupRemovePermission: 'Remove permission',
      popupDisableSite: 'Disable on this site',
      popupEnableSite: 'Re-enable on this site',
      siteWarningDisabledFallback: 'Eat My Cookies will stay off on this site until you turn it back on.',
      siteWarningAlwaysAcceptFallback: 'This site is set to allow cookies automatically so its wall can clear.',
      siteWarningNeedsChoiceFallback: 'This site currently does not expose a reject path that matches your settings.',
      siteWarningNoRejectTitle: '$1 only showed a notice',
      siteWarningNoRejectFallback: 'This banner only offered a single button. Cookies were accepted automatically — no reject option was available.',
      popupGotIt: 'Got it',
      siteWarningAutoDisabledTitle: 'Auto-disabled for $1',
      siteWarningDisabledTitle: 'Disabled for $1',
      siteWarningAlwaysAcceptTitle: 'Always accept enabled for $1',
      siteWarningNeedsChoiceTitle: '$1 needs a site-specific choice',
      siteOverrideDisabledLabel: 'Disabled on this site',
      siteOverrideAlwaysAcceptLabel: 'Always accept on this site',
      siteOverrideGenericLabel: 'Site-specific override',
      badgeThresholdSingular: '$1 banner handled',
      badgeThresholdPlural: '$1 banners handled',
      milestoneUnlocked: '$1 — Unlocked!',
      milestoneDescSingular: "You've handled $1 cookie banner.",
      milestoneDescPlural: "You've handled $1 cookie banners.",
      settingsCcpaDoNotSell: 'CCPA: Do not sell/share',
      settingsLanguageAuto: 'Auto',
    };
    const values = Array.isArray(substitutions) ? substitutions : [substitutions];
    return values.reduce((result, value, index) => (
      result.replaceAll(`$${index + 1}`, String(value))
    ), fallback[key] ?? key);
  },
  formatNumber: (value, options) => new Intl.NumberFormat('en', options).format(value),
};

// ── Theme ──────────────────────────────────────────────────────────────
function applyTheme(theme) {
  document.body.classList.toggle('dark', theme === 'dark');
  const moon = document.getElementById('theme-icon-moon');
  const sun  = document.getElementById('theme-icon-sun');
  moon.classList.toggle('hidden', theme === 'dark');
  sun.classList.toggle('hidden', theme !== 'dark');
  document.getElementById('theme-btn').setAttribute(
    'aria-label',
    theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
  );
  try { localStorage.setItem('emc-theme', theme); } catch (_) {}
}

function initTheme() {
  let saved;
  try { saved = localStorage.getItem('emc-theme'); } catch (_) {}
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved ?? (prefersDark ? 'dark' : 'light'));
  document.getElementById('theme-btn').addEventListener('click', () => {
    applyTheme(document.body.classList.contains('dark') ? 'light' : 'dark');
  });
}

async function init() {
  initTheme();
  const [settings, stats, pending, currentDomain, unsupportedSites, siteOverrides] = await Promise.all([
    getSettings(),
    getStats(),
    chrome.storage.local.get({ pendingMilestones: [] }),
    getCurrentDomain(),
    getUnsupportedSites(),
    getSiteOverrides(),
  ]);
  activeSettings = settings;

  i18n = await getTranslator(settings.uiLanguage);
  document.documentElement.lang = i18n.locale;
  applyI18nAttributes(document, i18n.t);
  syncLanguageOptions();

  renderStats(stats);
  renderPreference(settings);
  renderActivity(stats.recentActivity);
  renderBadges(settings.milestonesShown);
  renderSiteOverrides(siteOverrides);
  renderSiteWarning(currentDomain, findDomainRecord(unsupportedSites, currentDomain), siteOverrides[currentDomain]);
  renderSiteToggle(currentDomain, siteOverrides[currentDomain]);
  renderLanguageShortcut(settings);
  await renderVersionMeta(currentDomain);
  bindFooterLinks();

  const rawPendingCards = Array.isArray(pending.pendingMilestones) ? pending.pendingMilestones : [];
  const {
    card: nextPendingCard,
    remainingCards,
  } = selectNextPendingPopupCard(rawPendingCards);
  const reviewOpportunity = nextPendingCard
    ? null
    : findTriggeredReviewPromptOpportunity({ settings, stats });
  const cardToShow = nextPendingCard ?? (
    reviewOpportunity ? buildReviewPopupCard(stats, reviewOpportunity) : null
  );

  if (cardToShow) {
    showPopupCard(cardToShow);
    await markPopupCardSeen(cardToShow);
    if (nextPendingCard) {
      await chrome.storage.local.set({ pendingMilestones: remainingCards });
    }
  }

  bindSettingsPanel(settings, currentDomain);
  restorePopupView();

  if (!storageListenerAttached) {
    storageListenerAttached = true;
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (!['sync', 'local'].includes(areaName)) return;
      if (
        changes.stats ||
        changes.pendingMilestones ||
        changes.siteOverrides ||
        changes.unsupportedSites ||
        changes.milestonesShown ||
        changes.reviewPromptsShown ||
        changes.reviewPromptClickedAt ||
        changes.uiLanguage
      ) {
        window.location.reload();
      }
    });
  }
}

async function markPopupCardSeen(card) {
  if (card?.kind !== POPUP_CARD_KIND_REVIEW || !card.id) return;
  const shown = normalizeReviewPromptIds(activeSettings?.reviewPromptsShown ?? []);
  if (shown.includes(card.id)) return;
  const updatedShown = [...shown, card.id];
  activeSettings = {
    ...(activeSettings ?? {}),
    reviewPromptsShown: updatedShown,
  };
  await updateSettings({ reviewPromptsShown: updatedShown });
}

async function openChromeWebStoreReview() {
  const clickedAt = new Date().toISOString();
  activeSettings = { ...(activeSettings ?? {}), reviewPromptClickedAt: clickedAt };
  await updateSettings({ reviewPromptClickedAt: clickedAt });
  await chrome.tabs.create({ url: CHROME_WEB_STORE_REVIEW_URL });
  window.close();
}

async function renderVersionMeta(currentDomain) {
  const releaseVersion = getReleaseVersion();
  const buildMeta = await getBuildMeta();
  const displayVersion = getDisplayVersion(releaseVersion, buildMeta);
  const issueVersion = getIssueVersionLabel(releaseVersion, buildMeta);

  document.getElementById('version-label').textContent = i18n.t('settingsVersionLabel', [`v${displayVersion}`]);
  document.getElementById('report-bug-link').href = buildIssueUrl({
    releaseVersion,
    issueVersion,
    currentDomain,
    buildMeta,
  });
}

function renderStats(stats) {
  document.getElementById('total-count').textContent = i18n.formatNumber(stats.totalActionsCount);
  const sc = stats.sitesHandled;
  document.getElementById('sites-count').textContent = i18n.t(
    sc === 1 ? 'popupAcrossSitesSingular' : 'popupAcrossSitesPlural',
    [i18n.formatNumber(sc)],
  );
}

function renderPreference(settings) {
  const select = document.getElementById('pref-select');
  const editBtn = document.getElementById('pref-edit-btn');
  select.value = settings.globalPreference;

  const syncEditBtn = (pref) => {
    editBtn.classList.toggle('hidden', pref !== 'custom');
  };
  syncEditBtn(settings.globalPreference);

  editBtn.addEventListener('click', () => openSettings());

  select.addEventListener('change', async () => {
    const pref = select.value;
    const currentSettings = await getSettings();
    await updateSettings({ globalPreference: pref });
    syncPreferenceControls({
      ...currentSettings,
      globalPreference: pref,
      categoryPreferences: currentSettings.categoryPreferences,
    });
    syncEditBtn(pref);
    await reloadActiveTab();
  });
}

function renderActivity(activity) {
  const list = document.getElementById('activity-list');
  if (!activity.length) {
    list.innerHTML = `<li class="activity-empty">${escapeHTML(i18n.t('popupNoActivity'))}</li>`;
    return;
  }
  list.innerHTML = activity.slice(0, 4).map((a) => `
    <li class="activity-item">
      <span class="activity-check">✓</span>
      <span class="activity-site">${escapeHTML(a.site)}</span>
      <span class="activity-pref">${escapeHTML(localizeActivityPreference(a))}</span>
      <span class="activity-time">${timeAgo(a.timestamp)}</span>
    </li>
  `).join('');
}

function renderBadges(milestonesShown) {
  const badges = MILESTONES.filter((badge) => milestonesShown.includes(badge.id));
  document.getElementById('badges-count').textContent = String(badges.length);

  const list = document.getElementById('badges-list');
  if (!badges.length) {
    list.innerHTML = `<div class="badge-empty">${escapeHTML(i18n.t('popupNoBadges'))}</div>`;
    return;
  }

  list.innerHTML = badges.map((badge) => {
    const name = i18n.t(badge.nameKey);
    return `
    <div class="badge-chip" title="${escapeHTML(`${name} — ${formatBadgeThreshold(badge.threshold)}`)}">
      <img src="${badge.icon ?? '../icons/icon-16.png'}" alt="" class="badge-icon" width="22" height="22">
      <span>${escapeHTML(name)}</span>
    </div>
  `;
  }).join('');
}

function formatBadgeThreshold(threshold) {
  return i18n.t(
    threshold === 1 ? 'badgeThresholdSingular' : 'badgeThresholdPlural',
    [i18n.formatNumber(threshold)],
  );
}

function renderSiteOverrides(siteOverrides) {
  const entries = Object.entries(siteOverrides)
    .filter(([, override]) => override?.alwaysAccept || override?.disabled)
    .sort(([a], [b]) => a.localeCompare(b));

  const list = document.getElementById('site-overrides-list');
  if (!entries.length) {
    list.innerHTML = `<div class="site-overrides-empty">${escapeHTML(i18n.t('settingsNoSitePermissions'))}</div>`;
    return;
  }

  list.innerHTML = entries.map(([domain]) => `
    <div class="site-override-item">
      <div class="site-override-meta">
        <div class="site-override-domain">${escapeHTML(domain)}</div>
        <div class="site-override-label">${escapeHTML(formatSiteOverrideLabel(siteOverrides[domain]))}</div>
      </div>
      <button class="btn btn-ghost remove-override-btn" data-domain="${escapeHTML(domain)}">${escapeHTML(i18n.t('siteOverrideRemove'))}</button>
    </div>
  `).join('');
}

function renderSiteWarning(currentDomain, warning, siteOverride) {
  const card = document.getElementById('site-warning');
  if (!currentDomain || (!warning && !siteOverride?.alwaysAccept && !siteOverride?.disabled)) {
    card.classList.add('hidden');
    return;
  }

  card.classList.remove('hidden');
  document.getElementById('site-warning-title').textContent = siteOverride?.disabled
    ? (warning?.autoDisabled
      ? i18n.t('siteWarningAutoDisabledTitle', [currentDomain])
      : i18n.t('siteWarningDisabledTitle', [currentDomain]))
    : siteOverride?.alwaysAccept
      ? i18n.t('siteWarningAlwaysAcceptTitle', [currentDomain])
      : warning?.informationalOnly
        ? i18n.t('siteWarningNoRejectTitle', [currentDomain])
        : i18n.t('siteWarningNeedsChoiceTitle', [currentDomain]);
  document.getElementById('site-warning-text').textContent = siteOverride?.disabled
    ? (warning?.reason ?? i18n.t('siteWarningDisabledFallback'))
    : siteOverride?.alwaysAccept
      ? i18n.t('siteWarningAlwaysAcceptFallback')
      : warning?.informationalOnly
        ? i18n.t('siteWarningNoRejectFallback')
        : (warning?.reason ?? i18n.t('siteWarningNeedsChoiceFallback'));

  const acceptBtn = document.getElementById('site-accept-btn');
  acceptBtn.classList.toggle('hidden', Boolean(siteOverride?.alwaysAccept) || Boolean(siteOverride?.disabled) || !warning?.allowAcceptOverride);
  document.getElementById('site-warning-dismiss').textContent = siteOverride?.disabled
    ? i18n.t('popupReenable')
    : siteOverride?.alwaysAccept
      ? i18n.t('popupRemovePermission')
      : warning?.informationalOnly
        ? i18n.t('popupGotIt')
        : i18n.t('popupDismiss');
}

function findDomainRecord(records, domain) {
  if (!records || !domain) return null;
  if (records[domain]) return records[domain];
  if (domain.startsWith('www.')) return records[domain.slice(4)] ?? null;
  return records[`www.${domain}`] ?? null;
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
    ? i18n.t('popupEnableSite')
    : i18n.t('popupDisableSite');
}

function renderLanguageShortcut(settings) {
  const row = document.getElementById('language-shortcut-row');
  if (!row) return;
  row.classList.toggle('hidden', settings.uiLanguage !== 'auto');
}

function formatMilestoneDescription(count) {
  return i18n.t(
    count === 1 ? 'milestoneDescSingular' : 'milestoneDescPlural',
    [i18n.formatNumber(count)],
  );
}

function renderPopupCard({
  icon,
  title,
  description,
  nudgeText,
  primaryHref,
  primaryText,
  onPrimaryClick,
}) {
  const card = document.getElementById('milestone-card');
  const primaryLink = document.getElementById('milestone-donate');
  const nudge = document.getElementById('milestone-nudge');

  const iconEl = card.querySelector('.milestone-icon');
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
    primaryLink.onclick = onPrimaryClick ?? null;
  } else {
    primaryLink.removeAttribute('href');
    primaryLink.classList.add('hidden');
    primaryLink.onclick = null;
  }

  card.classList.remove('hidden');
  document.getElementById('milestone-dismiss').onclick = () => {
    card.classList.add('hidden');
  };
}

function showMilestoneCard(milestone) {
  const isBeerTier = milestone.threshold >= 5000;
  const isFirstMilestone = milestone.id === 'first_action';

  renderPopupCard({
    icon: milestone.icon,
    title: i18n.t('milestoneUnlocked', [i18n.t(milestone.nameKey)]),
    description: formatMilestoneDescription(milestone.threshold),
    nudgeText: isFirstMilestone
      ? ''
      : (isBeerTier ? i18n.t('popupMilestoneBeerNudge') : i18n.t('popupMilestoneCoffeeNudge')),
    primaryHref: isFirstMilestone ? '' : KO_FI_URL,
    primaryText: isFirstMilestone
      ? ''
      : (isBeerTier ? i18n.t('popupMilestoneBuyBeer') : i18n.t('popupMilestoneBuyCoffee')),
  });
}

function showReviewCard(card) {
  const relatedMilestone = MILESTONES.find((milestone) => milestone.id === card.relatedMilestoneId)
    ?? MILESTONES.find((milestone) => milestone.id === REVIEW_PROMPT_RELATED_MILESTONE_ID);
  const count = Math.max(Number(card.count) || 0, REVIEW_PROMPT_THRESHOLD);

  renderPopupCard({
    icon: relatedMilestone?.icon,
    title: i18n.t('popupReviewTitle'),
    description: formatMilestoneDescription(count),
    nudgeText: i18n.t('popupReviewNudge'),
    primaryHref: CHROME_WEB_STORE_REVIEW_URL,
    primaryText: i18n.t('popupReviewCta'),
    onPrimaryClick: async (event) => {
      event.preventDefault();
      await openChromeWebStoreReview();
    },
  });
}

function showPopupCard(card) {
  if (card?.kind === POPUP_CARD_KIND_REVIEW) {
    showReviewCard(card);
    return;
  }
  showMilestoneCard(card);
}

function bindFooterLinks() {
  for (const linkId of ['review-link', 'settings-review-link']) {
    const reviewLink = document.getElementById(linkId);
    if (!reviewLink) continue;
    reviewLink.addEventListener('click', async (event) => {
      event.preventDefault();
      await openChromeWebStoreReview();
    });
  }
}

function bindSettingsPanel(settings, currentDomain) {
  let categoryPreferences = { ...settings.categoryPreferences };
  const currentPreference = () => document.getElementById('pref-select').value || settings.globalPreference;
  const syncLiveControls = (overrides = {}) => {
    syncPreferenceControls({
      ...settings,
      globalPreference: currentPreference(),
      categoryPreferences,
      ...overrides,
    });
  };

  document.getElementById('settings-btn').addEventListener('click', openSettings);
  document.getElementById('popup-close').addEventListener('click', () => window.close());
  document.getElementById('settings-back').addEventListener('click', closeSettings);
  document.getElementById('settings-close').addEventListener('click', () => window.close());
  document.getElementById('clear-activity-btn').addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'CLEAR_RECENT_ACTIVITY' });
    renderActivity([]);
  });
  document.getElementById('site-warning-dismiss').addEventListener('click', async () => {
    if (!currentDomain) return;
    const currentOverride = (await getSiteOverrides())[currentDomain];
    if (currentOverride?.disabled) {
      await chrome.runtime.sendMessage({ type: 'SET_SITE_DISABLED', domain: currentDomain, disabled: false });
      const [updatedOverrides, unsupportedSites] = await Promise.all([
        getSiteOverrides(),
        getUnsupportedSites(),
      ]);
      renderSiteOverrides(updatedOverrides);
      renderSiteWarning(currentDomain, findDomainRecord(unsupportedSites, currentDomain), updatedOverrides[currentDomain]);
      renderSiteToggle(currentDomain, updatedOverrides[currentDomain]);
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) await chrome.tabs.reload(tab.id);
      window.close();
      return;
    }
    if (currentOverride?.alwaysAccept) {
      await chrome.runtime.sendMessage({ type: 'REMOVE_SITE_OVERRIDE', domain: currentDomain });
      const [updatedOverrides, unsupportedSites] = await Promise.all([
        getSiteOverrides(),
        getUnsupportedSites(),
      ]);
      renderSiteOverrides(updatedOverrides);
      renderSiteWarning(currentDomain, findDomainRecord(unsupportedSites, currentDomain), updatedOverrides[currentDomain]);
      renderSiteToggle(currentDomain, updatedOverrides[currentDomain]);
      return;
    }

    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.runtime.sendMessage({ type: 'CLEAR_UNSUPPORTED_SITE', domain: currentDomain, tabId: activeTab?.id });
    document.getElementById('site-warning').classList.add('hidden');
  });
  document.getElementById('site-accept-btn').addEventListener('click', async () => {
    if (!currentDomain) return;
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.runtime.sendMessage({
      type: 'ACCEPT_SITE_AND_RELOAD',
      domain: currentDomain,
      tabId: activeTab?.id,
    });
    window.close();
  });
  document.getElementById('site-toggle-btn').addEventListener('click', async () => {
    if (!currentDomain) return;
    const disabled = !(await getSiteOverrides())[currentDomain]?.disabled;
    await chrome.runtime.sendMessage({ type: 'SET_SITE_DISABLED', domain: currentDomain, disabled });
    const [updatedOverrides, unsupportedSites, [tab]] = await Promise.all([
      getSiteOverrides(),
      getUnsupportedSites(),
      chrome.tabs.query({ active: true, currentWindow: true }),
    ]);
    renderSiteOverrides(updatedOverrides);
    renderSiteWarning(currentDomain, findDomainRecord(unsupportedSites, currentDomain), updatedOverrides[currentDomain]);
    renderSiteToggle(currentDomain, updatedOverrides[currentDomain]);
    if (tab?.id) await chrome.tabs.reload(tab.id);
    window.close();
  });

  document.querySelectorAll('input[name="pref"]').forEach((radio) => {
    if (radio.value === settings.globalPreference) radio.checked = true;
    radio.addEventListener('change', async () => {
      const pref = radio.value;
      await updateSettings({ globalPreference: pref });
      document.getElementById('pref-select').value = pref;
      document.getElementById('custom-toggles').classList.toggle('hidden', pref !== 'custom');
      if (pref === 'custom') openSettings();
      syncLiveControls({ globalPreference: pref });
      await reloadActiveTab();
    });
  });

  const cp = settings.categoryPreferences;
  document.getElementById('pref-ccpa-do-not-sell').checked = cp.ccpaDoNotSell ?? true;
  document.getElementById('toggle-functional').checked = cp.functional;
  document.getElementById('toggle-analytics').checked = cp.analytics;
  document.getElementById('toggle-advertising').checked = cp.advertising;
  document.getElementById('toggle-ccpa-do-not-sell').checked = cp.ccpaDoNotSell ?? true;
  document.getElementById('toggle-uncategorized').value = cp.uncategorized;

  ['functional', 'analytics', 'advertising'].forEach((key) => {
    document.getElementById(`toggle-${key}`).addEventListener('change', async (e) => {
      const updated = { ...categoryPreferences, [key]: e.target.checked };
      categoryPreferences = updated;
      await updateSettings({ globalPreference: 'custom', categoryPreferences: updated });
      document.getElementById('pref-select').value = 'custom';
      syncLiveControls({ globalPreference: 'custom' });
      await reloadActiveTab();
    });
  });
  document.getElementById('toggle-uncategorized').addEventListener('change', async (e) => {
    const updated = { ...categoryPreferences, uncategorized: e.target.value };
    categoryPreferences = updated;
    await updateSettings({ globalPreference: 'custom', categoryPreferences: updated });
    document.getElementById('pref-select').value = 'custom';
    syncLiveControls({ globalPreference: 'custom' });
    await reloadActiveTab();
  });
  const handleCcpaToggleChange = async (checked) => {
    categoryPreferences = { ...categoryPreferences, ccpaDoNotSell: checked };
    await updateSettings({ categoryPreferences });
    syncLiveControls();
    await reloadActiveTab();
  };
  document.getElementById('toggle-ccpa-do-not-sell').addEventListener('change', async (e) => {
    await handleCcpaToggleChange(e.target.checked);
  });
  document.getElementById('pref-ccpa-do-not-sell').addEventListener('change', async (e) => {
    await handleCcpaToggleChange(e.target.checked);
  });

  document.getElementById('toggle-badge').checked = settings.showBadgeCount;
  document.getElementById('toggle-badge').addEventListener('change', async (e) => {
    await updateSettings({ showBadgeCount: e.target.checked });
  });

  bindLanguageSelectors(settings.uiLanguage ?? 'auto');

  syncLiveControls();

  document.getElementById('export-btn').addEventListener('click', async () => {
    const json = await exportSettings();
    downloadJSON(json, 'eat-my-cookies-settings.json');
  });

  document.getElementById('import-btn').addEventListener('click', () => {
    document.getElementById('import-file').click();
  });
  document.getElementById('import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    await importSettings(text);
    window.location.reload();
  });

  document.getElementById('clear-overrides-btn').addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'CLEAR_ALL_SITE_OVERRIDES' });
    renderSiteOverrides({});
    const unsupportedSites = await getUnsupportedSites();
    renderSiteWarning(currentDomain, findDomainRecord(unsupportedSites, currentDomain), null);
    renderSiteToggle(currentDomain, null);
  });
  document.getElementById('site-overrides-list').addEventListener('click', async (e) => {
    const button = e.target.closest('.remove-override-btn');
    if (!button) return;
    const domain = button.dataset.domain;
    if (!domain) return;
    await chrome.runtime.sendMessage({ type: 'REMOVE_SITE_OVERRIDE', domain });
    const updated = await getSiteOverrides();
    renderSiteOverrides(updated);
    if (domain === currentDomain) {
      const unsupportedSites = await getUnsupportedSites();
      renderSiteWarning(currentDomain, findDomainRecord(unsupportedSites, currentDomain), updated[currentDomain]);
      renderSiteToggle(currentDomain, updated[currentDomain]);
    }
  });

  document.getElementById('restart-onboarding-btn').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding/onboarding.html') });
  });
}

function syncPreferenceControls(settings) {
  document.getElementById('pref-select').value = settings.globalPreference;
  document.getElementById('custom-toggles').classList.toggle('hidden', settings.globalPreference !== 'custom');

  document.querySelectorAll('input[name="pref"]').forEach((radio) => {
    radio.checked = radio.value === settings.globalPreference;
  });

  const cp = settings.categoryPreferences;
  document.getElementById('pref-ccpa-do-not-sell').checked = cp.ccpaDoNotSell ?? true;
  document.getElementById('toggle-functional').checked = cp.functional;
  document.getElementById('toggle-analytics').checked = cp.analytics;
  document.getElementById('toggle-advertising').checked = cp.advertising;
  document.getElementById('toggle-ccpa-do-not-sell').checked = cp.ccpaDoNotSell ?? true;
  document.getElementById('toggle-uncategorized').value = cp.uncategorized;
}

function syncLanguageOptions() {
  const labels = {
    auto: i18n.t('settingsLanguageAuto'),
    en: 'EN',
    fr: 'FR',
    de: 'DE',
    es: 'ES',
    it: 'IT',
    'pt-br': 'PT-BR',
    'pt-pt': 'PT-PT',
  };
  for (const select of document.querySelectorAll('[data-language-select]')) {
    for (const option of select.options) {
      option.textContent = labels[option.value] ?? option.value.toUpperCase();
    }
  }
}

function bindLanguageSelectors(currentValue) {
  const selects = [...document.querySelectorAll('[data-language-select]')];
  for (const select of selects) {
    select.value = currentValue;
    select.addEventListener('change', async (e) => {
      const nextValue = e.target.value;
      const isSettingsSelect = e.target.id === 'language-select';
      for (const other of selects) other.value = nextValue;
      if (isSettingsSelect) {
        sessionStorage.setItem(POPUP_VIEW_STATE_KEY, 'settings');
      } else {
        sessionStorage.removeItem(POPUP_VIEW_STATE_KEY);
      }
      await updateSettings({ uiLanguage: nextValue });
      window.location.reload();
    });
  }
}

function openSettings() {
  sessionStorage.setItem(POPUP_VIEW_STATE_KEY, 'settings');
  document.getElementById('settings-view').classList.remove('hidden');
}

function closeSettings() {
  sessionStorage.removeItem(POPUP_VIEW_STATE_KEY);
  document.getElementById('settings-view').classList.add('hidden');
}

function restorePopupView() {
  if (sessionStorage.getItem(POPUP_VIEW_STATE_KEY) === 'settings') {
    document.getElementById('settings-view').classList.remove('hidden');
  }
}

function downloadJSON(json, filename) {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return i18n.t('timeJustNow');
  if (m < 60) return i18n.t('timeMinutesShort', [m]);
  const h = Math.floor(m / 60);
  if (h < 24) return i18n.t('timeHoursShort', [h]);
  return i18n.t('timeDaysShort', [Math.floor(h / 24)]);
}

function escapeHTML(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatSiteOverrideLabel(override) {
  if (override?.disabled) return i18n.t('siteOverrideDisabledLabel');
  if (override?.alwaysAccept) return i18n.t('siteOverrideAlwaysAcceptLabel');
  return i18n.t('siteOverrideGenericLabel');
}

function localizeActivityPreference(activity) {
  switch (formatActivityPreference(activity)) {
    case 'Accepted':
      return i18n.t('activityAccepted');
    case 'Rejected':
      return i18n.t('activityRejected');
    case 'CCPA handled':
      return i18n.t('activityCcpaHandled');
    case 'Custom':
      return i18n.t('activityCustom');
    default:
      return i18n.t('activityHandled');
  }
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

async function reloadActiveTab() {
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) {
    [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  }
  if (!tab?.id || !tab.url) return;

  try {
    const protocol = new URL(tab.url).protocol;
    if (!['http:', 'https:'].includes(protocol)) return;
  } catch (_) {
    return;
  }

  try {
    await chrome.tabs.reload(tab.id);
  } catch (_) {}
}

async function getCurrentDomain() {
  const params = new URLSearchParams(window.location.search);
  const explicitDomain = params.get('domain');
  if (explicitDomain) return explicitDomain;

  const explicitUrl = params.get('siteUrl');
  if (explicitUrl) {
    try {
      return new URL(explicitUrl).hostname;
    } catch (_) {}
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return null;
  try {
    return new URL(tab.url).hostname;
  } catch (_) {
    return null;
  }
}

init();
