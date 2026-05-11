/**
 * Unit Tests for BatchCommand
 *
 * Validates credential resolution, file reading, JSON DSL parsing, and
 * batch POST behaviour.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BatchCommand } from '../../../src/cli/batch';
import { ServerManager } from '../../../src/config/servers';
import { CredentialsManager } from '../../../src/config/credentials';
import { AuthManager } from '../../../src/api/auth';
import { ODataClient } from '../../../src/api/client';
import * as fs from 'fs';

vi.mock('../../../src/config/servers');
vi.mock('../../../src/config/credentials');
vi.mock('../../../src/api/auth');
vi.mock('../../../src/api/client');
vi.mock('fs');

describe('BatchCommand', () => {
  const mockServerManager = { getServer: vi.fn() };
  const mockCredentialsManager = {
    listCredentials: vi.fn(),
    getCredentials: vi.fn(),
  };
  const mockAuthManager = { createBasicAuthToken: vi.fn() };
  const mockClient = { executeBatch: vi.fn() };

  const batchRequests = [
    { method: 'GET', url: 'Contacts?$top=5' },
    { method: 'DELETE', url: 'Contacts(1)' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(ServerManager).mockImplementation(() => mockServerManager as any);
    vi.mocked(CredentialsManager).mockImplementation(() => mockCredentialsManager as any);
    vi.mocked(AuthManager).mockImplementation(() => mockAuthManager as any);
    vi.mocked(ODataClient).mockImplementation(() => mockClient as any);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(batchRequests));

    mockServerManager.getServer.mockReturnValue({
      id: 'prod',
      name: 'Production',
      host: 'fm.example.com',
      port: 443,
      secure: true,
    });

    mockCredentialsManager.listCredentials.mockResolvedValue([
      { serverId: 'prod', database: 'Sales', username: 'alice' },
    ]);

    mockCredentialsManager.getCredentials.mockResolvedValue('secret');
    mockAuthManager.createBasicAuthToken.mockReturnValue('Basic dGVzdA==');
    mockClient.executeBatch.mockResolvedValue('--batch_1\r\n--batch_1--\r\n');
  });

  it('reads file, resolves credentials, calls executeBatch (happy path)', async () => {
    const cmd = new BatchCommand({
      serverId: 'prod',
      database: 'Sales',
      file: '/tmp/batch.json',
      output: 'json',
    });

    const result = await cmd.execute();

    expect(result.success).toBe(true);
    expect(fs.readFileSync).toHaveBeenCalledWith('/tmp/batch.json', 'utf-8');
    expect(mockCredentialsManager.listCredentials).toHaveBeenCalledWith('prod');
    expect(mockCredentialsManager.getCredentials).toHaveBeenCalledWith('prod', 'Sales', 'alice');
    expect(mockAuthManager.createBasicAuthToken).toHaveBeenCalledWith('alice', 'secret');
    expect(mockClient.executeBatch).toHaveBeenCalledWith(batchRequests);
  });

  it('constructs ODataClient with correct baseUrl (no path suffix)', async () => {
    const cmd = new BatchCommand({
      serverId: 'prod',
      database: 'Sales',
      file: '/tmp/batch.json',
      output: 'json',
    });

    await cmd.execute();

    expect(ODataClient).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: 'https://fm.example.com:443',
        database: 'Sales',
      })
    );
  });

  it('returns error when server does not exist', async () => {
    mockServerManager.getServer.mockReturnValue(undefined);

    const cmd = new BatchCommand({
      serverId: 'missing',
      database: 'Sales',
      file: '/tmp/batch.json',
      output: 'json',
    });

    const result = await cmd.execute();

    expect(result.success).toBe(false);
    expect(result.error).toBe('Server not found: missing');
    expect(mockCredentialsManager.listCredentials).not.toHaveBeenCalled();
  });

  it('returns error when no credentials found for database', async () => {
    mockCredentialsManager.listCredentials.mockResolvedValue([
      { serverId: 'prod', database: 'OtherDb', username: 'alice' },
    ]);

    const cmd = new BatchCommand({
      serverId: 'prod',
      database: 'Sales',
      file: '/tmp/batch.json',
      output: 'json',
    });

    const result = await cmd.execute();

    expect(result.success).toBe(false);
    expect(result.error).toContain("No credentials found for server 'prod' and database 'Sales'");
    expect(mockClient.executeBatch).not.toHaveBeenCalled();
  });

  it('returns error when stored credentials are incomplete', async () => {
    mockCredentialsManager.getCredentials.mockResolvedValue(null);

    const cmd = new BatchCommand({
      serverId: 'prod',
      database: 'Sales',
      file: '/tmp/batch.json',
      output: 'json',
    });

    const result = await cmd.execute();

    expect(result.success).toBe(false);
    expect(result.error).toContain('Stored credentials are incomplete');
    expect(mockClient.executeBatch).not.toHaveBeenCalled();
  });

  it('returns error when file cannot be read', async () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('ENOENT: no such file or directory');
    });

    const cmd = new BatchCommand({
      serverId: 'prod',
      database: 'Sales',
      file: '/tmp/missing.json',
      output: 'json',
    });

    const result = await cmd.execute();

    expect(result.success).toBe(false);
    expect(result.error).toContain('ENOENT');
  });

  it('returns error when file contains invalid JSON', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue('not valid json {{');

    const cmd = new BatchCommand({
      serverId: 'prod',
      database: 'Sales',
      file: '/tmp/bad.json',
      output: 'json',
    });

    const result = await cmd.execute();

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid JSON');
  });

  it('includes response in success data', async () => {
    const batchResponse = '--batch_1\r\nHTTP/1.1 200 OK\r\n\r\n--batch_1--\r\n';
    mockClient.executeBatch.mockResolvedValue(batchResponse);

    const cmd = new BatchCommand({
      serverId: 'prod',
      database: 'Sales',
      file: '/tmp/batch.json',
      output: 'json',
    });

    const result = await cmd.execute();

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ response: batchResponse });
  });
});
