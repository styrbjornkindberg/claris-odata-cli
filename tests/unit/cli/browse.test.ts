/**
 * Unit Tests for BrowseCommand
 *
 * Tests TTY detection and non-interactive error handling.
 *
 * Acceptance scenarios:
 * 1. isInteractiveTTY() returns true when both stdin and stdout are TTYs
 * 2. isInteractiveTTY() returns false when stdin is not a TTY
 * 3. isInteractiveTTY() returns false when stdout is not a TTY
 * 4. isInteractiveTTY() returns false when neither is a TTY
 * 5. execute() exits with code 1 and prints error when not a TTY
 *
 * @module tests/unit/cli/browse.test
 * @see CLA-1833
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowseCommand } from '../../../src/cli/browse';

describe('BrowseCommand - TTY detection (CLA-1833)', () => {
  describe('isInteractiveTTY()', () => {
    let stdinIsTTYDescriptor: PropertyDescriptor | undefined;
    let stdoutIsTTYDescriptor: PropertyDescriptor | undefined;

    beforeEach(() => {
      // Save original property descriptors
      stdinIsTTYDescriptor = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
      stdoutIsTTYDescriptor = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
    });

    afterEach(() => {
      // Restore original property descriptors
      if (stdinIsTTYDescriptor !== undefined) {
        Object.defineProperty(process.stdin, 'isTTY', stdinIsTTYDescriptor);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (process.stdin as any).isTTY;
      }

      if (stdoutIsTTYDescriptor !== undefined) {
        Object.defineProperty(process.stdout, 'isTTY', stdoutIsTTYDescriptor);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (process.stdout as any).isTTY;
      }
    });

    it('returns true when both stdin and stdout are TTYs', () => {
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
      Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });

      const cmd = new BrowseCommand({});
      expect(cmd.isInteractiveTTY()).toBe(true);
    });

    it('returns false when stdin is not a TTY', () => {
      Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
      Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });

      const cmd = new BrowseCommand({});
      expect(cmd.isInteractiveTTY()).toBe(false);
    });

    it('returns false when stdout is not a TTY', () => {
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
      Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });

      const cmd = new BrowseCommand({});
      expect(cmd.isInteractiveTTY()).toBe(false);
    });

    it('returns false when neither stdin nor stdout is a TTY', () => {
      Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
      Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });

      const cmd = new BrowseCommand({});
      expect(cmd.isInteractiveTTY()).toBe(false);
    });

    it('returns false when stdin.isTTY is undefined (piped)', () => {
      Object.defineProperty(process.stdin, 'isTTY', { value: undefined, configurable: true });
      Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });

      const cmd = new BrowseCommand({});
      expect(cmd.isInteractiveTTY()).toBe(false);
    });

    it('returns false when stdout.isTTY is undefined (piped)', () => {
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
      Object.defineProperty(process.stdout, 'isTTY', { value: undefined, configurable: true });

      const cmd = new BrowseCommand({});
      expect(cmd.isInteractiveTTY()).toBe(false);
    });
  });

  describe('execute() - non-TTY error handling', () => {
    let processExitSpy: ReturnType<typeof vi.spyOn>;
    let stderrWriteSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      processExitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: number | string | null | undefined) => {
        throw new Error(`process.exit called with ${_code}`);
      });
      stderrWriteSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
      processExitSpy.mockRestore();
      stderrWriteSpy.mockRestore();
    });

    it('exits with code 1 and prints error when not in a TTY', async () => {
      const cmd = new BrowseCommand({});

      // Mock isInteractiveTTY to return false
      vi.spyOn(cmd, 'isInteractiveTTY').mockReturnValue(false);

      await expect(cmd.execute()).rejects.toThrow('process.exit called with 1');

      expect(stderrWriteSpy).toHaveBeenCalledWith(
        expect.stringContaining('browse command requires an interactive terminal')
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('does not exit when running in a TTY', async () => {
      const cmd = new BrowseCommand({});

      // Mock isInteractiveTTY to return true
      vi.spyOn(cmd, 'isInteractiveTTY').mockReturnValue(true);

      const result = await cmd.execute();

      expect(processExitSpy).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('error message mentions TTY requirement', async () => {
      const cmd = new BrowseCommand({});
      vi.spyOn(cmd, 'isInteractiveTTY').mockReturnValue(false);

      await expect(cmd.execute()).rejects.toThrow();

      const errorOutput = stderrWriteSpy.mock.calls.map((c) => c[0]).join('');
      expect(errorOutput).toContain('TTY');
      expect(errorOutput).toContain('non-interactive');
    });
  });
});
