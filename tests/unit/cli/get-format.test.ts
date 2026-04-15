/**
 * Unit Tests for GetCommand - Format Modes
 *
 * Tests JSON, JSONL, and CSV output formats for the get command.
 *
 * @module tests/unit/cli/get-format.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GetCommand } from '../../../src/cli/get';
import { ServerManager } from '../../../src/config/servers';
import { CredentialsManager } from '../../../src/config/credentials';
import { AuthManager } from '../../../src/api/auth';
import { ODataClient } from '../../../src/api/client';

vi.mock('../../../src/config/servers');
vi.mock('../../../src/config/credentials');
vi.mock('../../../src/api/auth');
vi.mock('../../../src/api/client');

describe('GetCommand - format modes', () => {
  const mockServerManager = {
    getServer: vi.fn(),
  };

  const mockCredentialsManager = {
    listCredentials: vi.fn(),
    getCredentials: vi.fn(),
  };

  const mockAuthManager = {
    createBasicAuthToken: vi.fn(),
  };

  const mockClient = {
    getRecords: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(ServerManager).mockImplementation(() => mockServerManager as any);
    vi.mocked(CredentialsManager).mockImplementation(() => mockCredentialsManager as any);
    vi.mocked(AuthManager).mockImplementation(() => mockAuthManager as any);
    vi.mocked(ODataClient).mockImplementation(() => mockClient as any);

    mockServerManager.getServer.mockReturnValue({
      id: 'prod',
      name: 'Production',
      host: 'fm.example.com',
      port: 443,
      secure: true,
    });

    mockCredentialsManager.listCredentials.mockResolvedValue([
      { serverId: 'prod', database: 'Sales', username: 'alice' },
    ]);

    mockCredentialsManager.getCredentials.mockResolvedValue('secret');
    mockAuthManager.createBasicAuthToken.mockReturnValue('Basic dGVzdA==');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('formatOutput - json mode', () => {
    it('formats records as JSON array', async () => {
      mockClient.getRecords.mockResolvedValue([
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ]);

      const cmd = new GetCommand({
        table: 'Customers',
        serverId: 'prod',
        database: 'Sales',
        output: 'json',
      });

      const result = await cmd.execute();
      const output = cmd.formatOutput(result);
      const parsed = JSON.parse(output);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(2);
      expect(parsed[0]).toHaveProperty('id', 1);
      expect(parsed[0]).toHaveProperty('name', 'Alice');
    });

    it('sorts keys alphabetically in JSON output', async () => {
      mockClient.getRecords.mockResolvedValue([{ zebra: 'z', apple: 'a', banana: 'b' }]);

      const cmd = new GetCommand({
        table: 'Test',
        serverId: 'prod',
        database: 'Sales',
        output: 'json',
      });

      const result = await cmd.execute();
      const output = cmd.formatOutput(result);
      const parsed = JSON.parse(output);

      expect(Object.keys(parsed[0])).toEqual(['apple', 'banana', 'zebra']);
    });

    it('outputs JSON error on failure', async () => {
      mockServerManager.getServer.mockReturnValue(undefined);

      const cmd = new GetCommand({
        table: 'Customers',
        serverId: 'missing',
        database: 'Sales',
        output: 'json',
      });

      const result = await cmd.execute();
      const output = cmd.formatOutput(result);
      const parsed = JSON.parse(output);

      expect(parsed.type).toBe('error');
      expect(parsed.code).toBe('ODATA_QUERY_FAILED');
      expect(parsed.message).toContain('Server not found');
    });
  });

  describe('formatOutput - jsonl mode', () => {
    it('formats records as JSON Lines (one per line)', async () => {
      mockClient.getRecords.mockResolvedValue([
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
        { id: 3, name: 'Charlie' },
      ]);

      const cmd = new GetCommand({
        table: 'Customers',
        serverId: 'prod',
        database: 'Sales',
        output: 'jsonl',
      });

      const result = await cmd.execute();
      const output = cmd.formatOutput(result);
      const lines = output.split('\n');

      expect(lines).toHaveLength(3);
      expect(() => JSON.parse(lines[0])).not.toThrow();
      expect(() => JSON.parse(lines[1])).not.toThrow();
      expect(() => JSON.parse(lines[2])).not.toThrow();
    });

    it('each line is valid JSON with sorted keys', async () => {
      mockClient.getRecords.mockResolvedValue([{ zebra: 'z', apple: 'a' }]);

      const cmd = new GetCommand({
        table: 'Test',
        serverId: 'prod',
        database: 'Sales',
        output: 'jsonl',
      });

      const result = await cmd.execute();
      const output = cmd.formatOutput(result);
      const firstLine = output.split('\n')[0];
      const parsed = JSON.parse(firstLine);

      expect(Object.keys(parsed)).toEqual(['apple', 'zebra']);
    });

    it('outputs empty string for empty result set', async () => {
      mockClient.getRecords.mockResolvedValue([]);

      const cmd = new GetCommand({
        table: 'Customers',
        serverId: 'prod',
        database: 'Sales',
        output: 'jsonl',
      });

      const result = await cmd.execute();
      const output = cmd.formatOutput(result);

      expect(output).toBe('');
    });

    it('outputs JSON error on failure', async () => {
      mockServerManager.getServer.mockReturnValue(undefined);

      const cmd = new GetCommand({
        table: 'Customers',
        serverId: 'missing',
        database: 'Sales',
        output: 'jsonl',
      });

      const result = await cmd.execute();
      const output = cmd.formatOutput(result);
      const parsed = JSON.parse(output);

      // JSONL error format is still a single JSON object
      expect(parsed.type).toBe('error');
      expect(parsed.code).toBe('ODATA_QUERY_FAILED');
    });

    it('handles complex nested objects', async () => {
      mockClient.getRecords.mockResolvedValue([
        { id: 1, nested: { key: 'value', inner: { deep: true } } },
      ]);

      const cmd = new GetCommand({
        table: 'Test',
        serverId: 'prod',
        database: 'Sales',
        output: 'jsonl',
      });

      const result = await cmd.execute();
      const output = cmd.formatOutput(result);
      const parsed = JSON.parse(output);

      expect(parsed.nested.key).toBe('value');
      expect(parsed.nested.inner.deep).toBe(true);
    });
  });

  describe('formatOutput - table mode', () => {
    it('formats records as JSON (table mode uses JSON for get)', async () => {
      mockClient.getRecords.mockResolvedValue([
        { id: 1, name: 'Alice' },
      ]);

      const cmd = new GetCommand({
        table: 'Customers',
        serverId: 'prod',
        database: 'Sales',
        output: 'table',
      });

      const result = await cmd.execute();
      const output = cmd.formatOutput(result);

      // Table mode for get command returns JSON (data-focused)
      expect(() => JSON.parse(output)).not.toThrow();
    });
  });

  describe('formatOutput - csv mode', () => {
    it('formats records as JSON (csv mode uses JSON for get)', async () => {
      mockClient.getRecords.mockResolvedValue([
        { id: 1, name: 'Alice' },
      ]);

      const cmd = new GetCommand({
        table: 'Customers',
        serverId: 'prod',
        database: 'Sales',
        output: 'csv',
      });

      const result = await cmd.execute();
      const output = cmd.formatOutput(result);

      // CSV mode for get command returns JSON (data-focused)
      expect(() => JSON.parse(output)).not.toThrow();
    });
  });
});