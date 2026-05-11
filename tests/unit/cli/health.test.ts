/**
 * Unit Tests for Health Command
 *
 * Tests health check functionality for configured servers.
 *
 * @module tests/unit/cli/health.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HealthCommand } from '../../../src/cli/health';
import { ODataClient } from '../../../src/api/client';
import { ServerManager } from '../../../src/config/servers';
import { CredentialsManager } from '../../../src/config/credentials';
import {
  AuthenticationError,
  NotFoundError,
  ODataError,
} from '../../../src/api/errors';
import { stripAnsi } from '../../../src/lib/theme';

vi.mock('../../../src/config/servers');
vi.mock('../../../src/config/credentials');
vi.mock('../../../src/api/client');

describe('HealthCommand', () => {
  let mockServerManager: { listServers: ReturnType<typeof vi.fn> };
  let mockCredentialsManager: {
    listCredentials: ReturnType<typeof vi.fn>;
    getCredentials: ReturnType<typeof vi.fn>;
  };
  let mockGetServiceDocument: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockServerManager = { listServers: vi.fn() };
    mockCredentialsManager = {
      listCredentials: vi.fn(),
      getCredentials: vi.fn(),
    };
    mockGetServiceDocument = vi.fn();

    vi.mocked(ServerManager).mockImplementation(() => mockServerManager as never);
    vi.mocked(CredentialsManager).mockImplementation(() => mockCredentialsManager as never);
    vi.mocked(ODataClient).mockImplementation(
      () => ({ getServiceDocument: mockGetServiceDocument } as never)
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('execute', () => {
    it('returns healthy status when all servers are reachable', async () => {
      mockServerManager.listServers.mockReturnValue([
        { id: 'server-1', name: 'Production', host: 'fm.example.com', port: 443 },
        { id: 'server-2', name: 'Development', host: 'dev.example.com', port: 443 },
      ]);
      mockCredentialsManager.listCredentials.mockResolvedValue([
        { serverId: 'server-1', database: 'TestDB', username: 'admin' },
      ]);
      mockCredentialsManager.getCredentials.mockResolvedValue('password123');
      mockGetServiceDocument.mockResolvedValue([]);

      const cmd = new HealthCommand({ output: 'table' });
      const result = await cmd.execute();

      expect(result.total).toBe(2);
      expect(result.healthy).toBe(2);
      expect(result.unhealthy).toBe(0);
      expect(result.servers).toHaveLength(2);
      expect(result.servers[0].status).toBe('ok');
      expect(result.servers[1].status).toBe('ok');
    });

    it('returns no-credentials status when no credentials stored', async () => {
      mockServerManager.listServers.mockReturnValue([
        { id: 'server-1', name: 'Production', host: 'fm.example.com', port: 443 },
      ]);
      mockCredentialsManager.listCredentials.mockResolvedValue([]);

      const cmd = new HealthCommand({ output: 'table' });
      const result = await cmd.execute();

      expect(result.total).toBe(1);
      expect(result.healthy).toBe(0);
      expect(result.unhealthy).toBe(1);
      expect(result.servers[0].status).toBe('no-credentials');
      expect(result.servers[0].error).toBe('No credentials stored');
    });

    it('returns error status when connection fails (ECONNREFUSED)', async () => {
      mockServerManager.listServers.mockReturnValue([
        { id: 'server-1', name: 'Production', host: 'fm.example.com', port: 443 },
      ]);
      mockCredentialsManager.listCredentials.mockResolvedValue([
        { serverId: 'server-1', database: 'TestDB', username: 'admin' },
      ]);
      mockCredentialsManager.getCredentials.mockResolvedValue('password123');
      mockGetServiceDocument.mockRejectedValue(new ODataError('connect ECONNREFUSED 127.0.0.1:443', 500));

      const cmd = new HealthCommand({ output: 'table' });
      const result = await cmd.execute();

      expect(result.servers[0].status).toBe('error');
      expect(result.servers[0].error).toBe('Connection refused');
    });

    it('returns error status on timeout', async () => {
      mockServerManager.listServers.mockReturnValue([
        { id: 'server-1', name: 'Production', host: 'fm.example.com', port: 443 },
      ]);
      mockCredentialsManager.listCredentials.mockResolvedValue([
        { serverId: 'server-1', database: 'TestDB', username: 'admin' },
      ]);
      mockCredentialsManager.getCredentials.mockResolvedValue('password123');
      mockGetServiceDocument.mockRejectedValue(new ODataError('connect ETIMEDOUT 10.0.0.1:443', 500));

      const cmd = new HealthCommand({ output: 'table' });
      const result = await cmd.execute();

      expect(result.servers[0].status).toBe('error');
      expect(result.servers[0].error).toBe('Connection timeout');
    });

    it('returns error status on host not found', async () => {
      mockServerManager.listServers.mockReturnValue([
        { id: 'server-1', name: 'Production', host: 'fm.example.com', port: 443 },
      ]);
      mockCredentialsManager.listCredentials.mockResolvedValue([
        { serverId: 'server-1', database: 'TestDB', username: 'admin' },
      ]);
      mockCredentialsManager.getCredentials.mockResolvedValue('password123');
      mockGetServiceDocument.mockRejectedValue(
        new ODataError('getaddrinfo ENOTFOUND fm.example.com', 500)
      );

      const cmd = new HealthCommand({ output: 'table' });
      const result = await cmd.execute();

      expect(result.servers[0].status).toBe('error');
      expect(result.servers[0].error).toBe('Host not found');
    });

    it('returns error status on authentication failure', async () => {
      mockServerManager.listServers.mockReturnValue([
        { id: 'server-1', name: 'Production', host: 'fm.example.com', port: 443 },
      ]);
      mockCredentialsManager.listCredentials.mockResolvedValue([
        { serverId: 'server-1', database: 'TestDB', username: 'admin' },
      ]);
      mockCredentialsManager.getCredentials.mockResolvedValue('password123');
      mockGetServiceDocument.mockRejectedValue(new AuthenticationError('Unauthorized', {}));

      const cmd = new HealthCommand({ output: 'table' });
      const result = await cmd.execute();

      expect(result.servers[0].status).toBe('error');
      expect(result.servers[0].error).toBe('Authentication failed');
    });

    it('returns error status on server error', async () => {
      mockServerManager.listServers.mockReturnValue([
        { id: 'server-1', name: 'Production', host: 'fm.example.com', port: 443 },
      ]);
      mockCredentialsManager.listCredentials.mockResolvedValue([
        { serverId: 'server-1', database: 'TestDB', username: 'admin' },
      ]);
      mockCredentialsManager.getCredentials.mockResolvedValue('password123');
      mockGetServiceDocument.mockRejectedValue(new ODataError('Internal server error', 500));

      const cmd = new HealthCommand({ output: 'table' });
      const result = await cmd.execute();

      expect(result.servers[0].status).toBe('error');
      expect(result.servers[0].error).toBe('Server error');
    });

    it('returns empty result when no servers configured', async () => {
      mockServerManager.listServers.mockReturnValue([]);

      const cmd = new HealthCommand({ output: 'table' });
      const result = await cmd.execute();

      expect(result.total).toBe(0);
      expect(result.healthy).toBe(0);
      expect(result.unhealthy).toBe(0);
      expect(result.servers).toHaveLength(0);
    });

    it('includes latency when connection successful', async () => {
      mockServerManager.listServers.mockReturnValue([
        { id: 'server-1', name: 'Production', host: 'fm.example.com', port: 443 },
      ]);
      mockCredentialsManager.listCredentials.mockResolvedValue([
        { serverId: 'server-1', database: 'TestDB', username: 'admin' },
      ]);
      mockCredentialsManager.getCredentials.mockResolvedValue('password123');
      mockGetServiceDocument.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([]), 10))
      );

      const cmd = new HealthCommand({ output: 'table' });
      const result = await cmd.execute();

      expect(result.servers[0].latency).toBeDefined();
      expect(result.servers[0].latency).toBeGreaterThanOrEqual(1);
    });

    it('returns 404 as Database not found', async () => {
      mockServerManager.listServers.mockReturnValue([
        { id: 'server-1', name: 'Production', host: 'fm.example.com', port: 443 },
      ]);
      mockCredentialsManager.listCredentials.mockResolvedValue([
        { serverId: 'server-1', database: 'TestDB', username: 'admin' },
      ]);
      mockCredentialsManager.getCredentials.mockResolvedValue('password123');
      mockGetServiceDocument.mockRejectedValue(new NotFoundError('Not found', {}));

      const cmd = new HealthCommand({ output: 'table' });
      const result = await cmd.execute();

      expect(result.servers[0].error).toBe('Database not found');
    });
  });

  describe('formatOutput', () => {
    it('formats healthy servers with checkmarks', () => {
      const cmd = new HealthCommand({ output: 'table' });
      const result = {
        servers: [
          {
            id: 's1',
            name: 'Prod',
            host: 'fm.example.com',
            port: 443,
            status: 'ok' as const,
            latency: 50,
          },
        ],
        healthy: 1,
        unhealthy: 0,
        total: 1,
        generatedAt: '2026-04-05T16:30:00Z',
      };

      const output = cmd.formatOutput(result);
      const plain = stripAnsi(output);
      expect(plain).toContain('Prod');
      expect(plain).toContain('Connected');
      expect(plain).toContain('50ms');
      expect(plain).toContain('Healthy: 1');
    });

    it('formats unhealthy servers with X marks', () => {
      const cmd = new HealthCommand({ output: 'table' });
      const result = {
        servers: [
          {
            id: 's1',
            name: 'Prod',
            host: 'fm.example.com',
            port: 443,
            status: 'error' as const,
            error: 'Connection refused',
          },
        ],
        healthy: 0,
        unhealthy: 1,
        total: 1,
        generatedAt: '2026-04-05T16:30:00Z',
      };

      const output = cmd.formatOutput(result);
      const plain = stripAnsi(output);
      expect(plain).toContain('Prod');
      expect(plain).toContain('Connection refused');
      expect(plain).toContain('Unhealthy: 1');
    });

    it('formats no-credentials status with warning', () => {
      const cmd = new HealthCommand({ output: 'table' });
      const result = {
        servers: [
          {
            id: 's1',
            name: 'Prod',
            host: 'fm.example.com',
            port: 443,
            status: 'no-credentials' as const,
            error: 'No credentials stored',
          },
        ],
        healthy: 0,
        unhealthy: 1,
        total: 1,
        generatedAt: '2026-04-05T16:30:00Z',
      };

      expect(stripAnsi(cmd.formatOutput(result))).toContain('No credentials');
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

      expect(stripAnsi(cmd.formatOutput(result))).toContain('No servers configured');
    });
  });

  describe('run', () => {
    it('returns 0 when all servers are healthy', async () => {
      mockServerManager.listServers.mockReturnValue([
        { id: 's1', name: 'Prod', host: 'fm.example.com', port: 443 },
      ]);
      mockCredentialsManager.listCredentials.mockResolvedValue([
        { serverId: 's1', database: 'TestDB', username: 'admin' },
      ]);
      mockCredentialsManager.getCredentials.mockResolvedValue('password123');
      mockGetServiceDocument.mockResolvedValue([]);

      const exitCode = await new HealthCommand({ output: 'table' }).run();
      expect(exitCode).toBe(0);
    });

    it('returns 1 when any server is unhealthy', async () => {
      mockServerManager.listServers.mockReturnValue([
        { id: 's1', name: 'Prod', host: 'fm.example.com', port: 443 },
      ]);
      mockCredentialsManager.listCredentials.mockResolvedValue([
        { serverId: 's1', database: 'TestDB', username: 'admin' },
      ]);
      mockCredentialsManager.getCredentials.mockResolvedValue('password123');
      mockGetServiceDocument.mockRejectedValue(new ODataError('connect ECONNREFUSED 127.0.0.1:443', 500));

      const exitCode = await new HealthCommand({ output: 'table' }).run();
      expect(exitCode).toBe(1);
    });

    it('returns 0 when no servers configured', async () => {
      mockServerManager.listServers.mockReturnValue([]);
      const exitCode = await new HealthCommand({ output: 'table' }).run();
      expect(exitCode).toBe(0);
    });
  });
});
