/**
 * Unit Tests for TableCommand
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TableCommand } from '../../../src/cli/table';
import { ServerManager } from '../../../src/config/servers';
import { CredentialsManager } from '../../../src/config/credentials';
import { AuthManager } from '../../../src/api/auth';
import { ODataClient } from '../../../src/api/client';

vi.mock('../../../src/config/servers');
vi.mock('../../../src/config/credentials');
vi.mock('../../../src/api/auth');
vi.mock('../../../src/api/client');

describe('TableCommand', () => {
  const mockServerManager = { getServer: vi.fn() };
  const mockCredentialsManager = { listCredentials: vi.fn(), getCredentials: vi.fn() };
  const mockAuthManager = { createBasicAuthToken: vi.fn() };
  const mockClient = { createTable: vi.fn(), deleteTable: vi.fn() };

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
    it('calls createTable with the table name and fields', async () => {
      mockClient.createTable.mockResolvedValue({ tableName: 'Company' });
      const cmd = new TableCommand({
        action: 'create',
        tableName: 'Company',
        fields: [{ name: 'ID', type: 'int', primary: true }],
        serverId: 'prod',
        database: 'Sales',
        output: 'json',
      });

      const result = await cmd.execute();

      expect(result.success).toBe(true);
      expect(mockClient.createTable).toHaveBeenCalledWith('Company', [
        { name: 'ID', type: 'int', primary: true },
      ]);
    });

    it('creates table with no fields when fields array is empty', async () => {
      mockClient.createTable.mockResolvedValue({});
      const cmd = new TableCommand({
        action: 'create',
        tableName: 'Empty',
        fields: [],
        serverId: 'prod',
        database: 'Sales',
        output: 'json',
      });

      const result = await cmd.execute();

      expect(result.success).toBe(true);
      expect(mockClient.createTable).toHaveBeenCalledWith('Empty', []);
    });

    it('returns error when server not found', async () => {
      mockServerManager.getServer.mockReturnValue(undefined);
      const cmd = new TableCommand({
        action: 'create',
        tableName: 'Company',
        fields: [],
        serverId: 'missing',
        database: 'Sales',
        output: 'json',
      });

      const result = await cmd.execute();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Server not found: missing');
    });

    it('returns error when no credentials found', async () => {
      mockCredentialsManager.listCredentials.mockResolvedValue([]);
      const cmd = new TableCommand({
        action: 'create',
        tableName: 'Company',
        fields: [],
        serverId: 'prod',
        database: 'Sales',
        output: 'json',
      });

      const result = await cmd.execute();

      expect(result.success).toBe(false);
      expect(result.error).toContain('No credentials found');
    });
  });

  // ─── delete ─────────────────────────────────────────────────────────────────

  describe('delete action', () => {
    it('calls deleteTable when --confirm is true', async () => {
      mockClient.deleteTable.mockResolvedValue(undefined);
      const cmd = new TableCommand({
        action: 'delete',
        tableName: 'Company',
        confirm: true,
        serverId: 'prod',
        database: 'Sales',
        output: 'json',
      });

      const result = await cmd.execute();

      expect(result.success).toBe(true);
      expect(mockClient.deleteTable).toHaveBeenCalledWith('Company');
    });

    it('returns success result with table name on delete', async () => {
      mockClient.deleteTable.mockResolvedValue(undefined);
      const cmd = new TableCommand({
        action: 'delete',
        tableName: 'Company',
        confirm: true,
        serverId: 'prod',
        database: 'Sales',
        output: 'json',
      });

      const result = await cmd.execute();

      expect(result.data).toEqual({ table: 'Company', deleted: true });
    });

    it('blocks delete without --confirm', async () => {
      const cmd = new TableCommand({
        action: 'delete',
        tableName: 'Company',
        confirm: false,
        serverId: 'prod',
        database: 'Sales',
        output: 'json',
      });

      const result = await cmd.execute();

      expect(result.success).toBe(false);
      expect(result.error).toContain('--confirm');
      expect(mockClient.deleteTable).not.toHaveBeenCalled();
    });
  });
});
