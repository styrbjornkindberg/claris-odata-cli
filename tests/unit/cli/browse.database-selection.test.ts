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
      vi.spyOn(cmd, 'selectAction').mockResolvedValue('list-records');
      vi.spyOn(cmd, 'executeAction').mockResolvedValue({ success: true, data: [] });
      vi.spyOn(cmd, 'selectPostActionNavigation').mockResolvedValue('exit');

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
      vi.spyOn(cmd, 'selectAction').mockResolvedValue('list-records');
      vi.spyOn(cmd, 'executeAction').mockResolvedValue({ success: true, data: [] });
      vi.spyOn(cmd, 'selectPostActionNavigation').mockResolvedValue('exit');

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
      vi.spyOn(cmd, 'selectAction').mockResolvedValue('list-records');
      vi.spyOn(cmd, 'executeAction').mockResolvedValue({ success: true, data: [] });
      vi.spyOn(cmd, 'selectPostActionNavigation').mockResolvedValue('exit');

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
