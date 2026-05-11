import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Use jsdom for DOM APIs (popup and content-script tests need document/window)
    environment: 'jsdom',
    // Run this file before every test module to set up the chrome mock global
    setupFiles: ['tests/__setup__/chrome.js'],
    // Test file locations
    include: [
      'tests/unit/**/*.test.js',
      'tests/background/**/*.test.js',
      'tests/content/**/*.test.js',
      'tests/popup/**/*.test.js',
    ],
    // Globals (describe, it, expect, vi) available without imports
    globals: true,
    // Coverage configuration
    coverage: {
      provider: 'v8',
      include: ['utils/**/*.js', 'background/service-worker.js'],
      exclude: ['tests/**'],
    },
  },
});
