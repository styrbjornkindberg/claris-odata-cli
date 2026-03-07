/**
 * Mock OData Server
 *
 * Provides a mock OData server for testing without real FileMaker connection.
 * Supports basic OData operations and authentication flow.
 *
 * @module tests/mocks/mock-server
 */

/**
 * Helper to create a unique test identifier.
 * Used internally for generating record IDs.
 */
function uniqueId(prefix: string = 'id'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * OData error response structure
 */
export interface ODataError {
  error: {
    code: string;
    message: string;
    target?: string;
    details?: Array<{
      code: string;
      message: string;
      target?: string;
    }>;
  };
}

/**
 * Mock server configuration
 */
export interface MockServerConfig {
  /** Base URL for the mock server */
  baseUrl: string;
  /** Simulated response delay in ms */
  delay?: number;
  /** Whether to simulate authentication errors */
  failAuth?: boolean;
  /** Whether to simulate rate limiting */
  rateLimit?: boolean;
  /** Requests per minute when rate limiting */
  rateLimitPerMinute?: number;
}

/**
 * Mock OData request
 */
export interface MockRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: unknown;
  timestamp: number;
}

/**
 * Mock server state
 */
export interface MockServerState {
  requests: MockRequest[];
  databases: Map<string, MockDatabase>;
  authenticated: boolean;
}

/**
 * Mock database structure
 */
export interface MockDatabase {
  name: string;
  tables: Map<string, MockTable>;
}

/**
 * Mock table structure (OData entity set)
 */
export interface MockTable {
  name: string;
  records: Map<string, MockRecord>;
}

/**
 * Mock record structure
 */
export interface MockRecord {
  id: string;
  data: Record<string, unknown>;
  created: number;
  modified: number;
}

/**
 * Response from HTTP operations
 */
export interface MockResponse {
  statusCode: number;
  body: unknown;
}

/**
 * Authentication result
 */
export interface AuthResult {
  success: boolean;
  token?: string;
}

/**
 * Mock OData server instance returned by createMockODataServer.
 */
export interface MockODataServer {
  authenticate: (username: string, password: string) => Promise<AuthResult>;
  addDatabase: (name: string, tables?: string[]) => void;
  addRecord: (database: string, table: string, data: Record<string, unknown>) => MockRecord;
  get: (path: string, headers?: Record<string, string>) => Promise<MockResponse>;
  post: (path: string, body: unknown, headers?: Record<string, string>) => Promise<MockResponse>;
  clearRequests: () => void;
  getRequests: () => MockRequest[];
  getLastRequest: () => MockRequest | undefined;
  reset: () => void;
  readonly state: MockServerState;
}

/**
 * Creates a mock OData server instance.
 *
 * @param config - Server configuration
 * @returns Mock server instance with control methods
 *
 * @example
 * ```typescript
 * const server = createMockODataServer({
 *   baseUrl: 'https://test.example.com'
 * });
 *
 * // Seed test data
 * server.addDatabase('TestDB', ['Users', 'Projects']);
 *
 * // Make requests
 * await server.get('/api/v4/TestDB/Users');
 *
 * // Inspect requests
 * console.log(server.getRequests());
 * ```
 */
export function createMockODataServer(config: MockServerConfig): MockODataServer {
  const state: MockServerState = {
    requests: [],
    databases: new Map(),
    authenticated: false,
  };

  const {
    baseUrl,
    delay = 0,
    failAuth = false,
    rateLimit = false,
    rateLimitPerMinute = 100,
  } = config;

  // Track requests for rate limiting
  let requestCount = 0;
  let requestWindowStart = Date.now();

  /**
   * Simulates a network delay
   */
  async function simulateDelay(): Promise<void> {
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  /**
   * Checks rate limiting
   */
  function checkRateLimit(): boolean {
    const now = Date.now();
    const windowElapsed = now - requestWindowStart;

    // Reset counter every minute
    if (windowElapsed >= 60000) {
      requestCount = 0;
      requestWindowStart = now;
    }

    requestCount++;

    if (rateLimit && requestCount > rateLimitPerMinute) {
      return false;
    }

    return true;
  }

  /**
   * Creates an OData error response
   */
  function createError(
    code: string,
    message: string,
    statusCode: number = 400
  ): { statusCode: number; body: ODataError } {
    return {
      statusCode,
      body: {
        error: {
          code,
          message,
        },
      },
    };
  }

  /**
   * Records a request for inspection
   */
  function recordRequest(
    method: string,
    path: string,
    headers: Record<string, string>,
    body?: unknown
  ): void {
    state.requests.push({
      method,
      path,
      headers,
      body,
      timestamp: Date.now(),
    });
  }

  /**
   * Authenticates with mock credentials
   */
  async function authenticate(username: string, password: string): Promise<AuthResult> {
    await simulateDelay();

    recordRequest('POST', '/auth', { 'Content-Type': 'application/json' }, { username, password });

    if (failAuth) {
      state.authenticated = false;
      return { success: false };
    }

    state.authenticated = true;
    // Generate a mock token
    const token = Buffer.from(`${username}:${Date.now()}`).toString('base64');
    return { success: true, token };
  }

  /**
   * Adds a mock database with tables
   */
  function addDatabase(name: string, tables: string[] = []): void {
    const database: MockDatabase = {
      name,
      tables: new Map(),
    };

    for (const tableName of tables) {
      database.tables.set(tableName, {
        name: tableName,
        records: new Map(),
      });
    }

    state.databases.set(name, database);
  }

  /**
   * Adds a record to a table
   */
  function addRecord(database: string, table: string, data: Record<string, unknown>): MockRecord {
    const db = state.databases.get(database);
    if (!db) {
      throw new Error(`Database not found: ${database}`);
    }

    const tbl = db.tables.get(table);
    if (!tbl) {
      throw new Error(`Table not found: ${table}`);
    }

    const record: MockRecord = {
      id: uniqueId('rec'),
      data,
      created: Date.now(),
      modified: Date.now(),
    };

    tbl.records.set(record.id, record);
    return record;
  }

  /**
   * GET request to mock server
   */
  async function get(path: string, headers: Record<string, string> = {}): Promise<MockResponse> {
    await simulateDelay();

    if (!checkRateLimit()) {
      return createError('RATE_LIMIT', 'Rate limit exceeded. Try again later.', 429);
    }

    recordRequest('GET', path, headers);

    // Parse path: /api/v4/{database}/{table}
    const pathParts = path.split('/').filter(Boolean);
    if (pathParts.length < 4) {
      return createError('INVALID_PATH', 'Invalid request path', 400);
    }

    const database = pathParts[2];
    const table = pathParts[3];

    const db = state.databases.get(database);
    if (!db) {
      return createError('DATABASE_NOT_FOUND', `Database not found: ${database}`, 404);
    }

    const tbl = db.tables.get(table);
    if (!tbl) {
      return createError('TABLE_NOT_FOUND', `Table not found: ${table}`, 404);
    }

    // Return all records as array
    const records = Array.from(tbl.records.values());
    return {
      statusCode: 200,
      body: {
        '@odata.context': `${baseUrl}/$metadata#${table}`,
        value: records.map((r) => ({ id: r.id, ...r.data })),
      },
    };
  }

  /**
   * POST request to create new record
   */
  async function post(
    path: string,
    body: unknown,
    headers: Record<string, string> = {}
  ): Promise<MockResponse> {
    await simulateDelay();

    if (!checkRateLimit()) {
      return createError('RATE_LIMIT', 'Rate limit exceeded. Try again later.', 429);
    }

    recordRequest('POST', path, headers, body);

    const pathParts = path.split('/').filter(Boolean);
    if (pathParts.length < 4) {
      return createError('INVALID_PATH', 'Invalid request path', 400);
    }

    const database = pathParts[2];
    const table = pathParts[3];

    const db = state.databases.get(database);
    if (!db) {
      return createError('DATABASE_NOT_FOUND', `Database not found: ${database}`, 404);
    }

    const tbl = db.tables.get(table);
    if (!tbl) {
      return createError('TABLE_NOT_FOUND', `Table not found: ${table}`, 404);
    }

    const record = addRecord(database, table, body as Record<string, unknown>);

    return {
      statusCode: 201,
      body: {
        '@odata.context': `${baseUrl}/$metadata#${table}`,
        id: record.id,
        ...record.data,
      },
    };
  }

  /**
   * Clears all recorded requests
   */
  function clearRequests(): void {
    state.requests = [];
  }

  /**
   * Gets all recorded requests for verification
   */
  function getRequests(): MockRequest[] {
    return [...state.requests];
  }

  /**
   * Gets the last recorded request
   */
  function getLastRequest(): MockRequest | undefined {
    return state.requests[state.requests.length - 1];
  }

  /**
   * Resets the entire mock server state
   */
  function reset(): void {
    state.requests = [];
    state.databases.clear();
    state.authenticated = false;
    requestCount = 0;
    requestWindowStart = Date.now();
  }

  return {
    // Authentication
    authenticate,

    // Database management
    addDatabase,
    addRecord,

    // HTTP operations
    get,
    post,

    // Inspection
    clearRequests,
    getRequests,
    getLastRequest,

    // Lifecycle
    reset,

    // State access
    get state(): MockServerState {
      return state;
    },
  };
}

/**
 * Pre-configured mock server instance for simple tests.
 * Use createMockODataServer for custom configuration.
 *
 * @example
 * ```typescript
 * import { mockServer } from './mock-server';
 *
 * beforeEach(() => {
 *   mockServer.addDatabase('TestDB', ['Users']);
 * });
 *
 * afterEach(() => {
 *   mockServer.reset();
 * });
 * ```
 */
export const mockServer = createMockODataServer({
  baseUrl: 'https://mock-test.local',
});

/**
 * Helper to reset mock server between tests.
 * Use in afterEach to ensure clean state.
 *
 * @returns void
 */
export function resetMockServer(): void {
  mockServer.reset();
}
