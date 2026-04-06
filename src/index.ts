/**
 * Claris OData CLI - Main Entry Point
 *
 * Command-line interface for working with Claris FileMaker OData API.
 *
 * @module index
 */

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { logger } from './utils/logger';
import { c, box } from './lib/theme';
import type { OutputFormat } from './types';

// Load package.json for version
const packageJsonPath = resolve(__dirname, '..', 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

/**
 * Display ASCII header on CLI startup
 */
function showHeader(): void {
  const header = box('Claris OData CLI', [
    c.muted('FileMaker OData API Client'),
    '',
    c.muted('Version: ') + require('../package.json').version,
    c.muted('Docs: https://help.claris.com/en/odata-guide/'),
  ]);
  process.stdout.write(`${header}\n`);
}

/**
 * Create and configure the CLI program
 *
 * @returns Configured Commander program
 */
function createProgram(): Command {
  const program = new Command();

  program
    .name('fmo')
    .description('CLI tool for working with Claris FileMaker OData API')
    .version(packageJson.version)
    .option('-v, --verbose', 'Enable verbose logging')
    .option('-f, --format <format>', 'Output format (json, table, csv)', 'table')
    .option('-s, --server <id>', 'Default server ID')
    .option('-d, --database <name>', 'Default database name');

  // Init command
  program
    .command('init')
    .description('Bootstrap ~/.fmo/context.json with servers, databases, and tables')
    .option('--refresh', 'Update existing context.json')
    .option('--json', 'Print generated context to stdout')
    .action(async (options) => {
      const { InitCommand } = await import('./cli/init');
      const globalOpts = program.opts();
      const cmd = new InitCommand({
        refresh: options.refresh,
        json: options.json,
        output: globalOpts.format as OutputFormat,
        verbose: globalOpts.verbose ?? false,
      });
      const result = await cmd.execute();
      if (!result.success) {
        process.stderr.write((result.error ?? 'Unknown error') + '\n');
        process.exit(1);
      }
      if (options.json && result.data) {
        process.stdout.write(JSON.stringify(result.data, null, 2) + '\n');
      }
      process.exit(0);
    });

  // List command
  program
    .command('list <resource>')
    .description('List servers, databases, or tables')
    .option('-s, --server <id>', 'Server ID (required for databases and tables)')
    .option('-d, --database <name>', 'Database name (required for tables)')
    .action(async (resource: string, options) => {
      const { ListCommand } = await import('./cli/list');
      const globalOpts = program.opts();
      const cmd = new ListCommand({
        resource: resource as 'servers' | 'databases' | 'tables',
        serverId: options.server ?? globalOpts.server,
        database: options.database ?? globalOpts.database,
        output: globalOpts.format as OutputFormat,
        verbose: globalOpts.verbose ?? false,
      });
      process.exit(await cmd.run());
    });

  // Get command
  program
    .command('get <table>')
    .description('Get records from a table')
    .requiredOption('-s, --server <id>', 'Server ID')
    .requiredOption('-d, --database <name>', 'Database name')
    .option('-f, --filter <expr>', 'OData filter expression')
    .option('--select <fields>', 'Fields to select (comma-separated)')
    .option('-t, --top <n>', 'Maximum records to return', parseInt)
    .option('--skip <n>', 'Records to skip', parseInt)
    .option('--orderby <field>', 'Order by field')
    .option('--count', 'Include total count')
    .action(async (table: string, options) => {
      const { GetCommand } = await import('./cli/get');
      const globalOpts = program.opts();
      const select = options.select ? options.select.split(',') : undefined;
      const cmd = new GetCommand({
        table,
        serverId: options.server ?? globalOpts.server,
        database: options.database ?? globalOpts.database,
        filter: options.filter,
        select,
        top: options.top,
        skip: options.skip,
        orderby: options.orderby,
        count: options.count,
        output: globalOpts.format as OutputFormat,
        verbose: globalOpts.verbose ?? false,
      });
      process.exit(await cmd.run());
    });

  // Create command
  program
    .command('create <table>')
    .description('Create a new record')
    .requiredOption('-s, --server <id>', 'Server ID')
    .requiredOption('-d, --database <name>', 'Database name')
    .requiredOption('--data <json>', 'Record data as JSON')
    .action(async (table: string, options) => {
      const { CreateCommand } = await import('./cli/create');
      const globalOpts = program.opts();
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(options.data);
      } catch {
        logger.error('Invalid JSON data');
        process.exit(1);
        return;
      }
      const cmd = new CreateCommand({
        table,
        serverId: options.server ?? globalOpts.server,
        database: options.database ?? globalOpts.database,
        data,
        output: globalOpts.format as OutputFormat,
        verbose: globalOpts.verbose ?? false,
      });
      process.exit(await cmd.run());
    });

  // Update command
  program
    .command('update <table> <recordId>')
    .description('Update an existing record')
    .requiredOption('-s, --server <id>', 'Server ID')
    .requiredOption('-d, --database <name>', 'Database name')
    .requiredOption('--data <json>', 'Record data as JSON')
    .action(async (table: string, recordId: string, options) => {
      const { UpdateCommand } = await import('./cli/update');
      const globalOpts = program.opts();
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(options.data);
      } catch {
        logger.error('Invalid JSON data');
        process.exit(1);
        return;
      }
      const cmd = new UpdateCommand({
        table,
        recordId: parseInt(recordId, 10),
        serverId: options.server ?? globalOpts.server,
        database: options.database ?? globalOpts.database,
        data,
        output: globalOpts.format as OutputFormat,
        verbose: globalOpts.verbose ?? false,
      });
      process.exit(await cmd.run());
    });

  // Delete command
  program
    .command('delete <table> <recordId>')
    .description('Delete a record')
    .requiredOption('-s, --server <id>', 'Server ID')
    .requiredOption('-d, --database <name>', 'Database name')
    .action(async (table: string, recordId: string, options) => {
      const { DeleteCommand } = await import('./cli/delete');
      const globalOpts = program.opts();
      const cmd = new DeleteCommand({
        table,
        recordId: parseInt(recordId, 10),
        serverId: options.server ?? globalOpts.server,
        database: options.database ?? globalOpts.database,
        output: globalOpts.format as OutputFormat,
        verbose: globalOpts.verbose ?? false,
      });
      process.exit(await cmd.run());
    });

  // Schema command
  program
    .command('schema [table]')
    .description('Display table schema')
    .requiredOption('-s, --server <id>', 'Server ID')
    .requiredOption('-d, --database <name>', 'Database name')
    .action(async (table: string | undefined, options) => {
      const { SchemaCommand } = await import('./cli/schema');
      const globalOpts = program.opts();
      const cmd = new SchemaCommand({
        table,
        serverId: options.server ?? globalOpts.server,
        database: options.database ?? globalOpts.database,
        output: globalOpts.format as OutputFormat,
        verbose: globalOpts.verbose ?? false,
      });
      process.exit(await cmd.run());
    });

  // Health command
  program
    .command('health')
    .description('Check API connectivity for configured servers')
    .action(async () => {
      const { HealthCommand } = await import('./cli/health');
      const globalOpts = program.opts();
      const cmd = new HealthCommand({
        output: globalOpts.format as OutputFormat,
        verbose: globalOpts.verbose ?? false,
      });
      process.exit(await cmd.run());
    });

  // Browse command
  program
    .command('browse')
    .description('Interactively browse servers, databases, and tables')
    .option('-s, --server <id>', 'Server ID (skip server selection)')
    .option('-d, --database <name>', 'Database name (skip database selection)')
    .action(async (options) => {
      const { BrowseCommand } = await import('./cli/browse');
      const globalOpts = program.opts();
      const cmd = new BrowseCommand({
        serverId: options.server ?? globalOpts.server,
        database: options.database ?? globalOpts.database,
        output: globalOpts.format as OutputFormat,
        verbose: globalOpts.verbose ?? false,
      });
      const result = await cmd.execute();
      process.exit(result.success ? 0 : 1);
    });

  // Server credentials commands: fmo server credentials <add|list|remove>
  const serverCmd = program.command('server').description('Manage server configurations');

  serverCmd
    .command('add')
    .description('Add a server configuration')
    .requiredOption('--name <name>', 'Server name')
    .requiredOption('--host <host>', 'Server hostname')
    .option('--port <port>', 'Server port', parseInt)
    .option('--insecure', 'Use HTTP instead of HTTPS')
    .option('--database <name>', 'Database name for optional credential storage')
    .option('--username <user>', 'Username for optional credential storage')
    .option('--password <pass>', 'Password for optional credential storage')
    .action(async (options) => {
      const { ServerCommand } = await import('./cli/server');
      const globalOpts = program.opts();
      const cmd = new ServerCommand({
        action: 'add',
        name: options.name,
        host: options.host,
        port: options.port,
        secure: options.insecure ? false : true,
        database: options.database,
        username: options.username,
        password: options.password,
        output: globalOpts.format as OutputFormat,
        verbose: globalOpts.verbose ?? false,
      });
      const result = await cmd.execute();
      process.stdout.write(cmd.formatOutput(result) + '\n');
      process.exit(result.success ? 0 : 1);
    });

  serverCmd
    .command('list')
    .description('List configured servers')
    .action(async () => {
      const { ServerCommand } = await import('./cli/server');
      const globalOpts = program.opts();
      const cmd = new ServerCommand({
        action: 'list',
        output: globalOpts.format as OutputFormat,
        verbose: globalOpts.verbose ?? false,
      });
      const result = await cmd.execute();
      process.stdout.write(cmd.formatOutput(result) + '\n');
      process.exit(result.success ? 0 : 1);
    });

  serverCmd
    .command('remove')
    .description('Remove a server configuration')
    .requiredOption('--server-id <id>', 'Server ID')
    .action(async (options) => {
      const { ServerCommand } = await import('./cli/server');
      const globalOpts = program.opts();
      const cmd = new ServerCommand({
        action: 'remove',
        serverId: options.serverId,
        output: globalOpts.format as OutputFormat,
        verbose: globalOpts.verbose ?? false,
      });
      const result = await cmd.execute();
      process.stdout.write(cmd.formatOutput(result) + '\n');
      process.exit(result.success ? 0 : 1);
    });

  const credentialsCmd = serverCmd
    .command('credentials')
    .description('Manage stored credentials for a server');

  credentialsCmd
    .command('add')
    .description('Store credentials for a server')
    .requiredOption('--server-id <id>', 'Server ID')
    .requiredOption('--database <name>', 'Database name')
    .requiredOption('--username <user>', 'Username')
    .option('--password <pass>', 'Password (prompted if omitted)')
    .action(async (options) => {
      const { CredentialsCommand } = await import('./cli/credentials');
      const globalOpts = program.opts();
      const cmd = new CredentialsCommand({
        action: 'add',
        serverId: options.serverId,
        database: options.database,
        username: options.username,
        password: options.password,
        output: globalOpts.format as OutputFormat,
        verbose: globalOpts.verbose ?? false,
      });
      const result = await cmd.execute();
      process.stdout.write(cmd.formatOutput(result) + '\n');
      process.exit(result.success ? 0 : 1);
    });

  credentialsCmd
    .command('list')
    .description('List stored credentials for a server')
    .requiredOption('--server-id <id>', 'Server ID')
    .action(async (options) => {
      const { CredentialsCommand } = await import('./cli/credentials');
      const globalOpts = program.opts();
      const cmd = new CredentialsCommand({
        action: 'list',
        serverId: options.serverId,
        output: globalOpts.format as OutputFormat,
        verbose: globalOpts.verbose ?? false,
      });
      const result = await cmd.execute();
      process.stdout.write(cmd.formatOutput(result) + '\n');
      process.exit(result.success ? 0 : 1);
    });

  credentialsCmd
    .command('remove')
    .description('Remove stored credentials for a server')
    .requiredOption('--server-id <id>', 'Server ID')
    .requiredOption('--database <name>', 'Database name')
    .requiredOption('--username <user>', 'Username')
    .action(async (options) => {
      const { CredentialsCommand } = await import('./cli/credentials');
      const globalOpts = program.opts();
      const cmd = new CredentialsCommand({
        action: 'remove',
        serverId: options.serverId,
        database: options.database,
        username: options.username,
        output: globalOpts.format as OutputFormat,
        verbose: globalOpts.verbose ?? false,
      });
      const result = await cmd.execute();
      process.stdout.write(cmd.formatOutput(result) + '\n');
      process.exit(result.success ? 0 : 1);
    });

  return program;
}

/**
 * Main entry point
 */
export async function main(): Promise<void> {
  // Show ASCII header on startup
  showHeader();

  const program = createProgram();
  await program.parseAsync(process.argv);
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown error';
    process.stderr.write(message + '\n');
    process.exit(1);
  });
}

// Export public API
export { ODataClient, type ClientConfig } from './api/client';
export { AuthManager } from './api/auth';
export { EndpointBuilder } from './api/endpoints';
export { ServerManager } from './config/servers';
export { CredentialsManager } from './config/credentials';
export { ProfileManager } from './config/profiles';
export { OutputFormatter } from './utils/output';
export { Logger, logger } from './utils/logger';
export * from './types';
