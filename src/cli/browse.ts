/**
 * Browse Command
 *
 * Interactive browser for FileMaker servers, databases, and tables.
 * Requires an interactive terminal (TTY) to function.
 *
 * @module cli/browse
 */

import { select, input, password } from '@inquirer/prompts';
import axios from 'axios';
import { BaseCommand, type CommandOptions } from './index';
import { ServerManager } from '../config/servers';
import { CredentialsManager } from '../config/credentials';
import { ODataClient } from '../api/client';
import type { CommandResult, CredentialEntry, BrowseAction } from '../types';

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
 * OData service document response shape
 */
interface ODataServiceDocument {
  value: Array<{ name: string; kind: string; url: string }>;
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

    let storedCredentials: CredentialEntry[] = [];
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
   * Fetch the list of available databases from a FileMaker server.
   *
   * Calls the OData service document endpoint at /fmi/odata/v4, which
   * returns a list of available databases (EntitySets).
   *
   * @param server - The server configuration (id, host, port, secure)
   * @param credentials - Resolved credentials for authentication
   * @returns Array of database names
   * @throws Error on connection failure or authentication error
   */
  async fetchDatabases(
    server: { host: string; port?: number; secure?: boolean },
    credentials: BrowseCredentials
  ): Promise<string[]> {
    const protocol = server.secure !== false ? 'https' : 'http';
    const port = server.port ?? 443;
    const baseUrl = `${protocol}://${server.host}:${port}`;

    const authToken = Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64');

    const response = await axios.get<ODataServiceDocument>(`${baseUrl}/fmi/odata/v4`, {
      headers: {
        Authorization: `Basic ${authToken}`,
        Accept: 'application/json',
        'OData-Version': '4.0',
        'OData-MaxVersion': '4.0',
      },
      timeout: 30000,
    });

    const entries = response.data?.value ?? [];
    return entries
      .filter((e) => e.kind === 'EntityContainer' || e.kind === undefined || e.kind !== 'FunctionImport')
      .map((e) => e.name)
      .filter(Boolean);
  }

  /**
   * Prompt the user to select a database from the list.
   *
   * Displays databases in a select() menu with a "Back" option at the top.
   * Returns the selected database name, or null if "Back" was chosen.
   *
   * @param databases - List of database names to display
   * @returns Selected database name, or null for "Back"
   */
  async selectDatabase(databases: string[]): Promise<string | null> {
    const BACK = '__back__';

    const choice = await select<string>({
      message: 'Select a database:',
      choices: [
        { name: '← Back', value: BACK },
        ...databases.map((db) => ({ name: db, value: db })),
      ],
    });

    return choice === BACK ? null : choice;
  }

  /**
   * Fetch the list of available tables from a FileMaker database.
   *
   * Calls the OData service document endpoint at /fmi/odata/v4/{database},
   * which returns a list of available tables (EntitySets), filtering out
   * FunctionImport entries.
   *
   * @param server - The server configuration (id, host, port, secure)
   * @param credentials - Resolved credentials for authentication
   * @param database - The selected database name
   * @returns Array of table names
   * @throws Error on connection failure or authentication error
   */
  async fetchTables(
    server: { host: string; port?: number; secure?: boolean },
    credentials: BrowseCredentials,
    database: string
  ): Promise<string[]> {
    const protocol = server.secure !== false ? 'https' : 'http';
    const port = server.port ?? 443;
    const baseUrl = `${protocol}://${server.host}:${port}`;

    const authToken = Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64');

    const response = await axios.get<ODataServiceDocument>(
      `${baseUrl}/fmi/odata/v4/${encodeURIComponent(database)}`,
      {
        headers: {
          Authorization: `Basic ${authToken}`,
          Accept: 'application/json',
          'OData-Version': '4.0',
          'OData-MaxVersion': '4.0',
        },
        timeout: 30000,
      }
    );

    const entries = response.data?.value ?? [];
    return entries
      .filter((e) => e.kind !== 'FunctionImport')
      .map((e) => e.name)
      .filter(Boolean);
  }

  /**
   * Prompt the user to select a table from the list.
   *
   * Displays tables in a select() menu with a "Back" option at the top.
   * Returns the selected table name, or null if "Back" was chosen.
   *
   * @param tables - List of table names to display
   * @returns Selected table name, or null for "Back"
   */
  async selectTable(tables: string[]): Promise<string | null> {
    const BACK = '__back__';

    const choice = await select<string>({
      message: 'Select a table:',
      choices: [
        { name: '← Back', value: BACK },
        ...tables.map((t) => ({ name: t, value: t })),
      ],
    });

    return choice === BACK ? null : choice;
  }

  /**
   * Prompt the user to select an action to perform on the selected table.
   *
   * Displays an action menu via select() with 4 actions plus a "Back" option.
   * Returns the selected action, or null if "Back" was chosen.
   *
   * @returns Selected BrowseAction, or null for "Back"
   */
  async selectAction(): Promise<BrowseAction | null> {
    const BACK = '__back__';

    const choice = await select<string>({
      message: 'Select an action:',
      choices: [
        { name: '← Back', value: BACK },
        { name: 'List Records', value: 'list-records' },
        { name: 'Get Record by ID', value: 'get-record' },
        { name: 'Create Record', value: 'create-record' },
        { name: 'View Schema', value: 'view-schema' },
      ],
    });

    return choice === BACK ? null : (choice as BrowseAction);
  }

  /**
   * Execute the selected action against the given table using ODataClient.
   *
   * Builds an ODataClient from the server config and credentials, then
   * dispatches to the appropriate operation based on the selected action.
   *
   * @param server - The server configuration (host, port, secure)
   * @param credentials - Resolved credentials for authentication
   * @param table - The selected table name
   * @param action - The selected action to perform
   * @returns Command result
   */
  async executeAction(
    server: { host: string; port?: number; secure?: boolean },
    credentials: BrowseCredentials,
    table: string,
    action: BrowseAction
  ): Promise<CommandResult> {
    const protocol = server.secure !== false ? 'https' : 'http';
    const port = server.port ?? 443;
    const baseUrl = `${protocol}://${server.host}:${port}`;
    const authToken = `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64')}`;

    const client = new ODataClient({
      baseUrl,
      database: credentials.database,
      authToken,
    });

    switch (action) {
      case 'list-records': {
        const records = await client.getRecords(table);
        return { success: true, data: records };
      }

      case 'get-record': {
        const idStr = await input({ message: 'Record ID:' });
        const recordId = parseInt(idStr, 10);
        if (isNaN(recordId)) {
          return { success: false, error: `Invalid record ID: ${idStr}` };
        }
        const record = await client.getRecord(table, recordId);
        return { success: true, data: record };
      }

      case 'create-record': {
        const jsonStr = await input({ message: 'Record data (JSON):' });
        let data: Record<string, unknown>;
        try {
          data = JSON.parse(jsonStr) as Record<string, unknown>;
        } catch {
          return { success: false, error: 'Invalid JSON for record data.' };
        }
        const created = await client.createRecord(table, data);
        return { success: true, data: created };
      }

      case 'view-schema': {
        // Fetch OData $metadata XML for the table
        const metaUrl = `/fmi/odata/v4/${encodeURIComponent(credentials.database)}/$metadata`;
        const response = await axios.get<string>(`${baseUrl}${metaUrl}`, {
          headers: {
            Authorization: authToken,
            Accept: 'application/xml',
            'OData-Version': '4.0',
            'OData-MaxVersion': '4.0',
          },
          timeout: 30000,
        });
        return { success: true, data: { schema: response.data, table } };
      }

      default:
        return { success: false, error: `Unknown action: ${action as string}` };
    }
  }

  /**
   * Execute the browse command.
   *
   * Exits with code 1 if not running in an interactive terminal.
   * Prompts user to select a server if servers are configured.
   * Resolves credentials for the selected server (from keychain or prompt).
   * Fetches and displays available databases for selection.
   * Fetches and displays available tables for selection.
   * Displays action menu after table selection and executes selected action.
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

    // Server selection loop (allows coming back from database selection)
    // eslint-disable-next-line no-constant-condition
    while (true) {
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

      // Database selection loop (T014)
      const selectedServer = servers.find((s) => s.id === serverId);
      // eslint-disable-next-line no-constant-condition
      while (true) {
        let databases: string[];
        try {
          databases = await this.fetchDatabases(
            selectedServer ?? { host: serverId },
            credentials
          );
        } catch (err) {
          const isAuthError =
            err instanceof Error &&
            (err.message.includes('401') || err.message.includes('403') || err.message.toLowerCase().includes('auth'));

          if (isAuthError) {
            process.stdout.write('Authentication failed. Please check your credentials.\n');
          } else {
            process.stdout.write('Connection error: Could not reach the server.\n');
          }

          const action = await select({
            message: 'What would you like to do?',
            choices: [
              { name: 'Retry', value: 'retry' },
              { name: '← Back to server selection', value: 'back' },
            ],
          });

          if (action === 'back') break; // back to server selection
          continue; // retry fetchDatabases
        }

        if (databases.length === 0) {
          process.stdout.write('No databases found on this server.\n');
          const action = await select({
            message: 'What would you like to do?',
            choices: [
              { name: '← Back to server selection', value: 'back' },
            ],
          });
          void action; // always back
          break; // back to server selection
        }

        const selectedDatabase = await this.selectDatabase(databases);

        if (selectedDatabase === null) {
          // User chose "Back" — return to server selection
          break;
        }

        // Table selection loop (T015)
        // eslint-disable-next-line no-constant-condition
        while (true) {
          let tables: string[];
          try {
            tables = await this.fetchTables(
              selectedServer ?? { host: serverId },
              credentials,
              selectedDatabase
            );
          } catch (err) {
            const isAuthError =
              err instanceof Error &&
              (err.message.includes('401') || err.message.includes('403') || err.message.toLowerCase().includes('auth'));

            if (isAuthError) {
              process.stdout.write('Authentication failed. Please check your credentials.\n');
            } else {
              process.stdout.write('Connection error: Could not reach the server.\n');
            }

            const action = await select({
              message: 'What would you like to do?',
              choices: [
                { name: 'Retry', value: 'retry' },
                { name: '← Back to database selection', value: 'back' },
              ],
            });

            if (action === 'back') break; // back to database selection
            continue; // retry fetchTables
          }

          if (tables.length === 0) {
            process.stdout.write('No tables found in this database.\n');
            const action = await select({
              message: 'What would you like to do?',
              choices: [
                { name: '← Back to database selection', value: 'back' },
              ],
            });
            void action; // always back
            break; // back to database selection
          }

          const selectedTable = await this.selectTable(tables);

          if (selectedTable === null) {
            // User chose "Back" — return to database selection loop
            break;
          }

          // Action selection loop (T016)
          // eslint-disable-next-line no-constant-condition
          while (true) {
            const selectedAction = await this.selectAction();

            if (selectedAction === null) {
              // User chose "Back" — return to table selection loop
              break;
            }

            // Execute the selected action
            let actionResult: CommandResult;
            try {
              actionResult = await this.executeAction(
                selectedServer ?? { host: serverId },
                credentials,
                selectedTable,
                selectedAction
              );
            } catch (err) {
              const message = err instanceof Error ? err.message : 'Unknown error';
              process.stdout.write(`Action failed: ${message}\n`);
              actionResult = { success: false, error: message };
            }

            if (actionResult.success && actionResult.data !== undefined) {
              const output = JSON.stringify(actionResult.data, null, 2);
              process.stdout.write(`${output}\n`);
            } else if (!actionResult.success) {
              process.stdout.write(`Error: ${actionResult.error ?? 'Action failed'}\n`);
            }

            // After action, return result with context
            return {
              success: actionResult.success,
              data: actionResult.success
                ? {
                    serverId: credentials.serverId,
                    database: selectedDatabase,
                    table: selectedTable,
                    username: credentials.username,
                    action: selectedAction,
                    result: actionResult.data,
                    // password is intentionally omitted from result data to avoid leaking
                  }
                : actionResult.data,
              error: actionResult.error,
            };
          }
          // Looping back to table selection
        }
        // Looping back to database selection
      }
      // Looping back to server selection
    }
  }
}
