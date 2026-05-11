// Right-click context menu support.
// This script now only restores older site-specific hidden selectors so previous
// user customizations do not break when the menu gets simplified.

// Re-hide any stored selectors for this domain on load
(async function restoreHiddenElements() {
  const domain = location.hostname;
  const response = await chrome.runtime.sendMessage({ type: 'GET_SITE_OVERRIDES', domain });
  if (response?.disabled) return;
  const selectors = response?.hiddenSelectors ?? [];
  for (const selector of selectors) {
    hideBySelector(selector);
  }
})();

function hideBySelector(selector) {
  try {
    document.querySelectorAll(selector).forEach((el) => {
      el.style.setProperty('display', 'none', 'important');
    });
  } catch (_) {}
}
