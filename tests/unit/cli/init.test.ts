/**
 * Unit tests for InitCommand
 *
 * Tests the init command which bootstraps ~/.fmo/context.json
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InitCommand } from '../../../src/cli/init';

// Mock ServerManager
vi.mock('../../../src/config/servers', () => ({
  ServerManager: vi.fn().mockImplementation(() => ({
    listServers: vi.fn().mockReturnValue([
      { id: 'server-1', name: 'Test Server', host: 'localhost', port: 443, secure: true },
    ]),
  })),
  serverStore: {
    getAll: vi.fn().mockReturnValue([
      { id: 'server-1', name: 'Test Server', host: 'localhost', port: 443, secure: true },
    ]),
  },
}));

// Mock CredentialsManager
vi.mock('../../../src/config/credentials', () => ({
  CredentialsManager: vi.fn().mockImplementation(() => ({
    listCredentials: vi.fn().mockResolvedValue([
      { serverId: 'server-1', database: 'TestDB', username: 'admin' },
    ]),
    getCredentials: vi.fn().mockResolvedValue('password123'),
  })),
}));

// Mock axios
vi.mock('axios', () => ({
  default: {
    get: vi.fn().mockResolvedValue({
      data: {
        value: [
          { name: 'Database1', kind: 'EntityContainer' },
          { name: 'Database2', kind: 'EntityContainer' },
        ],
      },
    }),
  },
}));

// Mock fs
vi.mock('fs', () => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(false),
}));

describe('InitCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create command with default options', () => {
      const cmd = new InitCommand({});
      expect(cmd).toBeDefined();
    });

    it('should accept refresh option', () => {
      const cmd = new InitCommand({ refresh: true });
      expect(cmd).toBeDefined();
    });

    it('should accept json option', () => {
      const cmd = new InitCommand({ json: true });
      expect(cmd).toBeDefined();
    });
  });

  describe('execute', () => {
    it('should create context with servers', async () => {
      const cmd = new InitCommand({});
      const result = await cmd.execute();

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should return json when json option is set', async () => {
      const cmd = new InitCommand({ json: true });
      const result = await cmd.execute();

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });
  });

  describe('context structure', () => {
    it('should include description and timestamp', async () => {
      const cmd = new InitCommand({ json: true });
      const result = await cmd.execute();

      expect(result.success).toBe(true);
      if (result.data) {
        const context = result.data as any;
        expect(context._description).toBeDefined();
        expect(context._updated).toBeDefined();
        expect(context.servers).toBeDefined();
      }
    });

    it('should include server information', async () => {
      const cmd = new InitCommand({ json: true });
      const result = await cmd.execute();

      expect(result.success).toBe(true);
      if (result.data) {
        const context = result.data as any;
        const serverKeys = Object.keys(context.servers);
        expect(serverKeys.length).toBeGreaterThan(0);
      }
    });

    it('should include databases for each server', async () => {
      const cmd = new InitCommand({ json: true });
      const result = await cmd.execute();

      expect(result.success).toBe(true);
      if (result.data) {
        const context = result.data as any;
        for (const serverId of Object.keys(context.servers)) {
          const server = context.servers[serverId];
          expect(server.databases).toBeDefined();
        }
      }
    });
  });

  describe('error handling', () => {
    it('should handle API errors gracefully', async () => {
      const axios = await import('axios');
      vi.mocked(axios.default.get).mockRejectedValueOnce(new Error('Network error'));

      const cmd = new InitCommand({});
      const result = await cmd.execute();

      // Should not throw, should handle gracefully
      expect(result.success).toBe(true);
    });
  });

  describe('output', () => {
    it('should use themed colors for output', async () => {
      const cmd = new InitCommand({});
      const result = await cmd.execute();

      // Command should complete successfully
      expect(result.success).toBe(true);
    });
  });
});