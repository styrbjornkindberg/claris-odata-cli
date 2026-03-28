/**
 * Unit Tests for Server CLI Command
 *
 * Tests warning behavior when --password is provided without
 * --username and/or --database on the `server add` command.
 *
 * @module tests/unit/cli/server.test
 * @see specs/007-interactive-navigation/spec.md T001
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

describe('ServerCommand - server add password warning (T001)', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('warns when --password is given without --username and --database', async () => {
    const cmd = new ServerCommand({
      action: 'add',
      name: 'MyServer',
      host: 'fms.example.com',
      password: 'secret',
    });

    const result = await cmd.execute();

    expect(result.success).toBe(true);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('--username is missing')
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('--database is missing')
    );
  });

  it('warns when --password and --username are given but --database is missing', async () => {
    const cmd = new ServerCommand({
      action: 'add',
      name: 'MyServer',
      host: 'fms.example.com',
      password: 'secret',
      username: 'admin',
    });

    const result = await cmd.execute();

    expect(result.success).toBe(true);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('--database is missing')
    );
    // Should NOT warn about missing username
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('--username is missing')
    );
  });

  it('warns when --password and --database are given but --username is missing', async () => {
    const cmd = new ServerCommand({
      action: 'add',
      name: 'MyServer',
      host: 'fms.example.com',
      password: 'secret',
      database: 'MyDB',
    });

    const result = await cmd.execute();

    expect(result.success).toBe(true);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('--username is missing')
    );
    // Should NOT warn about missing database
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('--database is missing')
    );
  });

  it('does NOT warn when --password, --username, and --database are all provided', async () => {
    const cmd = new ServerCommand({
      action: 'add',
      name: 'MyServer',
      host: 'fms.example.com',
      password: 'secret',
      username: 'admin',
      database: 'MyDB',
    });

    const result = await cmd.execute();

    expect(result.success).toBe(true);
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('--username is missing')
    );
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('--database is missing')
    );
  });

  it('does NOT warn when --password is not provided', async () => {
    const cmd = new ServerCommand({
      action: 'add',
      name: 'MyServer',
      host: 'fms.example.com',
    });

    const result = await cmd.execute();

    expect(result.success).toBe(true);
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('--username is missing')
    );
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('--database is missing')
    );
  });
});
