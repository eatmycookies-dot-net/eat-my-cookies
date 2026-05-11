/**
 * Loop detection — extracted from background/service-worker.js for testability.
 *
 * Two independent windows:
 *   FAST  — 3 identical reports within 12 s  → almost certainly a banner-that-never-closed loop
 *   SLOW  — 5 identical reports within 45 s  → slower reload loop
 *
 * "Identical" means same site + preference + method + page URL.
 */

export const RECENT_ACTION_WINDOW_MS = 15000;
export const FAST_LOOP_WINDOW_MS     = 12000;
export const FAST_LOOP_THRESHOLD     = 3;
export const LOOP_WINDOW_MS          = 45000;
export const LOOP_THRESHOLD          = 5;

// Module-level Maps survive across message handler calls (service worker lifetime).
// _reset() is provided for tests only — do not call from production code.
const recentActionKeys      = new Map(); // key → timestamp of last action
const repeatedActionWindows = new Map(); // key → [] of timestamps

/**
 * Track a new action occurrence and return loop state.
 * @param {string} key  – opaque identifier built by the caller (site+pref+method+url)
 * @param {number} [now] – current time in ms (injectable for tests)
 * @returns {{ key, count, fastCount, fastTriggered, triggered }}
 */
export function registerRepeatedAction(key, now = Date.now()) {
  // Evict stale entries first
  for (const [k, timestamps] of repeatedActionWindows.entries()) {
    const fresh = timestamps.filter((ts) => now - ts <= LOOP_WINDOW_MS);
    if (fresh.length === 0) {
      repeatedActionWindows.delete(k);
    } else {
      repeatedActionWindows.set(k, fresh);
    }
  }

  const timestamps = repeatedActionWindows.get(key) ?? [];
  timestamps.push(now);
  repeatedActionWindows.set(key, timestamps);

  const fastCount = timestamps.filter((ts) => now - ts <= FAST_LOOP_WINDOW_MS).length;

  return {
    key,
    count: timestamps.length,
    fastCount,
    fastTriggered: fastCount >= FAST_LOOP_THRESHOLD,
    triggered:     timestamps.length >= LOOP_THRESHOLD,
  };
}

/**
 * Returns true if this action is a duplicate within the dedup window.
 * Always records the timestamp regardless of the duplicate result.
 * @param {string} key
 * @param {number} [now]
 */
export function checkDuplicateAction(key, now = Date.now()) {
  // Evict stale
  for (const [k, ts] of recentActionKeys.entries()) {
    if (now - ts > RECENT_ACTION_WINDOW_MS) recentActionKeys.delete(k);
  }

  const previous   = recentActionKeys.get(key);
  const isDuplicate = !!(previous !== undefined && now - previous < RECENT_ACTION_WINDOW_MS);
  recentActionKeys.set(key, now);
  return isDuplicate;
}

/**
 * Clear all loop-detection state for a given domain.
 * Called when a site is disabled/re-enabled.
 * @param {string} domain
 */
export function clearSiteLoopState(domain) {
  for (const key of repeatedActionWindows.keys()) {
    if (key.startsWith(`${domain}:`)) repeatedActionWindows.delete(key);
  }
  for (const key of recentActionKeys.keys()) {
    if (key.includes(`:${domain}:`)) recentActionKeys.delete(key);
  }
}

/** Test helper — resets all in-memory state between test cases. */
export function _resetLoopState() {
  recentActionKeys.clear();
  repeatedActionWindows.clear();
}
