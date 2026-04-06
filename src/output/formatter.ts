/**
 * Output Formatter - Centralized output formatting for CLI
 *
 * Provides consistent output formatting across all commands.
 * Supports JSON, JSON Lines (JSONL), and table formats.
 *
 * @module output/formatter
 */

import { c } from '../lib/theme';

/**
 * Output format options
 */
export type OutputFormat = 'json' | 'jsonl' | 'table' | 'csv';

/**
 * Table column definition
 */
export interface TableColumn {
  /** Column header */
  header: string;
  /** Field key in data */
  key: string;
  /** Column width (optional) */
  width?: number;
}

/**
 * OutputFormatter - Centralized output formatting
 *
 * Handles JSON, JSONL, CSV, and table output formats.
 * Ensures consistent key ordering in JSON output.
 */
export class OutputFormatter {
  private outputFormat: OutputFormat;
  private columns?: TableColumn[];

  constructor(format: OutputFormat = 'table', columns?: TableColumn[]) {
    this.outputFormat = format;
    this.columns = columns;
  }

  /**
   * Set output format
   *
   * @param format - Output format
   */
  setFormat(format: OutputFormat): void {
    this.outputFormat = format;
  }

  /**
   * Set column definitions for table/CSV output
   *
   * @param columns - Column definitions
   */
  setColumns(columns: TableColumn[]): void {
    this.columns = columns;
  }

  /**
   * Format data according to current format
   *
   * @param data - Data to format
   * @returns Formatted string
   */
  format<T extends Record<string, unknown>>(data: T | T[]): string {
    switch (this.outputFormat) {
      case 'json':
        return this.formatJson(data);

      case 'jsonl':
        return this.formatJsonl(Array.isArray(data) ? data : [data]);

      case 'csv':
        return this.formatCsv(Array.isArray(data) ? data : [data]);

      case 'table':
      default:
        return this.formatTable(Array.isArray(data) ? data : [data]);
    }
  }

  /**
   * Format data as JSON with consistent key ordering
   *
   * @param data - Data to format
   * @returns JSON string with sorted keys
   */
  formatJson<T>(data: T): string {
    return JSON.stringify(this.sortKeys(data), null, 2);
  }

  /**
   * Format data as JSON Lines (JSONL)
   *
   * Each record is formatted as a single line of JSON.
   * Useful for streaming and processing large datasets.
   *
   * @param rows - Array of records
   * @returns JSONL string (one JSON object per line)
   */
  formatJsonl<T extends Record<string, unknown>>(rows: T[]): string {
    return rows.map((row) => JSON.stringify(this.sortKeys(row))).join('\n');
  }

  /**
   * Format data as table
   *
   * @param data - Array of records
   * @returns Table string
   */
  formatTable<T extends Record<string, unknown>>(data: T[]): string {
    if (data.length === 0) {
      return c.warn('No data');
    }

    // Get column definitions
    const cols = this.columns ?? this.inferColumns(data);

    // Calculate column widths
    const widths = this.calculateWidths(data, cols);

    // Create header row
    const headerRow = cols.map((col, i) => this.pad(col.header, widths[i] ?? 0)).join('  ');
    const headerSeparator = cols.map((_, i) => c.muted('-'.repeat(widths[i] ?? 0))).join('  ');

    // Create data rows
    const dataRows = data.map((item) =>
      cols
        .map((col, i) => {
          const value = item[col.key];
          return this.pad(this.formatValue(value), widths[i] ?? 0);
        })
        .join('  ')
    );

    return [c.bold(headerRow), headerSeparator, ...dataRows].join('\n');
  }

  /**
   * Format data as CSV
   *
   * @param data - Array of records
   * @returns CSV string
   */
  formatCsv<T extends Record<string, unknown>>(data: T[]): string {
    if (data.length === 0) {
      return '';
    }

    // Get column keys
    const keys = this.columns?.map((c) => c.key) ?? Object.keys(data[0] ?? {});

    // Create header row
    const header = keys.join(',');

    // Create data rows
    const rows = data.map((item) =>
      keys
        .map((key) => {
          const value = item[key];
          // Escape quotes and wrap in quotes if needed
          if (
            typeof value === 'string' &&
            (value.includes(',') || value.includes('"') || value.includes('\n'))
          ) {
            return `"${String(value).replace(/"/g, '""')}"`;
          }
          return String(value ?? '');
        })
        .join(',')
    );

    return [header, ...rows].join('\n');
  }

  /**
   * Recursively sort object keys for consistent JSON output
   *
   * @param obj - Object to sort
   * @returns Object with sorted keys
   */
  private sortKeys<T>(obj: T): T {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.sortKeys(item)) as T;
    }

    if (typeof obj === 'object') {
      const sorted: Record<string, unknown> = {};
      const keys = Object.keys(obj).sort();
      for (const key of keys) {
        sorted[key] = this.sortKeys((obj as Record<string, unknown>)[key]);
      }
      return sorted as T;
    }

    return obj;
  }

  /**
   * Infer columns from data
   *
   * @param data - Array of records
   * @returns Column definitions
   */
  private inferColumns<T extends Record<string, unknown>>(data: T[]): TableColumn[] {
    const keys = Object.keys(data[0] ?? {});
    return keys.map((key) => ({
      header: this.formatHeader(key),
      key,
    }));
  }

  /**
   * Format a field name as a header
   *
   * @param key - Field key
   * @returns Formatted header
   */
  private formatHeader(key: string): string {
    return key
      .split(/(?=[A-Z])/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Calculate column widths
   *
   * @param data - Array of records
   * @param columns - Column definitions
   * @returns Array of widths
   */
  private calculateWidths<T extends Record<string, unknown>>(
    data: T[],
    columns: TableColumn[]
  ): number[] {
    return columns.map((col) => {
      const headerWidth = col.header.length;
      const dataWidth = Math.max(...data.map((item) => this.formatValue(item[col.key]).length));
      // Use col.width if specified, otherwise use max of header and data
      return col.width ?? Math.max(headerWidth, dataWidth);
    });
  }

  /**
   * Format a value for display
   *
   * @param value - Value to format
   * @returns Formatted string
   */
  private formatValue(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  }

  /**
   * Pad string to length
   *
   * @param str - String to pad
   * @param length - Target length
   * @returns Padded string
   */
  private pad(str: string, length: number): string {
    return str.padEnd(length, ' ');
  }
}

/**
 * Create an OutputFormatter instance
 *
 * @param format - Output format
 * @param columns - Column definitions for table/CSV output
 * @returns OutputFormatter instance
 */
export function createFormatter(
  format: OutputFormat = 'table',
  columns?: TableColumn[]
): OutputFormatter {
  return new OutputFormatter(format, columns);
}
