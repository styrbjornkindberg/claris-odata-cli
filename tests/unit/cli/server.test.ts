/**
 * Unit Tests for Server CLI Command
 *
 * Tests warning behavior when --password is provided without
 * --username and/or --database on the `server add` command.
 *
 * Acceptance scenarios from specs/008-browse-credentials/spec.md (T010 / FR-006):
 * 1. --password without --username → warning: "credentials were not stored because --username and --database are also required"
 * 2. --password + --username without --database → warning: "--database is also required to store credentials"
 * 3. All three provided → no warning
 *
 * @module tests/unit/cli/server.test
 * @see specs/008-browse-credentials/spec.md T010
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ServerCommand } from '../../../src/cli/server';

// Mock ServerManager to avoid file system access
vi.mock('../../../src/config/servers', () => {
  const mockServer = {
    id: 'test-server-id',
    name: 'Test Server',
    host: 'test.local',
    port: 443,
    secure: true,
  };

  return {
    ServerManager: vi.fn().mockImplementation(() => ({
      listServers: vi.fn().mockReturnValue([]),
      addServer: vi.fn().mockReturnValue(mockServer),
      getServer: vi.fn().mockReturnValue(mockServer),
      removeServer: vi.fn().mockReturnValue(true),
    })),
    serverStore: {
      getAll: vi.fn().mockReturnValue([]),
      set: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
    },
  };
});

// Mock CredentialsManager to avoid keychain access
vi.mock('../../../src/config/credentials', () => ({
  CredentialsManager: vi.fn().mockImplementation(() => ({
    storeCredentials: vi.fn().mockResolvedValue(undefined),
    getCredentials: vi.fn().mockResolvedValue('stored-password'),
  })),
}));

describe('ServerCommand - server add incomplete-credential warnings (T010)', () => {
  let loggerWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    const logger = await import('../../../src/utils/logger');
    loggerWarnSpy = vi.spyOn(logger.logger, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    loggerWarnSpy.mockRestore();
  });

  // Acceptance Scenario 1: --password without --username (and no --database)
  it('warns with combined message when --password is given without --username and --database', async () => {
    const cmd = new ServerCommand({
      action: 'add',
      name: 'dev',
      host: 'example.com',
      password: 'secret',
    });

    const result = await cmd.execute();

    expect(result.success).toBe(true);
    expect(loggerWarnSpy).toHaveBeenCalledTimes(1);
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('credentials were not stored because --username and --database are also required')
    );
  });

  // Acceptance Scenario 2: --password + --username, but no --database
  it('warns that --database is also required when --password and --username given but --database missing', async () => {
    const cmd = new ServerCommand({
      action: 'add',
      name: 'dev',
      host: 'example.com',
      password: 'secret',
      username: 'admin',
    });

    const result = await cmd.execute();

    expect(result.success).toBe(true);
    expect(loggerWarnSpy).toHaveBeenCalledTimes(1);
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('--database is also required to store credentials')
    );
  });

  // Acceptance Scenario 3: All three provided — no warning
  it('does NOT warn when --password, --username, and --database are all provided', async () => {
    const cmd = new ServerCommand({
      action: 'add',
      name: 'dev',
      host: 'example.com',
      password: 'secret',
      username: 'admin',
      database: 'MyDB',
    });

    const result = await cmd.execute();

    expect(result.success).toBe(true);
    expect(loggerWarnSpy).not.toHaveBeenCalled();
  });

  // Edge case: --password + --database but no --username
  it('warns that --username is also required when --password and --database given but --username missing', async () => {
    const cmd = new ServerCommand({
      action: 'add',
      name: 'dev',
      host: 'example.com',
      password: 'secret',
      database: 'MyDB',
    });

    const result = await cmd.execute();

    expect(result.success).toBe(true);
    expect(loggerWarnSpy).toHaveBeenCalledTimes(1);
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('--username is also required to store credentials')
    );
  });

  // Edge case: no --password provided — no warning at all
  it('does NOT warn when --password is not provided', async () => {
    const cmd = new ServerCommand({
      action: 'add',
      name: 'dev',
      host: 'example.com',
    });

    const result = await cmd.execute();

    expect(result.success).toBe(true);
    expect(loggerWarnSpy).not.toHaveBeenCalled();
  });

  // Edge case: whitespace-only password is treated as no password
  it('does NOT warn when --password is whitespace only', async () => {
    const cmd = new ServerCommand({
      action: 'add',
      name: 'dev',
      host: 'example.com',
      password: '   ',
    });

    const result = await cmd.execute();

    expect(result.success).toBe(true);
    expect(loggerWarnSpy).not.toHaveBeenCalled();
  });
});
