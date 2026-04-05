/**
 * Server Command
 *
 * Manage FileMaker server configurations.
 *
 * @module cli/server
 */

import { BaseCommand, type CommandOptions } from './index';
import type { CommandResult, Server } from '../types';
import { ServerManager } from '../config/servers';
import { CredentialsManager } from '../config/credentials';
import { CredentialsCommand } from './credentials';
import { logger } from '../utils/logger';

export { CredentialsCommand };

/**
 * Server command action
 */
export type ServerAction = 'add' | 'list' | 'remove';

/**
 * Server command options
 */
export interface ServerOptions extends CommandOptions {
  /** Action to perform */
  action: ServerAction;
  /** Server name (for add) */
  name?: string;
  /** Server host (for add) */
  host?: string;
  /** Server port (for add, default: 443) */
  port?: number;
  /** Use HTTPS (for add, default: true) */
  secure?: boolean;
  /** Server ID (for remove or custom ID for add) */
  serverId?: string;
  /** Database name (for credential prompts) */
  database?: string;
  /** Username (for credential prompts) */
  username?: string;
  /** Password (for credential prompts) */
  password?: string;
}

/**
 * Server command implementation
 *
 * Provides add, list, and remove actions for server management.
 *
 * @example
 * ```bash
 * # Add a server
 * fmodata server add --name prod --host fms.example.com
 *
 * # Add a server with credentials
 * fmodata server add --name prod --host fms.example.com --db Contacts --username admin
 *
 * # List servers
 * fmodata server list
 *
 * # Remove a server
 * fmodata server remove --server-id abc123
 * ```
 */
export class ServerCommand extends BaseCommand<ServerOptions> {
  /**
   * Execute the server command
   *
   * @returns Command result
   */
  async execute(): Promise<CommandResult> {
    try {
      this.validateOptions();

      switch (this.options.action) {
        case 'add':
          return await this.addServer();

        case 'list':
          return this.listServers();

        case 'remove':
          return await this.removeServer();

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
    const { action, name, host, serverId } = this.options;

    if (!action) {
      throw new Error('Action is required. Use --action <add|list|remove>');
    }

    if (action !== 'add' && action !== 'list' && action !== 'remove') {
      throw new Error(`Invalid action: ${action}. Valid actions: add, list, remove`);
    }

    if (action === 'add') {
      if (!name || name.trim() === '') {
        throw new Error('Server name is required. Use --name <name>');
      }

      if (!host || host.trim() === '') {
        throw new Error('Server host is required. Use --host <host>');
      }
    }

    if (action === 'remove') {
      if (!serverId || serverId.trim() === '') {
        throw new Error('Server ID is required. Use --server-id <id>');
      }
    }
  }

  /**
   * Add a new server configuration
   *
   * @returns Command result with added server
   */
  private async addServer(): Promise<CommandResult> {
    const manager = new ServerManager();

    // Check for duplicate name
    const existing = manager.listServers().find((s) => s.name === this.options.name);
    if (existing) {
      return {
        success: false,
        error: `Server "${this.options.name}" already exists with ID: ${existing.id}. Use --name with a unique name, or remove the existing server first.`,
      };
    }

    // Add the server
    const server = manager.addServer({
      name: this.options.name!,
      host: this.options.host!,
      port: this.options.port ?? 443,
      secure: this.options.secure ?? true,
    });

    // Warn if --password is given without both --username and --database (T010)
    if (this.options.password && this.options.password.trim()) {
      const hasUsername = !!(this.options.username && this.options.username.trim());
      const hasDatabase = !!(this.options.database && this.options.database.trim());

      if (!hasUsername && !hasDatabase) {
        // Neither username nor database provided
        logger.warn(
          'Warning: credentials were not stored because --username and --database are also required'
        );
      } else if (hasUsername && !hasDatabase) {
        // Username provided but database missing
        logger.warn('Warning: --database is also required to store credentials');
      } else if (!hasUsername && hasDatabase) {
        // Database provided but username missing
        logger.warn('Warning: --username is also required to store credentials');
      }
    }

    // Store credentials if all three are provided
    if (this.options.database && this.options.username && this.options.password) {
      const credentials = new CredentialsManager();
      try {
        await credentials.storeCredentials(
          server.id,
          this.options.database,
          this.options.username,
          this.options.password
        );

        // Verify credentials were stored successfully (BUG-1 fix)
        const storedPassword = await credentials.getCredentials(
          server.id,
          this.options.database,
          this.options.username
        );

        if (!storedPassword) {
          return {
            success: false,
            error:
              'Failed to verify credential storage. Keychain may not be accessible. Try using --password flag directly when running commands, or check keychain permissions.',
          };
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        return {
          success: false,
          error: `Failed to store credentials: ${errorMessage}. Try using --password flag directly when running commands.`,
        };
      }
    }

    return {
      success: true,
      data: {
        id: server.id,
        name: server.name,
        host: server.host,
        port: server.port,
        secure: server.secure,
        message: `Server "${server.name}" added successfully`,
      },
    };
  }

  /**
   * List all configured servers
   *
   * @returns Command result with list of servers
   */
  private listServers(): CommandResult {
    const manager = new ServerManager();
    const servers = manager.listServers();

    return {
      success: true,
      data: servers.map((s: Server) => ({
        id: s.id,
        name: s.name,
        host: s.host,
        port: s.port ?? 443,
        secure: s.secure ?? true,
      })),
    };
  }

  /**
   * Remove a server configuration
   *
   * @returns Command result
   */
  private async removeServer(): Promise<CommandResult> {
    const manager = new ServerManager();
    const serverId = this.options.serverId!;

    // Get server name before removing for the success message
    const server = manager.getServer(serverId);
    if (!server) {
      return {
        success: false,
        error: `Server not found: ${serverId}. Run 'fmodata server list --json' to see configured servers.`,
      };
    }

    // Remove the server
    const removed = manager.removeServer(serverId);

    if (!removed) {
      return {
        success: false,
        error: `Failed to remove server: ${serverId}`,
      };
    }

    return {
      success: true,
      data: {
        id: serverId,
        name: server.name,
        message: `Server "${server.name}" removed successfully`,
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
      return JSON.stringify(result.data, null, 2);
    }

    const data = result.data as Record<string, unknown>;

    // Handle list action
    if (Array.isArray(data)) {
      if (data.length === 0) {
        return 'No servers configured.';
      }

      const lines: string[] = ['Configured servers:', ''];
      for (const server of data) {
        const s = server as {
          id: string;
          name: string;
          host: string;
          port: number;
          secure: string;
        };
        lines.push(`  ${s.name}`);
        lines.push(`    ID: ${s.id}`);
        lines.push(`    URL: ${s.secure}://${s.host}:${s.port}`);
        lines.push('');
      }
      return lines.join('\n');
    }

    // Handle add/remove actions
    const lines: string[] = [];
    lines.push(data.message as string);

    if (data.id) {
      lines.push(`  ID: ${data.id}`);
    }
    if (data.name) {
      lines.push(`  Name: ${data.name}`);
    }
    if (data.host) {
      lines.push(`  Host: ${data.host}`);
    }
    if (data.port) {
      lines.push(`  Port: ${data.port}`);
    }

    return lines.join('\n');
  }
}

/**
 * Export command factory
 */
export function serverCommand(options: ServerOptions): ServerCommand {
  return new ServerCommand(options);
}
