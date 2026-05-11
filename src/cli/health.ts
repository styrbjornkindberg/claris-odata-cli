/**
 * Health Command - Check API connectivity for configured servers
 *
 * Displays connectivity status for each server with styled output.
 *
 * @module cli/health
 */

import { ServerManager } from '../config/servers';
import { CredentialsManager } from '../config/credentials';
import { ODataClient } from '../api/client';
import { AuthManager } from '../api/auth';
import { NotFoundError } from '../api/errors';
import { formatApiError } from './index';
import { logger } from '../utils/logger';
import { c } from '../lib/theme';
import { OutputFormatter } from '../output/formatter';
import type { OutputFormat } from '../types';

export interface HealthOptions {
  output?: OutputFormat;
  verbose?: boolean;
}

export interface ServerHealth {
  id: string;
  name: string;
  host: string;
  port: number;
  status: 'ok' | 'error' | 'no-credentials';
  latency?: number;
  error?: string;
}

export interface HealthResult {
  servers: ServerHealth[];
  healthy: number;
  unhealthy: number;
  total: number;
  generatedAt: string;
}

/**
 * HealthCommand - Check API connectivity
 */
export class HealthCommand {
  private serverManager: ServerManager;
  private credentialsManager: CredentialsManager;
  private formatter: OutputFormatter;

  constructor(private options: HealthOptions) {
    this.serverManager = new ServerManager();
    this.credentialsManager = new CredentialsManager();
    this.formatter = new OutputFormatter(options.output ?? 'table');
  }

  /**
   * Execute the health check
   */
  async execute(): Promise<HealthResult> {
    const servers = this.serverManager.listServers();
    const serverHealths: ServerHealth[] = [];

    for (const server of servers) {
      const health = await this.checkServer(server);
      serverHealths.push(health);
    }

    const healthy = serverHealths.filter((s) => s.status === 'ok').length;
    const unhealthy = serverHealths.length - healthy;

    return {
      servers: serverHealths,
      healthy,
      unhealthy,
      total: serverHealths.length,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Check connectivity for a single server
   */
  private async checkServer(server: {
    id: string;
    name: string;
    host: string;
    port?: number;
    secure?: boolean;
  }): Promise<ServerHealth> {
    const health: ServerHealth = {
      id: server.id,
      name: server.name,
      host: server.host,
      port: server.port ?? 443,
      status: 'ok',
    };

    try {
      const credentials = await this.credentialsManager.listCredentials(server.id);

      if (!credentials || credentials.length === 0) {
        health.status = 'no-credentials';
        health.error = 'No credentials stored';
        return health;
      }

      const cred = credentials[0];
      const storedPassword = await this.credentialsManager.getCredentials(
        server.id,
        cred.database,
        cred.username
      );

      if (!storedPassword) {
        health.status = 'no-credentials';
        health.error = 'Credentials stored but password not found';
        return health;
      }

      const protocol = (server.secure ?? true) ? 'https' : 'http';
      const baseUrl = `${protocol}://${server.host}:${health.port}`;
      const authToken = new AuthManager().createBasicAuthToken(cred.username, storedPassword);

      const client = new ODataClient({ baseUrl, database: cred.database, authToken });

      const start = Date.now();
      await client.getServiceDocument();
      health.latency = Date.now() - start;
    } catch (error: unknown) {
      health.status = 'error';
      health.error = error instanceof NotFoundError ? 'Database not found' : formatApiError(error);
    }

    return health;
  }

  /**
   * Format output for display
   */
  formatOutput(result: HealthResult): string {
    const lines: string[] = [];

    lines.push(c.heading('Health Check'));
    lines.push(c.muted(`Generated: ${new Date(result.generatedAt).toLocaleString()}`));
    lines.push('');

    if (result.total === 0) {
      lines.push(c.warn('No servers configured'));
      return lines.join('\n');
    }

    for (const server of result.servers) {
      const statusIcon =
        server.status === 'ok' ? c.ok : server.status === 'no-credentials' ? c.warn : c.fail;
      const statusText =
        server.status === 'ok'
          ? c.success('Connected')
          : server.status === 'no-credentials'
            ? c.warn('No credentials')
            : c.error(server.error || 'Error');

      lines.push(`${statusIcon} ${c.bold(server.name)}`);
      lines.push(`  ${c.muted('Host:')} ${server.host}:${server.port}`);
      lines.push(`  ${c.muted('Status:')} ${statusText}`);

      if (server.latency !== undefined) {
        lines.push(`  ${c.muted('Latency:')} ${server.latency}ms`);
      }
      lines.push('');
    }

    lines.push(c.separator());
    lines.push(
      `${c.label('Total:')} ${result.total}  ${c.label('Healthy:')} ${c.success(String(result.healthy))}  ${c.label('Unhealthy:')} ${result.unhealthy > 0 ? c.error(String(result.unhealthy)) : c.success('0')}`
    );

    return lines.join('\n');
  }

  /**
   * Format as JSONL (one server per line)
   */
  formatJsonl(result: HealthResult): string {
    const servers = result.servers.map((s) => ({
      id: s.id,
      name: s.name,
      host: s.host,
      port: s.port,
      status: s.status,
      latency: s.latency,
      error: s.error,
    }));
    return this.formatter.formatJsonl(servers);
  }

  /**
   * Run the command
   */
  async run(): Promise<number> {
    try {
      const result = await this.execute();
      const format = this.options.output ?? 'table';

      switch (format) {
        case 'json':
          process.stdout.write(this.formatter.formatJson(result) + '\n');
          break;
        case 'jsonl':
          process.stdout.write(this.formatJsonl(result) + '\n');
          break;
        case 'csv': {
          const csvServers = result.servers.map((s) => ({
            id: s.id,
            name: s.name,
            host: s.host,
            port: s.port,
            status: s.status,
            latency: s.latency ?? '',
            error: s.error ?? '',
          }));
          process.stdout.write(this.formatter.formatCsv(csvServers) + '\n');
          break;
        }
        case 'table':
        default:
          process.stdout.write(this.formatOutput(result) + '\n');
          break;
      }

      return result.unhealthy > 0 ? 1 : 0;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Health check failed', { error: message });
      return 1;
    }
  }
}
