/**
 * Unit Tests for Credentials CLI Command
 *
 * Tests add, list, and remove actions for the CredentialsCommand.
 *
 * @module tests/unit/cli/credentials.test
 * @see specs/008-browse-credentials/contracts/cli-commands.md
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CredentialsCommand } from '../../../src/cli/credentials';
import { ServerManager } from '../../../src/config/servers';
import { CredentialsManager } from '../../../src/config/credentials';

// Mock ServerManager
vi.mock('../../../src/config/servers', () => ({
  ServerManager: vi.fn().mockImplementation(() => ({
    getServer: vi.fn(),
    listServers: vi.fn().mockReturnValue([]),
    addServer: vi.fn(),
    removeServer: vi.fn(),
  })),
  serverStore: {
    getAll: vi.fn().mockReturnValue([]),
    set: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
    has: vi.fn(),
  },
}));

// Mock CredentialsManager
vi.mock('../../../src/config/credentials', () => ({
  CredentialsManager: vi.fn().mockImplementation(() => ({
    listCredentials: vi.fn(),
    storeCredentials: vi.fn().mockResolvedValue(undefined),
    deleteCredentials: vi.fn().mockResolvedValue(true),
    getCredentials: vi.fn().mockResolvedValue(null),
    hasCredentials: vi.fn().mockResolvedValue(false),
  })),
}));

const mockGetServer = vi.fn();
const mockListCredentials = vi.fn();
const mockStoreCredentials = vi.fn().mockResolvedValue(undefined);
const mockDeleteCredentials = vi.fn().mockResolvedValue(true);

const DEFAULT_SERVER = { id: 'dev', name: 'dev', host: 'fms.local', port: 443, secure: true };

function setupMocks({
  server = DEFAULT_SERVER,
  noServer = false,
  credentials = [] as Array<{ serverId: string; database: string; username: string }>,
  deleteResult = true,
}: {
  server?: object;
  noServer?: boolean;
  credentials?: Array<{ serverId: string; database: string; username: string }>;
  deleteResult?: boolean;
} = {}) {
  const resolvedServer = noServer ? undefined : server;
  vi.mocked(ServerManager).mockImplementation(() => ({
    getServer: mockGetServer.mockReturnValue(resolvedServer),
    listServers: vi.fn().mockReturnValue([]),
    addServer: vi.fn(),
    removeServer: vi.fn(),
  }));

  vi.mocked(CredentialsManager).mockImplementation(() => ({
    listCredentials: mockListCredentials.mockResolvedValue(credentials),
    storeCredentials: mockStoreCredentials,
    deleteCredentials: mockDeleteCredentials.mockResolvedValue(deleteResult),
    getCredentials: vi.fn().mockResolvedValue(null),
    hasCredentials: vi.fn().mockResolvedValue(false),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── LIST ─────────────────────────────────────────────────────────────────────

describe('CredentialsCommand — list action (T007)', () => {
  it('returns success with entries in text mode', async () => {
    setupMocks({
      credentials: [
        { serverId: 'dev', database: 'contacts', username: 'admin' },
        { serverId: 'dev', database: 'inventory', username: 'readonly' },
      ],
    });
    const cmd = new CredentialsCommand({ action: 'list', serverId: 'dev' });
    const result = await cmd.execute();
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data['serverName']).toBe('dev');
    const entries = data['entries'] as Array<{ database: string; username: string }>;
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ database: 'contacts', username: 'admin' });
    expect(entries[0]).not.toHaveProperty('serverId');
    expect(entries[1]).toMatchObject({ database: 'inventory', username: 'readonly' });
  });

  it('formats text output correctly with headers and indentation', async () => {
    setupMocks({
      credentials: [
        { serverId: 'dev', database: 'contacts', username: 'admin' },
        { serverId: 'dev', database: 'inventory', username: 'readonly' },
      ],
    });
    const cmd = new CredentialsCommand({ action: 'list', serverId: 'dev' });
    const result = await cmd.execute();
    const output = cmd.formatOutput(result);
    expect(output).toContain('Credentials for server "dev":');
    expect(output).toContain('Database: contacts');
    expect(output).toContain('Username: admin');
    expect(output).toContain('Database: inventory');
    expect(output).toContain('Username: readonly');
  });

  it('formats JSON output as array of {database, username}', async () => {
    setupMocks({
      credentials: [
        { serverId: 'dev', database: 'contacts', username: 'admin' },
        { serverId: 'dev', database: 'inventory', username: 'readonly' },
      ],
    });
    const cmd = new CredentialsCommand({ action: 'list', serverId: 'dev', output: 'json' });
    const result = await cmd.execute();
    const output = cmd.formatOutput(result);
    const parsed = JSON.parse(output) as Array<{ database: string; username: string }>;
    expect(parsed).toEqual([
      { database: 'contacts', username: 'admin' },
      { database: 'inventory', username: 'readonly' },
    ]);
    // No passwords, no serverId
    parsed.forEach((e) => {
      expect(e).not.toHaveProperty('password');
      expect(e).not.toHaveProperty('serverId');
    });
  });

  it('returns empty message when no credentials stored (text)', async () => {
    setupMocks({ credentials: [] });
    const cmd = new CredentialsCommand({ action: 'list', serverId: 'dev' });
    const result = await cmd.execute();
    expect(result.success).toBe(true);
    const output = cmd.formatOutput(result);
    expect(output).toBe('No credentials stored for server "dev".');
  });

  it('returns error when server not found', async () => {
    setupMocks({ noServer: true });
    const cmd = new CredentialsCommand({ action: 'list', serverId: 'nonexistent' });
    const result = await cmd.execute();
    expect(result.success).toBe(false);
    expect(result.error).toContain('Server not found: nonexistent');
  });

  it('returns error when serverId is empty', async () => {
    const cmd = new CredentialsCommand({ action: 'list', serverId: '' });
    const result = await cmd.execute();
    expect(result.success).toBe(false);
    expect(result.error).toContain('Server ID is required');
  });
});

// ─── ADD ─────────────────────────────────────────────────────────────────────

describe('CredentialsCommand — add action', () => {
  it('stores credentials and returns success message', async () => {
    setupMocks();
    const cmd = new CredentialsCommand({
      action: 'add',
      serverId: 'dev',
      database: 'contacts',
      username: 'admin',
      password: 'secret',
    });
    const result = await cmd.execute();
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data['message']).toContain('Credentials stored for server "dev"');
    expect(data['message']).toContain('contacts');
    expect(data['message']).toContain('admin');
  });

  it('formats text output correctly', async () => {
    setupMocks();
    const cmd = new CredentialsCommand({
      action: 'add',
      serverId: 'dev',
      database: 'contacts',
      username: 'admin',
      password: 'secret',
    });
    const result = await cmd.execute();
    const output = cmd.formatOutput(result);
    expect(output).toContain('Credentials stored for server "dev"');
    expect(output).toContain('contacts');
    expect(output).toContain('admin');
  });

  it('formats JSON output with serverId, database, username, message', async () => {
    setupMocks();
    const cmd = new CredentialsCommand({
      action: 'add',
      serverId: 'dev',
      database: 'contacts',
      username: 'admin',
      password: 'secret',
      output: 'json',
    });
    const result = await cmd.execute();
    const output = cmd.formatOutput(result);
    const parsed = JSON.parse(output) as Record<string, string>;
    expect(parsed['serverId']).toBe('dev');
    expect(parsed['database']).toBe('contacts');
    expect(parsed['username']).toBe('admin');
    expect(typeof parsed['message']).toBe('string');
  });

  it('returns error when server not found', async () => {
    setupMocks({ noServer: true });
    const cmd = new CredentialsCommand({
      action: 'add',
      serverId: 'nonexistent',
      database: 'contacts',
      username: 'admin',
      password: 'secret',
    });
    const result = await cmd.execute();
    expect(result.success).toBe(false);
    expect(result.error).toContain('Server not found: nonexistent');
  });

  it('returns error when database is missing', async () => {
    const cmd = new CredentialsCommand({
      action: 'add',
      serverId: 'dev',
      username: 'admin',
      password: 'secret',
    });
    const result = await cmd.execute();
    expect(result.success).toBe(false);
    expect(result.error).toContain('Database name is required');
  });

  it('returns error when username is missing', async () => {
    const cmd = new CredentialsCommand({
      action: 'add',
      serverId: 'dev',
      database: 'contacts',
      password: 'secret',
    });
    const result = await cmd.execute();
    expect(result.success).toBe(false);
    expect(result.error).toContain('Username is required');
  });
});

// ─── REMOVE ───────────────────────────────────────────────────────────────────

describe('CredentialsCommand — remove action', () => {
  it('removes credentials and returns success message', async () => {
    setupMocks({ deleteResult: true });
    const cmd = new CredentialsCommand({
      action: 'remove',
      serverId: 'dev',
      database: 'contacts',
      username: 'admin',
    });
    const result = await cmd.execute();
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data['message']).toContain('Credentials removed for server "dev"');
    expect(data['message']).toContain('contacts');
    expect(data['message']).toContain('admin');
  });

  it('formats text output correctly', async () => {
    setupMocks({ deleteResult: true });
    const cmd = new CredentialsCommand({
      action: 'remove',
      serverId: 'dev',
      database: 'contacts',
      username: 'admin',
    });
    const result = await cmd.execute();
    const output = cmd.formatOutput(result);
    expect(output).toContain('Credentials removed for server "dev"');
    expect(output).toContain('contacts');
    expect(output).toContain('admin');
  });

  it('returns error when credentials not found', async () => {
    setupMocks({ deleteResult: false });
    const cmd = new CredentialsCommand({
      action: 'remove',
      serverId: 'dev',
      database: 'contacts',
      username: 'admin',
    });
    const result = await cmd.execute();
    expect(result.success).toBe(false);
    expect(result.error).toContain('No credentials found');
  });

  it('returns error when server not found', async () => {
    setupMocks({ noServer: true });
    const cmd = new CredentialsCommand({
      action: 'remove',
      serverId: 'nonexistent',
      database: 'contacts',
      username: 'admin',
    });
    const result = await cmd.execute();
    expect(result.success).toBe(false);
    expect(result.error).toContain('Server not found: nonexistent');
  });

  it('returns error when database is missing', async () => {
    const cmd = new CredentialsCommand({
      action: 'remove',
      serverId: 'dev',
      username: 'admin',
    });
    const result = await cmd.execute();
    expect(result.success).toBe(false);
    expect(result.error).toContain('Database name is required');
  });
});
