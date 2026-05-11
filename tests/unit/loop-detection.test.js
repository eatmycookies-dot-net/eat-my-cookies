/**
 * Unit tests — utils/loop-detection.js
 *
 * Coverage:
 *   registerRepeatedAction — fast loop (3 in 12 s), slow loop (5 in 45 s)
 *   checkDuplicateAction   — dedup within 15 s window
 *   clearSiteLoopState     — clears all state for a domain
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerRepeatedAction,
  checkDuplicateAction,
  clearSiteLoopState,
  _resetLoopState,
  FAST_LOOP_THRESHOLD,
  FAST_LOOP_WINDOW_MS,
  LOOP_THRESHOLD,
  LOOP_WINDOW_MS,
  RECENT_ACTION_WINDOW_MS,
} from '../../utils/loop-detection.js';

// Reset shared state before each test so tests are fully independent
beforeEach(() => _resetLoopState());

const KEY = 'www.example.com:reject_all:sourcepoint:gdpr:frame:https://www.example.com/page';

// ── registerRepeatedAction ────────────────────────────────────────────────────

describe('registerRepeatedAction()', () => {
  it('returns count=1 on first call', () => {
    const result = registerRepeatedAction(KEY);
    expect(result.count).toBe(1);
    expect(result.fastTriggered).toBe(false);
    expect(result.triggered).toBe(false);
  });

  it('detects fast loop: triggers after FAST_LOOP_THRESHOLD rapid calls', () => {
    const now = Date.now();
    // Simulate calls within the fast window (all 0 ms apart from `now`)
    for (let i = 1; i < FAST_LOOP_THRESHOLD; i++) {
      const r = registerRepeatedAction(KEY, now + i * 100);
      expect(r.fastTriggered).toBe(false);
    }
    // The Nth call triggers
    const final = registerRepeatedAction(KEY, now + FAST_LOOP_THRESHOLD * 100);
    expect(final.fastTriggered).toBe(true);
    expect(final.fastCount).toBeGreaterThanOrEqual(FAST_LOOP_THRESHOLD);
  });

  it('does not trigger fast loop when calls are spread beyond FAST_LOOP_WINDOW_MS', () => {
    const now = Date.now();
    // Two calls inside the window
    registerRepeatedAction(KEY, now);
    registerRepeatedAction(KEY, now + 1000);
    // Third call is AFTER the fast window — should not trigger fast loop
    const result = registerRepeatedAction(KEY, now + FAST_LOOP_WINDOW_MS + 5000);
    expect(result.fastTriggered).toBe(false);
  });

  it('detects slow loop: triggers after LOOP_THRESHOLD calls within LOOP_WINDOW_MS', () => {
    const now = Date.now();
    for (let i = 1; i < LOOP_THRESHOLD; i++) {
      const r = registerRepeatedAction(KEY, now + i * 1000);
      expect(r.triggered).toBe(false);
    }
    const final = registerRepeatedAction(KEY, now + LOOP_THRESHOLD * 1000);
    expect(final.triggered).toBe(true);
  });

  it('does not trigger slow loop when calls span beyond LOOP_WINDOW_MS', () => {
    const now = Date.now();
    for (let i = 0; i < LOOP_THRESHOLD; i++) {
      // Space each call by more than LOOP_WINDOW_MS / LOOP_THRESHOLD so the window slides
      registerRepeatedAction(KEY, now + i * (LOOP_WINDOW_MS + 5000));
    }
    // All older timestamps should have been evicted; count should be 1
    const r = registerRepeatedAction(KEY, now + LOOP_THRESHOLD * (LOOP_WINDOW_MS + 5000));
    expect(r.triggered).toBe(false);
  });

  it('different keys do not interfere with each other', () => {
    const now = Date.now();
    const KEY2 = 'www.other.com:reject_all:sourcepoint:gdpr:frame:https://www.other.com/';
    for (let i = 0; i < FAST_LOOP_THRESHOLD + 2; i++) {
      registerRepeatedAction(KEY, now + i * 100);
    }
    // KEY2 should start fresh
    const result = registerRepeatedAction(KEY2, now);
    expect(result.count).toBe(1);
    expect(result.fastTriggered).toBe(false);
  });

  it('returns the key in the result', () => {
    const result = registerRepeatedAction(KEY);
    expect(result.key).toBe(KEY);
  });
});

// ── checkDuplicateAction ──────────────────────────────────────────────────────

describe('checkDuplicateAction()', () => {
  it('returns false on first call (not a duplicate)', () => {
    expect(checkDuplicateAction(KEY)).toBe(false);
  });

  it('returns true on second call within RECENT_ACTION_WINDOW_MS', () => {
    const now = Date.now();
    checkDuplicateAction(KEY, now);
    expect(checkDuplicateAction(KEY, now + 1000)).toBe(true);
  });

  it('returns false after RECENT_ACTION_WINDOW_MS has passed', () => {
    const now = Date.now();
    checkDuplicateAction(KEY, now);
    // Call well after the window
    expect(checkDuplicateAction(KEY, now + RECENT_ACTION_WINDOW_MS + 1000)).toBe(false);
  });

  it('different keys are independent', () => {
    const KEY2 = 'other.com:key';
    checkDuplicateAction(KEY);
    expect(checkDuplicateAction(KEY2)).toBe(false);
  });
});

// ── clearSiteLoopState ────────────────────────────────────────────────────────

describe('clearSiteLoopState()', () => {
  it('resets repeated-action counts for the given domain', () => {
    const now = Date.now();
    // Fill up to just below the fast threshold
    for (let i = 0; i < FAST_LOOP_THRESHOLD - 1; i++) {
      registerRepeatedAction(KEY, now + i * 100);
    }
    clearSiteLoopState('www.example.com');
    // After clearing, the next call should be count=1
    const result = registerRepeatedAction(KEY, now + 1000);
    expect(result.count).toBe(1);
  });

  it('does not affect state for other domains', () => {
    const now = Date.now();
    const KEY2 = 'www.unrelated.com:reject_all:m:https://www.unrelated.com/';
    for (let i = 0; i < FAST_LOOP_THRESHOLD - 1; i++) {
      registerRepeatedAction(KEY2, now + i * 100);
    }
    clearSiteLoopState('www.example.com'); // clear a different domain
    const result = registerRepeatedAction(KEY2, now + 1000);
    expect(result.count).toBe(FAST_LOOP_THRESHOLD); // unaffected
  });
});
