/**
 * Unit Tests for Overview Command
 *
 * Tests overview dashboard functionality for configured servers.
 *
 * @module tests/unit/cli/overview.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { OverviewCommand } from '../../../src/cli/overview';
import type { OverviewResult } from '../../../src/cli/overview';
import { ServerManager } from '../../../src/config/servers';
import { CredentialsManager } from '../../../src/config/credentials';
import { stripAnsi } from '../../../src/lib/theme';

// Mock dependencies
vi.mock('../../../src/config/servers');
vi.mock('../../../src/config/credentials');
vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
  },
}));

describe('OverviewCommand', () => {
  let mockServerManager: any;
  let mockCredentialsManager: any;
  const mockAxiosGet = vi.mocked(axios.get);

  beforeEach(() => {
    mockServerManager = {
      listServers: vi.fn(),
    };
    mockCredentialsManager = {
      listCredentials: vi.fn(),
      getCredentials: vi.fn(),
    };

    vi.mocked(ServerManager).mockImplementation(() => mockServerManager);
    vi.mocked(CredentialsManager).mockImplementation(() => mockCredentialsManager);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ─── execute() ──────────────────────────────────────────────────────────────

  describe('execute', () => {
    it('returns empty result when no servers configured', async () => {
      mockServerManager.listServers.mockReturnValue([]);

      const cmd = new OverviewCommand({ output: 'table' });
      const result = await cmd.execute();

      expect(result.success).toBe(true);
      const data = result.data as OverviewResult;
      expect(data.totalServers).toBe(0);
      expect(data.totalDatabases).toBe(0);
      expect(data.totalTables).toBe(0);
      expect(data.connectedServers).toBe(0);
      expect(data.errorServers).toBe(0);
      expect(data.servers).toHaveLength(0);
    });

    it('returns no-credentials status when no credentials stored', async () => {
      mockServerManager.listServers.mockReturnValue([
        { id: 'server-1', name: 'Production', host: 'fm.example.com', port: 443 },
      ]);
      mockCredentialsManager.listCredentials.mockResolvedValue([]);

      const cmd = new OverviewCommand({ output: 'table' });
      const result = await cmd.execute();

      expect(result.success).toBe(true);
      const data = result.data as OverviewResult;
      expect(data.totalServers).toBe(1);
      expect(data.errorServers).toBe(1);
      expect(data.servers[0].status).toBe('no-credentials');
      expect(data.servers[0].error).toBe('No credentials stored');
    });

    it('returns no-credentials when password not found', async () => {
      mockServerManager.listServers.mockReturnValue([
        { id: 'server-1', name: 'Production', host: 'fm.example.com', port: 443 },
      ]);
      mockCredentialsManager.listCredentials.mockResolvedValue([
        { serverId: 'server-1', database: 'TestDB', username: 'admin' },
      ]);
      mockCredentialsManager.getCredentials.mockResolvedValue(null);

      const cmd = new OverviewCommand({ output: 'table' });
      const result = await cmd.execute();

      const data = result.data as OverviewResult;
      expect(data.servers[0].status).toBe('no-credentials');
      expect(data.servers[0].error).toBe('Credentials stored but password not found');
    });

    it('returns connected status with databases when reachable', async () => {
      mockServerManager.listServers.mockReturnValue([
        { id: 'server-1', name: 'Production', host: 'fm.example.com', port: 443 },
      ]);
      mockCredentialsManager.listCredentials.mockResolvedValue([
        { serverId: 'server-1', database: 'TestDB', username: 'admin' },
      ]);
      mockCredentialsManager.getCredentials.mockResolvedValue('password123');

      // First call: service document listing databases
      mockAxiosGet.mockResolvedValueOnce({
        data: {
          value: [
            { name: 'TestDB', kind: 'EntityContainer', url: 'https://fm.example.com/fmi/odata/v4/TestDB' },
          ],
        },
      });

      // Second call: metadata for TestDB (with EntitySet entries)
      mockAxiosGet.mockResolvedValueOnce({
        data: '<?xml version="1.0"?><edmx:Edmx><EntitySet Name="Customers"/><EntitySet Name="Orders"/><EntitySet Name="Products"/></edmx:Edmx>',
      });

      const cmd = new OverviewCommand({ output: 'table' });
      const result = await cmd.execute();

      const data = result.data as OverviewResult;
      expect(data.totalServers).toBe(1);
      expect(data.connectedServers).toBe(1);
      expect(data.errorServers).toBe(0);
      expect(data.servers[0].status).toBe('connected');
      expect(data.servers[0].latency).toBeDefined();
      expect(data.servers[0].databaseCount).toBe(1);
      expect(data.servers[0].tableCount).toBe(3);
      expect(data.servers[0].databases[0].name).toBe('TestDB');
      expect(data.servers[0].databases[0].tableCount).toBe(3);
      expect(data.servers[0].databases[0].tables).toEqual(['Customers', 'Orders', 'Products']);
    });

    it('returns error status on connection refused', async () => {
      mockServerManager.listServers.mockReturnValue([
        { id: 'server-1', name: 'Production', host: 'fm.example.com', port: 443 },
      ]);
      mockCredentialsManager.listCredentials.mockResolvedValue([
        { serverId: 'server-1', database: 'TestDB', username: 'admin' },
      ]);
      mockCredentialsManager.getCredentials.mockResolvedValue('password123');
      mockAxiosGet.mockRejectedValue({ code: 'ECONNREFUSED' });

      const cmd = new OverviewCommand({ output: 'table' });
      const result = await cmd.execute();

      const data = result.data as OverviewResult;
      expect(data.servers[0].status).toBe('error');
      expect(data.servers[0].error).toBe('Connection refused');
    });

    it('returns error status on timeout', async () => {
      mockServerManager.listServers.mockReturnValue([
        { id: 'server-1', name: 'Production', host: 'fm.example.com', port: 443 },
      ]);
      mockCredentialsManager.listCredentials.mockResolvedValue([
        { serverId: 'server-1', database: 'TestDB', username: 'admin' },
      ]);
      mockCredentialsManager.getCredentials.mockResolvedValue('password123');
      mockAxiosGet.mockRejectedValue({ code: 'ETIMEDOUT' });

      const cmd = new OverviewCommand({ output: 'table' });
      const result = await cmd.execute();

      const data = result.data as OverviewResult;
      expect(data.servers[0].status).toBe('error');
      expect(data.servers[0].error).toBe('Connection timeout');
    });

    it('returns error status on host not found', async () => {
      mockServerManager.listServers.mockReturnValue([
        { id: 'server-1', name: 'Production', host: 'fm.example.com', port: 443 },
      ]);
      mockCredentialsManager.listCredentials.mockResolvedValue([
        { serverId: 'server-1', database: 'TestDB', username: 'admin' },
      ]);
      mockCredentialsManager.getCredentials.mockResolvedValue('password123');
      mockAxiosGet.mockRejectedValue({ code: 'ENOTFOUND' });

      const cmd = new OverviewCommand({ output: 'table' });
      const result = await cmd.execute();

      const data = result.data as OverviewResult;
      expect(data.servers[0].error).toBe('Host not found');
    });

    it('returns error status on authentication failure', async () => {
      mockServerManager.listServers.mockReturnValue([
        { id: 'server-1', name: 'Production', host: 'fm.example.com', port: 443 },
      ]);
      mockCredentialsManager.listCredentials.mockResolvedValue([
        { serverId: 'server-1', database: 'TestDB', username: 'admin' },
      ]);
      mockCredentialsManager.getCredentials.mockResolvedValue('wrong-password');
      mockAxiosGet.mockRejectedValue({ response: { status: 401 } });

      const cmd = new OverviewCommand({ output: 'table' });
      const result = await cmd.execute();

      const data = result.data as OverviewResult;
      expect(data.servers[0].status).toBe('error');
      expect(data.servers[0].error).toBe('Authentication failed');
    });

    it('returns error status on server error (500)', async () => {
      mockServerManager.listServers.mockReturnValue([
        { id: 'server-1', name: 'Production', host: 'fm.example.com', port: 443 },
      ]);
      mockCredentialsManager.listCredentials.mockResolvedValue([
        { serverId: 'server-1', database: 'TestDB', username: 'admin' },
      ]);
      mockCredentialsManager.getCredentials.mockResolvedValue('password123');
      mockAxiosGet.mockRejectedValue({ response: { status: 500 } });

      const cmd = new OverviewCommand({ output: 'table' });
      const result = await cmd.execute();

      const data = result.data as OverviewResult;
      expect(data.servers[0].error).toBe('Server error');
    });

    it('handles multiple servers with mixed statuses', async () => {
      mockServerManager.listServers.mockReturnValue([
        { id: 's1', name: 'Prod', host: 'prod.fm.example.com', port: 443 },
        { id: 's2', name: 'Dev', host: 'dev.fm.example.com', port: 443 },
      ]);
      // s1: has credentials, connects fine
      mockCredentialsManager.listCredentials
        .mockResolvedValueOnce([{ serverId: 's1', database: 'ProdDB', username: 'admin' }])
        .mockResolvedValueOnce([]); // s2: no credentials

      mockCredentialsManager.getCredentials.mockResolvedValue('password123');

      mockAxiosGet.mockResolvedValueOnce({
        data: { value: [{ name: 'ProdDB' }] },
      });
      mockAxiosGet.mockResolvedValueOnce({
        data: '<?xml version="1.0"?><EntitySet Name="Contacts"/>',
      });

      const cmd = new OverviewCommand({ output: 'table' });
      const result = await cmd.execute();

      const data = result.data as OverviewResult;
      expect(data.totalServers).toBe(2);
      expect(data.connectedServers).toBe(1);
      expect(data.errorServers).toBe(1);
      expect(data.servers[0].status).toBe('connected');
      expect(data.servers[1].status).toBe('no-credentials');
      expect(data.totalDatabases).toBe(1);
      expect(data.totalTables).toBe(1);
    });

    it('uses port 443 as default when not specified', async () => {
      mockServerManager.listServers.mockReturnValue([
        { id: 's1', name: 'Prod', host: 'fm.example.com' }, // no port
      ]);
      mockCredentialsManager.listCredentials.mockResolvedValue([
        { serverId: 's1', database: 'DB', username: 'admin' },
      ]);
      mockCredentialsManager.getCredentials.mockResolvedValue('pw');
      mockAxiosGet.mockResolvedValueOnce({ data: { value: [] } });

      const cmd = new OverviewCommand({ output: 'table' });
      const result = await cmd.execute();

      const data = result.data as OverviewResult;
      expect(data.servers[0].port).toBe(443);
    });

    it('uses http protocol for non-443 ports', async () => {
      mockServerManager.listServers.mockReturnValue([
        { id: 's1', name: 'Dev', host: 'dev.local', port: 8080 },
      ]);
      mockCredentialsManager.listCredentials.mockResolvedValue([
        { serverId: 's1', database: 'DB', username: 'admin' },
      ]);
      mockCredentialsManager.getCredentials.mockResolvedValue('pw');
      mockAxiosGet.mockResolvedValueOnce({ data: { value: [] } });

      const cmd = new OverviewCommand({ output: 'table' });
      await cmd.execute();

      // Verify the URL used http protocol
      expect(mockAxiosGet).toHaveBeenCalledWith(
        expect.stringContaining('http://dev.local:8080'),
        expect.any(Object)
      );
    });

    it('gracefully handles database metadata fetch errors', async () => {
      mockServerManager.listServers.mockReturnValue([
        { id: 's1', name: 'Prod', host: 'fm.example.com', port: 443 },
      ]);
      mockCredentialsManager.listCredentials.mockResolvedValue([
        { serverId: 's1', database: 'DB', username: 'admin' },
      ]);
      mockCredentialsManager.getCredentials.mockResolvedValue('password123');

      // Service document: one database
      mockAxiosGet.mockResolvedValueOnce({
        data: { value: [{ name: 'ProdDB' }] },
      });
      // Metadata: fails for this database
      mockAxiosGet.mockRejectedValueOnce({ code: 'ETIMEDOUT' });

      const cmd = new OverviewCommand({ output: 'table' });
      const result = await cmd.execute();

      const data = result.data as OverviewResult;
      expect(data.servers[0].status).toBe('connected');
      expect(data.servers[0].databases).toHaveLength(1);
      expect(data.servers[0].databases[0].name).toBe('ProdDB');
      expect(data.servers[0].databases[0].error).toBe('Connection timeout');
      expect(data.servers[0].databases[0].tableCount).toBe(0);
    });
  });

  // ─── formatOutput() ─────────────────────────────────────────────────────────

  describe('formatOutput', () => {
    const sampleData: OverviewResult = {
      servers: [
        {
          id: 's1',
          name: 'Production',
          host: 'fm.example.com',
          port: 443,
          status: 'connected' as const,
          latency: 42,
          databases: [
            { name: 'MainDB', tableCount: 12, tables: ['Contacts', 'Orders', 'Products'] },
          ],
          databaseCount: 1,
          tableCount: 12,
        },
      ],
      totalServers: 1,
      totalDatabases: 1,
      totalTables: 12,
      connectedServers: 1,
      errorServers: 0,
      generatedAt: '2026-04-24T10:00:00Z',
    };

    it('formats heading with fmo Overview', () => {
      const cmd = new OverviewCommand({ output: 'table' });
      const output = cmd.formatOutput(sampleData);
      const plain = stripAnsi(output);
      expect(plain).toContain('fmo Overview');
    });

    it('shows server name, host, and status', () => {
      const cmd = new OverviewCommand({ output: 'table' });
      const output = cmd.formatOutput(sampleData);
      const plain = stripAnsi(output);
      expect(plain).toContain('Production');
      expect(plain).toContain('fm.example.com:443');
      expect(plain).toContain('Connected');
    });

    it('shows latency for connected servers', () => {
      const cmd = new OverviewCommand({ output: 'table' });
      const output = cmd.formatOutput(sampleData);
      const plain = stripAnsi(output);
      expect(plain).toContain('42ms');
    });

    it('shows database counts and table counts', () => {
      const cmd = new OverviewCommand({ output: 'table' });
      const output = cmd.formatOutput(sampleData);
      const plain = stripAnsi(output);
      expect(plain).toContain('Servers: 1');
      expect(plain).toContain('Databases: 1');
      expect(plain).toContain('Tables: 12');
    });

    it('formats server with error status', () => {
      const data: OverviewResult = {
        ...sampleData,
        servers: [
          {
            id: 's1',
            name: 'Prod',
            host: 'bad.example.com',
            port: 443,
            status: 'error' as const,
            error: 'Connection refused',
            databases: [],
            databaseCount: 0,
            tableCount: 0,
          },
        ],
        connectedServers: 0,
        errorServers: 1,
      };
      const cmd = new OverviewCommand({ output: 'table' });
      const output = cmd.formatOutput(data);
      const plain = stripAnsi(output);
      expect(plain).toContain('Connection refused');
    });

    it('formats server with no-credentials status', () => {
      const data: OverviewResult = {
        ...sampleData,
        servers: [
          {
            id: 's1',
            name: 'Dev',
            host: 'dev.example.com',
            port: 443,
            status: 'no-credentials' as const,
            error: 'No credentials stored',
            databases: [],
            databaseCount: 0,
            tableCount: 0,
          },
        ],
        connectedServers: 0,
        errorServers: 1,
      };
      const cmd = new OverviewCommand({ output: 'table' });
      const output = cmd.formatOutput(data);
      const plain = stripAnsi(output);
      expect(plain).toContain('No credentials');
    });

    it('formats empty result with warning', () => {
      const cmd = new OverviewCommand({ output: 'table' });
      const data: OverviewResult = {
        servers: [],
        totalServers: 0,
        totalDatabases: 0,
        totalTables: 0,
        connectedServers: 0,
        errorServers: 0,
        generatedAt: '2026-04-24T10:00:00Z',
      };
      const output = cmd.formatOutput(data);
      const plain = stripAnsi(output);
      expect(plain).toContain('No servers configured');
    });

    it('shows detailed table listing when detailed option is set', () => {
      const cmd = new OverviewCommand({ output: 'table', detailed: true });
      const output = cmd.formatOutput(sampleData);
      const plain = stripAnsi(output);
      expect(plain).toContain('MainDB');
      expect(plain).toContain('Contacts');
      expect(plain).toContain('Orders');
      expect(plain).toContain('Products');
    });

    it('shows compact database table by default (no --detailed)', () => {
      const cmd = new OverviewCommand({ output: 'table' });
      const output = cmd.formatOutput(sampleData);
      const plain = stripAnsi(output);
      expect(plain).toContain('MainDB');
      // Should show table header "Database"
      expect(plain).toContain('Database');
    });
  });

  // ─── formatJsonl() ───────────────────────────────────────────────────────────

  describe('formatJsonl', () => {
    it('outputs one JSON line per server', () => {
      const cmd = new OverviewCommand({ output: 'jsonl' });
      const data: OverviewResult = {
        servers: [
          {
            id: 's1',
            name: 'Prod',
            host: 'fm.example.com',
            port: 443,
            status: 'connected' as const,
            latency: 42,
            databases: [{ name: 'DB1', tableCount: 5, tables: ['T1', 'T2', 'T3', 'T4', 'T5'] }],
            databaseCount: 1,
            tableCount: 5,
          },
          {
            id: 's2',
            name: 'Dev',
            host: 'dev.example.com',
            port: 443,
            status: 'error' as const,
            error: 'Connection refused',
            databases: [],
            databaseCount: 0,
            tableCount: 0,
          },
        ],
        totalServers: 2,
        totalDatabases: 1,
        totalTables: 5,
        connectedServers: 1,
        errorServers: 1,
        generatedAt: '2026-04-24T10:00:00Z',
      };

      const jsonl = cmd['formatJsonl'](data);
      const lines = jsonl.split('\n');

      expect(lines).toHaveLength(2);

      const s1 = JSON.parse(lines[0]);
      expect(s1.id).toBe('s1');
      expect(s1.name).toBe('Prod');
      expect(s1.latency).toBe(42);
      expect(s1.databases).toHaveLength(1);

      const s2 = JSON.parse(lines[1]);
      expect(s2.id).toBe('s2');
      expect(s2.status).toBe('error');
      expect(s2.latency).toBeNull();
    });
  });

  // ─── run() ───────────────────────────────────────────────────────────────────

  describe('run', () => {
    it('returns 0 when all servers are connected', async () => {
      mockServerManager.listServers.mockReturnValue([
        { id: 's1', name: 'Prod', host: 'fm.example.com', port: 443 },
      ]);
      mockCredentialsManager.listCredentials.mockResolvedValue([
        { serverId: 's1', database: 'TestDB', username: 'admin' },
      ]);
      mockCredentialsManager.getCredentials.mockResolvedValue('password123');
      mockAxiosGet.mockResolvedValue({ data: { value: [] } });

      const cmd = new OverviewCommand({ output: 'table' });
      const exitCode = await cmd.run();

      expect(exitCode).toBe(0);
    });

    it('returns 1 when any server has errors', async () => {
      mockServerManager.listServers.mockReturnValue([
        { id: 's1', name: 'Prod', host: 'fm.example.com', port: 443 },
      ]);
      mockCredentialsManager.listCredentials.mockResolvedValue([
        { serverId: 's1', database: 'TestDB', username: 'admin' },
      ]);
      mockCredentialsManager.getCredentials.mockResolvedValue('password123');
      mockAxiosGet.mockRejectedValue({ code: 'ECONNREFUSED' });

      const cmd = new OverviewCommand({ output: 'table' });
      const exitCode = await cmd.run();

      expect(exitCode).toBe(1);
    });

    it('returns 0 when no servers configured', async () => {
      mockServerManager.listServers.mockReturnValue([]);

      const cmd = new OverviewCommand({ output: 'table' });
      const exitCode = await cmd.run();

      expect(exitCode).toBe(0);
    });
  });
});