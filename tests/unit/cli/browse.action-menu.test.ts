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

describe('BrowseCommand - action menu (CLA-1838)', () => {
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

  // --------------------------------------------------------------------------
  // selectAction() unit tests
  // --------------------------------------------------------------------------

  describe('selectAction()', () => {
    it('calls select() with 5 choices (4 actions + Back)', async () => {
      const { select } = await import('@inquirer/prompts');
      vi.mocked(select).mockResolvedValue('list-records');

      const cmd = new BrowseCommand({});
      const result = await cmd.selectAction();

      expect(vi.mocked(select)).toHaveBeenCalledOnce();
      const callArgs = vi.mocked(select).mock.calls[0][0];
      expect(callArgs.choices).toHaveLength(5);
      expect(callArgs.choices).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: expect.stringContaining('Back') }),
          expect.objectContaining({ value: 'list-records' }),
          expect.objectContaining({ value: 'get-record' }),
          expect.objectContaining({ value: 'create-record' }),
          expect.objectContaining({ value: 'view-schema' }),
        ])
      );
      expect(result).toBe('list-records');
    });

    it('returns null when user chooses Back', async () => {
      const { select } = await import('@inquirer/prompts');
      vi.mocked(select).mockResolvedValue('__back__');

      const cmd = new BrowseCommand({});
      const result = await cmd.selectAction();

      expect(result).toBeNull();
    });

    it('returns "list-records" when user selects List Records', async () => {
      const { select } = await import('@inquirer/prompts');
      vi.mocked(select).mockResolvedValue('list-records');

      const cmd = new BrowseCommand({});
      expect(await cmd.selectAction()).toBe('list-records');
    });

    it('returns "get-record" when user selects Get Record by ID', async () => {
      const { select } = await import('@inquirer/prompts');
      vi.mocked(select).mockResolvedValue('get-record');

      const cmd = new BrowseCommand({});
      expect(await cmd.selectAction()).toBe('get-record');
    });

    it('returns "create-record" when user selects Create Record', async () => {
      const { select } = await import('@inquirer/prompts');
      vi.mocked(select).mockResolvedValue('create-record');

      const cmd = new BrowseCommand({});
      expect(await cmd.selectAction()).toBe('create-record');
    });

    it('returns "view-schema" when user selects View Schema', async () => {
      const { select } = await import('@inquirer/prompts');
      vi.mocked(select).mockResolvedValue('view-schema');

      const cmd = new BrowseCommand({});
      expect(await cmd.selectAction()).toBe('view-schema');
    });

    it('shows "Select an action:" prompt message', async () => {
      const { select } = await import('@inquirer/prompts');
      vi.mocked(select).mockResolvedValue('list-records');

      const cmd = new BrowseCommand({});
      await cmd.selectAction();

      const callArgs = vi.mocked(select).mock.calls[0][0];
      expect(callArgs.message).toContain('action');
    });

    it('displays "List Records" choice name', async () => {
      const { select } = await import('@inquirer/prompts');
      vi.mocked(select).mockResolvedValue('list-records');

      const cmd = new BrowseCommand({});
      await cmd.selectAction();

      const callArgs = vi.mocked(select).mock.calls[0][0];
      expect(callArgs.choices).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'List Records', value: 'list-records' }),
        ])
      );
    });

    it('displays "Get Record by ID" choice name', async () => {
      const { select } = await import('@inquirer/prompts');
      vi.mocked(select).mockResolvedValue('get-record');

      const cmd = new BrowseCommand({});
      await cmd.selectAction();

      const callArgs = vi.mocked(select).mock.calls[0][0];
      expect(callArgs.choices).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Get Record by ID', value: 'get-record' }),
        ])
      );
    });

    it('displays "Create Record" choice name', async () => {
      const { select } = await import('@inquirer/prompts');
      vi.mocked(select).mockResolvedValue('create-record');

      const cmd = new BrowseCommand({});
      await cmd.selectAction();

      const callArgs = vi.mocked(select).mock.calls[0][0];
      expect(callArgs.choices).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Create Record', value: 'create-record' }),
        ])
      );
    });

    it('displays "View Schema" choice name', async () => {
      const { select } = await import('@inquirer/prompts');
      vi.mocked(select).mockResolvedValue('view-schema');

      const cmd = new BrowseCommand({});
      await cmd.selectAction();

      const callArgs = vi.mocked(select).mock.calls[0][0];
      expect(callArgs.choices).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'View Schema', value: 'view-schema' }),
        ])
      );
    });
  });

  // --------------------------------------------------------------------------
  // executeAction() unit tests
  // --------------------------------------------------------------------------

  describe('executeAction()', () => {
    it('list-records: calls ODataClient.getRecords and returns records', async () => {
      const { ODataClient } = await import('../../../src/api/client');
      const mockGetRecords = vi.fn().mockResolvedValue([{ id: 1, name: 'Alice' }]);
      vi.spyOn(ODataClient.prototype, 'getRecords').mockImplementation(mockGetRecords);

      const cmd = new BrowseCommand({});
      const result = await cmd.executeAction(mockServer, mockCredentials, 'Contacts', 'list-records');

      expect(result.success).toBe(true);
      expect(mockGetRecords).toHaveBeenCalledWith('Contacts');
      expect(result.data).toEqual([{ id: 1, name: 'Alice' }]);
    });

    it('get-record: prompts for ID, calls ODataClient.getRecord, returns record', async () => {
      const { input } = await import('@inquirer/prompts');
      vi.mocked(input).mockResolvedValue('42');

      const { ODataClient } = await import('../../../src/api/client');
      const mockGetRecord = vi.fn().mockResolvedValue({ id: 42, name: 'Bob' });
      vi.spyOn(ODataClient.prototype, 'getRecord').mockImplementation(mockGetRecord);

      const cmd = new BrowseCommand({});
      const result = await cmd.executeAction(mockServer, mockCredentials, 'Contacts', 'get-record');

      expect(result.success).toBe(true);
      expect(vi.mocked(input)).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('ID') }));
      expect(mockGetRecord).toHaveBeenCalledWith('Contacts', 42);
      expect(result.data).toEqual({ id: 42, name: 'Bob' });
    });

    it('get-record: returns error when non-numeric ID entered', async () => {
      const { input } = await import('@inquirer/prompts');
      vi.mocked(input).mockResolvedValue('not-a-number');

      const cmd = new BrowseCommand({});
      const result = await cmd.executeAction(mockServer, mockCredentials, 'Contacts', 'get-record');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid record ID');
    });

    it('create-record: prompts for JSON, calls ODataClient.createRecord, returns created record', async () => {
      const { input } = await import('@inquirer/prompts');
      vi.mocked(input).mockResolvedValue('{"name":"Charlie"}');

      const { ODataClient } = await import('../../../src/api/client');
      const mockCreateRecord = vi.fn().mockResolvedValue({ id: 99, name: 'Charlie' });
      vi.spyOn(ODataClient.prototype, 'createRecord').mockImplementation(mockCreateRecord);

      const cmd = new BrowseCommand({});
      const result = await cmd.executeAction(mockServer, mockCredentials, 'Contacts', 'create-record');

      expect(result.success).toBe(true);
      expect(mockCreateRecord).toHaveBeenCalledWith('Contacts', { name: 'Charlie' });
      expect(result.data).toEqual({ id: 99, name: 'Charlie' });
    });

    it('create-record: returns error when invalid JSON entered', async () => {
      const { input } = await import('@inquirer/prompts');
      vi.mocked(input).mockResolvedValue('{invalid json}');

      const cmd = new BrowseCommand({});
      const result = await cmd.executeAction(mockServer, mockCredentials, 'Contacts', 'create-record');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid JSON');
    });

    it('view-schema: calls $metadata endpoint and returns schema', async () => {
      const axiosMock = await import('axios');
      vi.spyOn(axiosMock.default, 'get').mockResolvedValue({
        data: '<edmx:Edmx xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx"/>',
      });

      const cmd = new BrowseCommand({});
      const result = await cmd.executeAction(mockServer, mockCredentials, 'Contacts', 'view-schema');

      expect(result.success).toBe(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = result.data as any;
      expect(data.table).toBe('Contacts');
      expect(data.schema).toContain('edmx');

      const callUrl = vi.mocked(axiosMock.default.get).mock.calls[0][0] as string;
      expect(callUrl).toContain('$metadata');
      expect(callUrl).toContain('MyDB');
    });
  });

  // --------------------------------------------------------------------------
  // execute() integration tests — action menu flow
  // --------------------------------------------------------------------------

  describe('execute() - action menu integration', () => {
    it('calls selectAction() after table selection', async () => {
      const { select } = await import('@inquirer/prompts');
      vi.mocked(select).mockResolvedValue('srv-1');

      const cmd = new BrowseCommand({});
      vi.spyOn(cmd, 'isInteractiveTTY').mockReturnValue(true);
      vi.spyOn(cmd, 'resolveCredentials').mockResolvedValue(mockCredentials);
      vi.spyOn(cmd, 'fetchDatabases').mockResolvedValue(['MyDB']);
      vi.spyOn(cmd, 'selectDatabase').mockResolvedValue('MyDB');
      vi.spyOn(cmd, 'fetchTables').mockResolvedValue(['Contacts']);
      vi.spyOn(cmd, 'selectTable').mockResolvedValue('Contacts');
      const selectActionSpy = vi.spyOn(cmd, 'selectAction').mockResolvedValue('list-records');
      vi.spyOn(cmd, 'executeAction').mockResolvedValue({ success: true, data: [] });

      await cmd.execute();

      expect(selectActionSpy).toHaveBeenCalledOnce();
    });

    it('calls executeAction with correct parameters', async () => {
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
      const executeActionSpy = vi.spyOn(cmd, 'executeAction').mockResolvedValue({ success: true, data: [] });

      await cmd.execute();

      expect(executeActionSpy).toHaveBeenCalledWith(
        expect.objectContaining({ host: mockServer.host }),
        mockCredentials,
        'Contacts',
        'list-records'
      );
    });

    it('result includes action and result data', async () => {
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
      vi.spyOn(cmd, 'executeAction').mockResolvedValue({ success: true, data: [{ id: 1 }] });

      const result = await cmd.execute();

      expect(result.success).toBe(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = result.data as any;
      expect(data.action).toBe('list-records');
      expect(data.table).toBe('Contacts');
      expect(data.database).toBe('MyDB');
      expect(data.serverId).toBe('srv-1');
    });

    it('prints action result JSON to stdout', async () => {
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
      vi.spyOn(cmd, 'executeAction').mockResolvedValue({ success: true, data: [{ id: 1 }] });

      await cmd.execute();

      const output = stdoutWriteSpy.mock.calls.map((c) => c[0]).join('');
      expect(output).toContain('"id": 1');
    });

    it('prints error message to stdout on action failure', async () => {
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
      vi.spyOn(cmd, 'executeAction').mockResolvedValue({ success: false, error: 'Permission denied' });

      const result = await cmd.execute();

      expect(result.success).toBe(false);
      const output = stdoutWriteSpy.mock.calls.map((c) => c[0]).join('');
      expect(output).toContain('Permission denied');
    });

    it('catches thrown errors from executeAction and writes to stdout', async () => {
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
      vi.spyOn(cmd, 'executeAction').mockRejectedValue(new Error('Network error'));

      const result = await cmd.execute();

      expect(result.success).toBe(false);
      const output = stdoutWriteSpy.mock.calls.map((c) => c[0]).join('');
      expect(output).toContain('Network error');
    });

    it('navigates back to table selection when user chooses Back in action menu', async () => {
      const { select } = await import('@inquirer/prompts');
      vi.mocked(select).mockResolvedValue('srv-1');

      const cmd = new BrowseCommand({});
      vi.spyOn(cmd, 'isInteractiveTTY').mockReturnValue(true);
      vi.spyOn(cmd, 'resolveCredentials').mockResolvedValue(mockCredentials);
      vi.spyOn(cmd, 'fetchDatabases').mockResolvedValue(['MyDB']);
      vi.spyOn(cmd, 'selectDatabase').mockResolvedValue('MyDB');
      vi.spyOn(cmd, 'fetchTables').mockResolvedValue(['Contacts', 'Orders']);
      // First table selection: Contacts; after back from action, second table selection: null (go back to db)
      const selectTableSpy = vi.spyOn(cmd, 'selectTable')
        .mockResolvedValueOnce('Contacts')
        .mockResolvedValueOnce(null);
      // selectAction returns null (Back)
      vi.spyOn(cmd, 'selectAction').mockResolvedValue(null);
      // selectDatabase: after back from table, return null (back to server)
      vi.spyOn(cmd, 'selectDatabase')
        .mockResolvedValueOnce('MyDB')
        .mockResolvedValueOnce(null);

      // Server selection will be called again; make it reject to prevent infinite loop
      vi.mocked(select)
        .mockResolvedValueOnce('srv-1')
        .mockRejectedValueOnce(new Error('Cancelled'));

      await expect(cmd.execute()).rejects.toThrow('Cancelled');

      // selectTable was called twice (initial + after returning from Back in action menu)
      expect(selectTableSpy).toHaveBeenCalledTimes(2);
    });

    it('does not include password in final result data', async () => {
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

      const result = await cmd.execute();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((result.data as any).password).toBeUndefined();
    });
  });
});
