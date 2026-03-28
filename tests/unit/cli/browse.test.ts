/**
 * Unit Tests for BrowseCommand
 *
 * Tests TTY detection, non-interactive error handling, server selection,
 * and credential resolution.
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
 *
 * @module tests/unit/cli/browse.test
 * @see CLA-1833, CLA-1834, CLA-1835
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

    const mockCredsMgr = vi.mocked(CredentialsManager).mock.results[0]?.value ?? (() => {
      const inst = {
        listCredentials: vi.fn().mockResolvedValue([{ serverId: 'srv-1', database: 'MyDB', username: 'alice' }]),
        getCredentials: vi.fn().mockResolvedValue('secret'),
        storeCredentials: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(CredentialsManager).mockImplementation(() => inst);
      return inst;
    })();

    vi.mocked(CredentialsManager).mockImplementation(() => ({
      listCredentials: vi.fn().mockResolvedValue([{ serverId: 'srv-1', database: 'MyDB', username: 'alice' }]),
      getCredentials: vi.fn().mockResolvedValue('secret'),
      storeCredentials: vi.fn().mockResolvedValue(undefined),
    }));

    const cmd = new BrowseCommand({});
    vi.spyOn(cmd, 'isInteractiveTTY').mockReturnValue(true);

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

    const result = await cmd.execute();

    expect(result.success).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = result.data as any;
    expect(data.serverId).toBe('srv-1');
    expect(data.database).toBe('ProdDB');
    expect(data.username).toBe('admin');
  });
});
