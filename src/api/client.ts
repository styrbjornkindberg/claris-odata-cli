/**
 * OData HTTP Client
 *
 * Provides HTTP client wrapper for making authenticated requests to FileMaker OData API.
 *
 * @module api/client
 * @see https://help.claris.com/en/odata-guide/
 */

import type { AxiosInstance } from 'axios';
import axios from 'axios';
import {
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ODataError,
  RateLimitError,
  ValidationError,
} from './errors';
import { buildPreferHeader, type PreferOptions } from './prefer';
import type {
  ODataCollection,
  QueryResult,
  QueryOptions,
  BatchRequest,
  FieldDefinition,
} from '../types';

/**
 * Configuration for the OData client
 */
export interface ClientConfig {
  /** Server base URL */
  baseUrl: string;
  /** Database name */
  database: string;
  /** Authentication token */
  authToken: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Default Prefer header options applied to every read request. Callers may override per-call. */
  defaultPrefer?: PreferOptions;
}

/** Accept header sent on all record-read requests */
const ACCEPT_RECORDS = 'application/json;odata.metadata=minimal;IEEE754Compatible=true';

/**
 * Default request timeout (120 seconds).
 *
 * FileMaker OData calls that run server-side scripts or large/unindexed queries
 * can legitimately take longer than the old 30s ceiling, surfacing as
 * `ECONNABORTED`. 120s is generous for interactive use without hanging forever
 * on a dead connection. Override per-call via `ClientConfig.timeout`, or globally
 * via the `FMO_TIMEOUT` env var (seconds; `0` disables the timeout entirely).
 */
const DEFAULT_TIMEOUT_MS = 120000;

/**
 * Resolve the timeout (ms) from the `FMO_TIMEOUT` env var (in seconds).
 * Returns undefined when unset or invalid so the caller falls back to the
 * built-in default. A value of `0` means "no timeout" (axios convention).
 */
function envTimeoutMs(): number | undefined {
  const raw = process.env.FMO_TIMEOUT;
  if (raw === undefined || raw.trim() === '') return undefined;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds < 0) return undefined;
  return seconds * 1000;
}

/**
 * Double every percent-escape in the PATH portion of a relative URL (`%` → `%25`),
 * leaving the query string ( everything from `?` onward ) untouched.
 *
 * Used as a one-shot retry when a reverse proxy in front of FileMaker (e.g. nginx)
 * percent-decodes the request *path* once before forwarding — but passes the query
 * string through verbatim. Doubling only the path escapes means the proxy's single
 * decode restores the intended single-encoded path for FileMaker, while a single-
 * encoded query (which the proxy never touches) is left intact. Structural characters
 * (`/ ? = & $`) carry no `%`, so they are unaffected.
 */
function doubleEncodePath(url: string): string {
  const q = url.indexOf('?');
  if (q === -1) return url.replace(/%/g, '%25');
  return url.slice(0, q).replace(/%/g, '%25') + url.slice(q);
}

/**
 * True when an error looks like a proxy single-decode mangling the path — the
 * FileMaker OData server reports "syntax error in URL" when it receives raw
 * non-ASCII bytes in an entity/field name. Used to gate the double-encode retry.
 */
function isProxyUrlDecodeError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /syntax error in URL/i.test(message);
}

/**
 * FileMaker OData API client
 *
 * Handles all HTTP communication with the FileMaker OData API.
 */
export class ODataClient {
  private readonly http: AxiosInstance;
  private readonly database: string;
  private readonly defaultPrefer: PreferOptions;

  constructor(config: ClientConfig) {
    this.database = config.database;
    this.defaultPrefer = { includeSpecialColumns: true, ...config.defaultPrefer };

    this.http = axios.create({
      baseURL: config.baseUrl,
      timeout: config.timeout ?? envTimeoutMs() ?? DEFAULT_TIMEOUT_MS,
      headers: {
        Authorization: config.authToken,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'OData-Version': '4.0',
        'OData-MaxVersion': '4.0',
      },
    });

    // Add response interceptor for error handling
    this.http.interceptors.response.use(
      (response) => response,
      (error) => this.handleApiError(error)
    );
  }

  /**
   * Build query string from query options
   *
   * @param options - Query options
   * @returns URL query string
   */
  private buildQueryString(options?: QueryOptions): string {
    if (!options) return '';

    const params: string[] = [];

    if (options.filter) {
      params.push(`$filter=${encodeURIComponent(options.filter)}`);
    }

    if (options.select?.length) {
      params.push(`$select=${options.select.map(encodeURIComponent).join(',')}`);
    }

    if (options.skip !== undefined) {
      params.push(`$skip=${options.skip}`);
    }

    if (options.top !== undefined) {
      params.push(`$top=${options.top}`);
    }

    if (options.orderby) {
      params.push(`$orderby=${encodeURIComponent(options.orderby)}`);
    }

    if (options.count) {
      params.push('$count=true');
    }

    if (options.expand?.length) {
      params.push(`$expand=${options.expand.join(',')}`);
    }

    return params.length > 0 ? `?${params.join('&')}` : '';
  }

  /**
   * Handle API error responses
   *
   * @param error - Axios error
   * @returns Rejected promise with ODataError
   */
  private handleApiError(error: unknown): never {
    if (axios.isAxiosError(error) && error.response) {
      const { status, data, headers } = error.response;
      const odataError = data?.error as { message?: string } | undefined;
      const message = odataError?.message ?? error.message;

      switch (status) {
        case 400:
          throw new ValidationError(message, data);
        case 401:
          throw new AuthenticationError(message, data);
        case 403:
          throw new AuthorizationError(message, data);
        case 404:
          throw new NotFoundError(message, data);
        case 429: {
          const retryAfterRaw = headers?.['retry-after'] as string | undefined;
          const retryAfter = retryAfterRaw !== undefined ? parseInt(retryAfterRaw, 10) : undefined;
          throw new RateLimitError(
            message,
            Number.isNaN(retryAfter) ? undefined : retryAfter,
            data
          );
        }
        default:
          throw new ODataError(message, status, data);
      }
    }

    throw new ODataError(error instanceof Error ? error.message : 'Unknown error', 500);
  }

  /**
   * Get the server-level service document (lists available databases)
   *
   * @returns Array of service document entries
   */
  async getServiceDocument(): Promise<Array<{ name: string; kind?: string; url?: string }>> {
    const response = await this.http.get<{
      value?: Array<{ name: string; kind?: string; url?: string }>;
    }>('/fmi/odata/v4/', {
      headers: { Accept: 'application/json' },
    });
    return response.data.value ?? [];
  }

  /**
   * Get the OData $metadata XML for the current database
   *
   * @returns Raw XML metadata string
   */
  async getMetadata(): Promise<string> {
    const response = await this.http.get<string>(`/fmi/odata/v4/${this.database}/$metadata`, {
      headers: { Accept: 'application/xml' },
    });
    return response.data;
  }

  /**
   * Get records from a table
   *
   * @param tableName - FileMaker table name
   * @param options - Query options
   * @returns Array of records
   */
  async getRecords<T = unknown>(
    tableName: string,
    options?: QueryOptions,
    prefer?: PreferOptions
  ): Promise<QueryResult<T>> {
    const query = this.buildQueryString(options);
    const path = `/fmi/odata/v4/${encodeURIComponent(this.database)}/${encodeURIComponent(tableName)}${query}`;
    const preferHeaders = buildPreferHeader({ ...this.defaultPrefer, ...prefer });
    const headers = { Accept: ACCEPT_RECORDS, ...preferHeaders };

    let response;
    try {
      response = await this.http.get<ODataCollection<T>>(path, { headers });
    } catch (error) {
      // A reverse proxy in front of FileMaker (e.g. nginx) may percent-decode the
      // request path once before forwarding. A correctly single-encoded non-ASCII
      // name ("Företag" → "F%C3%B6retag") is decoded back to raw bytes, which the
      // FileMaker OData parser rejects ("syntax error in URL"). Retry once with the
      // escapes doubled so the proxy's single decode restores the single-encoded URL.
      // No-op on direct servers — they never emit this error.
      if (!isProxyUrlDecodeError(error)) throw error;
      response = await this.http.get<ODataCollection<T>>(doubleEncodePath(path), { headers });
    }
    return {
      records: response.data.value,
      count: response.data['@odata.count'],
      nextLink: response.data['@odata.nextLink'],
    };
  }

  /**
   * Get a single record by ID
   *
   * @param tableName - FileMaker table name
   * @param recordId - Record ID
   * @returns Single record
   */
  async getRecord<T = unknown>(
    tableName: string,
    recordId: number,
    prefer?: PreferOptions
  ): Promise<T> {
    const url = `/fmi/odata/v4/${this.database}/${tableName}(${recordId})`;
    const preferHeaders = buildPreferHeader({ ...this.defaultPrefer, ...prefer });

    const response = await this.http.get<T>(url, {
      headers: { Accept: ACCEPT_RECORDS, ...preferHeaders },
    });
    return response.data;
  }

  /**
   * Create a new record
   *
   * @param tableName - FileMaker table name
   * @param data - Record data
   * @returns Created record
   */
  async createRecord<T = unknown>(tableName: string, data: Record<string, unknown>): Promise<T> {
    const url = `/fmi/odata/v4/${this.database}/${tableName}`;
    const response = await this.http.post<T>(url, data);
    return response.data;
  }

  /**
   * Update a record
   *
   * @param tableName - FileMaker table name
   * @param recordId - Record ID
   * @param data - Updated data
   * @returns Updated record
   */
  async updateRecord<T = unknown>(
    tableName: string,
    recordId: number,
    data: Record<string, unknown>
  ): Promise<T> {
    const url = `/fmi/odata/v4/${this.database}/${tableName}(${recordId})`;
    const response = await this.http.patch<T>(url, data);
    return response.data;
  }

  /**
   * Replace a record (full PUT — replaces all fields)
   *
   * @param tableName - FileMaker table name
   * @param recordId - Record ID
   * @param data - Full record data
   * @returns Replaced record
   */
  async replaceRecord<T = unknown>(
    tableName: string,
    recordId: number,
    data: Record<string, unknown>
  ): Promise<T> {
    const url = `/fmi/odata/v4/${this.database}/${tableName}(${recordId})`;
    const response = await this.http.put<T>(url, data);
    return response.data;
  }

  /**
   * Delete a record
   *
   * @param tableName - FileMaker table name
   * @param recordId - Record ID
   */
  async deleteRecord(tableName: string, recordId: number): Promise<void> {
    const url = `/fmi/odata/v4/${this.database}/${tableName}(${recordId})`;
    await this.http.delete(url);
  }

  /**
   * Upload a file to a container field
   *
   * @param tableName - FileMaker table name
   * @param recordId - Record ID
   * @param fieldName - Container field name
   * @param fileBuffer - File contents as a Buffer
   * @param contentType - MIME type of the file
   */
  async uploadContainerField(
    tableName: string,
    recordId: number,
    fieldName: string,
    fileBuffer: Buffer,
    contentType: string
  ): Promise<void> {
    const url = `/fmi/odata/v4/${this.database}/${tableName}(${recordId})/${fieldName}`;
    await this.http.patch(url, fileBuffer, { headers: { 'Content-Type': contentType } });
  }

  /**
   * Execute a batch of OData requests as a single multipart/mixed POST to /$batch
   *
   * @param requests - Array of batch requests (method + relative URL + optional body)
   * @returns Raw multipart response from the server
   */
  async executeBatch(requests: BatchRequest[]): Promise<string> {
    const boundary = `batch_${Date.now()}`;
    const parts: string[] = [];

    for (const req of requests) {
      const fullUrl = `/fmi/odata/v4/${this.database}/${req.url}`;
      let part = `--${boundary}\r\n`;
      part += `Content-Type: application/http\r\n`;
      part += `Content-Transfer-Encoding: binary\r\n`;
      part += `\r\n`;
      part += `${req.method} ${fullUrl} HTTP/1.1\r\n`;
      if (req.body !== undefined) {
        const bodyStr = JSON.stringify(req.body);
        part += `Content-Type: application/json\r\n`;
        part += `\r\n`;
        part += bodyStr;
        part += `\r\n`;
      } else {
        part += `\r\n`;
      }
      parts.push(part);
    }

    const body = parts.join('\r\n') + `--${boundary}--\r\n`;
    const url = `/fmi/odata/v4/${this.database}/$batch`;

    const response = await this.http.post<string>(url, body, {
      headers: { 'Content-Type': `multipart/mixed; boundary=${boundary}` },
    });
    return response.data;
  }

  /**
   * Create a new table via the FileMaker_Tables system collection
   */
  async createTable(tableName: string, fields: FieldDefinition[]): Promise<unknown> {
    const url = `/fmi/odata/v4/${this.database}/FileMaker_Tables`;
    const response = await this.http.post<unknown>(url, { tableName, fields });
    return response.data;
  }

  /**
   * Delete a table and all its records via FileMaker_Tables
   */
  async deleteTable(tableName: string): Promise<void> {
    const url = `/fmi/odata/v4/${this.database}/FileMaker_Tables/${tableName}`;
    await this.http.delete(url);
  }

  /**
   * Add fields to an existing table via FileMaker_Tables PATCH
   */
  async addFields(tableName: string, fields: FieldDefinition[]): Promise<unknown> {
    const url = `/fmi/odata/v4/${this.database}/FileMaker_Tables/${tableName}`;
    const response = await this.http.patch<unknown>(url, { fields });
    return response.data;
  }

  /**
   * Delete a field from a table via FileMaker_Tables
   */
  async deleteField(tableName: string, fieldName: string): Promise<void> {
    const url = `/fmi/odata/v4/${this.database}/FileMaker_Tables/${tableName}/${fieldName}`;
    await this.http.delete(url);
  }

  /**
   * Create an index on a field via FileMaker_Indexes
   */
  async createIndex(tableName: string, fieldName: string): Promise<unknown> {
    const url = `/fmi/odata/v4/${this.database}/FileMaker_Indexes/${tableName}`;
    const response = await this.http.post<unknown>(url, { indexName: fieldName });
    return response.data;
  }

  /**
   * Delete a field index via FileMaker_Indexes
   */
  async deleteIndex(tableName: string, fieldName: string): Promise<void> {
    const url = `/fmi/odata/v4/${this.database}/FileMaker_Indexes/${tableName}/${fieldName}`;
    await this.http.delete(url);
  }

  /**
   * Run a FileMaker script
   *
   * @param scriptName - Script name
   * @param options - Optional table context, record ID context, and script parameters
   * @returns Raw response data
   */
  async runScript(
    scriptName: string,
    options?: { table?: string; recordId?: number; params?: unknown }
  ): Promise<unknown> {
    let url: string;
    const encodedName = encodeURIComponent(scriptName);
    if (options?.table && options.recordId !== undefined) {
      url = `/fmi/odata/v4/${this.database}/${options.table}(${options.recordId})/Script('${encodedName}')`;
    } else if (options?.table) {
      url = `/fmi/odata/v4/${this.database}/${options.table}/Script('${encodedName}')`;
    } else {
      url = `/fmi/odata/v4/${this.database}/Script('${encodedName}')`;
    }

    const body = options?.params !== undefined ? { scriptParameterValue: options.params } : {};
    const response = await this.http.post<unknown>(url, body);
    return response.data;
  }
}
