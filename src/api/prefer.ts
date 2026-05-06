/**
 * FileMaker OData Prefer header builder
 *
 * Constructs the HTTP `Prefer` header value for FileMaker-specific OData extensions.
 *
 * @see https://help.claris.com/en/odata-guide/
 * @module api/prefer
 */

/**
 * Options for the FileMaker OData `Prefer` header
 */
export interface PreferOptions {
  /** Maximum number of records per page (odata.maxpagesize) */
  maxPageSize?: number;
  /** Response representation preference */
  return?: 'representation' | 'minimal';
  /** Include __Id and __ModId special columns on every record (fmodata.include-specialcolumns) */
  includeSpecialColumns?: boolean;
  /** Include entity IDs in responses (fmodata.entity-ids) */
  entityIds?: boolean;
  /** Use basic timestamp format (fmodata.basic-timestamp) */
  basicTimestamp?: boolean;
  /** UTC offset for timestamps in hours (fmodata.gmtoffset) */
  gmtOffset?: number;
}

/**
 * Build a `Prefer` header object from the given options.
 *
 * Returns an empty object when no directives are active so callers can spread
 * the result into a headers object unconditionally.
 */
export function buildPreferHeader(options: PreferOptions): Record<string, string> {
  const parts: string[] = [];

  if (options.maxPageSize !== undefined) {
    parts.push(`odata.maxpagesize=${options.maxPageSize}`);
  }

  if (options.return !== undefined) {
    parts.push(`return=${options.return}`);
  }

  if (options.includeSpecialColumns === true) {
    parts.push('fmodata.include-specialcolumns');
  }

  if (options.entityIds === true) {
    parts.push('fmodata.entity-ids');
  }

  if (options.basicTimestamp === true) {
    parts.push('fmodata.basic-timestamp');
  }

  if (options.gmtOffset !== undefined) {
    parts.push(`fmodata.gmtoffset=${options.gmtOffset}`);
  }

  if (parts.length === 0) return {};
  return { Prefer: parts.join(', ') };
}
