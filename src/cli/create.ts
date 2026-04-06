/**
 * Create Command
 *
 * Creates a new record in a FileMaker table.
 *
 * @module cli/create
 */

import { BaseCommand, type CommandOptions } from './index';
import { ODataClient } from '../api/client';
import { AuthManager } from '../api/auth';
import { ServerManager } from '../config/servers';
import { CredentialsManager } from '../config/credentials';
import type { CommandResult } from '../types';

/**
 * Create command options
 */
export interface CreateOptions extends CommandOptions {
  /** Server ID */
  serverId: string;
  /** Database name */
  database: string;
  /** Table name */
  table: string;
  /** Field values as JSON string or key=value pairs */
  data: Record<string, unknown>;
}

/**
 * Create command implementation
 *
 * Creates a new record in a FileMaker table.
 */
export class CreateCommand extends BaseCommand<CreateOptions> {
  /**
   * Execute the create command
   *
   * @returns Command result with created record
   */
  async execute(): Promise<CommandResult> {
    try {
      const serverManager = new ServerManager();
      const server = serverManager.getServer(this.options.serverId);

      if (!server) {
        return {
          success: false,
          error: `Server not found: ${this.options.serverId}`,
        };
      }

      const credentialsManager = new CredentialsManager();
      const entries = await credentialsManager.listCredentials(this.options.serverId);
      const entry = entries.find((e) => e.database === this.options.database);

      if (!entry) {
        return {
          success: false,
          error: `No credentials found for server '${this.options.serverId}' and database '${this.options.database}'`,
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
          error: `Stored credentials are incomplete for server '${this.options.serverId}' and database '${this.options.database}'`,
        };
      }

      const protocol = server.secure !== false ? 'https' : 'http';
      const port = server.port ?? 443;
      const baseUrl = `${protocol}://${server.host}:${port}`;

      const authManager = new AuthManager();
      const authToken = authManager.createBasicAuthToken(entry.username, password);

      const client = new ODataClient({
        baseUrl,
        database: this.options.database,
        authToken,
      });

      const created = await client.createRecord(this.options.table, this.options.data);
      return {
        success: true,
        data: created,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: message,
      };
    }
  }
}
