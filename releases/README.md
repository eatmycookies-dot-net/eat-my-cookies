# Releases

Generated Chrome Web Store packages should live in this folder.

Project message for release context:

Cookie banners are annoying. Eat My Cookies is a free Chrome extension that handles them based on user preferences, so people don't have to fix them site by site. No backend, no tracking, no ads.

## v1.0.0

### CMP Coverage

- Sourcepoint (GDPR + USNat/CCPA), OneTrust, ConsentManager, Didomi, Iubenda, TrustArc, AppConsent, and custom site-specific flows.
- Site-specific handling for consent-or-pay publishers (`lemonde.fr`, `repubblica.it`, `ft.com`, `lefigaro.fr`).

### DW.com

- US visitors redirected to DW's `/data-privacy-settings/privacy-settings-en` inline consent page are handled automatically — preference is applied and the user is returned to their content via `history.back()`.
- Regular DW article pages are not incorrectly triggered (the always-present empty `#cmpwrapper` div is no longer used as a detection signal).

### FT.com

- Custom preference mode reads `categoryPreferences` correctly when deciding whether to accept or reject in FT's privacy manager.

### Popup

- Settings panel scroll works on the first attempt (switched from `position: absolute` to `position: fixed` so scroll height is always computed against the viewport).
- "Custom" preference no longer auto-opens the settings panel on every popup open — an inline "Edit →" button appears next to the dropdown instead.
- Category label updated to "Uncategorized/Custom Purposes".
- Site exceptions: disable the extension per domain, or always accept on specific sites.
- Collectible badges and recent activity log.

### Other

- Cookie-eating toolbar animation with badge counter.
- Export / import settings.
- Added `.tmp-*` and `*.tmp` to `.gitignore`.

---

## Packaging

- Upload artifact: `eat-my-cookies-v1.0.0.zip`
- Run `npm run build` to generate a fresh `dist/`.
- Run `npm run build:zip` to generate a clean Chrome Web Store package in this folder.
- `npm run verify` should pass before submission.
- The submission zip should not contain hidden junk such as `.DS_Store`.

## Chrome Web Store Notes

- Category: `Privacy & Security`
- Official URL: `https://eatmycookies.net`
- Homepage URL: `https://eatmycookies.net`
- Support URL: `https://eatmycookies.net/en/install/`

### Reviewer Test Instructions

No login or test account is required.

1. Install the extension.
2. Open the popup and choose `Reject All`, `Accept All`, or `Custom`.
3. Visit a supported site with a cookie banner.
4. Confirm the extension attempts to apply the selected preference automatically.
5. Reopen the popup to review recent activity, settings, and site controls.

Suggested review sites:

- `https://www.bbc.com/`
- `https://www.latimes.com/`
- `https://www.theguardian.com/`

Reviewer notes:

- The extension runs locally in the browser.
- It does not use remote code.
- Some sites expose custom, paywall-like, or limited consent flows; in those cases the extension may show a warning or site-specific behavior instead of claiming success.

### Permissions Summary

- `host_permissions` / `<all_urls>`: needed to detect and handle consent banners on the sites the user visits.
- `scripting`: used to interact with consent UI and page-level consent APIs where required.
- `tabs`: used to refresh or update the current tab after a user-triggered settings or site action.
- `contextMenus`: used for right-click controls such as opening the popup or disabling the extension on a site.
- `storage`: used for preferences, site exceptions, and local stats.
- `browsingData`: used only for user-triggered cleanup of site-specific cookies and storage when clearing or removing a site override.

- Update this file with a short human summary whenever a release zip is created.
