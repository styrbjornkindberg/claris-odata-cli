/**
 * Unit Tests for Server Command — add/list/remove subcommands
 *
 * Tests server add, list, and remove actions, validation,
 * and formatOutput behavior.
 *
 * @module tests/unit/cli/server-subcommands.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ServerCommand } from '../../../src/cli/server';
import { ServerManager } from '../../../src/config/servers';

const mockServer = {
  id: 'srv-1',
  name: 'Prod',
  host: 'fm.example.com',
  port: 443,
  secure: true,
};

vi.mock('../../../src/config/servers', () => ({
  ServerManager: vi.fn().mockImplementation(() => ({
    listServers: vi.fn().mockReturnValue([]),
    addServer: vi.fn().mockReturnValue({
      id: 'srv-1',
      name: 'Prod',
      host: 'fm.example.com',
      port: 443,
      secure: true,
    }),
    getServer: vi.fn(),
    removeServer: vi.fn().mockReturnValue(true),
  })),
}));

vi.mock('../../../src/config/credentials', () => ({
  CredentialsManager: vi.fn().mockImplementation(() => ({
    storeCredentials: vi.fn().mockResolvedValue(undefined),
    getCredentials: vi.fn().mockResolvedValue('password'),
    listCredentials: vi.fn().mockResolvedValue([]),
    deleteCredential: vi.fn(),
  })),
}));

describe('ServerCommand - subcommands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // Validation
  // --------------------------------------------------------------------------

  describe('validation', () => {
    it('fails when add action missing name', async () => {
      const cmd = new ServerCommand({ action: 'add', host: 'example.com' });
      const result = await cmd.execute();
      expect(result.success).toBe(false);
      expect(result.error).toContain('name');
    });

    it('fails when add action missing host', async () => {
      const cmd = new ServerCommand({ action: 'add', name: 'Prod' });
      const result = await cmd.execute();
      expect(result.success).toBe(false);
      expect(result.error).toContain('host');
    });

    it('fails when remove action missing serverId', async () => {
      const cmd = new ServerCommand({ action: 'remove' });
      const result = await cmd.execute();
      expect(result.success).toBe(false);
      expect(result.error).toContain('Server ID');
    });
  });

  // --------------------------------------------------------------------------
  // server add
  // --------------------------------------------------------------------------

  describe('server add', () => {
    it('adds a server successfully', async () => {
      const cmd = new ServerCommand({
        action: 'add',
        name: 'Prod',
        host: 'fm.example.com',
      });
      const result = await cmd.execute();

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        id: 'srv-1',
        name: 'Prod',
        host: 'fm.example.com',
      });
    });

    it('rejects duplicate server name', async () => {
      vi.mocked(ServerManager).mockImplementation(() => ({
        listServers: vi.fn().mockReturnValue([mockServer]),
        addServer: vi.fn(),
        getServer: vi.fn(),
        removeServer: vi.fn(),
      }));

      const cmd = new ServerCommand({
        action: 'add',
        name: 'Prod',
        host: 'other.example.com',
      });
      const result = await cmd.execute();

      expect(result.success).toBe(false);
      expect(result.error).toContain('already exists');
    });
  });

  // --------------------------------------------------------------------------
  // server list
  // --------------------------------------------------------------------------

  describe('server list', () => {
    it('returns empty array when no servers configured', async () => {
      vi.mocked(ServerManager).mockImplementation(() => ({
        listServers: vi.fn().mockReturnValue([]),
        addServer: vi.fn(),
        getServer: vi.fn(),
        removeServer: vi.fn(),
      }));

      const cmd = new ServerCommand({ action: 'list' });
      const result = await cmd.execute();

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('returns servers array when servers exist', async () => {
      vi.mocked(ServerManager).mockImplementation(() => ({
        listServers: vi.fn().mockReturnValue([mockServer]),
        addServer: vi.fn(),
        getServer: vi.fn(),
        removeServer: vi.fn(),
      }));

      const cmd = new ServerCommand({ action: 'list' });
      const result = await cmd.execute();

      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
      expect((result.data as unknown[])[0]).toMatchObject({
        id: 'srv-1',
        name: 'Prod',
        host: 'fm.example.com',
      });
    });
  });

  // --------------------------------------------------------------------------
  // server remove
  // --------------------------------------------------------------------------

  describe('server remove', () => {
    it('removes a server successfully', async () => {
      vi.mocked(ServerManager).mockImplementation(() => ({
        listServers: vi.fn(),
        addServer: vi.fn(),
        getServer: vi.fn().mockReturnValue(mockServer),
        removeServer: vi.fn().mockReturnValue(true),
      }));

      const cmd = new ServerCommand({
        action: 'remove',
        serverId: 'srv-1',
      });
      const result = await cmd.execute();

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ id: 'srv-1', name: 'Prod' });
    });

    it('fails when server not found', async () => {
      vi.mocked(ServerManager).mockImplementation(() => ({
        listServers: vi.fn(),
        addServer: vi.fn(),
        getServer: vi.fn().mockReturnValue(null),
        removeServer: vi.fn(),
      }));

      const cmd = new ServerCommand({
        action: 'remove',
        serverId: 'nonexistent',
      });
      const result = await cmd.execute();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Server not found');
    });
  });

  // --------------------------------------------------------------------------
  // formatOutput
  // --------------------------------------------------------------------------

  describe('formatOutput', () => {
    it('outputs JSON for server list in json mode', async () => {
      vi.mocked(ServerManager).mockImplementation(() => ({
        listServers: vi.fn().mockReturnValue([mockServer]),
        addServer: vi.fn(),
        getServer: vi.fn(),
        removeServer: vi.fn(),
      }));

      const cmd = new ServerCommand({ action: 'list', output: 'json' });
      const result = await cmd.execute();
      const output = cmd.formatOutput(result);
      const parsed = JSON.parse(output);

      expect(Array.isArray(parsed)).toBe(true);
    });

    it('outputs human-readable for server list in table mode', async () => {
      vi.mocked(ServerManager).mockImplementation(() => ({
        listServers: vi.fn().mockReturnValue([mockServer]),
        addServer: vi.fn(),
        getServer: vi.fn(),
        removeServer: vi.fn(),
      }));

      const cmd = new ServerCommand({ action: 'list', output: 'table' });
      const result = await cmd.execute();
      const output = cmd.formatOutput(result);

      expect(output).toContain('Configured servers');
      expect(output).toContain('Prod');
    });

    it('outputs "No servers configured." for empty list in table mode', async () => {
      vi.mocked(ServerManager).mockImplementation(() => ({
        listServers: vi.fn().mockReturnValue([]),
        addServer: vi.fn(),
        getServer: vi.fn(),
        removeServer: vi.fn(),
      }));

      const cmd = new ServerCommand({ action: 'list', output: 'table' });
      const result = await cmd.execute();
      const output = cmd.formatOutput(result);

      expect(output).toContain('No servers configured');
    });

    it('outputs JSON error envelope in json mode', async () => {
      const cmd = new ServerCommand({
        action: 'remove',
        serverId: 'bad',
        output: 'json',
      });

      vi.mocked(ServerManager).mockImplementation(() => ({
        listServers: vi.fn(),
        addServer: vi.fn(),
        getServer: vi.fn().mockReturnValue(null),
        removeServer: vi.fn(),
      }));

      const result = await cmd.execute();
      const output = cmd.formatOutput(result);
      const parsed = JSON.parse(output);

      // SPEC-009: Structured error format
      expect(parsed.type).toBe('error');
      expect(parsed.code).toBe('COMMAND_FAILED');
    });
  });
});
