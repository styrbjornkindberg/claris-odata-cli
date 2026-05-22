/**
 * Unit Tests for IndexCommand
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IndexCommand } from '../../../src/cli/ddl-index';
import { ServerManager } from '../../../src/config/servers';
import { CredentialsManager } from '../../../src/config/credentials';
import { AuthManager } from '../../../src/api/auth';
import { ODataClient } from '../../../src/api/client';

vi.mock('../../../src/config/servers');
vi.mock('../../../src/config/credentials');
vi.mock('../../../src/api/auth');
vi.mock('../../../src/api/client');

describe('IndexCommand', () => {
  const mockServerManager = { getServer: vi.fn() };
  const mockCredentialsManager = { listCredentials: vi.fn(), getCredentials: vi.fn() };
  const mockAuthManager = { createBasicAuthToken: vi.fn() };
  const mockClient = { createIndex: vi.fn(), deleteIndex: vi.fn() };

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
  });

  // ─── create ─────────────────────────────────────────────────────────────────

  describe('create action', () => {
    it('calls createIndex with table and field name', async () => {
      mockClient.createIndex.mockResolvedValue({});
      const cmd = new IndexCommand({
        action: 'create',
        tableName: 'Company',
        fieldName: 'State',
        serverId: 'prod',
        database: 'Sales',
        output: 'json',
      });

      const result = await cmd.execute();

      expect(result.success).toBe(true);
      expect(mockClient.createIndex).toHaveBeenCalledWith('Company', 'State');
    });

    it('returns error when server not found', async () => {
      mockServerManager.getServer.mockReturnValue(undefined);
      const cmd = new IndexCommand({
        action: 'create',
        tableName: 'Company',
        fieldName: 'State',
        serverId: 'missing',
        database: 'Sales',
        output: 'json',
      });

      const result = await cmd.execute();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Server not found: missing');
    });
  });

  // ─── delete ─────────────────────────────────────────────────────────────────

  describe('delete action', () => {
    it('calls deleteIndex when --confirm is true', async () => {
      mockClient.deleteIndex.mockResolvedValue(undefined);
      const cmd = new IndexCommand({
        action: 'delete',
        tableName: 'Company',
        fieldName: 'State',
        confirm: true,
        serverId: 'prod',
        database: 'Sales',
        output: 'json',
      });

      const result = await cmd.execute();

      expect(result.success).toBe(true);
      expect(mockClient.deleteIndex).toHaveBeenCalledWith('Company', 'State');
    });

    it('returns success result with table and field on delete', async () => {
      mockClient.deleteIndex.mockResolvedValue(undefined);
      const cmd = new IndexCommand({
        action: 'delete',
        tableName: 'Company',
        fieldName: 'State',
        confirm: true,
        serverId: 'prod',
        database: 'Sales',
        output: 'json',
      });

      const result = await cmd.execute();

      expect(result.data).toEqual({ table: 'Company', field: 'State', deleted: true });
    });

    it('blocks delete without --confirm', async () => {
      const cmd = new IndexCommand({
        action: 'delete',
        tableName: 'Company',
        fieldName: 'State',
        confirm: false,
        serverId: 'prod',
        database: 'Sales',
        output: 'json',
      });

      const result = await cmd.execute();

      expect(result.success).toBe(false);
      expect(result.error).toContain('--confirm');
      expect(mockClient.deleteIndex).not.toHaveBeenCalled();
    });
  });
});
