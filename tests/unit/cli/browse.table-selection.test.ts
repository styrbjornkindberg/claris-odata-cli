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
      expect(callArgs.message.toLowerCase()).toContain('table');
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
      vi.spyOn(cmd, 'selectAction').mockResolvedValue('list-records');
      vi.spyOn(cmd, 'executeAction').mockResolvedValue({ success: true, data: [] });
      vi.spyOn(cmd, 'selectPostActionNavigation').mockResolvedValue('exit');

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
      vi.spyOn(cmd, 'selectAction').mockResolvedValue('list-records');
      vi.spyOn(cmd, 'executeAction').mockResolvedValue({ success: true, data: [] });
      vi.spyOn(cmd, 'selectPostActionNavigation').mockResolvedValue('exit');

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
      vi.spyOn(cmd, 'selectAction').mockResolvedValue('list-records');
      vi.spyOn(cmd, 'executeAction').mockResolvedValue({ success: true, data: [] });
      vi.spyOn(cmd, 'selectPostActionNavigation').mockResolvedValue('exit');

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

// ============================================================================
// T016 — Action menu (CLA-1838)
// ============================================================================
