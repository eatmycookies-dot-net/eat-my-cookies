import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSupportedUiLanguages } from '../../utils/i18n.js';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');

function readSource(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

describe('locale-aware validation coverage', () => {
  const sites = JSON.parse(readSource('tests/sites.json')).sites;
  const euSites = sites.filter((site) => site.region === 'EU');
  const localeDirs = new Set(fs.readdirSync(path.join(ROOT, '_locales')));

  it('includes at least one EU site for each target locale family', () => {
    const localePrefixes = new Set(
      euSites
        .map((site) => site.locale)
        .filter(Boolean)
        .map((locale) => locale.split('-')[0]),
    );

    expect(localePrefixes.has('en')).toBe(true);
    expect(localePrefixes.has('fr')).toBe(true);
    expect(localePrefixes.has('de')).toBe(true);
    expect(localePrefixes.has('es')).toBe(true);
    expect(localePrefixes.has('it')).toBe(true);
    expect(localePrefixes.has('pt')).toBe(true);
  });

  it('adds at least ten locale-scoped EU entries', () => {
    const localeScopedEntries = euSites.filter((site) => site.locale && site.acceptLanguage);
    expect(localeScopedEntries.length).toBeGreaterThanOrEqual(10);
  });

  it('ships Chrome-supported Portuguese locale directories for both major variants', () => {
    expect(localeDirs.has('pt')).toBe(true);
    expect(localeDirs.has('pt_BR')).toBe(true);
    expect(localeDirs.has('pt_PT')).toBe(true);
    expect(fs.existsSync(path.join(ROOT, '_locales', 'pt', 'messages.json'))).toBe(true);
  });
});

describe('heuristic locale patterns', () => {
  const source = readSource('content/heuristic.js');

  it('includes Italian accept and reject phrases', () => {
    expect(source).toContain('/accetta tutto/i');
    expect(source).toContain('/accetta e chiudi/i');
    expect(source).toContain('/rifiuta tutto/i');
    expect(source).toContain('/solo necessarie/i');
  });

  it('includes French, German, Spanish, and Portuguese reject continuations', () => {
    expect(source).toContain('/continuer sans accepter/i');
    expect(source).toContain('/ohne zustimmung fortfahren/i');
    expect(source).toContain('/continuar sin aceptar/i');
    expect(source).toContain('/continuar sem aceitar/i');
  });

  it('includes Portuguese accept and reject phrases', () => {
    expect(source).toContain('/aceitar tudo/i');
    expect(source).toContain('/aceitar e fechar/i');
    expect(source).toContain('/rejeitar tudo/i');
    expect(source).toContain('/apenas necessárias/i');
  });
});

describe('Didomi locale fallbacks', () => {
  const source = readSource('content/main.js');

  it('keeps locale-independent Didomi ids and multilingual text fallbacks', () => {
    expect(source).toContain('#didomi-notice-agree-button');
    expect(source).toContain('.didomi-continue-without-agreeing');
    expect(source).toContain('#btn-toggle-save');
    expect(source).toContain('text:accepter et fermer');
    expect(source).toContain('text:alle akzeptieren');
    expect(source).toContain('text:aceptar y cerrar');
    expect(source).toContain('text:accetta e chiudi');
    expect(source).toContain('text:aceitar e fechar');
    expect(source).toContain('text:tout refuser');
    expect(source).toContain('text:alle ablehnen');
    expect(source).toContain('text:rechazar todo');
    expect(source).toContain('text:rifiuta tutto');
    expect(source).toContain('text:rejeitar tudo');
  });
});

describe('supported UI locales vs content fallbacks', () => {
  const heuristicSource = readSource('content/heuristic.js');
  const mainSource = readSource('content/main.js');

  it('keeps language-specific content fallbacks for all shipped Romance/Germanic UI locales', () => {
    const locales = getSupportedUiLanguages().filter((locale) => locale !== 'en');
    const expectations = {
      fr: ['/tout refuser/i', 'text:accepter et fermer'],
      de: ['/alle ablehnen/i', 'text:alle akzeptieren'],
      es: ['/rechazar todo/i', 'text:aceptar y cerrar'],
      it: ['/rifiuta tutto/i', 'text:accetta e chiudi'],
      'pt-br': ['/rejeitar tudo/i', 'text:aceitar e fechar'],
      'pt-pt': ['/rejeitar tudo/i', 'text:aceitar e fechar'],
    };

    for (const locale of locales) {
      const [heuristicNeedle, mainNeedle] = expectations[locale];
      expect(heuristicSource).toContain(heuristicNeedle);
      expect(mainSource).toContain(mainNeedle);
    }
  });
});

describe('review prompt locale coverage', () => {
  const localeRoot = path.join(ROOT, '_locales');
  const localeDirs = fs.readdirSync(localeRoot).filter((entry) => (
    fs.statSync(path.join(localeRoot, entry)).isDirectory()
  ));
  const requiredKeys = [
    'popupReviewTitle',
    'popupReviewNudge',
    'popupReviewCta',
    'settingsReviewLink',
    'settingsVersionLabel',
  ];

  it('ships review prompt strings for every bundled locale catalog', () => {
    for (const localeDir of localeDirs) {
      const messages = JSON.parse(fs.readFileSync(path.join(localeRoot, localeDir, 'messages.json'), 'utf8'));
      for (const key of requiredKeys) {
        expect(messages[key]?.message, `${localeDir} is missing ${key}`).toBeTruthy();
      }
    }
  });
});

describe('restart onboarding locale coverage', () => {
  const localeRoot = path.join(ROOT, '_locales');
  const localeDirs = fs.readdirSync(localeRoot).filter((entry) => (
    fs.statSync(path.join(localeRoot, entry)).isDirectory()
  ));

  it('ships a localized restart-onboarding label for every bundled locale catalog', () => {
    for (const localeDir of localeDirs) {
      const messages = JSON.parse(fs.readFileSync(path.join(localeRoot, localeDir, 'messages.json'), 'utf8'));
      expect(messages.settingsRestartOnboarding?.message, `${localeDir} is missing settingsRestartOnboarding`).toBeTruthy();
    }
  });

  it('does not leave the raw English onboarding term in non-English restart labels', () => {
    for (const localeDir of localeDirs.filter((entry) => entry !== 'en')) {
      const messages = JSON.parse(fs.readFileSync(path.join(localeRoot, localeDir, 'messages.json'), 'utf8'));
      expect(messages.settingsRestartOnboarding.message.toLowerCase()).not.toContain('onboarding');
    }
  });
});

describe('validator locale support', () => {
  const source = readSource('tests/validate.js');

  it('applies Accept-Language headers and navigator locale overrides per site', () => {
    expect(source).toContain('Network.setExtraHTTPHeaders');
    expect(source).toContain("'Accept-Language'");
    expect(source).toContain("Object.defineProperty(navigator, 'language'");
    expect(source).toContain("Object.defineProperty(navigator, 'languages'");
    expect(source).toContain('applySiteLocale(page, site)');
  });
});
