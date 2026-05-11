# Chrome Web Store Listing Assets

This folder holds the source-controlled assets and notes for the Chrome Web Store listing.

## Regenerate

```bash
npm run listing:assets
```

That script renders the real extension UI locally with Playwright, captures raw screenshots, and rebuilds the store-ready images in this folder.

## Field Guide

Use this as the copy/paste reference for the remaining Chrome Web Store dashboard fields.

### Promo Videos

- Localized promo video: leave blank for now
- Global promo video: leave blank for now

Chrome only accepts YouTube URLs here, and it is better to ship no video than a rushed one.

### Screenshots

If you are publishing only the default English listing, upload the screenshots under `Global screenshots` and leave `Localized screenshots` empty.

If you later add fully localized store listings, you can either:

- reuse the same screenshot set temporarily for each locale
- create locale-specific versions with translated captions

### Global Screenshots

Upload these files in this order:

1. `global-screenshot-1-popup-main.png`
2. `global-screenshot-2-custom-settings.png`
3. `global-screenshot-3-transparent-warning.png`
4. `global-screenshot-4-onboarding-preferences.png`
5. `global-screenshot-5-pin-to-toolbar.png`

### What Each Screenshot Shows

1. Main popup with stats, preference selector, recent activity, and site-level control
2. Settings view with Custom mode, language selector, category toggles, and the CCPA do-not-sell/share toggle
3. Honest warning state for sites that need a site-specific choice or cannot safely follow the current rule
4. Onboarding flow where the user picks privacy preferences up front
5. Onboarding guidance for pinning the extension so it stays one click away

### Promo Tiles

- Small promo tile: `small-promo-tile-440x280.png`
- Marquee promo tile: `marquee-promo-tile-1400x560.png`

## Raw Captures

The `raw/` folder keeps the underlying UI captures used to compose the store images. They are worth keeping because they make future listing refreshes much faster.
