/**
 * Tests for Server Configuration
 *
 * @module tests/unit/servers.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { buildServerId, ServerManager, serverStore } from '../../src/config/servers';

describe('buildServerId', () => {
  it('returns the same ID for the same name and host', () => {
    const id1 = buildServerId('tethys', 'tethys.squaremoon.se');
    const id2 = buildServerId('tethys', 'tethys.squaremoon.se');
    expect(id1).toBe(id2);
  });

  it('returns different IDs for different hosts', () => {
    const id1 = buildServerId('prod', 'host1.example.com');
    const id2 = buildServerId('prod', 'host2.example.com');
    expect(id1).not.toBe(id2);
  });

  it('returns different IDs for different names with same host', () => {
    const id1 = buildServerId('prod', 'example.com');
    const id2 = buildServerId('staging', 'example.com');
    expect(id1).not.toBe(id2);
  });

  it('formats as slug-8hexchars', () => {
    const id = buildServerId('My Server', 'example.com');
    expect(id).toMatch(/^[a-z0-9][a-z0-9-]*-[a-f0-9]{8}$/);
  });

  it('sanitizes special characters in name slug', () => {
    const id = buildServerId('My Server!!', 'example.com');
    expect(id).not.toMatch(/[^a-z0-9-]/);
  });
});

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

    it('generates the same ID for the same name and host', () => {
      const s1 = manager.addServer({ name: 'Prod', host: 'fms.example.com' });
      serverStore.delete(s1.id);
      const s2 = manager.addServer({ name: 'Prod', host: 'fms.example.com' });
      expect(s1.id).toBe(s2.id);
    });

    it('overwrites an existing server when re-added with same name+host', () => {
      manager.addServer({ name: 'Prod', host: 'fms.example.com', port: 443 });
      const updated = manager.addServer({ name: 'Prod', host: 'fms.example.com', port: 8080 });
      expect(updated.port).toBe(8080);
      expect(manager.listServers()).toHaveLength(1);
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
