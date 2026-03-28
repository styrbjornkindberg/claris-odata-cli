/**
 * Credentials Management
 *
 * Secure credential storage using system keychain.
 *
 * @module config/credentials
 */

import keytar from 'keytar';
import type { CredentialEntry } from '../types';

/**
 * Service name for keychain storage
 */
const SERVICE_NAME = 'claris-odata-cli';

/**
 * Credentials manager using system keychain
 *
 * Provides secure storage for FileMaker credentials.
 */
export class CredentialsManager {
  /**
   * Store credentials securely in system keychain
   *
   * @param serverId - Server ID
   * @param database - Database name
   * @param username - Username
   * @param password - Password
   */
  async storeCredentials(
    serverId: string,
    database: string,
    username: string,
    password: string
  ): Promise<void> {
    const account = this.buildAccountKey(serverId, database, username);
    await keytar.setPassword(SERVICE_NAME, account, password);
  }

  /**
   * Retrieve credentials from system keychain
   *
   * @param serverId - Server ID
   * @param database - Database name
   * @param username - Username
   * @returns Password or null if not found
   */
  async getCredentials(
    serverId: string,
    database: string,
    username: string
  ): Promise<string | null> {
    const account = this.buildAccountKey(serverId, database, username);
    return keytar.getPassword(SERVICE_NAME, account);
  }

  /**
   * Delete credentials from system keychain
   *
   * @param serverId - Server ID
   * @param database - Database name
   * @param username - Username
   * @returns Whether credentials were deleted
   */
  async deleteCredentials(serverId: string, database: string, username: string): Promise<boolean> {
    const account = this.buildAccountKey(serverId, database, username);
    return keytar.deletePassword(SERVICE_NAME, account);
  }

  /**
   * Build account key for keychain storage
   *
   * @param serverId - Server ID
   * @param database - Database name
   * @param username - Username
   * @returns Account key
   */
  private buildAccountKey(serverId: string, database: string, username: string): string {
    return `${serverId}:${database}:${username}`;
  }

  /**
   * List all credentials stored for a given server
   *
   * @param serverId - Server ID to filter by
   * @returns Array of CredentialEntry objects (no passwords)
   */
  async listCredentials(serverId: string): Promise<CredentialEntry[]> {
    const allCredentials = await keytar.findCredentials(SERVICE_NAME);
    const results: CredentialEntry[] = [];

    for (const { account } of allCredentials) {
      const parts = account.split(':');
      if (parts.length !== 3) {
        // Silently skip malformed entries
        continue;
      }
      const [entryServerId, database, username] = parts;
      if (entryServerId === serverId) {
        results.push({ serverId: entryServerId, database, username });
      }
    }

    return results;
  }

  /**
   * Check if credentials exist
   *
   * @param serverId - Server ID
   * @param database - Database name
   * @param username - Username
   * @returns Whether credentials exist
   */
  async hasCredentials(serverId: string, database: string, username: string): Promise<boolean> {
    const credentials = await this.getCredentials(serverId, database, username);
    return credentials !== null;
  }
}
