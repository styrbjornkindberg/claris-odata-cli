/**
 * Server Configuration Management
 *
 * Manages FileMaker server configurations stored locally.
 *
 * @module config/servers
 */

import type { Server } from '../types';

/**
 * In-memory server store (placeholder for persistent storage)
 *
 * TODO: Implement persistent storage using the `conf` package.
 * TODO: Consider encryption for sensitive server details.
 */
class ServerStore {
  private servers: Map<string, Server> = new Map();

  /**
   * Add or update a server configuration
   *
   * @param server - Server configuration
   */
  set(server: Server): void {
    this.servers.set(server.id, server);
  }

  /**
   * Get a server by ID
   *
   * @param id - Server ID
   * @returns Server configuration or undefined
   */
  get(id: string): Server | undefined {
    return this.servers.get(id);
  }

  /**
   * Get all configured servers
   *
   * @returns Array of servers
   */
  getAll(): Server[] {
    return Array.from(this.servers.values());
  }

  /**
   * Remove a server configuration
   *
   * @param id - Server ID
   * @returns Whether the server was removed
   */
  delete(id: string): boolean {
    return this.servers.delete(id);
  }

  /**
   * Check if a server exists
   *
   * @param id - Server ID
   * @returns Whether the server exists
   */
  has(id: string): boolean {
    return this.servers.has(id);
  }
}

/**
 * Default server store instance
 */
export const serverStore = new ServerStore();

/**
 * Server configuration manager
 *
 * Provides high-level server management functions.
 */
export class ServerManager {
  /**
   * Add a new server configuration
   *
   * @param config - Server configuration
   * @returns The added server
   */
  addServer(config: Omit<Server, 'id'>): Server {
    const id = this.generateId(config.name);
    const server: Server = {
      ...config,
      id,
      secure: config.secure ?? true,
      port: config.port ?? 443,
    };

    serverStore.set(server);
    return server;
  }

  /**
   * Get a server by ID
   *
   * @param id - Server ID
   * @returns Server configuration or undefined
   */
  getServer(id: string): Server | undefined {
    return serverStore.get(id);
  }

  /**
   * Get all configured servers
   *
   * @returns Array of servers
   */
  listServers(): Server[] {
    return serverStore.getAll();
  }

  /**
   * Remove a server configuration
   *
   * @param id - Server ID
   * @returns Whether the server was removed
   */
  removeServer(id: string): boolean {
    return serverStore.delete(id);
  }

  /**
   * Generate a unique ID for a server
   *
   * @param name - Server name
   * @returns Unique ID
   */
  private generateId(name: string): string {
    const sanitized = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const timestamp = Date.now().toString(36);
    return `${sanitized}-${timestamp}`;
  }
}