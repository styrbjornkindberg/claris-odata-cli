/**
 * Tests for CredentialsManager
 */

import { CredentialsManager, CredentialEntry } from '../../src/config/credentials';

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
});
