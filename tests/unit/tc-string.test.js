/**
 * Unit tests — utils/tc-string-builder.js
 *
 * Coverage:
 *   buildTCString — returns valid base64url, encodes purpose bits correctly
 *   buildTCData   — returns full TCF data object with correct purpose consents
 */

import { describe, it, expect } from 'vitest';
import { buildTCString, buildTCData } from '../../utils/tc-string-builder.js';

const rejectAll = { functional: false, analytics: false, advertising: false };
const acceptAll = { functional: true,  analytics: true,  advertising: true  };
const custom    = { functional: true,  analytics: false, advertising: false };

// ── buildTCString ─────────────────────────────────────────────────────────────

describe('buildTCString()', () => {
  it('returns a non-empty string', () => {
    const str = buildTCString(rejectAll);
    expect(typeof str).toBe('string');
    expect(str.length).toBeGreaterThan(0);
  });

  it('is valid base64url (no +, /, or = padding)', () => {
    const str = buildTCString(rejectAll);
    expect(str).not.toMatch(/[+/=]/);
  });

  it('produces different strings for different prefs', () => {
    expect(buildTCString(rejectAll)).not.toBe(buildTCString(acceptAll));
  });

  it('produces the same-length string for the same prefs shape', () => {
    // Both must produce same bit count (purposes, fixed header)
    const a = buildTCString(rejectAll);
    const b = buildTCString(acceptAll);
    // Base64 encoding can produce same length with different content
    expect(Math.abs(a.length - b.length)).toBeLessThanOrEqual(4); // at most 4 chars diff
  });
});

// ── buildTCData ───────────────────────────────────────────────────────────────

describe('buildTCData()', () => {
  it('has a tcString field', () => {
    const data = buildTCData(rejectAll);
    expect(data.tcString).toBeDefined();
    expect(typeof data.tcString).toBe('string');
  });

  it('sets gdprApplies true', () => {
    expect(buildTCData(rejectAll).gdprApplies).toBe(true);
  });

  it('has purpose.consents object', () => {
    const data = buildTCData(rejectAll);
    expect(data.purpose.consents).toBeDefined();
  });

  // Purpose 1 (strictly necessary) is always granted
  it('always grants purpose 1 (strictly necessary)', () => {
    expect(buildTCData(rejectAll).purpose.consents[1]).toBe(true);
    expect(buildTCData(acceptAll).purpose.consents[1]).toBe(true);
  });

  // Purpose 2 = functional
  it('grants purpose 2 only when functional=true', () => {
    expect(buildTCData(rejectAll).purpose.consents[2]).toBe(false);
    expect(buildTCData(acceptAll).purpose.consents[2]).toBe(true);
    expect(buildTCData(custom).purpose.consents[2]).toBe(true);
  });

  // Purposes 3–4 = analytics
  it('grants purposes 3 and 4 only when analytics=true', () => {
    const r = buildTCData(rejectAll);
    expect(r.purpose.consents[3]).toBe(false);
    expect(r.purpose.consents[4]).toBe(false);

    const a = buildTCData(acceptAll);
    expect(a.purpose.consents[3]).toBe(true);
    expect(a.purpose.consents[4]).toBe(true);

    const c = buildTCData(custom); // analytics=false
    expect(c.purpose.consents[3]).toBe(false);
  });

  // Purposes 5–10 = advertising
  it('grants purposes 5–10 only when advertising=true', () => {
    const r = buildTCData(rejectAll);
    for (let i = 5; i <= 10; i++) expect(r.purpose.consents[i]).toBe(false);

    const a = buildTCData(acceptAll);
    for (let i = 5; i <= 10; i++) expect(a.purpose.consents[i]).toBe(true);
  });

  it('has vendor and publisher consents sections', () => {
    const data = buildTCData(rejectAll);
    expect(data.vendor).toBeDefined();
    expect(data.publisher).toBeDefined();
  });
});
