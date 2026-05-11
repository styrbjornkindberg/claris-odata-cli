/**
 * T2: handleApiError throws typed error subclasses per status code.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { ODataClient } from '../../../src/api/client';
import {
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ODataError,
  RateLimitError,
  ValidationError,
} from '../../../src/api/errors';

vi.mock('axios');

describe('ODataClient – typed error subclasses', () => {
  let interceptorErrorHandler: (error: unknown) => never;

  const mockAxiosInstance = {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
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
    vi.mocked(axios.create).mockReturnValue(mockAxiosInstance as never);
    vi.mocked(axios.isAxiosError).mockReturnValue(true);
    new ODataClient({
      baseUrl: 'https://fm.example.com',
      database: 'TestDB',
      authToken: 'Basic test',
    });
  });

  function makeAxiosError(status: number, headers: Record<string, string> = {}) {
    return {
      isAxiosError: true,
      response: {
        status,
        headers,
        data: { error: { message: `HTTP ${status}` } },
      },
      message: `Request failed with status code ${status}`,
    };
  }

  it('401 → AuthenticationError', () => {
    expect(() => interceptorErrorHandler(makeAxiosError(401))).toThrow(AuthenticationError);
    try {
      interceptorErrorHandler(makeAxiosError(401));
    } catch (e) {
      expect(e).toBeInstanceOf(AuthenticationError);
      expect(e).toBeInstanceOf(ODataError);
      expect((e as ODataError).statusCode).toBe(401);
    }
  });

  it('403 → AuthorizationError', () => {
    try {
      interceptorErrorHandler(makeAxiosError(403));
    } catch (e) {
      expect(e).toBeInstanceOf(AuthorizationError);
      expect((e as ODataError).statusCode).toBe(403);
    }
  });

  it('404 → NotFoundError', () => {
    try {
      interceptorErrorHandler(makeAxiosError(404));
    } catch (e) {
      expect(e).toBeInstanceOf(NotFoundError);
      expect((e as ODataError).statusCode).toBe(404);
    }
  });

  it('400 → ValidationError', () => {
    try {
      interceptorErrorHandler(makeAxiosError(400));
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect((e as ODataError).statusCode).toBe(400);
    }
  });

  it('429 → RateLimitError', () => {
    try {
      interceptorErrorHandler(makeAxiosError(429));
    } catch (e) {
      expect(e).toBeInstanceOf(RateLimitError);
      expect((e as ODataError).statusCode).toBe(429);
    }
  });

  it('429 → RateLimitError.retryAfter populated from Retry-After header', () => {
    try {
      interceptorErrorHandler(makeAxiosError(429, { 'retry-after': '60' }));
    } catch (e) {
      expect(e).toBeInstanceOf(RateLimitError);
      expect((e as RateLimitError).retryAfter).toBe(60);
    }
  });

  it('429 → RateLimitError.retryAfter is undefined when Retry-After is non-numeric', () => {
    try {
      interceptorErrorHandler(makeAxiosError(429, { 'retry-after': 'invalid' }));
    } catch (e) {
      expect(e).toBeInstanceOf(RateLimitError);
      expect((e as RateLimitError).retryAfter).toBeUndefined();
    }
  });

  it('500 → bare ODataError (not a subclass)', () => {
    try {
      interceptorErrorHandler(makeAxiosError(500));
    } catch (e) {
      expect(e).toBeInstanceOf(ODataError);
      expect(e).not.toBeInstanceOf(AuthenticationError);
      expect(e).not.toBeInstanceOf(NotFoundError);
      expect((e as ODataError).statusCode).toBe(500);
    }
  });

  it('non-axios error → ODataError with status 500', () => {
    vi.mocked(axios.isAxiosError).mockReturnValue(false);
    try {
      interceptorErrorHandler(new Error('Network down'));
    } catch (e) {
      expect(e).toBeInstanceOf(ODataError);
      expect((e as ODataError).statusCode).toBe(500);
    }
  });
});
