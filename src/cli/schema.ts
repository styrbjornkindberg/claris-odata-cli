/**
 * Schema Command
 *
 * Displays table schema and metadata.
 *
 * @module cli/schema
 */

import { BaseCommand, type CommandOptions } from './index';
import axios from 'axios';
import { AuthManager } from '../api/auth';
import { ServerManager } from '../config/servers';
import { CredentialsManager } from '../config/credentials';
import type { CommandResult } from '../types';

/**
 * Schema command options
 */
export interface SchemaOptions extends CommandOptions {
  /** Server ID */
  serverId: string;
  /** Database name */
  database: string;
  /** Table name (optional - if omitted, lists all tables) */
  table?: string;
}

/**
 * Schema command implementation
 *
 * Displays table schema/metadata for FileMaker tables.
 */
export class SchemaCommand extends BaseCommand<SchemaOptions> {
  /**
   * Execute the schema command
   *
   * @returns Command result with schema information
   */
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

      const password = await credentialsManager.getCredentials(
        this.options.serverId,
        entry.database,
        entry.username
      );

      if (!password) {
        return {
          success: false,
          error: `Stored credentials are incomplete for server '${this.options.serverId}' and database '${this.options.database}'`,
        };
      }

      const protocol = server.secure !== false ? 'https' : 'http';
      const port = server.port ?? 443;
      const baseUrl = `${protocol}://${server.host}:${port}`;

      const authManager = new AuthManager();
      const authToken = authManager.createBasicAuthToken(entry.username, password);

      const metadataUrl = `${baseUrl}/fmi/odata/v4/${encodeURIComponent(this.options.database)}/$metadata`;
      const response = await axios.get<string>(metadataUrl, {
        headers: {
          Authorization: authToken,
          Accept: 'application/xml',
          'OData-Version': '4.0',
          'OData-MaxVersion': '4.0',
        },
        timeout: 30000,
      });

      const xml = response.data;
      const tableMatches = [...xml.matchAll(/<EntitySet\s+Name="([^"]+)"/g)];
      const tables = tableMatches.map((m) => m[1]);

      if (!this.options.table) {
        return {
          success: true,
          data: {
            database: this.options.database,
            tableCount: tables.length,
            tables,
          },
        };
      }

      const table = this.options.table;
      const entityTypeRegex = new RegExp(
        `<EntityType\\s+Name=\\"${table.replace(/[.*+?^${}()|[\\]\\]/g, '\\\\$&')}\\"[\\s\\S]*?<\\/EntityType>`,
        'i'
      );
      const section = xml.match(entityTypeRegex)?.[0];

      if (!section) {
        return {
          success: false,
          error: `Table '${table}' not found in metadata`,
        };
      }

      const fieldMatches = [...section.matchAll(/<Property\s+Name="([^"]+)"/g)];
      const fields = fieldMatches.map((m) => m[1]);

      return {
        success: true,
        data: {
          database: this.options.database,
          table,
          fieldCount: fields.length,
          fields,
          rawSchema: section,
        },
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: message,
      };
    }
  }
}
