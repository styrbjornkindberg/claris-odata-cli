/**
 * `fmo overview` — Dashboard showing configured servers, databases, and record counts.
 *
 * Displays a styled dashboard with all configured servers, their connectivity
 * status, databases per server with table counts.
 *
 * @module cli/overview
 */

import { BaseCommand, type CommandOptions } from './index';
import type { CommandResult } from '../types';
import { ServerManager } from '../config/servers';
import { CredentialsManager } from '../config/credentials';
import { c, tableHeader, tableRow } from '../lib/theme';
import { OutputFormatter } from '../output/formatter';
import axios from 'axios';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface OverviewOptions extends CommandOptions {
  /** Show detailed table information */
  detailed?: boolean;
}

export interface ServerOverview {
  id: string;
  name: string;
  host: string;
  port: number;
  status: 'connected' | 'error' | 'no-credentials';
  latency?: number;
  databases: DatabaseOverview[];
  databaseCount: number;
  tableCount: number;
  error?: string;
}

export interface DatabaseOverview {
  name: string;
  tableCount: number;
  tables?: string[];
  error?: string;
}

export interface OverviewResult {
  servers: ServerOverview[];
  totalServers: number;
  totalDatabases: number;
  totalTables: number;
  connectedServers: number;
  errorServers: number;
  generatedAt: string;
}

interface HttpErrorShape {
  code?: string;
  message?: string;
  response?: { status?: number };
}

interface ODataServiceEntry {
  name: string;
  kind?: string;
  url?: string;
}

// ─── Command ─────────────────────────────────────────────────────────────────

/**
 * OverviewCommand — Show a dashboard of all configured servers and their databases
 */
export class OverviewCommand extends BaseCommand<OverviewOptions> {
  private serverManager: ServerManager;
  private credentialsManager: CredentialsManager;
  private formatter: OutputFormatter;

  constructor(options: OverviewOptions) {
    super(options);
    this.serverManager = new ServerManager();
    this.credentialsManager = new CredentialsManager();
    this.formatter = new OutputFormatter(options.output ?? 'table');
  }

  /**
   * Execute the overview command
   */
  async execute(): Promise<CommandResult> {
    const servers = this.serverManager.listServers();

    if (servers.length === 0) {
      return {
        success: true,
        data: {
          servers: [],
          totalServers: 0,
          totalDatabases: 0,
          totalTables: 0,
          connectedServers: 0,
          errorServers: 0,
          generatedAt: new Date().toISOString(),
        },
      };
    }

    const serverOverviews: ServerOverview[] = [];

    for (const server of servers) {
      const overview = await this.getOverviewForServer(server);
      serverOverviews.push(overview);
    }

    const totalDatabases = serverOverviews.reduce((sum, s) => sum + s.databaseCount, 0);
    const totalTables = serverOverviews.reduce((sum, s) => sum + s.tableCount, 0);
    const connectedServers = serverOverviews.filter((s) => s.status === 'connected').length;
    const errorServers = serverOverviews.filter((s) => s.status !== 'connected').length;

    return {
      success: true,
      data: {
        servers: serverOverviews,
        totalServers: serverOverviews.length,
        totalDatabases,
        totalTables,
        connectedServers,
        errorServers,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Get overview data for a single server
   */
  private async getOverviewForServer(server: {
    id: string;
    name: string;
    host: string;
    port?: number;
    secure?: boolean;
  }): Promise<ServerOverview> {
    const result: ServerOverview = {
      id: server.id,
      name: server.name,
      host: server.host,
      port: server.port ?? 443,
      status: 'no-credentials',
      databases: [],
      databaseCount: 0,
      tableCount: 0,
    };

    try {
      // Check credentials
      const credentials = await this.credentialsManager.listCredentials(server.id);
      if (!credentials || credentials.length === 0) {
        result.status = 'no-credentials';
        result.error = 'No credentials stored';
        return result;
      }

      const cred = credentials[0];
      const password = await this.credentialsManager.getCredentials(
        server.id,
        cred.database,
        cred.username
      );

      if (!password) {
        result.status = 'no-credentials';
        result.error = 'Credentials stored but password not found';
        return result;
      }

      // Test connectivity and fetch databases
      const protocol = result.port === 443 ? 'https' : 'http';
      const baseUrl = `${protocol}://${server.host}:${result.port}/fmi/odata/v4`;
      const authToken = Buffer.from(`${cred.username}:${password}`).toString('base64');

      const start = Date.now();
      const response = await axios.get(`${baseUrl}/`, {
        headers: { Authorization: `Basic ${authToken}` },
        timeout: 10000,
      });
      result.latency = Date.now() - start;
      result.status = 'connected';

      // Parse databases from service document
      const data = response.data as { value?: ODataServiceEntry[] };
      const dbEntries = data.value ?? [];

      // For each database, count tables
      for (const dbEntry of dbEntries) {
        const dbOverview: DatabaseOverview = {
          name: dbEntry.name,
          tableCount: 0,
          tables: [],
        };

        try {
          // Fetch metadata to count tables
          const metadataResponse = await axios.get<string>(
            `${baseUrl}/${encodeURIComponent(dbEntry.name)}/$metadata`,
            {
              headers: {
                Authorization: `Basic ${authToken}`,
                Accept: 'application/xml',
              },
              timeout: 10000,
            }
          );

          const tableMatches = [
            ...metadataResponse.data.matchAll(/<EntitySet\s+Name="([^"]+)"/g),
          ];
          dbOverview.tableCount = tableMatches.length;
          dbOverview.tables = tableMatches.map((m) => m[1]);
        } catch (err: unknown) {
          dbOverview.error = this.formatError(err);
        }

        result.databases.push(dbOverview);
      }

      result.databaseCount = result.databases.length;
      result.tableCount = result.databases.reduce((sum, db) => sum + db.tableCount, 0);
    } catch (error: unknown) {
      result.status = 'error';
      result.error = this.formatError(error);
    }

    return result;
  }

  /**
   * Format error message
   */
  private formatError(error: unknown): string {
    const parsed = error as HttpErrorShape;
    if (parsed.code === 'ECONNREFUSED') return 'Connection refused';
    if (parsed.code === 'ETIMEDOUT' || parsed.code === 'ECONNABORTED') return 'Connection timeout';
    if (parsed.code === 'ENOTFOUND') return 'Host not found';
    if (parsed.code === 'CERT_HAS_EXPIRED') return 'Certificate expired';
    if (parsed.response?.status === 401) return 'Authentication failed';
    if (parsed.response?.status === 404) return 'Not found';
    if (parsed.response?.status === 500) return 'Server error';
    return parsed.message ?? 'Unknown error';
  }

  /**
   * Format result for human-readable display
   */
  formatOutput(data: OverviewResult): string {
    const lines: string[] = [];

    // Header
    lines.push(c.heading('fmo Overview'));
    lines.push(c.muted(`Generated: ${new Date(data.generatedAt).toLocaleString()}`));
    lines.push('');

    if (data.totalServers === 0) {
      lines.push(c.warn('No servers configured'));
      return lines.join('\n');
    }

    // Summary stats
    lines.push(
      `${c.label('Servers:')} ${data.totalServers}  ${c.label('Databases:')} ${c.value(String(data.totalDatabases))}  ${c.label('Tables:')} ${c.value(String(data.totalTables))}`
    );
    lines.push(
      `${c.label('Connected:')} ${c.success(String(data.connectedServers))}  ${c.label('Errors:')} ${data.errorServers > 0 ? c.error(String(data.errorServers)) : c.success('0')}`
    );
    lines.push('');

    // Per-server details
    for (const server of data.servers) {
      const icon =
        server.status === 'connected' ? c.ok : server.status === 'no-credentials' ? '⚠' : c.fail;
      const statusText =
        server.status === 'connected'
          ? c.success('Connected')
          : server.status === 'no-credentials'
            ? c.warn('No credentials')
            : c.error(server.error || 'Error');

      lines.push(`${icon} ${c.bold(server.name)}`);
      lines.push(`  ${c.muted('Host:')} ${server.host}:${server.port}`);
      lines.push(`  ${c.muted('Status:')} ${statusText}`);

      if (server.latency !== undefined) {
        const latencyColor =
          server.latency < 100 ? c.success : server.latency < 500 ? c.warn : c.error;
        lines.push(`  ${c.muted('Latency:')} ${latencyColor(`${server.latency}ms`)}`);
      }

      lines.push(
        `  ${c.muted('Databases:')} ${server.databaseCount}  ${c.muted('Tables:')} ${server.tableCount}`
      );

      // Show database table if detailed
      if (server.databases.length > 0) {
        if (this.options.detailed) {
          // Detailed: show tables for each database
          for (const db of server.databases) {
            if (db.error) {
              lines.push(`    ${c.muted('•')} ${c.resource.database(db.name)} — ${c.error(db.error)}`);
            } else {
              lines.push(
                `    ${c.muted('•')} ${c.resource.database(db.name)} (${db.tableCount} tables)`
              );
              if (db.tables && db.tables.length > 0) {
                for (const table of db.tables) {
                  lines.push(`      ${c.muted('·')} ${c.resource.table(table)}`);
                }
              }
            }
          }
        } else {
          // Compact: styled table
          const colWidths = [
            { label: 'Database', width: 20 },
            { label: 'Tables', width: 8 },
            { label: 'Status', width: 12 },
          ];

          lines.push('    ' + tableHeader(...colWidths));

          for (const db of server.databases) {
            const dbStatus = db.error ? c.error('error') : c.success('ok');
            lines.push(
              '    ' +
                tableRow(
                  { text: c.resource.database(db.name), width: 20 },
                  { text: String(db.tableCount), width: 8 },
                  { text: dbStatus, width: 12 }
                )
            );
          }
        }
      }

      lines.push('');
    }

    // Footer
    lines.push(c.separator());

    return lines.join('\n');
  }

  /**
   * Format result as JSON Lines (one server per line)
   */
  private formatJsonl(data: OverviewResult): string {
    return data.servers
      .map((s) =>
        JSON.stringify({
          id: s.id,
          name: s.name,
          host: s.host,
          port: s.port,
          status: s.status,
          latency: s.latency ?? null,
          databaseCount: s.databaseCount,
          tableCount: s.tableCount,
          error: s.error ?? null,
          databases: s.databases.map((db) => ({
            name: db.name,
            tableCount: db.tableCount,
            tables: db.tables ?? [],
            error: db.error ?? null,
          })),
        })
      )
      .join('\n');
  }

  /**
   * Run the command
   */
  async run(): Promise<number> {
    try {
      const result = await this.execute();
      const data = result.data as OverviewResult;
      const format = this.options.output ?? 'table';

      switch (format) {
        case 'json':
          process.stdout.write(this.formatter.formatJson(data) + '\n');
          break;
        case 'jsonl':
          process.stdout.write(this.formatJsonl(data) + '\n');
          break;
        case 'csv': {
          // Flatten servers to CSV rows
          const csvRows = data.servers.flatMap((s) =>
            s.databases.length > 0
              ? s.databases.map((db) => ({
                  serverId: s.id,
                  serverName: s.name,
                  serverHost: s.host,
                  serverPort: String(s.port),
                  serverStatus: s.status,
                  serverLatency: s.latency ?? '',
                  database: db.name,
                  tableCount: String(db.tableCount),
                  databaseError: db.error ?? '',
                }))
              : [
                  {
                    serverId: s.id,
                    serverName: s.name,
                    serverHost: s.host,
                    serverPort: String(s.port),
                    serverStatus: s.status,
                    serverLatency: s.latency ?? '',
                    database: '',
                    tableCount: '',
                    databaseError: s.error ?? '',
                  },
                ]
          );
          process.stdout.write(this.formatter.formatCsv(csvRows) + '\n');
          break;
        }
        case 'table':
        default:
          process.stdout.write(this.formatOutput(data) + '\n');
          break;
      }

      return data.errorServers > 0 ? 1 : 0;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`Error: ${message}\n`);
      return 1;
    }
  }
}