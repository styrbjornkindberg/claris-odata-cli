/**
 * Unit Tests for FieldCommand
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FieldCommand } from '../../../src/cli/field';
import { ServerManager } from '../../../src/config/servers';
import { CredentialsManager } from '../../../src/config/credentials';
import { AuthManager } from '../../../src/api/auth';
import { ODataClient } from '../../../src/api/client';

vi.mock('../../../src/config/servers');
vi.mock('../../../src/config/credentials');
vi.mock('../../../src/api/auth');
vi.mock('../../../src/api/client');

describe('FieldCommand', () => {
  const mockServerManager = { getServer: vi.fn() };
  const mockCredentialsManager = { listCredentials: vi.fn(), getCredentials: vi.fn() };
  const mockAuthManager = { createBasicAuthToken: vi.fn() };
  const mockClient = { addFields: vi.fn(), deleteField: vi.fn() };

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

  // ─── add ────────────────────────────────────────────────────────────────────

  describe('add action', () => {
    it('calls addFields with the table name and fields', async () => {
      mockClient.addFields.mockResolvedValue({});
      const cmd = new FieldCommand({
        action: 'add',
        tableName: 'Company',
        fields: [{ name: 'Phone', type: 'varchar(25)' }],
        serverId: 'prod',
        database: 'Sales',
        output: 'json',
      });

      const result = await cmd.execute();

      expect(result.success).toBe(true);
      expect(mockClient.addFields).toHaveBeenCalledWith('Company', [
        { name: 'Phone', type: 'varchar(25)' },
      ]);
    });

    it('returns error when server not found', async () => {
      mockServerManager.getServer.mockReturnValue(undefined);
      const cmd = new FieldCommand({
        action: 'add',
        tableName: 'Company',
        fields: [{ name: 'Phone', type: 'varchar(25)' }],
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
      const cmd = new FieldCommand({
        action: 'add',
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
    it('calls deleteField when --confirm is true', async () => {
      mockClient.deleteField.mockResolvedValue(undefined);
      const cmd = new FieldCommand({
        action: 'delete',
        tableName: 'Company',
        fieldName: 'Phone',
        confirm: true,
        serverId: 'prod',
        database: 'Sales',
        output: 'json',
      });

      const result = await cmd.execute();

      expect(result.success).toBe(true);
      expect(mockClient.deleteField).toHaveBeenCalledWith('Company', 'Phone');
    });

    it('returns success result with table and field name on delete', async () => {
      mockClient.deleteField.mockResolvedValue(undefined);
      const cmd = new FieldCommand({
        action: 'delete',
        tableName: 'Company',
        fieldName: 'Phone',
        confirm: true,
        serverId: 'prod',
        database: 'Sales',
        output: 'json',
      });

      const result = await cmd.execute();

      expect(result.data).toEqual({ table: 'Company', field: 'Phone', deleted: true });
    });

    it('blocks delete without --confirm', async () => {
      const cmd = new FieldCommand({
        action: 'delete',
        tableName: 'Company',
        fieldName: 'Phone',
        confirm: false,
        serverId: 'prod',
        database: 'Sales',
        output: 'json',
      });

      const result = await cmd.execute();

      expect(result.success).toBe(false);
      expect(result.error).toContain('--confirm');
      expect(mockClient.deleteField).not.toHaveBeenCalled();
    });
  });
});
