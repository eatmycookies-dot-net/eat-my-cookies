import {
  getSettings,
  updateSettings,
  clearRecentActivity,
  getSiteOverrides,
  setSiteOverride,
  removeSiteOverride,
  clearSiteOverrides,
  clearUnsupportedSite,
  setUnsupportedSite,
} from '../utils/storage.js';
import { formatBadgeCount, recordAction, recordSite, getNewMilestones } from '../utils/stats.js';
import {
  registerRepeatedAction,
  checkDuplicateAction,
  clearSiteLoopState,
  FAST_LOOP_THRESHOLD,
  LOOP_THRESHOLD,
} from '../utils/loop-detection.js';
import { getBuildMeta, getIssueVersionLabel, getReleaseVersion } from '../utils/build-info.js';
import { getTranslator } from '../utils/i18n.js';

// Badge color matches brand amber
const BADGE_COLOR = '#f5a623';
const DEFAULT_ICON_PATHS = buildIconSet('icons/icon');
const SUPPORTS_OPEN_POPUP = typeof chrome.action?.openPopup === 'function';
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await ensureContextMenus();
  await refreshContextMenusForActiveTab();

  if (reason === 'install') {
    const settings = await getSettings();
    if (!settings.installDate) {
      await updateSettings({ installDate: new Date().toISOString() });
    }
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding/onboarding.html') });
  }
});

chrome.runtime.onStartup?.addListener(async () => {
  await ensureContextMenus();
  await refreshContextMenusForActiveTab();
});

chrome.tabs.onActivated.addListener(async () => {
  await refreshContextMenusForActiveTab();
});

chrome.tabs.onUpdated.addListener(async (_tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' || changeInfo.url) {
    await refreshContextMenusForTab(tab);
  }
});

chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName === 'local' && changes.siteOverrides) {
    await refreshContextMenusForActiveTab();
  }
  if (areaName === 'sync' && changes.uiLanguage) {
    await ensureContextMenus();
    await refreshContextMenusForActiveTab();
  }
});

// Context menu click handler
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;
  if (info.menuItemId === 'emc-open-popup') {
    if (SUPPORTS_OPEN_POPUP) {
      try {
        await chrome.action.openPopup();
      } catch (_) {}
    }
  }
  if (info.menuItemId === 'emc-disable-site') {
    const domain = safeHostname(tab.url);
    if (!domain) return;
    await setSiteDisabled(domain, true);
    await refreshContextMenusForTab(tab);
    await reloadTab(tab.id);
  }
  if (info.menuItemId === 'emc-enable-site') {
    const domain = safeHostname(tab.url);
    if (!domain) return;
    await setSiteDisabled(domain, false);
    await refreshContextMenusForTab(tab);
    await reloadTab(tab.id);
  }
  if (info.menuItemId === 'emc-report') {
    const url = await buildIssueUrl(tab);
    chrome.tabs.create({ url });
  }
});

// Content scripts send this message when they handle a banner
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ACTION_FIRED') {
    handleActionFired(message, sender).then(sendResponse);
    return true; // keep channel open for async response
  }
  if (message.type === 'GET_SETTINGS') {
    getSettings().then(sendResponse);
    return true;
  }
  if (message.type === 'CLEAR_RECENT_ACTIVITY') {
    clearRecentActivity().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.type === 'GET_SITE_OVERRIDES') {
    getSiteOverrides().then((overrides) => sendResponse(overrides[message.domain] ?? {}));
    return true;
  }
  if (message.type === 'EMC_EXECUTE_FRAME_CLICK') {
    executeFrameClick(sender, message.selectors ?? []).then(sendResponse);
    return true;
  }
  if (message.type === 'EMC_EXECUTE_GUARDIAN_TOP_ACTION') {
    executeGuardianTopAction(sender, message.action).then(sendResponse);
    return true;
  }
  if (message.type === 'SET_SITE_DISABLED') {
    setSiteDisabled(message.domain, Boolean(message.disabled)).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.type === 'ADD_HIDDEN_SELECTOR') {
    addHiddenSelector(message.domain, message.selector).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.type === 'REPORT_UNSUPPORTED_SITE') {
    reportUnsupportedSite(message, sender).then(sendResponse);
    return true;
  }
  if (message.type === 'CLEAR_UNSUPPORTED_SITE') {
    clearUnsupportedSite(message.domain).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.type === 'REMOVE_SITE_OVERRIDE') {
    removeSiteOverrideAndData(message.domain).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.type === 'CLEAR_ALL_SITE_OVERRIDES') {
    clearAllSiteOverridesAndData().then(() => sendResponse({ ok: true }));
    return true;
  }
});

async function handleActionFired({ site, method, preference }, sender) {
  site = normalizeSite(site, sender);
  const tabId = sender.tab?.id;
  const overrides = await getSiteOverrides();
  if (overrides[site]?.disabled) {
    return { ok: true, disabled: true };
  }

  const pageUrl  = pageUrlFor(sender, site);
  const loopKey  = `${site}:${preference}:${method}:${pageUrl}`;
  const loopState = registerRepeatedAction(loopKey);
  if (loopState.fastTriggered || loopState.triggered) {
    await setSiteDisabled(site, true);
    await setUnsupportedSite(site, {
      site,
      reason: `Eat My Cookies turned itself off here after ${loopState.count} repeated “success” reports on the same page. This usually means the banner did not actually close and the page kept reloading.`,
      allowAcceptOverride: false,
      timestamp: new Date().toISOString(),
      autoDisabled: true,
      loopUrl: pageUrl,
      loopMethod: method,
    });
    if (tabId) {
      setIconSafe(DEFAULT_ICON_PATHS, tabId);
      await chrome.action.setBadgeText({ text: 'OFF', tabId });
      await chrome.action.setBadgeBackgroundColor({ color: '#c85c5c', tabId });
    }
    return { ok: true, autoDisabled: true, loopDetected: true };
  }

  const dedupKey = duplicateActionKey({ site, preference }, sender);
  if (checkDuplicateAction(dedupKey)) {
    return { ok: true, deduped: true };
  }

  const [{ stats, triggeredMilestones }, settings] = await Promise.all([
    recordAction({ site, method, preference }),
    getSettings(),
  ]);

  await Promise.all([
    recordSite(site),
    clearUnsupportedSite(site),
  ]);
  await updateBadge(stats.totalActionsCount, settings.showBadgeCount, tabId);

  if (tabId) {
    animateIcon(tabId, triggeredMilestones.length > 0);
  }

  const newMilestones = getNewMilestones(settings.milestonesShown, triggeredMilestones);
  if (newMilestones.length > 0) {
    const shown = [...settings.milestonesShown, ...newMilestones.map((m) => m.id)];
    await updateSettings({ milestonesShown: shown });
    // Queue for popup to display on next open
    await chrome.storage.local.set({ pendingMilestones: newMilestones });
  }

  return { ok: true };
}

async function executeFrameClick(sender, selectors) {
  const tabId = sender.tab?.id;
  const frameId = sender.frameId;
  if (!tabId || typeof frameId !== 'number' || !Array.isArray(selectors) || selectors.length === 0) {
    return { ok: false, clicked: false };
  }

  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId, frameIds: [frameId] },
      world: 'MAIN',
      args: [selectors],
      func: (sels) => {
        const isVisible = (el) => {
          if (!el) return false;
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
        };

        const dispatchSyntheticClick = (el) => {
          if (!el) return false;
          try { el.focus?.({ preventScroll: true }); } catch (_) {}
          const rect = el.getBoundingClientRect();
          const clientX = rect.left + Math.max(1, rect.width / 2);
          const clientY = rect.top + Math.max(1, rect.height / 2);
          const options = {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window,
            button: 0,
            buttons: 1,
            clientX,
            clientY,
          };
          for (const name of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
            const EventCtor = name.startsWith('pointer') && typeof PointerEvent === 'function' ? PointerEvent : MouseEvent;
            el.dispatchEvent(new EventCtor(name, options));
          }
          el.click?.();
          return true;
        };

        const findByText = (phrase) => {
          const needle = phrase.toLowerCase();
          return Array.from(document.querySelectorAll('button, [role="button"], a')).find((el) =>
            isVisible(el) && (el.textContent || '').trim().toLowerCase().includes(needle),
          ) ?? null;
        };

        for (const sel of sels) {
          const el = sel.startsWith('text:') ? findByText(sel.slice(5)) : document.querySelector(sel);
          if (!isVisible(el)) continue;
          return dispatchSyntheticClick(el);
        }

        return false;
      },
    });

    return { ok: true, clicked: Boolean(result?.result) };
  } catch (_) {
    return { ok: false, clicked: false };
  }
}

async function executeGuardianTopAction(sender, action) {
  const tabId = sender.tab?.id;
  if (!tabId || !action) {
    return { ok: false, handled: false };
  }

  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId, frameIds: [0] },
      world: 'MAIN',
      args: [action],
      func: (requestedAction) => {
        const cleanup = () => {
          try {
            document.documentElement.classList.remove('sp-message-open', 'src-focus-disabled');
            document.body?.classList?.remove('sp-message-open', 'src-focus-disabled');
            for (const el of document.querySelectorAll("[id^='sp_message_container'], [id^='sp_message_iframe'], .message-overlay")) {
              el.remove?.();
            }
            if (document.body) document.body.style.overflow = '';
            document.documentElement.style.overflow = '';
          } catch (_) {}
        };

        const scheduleCleanup = () => {
          try {
            setTimeout(cleanup, 1500);
            setTimeout(cleanup, 4000);
          } catch (_) {}
        };

        if (requestedAction !== 'guardian_support_reject') return false;
        const reject = window._sp_?.usnat?.postRejectAll;
        if (typeof reject !== 'function') return false;

        try {
          scheduleCleanup();
          reject.call(window._sp_.usnat, (err, success) => {
            if (err || success === false) return;
            window._sp_?.destroyMessages?.();
            window._sp_?.destroyMessaging?.();
            cleanup();
          });
          return true;
        } catch (_) {
          return false;
        }
      },
    });

    return { ok: true, handled: Boolean(result?.result) };
  } catch (_) {
    return { ok: false, handled: false };
  }
}

async function addHiddenSelector(domain, selector) {
  const overrides = await getSiteOverrides();
  const current = overrides[domain] ?? {};
  const hiddenSelectors = Array.from(new Set([...(current.hiddenSelectors ?? []), selector]));
  await setSiteOverride(domain, { hiddenSelectors });
}

async function setSiteDisabled(domain, disabled) {
  if (!domain) return;

  const overrides = await getSiteOverrides();
  const current = overrides[domain] ?? {};
  const next = { ...current };

  if (disabled) {
    next.disabled = true;
    delete next.alwaysAccept;
  } else {
    delete next.disabled;
  }

  if (hasMeaningfulOverride(next)) {
    await setSiteOverride(domain, next);
  } else {
    await removeSiteOverride(domain);
  }

  await clearUnsupportedSite(domain);
  clearRepeatedActionState(domain);
  await refreshContextMenusForActiveTab();
}

async function reportUnsupportedSite({ site, reason, allowAcceptOverride }, sender) {
  await setUnsupportedSite(site, {
    site,
    reason,
    allowAcceptOverride: Boolean(allowAcceptOverride),
    timestamp: new Date().toISOString(),
  });

  if (sender.tab?.id) {
    await chrome.action.setBadgeText({ text: '!', tabId: sender.tab.id });
    await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR, tabId: sender.tab.id });
  }

  return { ok: true };
}

async function updateBadge(count, showBadgeCount, tabId) {
  const text = showBadgeCount ? formatBadgeCount(count) : '';
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR, tabId: tabId ?? undefined });
}

async function removeSiteOverrideAndData(domain) {
  await Promise.all([
    removeSiteOverride(domain),
    clearUnsupportedSite(domain),
    clearSiteData(domain),
  ]);
}

async function clearAllSiteOverridesAndData() {
  const overrides = await getSiteOverrides();
  const domains = Object.keys(overrides);

  await Promise.all([
    clearSiteOverrides(),
    chrome.storage.local.set({ unsupportedSites: {} }),
    ...domains.map((domain) => clearSiteData(domain)),
  ]);
}

async function clearSiteData(domain) {
  if (!domain || !chrome.browsingData?.remove) return;

  const registrable = domain.replace(/^www\./, '');
  const origins = [
    `https://${domain}`,
    `http://${domain}`,
  ];
  if (registrable !== domain) {
    origins.push(`https://${registrable}`, `http://${registrable}`);
  }

  try {
    await chrome.browsingData.remove(
      { origins: Array.from(new Set(origins)) },
      {
        cookies: true,
        localStorage: true,
        indexedDB: true,
        serviceWorkers: true,
        cacheStorage: true,
      },
    );
  } catch (_) {}
}

function hasMeaningfulOverride(override) {
  return Boolean(
    override?.alwaysAccept ||
    override?.disabled ||
    (override?.hiddenSelectors?.length ?? 0) > 0
  );
}

async function reloadTab(tabId) {
  if (!tabId) return;
  try {
    await chrome.tabs.reload(tabId);
  } catch (_) {}
}

function clearRepeatedActionState(domain) {
  clearSiteLoopState(domain);
}

function pageUrlFor(sender, site) {
  const tabUrl = sender.tab?.url ?? sender.tab?.pendingUrl;
  if (tabUrl) return tabUrl.split('#')[0];
  if (typeof sender.frameId === 'number' && sender.frameId !== 0) return site;
  return sender.url?.split('#')[0] ?? site;
}

function duplicateActionKey({ site, preference }, sender) {
  const pageUrl = pageUrlFor(sender, site);
  const documentId = sender.documentId;
  if (documentId) return `${site}:${preference}:${documentId}`;
  const tabId = sender.tab?.id ?? 'na';
  const frameId = sender.frameId ?? 'na';
  return `${tabId}:${frameId}:${site}:${preference}:${pageUrl}`;
}

function triggerMilestoneAnimation(tabId) {
  // Extended (500ms) animation vs normal (300ms) — implemented in icon frame cycling
  animateIcon(tabId, true);
}

// Icon frame cycling — longer, more legible animation with temporary badge hide.
const FRAME_COUNT = 8;
const NORMAL_DURATIONS = [220, 240, 260, 300, 320, 320, 260];
const MILESTONE_DURATIONS = [260, 280, 320, 360, 400, 400, 320];

async function animateIcon(tabId, isMilestone = false) {
  const durations = isMilestone ? MILESTONE_DURATIONS : NORMAL_DURATIONS;
  const settings = await getSettings();
  const stats = await chrome.storage.local.get({ stats: { totalActionsCount: 0 } });
  const finalBadgeText = settings.showBadgeCount ? formatBadgeCount(stats.stats.totalActionsCount ?? 0) : '';
  let frame = 1;

  if (tabId) {
    await chrome.action.setBadgeText({ text: '', tabId });
  } else {
    await chrome.action.setBadgeText({ text: '' });
  }

  function nextFrame() {
    if (frame > FRAME_COUNT) return;
    setIconSafe(buildFrameIconSet(frame), tabId);
    if (frame < FRAME_COUNT) {
      setTimeout(nextFrame, durations[frame - 1]);
    } else {
      setTimeout(() => {
        setIconSafe(DEFAULT_ICON_PATHS, tabId);
        chrome.action.setBadgeText({ text: finalBadgeText, tabId: tabId ?? undefined });
      }, 220);
    }
    frame++;
  }

  nextFrame();
}

function normalizeSite(site, sender) {
  if (site && site !== 'unknown') return site;
  return (
    safeWebHostname(sender.tab?.url) ||
    safeWebHostname(sender.tab?.pendingUrl) ||
    inferTopLevelHostname(sender) ||
    safeWebHostname(sender.url) ||
    site ||
    'unknown'
  );
}

function safeHostname(url) {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch (_) {
    return null;
  }
}

function safeWebHostname(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) return null;
    return parsed.hostname || null;
  } catch (_) {
    return null;
  }
}

function inferTopLevelHostname(sender) {
  const candidates = [
    sender.documentLifecycle === 'prerender' ? null : sender.documentUrl,
    sender.origin,
    sender.url,
  ];

  for (const candidate of candidates) {
    const host = safeWebHostname(candidate);
    if (host && !isKnownCmpHost(host)) return host;
  }

  return null;
}

function isKnownCmpHost(hostname) {
  return /(^|\.)sourcepoint\.com$|(^|\.)sp-prod\.net$|(^|\.)privacy-mgmt\.com$/.test(hostname);
}

function buildFrameIconSet(frame) {
  return {
    16: chrome.runtime.getURL(`icons/frames/frame-${frame}.png`),
    32: chrome.runtime.getURL(`icons/frames/frame-${frame}.png`),
  };
}

function buildIconSet(basePath) {
  return {
    16: chrome.runtime.getURL(`${basePath}-16.png`),
    32: chrome.runtime.getURL(`${basePath}-32.png`),
    48: chrome.runtime.getURL(`${basePath}-48.png`),
    128: chrome.runtime.getURL(`${basePath}-128.png`),
  };
}

function setIconSafe(path, tabId) {
  chrome.action.setIcon({ path, tabId: tabId ?? undefined }).catch(() => {});
}

async function buildIssueUrl(tab) {
  const releaseVersion = getReleaseVersion();
  const buildMeta = await getBuildMeta();
  const issueVersion = getIssueVersionLabel(releaseVersion, buildMeta);
  const pageUrl = tab?.url ?? '';
  const title = `[Banner not handled][v${issueVersion}] ${pageUrl || 'unknown page'}`;
  const body = [
    '## Report details',
    '',
    `- Release version: \`${releaseVersion}\``,
    ...(buildMeta?.displayVersion ? [`- Unpacked build: \`${buildMeta.displayVersion}\``] : []),
    `- Page URL: ${pageUrl || 'unknown'}`,
    `- Browser: ${navigator.userAgent}`,
    '',
    '## What happened',
    '',
    '<!-- Describe the banner behavior, your selected preference, and any errors you saw. -->',
  ].join('\n');

  const params = new URLSearchParams({
    title,
    labels: 'cmp-coverage',
    body,
  });

  return `https://github.com/eatmycookies-dot-net/eat-my-cookies/issues/new?${params.toString()}`;
}

async function ensureContextMenus() {
  const settings = await getSettings();
  const { t } = await getTranslator(settings.uiLanguage);
  await removeAllContextMenus();
  await createContextMenu({
    id: 'emc-parent',
    title: t('contextMenuParent'),
    contexts: ['all'],
  });
  if (SUPPORTS_OPEN_POPUP) {
    await createContextMenu({
      id: 'emc-open-popup',
      parentId: 'emc-parent',
      title: t('contextMenuOpenPopup'),
      contexts: ['all'],
    });
  }
  await createContextMenu({
    id: 'emc-disable-site',
    parentId: 'emc-parent',
    title: t('contextMenuDisableSite'),
    contexts: ['all'],
  });
  await createContextMenu({
    id: 'emc-enable-site',
    parentId: 'emc-parent',
    title: t('contextMenuEnableSite'),
    contexts: ['all'],
  });
  await createContextMenu({
    id: 'emc-report',
    parentId: 'emc-parent',
    title: t('contextMenuReportProblem'),
    contexts: ['all'],
  });
}

async function refreshContextMenusForActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await refreshContextMenusForTab(tab);
}

async function refreshContextMenusForTab(tab) {
  const domain = safeHostname(tab?.url ?? tab?.pendingUrl);
  const overrides = domain ? await getSiteOverrides() : {};
  const siteOverride = domain ? overrides[domain] : null;
  const isDisabled = Boolean(siteOverride?.disabled);
  const hasSite = Boolean(domain && /^https?:/.test(tab?.url ?? tab?.pendingUrl ?? ''));

  await updateContextMenu('emc-disable-site', {
    visible: hasSite && !isDisabled,
    enabled: hasSite && !isDisabled,
  });
  await updateContextMenu('emc-enable-site', {
    visible: hasSite && isDisabled,
    enabled: hasSite && isDisabled,
  });
  if (SUPPORTS_OPEN_POPUP) {
    await updateContextMenu('emc-open-popup', {
      visible: true,
      enabled: true,
    });
  }
}

function createContextMenu(options) {
  return new Promise((resolve) => {
    chrome.contextMenus.create(options, () => {
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

function updateContextMenu(id, options) {
  return new Promise((resolve) => {
    chrome.contextMenus.update(id, options, () => {
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

function removeAllContextMenus() {
  return new Promise((resolve) => {
    chrome.contextMenus.removeAll(() => {
      void chrome.runtime.lastError;
      resolve();
    });
  });
}
