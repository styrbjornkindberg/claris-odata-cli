/**
 * OData Endpoint Builders
 *
 * Builders for constructing OData API endpoint URLs.
 *
 * @module api/endpoints
 */

/**
 * Endpoint builder for FileMaker OData API
 *
 * Constructs URLs for various OData operations.
 */
export class EndpointBuilder {
  private readonly baseUrl: string;
  private readonly database: string;

  /**
   * Create an endpoint builder
   *
   * @param host - FileMaker server hostname
   * @param database - Database name
   * @param useHttps - Whether to use HTTPS (default: true)
   */
  constructor(host: string, database: string, useHttps: boolean = true) {
    const protocol = useHttps ? 'https' : 'http';
    this.baseUrl = `${protocol}://${host}`;
    this.database = database;
  }

  /**
   * Get the base OData URL
   *
   * @returns Base OData URL
   */
  getBaseUrl(): string {
    return `${this.baseUrl}/fmi/odata/v4/${this.database}`;
  }

  /**
   * Build URL for metadata document
   *
   * @returns Metadata URL
   */
  metadata(): string {
    return `${this.getBaseUrl()}/$metadata`;
  }

  /**
   * Build URL for listing all tables
   *
   * @returns Tables list URL
   */
  tables(): string {
    return this.getBaseUrl();
  }

  /**
   * Build URL for a specific table
   *
   * @param tableName - Table name
   * @returns Table URL
   */
  table(tableName: string): string {
    return `${this.getBaseUrl()}/${tableName}`;
  }

  /**
   * Build URL for a specific record
   *
   * @param tableName - Table name
   * @param recordId - Record ID
   * @returns Record URL
   */
  record(tableName: string, recordId: number): string {
    return `${this.getBaseUrl()}/${tableName}(${recordId})`;
  }

  /**
   * Build URL for creating a record
   *
   * @param tableName - Table name
   * @returns Create record URL
   */
  createRecord(tableName: string): string {
    return this.table(tableName);
  }

  /**
   * Build URL for running a script
   *
   * @param tableName - Table name (for context)
   * @param scriptName - Script name
   * @param recordId - Optional record ID for context
   * @returns Script URL
   */
  script(tableName: string, scriptName: string, recordId?: number): string {
    const base = recordId
      ? this.record(tableName, recordId)
      : this.table(tableName);
    return `${base}/Script(${encodeURIComponent(scriptName)})`;
  }

  /**
   * Build URL for container field upload
   *
   * @param tableName - Table name
   * @param recordId - Record ID
   * @param fieldName - Container field name
   * @returns Container upload URL
   */
  container(
    tableName: string,
    recordId: number,
    fieldName: string
  ): string {
    return `${this.getBaseUrl()}/${tableName}(${recordId})/${fieldName}`;
  }
}