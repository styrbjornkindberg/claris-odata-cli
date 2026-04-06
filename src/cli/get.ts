/**
 * Get Command
 *
 * Retrieves records from a FileMaker table.
 *
 * @module cli/get
 */

import { BaseCommand, type CommandOptions } from './index';
import { ODataClient } from '../api/client';
import { AuthManager } from '../api/auth';
import { ServerManager } from '../config/servers';
import { CredentialsManager } from '../config/credentials';
import { OutputFormatter } from '../output/formatter';
import type { CommandResult, QueryOptions } from '../types';

/**
 * Get command options
 */
export interface GetOptions extends CommandOptions {
  /** Server ID */
  serverId: string;
  /** Database name */
  database: string;
  /** Table name */
  table: string;
  /** Filter expression ($filter) */
  filter?: string;
  /** Fields to select */
  select?: string[];
  /** Maximum records to return */
  top?: number;
  /** Number of records to skip */
  skip?: number;
  /** Order by field(s) */
  orderby?: string;
  /** Include total count */
  count?: boolean;
}

/**
 * Get command implementation
 *
 * Retrieves records from a FileMaker table using OData query options.
 * Supports JSONL output for streaming large result sets.
 */
export class GetCommand extends BaseCommand<GetOptions> {
  private formatter: OutputFormatter;

  constructor(options: GetOptions) {
    super(options);
    this.formatter = new OutputFormatter(options.output ?? 'table');
  }

  /**
   * Execute the get command
   *
   * @returns Command result with records
   */
  async execute(): Promise<CommandResult> {
    try {
      // Get server configuration
      const serverManager = new ServerManager();
      const server = serverManager.getServer(this.options.serverId);

      if (!server) {
        return {
          success: false,
          error: `Server not found: ${this.options.serverId}`,
        };
      }

      // Resolve stored credential entry for this server+database
      const credentialsManager = new CredentialsManager();
      const entries = await credentialsManager.listCredentials(this.options.serverId);
      const entry = entries.find((e) => e.database === this.options.database);

      if (!entry) {
        return {
          success: false,
          error: `No credentials found for server '${this.options.serverId}' and database '${this.options.database}'`,
        };
      }

      const credentials = await credentialsManager.getCredentials(
        this.options.serverId,
        entry.database,
        entry.username
      );

      if (!credentials) {
        return {
          success: false,
          error: `Stored credentials are incomplete for server '${this.options.serverId}' and database '${this.options.database}'`,
        };
      }

      // Build OData client
      const protocol = (server.secure ?? true) ? 'https' : 'http';
      const port = server.port ?? 443;
      const baseUrl = `${protocol}://${server.host}:${port}/fmi/odata/v4`;

      const authManager = new AuthManager();
      const authToken = authManager.createBasicAuthToken(entry.username, credentials);

      const client = new ODataClient({
        baseUrl,
        database: this.options.database,
        authToken,
      });

      // Build query options
      const queryOptions: QueryOptions = {};
      if (this.options.filter) queryOptions.filter = this.options.filter;
      if (this.options.select) queryOptions.select = this.options.select;
      if (this.options.top !== undefined) queryOptions.top = this.options.top;
      if (this.options.skip !== undefined) queryOptions.skip = this.options.skip;
      if (this.options.orderby) queryOptions.orderby = this.options.orderby;
      if (this.options.count) queryOptions.count = true;

      // Execute query
      const records = await client.getRecords(this.options.table, queryOptions);

      return {
        success: true,
        data: records,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: message,
      };
    }
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
        success: false,
        error: { code: 'ODATA_QUERY_FAILED', message: result.error ?? 'Unknown error' },
      });
    }

    // For JSONL format, output one record per line
    if (this.options.output === 'jsonl' && Array.isArray(result.data)) {
      return this.formatter.formatJsonl(result.data);
    }

    // For JSON or table format
    return this.formatter.formatJson(result.data);
  }
}
