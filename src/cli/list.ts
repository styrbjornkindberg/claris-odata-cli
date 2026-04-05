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
import { CredentialsManager } from '../config/credentials';
import { OutputFormatter } from '../output/formatter';
import { c } from '../lib/theme';
import axios from 'axios';

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
  private formatter: OutputFormatter;

  constructor(options: ListOptions) {
    super(options);
    this.formatter = new OutputFormatter(options.output ?? 'table');
  }

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
      data: {
        type: 'servers',
        servers: servers.map((s) => ({
          id: s.id,
          name: s.name,
          host: s.host,
          port: s.port ?? 443,
          secure: s.secure ?? true,
        })),
      },
    };
  }

  /**
   * List databases on a server
   *
   * @returns Command result with list of databases
   */
  private async listDatabases(): Promise<CommandResult> {
    if (!this.options.serverId) {
      return {
        success: false,
        error: 'Server ID is required to list databases. Use --server <id>',
      };
    }

    const serverManager = new ServerManager();
    const server = serverManager.getServer(this.options.serverId);
    
    if (!server) {
      return {
        success: false,
        error: `Server not found: ${this.options.serverId}`,
      };
    }

    try {
      // Get credentials
      const credentialsManager = new CredentialsManager();
      const credentials = await credentialsManager.listCredentials(this.options.serverId);
      
      if (!credentials || credentials.length === 0) {
        return {
          success: false,
          error: 'No credentials stored for this server. Use `fmo server credentials add` first.',
        };
      }

      // Use first credential
      const cred = credentials[0];
      const password = await credentialsManager.getCredentials(
        this.options.serverId,
        cred.database,
        cred.username
      );

      if (!password) {
        return {
          success: false,
          error: 'Credentials stored but password not found.',
        };
      }

      // Get databases from server
      const protocol = server.port === 443 ? 'https' : 'http';
      const baseUrl = `${protocol}://${server.host}:${server.port ?? 443}/fmi/odata/v4`;
      const authToken = Buffer.from(`${cred.username}:${password}`).toString('base64');

      const response = await axios.get(`${baseUrl}/`, {
        headers: { Authorization: `Basic ${authToken}` },
        timeout: 10000,
      });

      // Parse the service document response
      // FileMaker OData returns a list of databases in the service document
      const data = response.data;
      const databases = data.value?.map((db: any) => ({
        name: db.name,
        kind: db.kind,
        url: db.url,
      })) ?? [];

      return {
        success: true,
        data: {
          type: 'databases',
          server: this.options.serverId,
          databases,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: this.formatError(error),
      };
    }
  }

  /**
   * Format error message
   */
  private formatError(error: any): string {
    if (error.code === 'ECONNREFUSED') {
      return 'Connection refused';
    }
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      return 'Connection timeout';
    }
    if (error.code === 'ENOTFOUND') {
      return 'Host not found';
    }
    if (error.response?.status === 401) {
      return 'Authentication failed';
    }
    if (error.response?.status === 404) {
      return 'Server not found';
    }
    if (error.response?.status === 500) {
      return 'Server error';
    }
    return error.message ?? 'Unknown error';
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

  /**
   * Format output for display
   *
   * @param result - Command result
   * @returns Formatted string
   */
  formatOutput(result: CommandResult): string {
    if (!result.success) {
      return this.formatter.formatJson({
        type: 'error',
        code: 'ODATA_QUERY_FAILED',
        message: result.error,
      });
    }

    // For JSONL format, output one record per line
    if (this.options.output === 'jsonl' && result.data && Array.isArray((result.data as any).servers)) {
      return this.formatter.formatJsonl((result.data as any).servers);
    }

    // For JSON or table format
    return this.formatter.formatJson(result.data);
  }
}
