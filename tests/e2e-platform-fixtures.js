#!/usr/bin/env node

const http = require('http');
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const DOM_HANDLER_PATH = path.join(ROOT, 'content', 'dom-handler.js');
const CMPS = JSON.parse(fs.readFileSync(path.join(ROOT, 'rules', 'cmps.json'), 'utf8')).cmps;
const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'platform-consents');

const CASES = [
  {
    name: 'Globo LGPD accept_all',
    path: '/globo-lgpd.html',
    prefs: {
      globalPreference: 'accept_all',
      functional: true,
      analytics: true,
      advertising: true,
      ccpaDoNotSell: false,
      uncategorized: 'accept',
    },
    verify: (state, result) =>
      result?.method === 'dom:globolgpd' &&
      state?.action === 'continue' &&
      state?.bannerVisible === false,
  },
  {
    name: 'SBT LGPD reject_all',
    path: '/sbt-lgpd.html',
    prefs: {
      globalPreference: 'reject_all',
      functional: false,
      analytics: false,
      advertising: false,
      ccpaDoNotSell: true,
      uncategorized: 'reject',
    },
    verify: (state, result) =>
      result?.method === 'dom:sbtlgpd' &&
      state?.action === 'ok' &&
      state?.bannerVisible === false,
  },
  {
    name: 'SBT TV LGPD custom',
    path: '/sbt-tv-lgpd.html',
    prefs: {
      globalPreference: 'custom',
      functional: true,
      analytics: false,
      advertising: false,
      ccpaDoNotSell: true,
      uncategorized: 'reject',
    },
    verify: (state, result) =>
      result?.method === 'dom:sbtlgpd' &&
      state?.action === 'ok' &&
      state?.bannerVisible === false,
  },
  {
    name: 'HubSpot cookie banner reject_all',
    path: '/hubspot-cookie-banner.html',
    prefs: {
      globalPreference: 'reject_all',
      functional: false,
      analytics: false,
      advertising: false,
      ccpaDoNotSell: true,
      uncategorized: 'reject',
    },
    verify: (state, result) =>
      result?.method === 'dom:hubspotcookiebanner' &&
      state?.action === 'decline' &&
      state?.bannerVisible === false,
  },
  {
    name: 'XP LGPD accept_all',
    path: '/xpi-lgpd.html',
    prefs: {
      globalPreference: 'accept_all',
      functional: true,
      analytics: true,
      advertising: true,
      ccpaDoNotSell: false,
      uncategorized: 'accept',
    },
    verify: (state, result) =>
      result?.method === 'dom:xplgpd' &&
      state?.action === 'accept' &&
      state?.bannerVisible === false,
  },
  {
    name: 'XP LGPD reject_all',
    path: '/xpi-lgpd.html',
    prefs: {
      globalPreference: 'reject_all',
      functional: false,
      analytics: false,
      advertising: false,
      ccpaDoNotSell: true,
      uncategorized: 'reject',
    },
    verify: (state, result) =>
      result?.method === 'dom:xplgpd' &&
      state?.action === 'reject' &&
      state?.bannerVisible === false,
  },
  {
    name: 'Privacy Tools banner accept_all',
    path: '/privacytools-banner.html',
    prefs: {
      globalPreference: 'accept_all',
      functional: true,
      analytics: true,
      advertising: true,
      ccpaDoNotSell: false,
      uncategorized: 'accept',
    },
    verify: (state, result) =>
      result?.method === 'dom:privacytoolsbanner' &&
      state?.action === 'accept' &&
      state?.bannerVisible === false,
  },
  {
    name: 'Privacy Tools banner reject_all',
    path: '/privacytools-banner.html',
    prefs: {
      globalPreference: 'reject_all',
      functional: false,
      analytics: false,
      advertising: false,
      ccpaDoNotSell: true,
      uncategorized: 'reject',
    },
    verify: (state, result) =>
      result?.method === 'dom:privacytoolsbanner' &&
      state?.action === 'close' &&
      state?.bannerVisible === false,
  },
  {
    name: 'Bradesco LGPD accept_all',
    path: '/bradesco-lgpd.html',
    prefs: {
      globalPreference: 'accept_all',
      functional: true,
      analytics: true,
      advertising: true,
      ccpaDoNotSell: false,
      uncategorized: 'accept',
    },
    verify: (state, result) =>
      result?.method === 'dom:bradescolgpd' &&
      state?.action === 'accept' &&
      state?.bannerVisible === false,
  },
  {
    name: 'Bradesco LGPD reject_all',
    path: '/bradesco-lgpd.html',
    prefs: {
      globalPreference: 'reject_all',
      functional: false,
      analytics: false,
      advertising: false,
      ccpaDoNotSell: true,
      uncategorized: 'reject',
    },
    verify: (state, result) =>
      result?.method === 'dom:bradescolgpd' &&
      state?.action === 'reject' &&
      state?.bannerVisible === false,
  },
  {
    name: 'Netshoes cookie notice accept_all',
    path: '/netshoes-cookie.html',
    prefs: {
      globalPreference: 'accept_all',
      functional: true,
      analytics: true,
      advertising: true,
      ccpaDoNotSell: false,
      uncategorized: 'accept',
    },
    verify: (state, result) =>
      result?.method === 'dom:netshoescookie' &&
      state?.action === 'close' &&
      state?.bannerVisible === false,
  },
  {
    name: 'Netshoes cookie notice reject_all',
    path: '/netshoes-cookie.html',
    prefs: {
      globalPreference: 'reject_all',
      functional: false,
      analytics: false,
      advertising: false,
      ccpaDoNotSell: true,
      uncategorized: 'reject',
    },
    verify: (state, result) =>
      result?.method === 'dom:netshoescookie' &&
      state?.action === 'close' &&
      state?.bannerVisible === false,
  },
  {
    name: 'gov.br cookie bar accept_all',
    path: '/govbr-cookiebar.html',
    prefs: {
      globalPreference: 'accept_all',
      functional: true,
      analytics: true,
      advertising: true,
      ccpaDoNotSell: false,
      uncategorized: 'accept',
    },
    verify: (state, result) =>
      result?.method === 'dom:govbrcookiebar' &&
      state?.action === 'accept' &&
      state?.bannerVisible === false,
  },
  {
    name: 'gov.br cookie bar reject_all',
    path: '/govbr-cookiebar.html',
    prefs: {
      globalPreference: 'reject_all',
      functional: false,
      analytics: false,
      advertising: false,
      ccpaDoNotSell: true,
      uncategorized: 'reject',
    },
    verify: (state, result) =>
      result?.method === 'dom:govbrcookiebar' &&
      state?.action === 'reject' &&
      state?.bannerVisible === false,
  },
  {
    name: 'SP gov LGPD accept_all',
    path: '/spgov-lgpd.html',
    prefs: {
      globalPreference: 'accept_all',
      functional: true,
      analytics: true,
      advertising: true,
      ccpaDoNotSell: false,
      uncategorized: 'accept',
    },
    verify: (state, result) =>
      result?.method === 'dom:spgovlgpd' &&
      state?.action === 'accept' &&
      state?.bannerVisible === false,
  },
  {
    name: 'SP gov LGPD reject_all',
    path: '/spgov-lgpd.html',
    prefs: {
      globalPreference: 'reject_all',
      functional: false,
      analytics: false,
      advertising: false,
      ccpaDoNotSell: true,
      uncategorized: 'reject',
    },
    verify: (state, result) =>
      result?.method === 'dom:spgovlgpd' &&
      state?.action === 'accept' &&
      state?.bannerVisible === false,
  },
  {
    name: 'Correios cookie accept_all',
    path: '/correios-cookie.html',
    prefs: {
      globalPreference: 'accept_all',
      functional: true,
      analytics: true,
      advertising: true,
      ccpaDoNotSell: false,
      uncategorized: 'accept',
    },
    verify: (state, result) =>
      result?.method === 'dom:correioscookie' &&
      state?.action === 'accept' &&
      state?.bannerVisible === false,
  },
  {
    name: 'Correios cookie reject_all',
    path: '/correios-cookie.html',
    prefs: {
      globalPreference: 'reject_all',
      functional: false,
      analytics: false,
      advertising: false,
      ccpaDoNotSell: true,
      uncategorized: 'reject',
    },
    verify: (state, result) =>
      result?.method === 'dom:correioscookie' &&
      state?.action === 'accept' &&
      state?.bannerVisible === false,
  },
  {
    name: 'Usercentrics shadow accept_all',
    path: '/usercentrics-shadow.html',
    prefs: {
      globalPreference: 'accept_all',
      functional: true,
      analytics: true,
      advertising: true,
      ccpaDoNotSell: false,
      uncategorized: 'accept',
    },
    verify: (state, result) =>
      result?.method === 'dom:usercentrics:accept_all' &&
      state?.action === 'accept' &&
      state?.functional === true &&
      state?.analytics === true &&
      state?.advertising === true &&
      state?.bannerVisible === false,
  },
  {
    name: 'Usercentrics shadow reject_all',
    path: '/usercentrics-shadow.html',
    prefs: {
      globalPreference: 'reject_all',
      functional: false,
      analytics: false,
      advertising: false,
      ccpaDoNotSell: true,
      uncategorized: 'reject',
    },
    verify: (state, result) =>
      result?.method === 'dom:usercentrics:reject_all' &&
      state?.action === 'deny' &&
      state?.functional === false &&
      state?.analytics === false &&
      state?.advertising === false &&
      state?.bannerVisible === false,
  },
  {
    name: 'Usercentrics shadow custom',
    path: '/usercentrics-shadow.html',
    prefs: {
      globalPreference: 'custom',
      functional: true,
      analytics: false,
      advertising: false,
      ccpaDoNotSell: true,
      uncategorized: 'reject',
    },
    verify: (state, result) =>
      result?.method === 'dom:usercentrics:custom' &&
      state?.action === 'save' &&
      state?.functional === true &&
      state?.analytics === false &&
      state?.advertising === false &&
      state?.bannerVisible === false,
  },
  {
    name: 'Shopify account privacy accept_all',
    path: '/shopify-account-privacy.html',
    prefs: {
      globalPreference: 'accept_all',
      functional: true,
      analytics: true,
      advertising: true,
      ccpaDoNotSell: false,
      uncategorized: 'accept',
    },
    verify: (state, result) =>
      result?.method === 'dom:shopify' &&
      state?.mode === 'accept_all' &&
      state?.preferences === true &&
      state?.analytics === true &&
      state?.marketing === true &&
      state?.bannerVisible === false &&
      state?.modalVisible === false,
  },
  {
    name: 'Shopify account privacy reject_all',
    path: '/shopify-account-privacy.html',
    prefs: {
      globalPreference: 'reject_all',
      functional: false,
      analytics: false,
      advertising: false,
      ccpaDoNotSell: true,
      uncategorized: 'reject',
    },
    verify: (state, result) =>
      result?.method === 'dom:shopify' &&
      state?.mode === 'reject_all' &&
      state?.preferences === false &&
      state?.analytics === false &&
      state?.marketing === false &&
      state?.bannerVisible === false &&
      state?.modalVisible === false,
  },
  {
    name: 'Shopify account privacy custom',
    path: '/shopify-account-privacy.html',
    prefs: {
      globalPreference: 'custom',
      functional: true,
      analytics: false,
      advertising: false,
      ccpaDoNotSell: true,
      uncategorized: 'accept',
    },
    verify: (state, result) =>
      result?.method === 'dom:shopify:custom' &&
      state?.mode === 'custom' &&
      state?.preferences === true &&
      state?.analytics === false &&
      state?.marketing === false &&
      state?.bannerVisible === false &&
      state?.modalVisible === false,
  },
  {
    name: 'Shopify account privacy direct modal custom',
    path: '/shopify-account-privacy.html?modal=1',
    prefs: {
      globalPreference: 'custom',
      functional: false,
      analytics: true,
      advertising: false,
      ccpaDoNotSell: true,
      uncategorized: 'reject',
    },
    verify: (state, result) =>
      result?.method === 'dom:shopify:custom' &&
      state?.mode === 'custom' &&
      state?.preferences === false &&
      state?.analytics === true &&
      state?.marketing === false &&
      state?.bannerVisible === false &&
      state?.modalVisible === false,
  },
  {
    name: 'Didomi preferences accept_all',
    path: '/didomi-preferences.html',
    prefs: {
      globalPreference: 'accept_all',
      functional: true,
      analytics: true,
      advertising: true,
      ccpaDoNotSell: false,
      uncategorized: 'accept',
    },
    verify: (state, result) =>
      result?.method === 'dom:didomi:accept_all' &&
      state?.action === 'accept' &&
      state?.bannerVisible === false,
  },
  {
    name: 'Didomi preferences reject_all',
    path: '/didomi-preferences.html',
    prefs: {
      globalPreference: 'reject_all',
      functional: false,
      analytics: false,
      advertising: false,
      ccpaDoNotSell: true,
      uncategorized: 'reject',
    },
    verify: (state, result) =>
      result?.method === 'dom:didomi:reject_all' &&
      state?.action === 'reject' &&
      state?.bannerVisible === false,
  },
  {
    name: 'Didomi API-open accept_all',
    path: '/didomi-api-open.html',
    prefs: {
      globalPreference: 'accept_all',
      functional: true,
      analytics: true,
      advertising: true,
      ccpaDoNotSell: false,
      uncategorized: 'accept',
    },
    verify: (state, result) =>
      result?.method === 'dom:didomi:accept_all' &&
      state?.action === 'accept' &&
      state?.bannerVisible === false &&
      state?.openedViaApi === true,
  },
  {
    name: 'Didomi API-open reject_all',
    path: '/didomi-api-open.html',
    prefs: {
      globalPreference: 'reject_all',
      functional: false,
      analytics: false,
      advertising: false,
      ccpaDoNotSell: true,
      uncategorized: 'reject',
    },
    verify: (state, result) =>
      result?.method === 'dom:didomi:reject_all' &&
      state?.action === 'reject' &&
      state?.bannerVisible === false &&
      state?.openedViaApi === true,
  },
  {
    name: 'Radio-Canada cookie alert accept_all',
    path: '/radio-canada-cookie.html',
    prefs: {
      globalPreference: 'accept_all',
      functional: true,
      analytics: true,
      advertising: true,
      ccpaDoNotSell: false,
      uncategorized: 'accept',
    },
    verify: (state, result) =>
      result?.method === 'dom:radiocanadacookie' &&
      state?.action === 'accept' &&
      state?.bannerVisible === false,
  },
  {
    name: 'Radio-Canada cookie alert reject_all',
    path: '/radio-canada-cookie.html',
    prefs: {
      globalPreference: 'reject_all',
      functional: false,
      analytics: false,
      advertising: false,
      ccpaDoNotSell: true,
      uncategorized: 'reject',
    },
    verify: (state, result) =>
      result?.method === 'dom:radiocanadacookie' &&
      state?.action === 'accept' &&
      state?.bannerVisible === false,
  },
  {
    name: 'PrivacyManager simple reject_all',
    path: '/privacymanager-simple.html',
    prefs: {
      globalPreference: 'reject_all',
      functional: false,
      analytics: false,
      advertising: false,
      ccpaDoNotSell: true,
      uncategorized: 'reject',
    },
    verify: (state, result) =>
      result?.method === 'dom:privacymanager:reject_all' &&
      state?.action === 'continue' &&
      state?.bannerVisible === false,
  },
  {
    name: 'AdOpt reject_all',
    path: '/adopt-banner.html',
    prefs: {
      globalPreference: 'reject_all',
      functional: false,
      analytics: false,
      advertising: false,
      ccpaDoNotSell: true,
      uncategorized: 'reject',
    },
    verify: (state, result) =>
      result?.method === 'dom:privacymanager:reject_all' &&
      state?.action === 'do-not-sell' &&
      state?.bannerVisible === false,
  },
  {
    name: 'AdOpt accept_all',
    path: '/adopt-banner.html',
    prefs: {
      globalPreference: 'accept_all',
      functional: true,
      analytics: true,
      advertising: true,
      ccpaDoNotSell: false,
      uncategorized: 'accept',
    },
    verify: (state, result) =>
      result?.method === 'dom:privacymanager:accept_all' &&
      state?.action === 'accept' &&
      state?.bannerVisible === false,
  },
  {
    name: 'BigCommerce Catalyst accept_all',
    path: '/bigcommerce-catalyst.html',
    prefs: {
      globalPreference: 'accept_all',
      functional: true,
      analytics: true,
      advertising: true,
      ccpaDoNotSell: false,
      uncategorized: 'accept',
    },
    verify: (state, result) =>
      result?.method === 'dom:bigcommercecatalyst:accept_all' &&
      Array.isArray(state?.requests) &&
      state.requests.length === 1 &&
      JSON.stringify(state.requests[0]) === JSON.stringify({ allow: [1, 2, 3], deny: [] }) &&
      state?.bannerVisible === false,
  },
  {
    name: 'BigCommerce Catalyst reject_all',
    path: '/bigcommerce-catalyst.html',
    prefs: {
      globalPreference: 'reject_all',
      functional: false,
      analytics: false,
      advertising: false,
      ccpaDoNotSell: true,
      uncategorized: 'reject',
    },
    verify: (state, result) =>
      result?.method === 'dom:bigcommercecatalyst:reject_all' &&
      Array.isArray(state?.requests) &&
      state.requests.length === 1 &&
      JSON.stringify(state.requests[0]) === JSON.stringify({ allow: [], deny: [1, 2, 3] }) &&
      state?.bannerVisible === false,
  },
  {
    name: 'BigCommerce Catalyst custom',
    path: '/bigcommerce-catalyst.html',
    prefs: {
      globalPreference: 'custom',
      functional: true,
      analytics: false,
      advertising: true,
      ccpaDoNotSell: false,
      uncategorized: 'reject',
    },
    verify: (state, result) =>
      result?.method === 'dom:bigcommercecatalyst:custom' &&
      Array.isArray(state?.requests) &&
      state.requests.length === 1 &&
      JSON.stringify(state.requests[0]) === JSON.stringify({ allow: [2, 3], deny: [1] }) &&
      state?.bannerVisible === false,
  },
  {
    name: 'BigCommerce Catalyst ccpa',
    path: '/bigcommerce-catalyst.html',
    prefs: {
      globalPreference: 'custom',
      functional: true,
      analytics: true,
      advertising: true,
      ccpaDoNotSell: true,
      uncategorized: 'accept',
    },
    verify: (state, result) =>
      result?.method === 'dom:bigcommercecatalyst:ccpa' &&
      Array.isArray(state?.requests) &&
      state.requests.length === 1 &&
      JSON.stringify(state.requests[0]) === JSON.stringify({ allow: [1, 2], deny: [3] }) &&
      state?.bannerVisible === false,
  },
  {
    name: 'WordPress GDPR custom',
    path: '/wordpress-gdpr.html',
    prefs: {
      globalPreference: 'custom',
      functional: true,
      analytics: false,
      advertising: false,
      ccpaDoNotSell: true,
      uncategorized: 'accept',
    },
    verify: (state, result) =>
      result?.method === 'dom:wordpressgdpr:custom' &&
      state?.saved === true &&
      state?.functional === true &&
      state?.analytics === false &&
      state?.advertising === false &&
      state?.bannerVisible === false &&
      state?.modalVisible === false,
  },
  {
    name: 'WooCommerce store notice reject_all',
    path: '/woocommerce-store-notice.html',
    prefs: {
      globalPreference: 'reject_all',
      functional: false,
      analytics: false,
      advertising: false,
      ccpaDoNotSell: true,
      uncategorized: 'reject',
    },
    verify: (state, result) =>
      result?.method === 'dom:woocommercestorenotice' &&
      state?.dismissed === true &&
      state?.bannerVisible === false,
  },
  {
    name: 'Magento cookie reject_all',
    path: '/magento-cookie.html',
    prefs: {
      globalPreference: 'reject_all',
      functional: false,
      analytics: false,
      advertising: false,
      ccpaDoNotSell: true,
      uncategorized: 'reject',
    },
    verify: (state, result) =>
      result?.method === 'dom:magentocookie:reject_all' &&
      state?.choice === 'reject' &&
      state?.bannerVisible === false,
  },
  {
    name: 'Magento cookie accept_all',
    path: '/magento-cookie.html',
    prefs: {
      globalPreference: 'accept_all',
      functional: true,
      analytics: true,
      advertising: true,
      ccpaDoNotSell: false,
      uncategorized: 'accept',
    },
    verify: (state, result) =>
      result?.method === 'dom:magentocookie:accept_all' &&
      state?.choice === 'accept' &&
      state?.bannerVisible === false,
  },
  {
    name: 'Pandectes accept_all',
    path: '/pandectes.html',
    prefs: {
      globalPreference: 'accept_all',
      functional: true,
      analytics: true,
      advertising: true,
      ccpaDoNotSell: false,
      uncategorized: 'accept',
    },
    verify: (state, result) =>
      result?.method === 'dom:pandectes:accept_all' &&
      state?.mode === 'accept_all' &&
      state?.functional === true &&
      state?.analytics === true &&
      state?.advertising === true &&
      state?.bannerVisible === false,
  },
  {
    name: 'Pandectes reject_all',
    path: '/pandectes.html',
    prefs: {
      globalPreference: 'reject_all',
      functional: false,
      analytics: false,
      advertising: false,
      ccpaDoNotSell: true,
      uncategorized: 'reject',
    },
    verify: (state, result) =>
      result?.method === 'dom:pandectes:reject_all' &&
      state?.mode === 'reject_all' &&
      state?.functional === false &&
      state?.analytics === false &&
      state?.advertising === false &&
      state?.bannerVisible === false,
  },
  {
    name: 'Pandectes custom',
    path: '/pandectes.html',
    prefs: {
      globalPreference: 'custom',
      functional: true,
      analytics: true,
      advertising: false,
      ccpaDoNotSell: false,
      uncategorized: 'accept',
    },
    verify: (state, result) =>
      result?.method === 'dom:pandectes:custom' &&
      state?.mode === 'custom' &&
      state?.functional === true &&
      state?.analytics === true &&
      state?.advertising === false &&
      state?.bannerVisible === false,
  },
  {
    name: 'Pandectes ccpa',
    path: '/pandectes.html',
    prefs: {
      globalPreference: 'custom',
      functional: true,
      analytics: true,
      advertising: true,
      ccpaDoNotSell: true,
      uncategorized: 'accept',
    },
    verify: (state, result) =>
      result?.method === 'dom:pandectes:custom' &&
      state?.mode === 'custom' &&
      state?.functional === true &&
      state?.analytics === true &&
      state?.advertising === false &&
      state?.bannerVisible === false,
  },
  {
    name: 'Consentmo accept_all',
    path: '/consentmo.html',
    prefs: {
      globalPreference: 'accept_all',
      functional: true,
      analytics: true,
      advertising: true,
      ccpaDoNotSell: false,
      uncategorized: 'accept',
    },
    verify: (state, result) =>
      result?.method === 'dom:consentmo:accept_all' &&
      state?.mode === 'accept_all' &&
      state?.functional === true &&
      state?.analytics === true &&
      state?.advertising === true &&
      state?.bannerVisible === false,
  },
  {
    name: 'Consentmo reject_all',
    path: '/consentmo.html',
    prefs: {
      globalPreference: 'reject_all',
      functional: false,
      analytics: false,
      advertising: false,
      ccpaDoNotSell: true,
      uncategorized: 'reject',
    },
    verify: (state, result) =>
      result?.method === 'dom:consentmo:reject_all' &&
      state?.mode === 'reject_all' &&
      state?.functional === false &&
      state?.analytics === false &&
      state?.advertising === false &&
      state?.bannerVisible === false,
  },
  {
    name: 'Consentmo custom',
    path: '/consentmo.html',
    prefs: {
      globalPreference: 'custom',
      functional: true,
      analytics: true,
      advertising: false,
      ccpaDoNotSell: false,
      uncategorized: 'accept',
    },
    verify: (state, result) =>
      result?.method === 'dom:consentmo:custom' &&
      state?.mode === 'custom' &&
      state?.functional === true &&
      state?.analytics === true &&
      state?.advertising === false &&
      state?.bannerVisible === false,
  },
  {
    name: 'Consentmo ccpa',
    path: '/consentmo.html',
    prefs: {
      globalPreference: 'custom',
      functional: true,
      analytics: true,
      advertising: true,
      ccpaDoNotSell: true,
      uncategorized: 'accept',
    },
    verify: (state, result) =>
      result?.method === 'dom:consentmo:custom' &&
      state?.mode === 'custom' &&
      state?.functional === true &&
      state?.analytics === true &&
      state?.advertising === false &&
      state?.bannerVisible === false,
  },
  {
    name: 'Complianz accept_all',
    path: '/complianz.html',
    prefs: {
      globalPreference: 'accept_all',
      functional: true,
      analytics: true,
      advertising: true,
      ccpaDoNotSell: false,
      uncategorized: 'accept',
    },
    verify: (state, result) =>
      result?.method === 'dom:complianz:accept_all' &&
      state?.mode === 'accept_all' &&
      state?.bannerVisible === false,
  },
  {
    name: 'Complianz reject_all',
    path: '/complianz.html',
    prefs: {
      globalPreference: 'reject_all',
      functional: false,
      analytics: false,
      advertising: false,
      ccpaDoNotSell: true,
      uncategorized: 'reject',
    },
    verify: (state, result) =>
      result?.method === 'dom:complianz:reject_all' &&
      state?.mode === 'reject_all' &&
      state?.functional === false &&
      state?.analytics === false &&
      state?.advertising === false &&
      state?.bannerVisible === false,
  },
  {
    name: 'Complianz custom',
    path: '/complianz.html',
    prefs: {
      globalPreference: 'custom',
      functional: true,
      analytics: true,
      advertising: false,
      ccpaDoNotSell: true,
      uncategorized: 'reject',
    },
    verify: (state, result) =>
      result?.method === 'dom:complianz:custom' &&
      state?.mode === 'custom' &&
      state?.functional === true &&
      state?.analytics === true &&
      state?.advertising === false &&
      state?.bannerVisible === false,
  },
];

function createFixtureServer() {
  const server = http.createServer((req, res) => {
    const urlPath = req.url === '/' ? '/wordpress-gdpr.html' : req.url.split('?')[0];
    const filePath = path.join(FIXTURES_DIR, urlPath.replace(/^\/+/, ''));
    if (!filePath.startsWith(FIXTURES_DIR) || !fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(filePath, 'utf8'));
  });

  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Could not determine fixture server address'));
        return;
      }
      resolve({
        close: () => new Promise((done) => server.close(done)),
        origin: `http://127.0.0.1:${address.port}`,
      });
    });
    server.on('error', reject);
  });
}

async function runCase(browser, origin, testCase) {
  const page = await browser.newPage();
  try {
    await page.goto(`${origin}${testCase.path}`, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.addScriptTag({ path: DOM_HANDLER_PATH });
    const result = await page.evaluate(async ({ cmps, prefs }) => tryCMPs(cmps, prefs), {
      cmps: CMPS,
      prefs: testCase.prefs,
    });
    await page.waitForTimeout(500);
    const state = await page.evaluate(() => window.__fixtureState ?? null);
    if (!testCase.verify(state, result)) {
      throw new Error(`result=${JSON.stringify(result)} state=${JSON.stringify(state)}`);
    }
    console.log(`PASS  ${testCase.name}`);
  } finally {
    await page.close();
  }
}

(async () => {
  const server = await createFixtureServer();
  const browser = await chromium.launch({ headless: true });
  let failed = false;

  try {
    for (const testCase of CASES) {
      try {
        await runCase(browser, server.origin, testCase);
      } catch (error) {
        failed = true;
        console.log(`FAIL  ${testCase.name}  ${error.message}`);
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }

  if (failed) process.exit(1);
})();
