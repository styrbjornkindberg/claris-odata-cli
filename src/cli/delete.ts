/**
 * Delete Command
 *
 * Deletes a record from a FileMaker table.
 *
 * @module cli/delete
 */

import { BaseCommand, type CommandOptions } from './index';
import { ODataClient } from '../api/client';
import { AuthManager } from '../api/auth';
import { ServerManager } from '../config/servers';
import { CredentialsManager } from '../config/credentials';
import type { CommandResult } from '../types';

/**
 * Delete command options
 */
export interface DeleteOptions extends CommandOptions {
  /** Server ID */
  serverId: string;
  /** Database name */
  database: string;
  /** Table name */
  table: string;
  /** Record ID */
  recordId: number;
}

/**
 * Delete command implementation
 *
 * Deletes a record from a FileMaker table.
 */
export class DeleteCommand extends BaseCommand<DeleteOptions> {
  /**
   * Execute the delete command
   *
   * @returns Command result
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

      await client.deleteRecord(this.options.table, this.options.recordId);

      return {
        success: true,
        data: {
          deleted: true,
          table: this.options.table,
          recordId: this.options.recordId,
        },
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
