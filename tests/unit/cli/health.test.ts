/**
 * Unit Tests for Health Command
 *
 * Tests health check functionality for configured servers.
 *
 * @module tests/unit/cli/health.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HealthCommand } from '../../../src/cli/health';
import { ServerManager } from '../../../src/config/servers';
import { CredentialsManager } from '../../../src/config/credentials';
import { ODataClient } from '../../../src/api/client';

// Mock dependencies
vi.mock('../../../src/config/servers');
vi.mock('../../../src/config/credentials');
vi.mock('../../../src/api/client');

describe('HealthCommand', () => {
  let mockServerManager: any;
  let mockCredentialsManager: any;

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

  describe('execute', () => {
    it('returns healthy status when all servers are reachable', async () => {
      // Setup
      mockServerManager.listServers.mockReturnValue([
        { id: 'server-1', name: 'Production', host: 'fm.example.com', port: 443 },
        { id: 'server-2', name: 'Development', host: 'dev.example.com', port: 443 },
      ]);
      mockCredentialsManager.listCredentials.mockResolvedValue([
        { serverId: 'server-1', database: 'TestDB', username: 'admin' },
        { serverId: 'server-2', database: 'TestDB', username: 'admin' },
      ]);
      mockCredentialsManager.getCredentials.mockResolvedValue('password123');

      // Mock axios
      vi.mock('axios', () => ({
        default: { get: vi.fn().mockResolvedValue({ data: {} }) }
      }));

      // Execute
      const cmd = new HealthCommand({ output: 'table' });
      const result = await cmd.execute();

      // Verify
      expect(result.total).toBe(2);
      expect(result.healthy).toBe(2);
      expect(result.unhealthy).toBe(0);
      expect(result.servers).toHaveLength(2);
      expect(result.servers[0].status).toBe('ok');
      expect(result.servers[1].status).toBe('ok');
    });

    it('returns no-credentials status when no credentials stored', async () => {
      // Setup
      mockServerManager.listServers.mockReturnValue([
        { id: 'server-1', name: 'Production', host: 'fm.example.com', port: 443 },
      ]);
      mockCredentialsManager.listCredentials.mockResolvedValue([]);

      // Execute
      const cmd = new HealthCommand({ output: 'table' });
      const result = await cmd.execute();

      // Verify
      expect(result.total).toBe(1);
      expect(result.healthy).toBe(0);
      expect(result.unhealthy).toBe(1);
      expect(result.servers[0].status).toBe('no-credentials');
      expect(result.servers[0].error).toBe('No credentials stored');
    });

    it('returns error status when connection fails', async () => {
      // Setup
      mockServerManager.listServers.mockReturnValue([
        { id: 'server-1', name: 'Production', host: 'fm.example.com', port: 443 },
      ]);
      mockCredentialsManager.getCredentials.mockReturnValue([
        { database: 'TestDB', username: 'admin', password: 'test' },
      ]);
      mockODataClient.get.mockRejectedValue({ code: 'ECONNREFUSED' });

      // Execute
      const cmd = new HealthCommand({ output: 'table' });
      const result = await cmd.execute();

      // Verify
      expect(result.total).toBe(1);
      expect(result.healthy).toBe(0);
      expect(result.unhealthy).toBe(1);
      expect(result.servers[0].status).toBe('error');
      expect(result.servers[0].error).toBe('Connection refused');
    });

    it('returns error status on timeout', async () => {
      // Setup
      mockServerManager.listServers.mockReturnValue([
        { id: 'server-1', name: 'Production', host: 'fm.example.com', port: 443 },
      ]);
      mockCredentialsManager.getCredentials.mockReturnValue([
        { database: 'TestDB', username: 'admin', password: 'test' },
      ]);
      mockODataClient.get.mockRejectedValue({ code: 'ETIMEDOUT' });

      // Execute
      const cmd = new HealthCommand({ output: 'table' });
      const result = await cmd.execute();

      // Verify
      expect(result.servers[0].status).toBe('error');
      expect(result.servers[0].error).toBe('Connection timeout');
    });

    it('returns error status on host not found', async () => {
      // Setup
      mockServerManager.listServers.mockReturnValue([
        { id: 'server-1', name: 'Production', host: 'fm.example.com', port: 443 },
      ]);
      mockCredentialsManager.getCredentials.mockReturnValue([
        { database: 'TestDB', username: 'admin', password: 'test' },
      ]);
      mockODataClient.get.mockRejectedValue({ code: 'ENOTFOUND' });

      // Execute
      const cmd = new HealthCommand({ output: 'table' });
      const result = await cmd.execute();

      // Verify
      expect(result.servers[0].status).toBe('error');
      expect(result.servers[0].error).toBe('Host not found');
    });

    it('returns error status on authentication failure', async () => {
      // Setup
      mockServerManager.listServers.mockReturnValue([
        { id: 'server-1', name: 'Production', host: 'fm.example.com', port: 443 },
      ]);
      mockCredentialsManager.getCredentials.mockReturnValue([
        { database: 'TestDB', username: 'admin', password: 'test' },
      ]);
      mockODataClient.get.mockRejectedValue({ response: { status: 401 } });

      // Execute
      const cmd = new HealthCommand({ output: 'table' });
      const result = await cmd.execute();

      // Verify
      expect(result.servers[0].status).toBe('error');
      expect(result.servers[0].error).toBe('Authentication failed');
    });

    it('returns error status on server error', async () => {
      // Setup
      mockServerManager.listServers.mockReturnValue([
        { id: 'server-1', name: 'Production', host: 'fm.example.com', port: 443 },
      ]);
      mockCredentialsManager.getCredentials.mockReturnValue([
        { database: 'TestDB', username: 'admin', password: 'test' },
      ]);
      mockODataClient.get.mockRejectedValue({ response: { status: 500 } });

      // Execute
      const cmd = new HealthCommand({ output: 'table' });
      const result = await cmd.execute();

      // Verify
      expect(result.servers[0].status).toBe('error');
      expect(result.servers[0].error).toBe('Server error');
    });

    it('returns empty result when no servers configured', async () => {
      // Setup
      mockServerManager.listServers.mockReturnValue([]);

      // Execute
      const cmd = new HealthCommand({ output: 'table' });
      const result = await cmd.execute();

      // Verify
      expect(result.total).toBe(0);
      expect(result.healthy).toBe(0);
      expect(result.unhealthy).toBe(0);
      expect(result.servers).toHaveLength(0);
    });

    it('includes latency when connection successful', async () => {
      // Setup
      mockServerManager.listServers.mockReturnValue([
        { id: 'server-1', name: 'Production', host: 'fm.example.com', port: 443 },
      ]);
      mockCredentialsManager.getCredentials.mockReturnValue([
        { database: 'TestDB', username: 'admin', password: 'test' },
      ]);
      mockODataClient.get.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ data: {} }), 10))
      );

      // Execute
      const cmd = new HealthCommand({ output: 'table' });
      const result = await cmd.execute();

      // Verify
      expect(result.servers[0].latency).toBeDefined();
      expect(result.servers[0].latency).toBeGreaterThanOrEqual(10);
    });
  });

  describe('formatOutput', () => {
    it('formats healthy servers with checkmarks', () => {
      const cmd = new HealthCommand({ output: 'table' });
      const result = {
        servers: [
          { id: 's1', name: 'Prod', host: 'fm.example.com', port: 443, status: 'ok' as const, latency: 50 },
        ],
        healthy: 1,
        unhealthy: 0,
        total: 1,
        generatedAt: '2026-04-05T16:30:00Z',
      };

      const output = cmd.formatOutput(result);

      expect(output).toContain('Prod');
      expect(output).toContain('Connected');
      expect(output).toContain('50ms');
      expect(output).toContain('Healthy: 1');
    });

    it('formats unhealthy servers with X marks', () => {
      const cmd = new HealthCommand({ output: 'table' });
      const result = {
        servers: [
          { id: 's1', name: 'Prod', host: 'fm.example.com', port: 443, status: 'error' as const, error: 'Connection refused' },
        ],
        healthy: 0,
        unhealthy: 1,
        total: 1,
        generatedAt: '2026-04-05T16:30:00Z',
      };

      const output = cmd.formatOutput(result);

      expect(output).toContain('Prod');
      expect(output).toContain('Connection refused');
      expect(output).toContain('Unhealthy: 1');
    });

    it('formats no-credentials status with warning', () => {
      const cmd = new HealthCommand({ output: 'table' });
      const result = {
        servers: [
          { id: 's1', name: 'Prod', host: 'fm.example.com', port: 443, status: 'no-credentials' as const, error: 'No credentials stored' },
        ],
        healthy: 0,
        unhealthy: 1,
        total: 1,
        generatedAt: '2026-04-05T16:30:00Z',
      };

      const output = cmd.formatOutput(result);

      // The status text is 'No credentials' (not the error message)
      expect(output).toContain('No credentials');
    });

    it('formats empty result with warning', () => {
      const cmd = new HealthCommand({ output: 'table' });
      const result = {
        servers: [],
        healthy: 0,
        unhealthy: 0,
        total: 0,
        generatedAt: '2026-04-05T16:30:00Z',
      };

      const output = cmd.formatOutput(result);

      expect(output).toContain('No servers configured');
    });
  });

  describe('formatJson', () => {
    it('outputs valid JSON with all fields', () => {
      const cmd = new HealthCommand({ output: 'json' });
      const result = {
        servers: [
          { id: 's1', name: 'Prod', host: 'fm.example.com', port: 443, status: 'ok' as const, latency: 50 },
        ],
        healthy: 1,
        unhealthy: 0,
        total: 1,
        generatedAt: '2026-04-05T16:30:00Z',
      };

      // Access the formatter's formatJson method
      const json = cmd['formatter'].formatJson(result);
      const parsed = JSON.parse(json);

      expect(parsed).toEqual(result);
    });
  });

  describe('run', () => {
    it('returns 0 when all servers are healthy', async () => {
      // Setup
      mockServerManager.listServers.mockReturnValue([
        { id: 's1', name: 'Prod', host: 'fm.example.com', port: 443 },
      ]);
      mockCredentialsManager.getCredentials.mockReturnValue([
        { database: 'TestDB', username: 'admin', password: 'test' },
      ]);
      mockODataClient.get.mockResolvedValue({ data: {} });

      // Execute
      const cmd = new HealthCommand({ output: 'table' });
      const exitCode = await cmd.run();

      // Verify
      expect(exitCode).toBe(0);
    });

    it('returns 1 when any server is unhealthy', async () => {
      // Setup
      mockServerManager.listServers.mockReturnValue([
        { id: 's1', name: 'Prod', host: 'fm.example.com', port: 443 },
      ]);
      mockCredentialsManager.getCredentials.mockReturnValue([
        { database: 'TestDB', username: 'admin', password: 'test' },
      ]);
      mockODataClient.get.mockRejectedValue({ code: 'ECONNREFUSED' });

      // Execute
      const cmd = new HealthCommand({ output: 'table' });
      const exitCode = await cmd.run();

      // Verify
      expect(exitCode).toBe(1);
    });

    it('returns 0 when no servers configured', async () => {
      // Setup
      mockServerManager.listServers.mockReturnValue([]);

      // Execute
      const cmd = new HealthCommand({ output: 'table' });
      const exitCode = await cmd.run();

      // Verify
      expect(exitCode).toBe(0);
    });
  });
});