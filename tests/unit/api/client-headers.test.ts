/**
 * T4: ODataClient sends correct Prefer and Accept headers on read requests.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { ODataClient } from '../../../src/api/client';

vi.mock('axios');

const ACCEPT_MINIMAL = 'application/json;odata.metadata=minimal;IEEE754Compatible=true';
const DEFAULT_PREFER = 'fmodata.include-specialcolumns';

describe('ODataClient – Prefer + Accept headers (T4)', () => {
  const mockGet = vi.fn();

  const mockAxiosInstance = {
    get: mockGet,
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      response: { use: vi.fn() },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(axios.create).mockReturnValue(mockAxiosInstance as never);
    mockGet.mockResolvedValue({ data: { value: [] } });
  });

  function createClient(defaultPrefer?: ConstructorParameters<typeof ODataClient>[0]['defaultPrefer']): ODataClient {
    return new ODataClient({
      baseUrl: 'https://fm.example.com',
      database: 'TestDB',
      authToken: 'Basic dGVzdDp0ZXN0',
      ...(defaultPrefer !== undefined ? { defaultPrefer } : {}),
    });
  }

  describe('getRecords()', () => {
    it('sends Accept: application/json;odata.metadata=minimal;IEEE754Compatible=true', async () => {
      const client = createClient();
      await client.getRecords('Contacts');

      expect(mockGet).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ Accept: ACCEPT_MINIMAL }),
        })
      );
    });

    it('sends Prefer: fmodata.include-specialcolumns by default', async () => {
      const client = createClient();
      await client.getRecords('Contacts');

      expect(mockGet).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ Prefer: DEFAULT_PREFER }),
        })
      );
    });

    it('merges caller prefer with default (maxPageSize added)', async () => {
      const client = createClient();
      await client.getRecords('Contacts', undefined, { maxPageSize: 100 });

      expect(mockGet).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Prefer: 'odata.maxpagesize=100, fmodata.include-specialcolumns',
          }),
        })
      );
    });

    it('caller prefer can override default includeSpecialColumns', async () => {
      const client = createClient();
      await client.getRecords('Contacts', undefined, { includeSpecialColumns: false });

      const call = mockGet.mock.calls[0];
      const headers = call[1]?.headers as Record<string, string> | undefined;
      expect(headers?.['Prefer']).toBeUndefined();
    });

    it('ClientConfig.defaultPrefer overrides built-in default', async () => {
      const client = createClient({ includeSpecialColumns: false, maxPageSize: 50 });
      await client.getRecords('Contacts');

      expect(mockGet).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ Prefer: 'odata.maxpagesize=50' }),
        })
      );
    });

    it('caller prefer merges on top of ClientConfig.defaultPrefer', async () => {
      const client = createClient({ maxPageSize: 50 });
      await client.getRecords('Contacts', undefined, { return: 'minimal' });

      const call = mockGet.mock.calls[0];
      const prefer = (call[1]?.headers as Record<string, string>)['Prefer'];
      expect(prefer).toContain('odata.maxpagesize=50');
      expect(prefer).toContain('return=minimal');
      expect(prefer).toContain('fmodata.include-specialcolumns');
    });

    it('returns the value array from the response', async () => {
      const rows = [{ __Id: 1, Name: 'Alice' }];
      mockGet.mockResolvedValueOnce({ data: { value: rows } });

      const client = createClient();
      const result = await client.getRecords('Contacts');

      expect(result).toEqual(rows);
    });
  });

  describe('getRecord()', () => {
    beforeEach(() => {
      mockGet.mockResolvedValue({ data: { __Id: 42, Name: 'Bob' } });
    });

    it('sends Accept: application/json;odata.metadata=minimal;IEEE754Compatible=true', async () => {
      const client = createClient();
      await client.getRecord('Contacts', 42);

      expect(mockGet).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ Accept: ACCEPT_MINIMAL }),
        })
      );
    });

    it('sends Prefer: fmodata.include-specialcolumns by default', async () => {
      const client = createClient();
      await client.getRecord('Contacts', 42);

      expect(mockGet).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ Prefer: DEFAULT_PREFER }),
        })
      );
    });

    it('accepts optional prefer override', async () => {
      const client = createClient();
      await client.getRecord('Contacts', 42, { maxPageSize: 1 });

      expect(mockGet).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Prefer: 'odata.maxpagesize=1, fmodata.include-specialcolumns',
          }),
        })
      );
    });

    it('returns the record data', async () => {
      const client = createClient();
      const result = await client.getRecord('Contacts', 42);
      expect(result).toEqual({ __Id: 42, Name: 'Bob' });
    });
  });
});
