/**
 * CLI Command Base
 *
 * Base classes and utilities for CLI commands.
 *
 * @module cli/index
 */

import type { CommandResult, OutputFormat } from '../types';
import { OutputFormatter } from '../output/formatter';
import { logger } from '../utils/logger';
import {
  ODataError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
} from '../api/errors';

/**
 * Error code vocabulary for machine-readable output (SPEC-009)
 */
export type ErrorCode =
  | 'ODATA_CONNECTION_FAILED'
  | 'ODATA_AUTH_FAILED'
  | 'ODATA_QUERY_FAILED'
  | 'ODATA_TABLE_NOT_FOUND'
  | 'ODATA_IMPORT_FAILED'
  | 'ODATA_VALIDATION_ERROR'
  | 'COMMAND_FAILED';

/**
 * Error details for structured error output (SPEC-009)
 */
export interface ErrorDetails {
  server?: string;
  database?: string;
  table?: string;
  statusCode?: number;
  [key: string]: unknown;
}

/**
 * Structured error output (SPEC-009)
 */
export interface StructuredError {
  type: 'error';
  code: ErrorCode;
  message: string;
  details?: ErrorDetails;
}

/**
 * Map an error to a stable error code (SPEC-009)
 */
function resolveErrorCode(error: unknown): ErrorCode {
  if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
    return 'ODATA_AUTH_FAILED';
  }
  if (error instanceof NotFoundError) {
    return 'ODATA_TABLE_NOT_FOUND';
  }
  if (error instanceof ValidationError) {
    return 'ODATA_VALIDATION_ERROR';
  }
  if (error instanceof ODataError) {
    if (error.statusCode === 401 || error.statusCode === 403) return 'ODATA_AUTH_FAILED';
    if (error.statusCode === 404) return 'ODATA_TABLE_NOT_FOUND';
    if (error.statusCode === 400) return 'ODATA_VALIDATION_ERROR';
    return 'ODATA_QUERY_FAILED';
  }
  if (error instanceof Error && /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|timeout/i.test(error.message)) {
    return 'ODATA_CONNECTION_FAILED';
  }
  return 'COMMAND_FAILED';
}

/**
 * Extract error details from an error (SPEC-009)
 */
function extractErrorDetails(error: unknown): ErrorDetails | undefined {
  if (error instanceof ODataError) {
    const details: ErrorDetails = { statusCode: error.statusCode };
    if (error.response && typeof error.response === 'object') {
      details.response = error.response;
    }
    return details;
  }
  return undefined;
}

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
   * Check if current output format is machine-readable (JSON or JSONL)
   */
  protected isMachineReadable(): boolean {
    const fmt = this.options.output;
    return fmt === 'json' || fmt === 'jsonl';
  }

  /**
   * Run the command with error handling
   *
   * @returns Exit code (0 for success, non-zero for failure)
   */
  async run(): Promise<number> {
    try {
      const result = await this.execute();

      if (!result.success) {
        if (this.isMachineReadable()) {
          // SPEC-009: Structured error format
          const structuredError: StructuredError = {
            type: 'error',
            code: 'COMMAND_FAILED',
            message: result.error ?? 'Command failed',
          };
          const errorPayload = this.output.formatJson(structuredError);
          process.stdout.write(`${errorPayload}\n`);
        } else {
          logger.error(result.error ?? 'Command failed');
        }
        return 1;
      }

      if (result.data) {
        this.printResult(result.data);
      }

      return 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const code = resolveErrorCode(error);
      if (this.isMachineReadable()) {
        // SPEC-009: Structured error format
        const structuredError: StructuredError = {
          type: 'error',
          code,
          message,
        };
        const details = extractErrorDetails(error);
        if (details) {
          structuredError.details = details;
        }
        const errorPayload = this.output.formatJson(structuredError);
        process.stdout.write(`${errorPayload}\n`);
      } else {
        logger.error(message);
      }
      return 1;
    }
  }

  /**
   * Print result using configured output format
   *
   * @param data - Data to print
   */
  protected printResult(data: unknown): void {
    const output = this.output.format(data as Record<string, unknown>);
    process.stdout.write(`${output}\n`);
  }
}
