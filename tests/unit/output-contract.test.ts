/**
 * Output Contract Tests
 *
 * Verifies consistent JSON error/success payload shapes across
 * machine-readable output modes (--format json, --format jsonl).
 *
 * @module tests/unit/output-contract
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CommandResult } from '../../src/types';

// Mock keytar before importing anything that touches credentials
vi.mock('keytar', () => ({
  getPassword: vi.fn(),
  setPassword: vi.fn(),
  deletePassword: vi.fn(),
  findCredentials: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../src/config/servers', () => ({
  ServerManager: vi.fn().mockImplementation(() => ({
    listServers: vi.fn().mockReturnValue([]),
    getServer: vi.fn(),
    addServer: vi.fn(),
    removeServer: vi.fn(),
  })),
}));

vi.mock('../../src/config/credentials', () => ({
  CredentialsManager: vi.fn().mockImplementation(() => ({
    listCredentials: vi.fn().mockResolvedValue([]),
    getCredentials: vi.fn(),
    storeCredentials: vi.fn(),
    deleteCredential: vi.fn(),
  })),
}));

describe('Output Contract', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function captureStdout(): string {
    return stdoutSpy.mock.calls.map((c) => c[0]).join('');
  }

  describe('BaseCommand.run() JSON error contract', () => {
    it('outputs JSON error to stdout when format=json and command fails', async () => {
      const { BaseCommand } = await import('../../src/cli/index');

      class FailingCommand extends BaseCommand {
        async execute(): Promise<CommandResult> {
          return { success: false, error: 'Something went wrong' };
        }
      }

      const cmd = new FailingCommand({ output: 'json' });
      const exitCode = await cmd.run();

      expect(exitCode).toBe(1);
      const output = captureStdout();
      const parsed = JSON.parse(output);
      expect(parsed).toEqual({
        error: { code: 'COMMAND_FAILED', message: 'Something went wrong' },
        success: false,
      });
    });

    it('outputs JSON error to stdout when format=jsonl and command throws', async () => {
      const { BaseCommand } = await import('../../src/cli/index');

      class ThrowingCommand extends BaseCommand {
        async execute(): Promise<CommandResult> {
          throw new Error('Network timeout');
        }
      }

      const cmd = new ThrowingCommand({ output: 'jsonl' });
      const exitCode = await cmd.run();

      expect(exitCode).toBe(1);
      const output = captureStdout();
      const parsed = JSON.parse(output);
      expect(parsed.success).toBe(false);
      expect(parsed.error.code).toBe('CONNECTION_ERROR');
      expect(parsed.error.message).toBe('Network timeout');
    });

    it('uses logger.error for table format errors (not JSON)', async () => {
      const { BaseCommand } = await import('../../src/cli/index');

      class FailingCommand extends BaseCommand {
        async execute(): Promise<CommandResult> {
          return { success: false, error: 'Bad request' };
        }
      }

      const cmd = new FailingCommand({ output: 'table' });
      const exitCode = await cmd.run();

      expect(exitCode).toBe(1);
      // No JSON in stdout for table format
      const output = captureStdout();
      expect(output).toBe('');
    });

    it('outputs success data as JSON with sorted keys', async () => {
      const { BaseCommand } = await import('../../src/cli/index');

      class SuccessCommand extends BaseCommand {
        async execute(): Promise<CommandResult> {
          return { success: true, data: { zebra: 'z', apple: 'a' } };
        }
      }

      const cmd = new SuccessCommand({ output: 'json' });
      const exitCode = await cmd.run();

      expect(exitCode).toBe(0);
      const output = captureStdout();
      const parsed = JSON.parse(output);
      expect(Object.keys(parsed)).toEqual(['apple', 'zebra']);
    });
  });

  describe('server formatOutput() JSON error contract', () => {
    it('outputs JSON error envelope for failed server commands', async () => {
      const { ServerCommand } = await import('../../src/cli/server');

      const cmd = new ServerCommand({
        action: 'remove',
        serverId: 'nonexistent',
        output: 'json',
      });
      const result = await cmd.execute();
      const output = cmd.formatOutput(result);
      const parsed = JSON.parse(output);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toHaveProperty('code');
      expect(parsed.error).toHaveProperty('message');
    });

    it('outputs JSON success with sorted keys', async () => {
      const { ServerCommand } = await import('../../src/cli/server');
      const { ServerManager } = await import('../../src/config/servers');

      vi.mocked(ServerManager).mockImplementation(() => ({
        listServers: vi.fn().mockReturnValue([
          { id: 'srv-1', name: 'Prod', host: 'fm.example.com', port: 443, secure: true },
        ]),
        getServer: vi.fn(),
        addServer: vi.fn(),
        removeServer: vi.fn(),
      }));

      const cmd = new ServerCommand({ action: 'list', output: 'json' });
      const result = await cmd.execute();
      const output = cmd.formatOutput(result);
      const parsed = JSON.parse(output);

      // Should be valid JSON array
      expect(Array.isArray(parsed)).toBe(true);
      // Keys should be sorted
      if (parsed.length > 0) {
        const keys = Object.keys(parsed[0]);
        const sorted = [...keys].sort();
        expect(keys).toEqual(sorted);
      }
    });
  });

  describe('credentials formatOutput() JSON error contract', () => {
    it('outputs JSON error envelope for failed credentials commands', async () => {
      const { CredentialsCommand } = await import('../../src/cli/credentials');

      const cmd = new CredentialsCommand({
        action: 'list',
        serverId: 'nonexistent',
        output: 'json',
      });
      const result = await cmd.execute();
      const output = cmd.formatOutput(result);
      const parsed = JSON.parse(output);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toHaveProperty('code');
      expect(parsed.error).toHaveProperty('message');
    });
  });

  describe('error code mapping', () => {
    it('maps AuthenticationError to AUTH_FAILED', async () => {
      const { BaseCommand } = await import('../../src/cli/index');
      const { AuthenticationError } = await import('../../src/api/errors');

      class AuthFailCommand extends BaseCommand {
        async execute(): Promise<CommandResult> {
          throw new AuthenticationError('Invalid credentials');
        }
      }

      const cmd = new AuthFailCommand({ output: 'json' });
      await cmd.run();
      const parsed = JSON.parse(captureStdout());
      expect(parsed.error.code).toBe('AUTH_FAILED');
    });

    it('maps NotFoundError to NOT_FOUND', async () => {
      const { BaseCommand } = await import('../../src/cli/index');
      const { NotFoundError } = await import('../../src/api/errors');

      class NotFoundCommand extends BaseCommand {
        async execute(): Promise<CommandResult> {
          throw new NotFoundError('Table Customers');
        }
      }

      const cmd = new NotFoundCommand({ output: 'json' });
      await cmd.run();
      const parsed = JSON.parse(captureStdout());
      expect(parsed.error.code).toBe('NOT_FOUND');
    });

    it('maps ValidationError to VALIDATION_ERROR', async () => {
      const { BaseCommand } = await import('../../src/cli/index');
      const { ValidationError } = await import('../../src/api/errors');

      class ValidateFailCommand extends BaseCommand {
        async execute(): Promise<CommandResult> {
          throw new ValidationError('Invalid field');
        }
      }

      const cmd = new ValidateFailCommand({ output: 'json' });
      await cmd.run();
      const parsed = JSON.parse(captureStdout());
      expect(parsed.error.code).toBe('VALIDATION_ERROR');
    });

    it('maps ODataError with 401 status to AUTH_FAILED', async () => {
      const { BaseCommand } = await import('../../src/cli/index');
      const { ODataError } = await import('../../src/api/errors');

      class OData401Command extends BaseCommand {
        async execute(): Promise<CommandResult> {
          throw new ODataError('Unauthorized', 401);
        }
      }

      const cmd = new OData401Command({ output: 'json' });
      await cmd.run();
      const parsed = JSON.parse(captureStdout());
      expect(parsed.error.code).toBe('AUTH_FAILED');
    });

    it('maps ECONNREFUSED to CONNECTION_ERROR', async () => {
      const { BaseCommand } = await import('../../src/cli/index');

      class ConnRefusedCommand extends BaseCommand {
        async execute(): Promise<CommandResult> {
          throw new Error('connect ECONNREFUSED 127.0.0.1:443');
        }
      }

      const cmd = new ConnRefusedCommand({ output: 'json' });
      await cmd.run();
      const parsed = JSON.parse(captureStdout());
      expect(parsed.error.code).toBe('CONNECTION_ERROR');
    });

    it('maps generic errors to COMMAND_FAILED', async () => {
      const { BaseCommand } = await import('../../src/cli/index');

      class GenericFailCommand extends BaseCommand {
        async execute(): Promise<CommandResult> {
          throw new Error('Something unexpected');
        }
      }

      const cmd = new GenericFailCommand({ output: 'json' });
      await cmd.run();
      const parsed = JSON.parse(captureStdout());
      expect(parsed.error.code).toBe('COMMAND_FAILED');
    });
  });

  describe('no ANSI in machine-readable output', () => {
    // eslint-disable-next-line no-control-regex
    const ANSI_REGEX = /\x1b\[[0-9;]*m/;

    it('JSON output contains no ANSI escape codes', async () => {
      const { BaseCommand } = await import('../../src/cli/index');

      class DataCommand extends BaseCommand {
        async execute(): Promise<CommandResult> {
          return { success: true, data: { status: 'ok', count: 42 } };
        }
      }

      const cmd = new DataCommand({ output: 'json' });
      await cmd.run();
      const output = captureStdout();
      expect(ANSI_REGEX.test(output)).toBe(false);
    });

    it('JSON error output contains no ANSI escape codes', async () => {
      const { BaseCommand } = await import('../../src/cli/index');

      class FailCommand extends BaseCommand {
        async execute(): Promise<CommandResult> {
          return { success: false, error: 'Something failed' };
        }
      }

      const cmd = new FailCommand({ output: 'json' });
      await cmd.run();
      const output = captureStdout();
      expect(ANSI_REGEX.test(output)).toBe(false);
    });
  });
});
