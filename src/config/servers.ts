/**
 * Server Configuration Management
 *
 * Manages FileMaker server configurations stored locally.
 *
 * @module config/servers
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Server } from '../types';

const CONFIG_DIR = path.join(os.homedir(), '.config', 'claris-odata-cli');
const SERVERS_FILE = path.join(CONFIG_DIR, 'servers.json');

function readServers(): Record<string, Server> {
  try {
    const raw = fs.readFileSync(SERVERS_FILE, 'utf8');
    return JSON.parse(raw) as Record<string, Server>;
  } catch {
    return {};
  }
}

function writeServers(servers: Record<string, Server>): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(SERVERS_FILE, JSON.stringify(servers, null, 2), 'utf8');
}

/**
 * Persistent server store backed by ~/.config/claris-odata-cli/servers.json
 */
class ServerStore {
  /**
   * Add or update a server configuration
   *
   * @param server - Server configuration
   */
  set(server: Server): void {
    const all = readServers();
    all[server.id] = server;
    writeServers(all);
  }

  /**
   * Get a server by ID
   *
   * @param id - Server ID
   * @returns Server configuration or undefined
   */
  get(id: string): Server | undefined {
    return readServers()[id];
  }

  /**
   * Get all configured servers
   *
   * @returns Array of servers
   */
  getAll(): Server[] {
    return Object.values(readServers());
  }

  /**
   * Remove a server configuration
   *
   * @param id - Server ID
   * @returns Whether the server was removed
   */
  delete(id: string): boolean {
    const all = readServers();
    if (!(id in all)) return false;
    delete all[id];
    writeServers(all);
    return true;
  }

  /**
   * Check if a server exists
   *
   * @param id - Server ID
   * @returns Whether the server exists
   */
  has(id: string): boolean {
    return id in readServers();
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
