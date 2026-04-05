/**
 * Tests for AuthManager
 *
 * Tests authentication token creation and credential validation.
 */

import { describe, it, expect } from 'vitest';
import { AuthManager } from '../../../src/api/auth';
import type { Credentials } from '../../../src/types';

describe('AuthManager', () => {
  let authManager: AuthManager;

  beforeEach(() => {
    authManager = new AuthManager();
  });

  describe('createBasicAuthToken', () => {
    it('should create a valid Basic Auth token', () => {
      const token = authManager.createBasicAuthToken('user', 'pass');
      expect(token).toBe('Basic ' + Buffer.from('user:pass').toString('base64'));
    });

    it('should handle special characters in credentials', () => {
      const token = authManager.createBasicAuthToken('user@domain.com', 'p@ssw0rd!');
      expect(token).toBe('Basic ' + Buffer.from('user@domain.com:p@ssw0rd!').toString('base64'));
    });

    it('should handle empty password', () => {
      const token = authManager.createBasicAuthToken('user', '');
      expect(token).toBe('Basic ' + Buffer.from('user:').toString('base64'));
    });

    it('should handle empty username', () => {
      const token = authManager.createBasicAuthToken('', 'pass');
      expect(token).toBe('Basic ' + Buffer.from(':pass').toString('base64'));
    });
  });

  describe('validateCredentials', () => {
    it('should return true for valid credentials', () => {
      const credentials: Credentials = {
        serverId: 'server1',
        database: 'TestDB',
        username: 'testuser',
      };
      expect(authManager.validateCredentials(credentials)).toBe(true);
    });

    it('should return false when serverId is missing', () => {
      const credentials: Credentials = {
        database: 'TestDB',
        username: 'testuser',
      } as any;
      expect(authManager.validateCredentials(credentials)).toBe(false);
    });

    it('should return false when serverId is empty', () => {
      const credentials: Credentials = {
        serverId: '',
        database: 'TestDB',
        username: 'testuser',
      };
      expect(authManager.validateCredentials(credentials)).toBe(false);
    });

    it('should return false when database is missing', () => {
      const credentials: Credentials = {
        serverId: 'server1',
        username: 'testuser',
      } as any;
      expect(authManager.validateCredentials(credentials)).toBe(false);
    });

    it('should return false when database is empty', () => {
      const credentials: Credentials = {
        serverId: 'server1',
        database: '',
        username: 'testuser',
      };
      expect(authManager.validateCredentials(credentials)).toBe(false);
    });

    it('should return false when database is whitespace only', () => {
      const credentials: Credentials = {
        serverId: 'server1',
        database: '   ',
        username: 'testuser',
      };
      expect(authManager.validateCredentials(credentials)).toBe(false);
    });

    it('should return false when username is missing', () => {
      const credentials: Credentials = {
        serverId: 'server1',
        database: 'TestDB',
      } as any;
      expect(authManager.validateCredentials(credentials)).toBe(false);
    });

    it('should return false when username is empty', () => {
      const credentials: Credentials = {
        serverId: 'server1',
        database: 'TestDB',
        username: '',
      };
      expect(authManager.validateCredentials(credentials)).toBe(false);
    });

    it('should return false when username is whitespace only', () => {
      const credentials: Credentials = {
        serverId: 'server1',
        database: 'TestDB',
        username: '   ',
      };
      expect(authManager.validateCredentials(credentials)).toBe(false);
    });

    it('should return true when password is missing (optional field)', () => {
      const credentials: Credentials = {
        serverId: 'server1',
        database: 'TestDB',
        username: 'testuser',
      };
      expect(authManager.validateCredentials(credentials)).toBe(true);
    });

    it('should return true when password is empty (valid)', () => {
      const credentials: Credentials = {
        serverId: 'server1',
        database: 'TestDB',
        username: 'testuser',
        password: '',
      };
      expect(authManager.validateCredentials(credentials)).toBe(true);
    });
  });
});