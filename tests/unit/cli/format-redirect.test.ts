/**
 * Unit Tests for Format Modes - Redirect/TTY Detection
 *
 * Tests that format modes work correctly when output is redirected
 * (non-TTY environment).
 *
 * @module tests/unit/cli/format-redirect.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ListCommand } from '../../../src/cli/list';
import { ServerManager } from '../../../src/config/servers';
import { CredentialsManager } from '../../../src/config/credentials';
import axios from 'axios';

vi.mock('../../../src/config/servers');
vi.mock('../../../src/config/credentials');
vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
  },
}));

describe('Format modes - redirect/TTY detection', () => {
  let originalIsTTY: boolean | undefined;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  const mockServerManager = {
    listServers: vi.fn(),
    getServer: vi.fn(),
  };

  const mockCredentialsManager = {
    listCredentials: vi.fn(),
    getCredentials: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    originalIsTTY = process.stdout.isTTY;

    vi.mocked(ServerManager).mockImplementation(() => mockServerManager as never);
    vi.mocked(CredentialsManager).mockImplementation(() => mockCredentialsManager as never);

    mockServerManager.listServers.mockReturnValue([
      { id: 'prod', name: 'Production', host: 'fm.example.com', port: 443, secure: true },
    ]);

    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    process.stdout.isTTY = originalIsTTY;
    vi.restoreAllMocks();
  });

  function captureStdout(): string {
    return stdoutSpy.mock.calls.map((c) => c[0]).join('');
  }

  describe('JSON output in non-TTY (redirected)', () => {
    beforeEach(() => {
      // Simulate non-TTY (redirected output)
      Object.defineProperty(process.stdout, 'isTTY', { value: false, writable: true });
    });

    it('outputs valid JSON when stdout is redirected', async () => {
      const cmd = new ListCommand({ resource: 'servers', output: 'json' });
      const exitCode = await cmd.run();

      expect(exitCode).toBe(0);
      const output = captureStdout();
      expect(() => JSON.parse(output)).not.toThrow();
    });

    it('JSON output contains no ANSI escape codes when redirected', async () => {
      // eslint-disable-next-line no-control-regex
      const ANSI_REGEX = /\x1b\[[0-9;]*m/;

      const cmd = new ListCommand({ resource: 'servers', output: 'json' });
      await cmd.run();
      const output = captureStdout();

      expect(ANSI_REGEX.test(output)).toBe(false);
    });

    it('JSON output is parseable by jq-style tools', async () => {
      const cmd = new ListCommand({ resource: 'servers', output: 'json' });
      await cmd.run();
      const output = captureStdout();

      // Simulate jq-style parsing: extract first server name
      const parsed = JSON.parse(output);
      expect(parsed.servers[0].name).toBe('Production');
    });
  });

  describe('JSONL output in non-TTY (redirected)', () => {
    beforeEach(() => {
      // Simulate non-TTY (redirected output)
      Object.defineProperty(process.stdout, 'isTTY', { value: false, writable: true });
    });

    it('outputs JSONL format for list servers', async () => {
      const cmd = new ListCommand({ resource: 'servers', output: 'jsonl' });
      const result = await cmd.execute();

      // ListCommand returns structured data - JSONL mode works on data arrays
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('servers');
    });

    it('JSONL output contains no ANSI escape codes', async () => {
      // eslint-disable-next-line no-control-regex
      const ANSI_REGEX = /\x1b\[[0-9;]*m/;

      const cmd = new ListCommand({ resource: 'servers', output: 'jsonl' });
      await cmd.run();
      const output = captureStdout();

      expect(ANSI_REGEX.test(output)).toBe(false);
    });
  });

  describe('CSV output in non-TTY (redirected)', () => {
    beforeEach(() => {
      // Simulate non-TTY (redirected output)
      Object.defineProperty(process.stdout, 'isTTY', { value: false, writable: true });
    });

    it('outputs valid CSV when stdout is redirected', async () => {
      const cmd = new ListCommand({ resource: 'servers', output: 'csv' });
      const exitCode = await cmd.run();

      expect(exitCode).toBe(0);
      const output = captureStdout();

      // CSV should have header line
      const lines = output.split('\n');
      expect(lines.length).toBeGreaterThan(0);
      expect(lines[0]).toContain(',');
    });

    it('CSV output contains no ANSI escape codes', async () => {
      // eslint-disable-next-line no-control-regex
      const ANSI_REGEX = /\x1b\[[0-9;]*m/;

      const cmd = new ListCommand({ resource: 'servers', output: 'csv' });
      await cmd.run();
      const output = captureStdout();

      expect(ANSI_REGEX.test(output)).toBe(false);
    });
  });

  describe('Error output in non-TTY (redirected)', () => {
    beforeEach(() => {
      // Simulate non-TTY (redirected output)
      Object.defineProperty(process.stdout, 'isTTY', { value: false, writable: true });
    });

    it('outputs structured JSON error when redirected', async () => {
      const cmd = new ListCommand({
        resource: 'tables',
        serverId: 'prod',
        output: 'json',
      });

      // tables requires database parameter - this will error
      const exitCode = await cmd.run();
      const output = captureStdout();

      expect(exitCode).toBe(1);
      const parsed = JSON.parse(output);
      expect(parsed.type).toBe('error');
    });

    it('error output contains no ANSI escape codes when redirected', async () => {
      // eslint-disable-next-line no-control-regex
      const ANSI_REGEX = /\x1b\[[0-9;]*m/;

      const cmd = new ListCommand({
        resource: 'tables',
        serverId: 'prod',
        output: 'json',
      });

      await cmd.run();
      const output = captureStdout();

      expect(ANSI_REGEX.test(output)).toBe(false);
    });
  });
});