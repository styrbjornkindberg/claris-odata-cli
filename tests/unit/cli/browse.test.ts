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

describe('BrowseCommand - TTY detection (CLA-1833)', () => {
  describe('isInteractiveTTY()', () => {
    let stdinIsTTYDescriptor: PropertyDescriptor | undefined;
    let stdoutIsTTYDescriptor: PropertyDescriptor | undefined;

    beforeEach(() => {
      // Save original property descriptors
      stdinIsTTYDescriptor = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
      stdoutIsTTYDescriptor = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
    });

    afterEach(() => {
      // Restore original property descriptors
      if (stdinIsTTYDescriptor !== undefined) {
        Object.defineProperty(process.stdin, 'isTTY', stdinIsTTYDescriptor);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (process.stdin as any).isTTY;
      }

      if (stdoutIsTTYDescriptor !== undefined) {
        Object.defineProperty(process.stdout, 'isTTY', stdoutIsTTYDescriptor);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (process.stdout as any).isTTY;
      }
    });

    it('returns true when both stdin and stdout are TTYs', () => {
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
      Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });

      const cmd = new BrowseCommand({});
      expect(cmd.isInteractiveTTY()).toBe(true);
    });

    it('returns false when stdin is not a TTY', () => {
      Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
      Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });

      const cmd = new BrowseCommand({});
      expect(cmd.isInteractiveTTY()).toBe(false);
    });

    it('returns false when stdout is not a TTY', () => {
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
      Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });

      const cmd = new BrowseCommand({});
      expect(cmd.isInteractiveTTY()).toBe(false);
    });

    it('returns false when neither stdin nor stdout is a TTY', () => {
      Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
      Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });

      const cmd = new BrowseCommand({});
      expect(cmd.isInteractiveTTY()).toBe(false);
    });

    it('returns false when stdin.isTTY is undefined (piped)', () => {
      Object.defineProperty(process.stdin, 'isTTY', { value: undefined, configurable: true });
      Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });

      const cmd = new BrowseCommand({});
      expect(cmd.isInteractiveTTY()).toBe(false);
    });

    it('returns false when stdout.isTTY is undefined (piped)', () => {
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
      Object.defineProperty(process.stdout, 'isTTY', { value: undefined, configurable: true });

      const cmd = new BrowseCommand({});
      expect(cmd.isInteractiveTTY()).toBe(false);
    });
  });

  describe('execute() - non-TTY error handling', () => {
    let processExitSpy: ReturnType<typeof vi.spyOn>;
    let stderrWriteSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      processExitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: number | string | null | undefined) => {
        throw new Error(`process.exit called with ${_code}`);
      });
      stderrWriteSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

      // Ensure ServerManager returns empty list by default (avoids hitting select())
      vi.mocked(ServerManager).mockImplementation(() => ({
        listServers: vi.fn().mockReturnValue([]),
        addServer: vi.fn(),
        getServer: vi.fn(),
        removeServer: vi.fn(),
      }));
    });

    afterEach(() => {
      processExitSpy.mockRestore();
      stderrWriteSpy.mockRestore();
    });

    it('exits with code 1 and prints error when not in a TTY', async () => {
      const cmd = new BrowseCommand({});

      // Mock isInteractiveTTY to return false
      vi.spyOn(cmd, 'isInteractiveTTY').mockReturnValue(false);

      await expect(cmd.execute()).rejects.toThrow('process.exit called with 1');

      expect(stderrWriteSpy).toHaveBeenCalledWith(
        expect.stringContaining('browse command requires an interactive terminal')
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('does not exit when running in a TTY', async () => {
      const cmd = new BrowseCommand({});

      // Mock isInteractiveTTY to return true
      vi.spyOn(cmd, 'isInteractiveTTY').mockReturnValue(true);

      const result = await cmd.execute();

      expect(processExitSpy).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('error message mentions TTY requirement', async () => {
      const cmd = new BrowseCommand({});
      vi.spyOn(cmd, 'isInteractiveTTY').mockReturnValue(false);

      await expect(cmd.execute()).rejects.toThrow();

      const errorOutput = stderrWriteSpy.mock.calls.map((c) => c[0]).join('');
      expect(errorOutput).toContain('TTY');
      expect(errorOutput).toContain('non-interactive');
    });
  });
});

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

    const result = await cmd.execute();

    expect(selectMock).toHaveBeenCalledOnce();
    expect(selectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('server'),
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

    await cmd.execute();

    const callArgs = vi.mocked(select).mock.calls[0][0];
    const choice = callArgs.choices[0];
    expect(choice.name).toContain('Acme FM');
    expect(choice.name).toContain('srv-1');
  });
});

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

describe('BrowseCommand - database selection (CLA-1836)', () => {
  let processExitSpy: ReturnType<typeof vi.spyOn>;
  let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;

  const mockServer = { id: 'srv-1', name: 'Prod', host: 'fm.example.com', port: 443, secure: true };
  const mockCredentials = {
    serverId: 'srv-1',
    database: 'MyDB',
    username: 'alice',
    password: 'secret',
  };

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

    vi.mocked(CredentialsManager).mockImplementation(() => ({
      listCredentials: vi.fn().mockResolvedValue([{ serverId: 'srv-1', database: 'MyDB', username: 'alice' }]),
      getCredentials: vi.fn().mockResolvedValue('secret'),
      storeCredentials: vi.fn().mockResolvedValue(undefined),
    }));
  });

  afterEach(() => {
    processExitSpy.mockRestore();
    stdoutWriteSpy.mockRestore();
  });

  describe('fetchDatabases()', () => {
    it('extracts database names from OData service document', async () => {
      const cmd = new BrowseCommand({});

      // Mock axios.get to return a service document
      const axiosMock = await import('axios');
      vi.spyOn(axiosMock.default, 'get').mockResolvedValue({
        data: {
          value: [
            { name: 'Sales', kind: 'EntityContainer', url: 'Sales' },
            { name: 'HR', kind: 'EntityContainer', url: 'HR' },
          ],
        },
      });

      const result = await cmd.fetchDatabases(mockServer, mockCredentials);

      expect(result).toEqual(['Sales', 'HR']);
    });

    it('returns empty array when service document has no entries', async () => {
      const cmd = new BrowseCommand({});

      const axiosMock = await import('axios');
      vi.spyOn(axiosMock.default, 'get').mockResolvedValue({
        data: { value: [] },
      });

      const result = await cmd.fetchDatabases(mockServer, mockCredentials);

      expect(result).toEqual([]);
    });

    it('throws on network/connection error', async () => {
      const cmd = new BrowseCommand({});

      const axiosMock = await import('axios');
      vi.spyOn(axiosMock.default, 'get').mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(cmd.fetchDatabases(mockServer, mockCredentials)).rejects.toThrow('ECONNREFUSED');
    });

    it('throws on auth error (401)', async () => {
      const cmd = new BrowseCommand({});

      const axiosMock = await import('axios');
      vi.spyOn(axiosMock.default, 'get').mockRejectedValue(new Error('Request failed with status code 401'));

      await expect(cmd.fetchDatabases(mockServer, mockCredentials)).rejects.toThrow('401');
    });

    it('uses Basic auth header with base64 encoded credentials', async () => {
      const cmd = new BrowseCommand({});

      const axiosMock = await import('axios');
      const getSpy = vi.spyOn(axiosMock.default, 'get').mockResolvedValue({
        data: { value: [] },
      });

      await cmd.fetchDatabases(mockServer, mockCredentials);

      const callArgs = getSpy.mock.calls[0];
      const headers = (callArgs[1] as { headers?: Record<string, string> })?.headers ?? {};
      const expectedToken = Buffer.from(`alice:secret`).toString('base64');
      expect(headers['Authorization']).toBe(`Basic ${expectedToken}`);
    });

    it('calls the /fmi/odata/v4 endpoint on the server', async () => {
      const cmd = new BrowseCommand({});

      const axiosMock = await import('axios');
      const getSpy = vi.spyOn(axiosMock.default, 'get').mockResolvedValue({
        data: { value: [] },
      });

      await cmd.fetchDatabases(mockServer, mockCredentials);

      const url = getSpy.mock.calls[0][0];
      expect(url).toContain('/fmi/odata/v4');
      expect(url).toContain('fm.example.com');
    });
  });

  describe('selectDatabase()', () => {
    it('calls select() with database choices and a Back option', async () => {
      const { select } = await import('@inquirer/prompts');
      vi.mocked(select).mockResolvedValue('SalesDB');

      const cmd = new BrowseCommand({});
      const result = await cmd.selectDatabase(['SalesDB', 'HumanResources']);

      expect(vi.mocked(select)).toHaveBeenCalledOnce();
      const callArgs = vi.mocked(select).mock.calls[0][0];
      expect(callArgs.choices).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ value: 'SalesDB' }),
          expect.objectContaining({ value: 'HumanResources' }),
        ])
      );
      // Should include a "Back" option
      expect(callArgs.choices).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: expect.stringContaining('Back') }),
        ])
      );
      expect(result).toBe('SalesDB');
    });

    it('returns null when user chooses Back', async () => {
      const { select } = await import('@inquirer/prompts');
      // Simulate user choosing the Back value
      vi.mocked(select).mockResolvedValue('__back__');

      const cmd = new BrowseCommand({});
      const result = await cmd.selectDatabase(['SalesDB']);

      expect(result).toBeNull();
    });

    it('returns the selected database name', async () => {
      const { select } = await import('@inquirer/prompts');
      vi.mocked(select).mockResolvedValue('HumanResources');

      const cmd = new BrowseCommand({});
      const result = await cmd.selectDatabase(['SalesDB', 'HumanResources']);

      expect(result).toBe('HumanResources');
    });
  });

  describe('execute() - database selection integration', () => {
    it('fetches databases after credential resolution', async () => {
      const { select } = await import('@inquirer/prompts');
      vi.mocked(select).mockResolvedValue('srv-1');

      const cmd = new BrowseCommand({});
      vi.spyOn(cmd, 'isInteractiveTTY').mockReturnValue(true);
      vi.spyOn(cmd, 'resolveCredentials').mockResolvedValue(mockCredentials);
      const fetchSpy = vi.spyOn(cmd, 'fetchDatabases').mockResolvedValue(['Sales', 'HR']);
      vi.spyOn(cmd, 'selectDatabase').mockResolvedValue('Sales');
      vi.spyOn(cmd, 'fetchTables').mockResolvedValue(['Contacts', 'Orders']);
      vi.spyOn(cmd, 'selectTable').mockResolvedValue('Contacts');

      await cmd.execute();

      expect(fetchSpy).toHaveBeenCalledOnce();
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ host: mockServer.host }),
        mockCredentials
      );
    });

    it('returns selected database in result data', async () => {
      const { select } = await import('@inquirer/prompts');
      vi.mocked(select).mockResolvedValue('srv-1');

      const cmd = new BrowseCommand({});
      vi.spyOn(cmd, 'isInteractiveTTY').mockReturnValue(true);
      vi.spyOn(cmd, 'resolveCredentials').mockResolvedValue(mockCredentials);
      vi.spyOn(cmd, 'fetchDatabases').mockResolvedValue(['Sales', 'HR']);
      vi.spyOn(cmd, 'selectDatabase').mockResolvedValue('Sales');
      vi.spyOn(cmd, 'fetchTables').mockResolvedValue(['Contacts', 'Orders']);
      vi.spyOn(cmd, 'selectTable').mockResolvedValue('Contacts');

      const result = await cmd.execute();

      expect(result.success).toBe(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((result.data as any).database).toBe('Sales');
    });

    it('displays message and goes back when no databases found', async () => {
      const { select } = await import('@inquirer/prompts');
      // First call: server selection; second call: error action menu (back)
      vi.mocked(select)
        .mockResolvedValueOnce('srv-1')   // server selection
        .mockResolvedValueOnce('back');   // "back" action when no databases

      const cmd = new BrowseCommand({});
      vi.spyOn(cmd, 'isInteractiveTTY').mockReturnValue(true);
      vi.spyOn(cmd, 'resolveCredentials').mockResolvedValue(mockCredentials);
      vi.spyOn(cmd, 'fetchDatabases').mockResolvedValue([]);

      // After going back to server selection, we need server selection to not loop forever
      // Re-mock select to return back again at server selection level would loop;
      // instead we just verify the behavior up to returning to server loop.
      // We'll verify the no-databases message was written.

      // Since the loop goes back to server selection and select would be called again,
      // make the third call hang (or just let it resolve to something that exits)
      // Actually, test the message display by checking the output and ensuring
      // selectDatabase is NOT called (empty list skips it):
      const selectDbSpy = vi.spyOn(cmd, 'selectDatabase');

      // The execute() will loop back to server selection after "back"; to prevent infinite loop
      // make the second server selection reject
      vi.mocked(select)
        .mockResolvedValueOnce('srv-1')   // server selection
        .mockResolvedValueOnce('back')    // "back to server selection" when no dbs
        .mockRejectedValueOnce(new Error('Cancelled')); // simulate user exiting

      await expect(cmd.execute()).rejects.toThrow('Cancelled');

      const output = stdoutWriteSpy.mock.calls.map((c) => c[0]).join('');
      expect(output).toContain('No databases found');
      expect(selectDbSpy).not.toHaveBeenCalled();
    });

    it('displays connection error and offers retry/back on fetch failure', async () => {
      const { select } = await import('@inquirer/prompts');
      vi.mocked(select)
        .mockResolvedValueOnce('srv-1')     // server selection
        .mockResolvedValueOnce('back')      // action menu: go back
        .mockRejectedValueOnce(new Error('Cancelled')); // prevent infinite loop

      const cmd = new BrowseCommand({});
      vi.spyOn(cmd, 'isInteractiveTTY').mockReturnValue(true);
      vi.spyOn(cmd, 'resolveCredentials').mockResolvedValue(mockCredentials);
      vi.spyOn(cmd, 'fetchDatabases').mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(cmd.execute()).rejects.toThrow('Cancelled');

      const output = stdoutWriteSpy.mock.calls.map((c) => c[0]).join('');
      expect(output).toContain('Connection error');
    });

    it('displays auth error message on 401 fetch failure', async () => {
      const { select } = await import('@inquirer/prompts');
      vi.mocked(select)
        .mockResolvedValueOnce('srv-1')     // server selection
        .mockResolvedValueOnce('back')      // action menu: go back
        .mockRejectedValueOnce(new Error('Cancelled')); // prevent infinite loop

      const cmd = new BrowseCommand({});
      vi.spyOn(cmd, 'isInteractiveTTY').mockReturnValue(true);
      vi.spyOn(cmd, 'resolveCredentials').mockResolvedValue(mockCredentials);
      vi.spyOn(cmd, 'fetchDatabases').mockRejectedValue(new Error('401 Unauthorized'));

      await expect(cmd.execute()).rejects.toThrow('Cancelled');

      const output = stdoutWriteSpy.mock.calls.map((c) => c[0]).join('');
      expect(output).toContain('Authentication failed');
    });

    it('retries fetchDatabases when user selects retry after connection error', async () => {
      const { select } = await import('@inquirer/prompts');
      vi.mocked(select)
        .mockResolvedValueOnce('srv-1')     // server selection
        .mockResolvedValueOnce('retry')     // action menu: retry
        .mockResolvedValueOnce('back')      // action menu after second failure: back
        .mockRejectedValueOnce(new Error('Cancelled')); // prevent infinite loop

      const cmd = new BrowseCommand({});
      vi.spyOn(cmd, 'isInteractiveTTY').mockReturnValue(true);
      vi.spyOn(cmd, 'resolveCredentials').mockResolvedValue(mockCredentials);
      // Always fail
      vi.spyOn(cmd, 'fetchDatabases').mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(cmd.execute()).rejects.toThrow('Cancelled');

      // fetchDatabases should have been called twice (initial + retry)
      expect(vi.mocked(cmd.fetchDatabases)).toHaveBeenCalledTimes(2);
    });

    it('navigates back to server selection when user chooses Back in database menu', async () => {
      const { select } = await import('@inquirer/prompts');
      vi.mocked(select)
        .mockResolvedValueOnce('srv-1')     // server selection (first time)
        .mockRejectedValueOnce(new Error('Cancelled')); // server selection (second time, prevents loop)

      const cmd = new BrowseCommand({});
      vi.spyOn(cmd, 'isInteractiveTTY').mockReturnValue(true);
      vi.spyOn(cmd, 'resolveCredentials').mockResolvedValue(mockCredentials);
      vi.spyOn(cmd, 'fetchDatabases').mockResolvedValue(['Sales', 'HR']);
      vi.spyOn(cmd, 'selectDatabase').mockResolvedValue(null); // user chose Back

      await expect(cmd.execute()).rejects.toThrow('Cancelled');

      // Verify we returned to server selection (select was called again for server)
      expect(vi.mocked(select)).toHaveBeenCalledTimes(2);
    });

    it('does not include password in result data', async () => {
      const { select } = await import('@inquirer/prompts');
      vi.mocked(select).mockResolvedValue('srv-1');

      const cmd = new BrowseCommand({});
      vi.spyOn(cmd, 'isInteractiveTTY').mockReturnValue(true);
      vi.spyOn(cmd, 'resolveCredentials').mockResolvedValue(mockCredentials);
      vi.spyOn(cmd, 'fetchDatabases').mockResolvedValue(['Sales']);
      vi.spyOn(cmd, 'selectDatabase').mockResolvedValue('Sales');
      vi.spyOn(cmd, 'fetchTables').mockResolvedValue(['Contacts']);
      vi.spyOn(cmd, 'selectTable').mockResolvedValue('Contacts');

      const result = await cmd.execute();

      expect(result.success).toBe(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((result.data as any).password).toBeUndefined();
    });
  });
});

// ============================================================================
// T015 — Table selection level (CLA-1837)
// ============================================================================

describe('BrowseCommand - table selection (CLA-1837)', () => {
  let processExitSpy: ReturnType<typeof vi.spyOn>;
  let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;

  const mockServer = { id: 'srv-1', name: 'Prod', host: 'fm.example.com', port: 443, secure: true };
  const mockCredentials = {
    serverId: 'srv-1',
    database: 'MyDB',
    username: 'alice',
    password: 'secret',
  };

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

    vi.mocked(CredentialsManager).mockImplementation(() => ({
      listCredentials: vi.fn().mockResolvedValue([{ serverId: 'srv-1', database: 'MyDB', username: 'alice' }]),
      getCredentials: vi.fn().mockResolvedValue('secret'),
      storeCredentials: vi.fn().mockResolvedValue(undefined),
    }));
  });

  afterEach(() => {
    processExitSpy.mockRestore();
    stdoutWriteSpy.mockRestore();
  });

  describe('fetchTables()', () => {
    it('returns table names from OData service document, filtering FunctionImports', async () => {
      const cmd = new BrowseCommand({});

      const axiosMock = await import('axios');
      vi.spyOn(axiosMock.default, 'get').mockResolvedValue({
        data: {
          value: [
            { name: 'Contacts', kind: 'EntitySet', url: 'Contacts' },
            { name: 'Orders', kind: 'EntitySet', url: 'Orders' },
            { name: 'GetAll', kind: 'FunctionImport', url: 'GetAll' },
          ],
        },
      });

      const result = await cmd.fetchTables(mockServer, mockCredentials, 'MyDB');

      expect(result).toEqual(['Contacts', 'Orders']);
      expect(result).not.toContain('GetAll');
    });

    it('returns empty array when service document has no entries', async () => {
      const cmd = new BrowseCommand({});

      const axiosMock = await import('axios');
      vi.spyOn(axiosMock.default, 'get').mockResolvedValue({
        data: { value: [] },
      });

      const result = await cmd.fetchTables(mockServer, mockCredentials, 'MyDB');

      expect(result).toEqual([]);
    });

    it('calls /fmi/odata/v4/{database} endpoint on the server', async () => {
      const cmd = new BrowseCommand({});

      const axiosMock = await import('axios');
      const getSpy = vi.spyOn(axiosMock.default, 'get').mockResolvedValue({
        data: { value: [] },
      });

      await cmd.fetchTables(mockServer, mockCredentials, 'MyDB');

      const url = getSpy.mock.calls[0][0];
      expect(url).toContain('/fmi/odata/v4/MyDB');
      expect(url).toContain('fm.example.com');
    });

    it('uses Basic auth header with base64 encoded credentials', async () => {
      const cmd = new BrowseCommand({});

      const axiosMock = await import('axios');
      const getSpy = vi.spyOn(axiosMock.default, 'get').mockResolvedValue({
        data: { value: [] },
      });

      await cmd.fetchTables(mockServer, mockCredentials, 'MyDB');

      const callArgs = getSpy.mock.calls[0];
      const headers = (callArgs[1] as { headers?: Record<string, string> })?.headers ?? {};
      const expectedToken = Buffer.from('alice:secret').toString('base64');
      expect(headers['Authorization']).toBe(`Basic ${expectedToken}`);
    });

    it('throws on network/connection error', async () => {
      const cmd = new BrowseCommand({});

      const axiosMock = await import('axios');
      vi.spyOn(axiosMock.default, 'get').mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(cmd.fetchTables(mockServer, mockCredentials, 'MyDB')).rejects.toThrow('ECONNREFUSED');
    });

    it('throws on auth error (401)', async () => {
      const cmd = new BrowseCommand({});

      const axiosMock = await import('axios');
      vi.spyOn(axiosMock.default, 'get').mockRejectedValue(new Error('Request failed with status code 401'));

      await expect(cmd.fetchTables(mockServer, mockCredentials, 'MyDB')).rejects.toThrow('401');
    });

    it('filters all FunctionImport entries from the result', async () => {
      const cmd = new BrowseCommand({});

      const axiosMock = await import('axios');
      vi.spyOn(axiosMock.default, 'get').mockResolvedValue({
        data: {
          value: [
            { name: 'FuncA', kind: 'FunctionImport', url: 'FuncA' },
            { name: 'FuncB', kind: 'FunctionImport', url: 'FuncB' },
            { name: 'Customers', kind: 'EntitySet', url: 'Customers' },
          ],
        },
      });

      const result = await cmd.fetchTables(mockServer, mockCredentials, 'MyDB');

      expect(result).toEqual(['Customers']);
    });
  });

  describe('selectTable()', () => {
    it('calls select() with table choices and a Back option', async () => {
      const { select } = await import('@inquirer/prompts');
      vi.mocked(select).mockResolvedValue('Contacts');

      const cmd = new BrowseCommand({});
      const result = await cmd.selectTable(['Contacts', 'Orders']);

      expect(vi.mocked(select)).toHaveBeenCalledOnce();
      const callArgs = vi.mocked(select).mock.calls[0][0];
      expect(callArgs.choices).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ value: 'Contacts' }),
          expect.objectContaining({ value: 'Orders' }),
        ])
      );
      // Should include a "Back" option
      expect(callArgs.choices).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: expect.stringContaining('Back') }),
        ])
      );
      expect(result).toBe('Contacts');
    });

    it('returns null when user chooses Back', async () => {
      const { select } = await import('@inquirer/prompts');
      vi.mocked(select).mockResolvedValue('__back__');

      const cmd = new BrowseCommand({});
      const result = await cmd.selectTable(['Contacts', 'Orders']);

      expect(result).toBeNull();
    });

    it('returns the selected table name', async () => {
      const { select } = await import('@inquirer/prompts');
      vi.mocked(select).mockResolvedValue('Orders');

      const cmd = new BrowseCommand({});
      const result = await cmd.selectTable(['Contacts', 'Orders']);

      expect(result).toBe('Orders');
    });

    it('shows "Select a table:" prompt message', async () => {
      const { select } = await import('@inquirer/prompts');
      vi.mocked(select).mockResolvedValue('Contacts');

      const cmd = new BrowseCommand({});
      await cmd.selectTable(['Contacts']);

      const callArgs = vi.mocked(select).mock.calls[0][0];
      expect(callArgs.message).toContain('table');
    });
  });

  describe('execute() - table selection integration', () => {
    it('fetches tables after database selection', async () => {
      const { select } = await import('@inquirer/prompts');
      vi.mocked(select).mockResolvedValue('srv-1');

      const cmd = new BrowseCommand({});
      vi.spyOn(cmd, 'isInteractiveTTY').mockReturnValue(true);
      vi.spyOn(cmd, 'resolveCredentials').mockResolvedValue(mockCredentials);
      vi.spyOn(cmd, 'fetchDatabases').mockResolvedValue(['MyDB']);
      vi.spyOn(cmd, 'selectDatabase').mockResolvedValue('MyDB');
      const fetchTablesSpy = vi.spyOn(cmd, 'fetchTables').mockResolvedValue(['Contacts', 'Orders']);
      vi.spyOn(cmd, 'selectTable').mockResolvedValue('Contacts');

      await cmd.execute();

      expect(fetchTablesSpy).toHaveBeenCalledOnce();
      expect(fetchTablesSpy).toHaveBeenCalledWith(
        expect.objectContaining({ host: mockServer.host }),
        mockCredentials,
        'MyDB'
      );
    });

    it('returns selected table in result data', async () => {
      const { select } = await import('@inquirer/prompts');
      vi.mocked(select).mockResolvedValue('srv-1');

      const cmd = new BrowseCommand({});
      vi.spyOn(cmd, 'isInteractiveTTY').mockReturnValue(true);
      vi.spyOn(cmd, 'resolveCredentials').mockResolvedValue(mockCredentials);
      vi.spyOn(cmd, 'fetchDatabases').mockResolvedValue(['MyDB']);
      vi.spyOn(cmd, 'selectDatabase').mockResolvedValue('MyDB');
      vi.spyOn(cmd, 'fetchTables').mockResolvedValue(['Contacts', 'Orders']);
      vi.spyOn(cmd, 'selectTable').mockResolvedValue('Orders');

      const result = await cmd.execute();

      expect(result.success).toBe(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((result.data as any).table).toBe('Orders');
    });

    it('result includes serverId, database, table, username (not password)', async () => {
      const { select } = await import('@inquirer/prompts');
      vi.mocked(select).mockResolvedValue('srv-1');

      const cmd = new BrowseCommand({});
      vi.spyOn(cmd, 'isInteractiveTTY').mockReturnValue(true);
      vi.spyOn(cmd, 'resolveCredentials').mockResolvedValue(mockCredentials);
      vi.spyOn(cmd, 'fetchDatabases').mockResolvedValue(['MyDB']);
      vi.spyOn(cmd, 'selectDatabase').mockResolvedValue('MyDB');
      vi.spyOn(cmd, 'fetchTables').mockResolvedValue(['Contacts']);
      vi.spyOn(cmd, 'selectTable').mockResolvedValue('Contacts');

      const result = await cmd.execute();

      expect(result.success).toBe(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = result.data as any;
      expect(data.serverId).toBe('srv-1');
      expect(data.database).toBe('MyDB');
      expect(data.table).toBe('Contacts');
      expect(data.username).toBe('alice');
      expect(data.password).toBeUndefined();
    });

    it('navigates back to database selection when user chooses Back in table menu', async () => {
      const { select } = await import('@inquirer/prompts');
      vi.mocked(select).mockResolvedValue('srv-1');

      const cmd = new BrowseCommand({});
      vi.spyOn(cmd, 'isInteractiveTTY').mockReturnValue(true);
      vi.spyOn(cmd, 'resolveCredentials').mockResolvedValue(mockCredentials);
      vi.spyOn(cmd, 'fetchDatabases').mockResolvedValue(['MyDB', 'OtherDB']);
      // First call: select MyDB; second call (after back): select null (Back to server)
      const selectDatabaseSpy = vi.spyOn(cmd, 'selectDatabase')
        .mockResolvedValueOnce('MyDB')
        .mockResolvedValueOnce(null);
      vi.spyOn(cmd, 'fetchTables').mockResolvedValue(['Contacts', 'Orders']);
      vi.spyOn(cmd, 'selectTable').mockResolvedValue(null); // user chose Back from table menu

      // After going back to database selection, selectDatabase returns null -> back to server selection
      // Server selection will be called again
      vi.mocked(select)
        .mockResolvedValueOnce('srv-1')
        .mockRejectedValueOnce(new Error('Cancelled'));

      await expect(cmd.execute()).rejects.toThrow('Cancelled');

      // selectDatabase should have been called twice (initial + after back from table)
      expect(selectDatabaseSpy).toHaveBeenCalledTimes(2);
    });

    it('displays message and goes back when no tables found in database', async () => {
      const { select } = await import('@inquirer/prompts');
      vi.mocked(select)
        .mockResolvedValueOnce('srv-1')   // server selection
        .mockResolvedValueOnce('back');   // "back to database selection" when no tables

      const cmd = new BrowseCommand({});
      vi.spyOn(cmd, 'isInteractiveTTY').mockReturnValue(true);
      vi.spyOn(cmd, 'resolveCredentials').mockResolvedValue(mockCredentials);
      vi.spyOn(cmd, 'fetchDatabases').mockResolvedValue(['MyDB']);
      vi.spyOn(cmd, 'selectDatabase')
        .mockResolvedValueOnce('MyDB')
        .mockResolvedValueOnce(null); // back to server selection
      vi.spyOn(cmd, 'fetchTables').mockResolvedValue([]); // no tables
      const selectTableSpy = vi.spyOn(cmd, 'selectTable');

      vi.mocked(select)
        .mockResolvedValueOnce('srv-1')   // server selection
        .mockResolvedValueOnce('back')    // "back to database selection" when no tables
        .mockRejectedValueOnce(new Error('Cancelled'));

      await expect(cmd.execute()).rejects.toThrow('Cancelled');

      const output = stdoutWriteSpy.mock.calls.map((c) => c[0]).join('');
      expect(output).toContain('No tables found');
      expect(selectTableSpy).not.toHaveBeenCalled();
    });

    it('displays connection error for table fetch failure and offers retry/back', async () => {
      const { select } = await import('@inquirer/prompts');
      vi.mocked(select)
        .mockResolvedValueOnce('srv-1')     // server selection
        .mockResolvedValueOnce('back')      // action menu for table fetch failure: back
        .mockRejectedValueOnce(new Error('Cancelled'));

      const cmd = new BrowseCommand({});
      vi.spyOn(cmd, 'isInteractiveTTY').mockReturnValue(true);
      vi.spyOn(cmd, 'resolveCredentials').mockResolvedValue(mockCredentials);
      vi.spyOn(cmd, 'fetchDatabases').mockResolvedValue(['MyDB']);
      vi.spyOn(cmd, 'selectDatabase')
        .mockResolvedValueOnce('MyDB')
        .mockResolvedValueOnce(null);
      vi.spyOn(cmd, 'fetchTables').mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(cmd.execute()).rejects.toThrow('Cancelled');

      const output = stdoutWriteSpy.mock.calls.map((c) => c[0]).join('');
      expect(output).toContain('Connection error');
    });

    it('displays auth error message on 401 table fetch failure', async () => {
      const { select } = await import('@inquirer/prompts');
      vi.mocked(select)
        .mockResolvedValueOnce('srv-1')
        .mockResolvedValueOnce('back')
        .mockRejectedValueOnce(new Error('Cancelled'));

      const cmd = new BrowseCommand({});
      vi.spyOn(cmd, 'isInteractiveTTY').mockReturnValue(true);
      vi.spyOn(cmd, 'resolveCredentials').mockResolvedValue(mockCredentials);
      vi.spyOn(cmd, 'fetchDatabases').mockResolvedValue(['MyDB']);
      vi.spyOn(cmd, 'selectDatabase')
        .mockResolvedValueOnce('MyDB')
        .mockResolvedValueOnce(null);
      vi.spyOn(cmd, 'fetchTables').mockRejectedValue(new Error('401 Unauthorized'));

      await expect(cmd.execute()).rejects.toThrow('Cancelled');

      const output = stdoutWriteSpy.mock.calls.map((c) => c[0]).join('');
      expect(output).toContain('Authentication failed');
    });

    it('retries fetchTables when user selects retry after connection error', async () => {
      const { select } = await import('@inquirer/prompts');
      vi.mocked(select)
        .mockResolvedValueOnce('srv-1')   // server selection
        .mockResolvedValueOnce('retry')   // action menu: retry
        .mockResolvedValueOnce('back')    // action menu after second failure: back
        .mockRejectedValueOnce(new Error('Cancelled'));

      const cmd = new BrowseCommand({});
      vi.spyOn(cmd, 'isInteractiveTTY').mockReturnValue(true);
      vi.spyOn(cmd, 'resolveCredentials').mockResolvedValue(mockCredentials);
      vi.spyOn(cmd, 'fetchDatabases').mockResolvedValue(['MyDB']);
      vi.spyOn(cmd, 'selectDatabase')
        .mockResolvedValueOnce('MyDB')
        .mockResolvedValueOnce(null);
      const fetchTablesSpy = vi.spyOn(cmd, 'fetchTables').mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(cmd.execute()).rejects.toThrow('Cancelled');

      // fetchTables should have been called twice (initial + retry)
      expect(fetchTablesSpy).toHaveBeenCalledTimes(2);
    });
  });
});
