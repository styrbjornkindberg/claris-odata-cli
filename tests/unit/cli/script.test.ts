/**
 * Unit Tests for ScriptCommand
 *
 * Validates credential resolution and script execution behavior.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ScriptCommand } from '../../../src/cli/script';
import { ServerManager } from '../../../src/config/servers';
import { CredentialsManager } from '../../../src/config/credentials';
import { AuthManager } from '../../../src/api/auth';
import { ODataClient } from '../../../src/api/client';

vi.mock('../../../src/config/servers');
vi.mock('../../../src/config/credentials');
vi.mock('../../../src/api/auth');
vi.mock('../../../src/api/client');

describe('ScriptCommand', () => {
  const mockServerManager = {
    getServer: vi.fn(),
  };

  const mockCredentialsManager = {
    listCredentials: vi.fn(),
    getCredentials: vi.fn(),
  };

  const mockAuthManager = {
    createBasicAuthToken: vi.fn(),
  };

  const mockClient = {
    runScript: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(ServerManager).mockImplementation(() => mockServerManager as any);
    vi.mocked(CredentialsManager).mockImplementation(() => mockCredentialsManager as any);
    vi.mocked(AuthManager).mockImplementation(() => mockAuthManager as any);
    vi.mocked(ODataClient).mockImplementation(() => mockClient as any);

    mockServerManager.getServer.mockReturnValue({
      id: 'prod',
      name: 'Production',
      host: 'fm.example.com',
      port: 443,
      secure: true,
    });

    mockCredentialsManager.listCredentials.mockResolvedValue([
      { serverId: 'prod', database: 'Sales', username: 'alice' },
    ]);

    mockCredentialsManager.getCredentials.mockResolvedValue('secret');
    mockAuthManager.createBasicAuthToken.mockReturnValue('Basic dGVzdA==');
    mockClient.runScript.mockResolvedValue({ scriptResult: 0 });
  });

  it('resolves credentials and calls runScript (happy path)', async () => {
    const cmd = new ScriptCommand({
      serverId: 'prod',
      database: 'Sales',
      name: 'MyScript',
      output: 'json',
    });

    const result = await cmd.execute();

    expect(result.success).toBe(true);
    expect(mockCredentialsManager.listCredentials).toHaveBeenCalledWith('prod');
    expect(mockCredentialsManager.getCredentials).toHaveBeenCalledWith('prod', 'Sales', 'alice');
    expect(mockAuthManager.createBasicAuthToken).toHaveBeenCalledWith('alice', 'secret');
    expect(mockClient.runScript).toHaveBeenCalledWith('MyScript', {
      table: undefined,
      recordId: undefined,
      params: undefined,
    });
  });

  it('returns an error when server does not exist', async () => {
    mockServerManager.getServer.mockReturnValue(undefined);

    const cmd = new ScriptCommand({
      serverId: 'missing',
      database: 'Sales',
      name: 'MyScript',
      output: 'json',
    });

    const result = await cmd.execute();

    expect(result.success).toBe(false);
    expect(result.error).toBe('Server not found: missing');
    expect(mockCredentialsManager.listCredentials).not.toHaveBeenCalled();
  });

  it('returns an error when no credential entry exists for the database', async () => {
    mockCredentialsManager.listCredentials.mockResolvedValue([
      { serverId: 'prod', database: 'OtherDb', username: 'alice' },
    ]);

    const cmd = new ScriptCommand({
      serverId: 'prod',
      database: 'Sales',
      name: 'MyScript',
      output: 'json',
    });

    const result = await cmd.execute();

    expect(result.success).toBe(false);
    expect(result.error).toContain("No credentials found for server 'prod' and database 'Sales'");
    expect(mockClient.runScript).not.toHaveBeenCalled();
  });

  it('returns an error when stored credentials are incomplete', async () => {
    mockCredentialsManager.getCredentials.mockResolvedValue(null);

    const cmd = new ScriptCommand({
      serverId: 'prod',
      database: 'Sales',
      name: 'MyScript',
      output: 'json',
    });

    const result = await cmd.execute();

    expect(result.success).toBe(false);
    expect(result.error).toContain('Stored credentials are incomplete');
    expect(mockClient.runScript).not.toHaveBeenCalled();
  });

  it('passes table and id to runScript when provided', async () => {
    const cmd = new ScriptCommand({
      serverId: 'prod',
      database: 'Sales',
      name: 'MyScript',
      table: 'Customers',
      id: 5,
      output: 'json',
    });

    const result = await cmd.execute();

    expect(result.success).toBe(true);
    expect(mockClient.runScript).toHaveBeenCalledWith('MyScript', {
      table: 'Customers',
      recordId: 5,
      params: undefined,
    });
  });

  it('passes parsed params to runScript when provided', async () => {
    const cmd = new ScriptCommand({
      serverId: 'prod',
      database: 'Sales',
      name: 'MyScript',
      params: { key: 'val' },
      output: 'json',
    });

    const result = await cmd.execute();

    expect(result.success).toBe(true);
    expect(mockClient.runScript).toHaveBeenCalledWith('MyScript', {
      table: undefined,
      recordId: undefined,
      params: { key: 'val' },
    });
  });
});
