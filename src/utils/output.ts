/**
 * Output Formatting Utilities
 *
 * Provides consistent output formatting for CLI responses.
 *
 * @module utils/output
 */

import type { OutputFormat } from '../types';

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
 * Output formatter for various formats
 */
export class OutputFormatter {
  private format: OutputFormat;

  constructor(format: OutputFormat = 'table') {
    this.format = format;
  }

  /**
   * Set output format
   *
   * @param format - Output format
   */
  setFormat(format: OutputFormat): void {
    this.format = format;
  }

  /**
   * Format data according to current format
   *
   * @param data - Data to format
   * @param columns - Column definitions for table format
   * @returns Formatted string
   */
  formatData<T extends Record<string, unknown>>(data: T | T[], columns?: TableColumn[]): string {
    switch (this.format) {
      case 'json':
        return this.formatJson(data);

      case 'csv':
        return this.formatCsv(Array.isArray(data) ? data : [data], columns);

      case 'table':
      default:
        return this.formatTable(Array.isArray(data) ? data : [data], columns);
    }
  }

  /**
   * Format data as JSON
   *
   * @param data - Data to format
   * @returns JSON string
   */
  private formatJson<T>(data: T): string {
    return JSON.stringify(data, null, 2);
  }

  /**
   * Format data as CSV
   *
   * @param data - Array of records
   * @param columns - Column definitions
   * @returns CSV string
   */
  private formatCsv<T extends Record<string, unknown>>(data: T[], columns?: TableColumn[]): string {
    if (data.length === 0) {
      return '';
    }

    // Get column keys
    const keys = columns?.map((c) => c.key) ?? Object.keys(data[0] ?? {});

    // Create header row
    const header = keys.join(',');

    // Create data rows
    const rows = data.map((item) =>
      keys
        .map((key) => {
          const value = item[key];
          // Escape quotes and wrap in quotes if needed
          if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return String(value ?? '');
        })
        .join(',')
    );

    return [header, ...rows].join('\n');
  }

  /**
   * Format data as table
   *
   * @param data - Array of records
   * @param columns - Column definitions
   * @returns Table string
   */
  private formatTable<T extends Record<string, unknown>>(
    data: T[],
    columns?: TableColumn[]
  ): string {
    if (data.length === 0) {
      return 'No data';
    }

    // Get column definitions
    const cols = columns ?? this.inferColumns(data);

    // Calculate column widths
    const widths = this.calculateWidths(data, cols);

    // Create header row
    const headerRow = cols.map((col, i) => this.pad(col.header, widths[i] ?? 0)).join('  ');

    // Create separator
    const separator = cols.map((_, i) => '-'.repeat(widths[i] ?? 0)).join('  ');

    // Create data rows
    const dataRows = data.map((item) =>
      cols
        .map((col, i) => {
          const value = item[col.key];
          return this.pad(this.formatValue(value), widths[i] ?? 0);
        })
        .join('  ')
    );

    return [headerRow, separator, ...dataRows].join('\n');
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
      header: key.charAt(0).toUpperCase() + key.slice(1),
      key,
    }));
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
