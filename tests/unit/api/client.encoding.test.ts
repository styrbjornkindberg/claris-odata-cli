/**
 * Unit Tests for ODataClient non-ASCII path encoding + proxy double-encode retry.
 *
 * Covers entity/field names containing å/ä/ö: they must be single percent-encoded
 * on the first attempt, and — when a reverse proxy decodes the path once and the
 * server returns "syntax error in URL" — retried once with the escapes doubled.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { ODataClient } from '../../../src/api/client';

vi.mock('axios');

describe('ODataClient – non-ASCII encoding + proxy retry', () => {
  const mockGet = vi.fn();

  const mockAxiosInstance = {
    get: mockGet,
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      response: { use: vi.fn() },
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

  it('single percent-encodes a non-ASCII table name on the first attempt', async () => {
    const client = createClient();
    mockGet.mockResolvedValue({ data: { value: [{ id: 1 }] } });

    await client.getRecords('Företag');

    expect(mockGet).toHaveBeenCalledTimes(1);
    const url = mockGet.mock.calls[0][0] as string;
    expect(url).toBe('/fmi/odata/v4/TestDB/F%C3%B6retag');
  });

  it('percent-encodes non-ASCII $select field names', async () => {
    const client = createClient();
    mockGet.mockResolvedValue({ data: { value: [] } });

    await client.getRecords('Företag', { select: ['Namn', 'Säljstatus'] });

    const url = mockGet.mock.calls[0][0] as string;
    expect(url).toContain('$select=Namn,S%C3%A4ljstatus');
  });

  it('retries once with doubled escapes when the proxy decode triggers "syntax error in URL"', async () => {
    const client = createClient();
    mockGet
      .mockRejectedValueOnce(new Error("syntax error in URL at: 'retag'"))
      .mockResolvedValueOnce({ data: { value: [{ id: 7 }] } });

    const result = await client.getRecords('Företag');

    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(mockGet.mock.calls[0][0]).toBe('/fmi/odata/v4/TestDB/F%C3%B6retag');
    expect(mockGet.mock.calls[1][0]).toBe('/fmi/odata/v4/TestDB/F%25C3%25B6retag');
    expect(result.records).toEqual([{ id: 7 }]);
  });

  it('doubles ONLY the path on retry, leaving the single-encoded query intact', async () => {
    const client = createClient();
    mockGet
      .mockRejectedValueOnce(new Error('syntax error in URL'))
      .mockResolvedValueOnce({ data: { value: [] } });

    await client.getRecords('Företag', { filter: "Namn eq 'Acme'", top: 1 });

    const retryUrl = mockGet.mock.calls[1][0] as string;
    const [pathPart, queryPart] = retryUrl.split('?');
    // path: escapes doubled so the proxy's single decode restores them
    expect(pathPart).toBe('/fmi/odata/v4/TestDB/F%25C3%25B6retag');
    // query: left single-encoded (the proxy passes it through verbatim)
    expect(queryPart).toContain('$filter=');
    expect(queryPart).toContain(encodeURIComponent("Namn eq 'Acme'"));
    expect(queryPart).not.toContain('%2520'); // spaces NOT double-encoded
    expect(queryPart).toContain('$top=1');
  });

  it('does NOT retry on unrelated errors (e.g. 404)', async () => {
    const client = createClient();
    mockGet.mockRejectedValue(new Error('HTTP 404 Not Found'));

    await expect(client.getRecords('Företag')).rejects.toThrow('404');
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('leaves plain ASCII names unchanged (no regression)', async () => {
    const client = createClient();
    mockGet.mockResolvedValue({ data: { value: [] } });

    await client.getRecords('Customers', { select: ['Name', 'Email'] });

    const url = mockGet.mock.calls[0][0] as string;
    expect(url).toBe('/fmi/odata/v4/TestDB/Customers?$select=Name,Email');
  });
});
