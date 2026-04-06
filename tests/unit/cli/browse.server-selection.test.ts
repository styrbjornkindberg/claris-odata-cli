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

describe('BrowseCommand - server selection (CLA-1834)', () => {
  let processExitSpy: ReturnType<typeof vi.spyOn>;
  let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: number | string | null | undefined) => {
      throw new Error(`process.exit called with ${_code}`);
    });
    stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.clearAllMocks();

    // Default CredentialsManager mock — no stored creds, so resolveCredentials will use input/password mocks
    vi.mocked(CredentialsManager).mockImplementation(() => ({
      listCredentials: vi.fn().mockResolvedValue([]),
      getCredentials: vi.fn().mockResolvedValue(null),
      storeCredentials: vi.fn().mockResolvedValue(undefined),
    }));

    // Default input/password mocks so resolveCredentials prompt path doesn't hang
    const { input, password } = await import('@inquirer/prompts');
    vi.mocked(input).mockResolvedValue('default-value');
    vi.mocked(password).mockResolvedValue('default-pass');
  });

  afterEach(() => {
    processExitSpy.mockRestore();
    stdoutWriteSpy.mockRestore();
  });

  it('displays "No servers configured" message when no servers exist', async () => {
    const { select } = await import('@inquirer/prompts');
    const selectMock = vi.mocked(select);

    const cmd = new BrowseCommand({});
    vi.spyOn(cmd, 'isInteractiveTTY').mockReturnValue(true);

    // Configure ServerManager mock to return empty list
    vi.mocked(ServerManager).mockImplementation(() => ({
      listServers: vi.fn().mockReturnValue([]),
      addServer: vi.fn(),
      getServer: vi.fn(),
      removeServer: vi.fn(),
    }));

    const result = await cmd.execute();

    expect(result.success).toBe(true);
    expect(selectMock).not.toHaveBeenCalled();

    const output = stdoutWriteSpy.mock.calls.map((c) => c[0]).join('');
    expect(output).toContain('No servers configured');
    expect(output).toContain('fmo server add');
  });

  it('prompts with select() when servers are configured', async () => {
    const { select } = await import('@inquirer/prompts');
    const selectMock = vi.mocked(select);
    selectMock.mockResolvedValue('server-abc');

    const mockServers = [
      { id: 'server-abc', name: 'Production', host: 'fm.example.com', port: 443, secure: true },
      { id: 'server-def', name: 'Staging', host: 'staging.example.com', port: 443, secure: true },
    ];

    vi.mocked(ServerManager).mockImplementation(() => ({
      listServers: vi.fn().mockReturnValue(mockServers),
      addServer: vi.fn(),
      getServer: vi.fn(),
      removeServer: vi.fn(),
    }));

    const cmd = new BrowseCommand({});
    vi.spyOn(cmd, 'isInteractiveTTY').mockReturnValue(true);
    vi.spyOn(cmd, 'resolveCredentials').mockResolvedValue({
      serverId: 'server-abc',
      database: 'TestDB',
      username: 'testuser',
      password: 'testpass',
    });
    vi.spyOn(cmd, 'fetchDatabases').mockResolvedValue(['TestDB', 'OtherDB']);
    vi.spyOn(cmd, 'selectDatabase').mockResolvedValue('TestDB');
    vi.spyOn(cmd, 'fetchTables').mockResolvedValue(['Table1', 'Table2']);
    vi.spyOn(cmd, 'selectTable').mockResolvedValue('Table1');
    vi.spyOn(cmd, 'selectAction').mockResolvedValue('list-records');
    vi.spyOn(cmd, 'executeAction').mockResolvedValue({ success: true, data: [] });
    vi.spyOn(cmd, 'selectPostActionNavigation').mockResolvedValue('exit');
    vi.spyOn(cmd, 'selectPostActionNavigation').mockResolvedValue('exit');
    vi.spyOn(cmd, 'selectPostActionNavigation').mockResolvedValue('exit');

    const result = await cmd.execute();

    expect(selectMock).toHaveBeenCalledOnce();
    expect(selectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringMatching(/server/i),
        choices: expect.arrayContaining([
          expect.objectContaining({ value: 'server-abc', name: expect.stringContaining('Production') }),
          expect.objectContaining({ value: 'server-def', name: expect.stringContaining('Staging') }),
        ]),
      })
    );
    expect(result.success).toBe(true);
    expect(result.data).toEqual(expect.objectContaining({ serverId: 'server-abc' }));
  });

  it('returns selected server ID in result data', async () => {
    const { select } = await import('@inquirer/prompts');
    vi.mocked(select).mockResolvedValue('my-server-id');

    vi.mocked(ServerManager).mockImplementation(() => ({
      listServers: vi.fn().mockReturnValue([
        { id: 'my-server-id', name: 'My Server', host: 'myserver.com', port: 443, secure: true },
      ]),
      addServer: vi.fn(),
      getServer: vi.fn(),
      removeServer: vi.fn(),
    }));

    const cmd = new BrowseCommand({});
    vi.spyOn(cmd, 'isInteractiveTTY').mockReturnValue(true);
    vi.spyOn(cmd, 'resolveCredentials').mockResolvedValue({
      serverId: 'my-server-id',
      database: 'TestDB',
      username: 'testuser',
      password: 'testpass',
    });
    vi.spyOn(cmd, 'fetchDatabases').mockResolvedValue(['TestDB']);
    vi.spyOn(cmd, 'selectDatabase').mockResolvedValue('TestDB');
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
    expect((result.data as any).serverId).toBe('my-server-id');
  });

  it('displays server name and ID in choice label', async () => {
    const { select } = await import('@inquirer/prompts');
    vi.mocked(select).mockResolvedValue('srv-1');

    vi.mocked(ServerManager).mockImplementation(() => ({
      listServers: vi.fn().mockReturnValue([
        { id: 'srv-1', name: 'Acme FM', host: 'acme.fm', port: 443, secure: true },
      ]),
      addServer: vi.fn(),
      getServer: vi.fn(),
      removeServer: vi.fn(),
    }));

    const cmd = new BrowseCommand({});
    vi.spyOn(cmd, 'isInteractiveTTY').mockReturnValue(true);
    vi.spyOn(cmd, 'resolveCredentials').mockResolvedValue({
      serverId: 'srv-1',
      database: 'TestDB',
      username: 'testuser',
      password: 'testpass',
    });
    vi.spyOn(cmd, 'fetchDatabases').mockResolvedValue(['TestDB']);
    vi.spyOn(cmd, 'selectDatabase').mockResolvedValue('TestDB');
    vi.spyOn(cmd, 'fetchTables').mockResolvedValue(['Table1']);
    vi.spyOn(cmd, 'selectTable').mockResolvedValue('Table1');
    vi.spyOn(cmd, 'selectAction').mockResolvedValue('list-records');
    vi.spyOn(cmd, 'executeAction').mockResolvedValue({ success: true, data: [] });
    vi.spyOn(cmd, 'selectPostActionNavigation').mockResolvedValue('exit');
    vi.spyOn(cmd, 'selectPostActionNavigation').mockResolvedValue('exit');
    vi.spyOn(cmd, 'selectPostActionNavigation').mockResolvedValue('exit');

    await cmd.execute();

    const callArgs = vi.mocked(select).mock.calls[0][0];
    const choice = callArgs.choices[0];
    expect(choice.name).toContain('Acme FM');
    expect(choice.name).toContain('srv-1');
  });
});
