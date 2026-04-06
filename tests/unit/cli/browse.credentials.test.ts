/**
 * Unit Tests for BrowseCommand
 *
 * Tests TTY detection, non-interactive error handling, server selection,
 * credential resolution, and database selection.
 *
 * Acceptance scenarios:
 * 1. isInteractiveTTY() returns true when both stdin and stdout are TTYs
 * 2. isInteractiveTTY() returns false when stdin is not a TTY
 * 3. isInteractiveTTY() returns false when stdout is not a TTY
 * 4. isInteractiveTTY() returns false when neither is a TTY
 * 5. execute() exits with code 1 and prints error when not a TTY
 * 6. execute() displays message when no servers configured (CLA-1834)
 * 7. execute() prompts server selection when servers exist (CLA-1834)
 * 8. execute() returns selected server ID (CLA-1834)
 * 9. execute() uses stored credentials automatically if found (CLA-1835)
 * 10. execute() prompts for credentials if none stored (CLA-1835)
 * 11. execute() saves new credentials to keychain (CLA-1835)
 * 12. execute() does not leak password in result data (CLA-1835)
 * 13. fetchDatabases() returns list of databases from OData service document (CLA-1836)
 * 14. selectDatabase() displays select() with "Back" option (CLA-1836)
 * 15. execute() displays database list after credential resolution (CLA-1836)
 * 16. execute() returns selected database in result data (CLA-1836)
 *
 * @module tests/unit/cli/browse.test
 * @see CLA-1833, CLA-1834, CLA-1835, CLA-1836
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowseCommand } from '../../../src/cli/browse';
import { ServerManager } from '../../../src/config/servers';
import { CredentialsManager } from '../../../src/config/credentials';

vi.mock('@inquirer/prompts', () => ({
  select: vi.fn(),
  input: vi.fn(),
  password: vi.fn(),
}));

vi.mock('../../../src/config/credentials', () => {
  const mockListCredentials = vi.fn();
  const mockGetCredentials = vi.fn();
  const mockStoreCredentials = vi.fn();
  return {
    CredentialsManager: vi.fn().mockImplementation(() => ({
      listCredentials: mockListCredentials,
      getCredentials: mockGetCredentials,
      storeCredentials: mockStoreCredentials,
    })),
  };
});

vi.mock('../../../src/config/servers', () => {
  const mockListServers = vi.fn();
  return {
    ServerManager: vi.fn().mockImplementation(() => ({
      listServers: mockListServers,
    })),
    _mockListServers: mockListServers,
  };
});

// Helper to get the mocked listServers function
const getMockListServers = () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = vi.mocked(ServerManager) as any;
  return mod.mock.results[mod.mock.results.length - 1]?.value?.listServers as ReturnType<typeof vi.fn>;
};

describe('BrowseCommand - credential resolution (CLA-1835)', () => {
  let processExitSpy: ReturnType<typeof vi.spyOn>;
  let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;

  const mockServer = { id: 'srv-1', name: 'Prod', host: 'fm.example.com', port: 443, secure: true };

  beforeEach(() => {
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: number | string | null | undefined) => {
      throw new Error(`process.exit called with ${_code}`);
    });
    stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.clearAllMocks();

    vi.mocked(ServerManager).mockImplementation(() => ({
      listServers: vi.fn().mockReturnValue([mockServer]),
      addServer: vi.fn(),
      getServer: vi.fn(),
      removeServer: vi.fn(),
    }));
  });

  afterEach(() => {
    processExitSpy.mockRestore();
    stdoutWriteSpy.mockRestore();
  });

  it('uses stored credentials automatically when found in keychain', async () => {
    const { select } = await import('@inquirer/prompts');
    vi.mocked(select).mockResolvedValue('srv-1');

    vi.mocked(CredentialsManager).mockImplementation(() => ({
      listCredentials: vi.fn().mockResolvedValue([{ serverId: 'srv-1', database: 'MyDB', username: 'alice' }]),
      getCredentials: vi.fn().mockResolvedValue('secret'),
      storeCredentials: vi.fn().mockResolvedValue(undefined),
    }));

    const cmd = new BrowseCommand({});
    vi.spyOn(cmd, 'isInteractiveTTY').mockReturnValue(true);
    vi.spyOn(cmd, 'fetchDatabases').mockResolvedValue(['MyDB']);
    vi.spyOn(cmd, 'selectDatabase').mockResolvedValue('MyDB');
    vi.spyOn(cmd, 'fetchTables').mockResolvedValue(['Table1']);
    vi.spyOn(cmd, 'selectTable').mockResolvedValue('Table1');
    vi.spyOn(cmd, 'selectAction').mockResolvedValue('list-records');
    vi.spyOn(cmd, 'executeAction').mockResolvedValue({ success: true, data: [] });
    vi.spyOn(cmd, 'selectPostActionNavigation').mockResolvedValue('exit');
    vi.spyOn(cmd, 'selectPostActionNavigation').mockResolvedValue('exit');
    vi.spyOn(cmd, 'selectPostActionNavigation').mockResolvedValue('exit');

    const result = await cmd.execute();

    expect(result.success).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = result.data as any;
    expect(data.serverId).toBe('srv-1');
    expect(data.database).toBe('MyDB');
    expect(data.username).toBe('alice');
  });

  it('does not leak password in result data', async () => {
    const { select } = await import('@inquirer/prompts');
    vi.mocked(select).mockResolvedValue('srv-1');

    vi.mocked(CredentialsManager).mockImplementation(() => ({
      listCredentials: vi.fn().mockResolvedValue([{ serverId: 'srv-1', database: 'MyDB', username: 'alice' }]),
      getCredentials: vi.fn().mockResolvedValue('supersecret'),
      storeCredentials: vi.fn().mockResolvedValue(undefined),
    }));

    const cmd = new BrowseCommand({});
    vi.spyOn(cmd, 'isInteractiveTTY').mockReturnValue(true);
    vi.spyOn(cmd, 'fetchDatabases').mockResolvedValue(['MyDB']);
    vi.spyOn(cmd, 'selectDatabase').mockResolvedValue('MyDB');
    vi.spyOn(cmd, 'fetchTables').mockResolvedValue(['Table1']);
    vi.spyOn(cmd, 'selectTable').mockResolvedValue('Table1');
    vi.spyOn(cmd, 'selectAction').mockResolvedValue('list-records');
    vi.spyOn(cmd, 'executeAction').mockResolvedValue({ success: true, data: [] });
    vi.spyOn(cmd, 'selectPostActionNavigation').mockResolvedValue('exit');
    vi.spyOn(cmd, 'selectPostActionNavigation').mockResolvedValue('exit');
    vi.spyOn(cmd, 'selectPostActionNavigation').mockResolvedValue('exit');

    const result = await cmd.execute();

    expect(result.success).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result.data as any).password).toBeUndefined();
  });

  it('prompts for database, username, password when no credentials stored', async () => {
    const { select, input, password } = await import('@inquirer/prompts');
    vi.mocked(select).mockResolvedValue('srv-1');
    vi.mocked(input)
      .mockResolvedValueOnce('MyDB')
      .mockResolvedValueOnce('bob');
    vi.mocked(password).mockResolvedValue('p@ssw0rd');

    vi.mocked(CredentialsManager).mockImplementation(() => ({
      listCredentials: vi.fn().mockResolvedValue([]),
      getCredentials: vi.fn().mockResolvedValue(null),
      storeCredentials: vi.fn().mockResolvedValue(undefined),
    }));

    const cmd = new BrowseCommand({});
    vi.spyOn(cmd, 'isInteractiveTTY').mockReturnValue(true);
    vi.spyOn(cmd, 'fetchDatabases').mockResolvedValue(['MyDB']);
    vi.spyOn(cmd, 'selectDatabase').mockResolvedValue('MyDB');
    vi.spyOn(cmd, 'fetchTables').mockResolvedValue(['Table1']);
    vi.spyOn(cmd, 'selectTable').mockResolvedValue('Table1');
    vi.spyOn(cmd, 'selectAction').mockResolvedValue('list-records');
    vi.spyOn(cmd, 'executeAction').mockResolvedValue({ success: true, data: [] });
    vi.spyOn(cmd, 'selectPostActionNavigation').mockResolvedValue('exit');
    vi.spyOn(cmd, 'selectPostActionNavigation').mockResolvedValue('exit');
    vi.spyOn(cmd, 'selectPostActionNavigation').mockResolvedValue('exit');

    const result = await cmd.execute();

    expect(result.success).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = result.data as any;
    expect(data.database).toBe('MyDB');
    expect(data.username).toBe('bob');
    expect(data.password).toBeUndefined(); // not leaked
  });

  it('saves new credentials to keychain when prompted', async () => {
    const { select, input, password } = await import('@inquirer/prompts');
    vi.mocked(select).mockResolvedValue('srv-1');
    vi.mocked(input)
      .mockResolvedValueOnce('NewDB')
      .mockResolvedValueOnce('carol');
    vi.mocked(password).mockResolvedValue('mypassword');

    const mockStoreCredentials = vi.fn().mockResolvedValue(undefined);

    vi.mocked(CredentialsManager).mockImplementation(() => ({
      listCredentials: vi.fn().mockResolvedValue([]),
      getCredentials: vi.fn().mockResolvedValue(null),
      storeCredentials: mockStoreCredentials,
    }));

    const cmd = new BrowseCommand({});
    vi.spyOn(cmd, 'isInteractiveTTY').mockReturnValue(true);
    vi.spyOn(cmd, 'fetchDatabases').mockResolvedValue(['NewDB']);
    vi.spyOn(cmd, 'selectDatabase').mockResolvedValue('NewDB');
    vi.spyOn(cmd, 'fetchTables').mockResolvedValue(['Table1']);
    vi.spyOn(cmd, 'selectTable').mockResolvedValue('Table1');
    vi.spyOn(cmd, 'selectAction').mockResolvedValue('list-records');
    vi.spyOn(cmd, 'executeAction').mockResolvedValue({ success: true, data: [] });
    vi.spyOn(cmd, 'selectPostActionNavigation').mockResolvedValue('exit');
    vi.spyOn(cmd, 'selectPostActionNavigation').mockResolvedValue('exit');
    vi.spyOn(cmd, 'selectPostActionNavigation').mockResolvedValue('exit');

    await cmd.execute();

    expect(mockStoreCredentials).toHaveBeenCalledWith('srv-1', 'NewDB', 'carol', 'mypassword');
  });

  it('uses password() from @inquirer/prompts for the password field', async () => {
    const { select, input, password } = await import('@inquirer/prompts');
    vi.mocked(select).mockResolvedValue('srv-1');
    vi.mocked(input)
      .mockResolvedValueOnce('DB1')
      .mockResolvedValueOnce('user1');
    const passwordMock = vi.mocked(password);
    passwordMock.mockResolvedValue('pass');

    vi.mocked(CredentialsManager).mockImplementation(() => ({
      listCredentials: vi.fn().mockResolvedValue([]),
      getCredentials: vi.fn().mockResolvedValue(null),
      storeCredentials: vi.fn().mockResolvedValue(undefined),
    }));

    const cmd = new BrowseCommand({});
    vi.spyOn(cmd, 'isInteractiveTTY').mockReturnValue(true);
    vi.spyOn(cmd, 'fetchDatabases').mockResolvedValue(['DB1']);
    vi.spyOn(cmd, 'selectDatabase').mockResolvedValue('DB1');
    vi.spyOn(cmd, 'fetchTables').mockResolvedValue(['Table1']);
    vi.spyOn(cmd, 'selectTable').mockResolvedValue('Table1');
    vi.spyOn(cmd, 'selectAction').mockResolvedValue('list-records');
    vi.spyOn(cmd, 'executeAction').mockResolvedValue({ success: true, data: [] });
    vi.spyOn(cmd, 'selectPostActionNavigation').mockResolvedValue('exit');
    vi.spyOn(cmd, 'selectPostActionNavigation').mockResolvedValue('exit');
    vi.spyOn(cmd, 'selectPostActionNavigation').mockResolvedValue('exit');

    await cmd.execute();

    expect(passwordMock).toHaveBeenCalledOnce();
  });

  it('handles keychain errors gracefully during listCredentials', async () => {
    const { select, input, password } = await import('@inquirer/prompts');
    vi.mocked(select).mockResolvedValue('srv-1');
    vi.mocked(input)
      .mockResolvedValueOnce('FallbackDB')
      .mockResolvedValueOnce('fallback_user');
    vi.mocked(password).mockResolvedValue('fallback_pass');

    vi.mocked(CredentialsManager).mockImplementation(() => ({
      listCredentials: vi.fn().mockRejectedValue(new Error('Keychain unavailable')),
      getCredentials: vi.fn().mockResolvedValue(null),
      storeCredentials: vi.fn().mockResolvedValue(undefined),
    }));

    const cmd = new BrowseCommand({});
    vi.spyOn(cmd, 'isInteractiveTTY').mockReturnValue(true);
    vi.spyOn(cmd, 'fetchDatabases').mockResolvedValue(['FallbackDB']);
    vi.spyOn(cmd, 'selectDatabase').mockResolvedValue('FallbackDB');
    vi.spyOn(cmd, 'fetchTables').mockResolvedValue(['Table1']);
    vi.spyOn(cmd, 'selectTable').mockResolvedValue('Table1');
    vi.spyOn(cmd, 'selectAction').mockResolvedValue('list-records');
    vi.spyOn(cmd, 'executeAction').mockResolvedValue({ success: true, data: [] });
    vi.spyOn(cmd, 'selectPostActionNavigation').mockResolvedValue('exit');
    vi.spyOn(cmd, 'selectPostActionNavigation').mockResolvedValue('exit');
    vi.spyOn(cmd, 'selectPostActionNavigation').mockResolvedValue('exit');

    // Should not throw — falls back to prompting
    const result = await cmd.execute();
    expect(result.success).toBe(true);
  });

  it('returns serverId, database, username in result data', async () => {
    const { select } = await import('@inquirer/prompts');
    vi.mocked(select).mockResolvedValue('srv-1');

    vi.mocked(CredentialsManager).mockImplementation(() => ({
      listCredentials: vi.fn().mockResolvedValue([{ serverId: 'srv-1', database: 'ProdDB', username: 'admin' }]),
      getCredentials: vi.fn().mockResolvedValue('adminpass'),
      storeCredentials: vi.fn().mockResolvedValue(undefined),
    }));

    const cmd = new BrowseCommand({});
    vi.spyOn(cmd, 'isInteractiveTTY').mockReturnValue(true);
    vi.spyOn(cmd, 'fetchDatabases').mockResolvedValue(['ProdDB']);
    vi.spyOn(cmd, 'selectDatabase').mockResolvedValue('ProdDB');
    vi.spyOn(cmd, 'fetchTables').mockResolvedValue(['Table1']);
    vi.spyOn(cmd, 'selectTable').mockResolvedValue('Table1');
    vi.spyOn(cmd, 'selectAction').mockResolvedValue('list-records');
    vi.spyOn(cmd, 'executeAction').mockResolvedValue({ success: true, data: [] });
    vi.spyOn(cmd, 'selectPostActionNavigation').mockResolvedValue('exit');
    vi.spyOn(cmd, 'selectPostActionNavigation').mockResolvedValue('exit');
    vi.spyOn(cmd, 'selectPostActionNavigation').mockResolvedValue('exit');

    const result = await cmd.execute();

    expect(result.success).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = result.data as any;
    expect(data.serverId).toBe('srv-1');
    expect(data.database).toBe('ProdDB');
    expect(data.username).toBe('admin');
  });
});

// ============================================================================
// T014 — Database selection level (CLA-1836)
// ============================================================================
