/**
 * Unit Tests for ODataClient DDL methods
 *
 * Covers createTable, deleteTable, addFields, deleteField,
 * createIndex, deleteIndex against the FileMaker_Tables and
 * FileMaker_Indexes system collections.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { ODataClient } from '../../../src/api/client';

vi.mock('axios');

describe('ODataClient DDL methods', () => {
  const mockPost = vi.fn();
  const mockPatch = vi.fn();
  const mockDelete = vi.fn();

  const mockAxiosInstance = {
    get: vi.fn(),
    post: mockPost,
    patch: mockPatch,
    put: vi.fn(),
    delete: mockDelete,
    interceptors: {
      response: {
        use: vi.fn((_ok: unknown, onErr: (e: unknown) => never) => {
          void onErr;
        }),
      },
    },
  };

  function createClient(): ODataClient {
    return new ODataClient({
      baseUrl: 'https://fm.example.com',
      database: 'TestDB',
      authToken: 'Basic dGVzdDp0ZXN0',
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(axios.create).mockReturnValue(mockAxiosInstance as any);
  });

  // ─── createTable ────────────────────────────────────────────────────────────

  describe('createTable', () => {
    it('POSTs to FileMaker_Tables with tableName and fields', async () => {
      mockPost.mockResolvedValue({ data: {} });
      const client = createClient();
      const fields = [{ name: 'ID', type: 'int', primary: true }];

      await client.createTable('Company', fields);

      expect(mockPost).toHaveBeenCalledWith(
        '/fmi/odata/v4/TestDB/FileMaker_Tables',
        { tableName: 'Company', fields },
      );
    });

    it('POSTs with no fields when fields array is empty', async () => {
      mockPost.mockResolvedValue({ data: {} });
      const client = createClient();

      await client.createTable('Empty', []);

      expect(mockPost).toHaveBeenCalledWith(
        '/fmi/odata/v4/TestDB/FileMaker_Tables',
        { tableName: 'Empty', fields: [] },
      );
    });

    it('returns the response data', async () => {
      const responseData = { tableName: 'Company' };
      mockPost.mockResolvedValue({ data: responseData });
      const client = createClient();

      const result = await client.createTable('Company', []);

      expect(result).toEqual(responseData);
    });
  });

  // ─── deleteTable ────────────────────────────────────────────────────────────

  describe('deleteTable', () => {
    it('DELETEs to FileMaker_Tables/{table}', async () => {
      mockDelete.mockResolvedValue({ data: undefined });
      const client = createClient();

      await client.deleteTable('Company');

      expect(mockDelete).toHaveBeenCalledWith(
        '/fmi/odata/v4/TestDB/FileMaker_Tables/Company',
      );
    });
  });

  // ─── addFields ──────────────────────────────────────────────────────────────

  describe('addFields', () => {
    it('PATCHes FileMaker_Tables/{table} with fields array', async () => {
      mockPatch.mockResolvedValue({ data: {} });
      const client = createClient();
      const fields = [{ name: 'Phone', type: 'varchar(25)' }];

      await client.addFields('Company', fields);

      expect(mockPatch).toHaveBeenCalledWith(
        '/fmi/odata/v4/TestDB/FileMaker_Tables/Company',
        { fields },
      );
    });
  });

  // ─── deleteField ────────────────────────────────────────────────────────────

  describe('deleteField', () => {
    it('DELETEs FileMaker_Tables/{table}/{field}', async () => {
      mockDelete.mockResolvedValue({ data: undefined });
      const client = createClient();

      await client.deleteField('Company', 'Phone');

      expect(mockDelete).toHaveBeenCalledWith(
        '/fmi/odata/v4/TestDB/FileMaker_Tables/Company/Phone',
      );
    });
  });

  // ─── createIndex ────────────────────────────────────────────────────────────

  describe('createIndex', () => {
    it('POSTs to FileMaker_Indexes/{table} with indexName', async () => {
      mockPost.mockResolvedValue({ data: {} });
      const client = createClient();

      await client.createIndex('Company', 'State');

      expect(mockPost).toHaveBeenCalledWith(
        '/fmi/odata/v4/TestDB/FileMaker_Indexes/Company',
        { indexName: 'State' },
      );
    });
  });

  // ─── deleteIndex ────────────────────────────────────────────────────────────

  describe('deleteIndex', () => {
    it('DELETEs FileMaker_Indexes/{table}/{field}', async () => {
      mockDelete.mockResolvedValue({ data: undefined });
      const client = createClient();

      await client.deleteIndex('Company', 'State');

      expect(mockDelete).toHaveBeenCalledWith(
        '/fmi/odata/v4/TestDB/FileMaker_Indexes/Company/State',
      );
    });
  });
});
