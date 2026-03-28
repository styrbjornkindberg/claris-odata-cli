/**
 * Credentials Command
 *
 * Manage stored credentials for FileMaker servers.
 *
 * @module cli/credentials
 */

import { BaseCommand, type CommandOptions } from './index';
import type { CommandResult, CredentialEntry } from '../types';
import { ServerManager } from '../config/servers';
import { CredentialsManager } from '../config/credentials';

/**
 * Credentials command action
 */
export type CredentialsAction = 'add' | 'list' | 'remove';

/**
 * Credentials command options
 */
export interface CredentialsOptions extends CommandOptions {
  /** Action to perform */
  action: CredentialsAction;
  /** Server ID */
  serverId?: string;
  /** Database name (for add/remove) */
  database?: string;
  /** Username (for add/remove) */
  username?: string;
  /** Password (for add, optional — will prompt if omitted) */
  password?: string;
}

/**
 * Credentials command implementation
 *
 * Provides add, list, and remove actions for credential management.
 *
 * @example
 * ```bash
 * # Add credentials
 * fmo server credentials add --server-id dev --database contacts --username admin
 *
 * # List credentials
 * fmo server credentials list --server-id dev
 *
 * # Remove credentials
 * fmo server credentials remove --server-id dev --database contacts --username admin
 * ```
 */
export class CredentialsCommand extends BaseCommand<CredentialsOptions> {
  /**
   * Execute the credentials command
   *
   * @returns Command result
   */
  async execute(): Promise<CommandResult> {
    try {
      this.validateOptions();

      switch (this.options.action) {
        case 'add':
          return await this.addCredentials();

        case 'list':
          return await this.listCredentials();

        case 'remove':
          return await this.removeCredentials();

        default:
          return {
            success: false,
            error: `Unknown action: ${this.options.action}. Valid actions: add, list, remove`,
          };
      }
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : 'Unknown error',
      };
    }
  }

  /**
   * Validate command options
   *
   * @throws Error if options are invalid
   */
  private validateOptions(): void {
    const { action, serverId, database, username } = this.options;

    if (!action) {
      throw new Error('Action is required. Use --action <add|list|remove>');
    }

    if (!serverId || serverId.trim() === '') {
      throw new Error('Server ID is required. Use --server-id <id>');
    }

    if (action === 'add') {
      if (!database || database.trim() === '') {
        throw new Error('Database name is required. Use --database <name>');
      }
      if (!username || username.trim() === '') {
        throw new Error('Username is required. Use --username <username>');
      }
    }

    if (action === 'remove') {
      if (!database || database.trim() === '') {
        throw new Error('Database name is required. Use --database <name>');
      }
      if (!username || username.trim() === '') {
        throw new Error('Username is required. Use --username <username>');
      }
    }
  }

  /**
   * Validate that the server exists
   *
   * @param serverId - Server ID to validate
   * @returns Server name
   * @throws Error if server not found
   */
  private validateServerExists(serverId: string): string {
    const manager = new ServerManager();
    const server = manager.getServer(serverId);
    if (!server || (server as { id?: string }).id !== serverId) {
      throw new Error(`Server not found: ${serverId}`);
    }
    return (server as { name: string }).name;
  }

  /**
   * Add credentials for a server
   *
   * @returns Command result
   */
  private async addCredentials(): Promise<CommandResult> {
    const { serverId, database, username, password } = this.options;

    let serverName: string;
    try {
      serverName = this.validateServerExists(serverId!);
    } catch (e) {
      return {
        success: false,
        error: `Error: ${e instanceof Error ? e.message : String(e)}`,
      };
    }

    const credPassword = password ?? '';
    if (!credPassword) {
      return {
        success: false,
        error: 'Error: Password is required. Use --password <password>',
      };
    }

    const credentials = new CredentialsManager();
    await credentials.storeCredentials(serverId!, database!, username!, credPassword);

    return {
      success: true,
      data: {
        serverId: serverId!,
        serverName,
        database: database!,
        username: username!,
        message: `Credentials stored for server "${serverName}" (database: ${database}, user: ${username})`,
      },
    };
  }

  /**
   * List credentials for a server
   *
   * @returns Command result with credential entries
   */
  private async listCredentials(): Promise<CommandResult> {
    const { serverId } = this.options;

    let serverName: string;
    try {
      serverName = this.validateServerExists(serverId!);
    } catch (e) {
      return {
        success: false,
        error: `Error: ${e instanceof Error ? e.message : String(e)}`,
      };
    }

    const credentials = new CredentialsManager();
    const rawEntries = await credentials.listCredentials(serverId!);
    const entries = rawEntries.map((e) => ({ database: e.database, username: e.username }));

    return {
      success: true,
      data: {
        serverId: serverId!,
        serverName,
        entries,
      },
    };
  }

  /**
   * Remove credentials for a server
   *
   * @returns Command result
   */
  private async removeCredentials(): Promise<CommandResult> {
    const { serverId, database, username } = this.options;

    let serverName: string;
    try {
      serverName = this.validateServerExists(serverId!);
    } catch (e) {
      return {
        success: false,
        error: `Error: ${e instanceof Error ? e.message : String(e)}`,
      };
    }

    const credentials = new CredentialsManager();
    const removed = await credentials.deleteCredentials(serverId!, database!, username!);

    if (!removed) {
      return {
        success: false,
        error: `No credentials found for the specified server, database, and username`,
      };
    }

    return {
      success: true,
      data: {
        serverId: serverId!,
        serverName,
        database: database!,
        username: username!,
        message: `Credentials removed for server "${serverName}" (database: ${database}, user: ${username})`,
      },
    };
  }

  /**
   * Format output for display
   *
   * @param result - Command result
   * @returns Formatted output
   */
  formatOutput(result: CommandResult): string {
    if (!result.success) {
      return result.error ?? 'Unknown error';
    }

    if (this.options.output === 'json') {
      const data = result.data as Record<string, unknown>;

      // For list action, return just the entries array
      if (this.options.action === 'list') {
        const entries = (data.entries as CredentialEntry[]) ?? [];
        return JSON.stringify(
          entries.map((e) => ({ database: e.database, username: e.username })),
          null,
          2
        );
      }

      return JSON.stringify(data, null, 2);
    }

    const data = result.data as Record<string, unknown>;

    // Handle list action
    if (this.options.action === 'list') {
      const serverName = data.serverName as string;
      const entries = (data.entries as CredentialEntry[]) ?? [];

      if (entries.length === 0) {
        return `No credentials stored for server "${serverName}".`;
      }

      const lines: string[] = [`Credentials for server "${serverName}":`, ''];
      for (const entry of entries) {
        lines.push(`  Database: ${entry.database}`);
        lines.push(`    Username: ${entry.username}`);
        lines.push('');
      }
      // Remove trailing empty line
      if (lines[lines.length - 1] === '') {
        lines.pop();
      }
      return lines.join('\n');
    }

    // Handle add/remove actions
    const msgData = data as { message?: string };
    return msgData.message ?? 'Done';
  }
}

/**
 * Export command factory
 */
export function credentialsCommand(options: CredentialsOptions): CredentialsCommand {
  return new CredentialsCommand(options);
}
