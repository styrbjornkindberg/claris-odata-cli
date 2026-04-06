/**
 * Unit Tests for GetCommand
 *
 * Validates credential resolution and query execution behavior.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GetCommand } from '../../../src/cli/get';
import { ServerManager } from '../../../src/config/servers';
import { CredentialsManager } from '../../../src/config/credentials';
import { AuthManager } from '../../../src/api/auth';
import { ODataClient } from '../../../src/api/client';

vi.mock('../../../src/config/servers');
vi.mock('../../../src/config/credentials');
vi.mock('../../../src/api/auth');
vi.mock('../../../src/api/client');

describe('GetCommand', () => {
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
    getRecords: vi.fn(),
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
      { serverId: 'prod', database: 'HR', username: 'bob' },
    ]);

    mockCredentialsManager.getCredentials.mockResolvedValue('secret');
    mockAuthManager.createBasicAuthToken.mockReturnValue('Basic dGVzdA==');
    mockClient.getRecords.mockResolvedValue([{ id: 1, name: 'Record 1' }]);
  });

  it('uses username from stored credential entry for auth', async () => {
    const cmd = new GetCommand({
      serverId: 'prod',
      database: 'Sales',
      table: 'Customers',
      output: 'json',
    });

    const result = await cmd.execute();

    expect(result.success).toBe(true);
    expect(mockCredentialsManager.listCredentials).toHaveBeenCalledWith('prod');
    expect(mockCredentialsManager.getCredentials).toHaveBeenCalledWith('prod', 'Sales', 'alice');
    expect(mockAuthManager.createBasicAuthToken).toHaveBeenCalledWith('alice', 'secret');
    expect(mockClient.getRecords).toHaveBeenCalledWith('Customers', {});
  });

  it('returns an error when no credential entry exists for the database', async () => {
    mockCredentialsManager.listCredentials.mockResolvedValue([{ serverId: 'prod', database: 'OtherDb', username: 'alice' }]);

    const cmd = new GetCommand({
      serverId: 'prod',
      database: 'Sales',
      table: 'Customers',
      output: 'json',
    });

    const result = await cmd.execute();

    expect(result.success).toBe(false);
    expect(result.error).toContain("No credentials found for server 'prod' and database 'Sales'");
    expect(mockClient.getRecords).not.toHaveBeenCalled();
  });

  it('returns an error when server does not exist', async () => {
    mockServerManager.getServer.mockReturnValue(undefined);

    const cmd = new GetCommand({
      serverId: 'missing',
      database: 'Sales',
      table: 'Customers',
      output: 'json',
    });

    const result = await cmd.execute();

    expect(result.success).toBe(false);
    expect(result.error).toBe('Server not found: missing');
    expect(mockCredentialsManager.listCredentials).not.toHaveBeenCalled();
  });
});
