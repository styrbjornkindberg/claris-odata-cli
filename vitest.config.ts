/**
 * Vitest Configuration
 *
 * Configuration for unit and integration testing.
 * Provides coverage thresholds and test setup.
 *
 * @see https://vitest.dev/config/
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Test environment
    environment: 'node',

    // Global test utilities (describe, it, expect, etc.)
    globals: true,

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',

      // Coverage thresholds per CODING_STANDARDS.md
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },

      // Include source files
      include: ['src/**/*.ts'],

      // Exclude test files from coverage
      exclude: ['node_modules/**', 'tests/**', 'dist/**', '**/*.d.ts', '**/*.types.ts'],
    },

    // Test file patterns
    include: ['tests/**/*.test.ts'],

    // Setup files to run before tests
    setupFiles: ['./tests/utils/test-helpers.ts'],

    // Timeout for async operations (30 seconds)
    testTimeout: 30000,

    // Hook timeout
    hookTimeout: 10000,
  },
});
