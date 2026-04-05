/**
 * Init Command
 *
 * Bootstraps a context file with servers, databases, and tables.
 *
 * Usage:
 *   fmo init                    # Create ~/.fmo/context.json
 *   fmo init --refresh          # Update existing context.json
 *   fmo init --json            # Print generated context to stdout
 *
 * @module cli/init
 */

import axios from 'axios';
import { homedir } from 'os';
import { join } from 'path';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { BaseCommand, type CommandOptions } from './index';
import { ServerManager } from '../config/servers';
import { CredentialsManager } from '../config/credentials';
import { c } from '../lib/theme';
import type { CommandResult, CredentialEntry } from '../types';

/**
 * OData service document response shape
 */
interface ODataServiceDocument {
  value: Array<{ name: string; kind: string; url: string }>;
}

/**
 * Context structure for saved configuration
 */
interface FmoContext {
  _description: string;
  _updated: string;
  servers: Record<string, ServerContext>;
}

/**
 * Server context in the saved config
 */
interface ServerContext {
  id: string;
  name: string;
  host: string;
  port: number;
  secure: boolean;
  databases: Record<string, DatabaseContext>;
}

/**
 * Database context in the saved config
 */
interface DatabaseContext {
  name: string;
  tables: string[];
}

/**
 * Init command options
 */
export interface InitOptions extends CommandOptions {
  /** Refresh existing context */
  refresh?: boolean;
  /** Output to JSON */
  json?: boolean;
}

/**
 * InitCommand class
 *
 * Bootstraps a context file at ~/.fmo/context.json with all configured
 * servers, databases, and tables from the FileMaker OData API.
 */
export class InitCommand extends BaseCommand<InitOptions> {
  private readonly contextDir = join(homedir(), '.fmo');
  private readonly contextFile = join(this.contextDir, 'context.json');

  /**
   * Execute the init command
   *
   * @returns Command result
   */
  async execute(): Promise<CommandResult> {
    // Check if context file exists (unless --refresh)
    if (!this.options.refresh && existsSync(this.contextFile)) {
      return {
        success: false,
        error:
          `${c.error('Context file already exists:')} ${this.contextFile}\n` +
          c.muted('Use --refresh to update.'),
      };
    }

    // Get configured servers
    const serverManager = new ServerManager();
    const servers = serverManager.listServers();

    if (servers.length === 0) {
      return {
        success: false,
        error:
          `${c.error('No servers configured.')}\n` +
          c.muted('Use `fmo server add` to add a FileMaker server.'),
      };
    }

    // Build context
    const context: FmoContext = {
      _description: 'FMO context — servers, databases, and tables. Used by AI agents.',
      _updated: new Date().toISOString().slice(0, 10),
      servers: {},
    };

    // Fetch databases and tables for each server
    for (const server of servers) {
      process.stdout.write(c.muted(`\nFetching ${server.name}...`));

      const credentials = await this.resolveCredentials(server.id);
      if (!credentials) {
        process.stdout.write(c.error(`\n  No credentials for ${server.name}, skipping.\n`));
        continue;
      }

      // Fetch databases
      const databases = await this.fetchDatabases(server, credentials);
      if (!databases || databases.length === 0) {
        process.stdout.write(c.warn(`\n  No databases found for ${server.name}.\n`));
        context.servers[server.id] = {
          id: server.id,
          name: server.name,
          host: server.host,
          port: server.port ?? 443,
          secure: server.secure ?? true,
          databases: {},
        };
        continue;
      }

      const dbContext: Record<string, DatabaseContext> = {};

      for (const dbName of databases) {
        process.stdout.write(c.muted(`.`));

        const tables = await this.fetchTables(server, credentials, dbName);
        dbContext[dbName] = {
          name: dbName,
          tables: tables,
        };
      }

      context.servers[server.id] = {
        id: server.id,
        name: server.name,
        host: server.host,
        port: server.port ?? 443,
        secure: server.secure ?? true,
        databases: dbContext,
      };

      process.stdout.write(c.success(`\n  ${databases.length} database(s) for ${server.name}.\n`));
    }

    const json = JSON.stringify(context, null, 2);

    if (this.options.json) {
      return {
        success: true,
        data: context,
      };
    }

    // Write context file
    mkdirSync(this.contextDir, { recursive: true });
    writeFileSync(this.contextFile, json + '\n', 'utf-8');

    const serverCount = Object.keys(context.servers).length;
    const dbCount = Object.values(context.servers).reduce(
      (sum, s) => sum + Object.keys(s.databases).length,
      0
    );
    const tableCount = Object.values(context.servers).reduce(
      (sum, s) => sum + Object.values(s.databases).reduce((t, d) => t + d.tables.length, 0),
      0
    );

    process.stdout.write(c.success(`\n✓ Created ${this.contextFile}\n`));
    process.stdout.write(`  Servers: ${serverCount}\n`);
    process.stdout.write(`  Databases: ${dbCount}\n`);
    process.stdout.write(`  Tables: ${tableCount}\n`);

    return {
      success: true,
      data: {
        path: this.contextFile,
        servers: serverCount,
        databases: dbCount,
        tables: tableCount,
      },
    };
  }

  /**
   * Resolve credentials for a server
   *
   * @param serverId - Server ID
   * @returns Credentials or null
   */
  private async resolveCredentials(
    serverId: string
  ): Promise<{ username: string; password: string } | null> {
    const manager = new CredentialsManager();

    let storedCredentials: CredentialEntry[] = [];
    try {
      storedCredentials = await manager.listCredentials(serverId);
    } catch {
      return null;
    }

    if (storedCredentials.length === 0) {
      return null;
    }

    const entry = storedCredentials[0];
    const password = await manager.getCredentials(entry.serverId, entry.database, entry.username);
    if (!password) {
      return null;
    }

    return {
      username: entry.username,
      password: password,
    };
  }

  /**
   * Fetch databases from a server
   *
   * @param server - Server configuration
   * @param credentials - Username and password
   * @returns List of database names
   */
  private async fetchDatabases(
    server: { host: string; port?: number; secure?: boolean },
    credentials: { username: string; password: string }
  ): Promise<string[]> {
    const protocol = server.secure !== false ? 'https' : 'http';
    const port = server.port ?? 443;
    const baseUrl = `${protocol}://${server.host}:${port}`;

    const authToken = Buffer.from(`${credentials.username}:${credentials.password}`).toString(
      'base64'
    );

    try {
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
        .filter(
          (e: { kind?: string; name?: string }) =>
            e.kind === 'EntityContainer' || e.kind === undefined || e.kind !== 'FunctionImport'
        )
        .map((e: { name?: string }) => e.name)
        .filter(Boolean) as string[];
    } catch {
      return [];
    }
  }

  /**
   * Fetch tables from a database
   *
   * @param server - Server configuration
   * @param credentials - Username and password
   * @param database - Database name
   * @returns List of table names
   */
  private async fetchTables(
    server: { host: string; port?: number; secure?: boolean },
    credentials: { username: string; password: string },
    database: string
  ): Promise<string[]> {
    const protocol = server.secure !== false ? 'https' : 'http';
    const port = server.port ?? 443;
    const baseUrl = `${protocol}://${server.host}:${port}`;

    const authToken = Buffer.from(`${credentials.username}:${credentials.password}`).toString(
      'base64'
    );

    try {
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
        .filter((e: { kind?: string }) => e.kind !== 'FunctionImport')
        .map((e: { name?: string }) => e.name)
        .filter(Boolean) as string[];
    } catch {
      return [];
    }
  }
}
