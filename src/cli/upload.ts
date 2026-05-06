/**
 * Upload Command
 *
 * Uploads a file to a FileMaker container field via the OData API.
 *
 * @module cli/upload
 */

import { readFileSync } from 'fs';
import { extname } from 'path';
import { BaseCommand, type CommandOptions } from './index';
import { ODataClient } from '../api/client';
import { AuthManager } from '../api/auth';
import { ServerManager } from '../config/servers';
import { CredentialsManager } from '../config/credentials';
import { OutputFormatter } from '../output/formatter';
import type { CommandResult } from '../types';

/**
 * Upload command options
 */
export interface UploadOptions extends CommandOptions {
  /** Server ID */
  serverId: string;
  /** Database name */
  database: string;
  /** Table name */
  table: string;
  /** Record ID */
  id: number;
  /** Container field name */
  field: string;
  /** Path to the local file to upload */
  file: string;
}

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
};

function detectContentType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return MIME_TYPES[ext] ?? 'application/octet-stream';
}

/**
 * Upload command implementation
 *
 * Reads a local file and PATCHes it to a FileMaker container field.
 */
export class UploadCommand extends BaseCommand<UploadOptions> {
  private formatter: OutputFormatter;

  constructor(options: UploadOptions) {
    super(options);
    this.formatter = new OutputFormatter(options.output ?? 'json');
  }

  async execute(): Promise<CommandResult> {
    try {
      const serverManager = new ServerManager();
      const server = serverManager.getServer(this.options.serverId);

      if (!server) {
        return {
          success: false,
          error: `Server not found: ${this.options.serverId}`,
        };
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

      const credentials = await credentialsManager.getCredentials(
        this.options.serverId,
        entry.database,
        entry.username
      );

      if (!credentials) {
        return {
          success: false,
          error: `Stored credentials are incomplete for server '${this.options.serverId}' and database '${this.options.database}'`,
        };
      }

      const fileBuffer = readFileSync(this.options.file) as Buffer;
      const contentType = detectContentType(this.options.file);

      const protocol = (server.secure ?? true) ? 'https' : 'http';
      const port = server.port ?? 443;
      const baseUrl = `${protocol}://${server.host}:${port}`;

      const authManager = new AuthManager();
      const authToken = authManager.createBasicAuthToken(entry.username, credentials);

      const client = new ODataClient({ baseUrl, database: this.options.database, authToken });

      await client.uploadContainerField(
        this.options.table,
        this.options.id,
        this.options.field,
        fileBuffer,
        contentType
      );

      return {
        success: true,
        data: {
          table: this.options.table,
          id: this.options.id,
          field: this.options.field,
          file: this.options.file,
          contentType,
        },
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

  formatOutput(result: CommandResult): string {
    if (!result.success) {
      return this.formatter.formatJson({
        type: 'error',
        code: 'UPLOAD_FAILED',
        message: result.error ?? 'Unknown error',
      });
    }

    return this.formatter.formatJson(result.data);
  }
}
