/**
 * List Command
 *
 * Lists servers, databases, or tables.
 *
 * @module cli/list
 */

import { BaseCommand, type CommandOptions } from './index';
import type { CommandResult } from '../types';
import { ServerManager } from '../config/servers';
import { c } from '../lib/theme';

/**
 * List command options
 */
export interface ListOptions extends CommandOptions {
  /** What to list: servers, databases, or tables */
  resource: 'servers' | 'databases' | 'tables';
  /** Server ID (required for databases and tables) */
  serverId?: string;
}

/**
 * List command implementation
 *
 * Lists configured servers or resources from a FileMaker server.
 */
export class ListCommand extends BaseCommand<ListOptions> {
  /**
   * Execute the list command
   *
   * @returns Command result with list of resources
   */
  async execute(): Promise<CommandResult> {
    switch (this.options.resource) {
      case 'servers':
        return this.listServers();

      case 'databases':
        return this.listDatabases();

      case 'tables':
        return this.listTables();

      default:
        return {
          success: false,
          error: `Unknown resource: ${this.options.resource}`,
        };
    }
  }

  /**
   * List configured servers
   *
   * @returns Command result with list of servers
   */
  private listServers(): CommandResult {
    const manager = new ServerManager();
    const servers = manager.listServers();

    return {
      success: true,
      data: servers.map((s) => ({
        id: s.id,
        name: s.name,
        host: s.host,
        port: s.port ?? 443,
        secure: s.secure ?? true,
      })),
    };
  }

  /**
   * List databases on a server
   *
   * @returns Command result with list of databases
   */
  private async listDatabases(): Promise<CommandResult> {
    // TODO: Implement database listing via OData API
    // This requires an authenticated connection to the server
    return {
      success: false,
      error: c.error('Database listing not yet implemented'),
    };
  }

  /**
   * List tables in a database
   *
   * @returns Command result with list of tables
   */
  private async listTables(): Promise<CommandResult> {
    // TODO: Implement table listing via OData metadata
    // This requires an authenticated connection to a specific database
    return {
      success: false,
      error: c.error('Table listing not yet implemented'),
    };
  }
}
