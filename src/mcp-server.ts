#!/usr/bin/env node
/**
 * fmo MCP Server
 *
 * Exposes the fmo CLI to Claude Desktop and other MCP clients via stdio.
 * Two tools are registered:
 *   - fmo_help: get help text for any command
 *   - fmo_run:  execute any CLI command
 *
 * The server shells out to the compiled dist/index.js binary — no CLI logic
 * is imported. As the CLI grows, the MCP server grows automatically.
 *
 * Usage (Claude Desktop config):
 *   { "mcpServers": { "fmo": { "command": "fmodata-mcp" } } }
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { z } from 'zod';
import pkg from '../package.json';

const execFileAsync = promisify(execFile);

/** Path to the compiled CLI binary, resolved relative to this file's location */
const fmoBin = path.resolve(__dirname, 'index.js');

export type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

/**
 * Factory that creates and configures the McpServer instance.
 * Exported separately so tests can call it without connecting a transport.
 */
export function createMcpServer(): {
  server: McpServer;
  tools: Map<string, (args: Record<string, unknown>) => Promise<ToolResult>>;
} {
  const server = new McpServer({ name: 'fmo-mcp', version: pkg.version });
  const tools = new Map<string, (args: Record<string, unknown>) => Promise<ToolResult>>();

  // ─── fmo_help ───────────────────────────────────────────────────────────────

  async function helpHandler(args: { command?: string }): Promise<ToolResult> {
    const tokens = args.command?.trim() ? args.command.trim().split(/\s+/) : [];
    const execArgs = [...tokens, '--help'];
    try {
      const { stdout, stderr } = await execFileAsync('node', [fmoBin, ...execArgs], {
        timeout: 10_000,
      });
      return { content: [{ type: 'text', text: stdout || stderr || '(no output)' }] };
    } catch (err: unknown) {
      return {
        content: [{ type: 'text', text: err instanceof Error ? err.message : String(err) }],
      };
    }
  }

  server.registerTool(
    'fmo_help',
    {
      description:
        'Get help text for the fmo CLI or any subcommand. ' +
        'Omit "command" for top-level help, or pass e.g. "list" or "credentials add" for subcommand help.',
      inputSchema: z.object({
        command: z
          .string()
          .optional()
          .describe('Subcommand, e.g. "credentials add". Omit for top-level help.'),
      }),
    },
    helpHandler as Parameters<McpServer['registerTool']>[2],
  );
  tools.set('fmo_help', helpHandler as (args: Record<string, unknown>) => Promise<ToolResult>);

  // ─── fmo_run ────────────────────────────────────────────────────────────────

  async function runHandler(args: { command: string }): Promise<ToolResult> {
    const execArgs = args.command.trim().split(/\s+/);
    try {
      const { stdout, stderr } = await execFileAsync('node', [fmoBin, ...execArgs], {
        timeout: 90_000,
      });
      let text = stdout || '(no output)';
      if (stderr) text += '\n--- stderr ---\n' + stderr;
      return { content: [{ type: 'text', text }] };
    } catch (err: unknown) {
      return {
        content: [{ type: 'text', text: err instanceof Error ? err.message : String(err) }],
        isError: true,
      };
    }
  }

  server.registerTool(
    'fmo_run',
    {
      description:
        'Execute any fmo CLI command against a FileMaker OData API. ' +
        'Pass arguments as you would after "fmo", ' +
        'e.g. "list Contacts --server myserver --json". ' +
        'Note: arguments are split on whitespace — do not use shell quoting.',
      inputSchema: z.object({
        command: z
          .string()
          .describe(
            'Arguments to pass to fmo, e.g. "list Contacts --server myserver --json"',
          ),
      }),
    },
    runHandler as Parameters<McpServer['registerTool']>[2],
  );
  tools.set('fmo_run', runHandler as (args: Record<string, unknown>) => Promise<ToolResult>);

  return { server, tools };
}

if (require.main === module) {
  const { server } = createMcpServer();
  const transport = new StdioServerTransport();
  server.connect(transport).catch((err: unknown) => {
    process.stderr.write(`fmo-mcp: failed to start: ${String(err)}\n`);
    process.exit(1);
  });
}
