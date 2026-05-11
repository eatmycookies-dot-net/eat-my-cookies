const SUPPORTED_UI_LANGUAGES = ['en', 'fr', 'de', 'es', 'it', 'pt-br', 'pt-pt'];
const DEFAULT_UI_LANGUAGE = 'en';
const catalogCache = new Map();

export function getSupportedUiLanguages() {
  return [...SUPPORTED_UI_LANGUAGES];
}

export function normalizeUiLanguage(value) {
  if (!value) return DEFAULT_UI_LANGUAGE;
  const normalized = String(value).toLowerCase().replace('_', '-');
  if (normalized === 'pt-br' || normalized === 'pt-pt') return normalized;
  const [base] = normalized.split('-');
  return SUPPORTED_UI_LANGUAGES.includes(base) ? base : DEFAULT_UI_LANGUAGE;
}

function catalogLocaleFor(normalizedLocale) {
  if (normalizedLocale === 'pt-br') return 'pt_BR';
  if (normalizedLocale === 'pt-pt') return 'pt_PT';
  return normalizedLocale;
}

export function resolveUiLanguage(preferredLanguage = 'auto', detectedLanguage = detectUiLanguage()) {
  if (preferredLanguage && preferredLanguage !== 'auto') {
    return normalizeUiLanguage(preferredLanguage);
  }
  return normalizeUiLanguage(detectedLanguage);
}

export function detectUiLanguage() {
  try {
    if (typeof globalThis.chrome?.i18n?.getUILanguage === 'function') {
      return globalThis.chrome.i18n.getUILanguage();
    }
  } catch (_) {}

  try {
    return navigator.language;
  } catch (_) {
    return DEFAULT_UI_LANGUAGE;
  }
}

async function loadCatalog(locale) {
  const normalized = normalizeUiLanguage(locale);
  if (catalogCache.has(normalized)) return catalogCache.get(normalized);

  const catalogLocale = catalogLocaleFor(normalized);
  const promise = fetch(globalThis.chrome.runtime.getURL(`_locales/${catalogLocale}/messages.json`))
    .then((response) => response.ok ? response.json() : {})
    .catch(() => ({}));

  catalogCache.set(normalized, promise);
  return promise;
}

function formatMessage(message, substitutions = []) {
  const values = Array.isArray(substitutions) ? substitutions : [substitutions];
  return values.reduce((result, value, index) => (
    result.replaceAll(`$${index + 1}`, String(value))
  ), message);
}

export async function getTranslator(preferredLanguage = 'auto') {
  const locale = resolveUiLanguage(preferredLanguage);
  const [fallbackCatalog, localizedCatalog] = await Promise.all([
    loadCatalog(DEFAULT_UI_LANGUAGE),
    locale === DEFAULT_UI_LANGUAGE ? Promise.resolve({}) : loadCatalog(locale),
  ]);

  const messages = { ...fallbackCatalog, ...localizedCatalog };

  const t = (key, substitutions = []) => {
    const entry = messages[key] ?? fallbackCatalog[key];
    if (!entry?.message) return key;
    return formatMessage(entry.message, substitutions);
  };

  return {
    locale,
    t,
    formatNumber(value, options) {
      return new Intl.NumberFormat(locale, options).format(value);
    },
  };
}

export function applyI18nAttributes(root, t) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });

  root.querySelectorAll('[data-i18n-html]').forEach((el) => {
    el.innerHTML = t(el.dataset.i18nHtml);
  });

  root.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.setAttribute('title', t(el.dataset.i18nTitle));
  });

  root.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel));
  });
}
