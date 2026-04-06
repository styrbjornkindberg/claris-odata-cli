/**
 * Update Command
 *
 * Updates an existing record in a FileMaker table.
 *
 * @module cli/update
 */

import { BaseCommand, type CommandOptions } from './index';
import { ODataClient } from '../api/client';
import { AuthManager } from '../api/auth';
import { ServerManager } from '../config/servers';
import { CredentialsManager } from '../config/credentials';
import type { CommandResult } from '../types';

/**
 * Update command options
 */
export interface UpdateOptions extends CommandOptions {
  /** Server ID */
  serverId: string;
  /** Database name */
  database: string;
  /** Table name */
  table: string;
  /** Record ID */
  recordId: number;
  /** Field values to update */
  data: Record<string, unknown>;
}

/**
 * Update command implementation
 *
 * Updates an existing record in a FileMaker table.
 */
export class UpdateCommand extends BaseCommand<UpdateOptions> {
  /**
   * Execute the update command
   *
   * @returns Command result with updated record
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

      const updated = await client.updateRecord(
        this.options.table,
        this.options.recordId,
        this.options.data
      );

      return {
        success: true,
        data: updated,
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
