/**
 * Test Helpers
 *
 * Utility functions and setup for testing.
 * This file is loaded before all tests via vitest.config.ts setupFiles.
 *
 * @module tests/utils/test-helpers
 */

import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Redirect ALL config-file I/O to a throwaway temp dir for the whole test run.
 *
 * The server store (src/config/servers.ts) persists to a real on-disk file and
 * is resolved lazily from CLARIS_ODATA_CONFIG_DIR. Setting it here — at setup-file
 * module load, before any test executes — guarantees no test can read or clobber
 * the user's real ~/.config/claris-odata-cli/servers.json.
 */
const TEST_CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'claris-odata-cli-test-'));
process.env.CLARIS_ODATA_CONFIG_DIR = TEST_CONFIG_DIR;

/**
 * Test timeout constants
 */
export const TIMEOUTS = {
  /** Short operations (< 1s) */
  SHORT: 1000,
  /** Medium operations (1-5s) */
  MEDIUM: 5000,
  /** Long operations (5-30s) */
  LONG: 30000,
} as const;

/**
 * Creates a mock function that resolves after a delay.
 * Useful for testing async operations.
 *
 * @param delay - Delay in milliseconds
 * @param value - Value to resolve with
 * @returns Promise that resolves after delay
 */
export function delayedResolve<T>(delay: number, value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), delay));
}

/**
 * Creates a mock function that rejects after a delay.
 * Useful for testing error handling.
 *
 * @param delay - Delay in milliseconds
 * @param error - Error to reject with
 * @returns Promise that rejects after delay
 */
export function delayedReject(delay: number, error: Error): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(error), delay));
}

/**
 * Waits for a condition to be true.
 * Useful for testing async state changes.
 *
 * @param condition - Function returning boolean
 * @param timeout - Maximum wait time in ms
 * @param interval - Check interval in ms
 * @throws Error if timeout exceeded
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout: number = TIMEOUTS.MEDIUM,
  interval: number = 50
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`waitFor() timed out after ${timeout}ms`);
}

/**
 * Creates a unique test identifier.
 * Useful for generating unique test data.
 *
 * @param prefix - Optional prefix for the ID
 * @returns Unique string identifier
 */
export function uniqueId(prefix: string = 'test'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Test fixture for managing test state.
 *
 * @example
 * ```typescript
 * const fixture = new TestFixture<{ client: ODataClient }>();
 *
 * beforeEach(async () => {
 *   fixture.state = { client: createMockClient() };
 * });
 *
 * afterEach(() => {
 *   fixture.state.client.disconnect();
 * });
 * ```
 */
export class TestFixture<T> {
  private _state: T | null = null;

  get state(): T {
    if (!this._state) {
      throw new Error('TestFixture not initialized. Call in beforeEach or test.');
    }
    return this._state;
  }

  set state(value: T) {
    this._state = value;
  }

  reset(): void {
    this._state = null;
  }
}

/**
 * Logs test name for debugging.
 * Call this in beforeEach for verbose test output.
 */
export function logTestStart(testName: string): void {
  // Only log in verbose mode (CI or --reporter=verbose)
  if (process.env.CI || process.env.VITEST_REPORTER === 'verbose') {
    // eslint-disable-next-line no-console
    console.log(`[TEST START] ${testName}`);
  }
}

// Global test setup
beforeAll(async () => {
  // Global setup runs once before all tests
  // Add any global mocks or configurations here
});

afterAll(async () => {
  // Global teardown runs once after all tests
  // Remove the throwaway config dir created at module load.
  try {
    fs.rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
  } catch {
    // best-effort cleanup; ignore
  }
});

beforeEach(() => {
  // Runs before each test
  // Clear any cached data, reset mocks, etc.
});

afterEach(() => {
  // Runs after each test
  // Cleanup test-specific resources
});
