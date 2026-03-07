/**
 * CLI Command Base
 *
 * Base classes and utilities for CLI commands.
 *
 * @module cli/index
 */

import type { CommandResult, OutputFormat } from '../types';
import { OutputFormatter } from '../utils/output';
import { logger } from '../utils/logger';

/**
 * Base command options
 */
export interface CommandOptions {
  /** Output format */
  output?: OutputFormat;
  /** Verbose output */
  verbose?: boolean;
}

/**
 * Base class for CLI commands
 *
 * Provides common functionality for all commands.
 */
export abstract class BaseCommand<TOptions extends CommandOptions = CommandOptions> {
  protected output: OutputFormatter;
  protected options: TOptions;

  constructor(options: TOptions) {
    this.options = options;
    this.output = new OutputFormatter(options.output ?? 'table');

    // Set log level based on verbose flag
    if (options.verbose) {
      logger.setLevel('debug');
    }
  }

  /**
   * Execute the command
   *
   * @returns Command result
   */
  abstract execute(): Promise<CommandResult>;

  /**
   * Run the command with error handling
   *
   * @returns Exit code (0 for success, non-zero for failure)
   */
  async run(): Promise<number> {
    try {
      const result = await this.execute();

      if (!result.success) {
        logger.error(result.error ?? 'Command failed');
        return 1;
      }

      if (result.data) {
        this.printResult(result.data);
      }

      return 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(message);
      return 1;
    }
  }

  /**
   * Print result using configured output format
   *
   * @param data - Data to print
   */
  protected printResult(data: unknown): void {
    const output = this.output.formatData(data as Record<string, unknown>);
    process.stdout.write(`${output}\n`);
  }
}
