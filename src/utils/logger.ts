/**
 * Logging Utilities
 *
 * Provides consistent logging for CLI operations.
 *
 * @module utils/logger
 */

import type { LogLevel, LoggerConfig } from '../types';

/**
 * Default logger configuration
 */
const DEFAULT_CONFIG: LoggerConfig = {
  level: 'info',
  timestamps: true,
  colors: true,
};

/**
 * Log level priority
 */
const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * ANSI color codes
 */
const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
};

/**
 * Logger for CLI output
 *
 * Provides structured logging with levels, timestamps, and colors.
 */
export class Logger {
  private config: LoggerConfig;

  constructor(config?: Partial<LoggerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set log level
   *
   * @param level - Minimum log level
   */
  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  /**
   * Log a debug message
   *
   * @param message - Message to log
   * @param data - Additional data
   */
  debug(message: string, data?: Record<string, unknown>): void {
    this.log('debug', message, data);
  }

  /**
   * Log an info message
   *
   * @param message - Message to log
   * @param data - Additional data
   */
  info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, data);
  }

  /**
   * Log a warning message
   *
   * @param message - Message to log
   * @param data - Additional data
   */
  warn(message: string, data?: Record<string, unknown>): void {
    this.log('warn', message, data);
  }

  /**
   * Log an error message
   *
   * @param message - Message to log
   * @param data - Additional data
   */
  error(message: string, data?: Record<string, unknown>): void {
    this.log('error', message, data);
  }

  /**
   * Internal log method
   *
   * @param level - Log level
   * @param message - Message to log
   * @param data - Additional data
   */
  private log(
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>
  ): void {
    // Check if level is enabled
    if (LOG_LEVELS[level] < LOG_LEVELS[this.config.level]) {
      return;
    }

    // Build log line
    const parts: string[] = [];

    // Add timestamp
    if (this.config.timestamps) {
      const timestamp = new Date().toISOString();
      if (this.config.colors) {
        parts.push(`${COLORS.gray}${timestamp}${COLORS.reset}`);
      } else {
        parts.push(timestamp);
      }
    }

    // Add level
    const levelStr = level.toUpperCase().padEnd(5);
    if (this.config.colors) {
      const color = this.getLevelColor(level);
      parts.push(`${color}${levelStr}${COLORS.reset}`);
    } else {
      parts.push(levelStr);
    }

    // Add message
    parts.push(message);

    // Add data if present
    if (data && Object.keys(data).length > 0) {
      parts.push(JSON.stringify(data));
    }

    // Output to console
    const output = parts.join(' ');

    if (level === 'error') {
      process.stderr.write(`${output}\n`);
    } else {
      process.stdout.write(`${output}\n`);
    }
  }

  /**
   * Get color for log level
   *
   * @param level - Log level
   * @returns ANSI color code
   */
  private getLevelColor(level: LogLevel): string {
    switch (level) {
      case 'debug':
        return COLORS.blue;
      case 'warn':
        return COLORS.yellow;
      case 'error':
        return COLORS.red;
      default:
        return COLORS.reset;
    }
  }
}

/**
 * Default logger instance
 */
export const logger = new Logger();