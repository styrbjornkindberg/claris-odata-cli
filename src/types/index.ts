/**
 * Type definitions for Claris OData CLI
 *
 * @module types
 */

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Represents a configured FileMaker server
 */
export interface Server {
  /** Unique identifier for the server */
  id: string;
  /** Display name for the server */
  name: string;
  /** Server hostname or IP address */
  host: string;
  /** Port number (default: 443 for HTTPS) */
  port?: number;
  /** Whether to use HTTPS (default: true) */
  secure?: boolean;
}

/**
 * Authentication credentials for a server
 */
export interface Credentials {
  /** Server ID these credentials belong to */
  serverId: string;
  /** Database name */
  database: string;
  /** Username */
  username: string;
  /** Password (stored securely in keychain) */
  password?: never; // Passwords are stored in system keychain, never in memory
}

/**
 * Represents a stored credential entry in the system keychain.
 *
 * This is used by the credential add/list/remove commands and the browse
 * authentication flow. Unlike the broader `Credentials` interface, this type
 * only captures the identity metadata — the password itself is NEVER stored
 * here; it lives exclusively in the OS keychain.
 *
 * @example
 * const entry: CredentialEntry = {
 *   serverId: 'prod-server',
 *   database: 'SalesDB',
 *   username: 'alice',
 * };
 */
export interface CredentialEntry {
  /** Server ID that these credentials belong to */
  serverId: string;
  /** Database name the credentials are scoped to */
  database: string;
  /** Username (password is stored in system keychain, never here) */
  username: string;
}

/**
 * Environment profile for managing multiple configurations
 */
export interface Profile {
  /** Profile name */
  name: string;
  /** Default server for this profile */
  defaultServer?: string;
  /** Default database for this profile */
  defaultDatabase?: string;
  /** Output format preference */
  outputFormat?: OutputFormat;
}

// ============================================================================
// API Types
// ============================================================================

/**
 * OData query options
 */
export interface QueryOptions {
  /** Filter expression ($filter) */
  filter?: string;
  /** Fields to select ($select) */
  select?: string[];
  /** Number of records to skip ($skip) */
  skip?: number;
  /** Maximum records to return ($top) */
  top?: number;
  /** Order by fields ($orderby) */
  orderby?: string;
  /** Include total count ($count) */
  count?: boolean;
  /** Expand related entities ($expand) */
  expand?: string[];
}

/**
 * FileMaker record representation
 */
export interface Record {
  /** Record ID (FileMaker internal) */
  __Id?: number;
  /** Record modification ID */
  __ModId?: number;
  /** Field values */
  [fieldName: string]: unknown;
}

/**
 * OData error response
 */
export interface ODataError {
  code: string;
  message: string;
  target?: string;
  details?: ODataErrorDetail[];
}

/**
 * Detailed error information
 */
export interface ODataErrorDetail {
  code: string;
  message: string;
  target?: string;
}

// ============================================================================
// CLI Types
// ============================================================================

/**
 * Output format options for CLI
 */
export type OutputFormat = 'json' | 'table' | 'csv';

/**
 * Command action result
 */
export interface CommandResult<T = unknown> {
  /** Whether the command succeeded */
  success: boolean;
  /** Result data */
  data?: T;
  /** Error message if failed */
  error?: string;
}

// ============================================================================
// Browse Types
// ============================================================================

/**
 * Represents the current navigation level in the interactive browse TUI.
 *
 * The browse command lets users drill down through a hierarchy:
 *   server → database → table → action
 *
 * Used by TUI state management and navigation tracking.
 *
 * @example
 * let level: BrowseLevel = 'server';
 * // After selecting a server:
 * level = 'database';
 */
export type BrowseLevel = 'server' | 'database' | 'table' | 'action';

/**
 * Represents an action available at the table level in the browse TUI.
 *
 * After the user navigates to a table, they choose one of these actions.
 * Used by the action menu and post-action routing logic.
 *
 * - `list-records`  — List all records in the table
 * - `get-record`    — Get a single record by ID
 * - `create-record` — Create a new record
 * - `view-schema`   — View the table schema / field definitions
 *
 * @example
 * const action: BrowseAction = 'list-records';
 */
export type BrowseAction = 'list-records' | 'get-record' | 'create-record' | 'view-schema';

// ============================================================================
// Logger Types
// ============================================================================

/**
 * Log level
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Logger configuration
 */
export interface LoggerConfig {
  /** Minimum log level to output */
  level: LogLevel;
  /** Whether to include timestamps */
  timestamps: boolean;
  /** Whether to use colors in output */
  colors: boolean;
}
