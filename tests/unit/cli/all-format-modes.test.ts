/**
 * Comprehensive Format Mode Tests (SPEC-009, CLA-1865)
 *
 * Tests all format modes (json, jsonl, csv, table) across all commands
 * that support --format output. Ensures:
 * - JSON output is valid and parseable with sorted keys
 * - JSONL output is one JSON object per line
 * - CSV output has correct headers and escaping
 * - Table output is human-readable
 * - Errors return structured JSON envelope in machine-readable modes
 * - No ANSI escape codes in machine-readable output
 *
 * @module tests/unit/cli/all-format-modes.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ServerCommand } from '../../../src/cli/server';
import { CredentialsCommand } from '../../../src/cli/credentials';
import { ProfileCommand } from '../../../src/cli/profile';
import { HealthCommand } from '../../../src/cli/health';
import { BaseCommand, type CommandOptions } from '../../../src/cli/index';
import { OutputFormatter } from '../../../src/output/formatter';
import { ServerManager } from '../../../src/config/servers';
import { CredentialsManager } from '../../../src/config/credentials';
import { AuthManager } from '../../../src/api/auth';
import { ODataClient } from '../../../src/api/client';
import axios from 'axios';
import type { CommandResult } from '../../../src/types';

// ---------------------------------------------------------------------------
// Module-level mocks (required for vi.mocked to work in beforeEach)
// ---------------------------------------------------------------------------

vi.mock('../../../src/config/servers');
vi.mock('../../../src/config/credentials');
vi.mock('../../../src/api/auth');
vi.mock('../../../src/api/client');
vi.mock('axios', () => ({
  default: { get: vi.fn() },
}));
vi.mock('../../../src/config/profiles', () => ({
  ProfileManager: vi.fn().mockImplementation(() => ({
    listProfiles: vi.fn().mockReturnValue([]),
    addProfile: vi.fn().mockReturnValue(undefined),
    getActiveProfile: vi.fn().mockReturnValue(null),
    useProfile: vi.fn().mockReturnValue(true),
    deleteProfile: vi.fn().mockReturnValue(true),
  })),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /\x1b\[[0-9;]*m/;

function assertValidJson(output: string): Record<string, unknown> | unknown[] {
  let parsed: Record<string, unknown> | unknown[];
  expect(() => { parsed = JSON.parse(output); }).not.toThrow();
  return parsed!;
}

function assertValidJsonl(output: string): unknown[] {
  const lines = output.split('\n').filter((l) => l.trim() !== '');
  expect(lines.length).toBeGreaterThan(0);
  return lines.map((line, i) => {
    let obj: unknown;
    expect(() => { obj = JSON.parse(line); }).not.toThrow();
    return obj!;
  });
}

function assertValidCsv(output: string, minRows = 1): void {
  const lines = output.split('\n').filter((l) => l.trim() !== '');
  expect(lines.length).toBeGreaterThanOrEqual(minRows + 1);
  expect(lines[0]).toContain(',');
}

function assertNoAnsi(output: string): void {
  expect(ANSI_REGEX.test(output)).toBe(false);
}

function assertStructuredError(output: string, code?: string): Record<string, unknown> {
  const parsed = JSON.parse(output);
  expect(parsed).toHaveProperty('type', 'error');
  expect(parsed).toHaveProperty('code');
  expect(parsed).toHaveProperty('message');
  if (code) {
    expect(parsed.code).toBe(code);
  }
  return parsed as Record<string, unknown>;
}

// ===========================================================================
// ServerCommand
// ===========================================================================

describe('SPEC-009: All Format Modes', () => {
  describe('ServerCommand - format modes', () => {
    const mockServer = {
      id: 'srv-1',
      name: 'Production',
      host: 'fm.example.com',
      port: 443,
      secure: true,
    };

    const mockServers = [mockServer];

    beforeEach(() => {
      vi.clearAllMocks();
      vi.mocked(ServerManager).mockImplementation(
        () =>
          ({
            listServers: vi.fn().mockReturnValue(mockServers),
            addServer: vi.fn().mockReturnValue(mockServer),
            getServer: vi.fn().mockReturnValue(mockServer),
            removeServer: vi.fn().mockReturnValue(true),
          }) as any,
      );
      vi.mocked(CredentialsManager).mockImplementation(
        () =>
          ({
            storeCredentials: vi.fn().mockResolvedValue(undefined),
            getCredentials: vi.fn().mockResolvedValue('password'),
            listCredentials: vi.fn().mockResolvedValue([]),
            deleteCredential: vi.fn(),
          }) as any,
      );
    });

    it('outputs valid JSON for server list in json mode', async () => {
      const cmd = new ServerCommand({ action: 'list', output: 'json' });
      const result = await cmd.execute();
      const output = cmd.formatOutput(result);
      const parsed = assertValidJson(output);
      expect(Array.isArray(parsed)).toBe(true);
    });

    it('JSON output has no ANSI codes', async () => {
      const cmd = new ServerCommand({ action: 'list', output: 'json' });
      const result = await cmd.execute();
      const output = cmd.formatOutput(result);
      assertNoAnsi(output);
    });

    it('JSON output has sorted keys', async () => {
      const cmd = new ServerCommand({ action: 'list', output: 'json' });
      const result = await cmd.execute();
      const output = cmd.formatOutput(result);
      const arr = JSON.parse(output) as Record<string, unknown>[];
      const keys = Object.keys(arr[0]);
      expect(keys).toEqual([...keys].sort());
    });

    it('outputs valid JSON for list in jsonl mode', async () => {
      const cmd = new ServerCommand({ action: 'list', output: 'jsonl' });
      const result = await cmd.execute();
      const output = cmd.formatOutput(result);
      // Server list uses formatJson for jsonl too (both go through isMachine path)
      assertValidJson(output);
    });

    it('outputs human-readable table for server list in table mode', async () => {
      const cmd = new ServerCommand({ action: 'list', output: 'table' });
      const result = await cmd.execute();
      const output = cmd.formatOutput(result);
      expect(output).toContain('Configured servers');
      expect(output).toContain('Production');
    });

    it('outputs no-servers message for empty list in table mode', async () => {
      vi.mocked(ServerManager).mockImplementation(
        () =>
          ({
            listServers: vi.fn().mockReturnValue([]),
            addServer: vi.fn(),
            getServer: vi.fn(),
            removeServer: vi.fn(),
          }) as any,
      );
      const cmd = new ServerCommand({ action: 'list', output: 'table' });
      const result = await cmd.execute();
      const output = cmd.formatOutput(result);
      expect(output).toContain('No servers configured');
    });

    it('outputs JSON for server add in json mode', async () => {
      const cmd = new ServerCommand({
        action: 'add',
        name: 'Prod',
        host: 'fm.example.com',
        output: 'json',
      });
      const result = await cmd.execute();
      const output = cmd.formatOutput(result);
      const parsed = assertValidJson(output);
      expect(parsed).toHaveProperty('id');
    });

    it('outputs human-readable for server add in table mode', async () => {
      const cmd = new ServerCommand({
        action: 'add',
        name: 'Prod',
        host: 'fm.example.com',
        output: 'table',
      });
      const result = await cmd.execute();
      const output = cmd.formatOutput(result);
      expect(output).toContain('ID:');
    });

    it('outputs structured JSON error for failed remove in json mode', async () => {
      vi.mocked(ServerManager).mockImplementation(
        () =>
          ({
            listServers: vi.fn(),
            addServer: vi.fn(),
            getServer: vi.fn().mockReturnValue(null),
            removeServer: vi.fn(),
          }) as any,
      );
      const cmd = new ServerCommand({ action: 'remove', serverId: 'bad', output: 'json' });
      const result = await cmd.execute();
      const output = cmd.formatOutput(result);
      assertStructuredError(output, 'COMMAND_FAILED');
    });

    it('error JSON has no ANSI codes', async () => {
      vi.mocked(ServerManager).mockImplementation(
        () =>
          ({
            listServers: vi.fn(),
            addServer: vi.fn(),
            getServer: vi.fn().mockReturnValue(null),
            removeServer: vi.fn(),
          }) as any,
      );
      const cmd = new ServerCommand({ action: 'remove', serverId: 'bad', output: 'json' });
      const result = await cmd.execute();
      const output = cmd.formatOutput(result);
      assertNoAnsi(output);
    });
  });

  // ===========================================================================
  // CredentialsCommand
  // ===========================================================================

  describe('CredentialsCommand - format modes', () => {
    const mockServerManager = {
      getServer: vi.fn(),
      listServers: vi.fn(),
    };
    const mockCredentialsManager = {
      listCredentials: vi.fn(),
      getCredentials: vi.fn(),
      storeCredentials: vi.fn(),
      deleteCredential: vi.fn(),
    };

    beforeEach(() => {
      vi.clearAllMocks();
      vi.mocked(ServerManager).mockImplementation(() => mockServerManager as any);
      vi.mocked(CredentialsManager).mockImplementation(() => mockCredentialsManager as any);

      mockServerManager.getServer.mockReturnValue({
        id: 'srv-1',
        name: 'Production',
        host: 'fm.example.com',
        port: 443,
        secure: true,
      });
      mockServerManager.listServers.mockReturnValue([
        { id: 'srv-1', name: 'Production', host: 'fm.example.com', port: 443, secure: true },
      ]);
      mockCredentialsManager.listCredentials.mockResolvedValue([
        { serverId: 'srv-1', database: 'Sales', username: 'alice' },
      ]);
      mockCredentialsManager.getCredentials.mockResolvedValue('stored-password');
      mockCredentialsManager.storeCredentials.mockResolvedValue(undefined);
      mockCredentialsManager.deleteCredential.mockResolvedValue(undefined);
    });

    it('outputs valid JSON for list action in json mode', async () => {
      const cmd = new CredentialsCommand({
        action: 'list',
        serverId: 'srv-1',
        output: 'json',
      });
      const result = await cmd.execute();
      const output = cmd.formatOutput(result);
      const parsed = assertValidJson(output);
      expect(Array.isArray(parsed)).toBe(true);
    });

    it('JSON output for list has no ANSI codes', async () => {
      const cmd = new CredentialsCommand({
        action: 'list',
        serverId: 'srv-1',
        output: 'json',
      });
      const result = await cmd.execute();
      const output = cmd.formatOutput(result);
      assertNoAnsi(output);
    });

    it('outputs human-readable for list in table mode', async () => {
      const cmd = new CredentialsCommand({
        action: 'list',
        serverId: 'srv-1',
        output: 'table',
      });
      const result = await cmd.execute();
      const output = cmd.formatOutput(result);
      expect(output).toContain('Credentials for server');
      expect(output).toContain('Sales');
    });

    it('outputs no-credentials message for empty list in table mode', async () => {
      mockCredentialsManager.listCredentials.mockResolvedValue([]);
      const cmd = new CredentialsCommand({
        action: 'list',
        serverId: 'srv-1',
        output: 'table',
      });
      const result = await cmd.execute();
      const output = cmd.formatOutput(result);
      expect(output).toContain('No credentials stored');
    });

    it('outputs JSON for add action in json mode', async () => {
      const cmd = new CredentialsCommand({
        action: 'add',
        serverId: 'srv-1',
        database: 'Sales',
        username: 'alice',
        password: 'secret',
        output: 'json',
      });
      const result = await cmd.execute();
      const output = cmd.formatOutput(result);
      const parsed = assertValidJson(output);
      expect(parsed).toHaveProperty('database');
      expect(parsed).toHaveProperty('username');
    });

    it('outputs structured JSON error when server not found in json mode', async () => {
      mockServerManager.getServer.mockReturnValue(null);
      const cmd = new CredentialsCommand({
        action: 'add',
        serverId: 'missing',
        database: 'Sales',
        username: 'alice',
        output: 'json',
      });
      const result = await cmd.execute();
      const output = cmd.formatOutput(result);
      assertStructuredError(output, 'COMMAND_FAILED');
    });

    it('error JSON for credentials has no ANSI codes', async () => {
      mockServerManager.getServer.mockReturnValue(null);
      const cmd = new CredentialsCommand({
        action: 'add',
        serverId: 'missing',
        database: 'Sales',
        username: 'alice',
        output: 'json',
      });
      const result = await cmd.execute();
      const output = cmd.formatOutput(result);
      assertNoAnsi(output);
    });
  });

  // ===========================================================================
  // ProfileCommand
  // ===========================================================================

  describe('ProfileCommand - format modes', () => {
    const mockProfiles = [
      { name: 'default', active: true, defaultServer: 'prod', outputFormat: 'table' },
      { name: 'ci', active: false, defaultServer: null, outputFormat: 'json' },
    ];

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('outputs valid JSON for list action in json mode', async () => {
      const { ProfileManager } = await import('../../../src/config/profiles');
      vi.mocked(ProfileManager).mockImplementation(
        () =>
          ({
            listProfiles: vi.fn().mockReturnValue(mockProfiles),
            addProfile: vi.fn().mockReturnValue(undefined),
            getActiveProfile: vi.fn().mockReturnValue(null),
            useProfile: vi.fn().mockReturnValue(true),
            deleteProfile: vi.fn().mockReturnValue(true),
          }) as any,
      );
      const cmd = new ProfileCommand({ action: 'list', output: 'json' });
      const result = await cmd.execute();
      const output = cmd.formatOutput(result);
      const parsed = assertValidJson(output);
      expect(Array.isArray(parsed)).toBe(true);
    });

    it('outputs human-readable for list in table mode', async () => {
      const { ProfileManager } = await import('../../../src/config/profiles');
      vi.mocked(ProfileManager).mockImplementation(
        () =>
          ({
            listProfiles: vi.fn().mockReturnValue(mockProfiles),
            addProfile: vi.fn().mockReturnValue(undefined),
            getActiveProfile: vi.fn().mockReturnValue(null),
            useProfile: vi.fn().mockReturnValue(true),
            deleteProfile: vi.fn().mockReturnValue(true),
          }) as any,
      );
      const cmd = new ProfileCommand({ action: 'list', output: 'table' });
      const result = await cmd.execute();
      const output = cmd.formatOutput(result);
      expect(output).toContain('Profiles');
    });

    it('outputs structured JSON error for failed remove in json mode', async () => {
      const { ProfileManager } = await import('../../../src/config/profiles');
      vi.mocked(ProfileManager).mockImplementation(
        () =>
          ({
            listProfiles: vi.fn().mockReturnValue([]),
            addProfile: vi.fn().mockReturnValue(undefined),
            getActiveProfile: vi.fn().mockReturnValue(null),
            useProfile: vi.fn().mockReturnValue(false),
            deleteProfile: vi.fn().mockReturnValue(false),
          }) as any,
      );
      const cmd = new ProfileCommand({ action: 'remove', name: 'nonexistent', output: 'json' });
      const result = await cmd.execute();
      const output = cmd.formatOutput(result);
      assertStructuredError(output, 'COMMAND_FAILED');
    });
  });

  // ===========================================================================
  // HealthCommand
  // ===========================================================================

  describe('HealthCommand - format modes', () => {
    const mockServers = [
      { id: 's1', name: 'Prod', host: 'fm.example.com', port: 443, secure: true },
    ];

    let stdoutSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      vi.clearAllMocks();
      vi.mocked(ServerManager).mockImplementation(
        () =>
          ({
            listServers: vi.fn().mockReturnValue(mockServers),
          }) as any,
      );
      vi.mocked(CredentialsManager).mockImplementation(
        () =>
          ({
            listCredentials: vi.fn().mockResolvedValue([
              { serverId: 's1', database: 'Sales', username: 'alice' },
            ]),
            getCredentials: vi.fn().mockResolvedValue('secret'),
          }) as any,
      );
      vi.mocked(axios).get.mockResolvedValue({ status: 200, data: {} });

      stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    function captureStdout(): string {
      return stdoutSpy.mock.calls
        .filter((c) => typeof c[0] === 'string')
        .map((c) => c[0])
        .join('');
    }

    it('outputs valid JSON in json mode via run()', async () => {
      const cmd = new HealthCommand({ output: 'json' });
      await cmd.run();
      const output = captureStdout();
      const parsed = assertValidJson(output);
      expect(parsed).toHaveProperty('healthy');
      expect(parsed).toHaveProperty('servers');
    });

    it('JSON output has no ANSI codes', async () => {
      const cmd = new HealthCommand({ output: 'json' });
      await cmd.run();
      const output = captureStdout();
      assertNoAnsi(output);
    });

    it('outputs JSONL in jsonl mode via run()', async () => {
      // Add a second server for multi-line JSONL
      vi.mocked(ServerManager).mockImplementation(
        () =>
          ({
            listServers: vi.fn().mockReturnValue([
              ...mockServers,
              { id: 's2', name: 'Staging', host: 'staging.example.com', port: 443, secure: true },
            ]),
          }) as any,
      );
      vi.mocked(CredentialsManager).mockImplementation(
        () =>
          ({
            listCredentials: vi.fn().mockResolvedValue([
              { serverId: 's1', database: 'Sales', username: 'alice' },
              { serverId: 's2', database: 'Dev', username: 'bob' },
            ]),
            getCredentials: vi.fn().mockResolvedValue('secret'),
          }) as any,
      );

      const cmd = new HealthCommand({ output: 'jsonl' });
      await cmd.run();
      const output = captureStdout();
      const parsed = assertValidJsonl(output);
      expect(parsed).toHaveLength(2);
      expect(parsed[0]).toHaveProperty('id', 's1');
      expect(parsed[1]).toHaveProperty('id', 's2');
    });

    it('JSONL output has no ANSI codes', async () => {
      const cmd = new HealthCommand({ output: 'jsonl' });
      await cmd.run();
      const output = captureStdout();
      assertNoAnsi(output);
    });

    it('outputs CSV in csv mode via run()', async () => {
      const cmd = new HealthCommand({ output: 'csv' });
      await cmd.run();
      const output = captureStdout();
      assertValidCsv(output);
      expect(output).toContain('id');
    });

    it('CSV output has no ANSI codes', async () => {
      const cmd = new HealthCommand({ output: 'csv' });
      await cmd.run();
      const output = captureStdout();
      assertNoAnsi(output);
    });

    it('outputs human-readable table in table (default) mode via run()', async () => {
      const cmd = new HealthCommand({ output: 'table' });
      await cmd.run();
      const output = captureStdout();
      expect(output).toContain('Health Check');
    });
  });

  // ===========================================================================
  // HealthCommand - unit-level formatOutput tests (no stdout capture needed)
  // ===========================================================================

  describe('HealthCommand - formatOutput unit', () => {
    const healthResult = {
      servers: [
        {
          id: 's1',
          name: 'Prod',
          host: 'fm.example.com',
          port: 443,
          status: 'ok' as const,
          latency: 42,
        },
        {
          id: 's2',
          name: 'Dev',
          host: 'dev.example.com',
          port: 443,
          status: 'error' as const,
          error: 'Connection refused',
        },
      ],
      healthy: 1,
      unhealthy: 1,
      total: 2,
      generatedAt: '2026-04-05T16:30:00Z',
    };

    beforeEach(() => {
      vi.clearAllMocks();
      vi.mocked(ServerManager).mockImplementation(
        () => ({ listServers: vi.fn().mockReturnValue([]) }) as any,
      );
      vi.mocked(CredentialsManager).mockImplementation(
        () => ({ listCredentials: vi.fn().mockResolvedValue([]), getCredentials: vi.fn() }) as any,
      );
    });

    it('formatOutput renders styled table', () => {
      const cmd = new HealthCommand({ output: 'table' });
      const output = cmd.formatOutput(healthResult);
      expect(output).toContain('Health Check');
      expect(output).toContain('Prod');
      expect(output).toContain('Dev');
    });

    it('formatJsonl returns one JSON per server', () => {
      const cmd = new HealthCommand({ output: 'jsonl' });
      const output = cmd.formatJsonl(healthResult);
      const parsed = assertValidJsonl(output);
      expect(parsed).toHaveLength(2);
      expect(parsed[0]).toHaveProperty('id', 's1');
      expect(parsed[1]).toHaveProperty('status', 'error');
    });

    it('formatJsonl has no ANSI codes', () => {
      const cmd = new HealthCommand({ output: 'jsonl' });
      const output = cmd.formatJsonl(healthResult);
      assertNoAnsi(output);
    });

    it('formatOutput shows no-servers for empty result', () => {
      const cmd = new HealthCommand({ output: 'table' });
      const emptyResult = {
        servers: [],
        healthy: 0,
        unhealthy: 0,
        total: 0,
        generatedAt: '2026-04-05T16:30:00Z',
      };
      const output = cmd.formatOutput(emptyResult);
      expect(output).toContain('No servers configured');
    });
  });

  // ===========================================================================
  // BaseCommand.run() - structured error output
  // ===========================================================================

  describe('BaseCommand.run() - structured error output', () => {
    let stdoutSpy: ReturnType<typeof vi.spyOn>;

    class FailingCommand extends BaseCommand {
      async execute(): Promise<CommandResult> {
        return { success: false, error: 'Test error message' };
      }
    }

    beforeEach(() => {
      vi.clearAllMocks();
      stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    function captureStdout(): string {
      return stdoutSpy.mock.calls
        .filter((c) => typeof c[0] === 'string')
        .map((c) => c[0])
        .join('');
    }

    it('outputs structured JSON error in json mode on failed execute', async () => {
      const cmd = new FailingCommand({ output: 'json' });
      const exitCode = await cmd.run();
      expect(exitCode).toBe(1);
      const output = captureStdout();
      assertStructuredError(output, 'COMMAND_FAILED');
    });

    it('outputs structured JSON error in jsonl mode on failed execute', async () => {
      const cmd = new FailingCommand({ output: 'jsonl' });
      const exitCode = await cmd.run();
      expect(exitCode).toBe(1);
      const output = captureStdout();
      assertStructuredError(output, 'COMMAND_FAILED');
    });

    it('structured error has no ANSI codes', async () => {
      const cmd = new FailingCommand({ output: 'json' });
      await cmd.run();
      const output = captureStdout();
      assertNoAnsi(output);
    });
  });

  // ===========================================================================
  // BaseCommand.run() - thrown error structured output
  // ===========================================================================

  describe('BaseCommand.run() - thrown error structured output', () => {
    let stdoutSpy: ReturnType<typeof vi.spyOn>;

    class ThrowingCommand extends BaseCommand {
      async execute(): Promise<CommandResult> {
        throw new Error('Connection refused');
      }
    }

    beforeEach(() => {
      vi.clearAllMocks();
      stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    function captureStdout(): string {
      return stdoutSpy.mock.calls
        .filter((c) => typeof c[0] === 'string')
        .map((c) => c[0])
        .join('');
    }

    it('outputs structured JSON error when command throws in json mode', async () => {
      const cmd = new ThrowingCommand({ output: 'json' });
      const exitCode = await cmd.run();
      expect(exitCode).toBe(1);
      const output = captureStdout();
      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty('type', 'error');
      expect(parsed).toHaveProperty('message', 'Connection refused');
      expect(parsed).toHaveProperty('code');
    });

    it('thrown error output has no ANSI codes', async () => {
      const cmd = new ThrowingCommand({ output: 'json' });
      await cmd.run();
      const output = captureStdout();
      assertNoAnsi(output);
    });
  });

  // ===========================================================================
  // OutputFormatter - integration consistency
  // ===========================================================================

  describe('OutputFormatter - cross-command consistency', () => {
    it('formatJson always sorts keys', () => {
      const formatter = new OutputFormatter('json');
      const data = { zebra: 'z', apple: 'a' };
      const output = formatter.formatJson(data);
      const parsed = JSON.parse(output);
      expect(Object.keys(parsed)).toEqual(['apple', 'zebra']);
    });

    it('formatJsonl always sorts keys per line', () => {
      const formatter = new OutputFormatter('jsonl');
      const data = [{ zebra: 'z', apple: 'a' }];
      const output = formatter.formatJsonl(data);
      const parsed = JSON.parse(output);
      expect(Object.keys(parsed)).toEqual(['apple', 'zebra']);
    });

    it('formatCsv produces header + data rows', () => {
      const formatter = new OutputFormatter('csv');
      const data = [
        { id: 1, name: 'Alice', email: 'alice@example.com' },
        { id: 2, name: 'Bob', email: 'bob@example.com' },
      ];
      const output = formatter.formatCsv(data);
      assertValidCsv(output, 2);
      expect(output).toContain('id');
      expect(output).toContain('Alice');
    });

    it('formatCsv escapes values with commas', () => {
      const formatter = new OutputFormatter('csv');
      const data = [{ name: 'Smith, Jr.', value: 42 }];
      const output = formatter.formatCsv(data);
      expect(output).toContain('"Smith, Jr."');
    });

    it('formatCsv escapes values with quotes', () => {
      const formatter = new OutputFormatter('csv');
      const data = [{ name: 'He said "hello"', value: 42 }];
      const output = formatter.formatCsv(data);
      expect(output).toContain('"He said ""hello"""');
    });

    it('formatCsv has no ANSI codes', () => {
      const formatter = new OutputFormatter('csv');
      const data = [{ id: 1, name: 'Test' }];
      const output = formatter.formatCsv(data);
      assertNoAnsi(output);
    });

    it('format delegates to correct method', () => {
      const jsonFormatter = new OutputFormatter('json');
      const jsonlFormatter = new OutputFormatter('jsonl');
      const csvFormatter = new OutputFormatter('csv');
      const tableFormatter = new OutputFormatter('table');

      const data = [{ id: 1, name: 'Test' }, { id: 2, name: 'Other' }];

      const jsonOut = jsonFormatter.format(data);
      expect(() => JSON.parse(jsonOut)).not.toThrow();

      const jsonlOut = jsonlFormatter.format(data);
      // JSONL: one JSON per line, so multi-record has newlines
      expect(jsonlOut).toContain('\n');
      const lines = jsonlOut.split('\n').filter((l) => l.trim());
      expect(lines).toHaveLength(2);
      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow();
      }

      const csvOut = csvFormatter.format(data);
      expect(csvOut).toContain(',');

      const tableOut = tableFormatter.format(data);
      expect(tableOut).toContain('Id'); // header is capitalized
    });

    it('formatJson handles arrays', () => {
      const formatter = new OutputFormatter('json');
      const data = [{ z: 1 }, { a: 2 }];
      const output = formatter.formatJson(data);
      const parsed = JSON.parse(output);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(2);
    });

    it('formatJsonl handles empty array', () => {
      const formatter = new OutputFormatter('jsonl');
      const output = formatter.formatJsonl([]);
      expect(output).toBe('');
    });

    it('formatCsv handles empty array', () => {
      const formatter = new OutputFormatter('csv');
      const output = formatter.formatCsv([]);
      expect(output).toBe('');
    });
  });
});