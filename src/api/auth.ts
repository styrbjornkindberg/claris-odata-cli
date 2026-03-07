/**
 * Authentication Module
 *
 * Handles authentication for FileMaker OData API connections.
 *
 * @module api/auth
 */

import type { Credentials } from '../types';

/**
 * Authentication manager for OData API
 *
 * Manages authentication tokens and credential storage.
 */
export class AuthManager {
  /**
   * Create a Basic Auth header value
   *
   * @param username - FileMaker username
   * @param password - FileMaker password
   * @returns Basic Auth header value
   */
  createBasicAuthToken(username: string, password: string): string {
    const credentials = Buffer.from(`${username}:${password}`).toString('base64');
    return `Basic ${credentials}`;
  }

  /**
   * Validate credentials format
   *
   * @param credentials - Credentials to validate
   * @returns Whether credentials appear valid
   */
  validateCredentials(credentials: Credentials): boolean {
    if (!credentials.serverId) {
      return false;
    }

    if (!credentials.database || credentials.database.trim() === '') {
      return false;
    }

    if (!credentials.username || credentials.username.trim() === '') {
      return false;
    }

    return true;
  }
}
