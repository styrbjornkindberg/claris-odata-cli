/**
 * Browse Command
 *
 * Interactive browser for FileMaker servers, databases, and tables.
 * Requires an interactive terminal (TTY) to function.
 *
 * @module cli/browse
 */

import { select, input, password } from '@inquirer/prompts';
import { BaseCommand, type CommandOptions } from './index';
import { ServerManager } from '../config/servers';
import { CredentialsManager } from '../config/credentials';
import type { CommandResult } from '../types';

/**
 * Browse command options
 */
export interface BrowseOptions extends CommandOptions {
  /** Pre-selected server ID (optional) */
  serverId?: string;
  /** Pre-selected database name (optional) */
  database?: string;
}

/**
 * Resolved credentials for a browse session
 */
export interface BrowseCredentials {
  /** Server ID */
  serverId: string;
  /** Database name */
  database: string;
  /** Username */
  username: string;
  /** Password (in-memory only, never logged) */
  password: string;
}

/**
 * BrowseCommand class
 *
 * Implements interactive browsing of FileMaker servers, databases,
 * and tables. Requires an interactive TTY — exits with error if
 * stdin or stdout is not a TTY.
 */
export class BrowseCommand extends BaseCommand<BrowseOptions> {
  /**
   * Check whether the current process is running in an interactive terminal.
   *
   * Both stdin and stdout must be TTY for interactive browsing to work.
   *
   * @returns true if running in a TTY, false otherwise
   */
  isInteractiveTTY(): boolean {
    return process.stdin.isTTY === true && process.stdout.isTTY === true;
  }

  /**
   * Resolve credentials for the selected server.
   *
   * Checks the keychain for stored credentials. If found, uses the first
   * one automatically. If not found, prompts the user and saves the new
   * credentials to the keychain.
   *
   * @param serverId - The selected server ID
   * @returns Resolved credentials (database, username, password)
   */
  async resolveCredentials(serverId: string): Promise<BrowseCredentials> {
    const manager = new CredentialsManager();

    let storedCredentials;
    try {
      storedCredentials = await manager.listCredentials(serverId);
    } catch {
      // Keychain unavailable — fall through to prompt
      storedCredentials = [];
    }

    if (storedCredentials.length > 0) {
      // Use the first stored credential automatically
      const entry = storedCredentials[0];
      let resolvedPassword: string;
      try {
        const retrieved = await manager.getCredentials(entry.serverId, entry.database, entry.username);
        resolvedPassword = retrieved ?? '';
      } catch {
        resolvedPassword = '';
      }
      return {
        serverId: entry.serverId,
        database: entry.database,
        username: entry.username,
        password: resolvedPassword,
      };
    }

    // No stored credentials — prompt the user
    const database = await input({ message: 'Database:' });
    const username = await input({ message: 'Username:' });
    const resolvedPassword = await password({ message: 'Password:' });

    // Save credentials to keychain
    try {
      await manager.storeCredentials(serverId, database, username, resolvedPassword);
    } catch {
      // Keychain write failure is non-fatal; credentials still usable for this session
    }

    return { serverId, database, username, password: resolvedPassword };
  }

  /**
   * Execute the browse command.
   *
   * Exits with code 1 if not running in an interactive terminal.
   * Prompts user to select a server if servers are configured.
   * Resolves credentials for the selected server (from keychain or prompt).
   * Displays helpful message if no servers are configured.
   *
   * @returns Command result
   */
  async execute(): Promise<CommandResult> {
    if (!this.isInteractiveTTY()) {
      process.stderr.write(
        'Error: browse command requires an interactive terminal (TTY).\n' +
          'This command cannot be used in non-interactive mode (pipes, scripts, or CI).\n'
      );
      process.exit(1);
    }

    const manager = new ServerManager();
    const servers = manager.listServers();

    if (servers.length === 0) {
      process.stdout.write(
        'No servers configured.\n' +
          'Use `fmo server add` to add a FileMaker server.\n'
      );
      return {
        success: true,
        data: { message: 'No servers configured.' },
      };
    }

    const serverId = await select({
      message: 'Select a server:',
      choices: servers.map((server) => ({
        name: `${server.name} (${server.id})`,
        value: server.id,
      })),
    });

    // Resolve credentials for the selected server (T013)
    let credentials: BrowseCredentials;
    try {
      credentials = await this.resolveCredentials(serverId);
    } catch {
      return {
        success: false,
        error: 'Failed to resolve credentials.',
      };
    }

    return {
      success: true,
      data: {
        serverId: credentials.serverId,
        database: credentials.database,
        username: credentials.username,
        // password is intentionally omitted from result data to avoid leaking
      },
    };
  }
}
