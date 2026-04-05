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

  constructor(private options: HealthOptions) {
    this.serverManager = new ServerManager();
    this.credentialsManager = new CredentialsManager();
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

    const healthy = serverHealths.filter(s => s.status === 'ok').length;
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
  private async checkServer(server: { id: string; name: string; host: string; port?: number }): Promise<ServerHealth> {
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

    } catch (error: any) {
      health.status = 'error';
      health.error = this.formatError(error);
    }

    return health;
  }

  /**
   * Format error message for display
   */
  private formatError(error: any): string {
    if (error.code === 'ECONNREFUSED') {
      return 'Connection refused';
    }
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      return 'Connection timeout';
    }
    if (error.code === 'ENOTFOUND') {
      return 'Host not found';
    }
    if (error.code === 'CERT_HAS_EXPIRED') {
      return 'Certificate expired';
    }
    if (error.response?.status === 401) {
      return 'Authentication failed';
    }
    if (error.response?.status === 404) {
      return 'Database not found';
    }
    if (error.response?.status === 500) {
      return 'Server error';
    }
    return error.message || 'Unknown error';
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
      const statusIcon = server.status === 'ok' ? c.ok : 
                         server.status === 'no-credentials' ? c.warn : c.fail;
      const statusText = server.status === 'ok' ? c.success('Connected') :
                         server.status === 'no-credentials' ? c.warn('No credentials') :
                         c.error(server.error || 'Error');

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
    lines.push(`${c.label('Total:')} ${result.total}  ${c.label('Healthy:')} ${c.success(String(result.healthy))}  ${c.label('Unhealthy:')} ${result.unhealthy > 0 ? c.error(String(result.unhealthy)) : c.success('0')}`);

    return lines.join('\n');
  }

  /**
   * Format as JSON
   */
  formatJson(result: HealthResult): string {
    return JSON.stringify(result, null, 2);
  }

  /**
   * Run the command
   */
  async run(): Promise<number> {
    try {
      const result = await this.execute();
      
      if (this.options.output === 'json') {
        console.log(this.formatJson(result));
      } else {
        console.log(this.formatOutput(result));
      }

      // Exit with error code if any servers are unhealthy
      return result.unhealthy > 0 ? 1 : 0;
    } catch (error: any) {
      logger.error('Health check failed', error);
      return 1;
    }
  }
}