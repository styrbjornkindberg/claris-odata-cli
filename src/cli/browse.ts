/**
 * Browse Command
 *
 * Interactive browser for FileMaker servers, databases, and tables.
 * Requires an interactive terminal (TTY) to function.
 *
 * @module cli/browse
 */

import { BaseCommand, type CommandOptions } from './index';
import type { CommandResult } from '../types';

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
   * Execute the browse command.
   *
   * Exits with code 1 if not running in an interactive terminal.
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

    // TODO: Implement interactive browse levels (T012–T022)
    return {
      success: true,
      data: { message: 'Interactive browse not yet implemented.' },
    };
  }
}
