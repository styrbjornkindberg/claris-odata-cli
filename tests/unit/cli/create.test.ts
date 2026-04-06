/**
 * Unit Tests for CreateCommand
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateCommand } from '../../../src/cli/create';
import { ServerManager } from '../../../src/config/servers';
import { CredentialsManager } from '../../../src/config/credentials';
import { AuthManager } from '../../../src/api/auth';
import { ODataClient } from '../../../src/api/client';

vi.mock('../../../src/config/servers');
vi.mock('../../../src/config/credentials');
vi.mock('../../../src/api/auth');
vi.mock('../../../src/api/client');

describe('CreateCommand', () => {
  const mockServerManager = { getServer: vi.fn() };
  const mockCredentialsManager = { listCredentials: vi.fn(), getCredentials: vi.fn() };
  const mockAuthManager = { createBasicAuthToken: vi.fn() };
  const mockClient = { createRecord: vi.fn() };

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
    mockAuthManager.createBasicAuthToken.mockReturnValue('Basic token');
    mockClient.createRecord.mockResolvedValue({ id: 123, Name: 'Acme' });
  });

  it('creates a record successfully', async () => {
    const cmd = new CreateCommand({
      serverId: 'prod',
      database: 'Sales',
      table: 'Customers',
      data: { Name: 'Acme' },
      output: 'json',
    });

    const result = await cmd.execute();

    expect(result.success).toBe(true);
    expect(mockCredentialsManager.getCredentials).toHaveBeenCalledWith('prod', 'Sales', 'alice');
    expect(mockClient.createRecord).toHaveBeenCalledWith('Customers', { Name: 'Acme' });
  });

  it('returns error if server is missing', async () => {
    mockServerManager.getServer.mockReturnValue(undefined);

    const cmd = new CreateCommand({
      serverId: 'missing',
      database: 'Sales',
      table: 'Customers',
      data: { Name: 'Acme' },
      output: 'json',
    });

    const result = await cmd.execute();

    expect(result.success).toBe(false);
    expect(result.error).toBe('Server not found: missing');
  });

  it('returns error if no matching database credentials exist', async () => {
    mockCredentialsManager.listCredentials.mockResolvedValue([
      { serverId: 'prod', database: 'OtherDB', username: 'alice' },
    ]);

    const cmd = new CreateCommand({
      serverId: 'prod',
      database: 'Sales',
      table: 'Customers',
      data: { Name: 'Acme' },
      output: 'json',
    });

    const result = await cmd.execute();

    expect(result.success).toBe(false);
    expect(result.error).toContain("No credentials found for server 'prod' and database 'Sales'");
  });
});
