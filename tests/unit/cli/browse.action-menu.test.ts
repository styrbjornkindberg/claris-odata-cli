/**
 * Unit Tests for BrowseCommand — Action Menu (CLA-1838)
 *
 * Tests selectAction(), executeAction(), and action-menu integration flow.
 *
 * @module tests/unit/cli/browse.action-menu.test
 * @see CLA-1838
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowseCommand } from '../../../src/cli/browse';
import { ServerManager } from '../../../src/config/servers';
import { CredentialsManager } from '../../../src/config/credentials';
import { select, input } from '@inquirer/prompts';
import axios from 'axios';
import { ODataClient } from '../../../src/api/client';

vi.mock('@inquirer/prompts', () => ({
  select: vi.fn(),
  input: vi.fn(),
  password: vi.fn(),
}));

vi.mock('../../../src/config/credentials', () => ({
  CredentialsManager: vi.fn().mockImplementation(() => ({
    listCredentials: vi.fn().mockResolvedValue([{ serverId: 'srv-1', database: 'MyDB', username: 'alice' }]),
    getCredentials: vi.fn().mockResolvedValue('secret'),
    storeCredentials: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../../../src/config/servers', () => ({
  ServerManager: vi.fn().mockImplementation(() => ({
    listServers: vi.fn().mockReturnValue([]),
  })),
}));

const mockServer = { id: 'srv-1', name: 'Prod', host: 'fm.example.com', port: 443, secure: true };
const mockCredentials = {
  serverId: 'srv-1',
  database: 'MyDB',
  username: 'alice',
  password: 'secret',
};

describe('BrowseCommand - action menu (CLA-1838)', () => {
  let processExitSpy: ReturnType<typeof vi.spyOn>;
  let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;

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
      vi.mocked(select).mockResolvedValue('__back__');
      const cmd = new BrowseCommand({});
      expect(await cmd.selectAction()).toBeNull();
    });

    it.each([
      ['list-records'],
      ['get-record'],
      ['create-record'],
      ['view-schema'],
    ])('returns "%s" when user selects it', async (action) => {
      vi.mocked(select).mockResolvedValue(action);
      const cmd = new BrowseCommand({});
      expect(await cmd.selectAction()).toBe(action);
    });

    it('shows "action" in prompt message', async () => {
      vi.mocked(select).mockResolvedValue('list-records');
      const cmd = new BrowseCommand({});
      await cmd.selectAction();
      const callArgs = vi.mocked(select).mock.calls[0][0];
      expect(callArgs.message).toContain('ction');
    });

    it.each([
      ['List Records', 'list-records'],
      ['Get Record by ID', 'get-record'],
      ['Create Record', 'create-record'],
      ['View Schema', 'view-schema'],
    ])('displays "%s" choice name for value "%s"', async (name, value) => {
      vi.mocked(select).mockResolvedValue(value);
      const cmd = new BrowseCommand({});
      await cmd.selectAction();
      const callArgs = vi.mocked(select).mock.calls[0][0];
      expect(callArgs.choices).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: expect.stringContaining(name), value }),
        ])
      );
    });
  });

  // --------------------------------------------------------------------------
  // executeAction() unit tests
  // --------------------------------------------------------------------------

  describe('executeAction()', () => {
    it('list-records: calls ODataClient.getRecords and returns records', async () => {
      const mockGetRecords = vi.fn().mockResolvedValue([{ id: 1, name: 'Alice' }]);
      vi.spyOn(ODataClient.prototype, 'getRecords').mockImplementation(mockGetRecords);

      const cmd = new BrowseCommand({});
      const result = await cmd.executeAction(mockServer, mockCredentials, 'Contacts', 'list-records');

      expect(result.success).toBe(true);
      expect(mockGetRecords).toHaveBeenCalledWith('Contacts');
      expect(result.data).toEqual([{ id: 1, name: 'Alice' }]);
    });

    it('get-record: prompts for ID, calls ODataClient.getRecord, returns record', async () => {
      vi.mocked(input).mockResolvedValue('42');
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
      vi.mocked(input).mockResolvedValue('not-a-number');

      const cmd = new BrowseCommand({});
      const result = await cmd.executeAction(mockServer, mockCredentials, 'Contacts', 'get-record');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid record ID');
    });

    it('create-record: prompts for JSON, calls ODataClient.createRecord, returns created record', async () => {
      vi.mocked(input).mockResolvedValue('{"name":"Charlie"}');
      const mockCreateRecord = vi.fn().mockResolvedValue({ id: 99, name: 'Charlie' });
      vi.spyOn(ODataClient.prototype, 'createRecord').mockImplementation(mockCreateRecord);

      const cmd = new BrowseCommand({});
      const result = await cmd.executeAction(mockServer, mockCredentials, 'Contacts', 'create-record');

      expect(result.success).toBe(true);
      expect(mockCreateRecord).toHaveBeenCalledWith('Contacts', { name: 'Charlie' });
      expect(result.data).toEqual({ id: 99, name: 'Charlie' });
    });

    it('create-record: returns error when invalid JSON entered', async () => {
      vi.mocked(input).mockResolvedValue('{invalid json}');

      const cmd = new BrowseCommand({});
      const result = await cmd.executeAction(mockServer, mockCredentials, 'Contacts', 'create-record');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid JSON');
    });

    it('view-schema: calls $metadata endpoint and returns schema', async () => {
      vi.spyOn(axios, 'get').mockResolvedValue({
        data: '<edmx:Edmx xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx"/>',
      });

      const cmd = new BrowseCommand({});
      const result = await cmd.executeAction(mockServer, mockCredentials, 'Contacts', 'view-schema');

      expect(result.success).toBe(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = result.data as any;
      expect(data.table).toBe('Contacts');
      expect(data.schema).toContain('edmx');

      const callUrl = vi.mocked(axios.get).mock.calls[0][0] as string;
      expect(callUrl).toContain('$metadata');
      expect(callUrl).toContain('MyDB');
    });
  });

  // --------------------------------------------------------------------------
  // execute() integration tests — action menu flow
  // --------------------------------------------------------------------------

  describe('execute() - action menu integration', () => {
    /** Set up a BrowseCommand with all steps mocked up to action selection */
    function setupBrowseFlow(overrides: {
      selectAction?: ReturnType<typeof vi.fn>;
      executeAction?: ReturnType<typeof vi.fn>;
      selectTable?: ReturnType<typeof vi.fn>;
      selectDatabase?: ReturnType<typeof vi.fn>;
    } = {}) {
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

      // Apply overrides
      if (overrides.selectAction) vi.spyOn(cmd, 'selectAction').mockImplementation(overrides.selectAction);
      if (overrides.executeAction) vi.spyOn(cmd, 'executeAction').mockImplementation(overrides.executeAction);
      if (overrides.selectTable) vi.spyOn(cmd, 'selectTable').mockImplementation(overrides.selectTable);
      if (overrides.selectDatabase) vi.spyOn(cmd, 'selectDatabase').mockImplementation(overrides.selectDatabase);

      return cmd;
    }

    it('calls selectAction() after table selection', async () => {
      const cmd = setupBrowseFlow();
      await cmd.execute();
      expect(cmd.selectAction).toHaveBeenCalledOnce();
    });

    it('calls executeAction with correct parameters', async () => {
      const cmd = setupBrowseFlow();
      await cmd.execute();

      expect(cmd.executeAction).toHaveBeenCalledWith(
        expect.objectContaining({ host: mockServer.host }),
        mockCredentials,
        'Contacts',
        'list-records'
      );
    });

    it('result includes action and result data', async () => {
      const cmd = setupBrowseFlow({
        executeAction: vi.fn().mockResolvedValue({ success: true, data: [{ id: 1 }] }),
      });

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
      const cmd = setupBrowseFlow({
        executeAction: vi.fn().mockResolvedValue({ success: true, data: [{ id: 1 }] }),
      });

      await cmd.execute();

      const output = stdoutWriteSpy.mock.calls.map((c) => c[0]).join('');
      expect(output).toContain('"id": 1');
    });

    it('prints error message to stdout on action failure', async () => {
      const cmd = setupBrowseFlow({
        executeAction: vi.fn().mockResolvedValue({ success: false, error: 'Permission denied' }),
      });

      const result = await cmd.execute();

      expect(result.success).toBe(false);
      const output = stdoutWriteSpy.mock.calls.map((c) => c[0]).join('');
      expect(output).toContain('Permission denied');
    });

    it('catches thrown errors from executeAction and writes to stdout', async () => {
      const cmd = setupBrowseFlow({
        executeAction: vi.fn().mockRejectedValue(new Error('Network error')),
      });

      const result = await cmd.execute();

      expect(result.success).toBe(false);
      const output = stdoutWriteSpy.mock.calls.map((c) => c[0]).join('');
      expect(output).toContain('Network error');
    });

    it('navigates back to table selection when user chooses Back in action menu', async () => {
      const selectTableSpy = vi.fn()
        .mockResolvedValueOnce('Contacts')
        .mockResolvedValueOnce(null);
      const selectDatabaseSpy = vi.fn()
        .mockResolvedValueOnce('MyDB')
        .mockResolvedValueOnce(null);

      const cmd = setupBrowseFlow({
        selectAction: vi.fn().mockResolvedValue(null),
        selectTable: selectTableSpy,
        selectDatabase: selectDatabaseSpy,
      });

      // Server selection: first returns srv-1, second rejects to break the outer loop
      vi.mocked(select)
        .mockResolvedValueOnce('srv-1')
        .mockRejectedValueOnce(new Error('Cancelled'));

      await expect(cmd.execute()).rejects.toThrow('Cancelled');

      // selectTable was called twice (initial + after returning from Back in action menu)
      expect(selectTableSpy).toHaveBeenCalledTimes(2);
    });

    it('does not include password in final result data', async () => {
      const cmd = setupBrowseFlow();
      const result = await cmd.execute();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((result.data as any).password).toBeUndefined();
    });
  });
});
