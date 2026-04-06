/**
 * Unit Tests for DeleteCommand
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeleteCommand } from '../../../src/cli/delete';
import { ServerManager } from '../../../src/config/servers';
import { CredentialsManager } from '../../../src/config/credentials';
import { AuthManager } from '../../../src/api/auth';
import { ODataClient } from '../../../src/api/client';

vi.mock('../../../src/config/servers');
vi.mock('../../../src/config/credentials');
vi.mock('../../../src/api/auth');
vi.mock('../../../src/api/client');

describe('DeleteCommand', () => {
  const mockServerManager = { getServer: vi.fn() };
  const mockCredentialsManager = { listCredentials: vi.fn(), getCredentials: vi.fn() };
  const mockAuthManager = { createBasicAuthToken: vi.fn() };
  const mockClient = { deleteRecord: vi.fn() };

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
    mockClient.deleteRecord.mockResolvedValue(undefined);
  });

  it('deletes a record successfully', async () => {
    const cmd = new DeleteCommand({
      serverId: 'prod',
      database: 'Sales',
      table: 'Customers',
      recordId: 123,
      output: 'json',
    });

    const result = await cmd.execute();

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ deleted: true, table: 'Customers', recordId: 123 });
    expect(mockClient.deleteRecord).toHaveBeenCalledWith('Customers', 123);
  });

  it('returns error if no credentials for database exist', async () => {
    mockCredentialsManager.listCredentials.mockResolvedValue([]);

    const cmd = new DeleteCommand({
      serverId: 'prod',
      database: 'Sales',
      table: 'Customers',
      recordId: 123,
      output: 'json',
    });

    const result = await cmd.execute();

    expect(result.success).toBe(false);
    expect(result.error).toContain("No credentials found for server 'prod' and database 'Sales'");
  });
});
