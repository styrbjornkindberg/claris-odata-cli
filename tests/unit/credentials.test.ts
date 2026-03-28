/**
 * Tests for CredentialsManager
 */

import { CredentialsManager } from '../../src/config/credentials';
import type { CredentialEntry } from '../../src/types';

// Mock keytar
vi.mock('keytar', () => ({
  default: {
    setPassword: vi.fn(),
    getPassword: vi.fn(),
    deletePassword: vi.fn(),
    findCredentials: vi.fn(),
  },
}));

import keytar from 'keytar';

const mockFindCredentials = vi.mocked(keytar.findCredentials);

describe('CredentialsManager', () => {
  let manager: CredentialsManager;

  beforeEach(() => {
    manager = new CredentialsManager();
    vi.clearAllMocks();
  });

  describe('listCredentials()', () => {
    it('returns empty array when no credentials stored for server', async () => {
      mockFindCredentials.mockResolvedValue([]);

      const result = await manager.listCredentials('server1');

      expect(result).toEqual([]);
    });

    it('returns array of CredentialEntry when credentials exist', async () => {
      mockFindCredentials.mockResolvedValue([
        { account: 'server1:mydb:alice', password: 'secret' },
      ]);

      const result = await manager.listCredentials('server1');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ serverId: 'server1', database: 'mydb', username: 'alice' });
    });

    it('filters by serverId correctly (ignores other servers)', async () => {
      mockFindCredentials.mockResolvedValue([
        { account: 'server1:db1:alice', password: 'pass1' },
        { account: 'server2:db2:bob', password: 'pass2' },
        { account: 'server1:db3:carol', password: 'pass3' },
      ]);

      const result = await manager.listCredentials('server1');

      expect(result).toHaveLength(2);
      expect(result).toEqual([
        { serverId: 'server1', database: 'db1', username: 'alice' },
        { serverId: 'server1', database: 'db3', username: 'carol' },
      ]);
    });

    it('silently skips malformed entries (missing colons, wrong segment count)', async () => {
      mockFindCredentials.mockResolvedValue([
        { account: 'malformed-no-colons', password: 'pass' },
        { account: 'server1:onlytwoparts', password: 'pass' },
        { account: 'server1:db:user:extra', password: 'pass' },
        { account: 'server1:db:validuser', password: 'pass' },
      ]);

      const result = await manager.listCredentials('server1');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ serverId: 'server1', database: 'db', username: 'validuser' });
    });

    it('returns entry with correct structure: { serverId, database, username }', async () => {
      mockFindCredentials.mockResolvedValue([
        { account: 'myserver:production:john', password: 'supersecret' },
      ]);

      const result = await manager.listCredentials('myserver');

      expect(result).toHaveLength(1);
      const entry: CredentialEntry = result[0];
      expect(entry).toHaveProperty('serverId', 'myserver');
      expect(entry).toHaveProperty('database', 'production');
      expect(entry).toHaveProperty('username', 'john');
      expect(entry).not.toHaveProperty('password');
    });

    it('returns empty array when server has no matching credentials', async () => {
      mockFindCredentials.mockResolvedValue([
        { account: 'otherserver:db:user', password: 'pass' },
      ]);

      const result = await manager.listCredentials('server1');

      expect(result).toEqual([]);
    });
  });

  describe('deleteCredential()', () => {
    const mockDeletePassword = vi.mocked(keytar.deletePassword);

    it('returns true when credentials were successfully deleted', async () => {
      mockDeletePassword.mockResolvedValue(true);

      const result = await manager.deleteCredential('server1', 'mydb', 'alice');

      expect(result).toBe(true);
    });

    it('returns false when no credentials found to delete', async () => {
      mockDeletePassword.mockResolvedValue(false);

      const result = await manager.deleteCredential('server1', 'mydb', 'alice');

      expect(result).toBe(false);
    });

    it('calls keytar.deletePassword with correct service name and account key', async () => {
      mockDeletePassword.mockResolvedValue(true);

      await manager.deleteCredential('server1', 'production', 'admin');

      expect(mockDeletePassword).toHaveBeenCalledWith(
        'claris-odata-cli',
        'server1:production:admin'
      );
    });

    it('builds account key in format {serverId}:{database}:{username}', async () => {
      mockDeletePassword.mockResolvedValue(true);

      await manager.deleteCredential('myserver', 'contacts-db', 'john.doe');

      expect(mockDeletePassword).toHaveBeenCalledWith(
        'claris-odata-cli',
        'myserver:contacts-db:john.doe'
      );
    });

    it('calls keytar.deletePassword exactly once per invocation', async () => {
      mockDeletePassword.mockResolvedValue(true);

      await manager.deleteCredential('server1', 'db', 'user');

      expect(mockDeletePassword).toHaveBeenCalledTimes(1);
    });

    it('handles special characters in serverId, database, and username', async () => {
      mockDeletePassword.mockResolvedValue(true);

      await manager.deleteCredential('server-1.local', 'my_db', 'user@domain.com');

      expect(mockDeletePassword).toHaveBeenCalledWith(
        'claris-odata-cli',
        'server-1.local:my_db:user@domain.com'
      );
    });

    it('returns false for unknown serverId (credential not found)', async () => {
      mockDeletePassword.mockResolvedValue(false);

      const result = await manager.deleteCredential('unknown-server', 'db', 'user');

      expect(result).toBe(false);
    });

    it('returns false for wrong database (credential not found)', async () => {
      mockDeletePassword.mockResolvedValue(false);

      const result = await manager.deleteCredential('server1', 'wrong-db', 'alice');

      expect(result).toBe(false);
    });

    it('returns false for wrong username (credential not found)', async () => {
      mockDeletePassword.mockResolvedValue(false);

      const result = await manager.deleteCredential('server1', 'mydb', 'wrong-user');

      expect(result).toBe(false);
    });
  });

  describe('deleteCredentials() [deprecated — delegates to deleteCredential()]', () => {
    const mockDeletePassword = vi.mocked(keytar.deletePassword);

    it('returns true when credentials deleted (delegates to deleteCredential)', async () => {
      mockDeletePassword.mockResolvedValue(true);

      const result = await manager.deleteCredentials('server1', 'mydb', 'alice');

      expect(result).toBe(true);
      expect(mockDeletePassword).toHaveBeenCalledWith('claris-odata-cli', 'server1:mydb:alice');
    });

    it('returns false when credentials not found (delegates to deleteCredential)', async () => {
      mockDeletePassword.mockResolvedValue(false);

      const result = await manager.deleteCredentials('server1', 'mydb', 'alice');

      expect(result).toBe(false);
    });
  });
});
