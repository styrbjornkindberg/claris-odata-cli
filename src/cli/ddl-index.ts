import { BaseCommand, type CommandOptions } from './index';
import { ODataClient } from '../api/client';
import { AuthManager } from '../api/auth';
import { ServerManager } from '../config/servers';
import { CredentialsManager } from '../config/credentials';
import type { CommandResult } from '../types';

export interface IndexOptions extends CommandOptions {
  action: 'create' | 'delete';
  tableName: string;
  fieldName: string;
  serverId: string;
  database: string;
  /** Required for delete action */
  confirm?: boolean;
}

export class IndexCommand extends BaseCommand<IndexOptions> {
  async execute(): Promise<CommandResult> {
    if (this.options.action === 'delete' && !this.options.confirm) {
      return {
        success: false,
        error: 'Pass --confirm to delete this index',
      };
    }

    try {
      const serverManager = new ServerManager();
      const server = serverManager.getServer(this.options.serverId);

      if (!server) {
        return { success: false, error: `Server not found: ${this.options.serverId}` };
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
      const authToken = new AuthManager().createBasicAuthToken(entry.username, password);
      const client = new ODataClient({ baseUrl, database: this.options.database, authToken });

      if (this.options.action === 'create') {
        const data = await client.createIndex(this.options.tableName, this.options.fieldName);
        return { success: true, data };
      }

      // delete
      await client.deleteIndex(this.options.tableName, this.options.fieldName);
      return {
        success: true,
        data: { table: this.options.tableName, field: this.options.fieldName, deleted: true },
      };
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}
