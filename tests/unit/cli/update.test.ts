/**
 * Unit Tests for UpdateCommand
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UpdateCommand } from '../../../src/cli/update';
import { ServerManager } from '../../../src/config/servers';
import { CredentialsManager } from '../../../src/config/credentials';
import { AuthManager } from '../../../src/api/auth';
import { ODataClient } from '../../../src/api/client';

vi.mock('../../../src/config/servers');
vi.mock('../../../src/config/credentials');
vi.mock('../../../src/api/auth');
vi.mock('../../../src/api/client');

describe('UpdateCommand', () => {
  const mockServerManager = { getServer: vi.fn() };
  const mockCredentialsManager = { listCredentials: vi.fn(), getCredentials: vi.fn() };
  const mockAuthManager = { createBasicAuthToken: vi.fn() };
  const mockClient = { updateRecord: vi.fn() };

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
    mockClient.updateRecord.mockResolvedValue({ id: 123, Name: 'Updated Name' });
  });

  it('updates a record successfully', async () => {
    const cmd = new UpdateCommand({
      serverId: 'prod',
      database: 'Sales',
      table: 'Customers',
      recordId: 123,
      data: { Name: 'Updated Name' },
      output: 'json',
    });

    const result = await cmd.execute();

    expect(result.success).toBe(true);
    expect(mockClient.updateRecord).toHaveBeenCalledWith('Customers', 123, { Name: 'Updated Name' });
  });

  it('returns error when credentials are incomplete', async () => {
    mockCredentialsManager.getCredentials.mockResolvedValue(null);

    const cmd = new UpdateCommand({
      serverId: 'prod',
      database: 'Sales',
      table: 'Customers',
      recordId: 123,
      data: { Name: 'Updated Name' },
      output: 'json',
    });

    const result = await cmd.execute();

    expect(result.success).toBe(false);
    expect(result.error).toContain('Stored credentials are incomplete');
  });
});
