/**
 * Batch Command
 *
 * Executes a batch of OData requests from a JSON DSL file via /$batch.
 *
 * @module cli/batch
 */

import { readFileSync } from 'fs';
import { BaseCommand, type CommandOptions } from './index';
import { ODataClient } from '../api/client';
import { AuthManager } from '../api/auth';
import { ServerManager } from '../config/servers';
import { CredentialsManager } from '../config/credentials';
import { OutputFormatter } from '../output/formatter';
import type { BatchRequest, CommandResult } from '../types';

export interface BatchOptions extends CommandOptions {
  serverId: string;
  database: string;
  file: string;
}

export class BatchCommand extends BaseCommand<BatchOptions> {
  private formatter: OutputFormatter;

  constructor(options: BatchOptions) {
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

      let fileContent: string;
      try {
        fileContent = readFileSync(this.options.file, 'utf-8') as string;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return { success: false, error: message };
      }

      let requests: BatchRequest[];
      try {
        requests = JSON.parse(fileContent) as BatchRequest[];
      } catch {
        return {
          success: false,
          error: `Invalid JSON in batch file: ${this.options.file}`,
        };
      }

      const protocol = (server.secure ?? true) ? 'https' : 'http';
      const port = server.port ?? 443;
      const baseUrl = `${protocol}://${server.host}:${port}`;

      const authManager = new AuthManager();
      const authToken = authManager.createBasicAuthToken(entry.username, credentials);

      const client = new ODataClient({ baseUrl, database: this.options.database, authToken });
      const response = await client.executeBatch(requests);

      return {
        success: true,
        data: { response },
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

  formatOutput(result: CommandResult): string {
    if (!result.success) {
      return this.formatter.formatJson({
        type: 'error',
        code: 'BATCH_FAILED',
        message: result.error ?? 'Unknown error',
      });
    }

    return this.formatter.formatJson(result.data);
  }
}
