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
import axios from 'axios';

interface ODataServiceEntry {
  name: string;
  kind?: string;
  url?: string;
}

interface ODataServiceDocument {
  value?: ODataServiceEntry[];
}

interface HttpErrorShape {
  code?: string;
  message?: string;
  response?: {
    status?: number;
  };
}

/**
 * List command options
 */
export interface ListOptions extends CommandOptions {
  /** What to list: servers, databases, or tables */
  resource: 'servers' | 'databases' | 'tables';
  /** Server ID (required for databases and tables) */
  serverId?: string;
  /** Database name (required for tables) */
  database?: string;
}

/**
 * List command implementation
 *
 * Lists configured servers or resources from a FileMaker server.
 */
export class ListCommand extends BaseCommand<ListOptions> {
  constructor(options: ListOptions) {
    super(options);
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

      const response = await axios.get<ODataServiceDocument>(`${baseUrl}/`, {
        headers: { Authorization: `Basic ${authToken}` },
        timeout: 10000,
      });

      // Parse the service document response
      // FileMaker OData returns a list of databases in the service document
      const data = response.data;
      const databases =
        data.value?.map((db) => ({
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
    } catch (error: unknown) {
      return {
        success: false,
        error: this.formatError(error),
      };
    }
  }

  /**
   * Format error message
   */
  private formatError(error: unknown): string {
    const parsed = error as HttpErrorShape;

    if (parsed.code === 'ECONNREFUSED') {
      return 'Connection refused';
    }
    if (parsed.code === 'ETIMEDOUT' || parsed.code === 'ECONNABORTED') {
      return 'Connection timeout';
    }
    if (parsed.code === 'ENOTFOUND') {
      return 'Host not found';
    }
    if (parsed.response?.status === 401) {
      return 'Authentication failed';
    }
    if (parsed.response?.status === 404) {
      return 'Server not found';
    }
    if (parsed.response?.status === 500) {
      return 'Server error';
    }
    return parsed.message ?? 'Unknown error';
  }

  /**
   * List tables in a database
   *
   * @returns Command result with list of tables
   */
  private async listTables(): Promise<CommandResult> {
    if (!this.options.serverId) {
      return {
        success: false,
        error: 'Server ID is required to list tables. Use --server <id>',
      };
    }

    if (!this.options.database) {
      return {
        success: false,
        error: 'Database name is required to list tables. Use --database <name>',
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
      const credentialsManager = new CredentialsManager();
      const credentials = await credentialsManager.listCredentials(this.options.serverId);
      const entry = credentials.find((credential) => credential.database === this.options.database);

      if (!entry) {
        return {
          success: false,
          error:
            'No credentials stored for this server/database. Use `fmo server credentials add` first.',
        };
      }

      const password = await credentialsManager.getCredentials(
        this.options.serverId,
        entry.database,
        entry.username
      );

      if (!password) {
        return {
          success: false,
          error: 'Credentials stored but password not found.',
        };
      }

      const protocol = server.port === 443 ? 'https' : 'http';
      const baseUrl = `${protocol}://${server.host}:${server.port ?? 443}/fmi/odata/v4`;
      const authToken = Buffer.from(`${entry.username}:${password}`).toString('base64');

      const response = await axios.get<string>(
        `${baseUrl}/${encodeURIComponent(this.options.database)}/$metadata`,
        {
          headers: {
            Authorization: `Basic ${authToken}`,
            Accept: 'application/xml',
            'OData-Version': '4.0',
            'OData-MaxVersion': '4.0',
          },
          timeout: 10000,
        }
      );

      const tables = [...response.data.matchAll(/<EntitySet\s+Name="([^"]+)"/g)].map((match) => ({
        name: match[1],
      }));

      return {
        success: true,
        data: {
          type: 'tables',
          server: this.options.serverId,
          database: this.options.database,
          tables,
        },
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: this.formatError(error),
      };
    }
  }
}
