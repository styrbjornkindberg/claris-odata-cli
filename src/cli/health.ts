/**
 * Health Command - Check API connectivity for configured servers
 *
 * Displays connectivity status for each server with styled output.
 *
 * @module cli/health
 */

import axios from 'axios';
import { ServerManager } from '../config/servers';
import { CredentialsManager } from '../config/credentials';
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

interface HttpErrorShape {
  code?: string;
  message?: string;
  response?: {
    status?: number;
  };
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
  }): Promise<ServerHealth> {
    const health: ServerHealth = {
      id: server.id,
      name: server.name,
      host: server.host,
      port: server.port ?? 443,
      status: 'ok',
    };

    try {
      // Get credentials for this server
      const credentials = await this.credentialsManager.listCredentials(server.id);

      if (!credentials || credentials.length === 0) {
        health.status = 'no-credentials';
        health.error = 'No credentials stored';
        return health;
      }

      // Use first credential to test connectivity
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

      // Test connectivity with a simple HTTP request
      const protocol = health.port === 443 ? 'https' : 'http';
      const baseUrl = `${protocol}://${server.host}:${health.port}/fmi/odata/v4`;
      const authToken = Buffer.from(`${cred.username}:${storedPassword}`).toString('base64');

      // Test connectivity by hitting the root endpoint
      const start = Date.now();
      await axios.get(`${baseUrl}/`, {
        headers: { Authorization: `Basic ${authToken}` },
        timeout: 5000,
      });
      health.latency = Date.now() - start;
    } catch (error: unknown) {
      health.status = 'error';
      health.error = this.formatError(error);
    }

    return health;
  }

  /**
   * Format error message for display
   */
  private formatError(error: unknown): string {
    const parsed = error as HttpErrorShape;

    if (parsed.code === 'ECONNREFUSED') {
      return 'Connection refused';
    }
    if (parsed.code === 'ETIMEDOUT' || parsed.code === 'ECONNABORTED') {
      return 'Connection timeout';
    }
    if (parsed.code === 'ENOTFOUND') {
      return 'Host not found';
    }
    if (parsed.code === 'CERT_HAS_EXPIRED') {
      return 'Certificate expired';
    }
    if (parsed.response?.status === 401) {
      return 'Authentication failed';
    }
    if (parsed.response?.status === 404) {
      return 'Database not found';
    }
    if (parsed.response?.status === 500) {
      return 'Server error';
    }
    return parsed.message ?? 'Unknown error';
  }

  /**
   * Format output for display
   */
  formatOutput(result: HealthResult): string {
    const lines: string[] = [];

    // Header
    lines.push(c.heading('Health Check'));
    lines.push(c.muted(`Generated: ${new Date(result.generatedAt).toLocaleString()}`));
    lines.push('');

    if (result.total === 0) {
      lines.push(c.warn('No servers configured'));
      return lines.join('\n');
    }

    // Server status
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

    // Summary
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
    // Convert ServerHealth objects to plain records for JSONL
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
        case 'csv':
          // Convert ServerHealth objects to plain records for CSV
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
        case 'table':
        default:
          process.stdout.write(this.formatOutput(result) + '\n');
          break;
      }

      // Exit with error code if any servers are unhealthy
      return result.unhealthy > 0 ? 1 : 0;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Health check failed', { error: message });
      return 1;
    }
  }
}
