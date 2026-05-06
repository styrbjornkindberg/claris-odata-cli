/**
 * Unit Tests for ODataClient
 *
 * Tests HTTP client construction, query string building, CRUD methods,
 * and error handling with mocked axios.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { ODataClient } from '../../../src/api/client';
import { ODataError } from '../../../src/api/errors';

vi.mock('axios');

describe('ODataClient', () => {
  const mockGet = vi.fn();
  const mockPost = vi.fn();
  const mockPatch = vi.fn();
  const mockDelete = vi.fn();
  let interceptorErrorHandler: (error: unknown) => never;

  const mockAxiosInstance = {
    get: mockGet,
    post: mockPost,
    patch: mockPatch,
    delete: mockDelete,
    interceptors: {
      response: {
        use: vi.fn((_onFulfilled: unknown, onRejected: (error: unknown) => never) => {
          interceptorErrorHandler = onRejected;
        }),
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(axios.create).mockReturnValue(mockAxiosInstance as any);
  });

  function createClient(overrides: Record<string, unknown> = {}): ODataClient {
    return new ODataClient({
      baseUrl: 'https://fm.example.com',
      database: 'TestDB',
      authToken: 'Basic dGVzdDp0ZXN0',
      ...overrides,
    });
  }

  describe('constructor', () => {
    it('creates axios instance with correct defaults', () => {
      createClient();

      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://fm.example.com',
          timeout: 30000,
          headers: expect.objectContaining({
            Authorization: 'Basic dGVzdDp0ZXN0',
            'Content-Type': 'application/json',
            'OData-Version': '4.0',
          }),
        })
      );
    });

    it('uses custom timeout when provided', () => {
      createClient({ timeout: 5000 });

      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({ timeout: 5000 })
      );
    });

    it('registers response interceptor', () => {
      createClient();

      expect(mockAxiosInstance.interceptors.response.use).toHaveBeenCalled();
    });
  });

  describe('getRecords', () => {
    it('fetches records from the correct URL', async () => {
      const client = createClient();
      mockGet.mockResolvedValue({ data: { value: [{ id: 1 }] } });

      const result = await client.getRecords('Customers');

      expect(mockGet).toHaveBeenCalledWith('/fmi/odata/v4/TestDB/Customers', expect.anything());
      expect(result).toEqual({ records: [{ id: 1 }], count: undefined, nextLink: undefined });
    });

    it('includes count from @odata.count when count option is true', async () => {
      const client = createClient();
      mockGet.mockResolvedValue({ data: { value: [{ id: 1 }], '@odata.count': 3 } });

      const result = await client.getRecords('Customers', { count: true });

      expect(result.count).toBe(3);
      expect(result.records).toHaveLength(1);
    });

    it('appends $filter query parameter', async () => {
      const client = createClient();
      mockGet.mockResolvedValue({ data: { value: [] } });

      await client.getRecords('Customers', { filter: "Name eq 'Acme'" });

      const url = mockGet.mock.calls[0][0] as string;
      expect(url).toContain('$filter=');
      expect(url).toContain(encodeURIComponent("Name eq 'Acme'"));
    });

    it('appends $select query parameter', async () => {
      const client = createClient();
      mockGet.mockResolvedValue({ data: { value: [] } });

      await client.getRecords('Customers', { select: ['Name', 'Email'] });

      const url = mockGet.mock.calls[0][0] as string;
      expect(url).toContain('$select=Name,Email');
    });

    it('appends $top and $skip parameters', async () => {
      const client = createClient();
      mockGet.mockResolvedValue({ data: { value: [] } });

      await client.getRecords('Customers', { top: 10, skip: 5 });

      const url = mockGet.mock.calls[0][0] as string;
      expect(url).toContain('$top=10');
      expect(url).toContain('$skip=5');
    });

    it('appends $orderby parameter', async () => {
      const client = createClient();
      mockGet.mockResolvedValue({ data: { value: [] } });

      await client.getRecords('Customers', { orderby: 'Name desc' });

      const url = mockGet.mock.calls[0][0] as string;
      expect(url).toContain('$orderby=');
    });

    it('appends $count=true when count is enabled', async () => {
      const client = createClient();
      mockGet.mockResolvedValue({ data: { value: [] } });

      await client.getRecords('Customers', { count: true });

      const url = mockGet.mock.calls[0][0] as string;
      expect(url).toContain('$count=true');
    });

    it('appends $expand parameter', async () => {
      const client = createClient();
      mockGet.mockResolvedValue({ data: { value: [] } });

      await client.getRecords('Customers', { expand: ['Orders', 'Contacts'] });

      const url = mockGet.mock.calls[0][0] as string;
      expect(url).toContain('$expand=Orders,Contacts');
    });

    it('combines multiple query parameters', async () => {
      const client = createClient();
      mockGet.mockResolvedValue({ data: { value: [] } });

      await client.getRecords('Customers', {
        filter: "Status eq 'Active'",
        select: ['Name'],
        top: 5,
      });

      const url = mockGet.mock.calls[0][0] as string;
      expect(url).toContain('?');
      expect(url).toContain('$filter=');
      expect(url).toContain('$select=Name');
      expect(url).toContain('$top=5');
    });

    it('returns empty query string when no options provided', async () => {
      const client = createClient();
      mockGet.mockResolvedValue({ data: { value: [] } });

      await client.getRecords('Customers');

      expect(mockGet).toHaveBeenCalledWith('/fmi/odata/v4/TestDB/Customers', expect.anything());
    });
  });

  describe('getRecord', () => {
    it('fetches a single record by ID', async () => {
      const client = createClient();
      mockGet.mockResolvedValue({ data: { id: 42, name: 'Test' } });

      const result = await client.getRecord('Customers', 42);

      expect(mockGet).toHaveBeenCalledWith('/fmi/odata/v4/TestDB/Customers(42)', expect.anything());
      expect(result).toEqual({ id: 42, name: 'Test' });
    });
  });

  describe('createRecord', () => {
    it('posts data to the correct URL', async () => {
      const client = createClient();
      const data = { Name: 'Acme', City: 'NYC' };
      mockPost.mockResolvedValue({ data: { id: 1, ...data } });

      const result = await client.createRecord('Customers', data);

      expect(mockPost).toHaveBeenCalledWith('/fmi/odata/v4/TestDB/Customers', data);
      expect(result).toEqual({ id: 1, Name: 'Acme', City: 'NYC' });
    });
  });

  describe('updateRecord', () => {
    it('patches data at the correct URL', async () => {
      const client = createClient();
      const data = { Name: 'Updated' };
      mockPatch.mockResolvedValue({ data: { id: 5, Name: 'Updated' } });

      const result = await client.updateRecord('Customers', 5, data);

      expect(mockPatch).toHaveBeenCalledWith('/fmi/odata/v4/TestDB/Customers(5)', data);
      expect(result).toEqual({ id: 5, Name: 'Updated' });
    });
  });

  describe('deleteRecord', () => {
    it('sends DELETE to the correct URL', async () => {
      const client = createClient();
      mockDelete.mockResolvedValue({});

      await client.deleteRecord('Customers', 7);

      expect(mockDelete).toHaveBeenCalledWith('/fmi/odata/v4/TestDB/Customers(7)');
    });
  });

  describe('runScript', () => {
    it('posts to the database-level script URL when no table given', async () => {
      const client = createClient();
      mockPost.mockResolvedValue({ data: { scriptResult: 0 } });

      await client.runScript('MyScript');

      expect(mockPost).toHaveBeenCalledWith(
        "/fmi/odata/v4/TestDB/Script('MyScript')",
        {}
      );
    });

    it('posts to the table-level script URL when table is given', async () => {
      const client = createClient();
      mockPost.mockResolvedValue({ data: { scriptResult: 0 } });

      await client.runScript('MyScript', { table: 'Customers' });

      expect(mockPost).toHaveBeenCalledWith(
        "/fmi/odata/v4/TestDB/Customers/Script('MyScript')",
        {}
      );
    });

    it('posts to the record-level script URL when table and recordId are given', async () => {
      const client = createClient();
      mockPost.mockResolvedValue({ data: { scriptResult: 0 } });

      await client.runScript('MyScript', { table: 'Customers', recordId: 5 });

      expect(mockPost).toHaveBeenCalledWith(
        "/fmi/odata/v4/TestDB/Customers(5)/Script('MyScript')",
        {}
      );
    });

    it('sends scriptParameterValue when params provided', async () => {
      const client = createClient();
      mockPost.mockResolvedValue({ data: { scriptResult: 0 } });
      const params = { key: 'val' };

      await client.runScript('MyScript', { params });

      expect(mockPost).toHaveBeenCalledWith(
        "/fmi/odata/v4/TestDB/Script('MyScript')",
        { scriptParameterValue: params }
      );
    });

    it('sends empty body when no params provided', async () => {
      const client = createClient();
      mockPost.mockResolvedValue({ data: { scriptResult: 0 } });

      await client.runScript('MyScript');

      expect(mockPost).toHaveBeenCalledWith(
        "/fmi/odata/v4/TestDB/Script('MyScript')",
        {}
      );
    });

    it('returns response data', async () => {
      const client = createClient();
      const responseData = { scriptResult: 0, scriptResultDetail: 'OK' };
      mockPost.mockResolvedValue({ data: responseData });

      const result = await client.runScript('MyScript');

      expect(result).toEqual(responseData);
    });
  });

  describe('uploadContainerField', () => {
    it('patches the container field URL with file buffer and content type', async () => {
      const client = createClient();
      const buffer = Buffer.from('test file content');
      mockPatch.mockResolvedValue({ data: undefined, status: 204 });

      await client.uploadContainerField('Contacts', 42, 'Photo', buffer, 'image/jpeg');

      expect(mockPatch).toHaveBeenCalledWith(
        '/fmi/odata/v4/TestDB/Contacts(42)/Photo',
        buffer,
        { headers: { 'Content-Type': 'image/jpeg' } }
      );
    });

    it('returns void on success', async () => {
      const client = createClient();
      const buffer = Buffer.from('data');
      mockPatch.mockResolvedValue({ data: undefined, status: 204 });

      const result = await client.uploadContainerField('Contacts', 42, 'Photo', buffer, 'image/png');

      expect(result).toBeUndefined();
    });

    it('uses correct URL with table, record id, and field name', async () => {
      const client = createClient();
      const buffer = Buffer.from('pdf content');
      mockPatch.mockResolvedValue({ data: undefined, status: 204 });

      await client.uploadContainerField('Documents', 99, 'Attachment', buffer, 'application/pdf');

      expect(mockPatch).toHaveBeenCalledWith(
        '/fmi/odata/v4/TestDB/Documents(99)/Attachment',
        buffer,
        expect.objectContaining({ headers: { 'Content-Type': 'application/pdf' } })
      );
    });
  });

  describe('error handling', () => {
    it('throws ODataError with status and message from API response', () => {
      createClient();

      const axiosError = {
        isAxiosError: true,
        response: {
          status: 401,
          data: { error: { message: 'Invalid credentials' } },
        },
        message: 'Request failed with status code 401',
      };
      vi.mocked(axios.isAxiosError).mockReturnValue(true);

      expect(() => interceptorErrorHandler(axiosError)).toThrow(ODataError);
      try {
        interceptorErrorHandler(axiosError);
      } catch (e) {
        const err = e as ODataError;
        expect(err.statusCode).toBe(401);
        expect(err.message).toBe('Invalid credentials');
      }
    });

    it('falls back to axios error message when no OData error body', () => {
      createClient();

      const axiosError = {
        isAxiosError: true,
        response: {
          status: 500,
          data: {},
        },
        message: 'Internal Server Error',
      };
      vi.mocked(axios.isAxiosError).mockReturnValue(true);

      try {
        interceptorErrorHandler(axiosError);
      } catch (e) {
        const err = e as ODataError;
        expect(err.statusCode).toBe(500);
        expect(err.message).toBe('Internal Server Error');
      }
    });

    it('wraps non-axios errors as ODataError with 500 status', () => {
      createClient();
      vi.mocked(axios.isAxiosError).mockReturnValue(false);

      try {
        interceptorErrorHandler(new Error('Network timeout'));
      } catch (e) {
        const err = e as ODataError;
        expect(err.statusCode).toBe(500);
        expect(err.message).toBe('Network timeout');
      }
    });

    it('handles non-Error thrown values', () => {
      createClient();
      vi.mocked(axios.isAxiosError).mockReturnValue(false);

      try {
        interceptorErrorHandler('string error');
      } catch (e) {
        const err = e as ODataError;
        expect(err.statusCode).toBe(500);
        expect(err.message).toBe('Unknown error');
      }
    });
  });
});
