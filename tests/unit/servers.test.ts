/**
 * Tests for Server Configuration
 *
 * @module tests/unit/servers.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ServerManager, serverStore } from '../../src/config/servers';

describe('ServerManager', () => {
  let manager: ServerManager;

  beforeEach(() => {
    manager = new ServerManager();
    // Clear all servers
    const servers = serverStore.getAll();
    for (const server of servers) {
      serverStore.delete(server.id);
    }
  });

  describe('addServer', () => {
    it('should add a server with generated ID', () => {
      const server = manager.addServer({
        name: 'Production',
        host: 'fms.example.com',
      });

      expect(server.id).toBeDefined();
      expect(server.name).toBe('Production');
      expect(server.host).toBe('fms.example.com');
    });

    it('should set default values', () => {
      const server = manager.addServer({
        name: 'Test',
        host: 'test.local',
      });

      expect(server.secure).toBe(true);
      expect(server.port).toBe(443);
    });

    it('should allow custom port and secure', () => {
      const server = manager.addServer({
        name: 'Dev',
        host: 'dev.local',
        port: 8080,
        secure: false,
      });

      expect(server.port).toBe(8080);
      expect(server.secure).toBe(false);
    });
  });

  describe('getServer', () => {
    it('should return server by ID', () => {
      const added = manager.addServer({
        name: 'Production',
        host: 'fms.example.com',
      });

      const retrieved = manager.getServer(added.id);
      expect(retrieved).toEqual(added);
    });

    it('should return undefined for unknown ID', () => {
      const server = manager.getServer('unknown-id');
      expect(server).toBeUndefined();
    });
  });

  describe('listServers', () => {
    it('should return all servers', () => {
      manager.addServer({ name: 'Server 1', host: 's1.local' });
      manager.addServer({ name: 'Server 2', host: 's2.local' });

      const servers = manager.listServers();
      expect(servers).toHaveLength(2);
    });
  });

  describe('removeServer', () => {
    it('should remove server by ID', () => {
      const server = manager.addServer({
        name: 'Test',
        host: 'test.local',
      });

      const removed = manager.removeServer(server.id);
      expect(removed).toBe(true);

      const retrieved = manager.getServer(server.id);
      expect(retrieved).toBeUndefined();
    });

    it('should return false for unknown ID', () => {
      const removed = manager.removeServer('unknown-id');
      expect(removed).toBe(false);
    });
  });
});