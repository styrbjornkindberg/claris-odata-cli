/**
 * Unit Tests for UploadCommand
 *
 * Validates credential resolution, file reading, and container field upload behavior.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UploadCommand } from '../../../src/cli/upload';
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

describe('UploadCommand', () => {
  const mockServerManager = {
    getServer: vi.fn(),
  };

  const mockCredentialsManager = {
    listCredentials: vi.fn(),
    getCredentials: vi.fn(),
  };

  const mockAuthManager = {
    createBasicAuthToken: vi.fn(),
  };

  const mockClient = {
    uploadContainerField: vi.fn(),
  };

  const testBuffer = Buffer.from('fake image bytes');

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(ServerManager).mockImplementation(() => mockServerManager as any);
    vi.mocked(CredentialsManager).mockImplementation(() => mockCredentialsManager as any);
    vi.mocked(AuthManager).mockImplementation(() => mockAuthManager as any);
    vi.mocked(ODataClient).mockImplementation(() => mockClient as any);
    vi.mocked(fs.statSync).mockReturnValue({ size: testBuffer.length } as ReturnType<typeof fs.statSync>);
    vi.mocked(fs.readFileSync).mockReturnValue(testBuffer);

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
    mockClient.uploadContainerField.mockResolvedValue(undefined);
  });

  it('resolves credentials and calls uploadContainerField (happy path)', async () => {
    const cmd = new UploadCommand({
      serverId: 'prod',
      database: 'Sales',
      table: 'Contacts',
      id: 42,
      field: 'Photo',
      file: '/tmp/photo.jpg',
      output: 'json',
    });

    const result = await cmd.execute();

    expect(result.success).toBe(true);
    expect(mockCredentialsManager.listCredentials).toHaveBeenCalledWith('prod');
    expect(mockCredentialsManager.getCredentials).toHaveBeenCalledWith('prod', 'Sales', 'alice');
    expect(mockAuthManager.createBasicAuthToken).toHaveBeenCalledWith('alice', 'secret');
    expect(fs.readFileSync).toHaveBeenCalledWith('/tmp/photo.jpg');
    expect(mockClient.uploadContainerField).toHaveBeenCalledWith(
      'Contacts',
      42,
      'Photo',
      testBuffer,
      'image/jpeg'
    );
  });

  it('detects image/png content type for .png files', async () => {
    const cmd = new UploadCommand({
      serverId: 'prod',
      database: 'Sales',
      table: 'Contacts',
      id: 1,
      field: 'Avatar',
      file: '/tmp/avatar.png',
      output: 'json',
    });

    await cmd.execute();

    expect(mockClient.uploadContainerField).toHaveBeenCalledWith(
      'Contacts',
      1,
      'Avatar',
      testBuffer,
      'image/png'
    );
  });

  it('detects application/pdf content type for .pdf files', async () => {
    const cmd = new UploadCommand({
      serverId: 'prod',
      database: 'Sales',
      table: 'Documents',
      id: 5,
      field: 'Attachment',
      file: '/tmp/report.pdf',
      output: 'json',
    });

    await cmd.execute();

    expect(mockClient.uploadContainerField).toHaveBeenCalledWith(
      'Documents',
      5,
      'Attachment',
      testBuffer,
      'application/pdf'
    );
  });

  it('falls back to application/octet-stream for unknown extensions', async () => {
    const cmd = new UploadCommand({
      serverId: 'prod',
      database: 'Sales',
      table: 'Files',
      id: 3,
      field: 'Data',
      file: '/tmp/archive.bin',
      output: 'json',
    });

    await cmd.execute();

    expect(mockClient.uploadContainerField).toHaveBeenCalledWith(
      'Files',
      3,
      'Data',
      testBuffer,
      'application/octet-stream'
    );
  });

  it('returns an error when server does not exist', async () => {
    mockServerManager.getServer.mockReturnValue(undefined);

    const cmd = new UploadCommand({
      serverId: 'missing',
      database: 'Sales',
      table: 'Contacts',
      id: 1,
      field: 'Photo',
      file: '/tmp/photo.jpg',
      output: 'json',
    });

    const result = await cmd.execute();

    expect(result.success).toBe(false);
    expect(result.error).toBe('Server not found: missing');
    expect(mockCredentialsManager.listCredentials).not.toHaveBeenCalled();
  });

  it('returns an error when no credential entry exists for the database', async () => {
    mockCredentialsManager.listCredentials.mockResolvedValue([
      { serverId: 'prod', database: 'OtherDb', username: 'alice' },
    ]);

    const cmd = new UploadCommand({
      serverId: 'prod',
      database: 'Sales',
      table: 'Contacts',
      id: 1,
      field: 'Photo',
      file: '/tmp/photo.jpg',
      output: 'json',
    });

    const result = await cmd.execute();

    expect(result.success).toBe(false);
    expect(result.error).toContain("No credentials found for server 'prod' and database 'Sales'");
    expect(mockClient.uploadContainerField).not.toHaveBeenCalled();
  });

  it('returns an error when stored credentials are incomplete', async () => {
    mockCredentialsManager.getCredentials.mockResolvedValue(null);

    const cmd = new UploadCommand({
      serverId: 'prod',
      database: 'Sales',
      table: 'Contacts',
      id: 1,
      field: 'Photo',
      file: '/tmp/photo.jpg',
      output: 'json',
    });

    const result = await cmd.execute();

    expect(result.success).toBe(false);
    expect(result.error).toContain('Stored credentials are incomplete');
    expect(mockClient.uploadContainerField).not.toHaveBeenCalled();
  });

  it('rejects files exceeding 25 MB', async () => {
    vi.mocked(fs.statSync).mockReturnValue({ size: 26 * 1024 * 1024 } as ReturnType<typeof fs.statSync>);

    const cmd = new UploadCommand({
      serverId: 'prod',
      database: 'Sales',
      table: 'Contacts',
      id: 1,
      field: 'Photo',
      file: '/tmp/huge.jpg',
      output: 'json',
    });

    const result = await cmd.execute();

    expect(result.success).toBe(false);
    expect(result.error).toContain('exceeds 25 MB limit');
    expect(mockClient.uploadContainerField).not.toHaveBeenCalled();
  });

  it('returns an error when the file cannot be read', async () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('ENOENT: no such file or directory');
    });

    const cmd = new UploadCommand({
      serverId: 'prod',
      database: 'Sales',
      table: 'Contacts',
      id: 1,
      field: 'Photo',
      file: '/tmp/nonexistent.jpg',
      output: 'json',
    });

    const result = await cmd.execute();

    expect(result.success).toBe(false);
    expect(result.error).toContain('ENOENT');
  });
});
