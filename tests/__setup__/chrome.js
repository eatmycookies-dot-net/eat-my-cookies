/**
 * Global Chrome extension API mock.
 * Injected before every test module via vitest.config.js `setupFiles`.
 *
 * Strategy:
 *  - Storage areas use plain async functions (NOT vi.fn) so vi.clearAllMocks()
 *    cannot wipe their implementations between tests.
 *  - The underlying `data` object is mutated in-place in beforeEach so that
 *    module-level imports of `chrome` always point to the same object.
 *  - Chrome action/tabs/runtime methods that tests spy on use vi.fn().
 */

import { vi, beforeEach } from 'vitest';

// ── Clearable in-memory storage area ─────────────────────────────────────────

function createStorageArea() {
  const data = {};

  // Plain functions — vi.clearAllMocks() will NOT touch these.
  return {
    _data: data,
    _clear() {
      for (const k of Object.keys(data)) delete data[k];
    },
    async get(defaults = {}) {
      if (typeof defaults !== 'object' || Array.isArray(defaults)) {
        return JSON.parse(JSON.stringify(data));
      }
      const result = {};
      for (const [key, def] of Object.entries(defaults)) {
        // Deep-clone both stored values and defaults — just like the real Chrome API.
        // Without this, callers that mutate the returned object would permanently
        // corrupt the module-level DEFAULT objects across test runs.
        result[key] = key in data
          ? JSON.parse(JSON.stringify(data[key]))
          : JSON.parse(JSON.stringify(def));
      }
      return result;
    },
    async set(items) {
      Object.assign(data, items);
    },
    async clear() {
      for (const k of Object.keys(data)) delete data[k];
    },
    async remove(keys) {
      for (const k of Array.isArray(keys) ? keys : [keys]) delete data[k];
    },
    onChanged: { addListener: vi.fn() },
  };
}

// ── Single persistent chrome mock ─────────────────────────────────────────────
// Created once — the object reference never changes, so module-level `chrome`
// lookups in production code always resolve to this mock.

const syncArea  = createStorageArea();
const localArea = createStorageArea();

export const chromeMock = {
  storage: {
    sync:  syncArea,
    local: localArea,
    onChanged: { addListener: vi.fn() },
  },
  runtime: {
    sendMessage: vi.fn(async () => ({})),
    getURL: vi.fn((path) => `chrome-extension://fake-ext-id/${path}`),
    onMessage:   { addListener: vi.fn() },
    onInstalled: { addListener: vi.fn() },
    onStartup:   { addListener: vi.fn() },
  },
  action: {
    setBadgeText:            vi.fn(async () => {}),
    setBadgeBackgroundColor: vi.fn(async () => {}),
    setIcon:                 vi.fn(async () => {}),
    openPopup:               vi.fn(async () => {}),
  },
  tabs: {
    query:   vi.fn(async () => []),
    reload:  vi.fn(async () => {}),
    create:  vi.fn(async () => {}),
    onActivated: { addListener: vi.fn() },
    onUpdated:   { addListener: vi.fn() },
  },
  contextMenus: {
    create:    vi.fn(),
    update:    vi.fn(async () => {}),
    remove:    vi.fn(async () => {}),
    removeAll: vi.fn(async () => {}),
    onClicked: { addListener: vi.fn() },
  },
  browsingData: {
    remove: vi.fn(async () => {}),
  },
};

globalThis.chrome = chromeMock;

// ── Per-test reset ────────────────────────────────────────────────────────────

/**
 * Clears storage data (via in-place mutation) and resets vi.fn() call history.
 * Called automatically in beforeEach.
 */
export function resetChrome() {
  syncArea._clear();
  localArea._clear();
  // Reset call history on vi.fn() mocks only (not implementations)
  vi.clearAllMocks();
  // Re-attach default implementations that vi.clearAllMocks() resets
  chromeMock.runtime.sendMessage.mockResolvedValue({});
  chromeMock.runtime.getURL.mockImplementation((path) => `chrome-extension://fake-ext-id/${path}`);
  chromeMock.tabs.query.mockResolvedValue([]);
}

beforeEach(() => {
  resetChrome();
});
