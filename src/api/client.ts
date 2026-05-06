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
import type { QueryOptions } from '../types';

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
 * Default request timeout (30 seconds)
 */
const DEFAULT_TIMEOUT_MS = 30000;

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
      timeout: config.timeout ?? DEFAULT_TIMEOUT_MS,
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
      params.push(`$select=${options.select.join(',')}`);
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
  ): Promise<T[]> {
    const query = this.buildQueryString(options);
    const url = `/fmi/odata/v4/${this.database}/${tableName}${query}`;
    const preferHeaders = buildPreferHeader({ ...this.defaultPrefer, ...prefer });

    const response = await this.http.get<{ value: T[] }>(url, {
      headers: { Accept: ACCEPT_RECORDS, ...preferHeaders },
    });
    return response.data.value;
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
   * Delete a record
   *
   * @param tableName - FileMaker table name
   * @param recordId - Record ID
   */
  async deleteRecord(tableName: string, recordId: number): Promise<void> {
    const url = `/fmi/odata/v4/${this.database}/${tableName}(${recordId})`;
    await this.http.delete(url);
  }
}
