/**
 * T3: ODataClient.getServiceDocument() + ODataClient.getMetadata()
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { ODataClient } from '../../../src/api/client';

vi.mock('axios');

describe('ODataClient – getServiceDocument + getMetadata', () => {
  const mockGet = vi.fn();

  const mockAxiosInstance = {
    get: mockGet,
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      response: {
        use: vi.fn(),
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(axios.create).mockReturnValue(mockAxiosInstance as never);
  });

  function createClient(): ODataClient {
    return new ODataClient({
      baseUrl: 'https://fm.example.com',
      database: 'TestDB',
      authToken: 'Basic dGVzdDp0ZXN0',
    });
  }

  describe('getServiceDocument()', () => {
    it('GETs /fmi/odata/v4/ and returns parsed JSON value array', async () => {
      const payload = {
        '@odata.context': 'https://fm.example.com/fmi/odata/v4/$metadata',
        value: [
          { name: 'DB1', kind: 'EntityContainer', url: 'DB1' },
          { name: 'DB2', kind: 'EntityContainer', url: 'DB2' },
        ],
      };
      mockGet.mockResolvedValueOnce({ data: payload });

      const client = createClient();
      const result = await client.getServiceDocument();

      expect(mockGet).toHaveBeenCalledWith(
        '/fmi/odata/v4/',
        expect.objectContaining({ headers: expect.objectContaining({ Accept: 'application/json' }) })
      );
      expect(result).toEqual(payload.value);
    });

    it('returns empty array when value is absent', async () => {
      mockGet.mockResolvedValueOnce({ data: {} });
      const client = createClient();
      const result = await client.getServiceDocument();
      expect(result).toEqual([]);
    });

    it('passes through axios errors (interceptor handles them)', async () => {
      const err = new Error('Network error');
      mockGet.mockRejectedValueOnce(err);
      const client = createClient();
      await expect(client.getServiceDocument()).rejects.toThrow('Network error');
    });
  });

  describe('getMetadata()', () => {
    it('GETs /fmi/odata/v4/{database}/$metadata with Accept application/xml', async () => {
      const xml = '<edmx:Edmx Version="4.0"><EntitySet Name="Contacts"/></edmx:Edmx>';
      mockGet.mockResolvedValueOnce({ data: xml });

      const client = createClient();
      const result = await client.getMetadata();

      expect(mockGet).toHaveBeenCalledWith(
        '/fmi/odata/v4/TestDB/$metadata',
        expect.objectContaining({ headers: expect.objectContaining({ Accept: 'application/xml' }) })
      );
      expect(result).toBe(xml);
    });

    it('returns raw XML string', async () => {
      const xml = '<edmx:Edmx></edmx:Edmx>';
      mockGet.mockResolvedValueOnce({ data: xml });
      const client = createClient();
      expect(await client.getMetadata()).toBe(xml);
    });

    it('passes through axios errors', async () => {
      mockGet.mockRejectedValueOnce(new Error('Not found'));
      const client = createClient();
      await expect(client.getMetadata()).rejects.toThrow('Not found');
    });
  });
});
