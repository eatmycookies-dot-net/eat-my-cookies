import { describe, expect, it } from 'vitest';
import { detectUiLanguage, getSupportedUiLanguages, normalizeUiLanguage, resolveUiLanguage } from '../../utils/i18n.js';

describe('i18n helpers', () => {
  it('returns the supported language list', () => {
    expect(getSupportedUiLanguages()).toEqual(['en', 'fr', 'de', 'es', 'it', 'pt-br', 'pt-pt']);
  });

  it('normalizes regional tags to supported base locales', () => {
    expect(normalizeUiLanguage('fr-FR')).toBe('fr');
    expect(normalizeUiLanguage('de_DE')).toBe('de');
    expect(normalizeUiLanguage('it')).toBe('it');
    expect(normalizeUiLanguage('pt-BR')).toBe('pt-br');
    expect(normalizeUiLanguage('pt_PT')).toBe('pt-pt');
  });

  it('falls back to English for unsupported locales', () => {
    expect(normalizeUiLanguage('nl-NL')).toBe('en');
    expect(normalizeUiLanguage('')).toBe('en');
  });

  it('respects an explicit user language override', () => {
    expect(resolveUiLanguage('es', 'fr-FR')).toBe('es');
  });

  it('uses the detected UI language when preference is auto', () => {
    expect(resolveUiLanguage('auto', 'fr-FR')).toBe('fr');
    expect(resolveUiLanguage(undefined, 'de-DE')).toBe('de');
    expect(resolveUiLanguage('auto', 'pt-BR')).toBe('pt-br');
  });

  it('can detect a language value without throwing', () => {
    expect(typeof detectUiLanguage()).toBe('string');
  });
});
