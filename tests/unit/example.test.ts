/**
 * Example Unit Tests
 *
 * Demonstrates testing patterns for the Claris OData CLI project.
 * Follow this pattern when writing new tests.
 *
 * @module tests/unit/example.test
 * @see CODING_STANDARDS.md for testing conventions
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  delayedResolve,
  delayedReject,
  waitFor,
  uniqueId,
  TestFixture,
} from '../utils/test-helpers';

import { createMockODataServer, mockServer, resetMockServer } from '../mocks/mock-server';

/**
 * Test Suite: Test Helpers
 *
 * Tests for our own testing utilities - meta testing!
 * This validates the helper functions work correctly.
 */
describe('Test Helpers', () => {
  describe('uniqueId', () => {
    it('should generate unique IDs', () => {
      const id1 = uniqueId();
      const id2 = uniqueId();

      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
    });

    it('should include prefix when provided', () => {
      const id = uniqueId('my-prefix');

      expect(id).toMatch(/^my-prefix_/);
    });

    it('should include timestamp', () => {
      const before = Date.now();
      const id = uniqueId();
      const after = Date.now();

      // Extract timestamp from ID
      const timestamp = parseInt(id.split('_')[1], 10);

      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('delayedResolve', () => {
    it('should resolve after delay', async () => {
      const start = Date.now();
      const result = await delayedResolve(100, 'test-value');
      const elapsed = Date.now() - start;

      expect(result).toBe('test-value');
      expect(elapsed).toBeGreaterThanOrEqual(90); // Allow some variance
    });
  });

  describe('delayedReject', () => {
    it('should reject after delay', async () => {
      const error = new Error('Test error');

      await expect(delayedReject(100, error)).rejects.toThrow('Test error');
    });
  });

  describe('waitFor', () => {
    it('should resolve when condition becomes true', async () => {
      let value = false;

      // Set value to true after 50ms
      setTimeout(() => {
        value = true;
      }, 50);

      await waitFor(() => value, 1000);

      expect(value).toBe(true);
    });

    it('should throw on timeout', async () => {
      await expect(waitFor(() => false, 100)).rejects.toThrow('timed out');
    });
  });

  describe('TestFixture', () => {
    it('should store and retrieve state', () => {
      const fixture = new TestFixture<{ name: string }>();

      fixture.state = { name: 'test' };

      expect(fixture.state.name).toBe('test');
    });

    it('should throw when accessing uninitialized state', () => {
      const fixture = new TestFixture<{ name: string }>();

      expect(() => fixture.state).toThrow('TestFixture not initialized');
    });

    it('should reset state', () => {
      const fixture = new TestFixture<{ name: string }>();
      fixture.state = { name: 'test' };

      fixture.reset();

      expect(() => fixture.state).toThrow('TestFixture not initialized');
    });
  });
});

/**
 * Test Suite: Mock OData Server
 *
 * Tests for the mock server implementation.
 * This ensures our testing infrastructure works correctly.
 */
describe('Mock OData Server', () => {
  describe('createMockODataServer', () => {
    it('should create server with configuration', () => {
      const server = createMockODataServer({
        baseUrl: 'https://test.example.com',
      });

      expect(server).toBeDefined();
      expect(server.get).toBeInstanceOf(Function);
      expect(server.post).toBeInstanceOf(Function);
      expect(server.reset).toBeInstanceOf(Function);
    });

    it('should track requests', async () => {
      const server = createMockODataServer({
        baseUrl: 'https://test.example.com',
      });

      server.addDatabase('TestDB', ['Users']);
      await server.get('/api/v4/TestDB/Users');

      const requests = server.getRequests();

      expect(requests).toHaveLength(1);
      expect(requests[0].method).toBe('GET');
      expect(requests[0].path).toBe('/api/v4/TestDB/Users');
    });
  });

  describe('Database management', () => {
    let server: ReturnType<typeof createMockODataServer>;

    beforeEach(() => {
      server = createMockODataServer({
        baseUrl: 'https://test.example.com',
      });
    });

    afterEach(() => {
      server.reset();
    });

    it('should add database with tables', () => {
      server.addDatabase('MyDatabase', ['Users', 'Projects']);

      const db = server.state.databases.get('MyDatabase');

      expect(db).toBeDefined();
      expect(db?.tables.has('Users')).toBe(true);
      expect(db?.tables.has('Projects')).toBe(true);
    });

    it('should add records to tables', () => {
      server.addDatabase('MyDatabase', ['Users']);

      const record = server.addRecord('MyDatabase', 'Users', {
        name: 'John Doe',
        email: 'john@example.com',
      });

      expect(record.id).toBeDefined();
      expect(record.data.name).toBe('John Doe');
    });
  });

  describe('HTTP operations', () => {
    let server: ReturnType<typeof createMockODataServer>;

    beforeEach(() => {
      server = createMockODataServer({
        baseUrl: 'https://test.example.com',
      });
      server.addDatabase('TestDB', ['Users']);
    });

    afterEach(() => {
      server.reset();
    });

    describe('GET', () => {
      it('should return records from table', async () => {
        // Seed test data
        server.addRecord('TestDB', 'Users', { name: 'Alice', email: 'alice@test.com' });
        server.addRecord('TestDB', 'Users', { name: 'Bob', email: 'bob@test.com' });

        const response = await server.get('/api/v4/TestDB/Users');

        expect(response.statusCode).toBe(200);
        expect((response.body as { value: unknown[] }).value).toHaveLength(2);
      });

      it('should return 404 for unknown database', async () => {
        const response = await server.get('/api/v4/UnknownDB/Users');

        expect(response.statusCode).toBe(404);
      });

      it('should return 404 for unknown table', async () => {
        const response = await server.get('/api/v4/TestDB/UnknownTable');

        expect(response.statusCode).toBe(404);
      });
    });

    describe('POST', () => {
      it('should create new record', async () => {
        const response = await server.post('/api/v4/TestDB/Users', {
          name: 'Charlie',
          email: 'charlie@test.com',
        });

        expect(response.statusCode).toBe(201);
        expect((response.body as { id: string }).id).toBeDefined();
        expect((response.body as { name: string }).name).toBe('Charlie');
      });

      it('should return 404 for unknown database', async () => {
        const response = await server.post('/api/v4/UnknownDB/Users', { name: 'Test' });

        expect(response.statusCode).toBe(404);
      });
    });
  });

  describe('Rate limiting', () => {
    it('should enforce rate limit when configured', async () => {
      const server = createMockODataServer({
        baseUrl: 'https://test.example.com',
        rateLimit: true,
        rateLimitPerMinute: 2, // Very low limit for testing
      });

      server.addDatabase('TestDB', ['Users']);

      // First two requests should succeed
      await server.get('/api/v4/TestDB/Users');
      await server.get('/api/v4/TestDB/Users');

      // Third request should fail
      const response = await server.get('/api/v4/TestDB/Users');

      expect(response.statusCode).toBe(429);
    });
  });

  describe('Simulated delay', () => {
    it('should simulate delay when configured', async () => {
      const server = createMockODataServer({
        baseUrl: 'https://test.example.com',
        delay: 100,
      });

      server.addDatabase('TestDB', ['Users']);

      const start = Date.now();
      await server.get('/api/v4/TestDB/Users');
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(90); // Allow variance
    });
  });
});

/**
 * Test Suite: Mock Server Singleton
 *
 * Tests for the pre-configured mock server instance.
 */
describe('Mock Server Singleton', () => {
  beforeEach(() => {
    resetMockServer();
  });

  afterEach(() => {
    resetMockServer();
  });

  it('should be accessible globally', () => {
    expect(mockServer).toBeDefined();
    expect(mockServer.addDatabase).toBeInstanceOf(Function);
    expect(mockServer.getRequests).toBeInstanceOf(Function);
  });

  it('should reset cleanly between tests', () => {
    mockServer.addDatabase('Test1', ['Table1']);
    expect(mockServer.state.databases.size).toBe(1);

    resetMockServer();

    expect(mockServer.state.databases.size).toBe(0);
    expect(mockServer.state.requests).toHaveLength(0);
  });
});

/**
 * Test Suite: Vitest Integration
 *
 * Tests that Vitest is properly configured.
 */
describe('Vitest Configuration', () => {
  it('should have global test functions available', () => {
    expect(describe).toBeDefined();
    expect(it).toBeDefined();
    expect(expect).toBeDefined();
    expect(beforeEach).toBeDefined();
    expect(afterEach).toBeDefined();
  });

  it('should support Vitest assertions', () => {
    // Basic assertions
    expect(true).toBe(true);
    expect(1 + 1).toBe(2);
    expect('hello').toBe('hello');

    // Object assertions
    const obj = { name: 'test', value: 123 };
    expect(obj).toHaveProperty('name');
    expect(obj.name).toBe('test');

    // Array assertions
    const arr = [1, 2, 3];
    expect(arr).toHaveLength(3);
    expect(arr).toContain(2);

    // Async assertions
    expect(Promise.resolve('value')).resolves.toBe('value');
    expect(Promise.reject(new Error('fail'))).rejects.toThrow('fail');
  });

  it('should support Vitest mocks', () => {
    const mockFn = vi.fn();

    mockFn('arg1', 'arg2');

    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2');
  });

  it('should support mock return values', () => {
    const mockFn = vi.fn();
    mockFn.mockReturnValue('mocked');

    expect(mockFn()).toBe('mocked');
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('should support mock implementations', () => {
    const mockFn = vi.fn((x: number) => x * 2);

    expect(mockFn(5)).toBe(10);
    expect(mockFn).toHaveBeenCalledWith(5);
  });
});
