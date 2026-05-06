/**
 * Script Command
 *
 * Runs a FileMaker script via the OData API.
 *
 * @module cli/script
 */

import { BaseCommand, type CommandOptions } from './index';
import { ODataClient } from '../api/client';
import { AuthManager } from '../api/auth';
import { ServerManager } from '../config/servers';
import { CredentialsManager } from '../config/credentials';
import { OutputFormatter } from '../output/formatter';
import type { CommandResult } from '../types';

/**
 * Script command options
 */
export interface ScriptOptions extends CommandOptions {
  /** Server ID */
  serverId: string;
  /** Database name */
  database: string;
  /** Script name */
  name: string;
  /** Optional table context */
  table?: string;
  /** Optional record ID context */
  id?: number;
  /** Pre-parsed script parameters */
  params?: unknown;
}

/**
 * Script command implementation
 *
 * Posts to the FileMaker script endpoint and returns the raw response.
 */
export class ScriptCommand extends BaseCommand<ScriptOptions> {
  private formatter: OutputFormatter;

  constructor(options: ScriptOptions) {
    super(options);
    this.formatter = new OutputFormatter(options.output ?? 'json');
  }

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

      const protocol = (server.secure ?? true) ? 'https' : 'http';
      const port = server.port ?? 443;
      const baseUrl = `${protocol}://${server.host}:${port}`;

      const authManager = new AuthManager();
      const authToken = authManager.createBasicAuthToken(entry.username, credentials);

      const client = new ODataClient({
        baseUrl,
        database: this.options.database,
        authToken,
      });

      const data = await client.runScript(this.options.name, {
        table: this.options.table,
        recordId: this.options.id,
        params: this.options.params,
      });

      return { success: true, data };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

  formatOutput(result: CommandResult): string {
    if (!result.success) {
      return this.formatter.formatJson({
        type: 'error',
        code: 'SCRIPT_FAILED',
        message: result.error ?? 'Unknown error',
      });
    }

    return this.formatter.formatJson(result.data);
  }
}
